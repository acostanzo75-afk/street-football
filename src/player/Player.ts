import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { PLAYER } from '../game/config';
import { THEME } from '../render/theme';
import type { TeamId } from '../game/types';
import { wrapAngle } from '../game/math';
import type { SpawnPoint } from '../arena/ArenaLayout';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { PlayerView } from './PlayerView';

/** Distance from capsule centre to the soles of the feet. */
const CENTER_TO_FEET = PLAYER.capsuleHalfHeight + PLAYER.radius;

/**
 * Simulation-side player: physics body + gameplay state (facing, velocity).
 * All presentation lives in PlayerView; this class only forwards the
 * interpolated state to it.
 */
export class Player {
  readonly team: TeamId;
  readonly body: RAPIER.RigidBody;
  readonly view: PlayerView;

  /** Capsule centre, current fixed step. */
  readonly position = new THREE.Vector3();
  /** Horizontal velocity the controller is driving (y ignored). */
  readonly velocity = new THREE.Vector3();
  /** Facing yaw in radians; yaw 0 faces +Z. */
  facing = 0;

  private readonly prevPosition = new THREE.Vector3();
  private prevFacing = 0;
  private readonly renderPosition = new THREE.Vector3();

  constructor(physics: PhysicsWorld, team: TeamId, spawn: SpawnPoint, initialFacing: number) {
    const { rapier, world } = physics;
    this.team = team;
    this.facing = initialFacing;
    this.body = world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        // A capsule that can never rotate can never tip over.
        .lockRotations()
        // The player ignores the ball's mass: the ball can't shove or launch the player.
        .setDominanceGroup(1),
    );
    world.createCollider(
      rapier.ColliderDesc.capsule(PLAYER.capsuleHalfHeight, PLAYER.radius)
        .setMass(PLAYER.mass)
        // Zero friction so the player slides along walls instead of sticking.
        .setFriction(0)
        .setFrictionCombineRule(rapier.CoefficientCombineRule.Min)
        // Zero restitution against the ball: running into it pushes, not pings.
        .setRestitution(0)
        .setRestitutionCombineRule(rapier.CoefficientCombineRule.Min),
      this.body,
    );

    this.view = new PlayerView(THEME.teams[team]);
    this.syncFromBody();
    this.snapshot();
  }

  forwardX(): number {
    return Math.sin(this.facing);
  }

  forwardZ(): number {
    return Math.cos(this.facing);
  }

  horizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  snapshot(): void {
    this.prevPosition.copy(this.position);
    this.prevFacing = this.facing;
  }

  syncFromBody(): void {
    const t = this.body.translation();
    const v = this.body.linvel();
    this.position.set(t.x, t.y, t.z);
    // Read back so wall contacts bleed speed naturally.
    this.velocity.set(v.x, 0, v.z);
  }

  /** Drives the body horizontally while keeping gravity's vertical component. */
  applyHorizontalVelocity(x: number, z: number): void {
    const vy = this.body.linvel().y;
    this.body.setLinvel({ x, y: vy, z }, true);
    this.velocity.set(x, 0, z);
  }

  resetTo(spawn: SpawnPoint, facing: number): void {
    this.body.setTranslation({ x: spawn.x, y: spawn.y, z: spawn.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.facing = facing;
    this.syncFromBody();
    this.snapshot();
  }

  render(alpha: number, frameDt: number, dribbling: boolean): void {
    this.renderPosition.lerpVectors(this.prevPosition, this.position, alpha);
    this.renderPosition.y -= CENTER_TO_FEET;
    const yaw = this.prevFacing + wrapAngle(this.facing - this.prevFacing) * alpha;
    this.view.update(this.renderPosition, yaw, this.horizontalSpeed(), dribbling, frameDt);
  }
}
