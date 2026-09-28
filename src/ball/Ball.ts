import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { BALL } from '../game/config';
import type { SpawnPoint } from '../arena/ArenaLayout';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { BallView } from './BallView';

/**
 * The football: a Rapier dynamic body plus its visual (BallView).
 *
 * Simulation state (`position`, `rotation`) is read back from the body after
 * every fixed step. The view is only ever driven by `render(alpha)`, which
 * interpolates between the previous and current fixed-step states.
 */
export class Ball {
  readonly body: RAPIER.RigidBody;
  readonly view = new BallView();
  /** Interpolated position used by presentation (camera, view). */
  readonly renderPosition = new THREE.Vector3();

  /** Current simulation state (read-only for other systems). */
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly rotation = new THREE.Quaternion();

  private readonly prevPosition = new THREE.Vector3();
  private readonly prevRotation = new THREE.Quaternion();
  private readonly renderRotation = new THREE.Quaternion();

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
    this.renderPosition.lerpVectors(this.prevPosition, this.position, alpha);
    this.renderRotation.slerpQuaternions(this.prevRotation, this.rotation, alpha);
    this.view.update(this.renderPosition, this.renderRotation);
  }
}
