import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARENA, GOAL } from '../../game/config';
import { outlinedMesh, toon } from '../../render/materials';
import { THEME } from '../../render/theme';
import type { ArenaLayout } from '../ArenaLayout';
import { createFenceTexture, createSignageTexture } from '../pitchTexture';

const FENCE_TOP = 3.6;
const BOARD_T = 0.2;
const POST_R = 0.075;
const FENCE_CELL = 0.42;
/** Signage strip: 6 panels at 256x48 px, shown 0.62 m tall. */
const SIGN_H = 0.62;
const SIGN_STRIP_M = (6 * 256 * SIGN_H) / 48;

/**
 * The cage around the pitch: kick boards with signage and a rail, steel posts,
 * chain-link fencing, and team-coloured end boards with a goal banner.
 * Fencing is placed exactly on the invisible wall colliders so the ball's
 * bounces match what the player sees.
 */
export function createCageView(layout: ArenaLayout): THREE.Group {
  const group = new THREE.Group();
  const hw = layout.halfWidth;
  const hl = layout.halfLength;
  const bh = ARENA.boardHeight;

  // --- Kick boards (side) with signage on the inner face.
  const boardMaterial = toon(THEME.structure.boardFace);
  const signage = createSignageTexture();
  const signMaterial = new THREE.MeshBasicMaterial({ map: signage });
  const sideBoard = new THREE.BoxGeometry(BOARD_T, bh, ARENA.length);
  for (const side of [-1, 1]) {
    const board = new THREE.Mesh(sideBoard, boardMaterial);
    board.position.set(side * (hw + BOARD_T / 2), bh / 2, 0);
    group.add(board);

    const sign = new THREE.Mesh(scaledPlane(ARENA.length, SIGN_H, ARENA.length / SIGN_STRIP_M, side > 0 ? 0.37 : 0), signMaterial);
    sign.rotation.y = -side * (Math.PI / 2);
    sign.position.set(side * (hw - 0.002), bh * 0.5, 0);
    group.add(sign);
  }

  // --- End boards beside each goal, in the defending team's colour.
  const segment = hw - GOAL.width / 2;
  const endBoard = new THREE.BoxGeometry(segment, bh, BOARD_T);
  for (const goal of [layout.goals.away, layout.goals.home]) {
    const material = toon(THEME.teams[goal.defendedBy].primary);
    for (const side of [-1, 1]) {
      const board = new THREE.Mesh(endBoard, material);
      board.position.set(side * (GOAL.width / 2 + segment / 2), bh / 2, goal.lineZ + (BOARD_T / 2) * goal.outwardSign);
      group.add(board);
    }
    group.add(createGoalBanner(goal.lineZ, goal.outwardSign, THEME.teams[goal.defendedBy].primary));
  }

  // --- Yellow rail capping every board (one merged, outlined mesh).
  const rails: THREE.BufferGeometry[] = [];
  const railR = 0.055;
  for (const side of [-1, 1]) {
    rails.push(bar(railR, new THREE.Vector3(side * hw, bh, -hl), new THREE.Vector3(side * hw, bh, hl)));
    for (const end of [-1, 1]) {
      rails.push(
        bar(railR, new THREE.Vector3(side * hw, bh, end * hl), new THREE.Vector3(side * GOAL.width / 2, bh, end * hl)),
      );
    }
  }
  const railGeo = mergeGeometries(rails);
  if (railGeo) group.add(outlinedMesh(railGeo, toon(THEME.structure.rail, { rim: true })));

  // --- Steel posts (instanced) and top rail.
  const postPositions: Array<[number, number]> = [];
  const sideSpacing = ARENA.length / 8;
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 8; i++) postPositions.push([side * hw, -hl + i * sideSpacing]);
  }
  for (const end of [-1, 1]) {
    for (const x of [-hw / 2 - GOAL.width / 4, -GOAL.width / 2, GOAL.width / 2, hw / 2 + GOAL.width / 4]) {
      postPositions.push([x, end * hl]);
    }
  }
  const postGeo = new THREE.CylinderGeometry(POST_R, POST_R * 1.2, FENCE_TOP, 8);
  postGeo.translate(0, FENCE_TOP / 2, 0);
  const posts = new THREE.InstancedMesh(postGeo, toon(THEME.structure.steel), postPositions.length);
  const matrix = new THREE.Matrix4();
  postPositions.forEach(([x, z], i) => {
    matrix.makeTranslation(x, 0, z);
    posts.setMatrixAt(i, matrix);
  });
  group.add(posts);

  const topRails = mergeGeometries([
    bar(0.05, new THREE.Vector3(-hw, FENCE_TOP, -hl), new THREE.Vector3(-hw, FENCE_TOP, hl)),
    bar(0.05, new THREE.Vector3(hw, FENCE_TOP, -hl), new THREE.Vector3(hw, FENCE_TOP, hl)),
    bar(0.05, new THREE.Vector3(-hw, FENCE_TOP, -hl), new THREE.Vector3(hw, FENCE_TOP, -hl)),
    bar(0.05, new THREE.Vector3(-hw, FENCE_TOP, hl), new THREE.Vector3(hw, FENCE_TOP, hl)),
  ]);
  if (topRails) group.add(new THREE.Mesh(topRails, toon(THEME.structure.steelLight)));

  group.add(createFence(hw, hl, bh));
  return group;
}

