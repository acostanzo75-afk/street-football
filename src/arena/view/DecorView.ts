import * as THREE from 'three';
import { surface } from '../../render/materials';
import { THEME } from '../../render/theme';
import type { ArenaLayout } from '../ArenaLayout';
import { addMerged, bar, roundedBox } from './geometry';

/**
 * Lived-in street details around the cage: a neon billboard behind the far
 * goal (the scene's visual landmark), a bench with a kit bag and bottles,
 * traffic cones, a ball rack and planters. `density` < 1 drops the optional
 * clutter on low-end devices.
 */
export function createDecorView(layout: ArenaLayout, density: number): THREE.Group {
  const group = new THREE.Group();
  const hw = layout.halfWidth;
  const hl = layout.halfLength;

  group.add(createNeonBillboard(-4.5, -(hl + 6.2)));
  group.add(createBench(hw + 1.6, 3.5));

  // Cones in a little training ladder beside the cage.
  const conePositions: Array<[number, number]> = [
    [-(hw + 1.5), -8],
    [-(hw + 1.5), -6.5],
    [-(hw + 1.5), -5],
    [hw + 1.4, -11],
  ];
  const cones = conePositions.map(([x, z]) => new THREE.ConeGeometry(0.16, 0.42, 14).translate(x, 0.23, z));
  const coneBases = conePositions.map(([x, z]) => roundedBox(0.36, 0.04, 0.36, x, 0.02, z, 0.015));
  const coneStripes = conePositions.map(([x, z]) => new THREE.CylinderGeometry(0.095, 0.115, 0.07, 14, 1, true).translate(x, 0.24, z));
  addMerged(group, cones, surface(THEME.decor.cone, { roughness: 0.45 }));
  addMerged(group, coneBases, surface(THEME.decor.cone, { roughness: 0.5 }));
  addMerged(group, coneStripes, surface(0xffffff, { roughness: 0.4 }));

  if (density >= 1) {
    group.add(createBallRack(hw + 1.6, -1.2));
    for (const [x, z] of [
      [-(hw + 2.2), 9],
      [-(hw + 2.2), 12.5],
      [hw + 2.4, 13],
    ] as const) {
      group.add(createPlanter(x, z));
    }
  }
  return group;
}

/**
 * Framed billboard on legs with a neon "STREET CUP" sign. The tubes use an
 * unlit HDR colour so they bloom on High and stay bright everywhere else.
 */
function createNeonBillboard(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const steel = surface(THEME.structure.steel, { roughness: 0.4, metalness: 0.6 });
  addMerged(
    g,
    [
      bar(0.09, new THREE.Vector3(-2.6, 0, 0), new THREE.Vector3(-2.6, 4.2, 0)),
      bar(0.09, new THREE.Vector3(2.6, 0, 0), new THREE.Vector3(2.6, 4.2, 0)),
      bar(0.05, new THREE.Vector3(-2.6, 1.6, 0), new THREE.Vector3(2.6, 3.6, 0)),
    ],
    steel,
  );
  addMerged(g, [roundedBox(6, 2.2, 0.25, 0, 5, 0, 0.08)], surface(0x1b1830, { roughness: 0.6 }));

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // Outline-only lettering reads as bent neon tube.
  ctx.font = 'italic 900 170px "Barlow Condensed", system-ui, sans-serif';
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#ff4fa3';
  ctx.strokeText('STREET', 512, 120);
  ctx.font = 'italic 900 120px "Barlow Condensed", system-ui, sans-serif';
  ctx.strokeStyle = '#42e8e0';
  ctx.strokeText('CUP', 512, 270);
  // Ball glyph beside "CUP".
  ctx.beginPath();
  ctx.arc(700, 270, 44, 0, Math.PI * 2);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const neonMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  neonMaterial.color.setScalar(2.6); // HDR push for bloom
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.97), neonMaterial);
  sign.position.set(0, 5, 0.14);
  g.add(sign);
  // Soft coloured spill on the board behind the letters.
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.8), glowSpillMaterial());
  spill.position.set(0, 5, 0.13);
  g.add(spill);
  return g;
}

function glowSpillMaterial(): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const g = ctx.createRadialGradient(64, 32, 4, 64, 32, 64);
  g.addColorStop(0, 'rgba(255,79,163,0.55)');
  g.addColorStop(0.6, 'rgba(66,232,224,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
}

