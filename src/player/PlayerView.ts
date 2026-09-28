import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLAYER } from '../game/config';
import { createBlobShadow } from '../render/blobShadow';
import { outlinedMesh, toon } from '../render/materials';
import { THEME } from '../render/theme';

export interface KitColors {
  primary: number;
  secondary: number;
  shorts: number;
}

/** Stride cycles (radians of phase) per metre travelled. */
const STRIDE_PER_METRE = 1.55;
const KICK_DURATION = 0.4;

// Body measurements (metres). Feet at y=0, facing +Z.
const HIP_Y = 0.84;
const THIGH = 0.37;
const SHIN = 0.36;

/**
 * Stylised footballer built procedurally: oversized head and boots, tapered
 * jersey, layered kit, two-segment limbs. Every part has an outline hull for
 * a strong silhouette at phone size. Purely presentational.
 */
export class PlayerView {
  readonly root = new THREE.Group();

  private readonly yawGroup = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly waist = new THREE.Group();
  private readonly chest = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly legs: Limb[];
  private readonly arms: Limb[];
  private readonly shadow: THREE.Mesh;

  private runPhase = 0;
  private time = 0;
  private kickTimer = 0;
  private smoothedSpeed = 0;
  private dribbleBlend = 0;

  constructor(kit: KitColors) {
    const c = THEME.character;
    const jersey = toon(kit.primary, { rim: true });
    const trim = toon(kit.secondary, { rim: true });
    const shorts = toon(kit.shorts, { rim: true });
    const skin = toon(c.skin, { rim: true });
    const hair = toon(c.hair, { rim: true });
    const sock = toon(c.sock, { rim: true });
    const shoe = toon(c.shoe, { rim: true });
    const sole = toon(c.sole);
    const eye = toon(c.eye);

    this.root.add(this.yawGroup);
    this.yawGroup.add(this.hips);
    this.hips.position.y = HIP_Y;

    // --- Shorts: flared lathe, slightly baggy streetwear cut.
    const shortsGeo = lathe(
      [
        [0.2, 0.1],
        [0.235, 0.0],
        [0.27, -0.14],
        [0.285, -0.25],
      ],
      0.78,
    );
    this.hips.add(outlinedMesh(shortsGeo, shorts));

    // --- Upper body pivots at the waist so lean/twist never move the feet.
    this.waist.position.y = 0.06;
    this.hips.add(this.waist);
    this.waist.add(this.chest);

    const jerseyGeo = lathe(
      [
        [0.19, -0.04],
        [0.21, 0.1],
        [0.265, 0.3],
        [0.3, 0.42],
        [0.25, 0.5],
        [0.11, 0.55],
      ],
      0.74,
    );
    this.chest.add(outlinedMesh(jerseyGeo, jersey));

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.028, 6, 16), trim);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.54;
    collar.scale.set(1, 0.8, 1);
    this.chest.add(collar);

    // Side stripe hint + number on the back: the camera mostly sees the back.
    const number = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshBasicMaterial({ map: createNumberTexture('10', kit.secondary), transparent: true }),
    );
    number.position.set(0, 0.28, -0.214);
    number.rotation.y = Math.PI;
    this.chest.add(number);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.12, 10), skin);
    neck.position.y = 0.6;
    this.chest.add(neck);

    // --- Head: oversized for readability and charm.
    this.head.position.y = 0.84;
    this.chest.add(this.head);
    const headGeo = new THREE.SphereGeometry(0.245, 20, 16);
    headGeo.scale(1, 1.04, 0.96);
    this.head.add(outlinedMesh(headGeo, skin));

    const hairGeo = new THREE.SphereGeometry(0.262, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.52);
    hairGeo.scale(1, 1.02, 1);
    const hairCap = outlinedMesh(hairGeo, hair);
    // Tilted back so the forehead shows: reads as hair, not a helmet.
    hairCap.position.set(0, 0.07, -0.03);
    hairCap.rotation.x = -0.55;
    this.head.add(hairCap);
    // Tuft on top gives a distinctive silhouette.
    const tuftGeo = new THREE.ConeGeometry(0.1, 0.2, 8);
    const tuft = outlinedMesh(tuftGeo, hair);
    tuft.position.set(0.02, 0.26, 0.04);
    tuft.rotation.set(0.6, 0, -0.25);
    this.head.add(tuft);

    // Paired face features are merged: one draw call per material, not per part.
    const pair = (make: (x: number) => THREE.BufferGeometry, x: number): THREE.BufferGeometry =>
      mergeGeometries([make(-x), make(x)]) ?? make(x);
    const eyes = pair((x) => new THREE.SphereGeometry(0.034, 8, 8).scale(1, 1.45, 0.6).translate(x, 0.01, 0.228), 0.085);
    const brows = pair(
      (x) => new THREE.BoxGeometry(0.08, 0.022, 0.02).rotateZ(-Math.sign(x) * 0.18).translate(x, 0.085, 0.225),
      0.088,
    );
    const ears = pair((x) => new THREE.SphereGeometry(0.055, 8, 8).scale(0.6, 1, 0.8).translate(x, -0.01, 0), 0.24);
    this.head.add(new THREE.Mesh(eyes, eye), new THREE.Mesh(brows, hair), new THREE.Mesh(ears, skin));

    // --- Arms: sleeve + upper arm, elbow joint, forearm + hand.
    const sleeveGeo = new THREE.CylinderGeometry(0.1, 0.085, 0.2, 10);
    sleeveGeo.translate(0, -0.08, 0);
    const upperArmGeo = new THREE.CylinderGeometry(0.062, 0.055, 0.2, 8);
    upperArmGeo.translate(0, -0.22, 0);
    const forearmGeo =
      mergeGeometries([
        new THREE.CylinderGeometry(0.055, 0.048, 0.22, 8).translate(0, -0.11, 0),
        new THREE.SphereGeometry(0.068, 10, 8).translate(0, -0.26, 0),
      ]) ?? new THREE.CylinderGeometry(0.055, 0.048, 0.22, 8);
    this.arms = [-1, 1].map((side) => {
      const upper = new THREE.Group();
      upper.position.set(0.3 * side, 0.45, 0);
      upper.add(outlinedMesh(sleeveGeo, jersey), outlinedMesh(upperArmGeo, skin));
      const lower = new THREE.Group();
      lower.position.y = -0.31;
      lower.add(outlinedMesh(forearmGeo, skin));
      upper.add(lower);
      this.chest.add(upper);
      return { upper, lower, side };
    });

    // --- Legs: thigh, knee joint, sock-covered shin, chunky boot.
    const thighGeo = new THREE.CylinderGeometry(0.1, 0.08, THIGH, 10);
    thighGeo.translate(0, -THIGH / 2, 0);
    const shinGeo = new THREE.CylinderGeometry(0.078, 0.06, SHIN, 10);
    shinGeo.translate(0, -SHIN / 2, 0);
    const bandGeo = new THREE.CylinderGeometry(0.082, 0.08, 0.05, 10);
    bandGeo.translate(0, -0.06, 0);
    const bootGeo = new THREE.SphereGeometry(1, 14, 10);
    bootGeo.scale(0.12, 0.085, 0.2);
    bootGeo.translate(0, -SHIN - 0.02, 0.06);
    const soleGeo = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    soleGeo.scale(0.13, 0.05, 0.215);
    soleGeo.translate(0, -SHIN - 0.03, 0.06);
    this.legs = [-1, 1].map((side) => {
      const upper = new THREE.Group();
      upper.position.set(0.12 * side, 0, 0);
      upper.add(outlinedMesh(thighGeo, skin));
      const lower = new THREE.Group();
      lower.position.y = -THIGH;
      const band = new THREE.Mesh(bandGeo, trim);
      lower.add(outlinedMesh(shinGeo, sock), band, outlinedMesh(bootGeo, shoe), new THREE.Mesh(soleGeo, sole));
      upper.add(lower);
      this.hips.add(upper);
      return { upper, lower, side };
    });

    // --- Ground: contact shadow, team ring, facing chevron.
    this.shadow = createBlobShadow(0.62, 0.5);
    this.shadow.position.y = 0.02;
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: kit.primary,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(PLAYER.radius + 0.14, PLAYER.radius + 0.23, 32).rotateX(-Math.PI / 2),
      ringMaterial,
    );
    ring.position.y = 0.03;
    ring.renderOrder = 1;
    const chevronShape = new THREE.Shape();
    chevronShape.moveTo(0, 0.2);
    chevronShape.lineTo(0.16, 0);
    chevronShape.lineTo(0.08, 0);
    chevronShape.lineTo(0, 0.1);
    chevronShape.lineTo(-0.08, 0);
    chevronShape.lineTo(-0.16, 0);
    chevronShape.closePath();
    const chevron = new THREE.Mesh(new THREE.ShapeGeometry(chevronShape).rotateX(-Math.PI / 2), ringMaterial);
    chevron.position.set(0, 0.031, PLAYER.radius + 0.3);
    chevron.renderOrder = 1;
    this.yawGroup.add(chevron);
    this.root.add(this.shadow, ring);
  }

  playKick(): void {
    this.kickTimer = KICK_DURATION;
  }

  update(feetPosition: THREE.Vector3, yaw: number, speed: number, dribbling: boolean, dt: number): void {
    this.time += dt;
    this.root.position.copy(feetPosition);
    this.yawGroup.rotation.y = yaw;

    // Smooth inputs so animation never pops when physics speed jitters.
    const k = 1 - Math.exp(-12 * dt);
    this.smoothedSpeed += (speed - this.smoothedSpeed) * k;
    this.dribbleBlend += ((dribbling ? 1 : 0) - this.dribbleBlend) * (1 - Math.exp(-8 * dt));
    const s = Math.min(1, this.smoothedSpeed / PLAYER.maxSpeed);
    const idle = 1 - Math.min(1, s * 3);
    const d = this.dribbleBlend;

    // Dribbling: quicker, shorter steps.
    this.runPhase += this.smoothedSpeed * STRIDE_PER_METRE * (1 + d * 0.35) * dt * Math.PI;
    const p = this.runPhase;
    const stride = (0.85 - d * 0.3) * s;
    const swing = Math.sin(p) * stride;

    for (const leg of this.legs) {
      const phase = leg.side === 1 ? p : p + Math.PI;
      leg.upper.rotation.x = Math.sin(phase) * stride;
      // Knee folds while the leg recovers forward.
      leg.lower.rotation.x = (0.15 + Math.max(0, Math.sin(phase - 0.9)) * 1.25) * s + idle * 0.05;
    }
    for (const arm of this.arms) {
      // Arms oppose the leg on the same side.
      const phase = arm.side === 1 ? p + Math.PI : p;
      arm.upper.rotation.x = Math.sin(phase) * stride * 0.95;
      arm.upper.rotation.z = arm.side * (0.12 + idle * 0.04 * Math.sin(this.time * 1.6));
      arm.lower.rotation.x = -(0.35 + s * 0.75);
    }

    // Torso: lean into the run, counter-twist with the stride, breathe at rest.
    const breathe = Math.sin(this.time * 2.4);
    this.waist.rotation.x = s * 0.24 + d * 0.1;
    this.waist.rotation.y = -swing * 0.22;
    this.chest.scale.set(1 + breathe * 0.012 * idle, 1 + breathe * 0.018 * idle, 1);
    this.head.rotation.x = -s * 0.12 + d * 0.18;
    this.hips.position.y = HIP_Y + Math.abs(Math.cos(p)) * 0.06 * s - (1 - Math.abs(Math.cos(p))) * 0.02 * s;

    if (this.kickTimer > 0) this.applyKick(dt);

    const shadowStretch = 1 + s * 0.15;
    this.shadow.scale.set(1, 1, shadowStretch);
  }

  /** Short wind-up, whip through, held follow-through. Overrides the right leg. */
  private applyKick(dt: number): void {
    this.kickTimer = Math.max(0, this.kickTimer - dt);
    const t = 1 - this.kickTimer / KICK_DURATION;
    const leg = this.legs[0];
    const plant = this.legs[1];
    if (!leg || !plant) return;

    let thigh: number;
    let knee: number;
    if (t < 0.18) {
      const u = t / 0.18;
      thigh = 0.7 * u;
      knee = 1.4 * u;
    } else if (t < 0.42) {
      const u = easeOut((t - 0.18) / 0.24);
      thigh = 0.7 - 2.0 * u;
      knee = 1.4 - 1.3 * u;
    } else {
      const u = (t - 0.42) / 0.58;
      thigh = -1.3 * (1 - u * u);
      knee = 0.1 + 0.2 * u;
    }
    const weight = t > 0.85 ? (1 - t) / 0.15 : 1;
    leg.upper.rotation.x += (thigh - leg.upper.rotation.x) * weight;
    leg.lower.rotation.x += (knee - leg.lower.rotation.x) * weight;
    plant.upper.rotation.x *= 1 - weight * 0.8;
    plant.lower.rotation.x = Math.max(plant.lower.rotation.x, 0.25 * weight);

    // Upper body: arms open for balance, slight lean back on follow-through.
    const open = Math.sin(Math.min(1, t * 1.6) * Math.PI) * weight;
    for (const arm of this.arms) arm.upper.rotation.z = arm.side * (0.15 + open * 0.8);
    this.waist.rotation.x += (-0.18 * open - this.waist.rotation.x) * weight * 0.8;
    this.waist.rotation.y = 0.35 * open;
  }
}

interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
  side: number;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Lathe from (radius, y) pairs, flattened front-to-back for a torso cross-section. */
function lathe(points: Array<[number, number]>, depthScale: number): THREE.LatheGeometry {
  const geometry = new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    18,
  );
  geometry.scale(1, 1, depthScale);
  return geometry;
}

function createNumberTexture(text: string, color: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.font = 'italic 900 100px "Barlow Condensed", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#10131f';
  ctx.strokeText(text, size / 2, size / 2 + 6);
  ctx.fillStyle = `#${new THREE.Color(color).getHexString()}`;
  ctx.fillText(text, size / 2, size / 2 + 6);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
