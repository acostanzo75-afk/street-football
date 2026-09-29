import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARENA, GOAL } from '../../game/config';
import { glow, surface } from '../../render/materials';
import { THEME } from '../../render/theme';
import type { ArenaLayout } from '../ArenaLayout';
import { createFenceTexture, createSignageTexture } from '../pitchTexture';
import { addMerged, bar, roundedBox } from './geometry';

const FENCE_TOP = 3.6;
const BOARD_T = 0.22;
const POST_R = 0.075;
const FENCE_CELL = 0.42;
/** Signage strip: 6 panels at 256x48 px, shown 0.62 m tall. */
const SIGN_H = 0.62;
const SIGN_STRIP_M = (6 * 256 * SIGN_H) / 48;
/** Festoon bulbs per sag between two posts. */
const BULBS_PER_SPAN = 7;

/**
 * The cage around the pitch: LED-lit kick boards, a rail, steel posts,
 * chain-link fencing (which casts a patterned shadow on the turf),
 * team-coloured end boards with goal banners, and festoon lights strung
 * along the top rail. Fencing sits exactly on the invisible wall colliders
 * so the ball's bounces match what the player sees.
 */
export function createCageView(layout: ArenaLayout): THREE.Group {
  const group = new THREE.Group();
  const hw = layout.halfWidth;
  const hl = layout.halfLength;
  const bh = ARENA.boardHeight;

  // --- Side kick boards: soft-edged, with self-lit LED signage on the inner face.
  const boards: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    boards.push(roundedBox(BOARD_T, bh, ARENA.length, side * (hw + BOARD_T / 2), bh / 2, 0, 0.05));
  }
  addMerged(group, boards, surface(THEME.structure.boardFace, { roughness: 0.5 }));

  const signage = createSignageTexture();
  const signMaterial = surface(0xffffff, { map: signage, emissiveMap: signage, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.35 });
  for (const side of [-1, 1]) {
    const sign = new THREE.Mesh(scaledPlane(ARENA.length, SIGN_H, ARENA.length / SIGN_STRIP_M, side > 0 ? 0.37 : 0), signMaterial);
    sign.rotation.y = -side * (Math.PI / 2);
    sign.position.set(side * (hw - 0.003), bh * 0.5, 0);
    group.add(sign);
  }

  // --- End boards beside each goal, in the defending team's colour.
  const segment = hw - GOAL.width / 2;
  for (const goal of [layout.goals.away, layout.goals.home]) {
    const parts = [-1, 1].map((side) =>
      roundedBox(segment, bh, BOARD_T, side * (GOAL.width / 2 + segment / 2), bh / 2, goal.lineZ + (BOARD_T / 2) * goal.outwardSign, 0.05),
    );
    addMerged(group, parts, surface(THEME.teams[goal.defendedBy].primary, { roughness: 0.45 }));
    group.add(createGoalBanner(goal.lineZ, goal.outwardSign, THEME.teams[goal.defendedBy].primary));
  }

  // --- Yellow rail capping every board.
  const rails: THREE.BufferGeometry[] = [];
  const railR = 0.055;
  for (const side of [-1, 1]) {
    rails.push(bar(railR, new THREE.Vector3(side * hw, bh, -hl), new THREE.Vector3(side * hw, bh, hl), 10));
    for (const end of [-1, 1]) {
      rails.push(bar(railR, new THREE.Vector3(side * hw, bh, end * hl), new THREE.Vector3((side * GOAL.width) / 2, bh, end * hl), 10));
    }
  }
  addMerged(group, rails, surface(THEME.structure.rail, { roughness: 0.35, metalness: 0.3 }));

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
  const postGeo = new THREE.CylinderGeometry(POST_R, POST_R * 1.2, FENCE_TOP, 10);
  postGeo.translate(0, FENCE_TOP / 2, 0);
  const steel = surface(THEME.structure.steel, { roughness: 0.4, metalness: 0.6 });
  const posts = new THREE.InstancedMesh(postGeo, steel, postPositions.length);
  const matrix = new THREE.Matrix4();
  postPositions.forEach(([x, z], i) => {
    matrix.makeTranslation(x, 0, z);
    posts.setMatrixAt(i, matrix);
  });
  posts.castShadow = true;
  group.add(posts);

  addMerged(
    group,
    [
      bar(0.05, new THREE.Vector3(-hw, FENCE_TOP, -hl), new THREE.Vector3(-hw, FENCE_TOP, hl)),
      bar(0.05, new THREE.Vector3(hw, FENCE_TOP, -hl), new THREE.Vector3(hw, FENCE_TOP, hl)),
      bar(0.05, new THREE.Vector3(-hw, FENCE_TOP, -hl), new THREE.Vector3(hw, FENCE_TOP, -hl)),
      bar(0.05, new THREE.Vector3(-hw, FENCE_TOP, hl), new THREE.Vector3(hw, FENCE_TOP, hl)),
    ],
    surface(THEME.structure.steelLight, { roughness: 0.4, metalness: 0.6 }),
  );

  group.add(createFence(hw, hl, bh));
  group.add(createFestoon(hw, hl, sideSpacing));
  return group;
}

/**
 * Warm bulbs strung in sagging spans along both long sides of the cage.
 * Wires are one merged mesh, bulbs one InstancedMesh; on High they bloom.
 */
function createFestoon(hw: number, hl: number, spacing: number): THREE.Group {
  const group = new THREE.Group();
  const wires: THREE.BufferGeometry[] = [];
  const bulbPositions: THREE.Vector3[] = [];
  const spans = Math.round((hl * 2) / spacing);
  const top = FENCE_TOP - 0.05;
  const sag = 0.55;
  for (const side of [-1, 1]) {
    for (let s = 0; s < spans; s++) {
      const z0 = -hl + s * spacing;
      const points: THREE.Vector3[] = [];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        points.push(new THREE.Vector3(side * (hw + 0.05), top - Math.sin(t * Math.PI) * sag, z0 + t * spacing));
      }
      wires.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, 0.012, 4));
      for (let b = 1; b <= BULBS_PER_SPAN; b++) {
        const t = b / (BULBS_PER_SPAN + 1);
        bulbPositions.push(new THREE.Vector3(side * (hw + 0.05), top - Math.sin(t * Math.PI) * sag - 0.07, z0 + t * spacing));
      }
    }
  }
  addMerged(group, wires, surface(0x1a1d29, { roughness: 0.6 }), { cast: false, receive: false });
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), glow(THEME.decor.bulb, 4), bulbPositions.length);
  const m = new THREE.Matrix4();
  bulbPositions.forEach((p, i) => bulbs.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
  group.add(bulbs);
  return group;
}

/**
 * Chain-link panels. alphaTest keeps them opaque (no sorting cost) and lets
 * them cast a diamond-pattern shadow; fragments close to the camera are
 * dithered away so the fence never blocks the view.
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

  const material = new THREE.MeshStandardMaterial({
    map: createFenceTexture(),
    color: THEME.structure.fence,
    roughness: 0.4,
    metalness: 0.7,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <alphatest_fragment>',
      `#include <alphatest_fragment>
      float fade = smoothstep(5.0, 12.0, vViewPosition.z);
      float dither = fract(dot(gl_FragCoord.xy, vec2(0.5, 0.25)) * 2.0);
      if (fade < dither) discard;`,
    );
  };
  material.customProgramCacheKey = () => 'fence-fade';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
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
    surface(0xffffff, { map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.5, side: THREE.DoubleSide }),
  );
  banner.position.set(0, GOAL.height + 0.55, lineZ + 0.02 * sign);
  return banner;
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