/** Wooden bench with a kit bag and two bottles: tells you people play here. */
function createBench(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const slats = [0, 1, 2].map((i) => roundedBox(0.14, 0.05, 2.2, -0.16 + i * 0.16, 0.45, 0, 0.02));
  slats.push(roundedBox(0.05, 0.14, 2.2, 0.26, 0.7, 0, 0.02), roundedBox(0.05, 0.14, 2.2, 0.26, 0.88, 0, 0.02));
  addMerged(g, slats, surface(THEME.decor.wood, { roughness: 0.75 }));
  const legs = [-0.9, 0.9].flatMap((lz) => [
    roundedBox(0.5, 0.06, 0.06, 0, 0.4, lz, 0.02),
    roundedBox(0.06, 0.42, 0.06, -0.2, 0.21, lz, 0.02),
    roundedBox(0.06, 0.42, 0.06, 0.2, 0.21, lz, 0.02),
    roundedBox(0.06, 0.5, 0.06, 0.26, 0.65, lz, 0.02),
  ]);
  addMerged(g, legs, surface(THEME.structure.steel, { roughness: 0.4, metalness: 0.6 }));
  // Kit bag in the home colour.
  addMerged(g, [roundedBox(0.4, 0.34, 0.8, -0.05, 0.65, -0.45, 0.14)], surface(THEME.teams.home.primary, { roughness: 0.65 }));
  addMerged(g, [new THREE.TorusGeometry(0.16, 0.025, 6, 16, Math.PI).translate(-0.05, 0.82, -0.45)], surface(0x1a1d29, { roughness: 0.6 }));
  // Bottles.
  const bottles = [0.35, 0.55].map((bz) =>
    new THREE.CylinderGeometry(0.045, 0.045, 0.24, 12).translate(-0.05, 0.6, bz),
  );
  addMerged(g, bottles, surface(0x7fd7ff, { roughness: 0.15, metalness: 0.1 }));
  addMerged(g, [0.35, 0.55].map((bz) => new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10).translate(-0.05, 0.745, bz)), surface(THEME.teams.away.primary, { roughness: 0.4 }));
  return g;
}

function createBallRack(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const frame = [
    bar(0.03, new THREE.Vector3(-0.3, 0, -0.5), new THREE.Vector3(-0.3, 0.7, -0.5)),
    bar(0.03, new THREE.Vector3(0.3, 0, -0.5), new THREE.Vector3(0.3, 0.7, -0.5)),
    bar(0.03, new THREE.Vector3(-0.3, 0, 0.5), new THREE.Vector3(-0.3, 0.7, 0.5)),
    bar(0.03, new THREE.Vector3(0.3, 0, 0.5), new THREE.Vector3(0.3, 0.7, 0.5)),
    bar(0.03, new THREE.Vector3(-0.3, 0.35, -0.5), new THREE.Vector3(-0.3, 0.35, 0.5)),
    bar(0.03, new THREE.Vector3(0.3, 0.35, -0.5), new THREE.Vector3(0.3, 0.35, 0.5)),
  ];
  addMerged(g, frame, surface(THEME.structure.steelLight, { roughness: 0.35, metalness: 0.7 }));
  const balls = [-0.3, 0, 0.3].map((bz) => new THREE.IcosahedronGeometry(0.2, 2).translate(0, 0.56, bz));
  addMerged(g, balls, surface(THEME.ball.base, { roughness: 0.35 }));
  return g;
}

function createPlanter(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  addMerged(g, [roundedBox(1.1, 0.55, 1.1, 0, 0.275, 0, 0.08)], surface(THEME.decor.wood, { roughness: 0.8 }));
  const leaves: THREE.BufferGeometry[] = [];
  const offsets = [
    [0, 0.85, 0, 0.42],
    [0.22, 0.75, 0.15, 0.3],
    [-0.2, 0.72, -0.12, 0.32],
    [0.1, 1.05, -0.1, 0.28],
  ] as const;
  for (const [ox, oy, oz, r] of offsets) leaves.push(new THREE.IcosahedronGeometry(r, 1).translate(ox, oy, oz));
  addMerged(g, leaves, surface(THEME.decor.foliage, { roughness: 0.85 }));
  return g;
}
