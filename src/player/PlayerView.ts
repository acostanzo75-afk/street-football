import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLAYER } from '../game/config';
import { createBlobShadow } from '../render/blobShadow';
import { glow, surface } from '../render/materials';
import { THEME } from '../render/theme';

export interface KitColors {
  primary: number;
  secondary: number;
  shorts: number;
}

export interface PlayerViewOptions {
  kit: KitColors;
  number: string;
  /** With real-time shadows the blob only needs to be a faint contact shadow. */
  realShadows: boolean;
}

/** Stride cycles (radians of phase) per metre travelled. */
const STRIDE_PER_METRE = 1.55;
const KICK_DURATION = 0.4;

// Body measurements (metres). Feet at y=0, facing +Z.
const HIP_Y = 0.84;
const THIGH = 0.37;
const SHIN = 0.36;

/**
 * Stylised footballer built procedurally: oversized head with expressive eyes,
 * chunky hair locks and a headband, a textured kit (chest band, side panels,
 * number on the back), two-segment limbs and oversized boots.
 * Animation is procedural: idle breathing, run cycle, dribble gait, kick, plus
 * spring-driven secondary motion on the hair and head. Purely presentational.
 */
export class PlayerView {
  readonly root = new THREE.Group();

  private readonly yawGroup = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly waist = new THREE.Group();
  private readonly chest = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly hair = new THREE.Group();
  private readonly legs: Limb[];
  private readonly arms: Limb[];
  private readonly shadow: THREE.Mesh;

  private runPhase = 0;
  private time = 0;
  private kickTimer = 0;
  private smoothedSpeed = 0;
  private prevSpeed = 0;
  private dribbleBlend = 0;
  /** Hair spring state (radians, rad/s). */
  private hairAngle = 0;
  private hairVelocity = 0;

