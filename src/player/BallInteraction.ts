import { BALL, DRIBBLE, SHOOT } from '../game/config';
import type { GoalDefinition } from '../arena/ArenaLayout';
import type { Ball } from '../ball/Ball';
import type { Player } from './Player';

export interface ShotEvent {
  power: number;
}

/**
 * Arcade ball handling for one player: light dribble assistance and shooting.
 *
 * The ball is never attached. Dribbling blends the ball's velocity toward a
 * point just in front of the player; shooting sets a launch velocity.
 * Like PlayerController, this is pure simulation and deterministic.
 */
export class BallInteraction {
  private shootBuffer = 0;
  private cooldown = 0;
  private controlLockout = 0;
  private controlling = false;

  constructor(
    private readonly player: Player,
    private readonly ball: Ball,
    /** The goal this player attacks (used for gentle shot assistance). */
    private readonly targetGoal: GoalDefinition,
  ) {}

  /** Returns a ShotEvent on the step a kick happens, otherwise null. */
  fixedUpdate(shootPressed: boolean, dt: number): ShotEvent | null {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.controlLockout = Math.max(0, this.controlLockout - dt);
    this.shootBuffer = shootPressed ? SHOOT.inputBuffer : Math.max(0, this.shootBuffer - dt);

    if (this.shootBuffer > 0 && this.cooldown === 0 && this.tryShoot(SHOOT.defaultPower)) {
      return { power: SHOOT.defaultPower };
    }
    this.controlling = this.controlLockout === 0 && this.assistDribble(dt);
    return null;
  }

  /** True while dribble assistance is acting on the ball (read by presentation). */
  isControlling(): boolean {
    return this.controlling;
  }

  /** Clears transient timers, e.g. after a kickoff reset. */
  reset(): void {
    this.shootBuffer = 0;
    this.cooldown = 0;
    this.controlLockout = 0;
    this.controlling = false;
  }

  /** `power` is 0..1 so variable shot strength can be added without API changes. */
  private tryShoot(power: number): boolean {
    const { player, ball } = this;
    const dx = ball.position.x - player.position.x;
    const dz = ball.position.z - player.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > SHOOT.range || ball.position.y > SHOOT.maxBallHeight) return false;

    const fx = player.forwardX();
    const fz = player.forwardZ();
    if (dist > 1e-4 && (dx * fx + dz * fz) / dist < SHOOT.coneCos) return false;

    // Facing direction first; bend slightly toward goal if roughly aimed at it.
    let dirX = fx;
    let dirZ = fz;
    const gx = this.targetGoal.centerX - ball.position.x;
    const gz = this.targetGoal.lineZ - ball.position.z;
    const gLen = Math.hypot(gx, gz);
    if (gLen > 1e-4) {
      const toGoalX = gx / gLen;
      const toGoalZ = gz / gLen;
      if (fx * toGoalX + fz * toGoalZ > SHOOT.goalAssistConeCos) {
        dirX += (toGoalX - fx) * SHOOT.goalAssist;
        dirZ += (toGoalZ - fz) * SHOOT.goalAssist;
        const len = Math.hypot(dirX, dirZ);
        dirX /= len;
        dirZ /= len;
      }
    }

    const speed = SHOOT.speed * power;
    ball.setVelocity(dirX * speed, SHOOT.lift * power, dirZ * speed);
    // Topspin matching the direction of travel so the ball visibly rolls on landing.
    ball.setAngularVelocity(dirZ * (speed / BALL.radius), 0, -dirX * (speed / BALL.radius));

    this.shootBuffer = 0;
    this.cooldown = SHOOT.cooldown;
    this.controlLockout = DRIBBLE.lockoutAfterShot;
    return true;
  }

  /** Returns true if assistance was applied this step. */
  private assistDribble(dt: number): boolean {
    const { player, ball } = this;
    if (ball.position.y > DRIBBLE.maxControlHeight) return false;
    const playerSpeed = player.horizontalSpeed();
    if (playerSpeed < DRIBBLE.minPlayerSpeed) return false;

    const dx = ball.position.x - player.position.x;
    const dz = ball.position.z - player.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > DRIBBLE.controlRadius || dist < 1e-4) return false;

    const fx = player.forwardX();
    const fz = player.forwardZ();
    if ((dx * fx + dz * fz) / dist < DRIBBLE.controlConeCos) return false;

    // Desired ball velocity: match the player, plus a spring toward the carry point.
    const carryX = player.position.x + fx * DRIBBLE.carryDistance;
    const carryZ = player.position.z + fz * DRIBBLE.carryDistance;
    let desiredX = player.velocity.x + (carryX - ball.position.x) * DRIBBLE.carrySpring;
    let desiredZ = player.velocity.z + (carryZ - ball.position.z) * DRIBBLE.carrySpring;
    const desiredSpeed = Math.hypot(desiredX, desiredZ);
    if (desiredSpeed > DRIBBLE.maxControlledBallSpeed) {
      const k = DRIBBLE.maxControlledBallSpeed / desiredSpeed;
      desiredX *= k;
      desiredZ *= k;
    }

    // Closer ball = stronger influence, so control fades out at the edge.
    const falloff = 1 - dist / DRIBBLE.controlRadius;
    const blend = (1 - Math.exp(-DRIBBLE.controlStrength * dt)) * Math.min(1, falloff * 2);
    const vx = ball.velocity.x + (desiredX - ball.velocity.x) * blend;
    const vz = ball.velocity.z + (desiredZ - ball.velocity.z) * blend;
    ball.setVelocity(vx, ball.velocity.y, vz);
    // Keep the spin consistent with rolling so the ball doesn't skid visually.
    ball.setAngularVelocity(vz / BALL.radius, 0, -vx / BALL.radius);
    return true;
  }
}
