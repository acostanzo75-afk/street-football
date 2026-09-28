import * as THREE from 'three';
import { PLAYER } from '../game/config';
import { createBlobShadow } from '../render/blobShadow';

const SKIN = 0xe0b08a;
const SHORTS = 0x1b2232;
const SOCKS = 0xf2f2f2;
const BOOTS = 0x111111;
const HAIR = 0x2a1d14;

/** Stride frequency per m/s of speed. */
const STRIDE_RATE = 1.7;
const KICK_DURATION = 0.22;

/**
 * Stylised primitive-built footballer. Built facing +Z with feet at y=0.
 * Purely visual: no gameplay state lives here.
 */
export class PlayerView {
  readonly root = new THREE.Group();

  private readonly body = new THREE.Group();
  private readonly leftLeg: THREE.Group;
  private readonly rightLeg: THREE.Group;
  private readonly leftArm: THREE.Group;
  private readonly rightArm: THREE.Group;
  private runPhase = 0;
  private kickTimer = 0;

  constructor(teamColor: number) {
    const kit = new THREE.MeshLambertMaterial({ color: teamColor });
    const skin = new THREE.MeshLambertMaterial({ color: SKIN });
    const shorts = new THREE.MeshLambertMaterial({ color: SHORTS });
    const socks = new THREE.MeshLambertMaterial({ color: SOCKS });
    const boots = new THREE.MeshLambertMaterial({ color: BOOTS });
    const hair = new THREE.MeshLambertMaterial({ color: HAIR });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.36, 4, 10), kit);
    torso.position.y = 1.2;
    torso.scale.set(1, 1, 0.72);
    this.body.add(torso);

    const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.26, 10), shorts);
    hips.position.y = 0.84;
    hips.scale.z = 0.75;
    this.body.add(hips);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skin);
    head.position.y = 1.74;
    this.body.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), hair);
    cap.position.set(0, 1.77, -0.02);
    this.body.add(cap);

    const legGeometry = new THREE.CylinderGeometry(0.085, 0.07, 0.56, 8);
    legGeometry.translate(0, -0.3, 0);
    const bootGeometry = new THREE.BoxGeometry(0.14, 0.1, 0.28);
    bootGeometry.translate(0, -0.6, 0.06);
    const makeLeg = (x: number): THREE.Group => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.7, 0);
      pivot.add(new THREE.Mesh(legGeometry, socks), new THREE.Mesh(bootGeometry, boots));
      this.body.add(pivot);
      return pivot;
    };
    this.leftLeg = makeLeg(0.13);
    this.rightLeg = makeLeg(-0.13);

    const armGeometry = new THREE.CylinderGeometry(0.065, 0.055, 0.52, 8);
    armGeometry.translate(0, -0.26, 0);
    const makeArm = (x: number): THREE.Group => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 1.44, 0);
      pivot.rotation.z = Math.sign(x) * 0.12;
      pivot.add(new THREE.Mesh(armGeometry, skin));
      this.body.add(pivot);
      return pivot;
    };
    this.leftArm = makeArm(0.35);
    this.rightArm = makeArm(-0.35);

    // Team-coloured ring under the feet marks the controlled player.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(PLAYER.radius + 0.12, PLAYER.radius + 0.24, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    ring.position.y = 0.025;
    ring.renderOrder = 1;

    const shadow = createBlobShadow(0.55, 0.4);
    shadow.position.y = 0.02;

    this.root.add(shadow, ring, this.body);
  }

  playKick(): void {
    this.kickTimer = KICK_DURATION;
  }

  update(feetPosition: THREE.Vector3, yaw: number, speed: number, dt: number): void {
    this.root.position.copy(feetPosition);
    this.body.rotation.y = yaw;

    const speed01 = Math.min(1, speed / PLAYER.maxSpeed);
    this.runPhase += speed * STRIDE_RATE * dt;
    const swing = Math.sin(this.runPhase) * 0.9 * speed01;
    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;
    this.leftArm.rotation.x = -swing * 0.8;
    this.rightArm.rotation.x = swing * 0.8;
    // Running bob.
    this.body.position.y = Math.abs(Math.cos(this.runPhase)) * 0.06 * speed01;

    if (this.kickTimer > 0) {
      this.kickTimer = Math.max(0, this.kickTimer - dt);
      const t = 1 - this.kickTimer / KICK_DURATION;
      // Wind back, then snap through.
      this.rightLeg.rotation.x = t < 0.35 ? (t / 0.35) * 0.8 : 0.8 - ((t - 0.35) / 0.65) * 2.2;
    }
  }
}