/**
 * Chain-link panels. alphaTest keeps them opaque (no sorting cost), and
 * fragments close to the camera are dithered away so the fence never blocks
 * the view when the camera sits behind it.
 */
function createFence(hw: number, hl: number, bh: number): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const panel = (width: number, height: number, x: number, y: number, z: number, rotY: number): void => {
    const g = scaledPlane(width, height, width / FENCE_CELL, 0, height / FENCE_CELL);
    g.rotateY(rotY);
    g.translate(x, y, z);
    parts.push(g);
  };
  const fenceH = FENCE_TOP - bh;
  for (const side of [-1, 1]) {
    panel(ARENA.length, fenceH, side * hw, bh + fenceH / 2, 0, Math.PI / 2);
  }
  const aboveGoalH = FENCE_TOP - GOAL.height;
  const segment = hw - GOAL.width / 2;
  for (const end of [-1, 1]) {
    panel(GOAL.width, aboveGoalH, 0, GOAL.height + aboveGoalH / 2, end * hl, 0);
    for (const side of [-1, 1]) {
      panel(segment, fenceH, side * (GOAL.width / 2 + segment / 2), bh + fenceH / 2, end * hl, 0);
    }
  }
  const geometry = mergeGeometries(parts);
  if (!geometry) throw new Error('fence merge failed');

  const material = new THREE.MeshBasicMaterial({
    map: createFenceTexture(),
    color: THEME.structure.fence,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vCamDist;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCamDist = -mvPosition.z;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCamDist;')
      .replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>
        float fade = smoothstep(5.0, 12.0, vCamDist);
        float dither = fract(dot(gl_FragCoord.xy, vec2(0.5, 0.25)) * 2.0);
        if (fade < dither) discard;`,
      );
  };
  material.customProgramCacheKey = () => 'fence-fade';
  return new THREE.Mesh(geometry, material);
}

function createGoalBanner(lineZ: number, sign: 1 | -1, color: number): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = `#${new THREE.Color(color).getHexString()}`;
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let x = -40; x < 300; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 64);
    ctx.lineTo(x + 18, 64);
    ctx.lineTo(x + 40, 32);
    ctx.lineTo(x + 18, 0);
    ctx.lineTo(x, 0);
    ctx.lineTo(x + 22, 32);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(GOAL.width + 0.6, 0.55),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
  );
  banner.position.set(0, GOAL.height + 0.55, lineZ + 0.02 * sign);
  return banner;
}

function bar(r: number, a: THREE.Vector3, b: THREE.Vector3): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 8, 1);
  const dir = b.clone().sub(a).normalize();
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(THREE.Object3D.DEFAULT_UP, dir));
  const mid = a.clone().add(b).multiplyScalar(0.5);
  geometry.translate(mid.x, mid.y, mid.z);
  return geometry;
}

/** Plane whose UVs repeat `repeatU` x `repeatV` times, starting at `offsetU`. */
function scaledPlane(width: number, height: number, repeatU: number, offsetU = 0, repeatV = 1): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width, height);
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, offsetU + uv.getX(i) * repeatU, uv.getY(i) * repeatV);
  }
  return geometry;
}
