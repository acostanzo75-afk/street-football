import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { BALL } from '../game/config';
import type { SpawnPoint } from '../arena/ArenaLayout';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { createBlobShadow } from '../render/blobShadow';

/**
 * The football: a Rapier dynamic body plus its visual.
 *
 * Simulation state (`position`, `rotation`) is read back from the body after
 * every fixed step. The mesh is only ever driven by `render(alpha)`, which
 * interpolates between the previous and current fixed-step states.
 */
export class Ball {
  readonly body: RAPIER.RigidBody;
  readonly mesh: THREE.Mesh;
  readonly shadow: THREE.Mesh;

  /** Current simulation state (read-only for other systems). */
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly rotation = new THREE.Quaternion();

  private readonly prevPosition = new THREE.Vector3();
  private readonly prevRotation = new THREE.Quaternion();

  constructor(physics: PhysicsWorld, spawn: SpawnPoint) {
    const { rapier, world } = physics;
    this.body = world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .setLinearDamping(BALL.linearDamping)
        .setAngularDamping(BALL.angularDamping)
        // Fast shots must not tunnel through thin goal walls.
        .setCcdEnabled(true),
    );
    world.createCollider(
      rapier.ColliderDesc.ball(BALL.radius)
        .setMass(BALL.mass)
        .setRestitution(BALL.restitution)
        .setFriction(BALL.friction),
      this.body,
    );

    const geometry = createBallGeometry(BALL.radius);
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
    // A faint silhouette drawn on top of everything: the third-person camera often
    // puts the player's body between lens and ball while dribbling. One extra draw call.
    const xray = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false }),
    );
    xray.renderOrder = 2;
    this.mesh.add(xray);
    this.shadow = createBlobShadow(BALL.radius * 1.2, 0.45);
    this.syncFromBody();
    this.snapshot();
  }

  /** Store the current state as the interpolation start for the next step. */
  snapshot(): void {
    this.prevPosition.copy(this.position);
    this.prevRotation.copy(this.rotation);
  }

  syncFromBody(): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    const v = this.body.linvel();
    this.position.set(t.x, t.y, t.z);
    this.rotation.set(r.x, r.y, r.z, r.w);
    this.velocity.set(v.x, v.y, v.z);
  }

  setVelocity(x: number, y: number, z: number): void {
    this.body.setLinvel({ x, y, z }, true);
    this.velocity.set(x, y, z);
  }

  setAngularVelocity(x: number, y: number, z: number): void {
    this.body.setAngvel({ x, y, z }, true);
  }

  resetTo(spawn: SpawnPoint): void {
    this.body.setTranslation({ x: spawn.x, y: spawn.y, z: spawn.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.syncFromBody();
    // Avoid interpolating a streak across the teleport.
    this.snapshot();
  }

  render(alpha: number): void {
    this.mesh.position.lerpVectors(this.prevPosition, this.position, alpha);
    this.mesh.quaternion.slerpQuaternions(this.prevRotation, this.rotation, alpha);
    this.shadow.position.set(this.mesh.position.x, 0.02, this.mesh.position.z);
    // Shadow shrinks and fades with height: a cheap but strong depth cue.
    const height = Math.max(0, this.mesh.position.y - BALL.radius);
    const s = 1 / (1 + height * 0.35);
    this.shadow.scale.set(s, s, s);
  }
}

/**
 * Low-poly football: an icosphere whose faces near the 12 icosahedron vertices
 * are painted dark, giving the classic pentagon pattern with no texture.
 * Rotation is clearly visible, which helps sell rolling.
 */
function createBallGeometry(radius: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, 2);
  const base = new THREE.IcosahedronGeometry(1, 0);
  const basePositions = base.getAttribute('position');
  const corners: THREE.Vector3[] = [];
  for (let i = 0; i < basePositions.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(basePositions, i).normalize();
    if (!corners.some((c) => c.distanceToSquared(v) < 1e-6)) corners.push(v);
  }
  base.dispose();

  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const threshold = Math.cos((21 * Math.PI) / 180);
  const dark = new THREE.Color(0x1d1f24);
  const light = new THREE.Color(0xf7f7f2);
  // IcosahedronGeometry is non-indexed: every 3 vertices form one face.
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    centroid.copy(a).add(b).add(c).normalize();
    const isPatch = corners.some((corner) => corner.dot(centroid) > threshold);
    const color = isPatch ? dark : light;
    for (let k = 0; k < 3; k++) color.toArray(colors, (i + k) * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