  constructor(options: PlayerViewOptions) {
    const { kit } = options;
    const c = THEME.character;
    const jersey = surface(0xffffff, { map: createJerseyTexture(kit, options.number), roughness: 0.78 });
    const trim = surface(kit.secondary, { roughness: 0.6 });
    // Sleeves use a plain kit colour: the jersey texture would wrap the number onto them.
    const sleeveMat = surface(kit.primary, { roughness: 0.78 });
    const shorts = surface(0xffffff, { map: createShortsTexture(kit), roughness: 0.75 });
    const skin = surface(c.skin, { roughness: 0.6 });
    const hairMat = surface(c.hair, { roughness: 0.5 });
    const sock = surface(c.sock, { roughness: 0.8 });
    const shoe = surface(c.shoe, { roughness: 0.35 });
    const sole = surface(c.sole, { roughness: 0.6 });

    this.root.add(this.yawGroup);
    this.yawGroup.add(this.hips);
    this.hips.position.y = HIP_Y;

    // --- Shorts: flared lathe, slightly baggy streetwear cut, side stripes in the texture.
    this.hips.add(
      new THREE.Mesh(
        lathe(
          [
            [0.2, 0.1],
            [0.235, 0.0],
            [0.27, -0.14],
            [0.285, -0.25],
          ],
          0.78,
        ),
        shorts,
      ),
    );

    // --- Upper body pivots at the waist so lean/twist never move the feet.
    this.waist.position.y = 0.06;
    this.hips.add(this.waist);
    this.waist.add(this.chest);

    this.chest.add(
      new THREE.Mesh(
        lathe(
          [
            [0.19, -0.04],
            [0.21, 0.1],
            [0.265, 0.3],
            [0.3, 0.42],
            [0.25, 0.5],
            [0.11, 0.55],
          ],
          0.74,
        ),
        jersey,
      ),
    );
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 20), trim);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.54;
    collar.scale.set(1, 0.8, 1);
    this.chest.add(collar);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.12, 12), skin);
    neck.position.y = 0.6;
    this.chest.add(neck);

    // --- Head: oversized for readability and charm.
    this.head.position.y = 0.84;
    this.chest.add(this.head);
    this.buildHead(skin, hairMat, trim);

    // --- Arms: sleeve + upper arm, elbow joint, forearm + hand.
    const sleeveGeo = new THREE.CylinderGeometry(0.1, 0.088, 0.2, 14).translate(0, -0.08, 0);
    const cuffGeo = new THREE.CylinderGeometry(0.091, 0.091, 0.035, 14).translate(0, -0.165, 0);
    const upperArmGeo = new THREE.CylinderGeometry(0.062, 0.055, 0.2, 12).translate(0, -0.22, 0);
    const forearmGeo = merge([
      new THREE.CylinderGeometry(0.055, 0.048, 0.22, 12).translate(0, -0.11, 0),
      new THREE.SphereGeometry(0.068, 12, 10).scale(1, 1.1, 0.85).translate(0, -0.26, 0),
    ]);
    const wristbandGeo = new THREE.CylinderGeometry(0.058, 0.058, 0.05, 12).translate(0, -0.18, 0);
    this.arms = [-1, 1].map((side) => {
      const upper = new THREE.Group();
      upper.position.set(0.3 * side, 0.45, 0);
      upper.add(new THREE.Mesh(sleeveGeo, sleeveMat), new THREE.Mesh(cuffGeo, trim), new THREE.Mesh(upperArmGeo, skin));
      const lower = new THREE.Group();
      lower.position.y = -0.31;
      lower.add(new THREE.Mesh(forearmGeo, skin), new THREE.Mesh(wristbandGeo, trim));
      upper.add(lower);
      this.chest.add(upper);
      return { upper, lower, side };
    });

    // --- Legs: thigh, knee joint, sock-covered shin, chunky boot with a coloured stripe.
    const thighGeo = new THREE.CylinderGeometry(0.115, 0.085, THIGH, 12).translate(0, -THIGH / 2, 0);
    const shinGeo = new THREE.CylinderGeometry(0.078, 0.06, SHIN, 12).translate(0, -SHIN / 2, 0);
    const bandGeo = new THREE.CylinderGeometry(0.082, 0.08, 0.05, 12).translate(0, -0.06, 0);
    const bootGeo = new THREE.SphereGeometry(1, 18, 12).scale(0.12, 0.09, 0.21).translate(0, -SHIN - 0.02, 0.06);
    const soleGeo = new THREE.SphereGeometry(1, 18, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
      .scale(0.13, 0.05, 0.225)
      .translate(0, -SHIN - 0.03, 0.06);
    const stripeGeo = merge([-1, 1].map((s) => new THREE.BoxGeometry(0.012, 0.035, 0.16).translate(s * 0.118, -SHIN - 0.01, 0.06)));
    this.legs = [-1, 1].map((side) => {
      const upper = new THREE.Group();
      upper.position.set(0.12 * side, 0, 0);
      upper.add(new THREE.Mesh(thighGeo, skin));
      const lower = new THREE.Group();
      lower.position.y = -THIGH;
      lower.add(
        new THREE.Mesh(shinGeo, sock),
        new THREE.Mesh(bandGeo, trim),
        new THREE.Mesh(bootGeo, shoe),
        new THREE.Mesh(soleGeo, sole),
        new THREE.Mesh(stripeGeo, trim),
      );
      upper.add(lower);
      this.hips.add(upper);
      return { upper, lower, side };
    });

    // Body parts cast into the sun shadow; they don't receive (avoids acne on small curved parts).
    this.yawGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) child.castShadow = true;
    });

    // --- Ground: contact shadow, team ring, facing chevron.
    this.shadow = createBlobShadow(0.62, options.realShadows ? 0.28 : 0.5);
    this.shadow.position.y = 0.02;
    const ringMaterial = new THREE.MeshBasicMaterial({ color: kit.primary, transparent: true, opacity: 0.9, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(PLAYER.radius + 0.14, PLAYER.radius + 0.23, 40).rotateX(-Math.PI / 2), ringMaterial);
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
    const accel = dt > 0 ? (this.smoothedSpeed - this.prevSpeed) / dt : 0;
    this.prevSpeed = this.smoothedSpeed;

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
    const bob = Math.abs(Math.cos(p));
    this.waist.rotation.x = s * 0.24 + d * 0.1 + THREE.MathUtils.clamp(accel * 0.012, -0.12, 0.12);
    this.waist.rotation.y = -swing * 0.22;
    this.chest.scale.set(1 + breathe * 0.012 * idle, 1 + breathe * 0.018 * idle, 1);
    this.head.rotation.x = -s * 0.12 + d * 0.18 + idle * breathe * 0.015;
    this.head.rotation.z = Math.sin(p) * 0.04 * s;
    this.hips.position.y = HIP_Y + bob * 0.06 * s - (1 - bob) * 0.02 * s;

    // Hair: damped spring swept back by speed, kicked by acceleration and footfalls.
    const target = s * 0.35 + (bob - 0.5) * 0.12 * s;
    const force = -90 * (this.hairAngle - target) - 9 * this.hairVelocity - accel * 0.25;
    this.hairVelocity += force * dt;
    this.hairAngle += this.hairVelocity * dt;
    this.hair.rotation.x = -this.hairAngle;

    if (this.kickTimer > 0) this.applyKick(dt);

    this.shadow.scale.set(1, 1, 1 + s * 0.15);
  }

  private buildHead(skin: THREE.Material, hairMat: THREE.Material, trim: THREE.Material): void {
    const head = this.head;
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.245, 28, 20).scale(1, 1.04, 0.96), skin));

    // Features merged per material: one draw call each, not one per part.
    const pair = (make: (x: number) => THREE.BufferGeometry, x: number): THREE.BufferGeometry => merge([make(-x), make(x)]);
    const ears = pair((x) => new THREE.SphereGeometry(0.055, 10, 8).scale(0.6, 1, 0.8).translate(x, -0.01, 0), 0.24);
    const nose = new THREE.SphereGeometry(0.03, 10, 8).scale(1, 0.9, 0.8).translate(0, -0.035, 0.235);
    head.add(new THREE.Mesh(merge([ears, nose]), skin));

    // Big readable eyes: white, dark pupil looking slightly ahead, glinting highlight.
    const sclera = pair((x) => new THREE.SphereGeometry(0.05, 14, 12).scale(1, 1.3, 0.5).translate(x, 0.015, 0.215), 0.082);
    const pupils = pair((x) => new THREE.SphereGeometry(0.03, 12, 10).scale(1, 1.3, 0.5).translate(x, 0.01, 0.235), 0.082);
    const glints = pair((x) => new THREE.SphereGeometry(0.011, 6, 6).translate(x + 0.01, 0.03, 0.25), 0.082);
    head.add(
      new THREE.Mesh(sclera, surface(0xffffff, { roughness: 0.3 })),
      new THREE.Mesh(pupils, surface(THEME.character.eye, { roughness: 0.2 })),
      new THREE.Mesh(glints, glow(0xffffff, 1.4)),
    );
    const brows = pair((x) => new THREE.BoxGeometry(0.085, 0.024, 0.024).rotateZ(-Math.sign(x) * 0.2).translate(x, 0.1, 0.22), 0.085);
    // Confident little smile.
    const mouth = new THREE.TorusGeometry(0.045, 0.011, 6, 12, Math.PI * 0.7).rotateZ(Math.PI * 1.15).translate(0, -0.085, 0.222);
    head.add(new THREE.Mesh(merge([brows, mouth]), surface(THEME.character.hair, { roughness: 0.6 })));

    // Hair: cap + swept-back locks on a spring-driven pivot at the crown.
    this.hair.position.set(0, 0.12, -0.02);
    head.add(this.hair);
    const cap = new THREE.SphereGeometry(0.262, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.52)
      .rotateX(-0.55)
      .translate(0, -0.05, -0.01);
    const locks: THREE.BufferGeometry[] = [cap];
    const lockDefs = [
      [-0.12, 0.13, 0.1, -0.5, 0.35],
      [0.0, 0.16, 0.12, -0.35, 0],
      [0.12, 0.13, 0.1, -0.5, -0.35],
      [-0.17, 0.06, -0.05, -1.1, 0.6],
      [0.17, 0.06, -0.05, -1.1, -0.6],
      [-0.07, 0.12, -0.12, -1.3, 0.25],
      [0.07, 0.12, -0.12, -1.3, -0.25],
    ] as const;
    for (const [x, y, z, rx, rz] of lockDefs) {
      locks.push(new THREE.ConeGeometry(0.075, 0.26, 10).rotateX(rx).rotateZ(rz).translate(x, y, z));
    }
    this.hair.add(new THREE.Mesh(merge(locks), hairMat));

    // Sporty headband in the kit's secondary colour.
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.026, 8, 32).rotateX(Math.PI / 2 - 0.25), trim);
    band.position.set(0, 0.1, -0.005);
    head.add(band);
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
    // The kick jolts the hair forward.
    this.hairVelocity -= open * 0.1;
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

