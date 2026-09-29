import * as THREE from 'three';
import { glow, surface } from '../../render/materials';
import { THEME } from '../../render/theme';
import type { ArenaLayout } from '../ArenaLayout';
import { createGraffitiTexture, createPitchTexture, createRooftopTexture } from '../pitchTexture';
import { addMerged, bar, box, roundedBox } from './geometry';

const ROOF_W = 34;
const ROOF_L = 50;

/**
 * Ground layer and structural midground: turf pitch, rooftop slab with painted
 * apron, parapet with graffiti, floodlight towers, AC units, water tank and a
 * stair hut. Everything receives the sun's shadow; props also cast.
 */
export function createRooftopView(layout: ArenaLayout, maxAnisotropy: number): THREE.Group {
  const group = new THREE.Group();

  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(layout.halfWidth * 2, layout.halfLength * 2),
    surface(0xffffff, { map: createPitchTexture(maxAnisotropy), roughness: 0.92 }),
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  group.add(pitch);

  const roof = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOF_W, ROOF_L),
    surface(0xffffff, { map: createRooftopTexture(ROOF_W, ROOF_L, maxAnisotropy), roughness: 0.95 }),
  );
  roof.rotation.x = -Math.PI / 2;
  roof.position.y = -0.01;
  roof.receiveShadow = true;
  group.add(roof);

  // Parapet with a lighter coping frames the rooftop against the skyline.
  const pH = 1.1;
  const pT = 0.5;
  const parapet: THREE.BufferGeometry[] = [];
  const coping: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    parapet.push(box(pT, pH, ROOF_L, side * (ROOF_W / 2 + pT / 2), pH / 2, 0));
    parapet.push(box(ROOF_W + pT * 2, pH, pT, 0, pH / 2, side * (ROOF_L / 2 + pT / 2)));
    coping.push(roundedBox(pT + 0.2, 0.14, ROOF_L + pT * 2 + 0.2, side * (ROOF_W / 2 + pT / 2), pH + 0.07, 0, 0.05));
    coping.push(roundedBox(ROOF_W + pT * 2 + 0.2, 0.14, pT + 0.2, 0, pH + 0.07, side * (ROOF_L / 2 + pT / 2), 0.05));
  }
  addMerged(group, parapet, surface(THEME.structure.parapet, { roughness: 0.9 }));
  addMerged(group, coping, surface(THEME.structure.prop, { roughness: 0.8 }));

  // Graffiti panels on the inside of the far parapet: colour and street character.
  const tag = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 1.05),
    surface(0xffffff, { map: createGraffitiTexture('ROOFTOP KINGS', 1024, 120, 4), roughness: 0.85 }),
  );
  tag.position.set(4, 0.54, -ROOF_L / 2 + 0.01);
  tag.receiveShadow = true;
  group.add(tag);

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

  // AC units with fan grilles: rounded bodies read as objects, not cubes.
  const acBodies: THREE.BufferGeometry[] = [];
  const fans: THREE.BufferGeometry[] = [];
  const pipes: THREE.BufferGeometry[] = [];
  for (const [x, z] of [
    [-13.2, -6],
    [-13.2, -2.4],
    [13.5, 8],
    [12.8, -15.5],
    [-12.5, 18.5],
  ] as const) {
    acBodies.push(roundedBox(1.8, 1.1, 1.4, x, 0.55, z, 0.12));
    fans.push(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 18).translate(x, 1.12, z));
    pipes.push(bar(0.07, new THREE.Vector3(x + 0.7, 0.3, z), new THREE.Vector3(x + 0.7, 0.3, z + 2.2)));
  }
  addMerged(group, acBodies, surface(THEME.structure.prop, { roughness: 0.6 }));
  addMerged(group, fans, surface(THEME.structure.steel, { roughness: 0.4, metalness: 0.5 }));
  addMerged(group, pipes, surface(THEME.structure.steelLight, { roughness: 0.45, metalness: 0.6 }));

  group.add(createWaterTank(12.4, -21));
  group.add(createStairHut(-12.6, -20.5, createGraffitiTexture('GOAL!', 384, 120, 8)));
  return group;
}

function createFloodlight(x: number, z: number, glowTexture: THREE.Texture): THREE.Group {
  const tower = new THREE.Group();
  tower.position.set(x, 0, z);
  const height = 9;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.2, height, 10).translate(0, height / 2, 0),
    surface(THEME.structure.steel, { roughness: 0.4, metalness: 0.6 }),
  );
  pole.castShadow = true;
  tower.add(pole);

  const head = new THREE.Group();
  head.position.y = height;
  head.lookAt(0, 0, 0); // aim at the centre spot
  const frame = new THREE.Mesh(
    roundedBox(1.6, 0.8, 0.28, 0, 0, 0, 0.06),
    surface(THEME.structure.steelLight, { roughness: 0.4, metalness: 0.5 }),
  );
  frame.castShadow = true;
  head.add(frame);
  const lamps = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.62), glow(THEME.structure.lampGlow, 3));
  lamps.position.z = 0.15;
  head.add(lamps);
  tower.add(head);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: THEME.structure.lampGlow,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.scale.setScalar(4.5);
  halo.position.y = height;
  tower.add(halo);
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
    legs.push(bar(0.08, new THREE.Vector3(lx * 0.9, 0, lz * 0.9), new THREE.Vector3(lx * 0.8, 2.2, lz * 0.8), 6));
  }
  addMerged(g, legs, surface(THEME.structure.steel, { roughness: 0.5, metalness: 0.4 }));
  // Wooden tank with metal hoops, conical roof: the classic city rooftop silhouette.
  addMerged(g, [new THREE.CylinderGeometry(1.35, 1.35, 2.2, 20).translate(0, 3.3, 0)], surface(THEME.decor.wood, { roughness: 0.85 }));
  const hoops = [2.6, 3.3, 4.0].map((y) =>
    new THREE.TorusGeometry(1.37, 0.04, 6, 24).rotateX(Math.PI / 2).translate(0, y, 0),
  );
  addMerged(g, hoops, surface(THEME.structure.steel, { roughness: 0.4, metalness: 0.7 }));
  addMerged(g, [new THREE.ConeGeometry(1.45, 0.8, 20).translate(0, 4.8, 0)], surface(THEME.structure.propDark, { roughness: 0.7 }));
  return g;
}

function createStairHut(x: number, z: number, graffiti: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  addMerged(g, [roundedBox(4, 2.8, 3, 0, 1.4, 0, 0.08)], surface(THEME.structure.prop, { roughness: 0.85 }));
  addMerged(g, [roundedBox(4.4, 0.2, 3.4, 0, 2.9, 0, 0.05)], surface(THEME.structure.propDark, { roughness: 0.7 }));
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), surface(THEME.teams.away.primary, { roughness: 0.5 }));
  door.position.set(0.9, 1, 1.51);
  g.add(door);
  // Door lamp: a tiny warm point of light that blooms on High.
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), glow(THEME.decor.bulb, 4));
  lamp.position.set(0.9, 2.25, 1.6);
  g.add(lamp);
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 0.9), surface(0xffffff, { map: graffiti, roughness: 0.85 }));
  tag.rotation.y = Math.PI / 2;
  tag.position.set(2.01, 1.2, 0);
  g.add(tag);
  return g;
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
