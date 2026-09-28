import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { outlinedMesh, toon } from '../../render/materials';
import { THEME } from '../../render/theme';
import type { ArenaLayout } from '../ArenaLayout';
import { createPitchTexture, createRooftopTexture } from '../pitchTexture';

const ROOF_W = 34;
const ROOF_L = 50;

/**
 * Ground layer and midground props: textured pitch, rooftop slab with painted
 * apron, parapet wall, floodlight towers, AC units, a water tank and a stair hut.
 */
export function createRooftopView(layout: ArenaLayout, maxAnisotropy: number): THREE.Group {
  const group = new THREE.Group();

  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(layout.halfWidth * 2, layout.halfLength * 2),
    new THREE.MeshLambertMaterial({ map: createPitchTexture(maxAnisotropy) }),
  );
  pitch.rotation.x = -Math.PI / 2;
  group.add(pitch);

  const roof = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOF_W, ROOF_L),
    new THREE.MeshLambertMaterial({ map: createRooftopTexture(ROOF_W, ROOF_L, maxAnisotropy) }),
  );
  roof.rotation.x = -Math.PI / 2;
  roof.position.y = -0.01;
  group.add(roof);

  // Parapet with a lighter coping: frames the rooftop against the skyline.
  const parapetParts: THREE.BufferGeometry[] = [];
  const copingParts: THREE.BufferGeometry[] = [];
  const pH = 1.1;
  const pT = 0.5;
  for (const side of [-1, 1]) {
    parapetParts.push(box(pT, pH, ROOF_L, side * (ROOF_W / 2 + pT / 2), pH / 2, 0));
    parapetParts.push(box(ROOF_W + pT * 2, pH, pT, 0, pH / 2, side * (ROOF_L / 2 + pT / 2)));
    copingParts.push(box(pT + 0.16, 0.12, ROOF_L + pT * 2 + 0.16, side * (ROOF_W / 2 + pT / 2), pH + 0.06, 0));
    copingParts.push(box(ROOF_W + pT * 2 + 0.16, 0.12, pT + 0.16, 0, pH + 0.06, side * (ROOF_L / 2 + pT / 2)));
  }
  addMerged(group, parapetParts, toon(THEME.structure.parapet));
  addMerged(group, copingParts, toon(THEME.structure.prop));

  // Floodlight towers at the four corners, heads aimed at the centre spot.
  const hw = layout.halfWidth;
  const hl = layout.halfLength;
  const lampGlowTexture = createGlowTexture();
  for (const [x, z] of [
    [-(hw + 2.6), -(hl + 3.2)],
    [hw + 2.6, -(hl + 3.2)],
    [-(hw + 2.6), hl + 3.2],
    [hw + 2.6, hl + 3.2],
  ] as const) {
    group.add(createFloodlight(x, z, lampGlowTexture));
  }

  // Rooftop clutter: gives the midground scale and a lived-in feel.
  const acParts: THREE.BufferGeometry[] = [];
  const fanParts: THREE.BufferGeometry[] = [];
  for (const [x, z, r] of [
    [-13.2, -6, 0],
    [-13.2, -2.2, 0],
    [13.5, 8, 0.2],
    [12.8, -16, 0],
    [-12.5, 18.5, 0.4],
  ] as const) {
    const unit = new THREE.BoxGeometry(1.8, 1.1, 1.4, 1, 1, 1);
    unit.translate(0, 0.55, 0);
    unit.rotateY(r);
    unit.translate(x, 0, z);
    acParts.push(unit);
    const fan = new THREE.CylinderGeometry(0.48, 0.48, 0.06, 16);
    fan.translate(x, 1.13, z);
    fanParts.push(fan);
  }
  addMerged(group, acParts, toon(THEME.structure.prop), true);
  addMerged(group, fanParts, toon(THEME.structure.steel));

  group.add(createWaterTank(12.4, -21));
  group.add(createStairHut(-12.6, -20.5));
  return group;
}

function createFloodlight(x: number, z: number, glowTexture: THREE.Texture): THREE.Group {
  const tower = new THREE.Group();
  tower.position.set(x, 0, z);
  const height = 9;
  const pole = new THREE.CylinderGeometry(0.12, 0.2, height, 8);
  pole.translate(0, height / 2, 0);
  tower.add(outlinedMesh(pole, toon(THEME.structure.steel)));

  const head = new THREE.Group();
  head.position.y = height;
  // Aim at the centre spot (world origin).
  head.lookAt(0, 0, 0);
  const frame = new THREE.BoxGeometry(1.6, 0.8, 0.25);
  head.add(outlinedMesh(frame, toon(THEME.structure.steelLight)));
  const lamps = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.62),
    new THREE.MeshBasicMaterial({ color: THEME.structure.lampGlow }),
  );
  lamps.position.z = 0.13;
  head.add(lamps);
  tower.add(head);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: THEME.structure.lampGlow,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.scale.setScalar(4.2);
  glow.position.y = height;
  tower.add(glow);
  return tower;
}

function createWaterTank(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const legs: THREE.BufferGeometry[] = [];
  for (const [lx, lz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const leg = new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6);
    leg.translate(lx * 0.9, 1.1, lz * 0.9);
    legs.push(leg);
  }
  addMerged(g, legs, toon(THEME.structure.steel));
  const tank = new THREE.CylinderGeometry(1.35, 1.35, 2.2, 18);
  tank.translate(0, 3.3, 0);
  g.add(outlinedMesh(tank, toon(0xb0674f)));
  const roof = new THREE.ConeGeometry(1.45, 0.7, 18);
  roof.translate(0, 4.75, 0);
  g.add(outlinedMesh(roof, toon(THEME.structure.propDark)));
  return g;
}

function createStairHut(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const hut = new THREE.BoxGeometry(4, 2.8, 3);
  hut.translate(0, 1.4, 0);
  g.add(outlinedMesh(hut, toon(THEME.structure.prop)));
  const roof = new THREE.BoxGeometry(4.4, 0.18, 3.4);
  roof.translate(0, 2.9, 0);
  g.add(new THREE.Mesh(roof, toon(THEME.structure.propDark)));
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), toon(THEME.teams.away.primary));
  door.position.set(0.8, 1, 1.51);
  g.add(door);
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

function addMerged(
  parent: THREE.Object3D,
  parts: THREE.BufferGeometry[],
  material: THREE.Material,
  outlined = false,
): void {
  const geometry = mergeGeometries(parts);
  if (!geometry) return;
  parent.add(outlined ? outlinedMesh(geometry, material) : new THREE.Mesh(geometry, material));
}

function createGlowTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