/** Merges parts that share a material; normalises index so any mix works. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  if (!merged) throw new Error('character geometry merge failed');
  return merged;
}

/** Lathe from (radius, y) pairs, flattened front-to-back for a torso cross-section. */
function lathe(points: Array<[number, number]>, depthScale: number): THREE.LatheGeometry {
  const geometry = new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    28,
  );
  geometry.scale(1, 1, depthScale);
  return geometry;
}

function hex(color: number): string {
  return `#${new THREE.Color(color).getHexString()}`;
}

/**
 * Kit texture for the jersey lathe. U runs around the body starting at the
 * front (0 = front, 0.5 = back); V runs bottom (0) to top (1).
 * Chest band, darker side panels, shoulder yoke, crest and the back number.
 */
function createJerseyTexture(kit: KitColors, number: string): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const primary = hex(kit.primary);
  const secondary = hex(kit.secondary);
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, w, h);

  // Side panels (u ≈ 0.25 and 0.75), slightly darker for shape.
  ctx.fillStyle = 'rgba(0,0,20,0.22)';
  for (const u of [0.25, 0.75]) ctx.fillRect(u * w - w * 0.06, 0, w * 0.12, h);
  // Chest band.
  ctx.fillStyle = secondary;
  ctx.fillRect(0, h * 0.3, w, h * 0.07);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(0, h * 0.37, w, h * 0.015);
  // Shoulder yoke.
  ctx.fillStyle = 'rgba(0,0,30,0.3)';
  ctx.fillRect(0, 0, w, h * 0.12);
  // Hem.
  ctx.fillStyle = secondary;
  ctx.fillRect(0, h * 0.94, w, h * 0.06);
  // Fabric texture: fine horizontal ribbing.
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);

  // Crest on the left chest (front is u≈0 / 1; the wearer's left is +X, u slightly > 0).
  ctx.fillStyle = secondary;
  ctx.beginPath();
  ctx.arc(w * 0.07, h * 0.52, h * 0.045, 0, Math.PI * 2);
  ctx.fill();

  // Back number, centred at u = 0.5, wrapped by the lathe.
  ctx.font = `italic 900 ${Math.round(h * 0.42)}px "Barlow Condensed", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#10131f';
  ctx.strokeText(number, w * 0.5, h * 0.56);
  ctx.fillStyle = secondary;
  ctx.fillText(number, w * 0.5, h * 0.56);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createShortsTexture(kit: KitColors): THREE.CanvasTexture {
  const w = 256;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = hex(kit.shorts);
  ctx.fillRect(0, 0, w, h);
  // Side stripes down the outer leg (u ≈ 0.25 and 0.75).
  ctx.fillStyle = hex(kit.secondary);
  for (const u of [0.25, 0.75]) ctx.fillRect(u * w - 6, 0, 12, h);
  // Waistband.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, h * 0.82, w, h * 0.18);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
