import { PLAYER, type BotTuning } from '../game/config';
import { clamp, wrapAngle } from '../game/math';
import type { PlayerCommand } from '../game/types';
import type { GoalDefinition } from '../arena/ArenaLayout';

/** Plain-data snapshot of what the bot is allowed to know each tick. */
export interface BotWorld {
  selfX: number;
  selfZ: number;
  /** Facing yaw of the bot (yaw 0 = +Z). */
  selfFacing: number;
  opponentX: number;
  opponentZ: number;
  ballX: number;
  ballZ: number;
  ballVX: number;
  ballVZ: number;
  /** Dribble assistance is currently acting for the bot / for the opponent. */
  selfHasBall: boolean;
  opponentHasBall: boolean;
  attackGoal: GoalDefinition;
  ownGoal: GoalDefinition;
  halfWidth: number;
  halfLength: number;
}

type Mode = 'attack' | 'chase' | 'defend';

/** Keep targets this far inside the walls so the bot doesn't grind along them. */
const WALL_MARGIN = 0.7;
/** How far behind the ball (away from the target goal) the bot lines up when chasing. */
const APPROACH_BEHIND = 0.75;
/** Goal-side standoff when shadowing a ball carrier far from goal. */
const SHADOW_DISTANCE = 2.6;
/** Direction smoothing rate (rad/s) so the bot doesn't jitter between targets. */
const STEER_RATE = 9;

/**
 * Opponent AI. Produces exactly the same PlayerCommand a human would, so it
 * plays by the same movement, dribble and shooting rules (and could run on a
 * server). Decisions are re-evaluated every `thinkInterval` seconds, which is
 * the main difficulty knob together with speed, aim error and shot range.
 *
 * Modes:
 * - attack: carries the ball toward a chosen spot in the goal, side-steps the
 *   opponent, shoots when in range and facing the goal (or when pressured).
 * - chase: loose ball; runs to a point behind the (predicted) ball so it
 *   arrives already facing its target.
 * - defend: opponent has the ball; stays goal-side and presses when the
 *   carrier gets dangerous.
 */
export class BotBrain {
  private mode: Mode = 'chase';
  private thinkTimer = 0;
  private targetX = 0;
  private targetZ = 0;
  private speedFactor = 1;
  private wantShoot = false;
  private steerYaw: number;
  /** Where in the goal mouth the bot is aiming this possession (x offset). */
  private aimX = 0;
  private hadBall = false;
  private seed: number;

  constructor(
    private readonly tuning: BotTuning,
    initialYaw: number,
    seed = 1234,
  ) {
    this.steerYaw = initialYaw;
    this.seed = seed;
  }

  reset(yaw: number): void {
    this.mode = 'chase';
    this.thinkTimer = 0;
    this.wantShoot = false;
    this.hadBall = false;
    this.steerYaw = yaw;
  }

  update(dt: number, w: BotWorld, out: PlayerCommand): void {
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.think(w);
      this.thinkTimer = this.tuning.thinkInterval;
    }

    // Steer toward the current target with a limited turn rate.
    const dx = this.targetX - w.selfX;
    const dz = this.targetZ - w.selfZ;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.15) {
      const desired = Math.atan2(dx, dz);
      const diff = wrapAngle(desired - this.steerYaw);
      const maxTurn = STEER_RATE * dt;
      this.steerYaw = wrapAngle(this.steerYaw + clamp(diff, -maxTurn, maxTurn));
      // Ease off when arriving so it doesn't overshoot and orbit the target.
      const arrive = clamp(dist / 1.2, 0.25, 1);
      const magnitude = this.tuning.speed * this.speedFactor * arrive;
      out.moveX = Math.sin(this.steerYaw) * magnitude;
      out.moveZ = Math.cos(this.steerYaw) * magnitude;
    } else {
      out.moveX = 0;
      out.moveZ = 0;
    }

    if (this.wantShoot) {
      out.shoot = true;
      this.wantShoot = false;
    }
  }

  private think(w: BotWorld): void {
    const toBallX = w.ballX - w.selfX;
    const toBallZ = w.ballZ - w.selfZ;
    const ballDist = Math.hypot(toBallX, toBallZ);

    if (w.selfHasBall) this.mode = 'attack';
    else if (w.opponentHasBall) this.mode = 'defend';
    else this.mode = 'chase';

    if (this.mode === 'attack' && !this.hadBall) {
      // New possession: pick a spot in the goal, avoiding dead centre.
      const side = this.random() < 0.5 ? -1 : 1;
      this.aimX = w.attackGoal.centerX + side * (0.6 + this.random() * 0.9);
    }
    this.hadBall = this.mode === 'attack';

    switch (this.mode) {
      case 'attack':
        this.planAttack(w, ballDist);
        break;
      case 'defend':
        this.planDefend(w);
        break;
      case 'chase':
        this.planChase(w, ballDist);
        break;
    }
  }

  private planAttack(w: BotWorld, ballDist: number): void {
    const goalZ = w.attackGoal.lineZ;
    let tx = this.aimX;
    let tz = goalZ;

    // Side-step an opponent standing in the way.
    const toGoalX = tx - w.selfX;
    const toGoalZ = tz - w.selfZ;
    const goalDist = Math.hypot(toGoalX, toGoalZ);
    const ox = w.opponentX - w.selfX;
    const oz = w.opponentZ - w.selfZ;
    const oppDist = Math.hypot(ox, oz);
    if (oppDist < 3 && goalDist > 1e-3) {
      const ahead = (ox * toGoalX + oz * toGoalZ) / (oppDist * goalDist);
      if (ahead > 0.4) {
        // Perpendicular away from the opponent.
        const cross = toGoalX * oz - toGoalZ * ox;
        const side = cross > 0 ? 1 : -1;
        tx = w.selfX + (-toGoalZ / goalDist) * side * 3 + (toGoalX / goalDist) * 2;
        tz = w.selfZ + (toGoalX / goalDist) * side * 3 + (toGoalZ / goalDist) * 2;
      }
    }
    this.setTarget(w, tx, tz, 1, true);

    // Shoot when close enough and roughly facing the chosen spot, or when pressured nearby.
    const distToLine = Math.abs(goalZ - w.selfZ);
    const aimYaw = Math.atan2(this.aimX - w.selfX, goalZ - w.selfZ) + (this.random() - 0.5) * 2 * this.tuning.aimError;
    const facingError = Math.abs(wrapAngle(aimYaw - w.selfFacing));
    const inRange = distToLine < this.tuning.shootDistance;
    const pressured = oppDist < 1.6 && distToLine < this.tuning.shootDistance * 1.35;
    if (ballDist < 1.4 && ((inRange && facingError < 0.35) || (pressured && facingError < 0.7))) {
      this.wantShoot = true;
    }
  }

  private planDefend(w: BotWorld): void {
    const gx = w.ownGoal.centerX - w.ballX;
    const gz = w.ownGoal.lineZ - w.ballZ;
    const gDist = Math.hypot(gx, gz) || 1;
    const carrierToGoal = Math.abs(w.ownGoal.lineZ - w.opponentZ);
    // Press (go for the ball) once the carrier is dangerous; otherwise shadow goal-side.
    const press = carrierToGoal < this.tuning.pressDistance;
    const standoff = press ? 0.2 : SHADOW_DISTANCE;
    const lead = press ? 0.25 : 0.1;
    const tx = w.ballX + w.ballVX * lead + (gx / gDist) * standoff;
    const tz = w.ballZ + w.ballVZ * lead + (gz / gDist) * standoff;
    this.setTarget(w, tx, tz, press ? 1 : 0.85, false);
    // Poke the ball away if it's right there.
    if (press && Math.hypot(w.ballX - w.selfX, w.ballZ - w.selfZ) < 1.2) this.wantShoot = true;
  }

  private planChase(w: BotWorld, ballDist: number): void {
    // Predict where the ball will be when we get there.
    const eta = clamp(ballDist / (PLAYER.maxSpeed * this.tuning.speed), 0, 0.9);
    const px = w.ballX + w.ballVX * eta;
    const pz = w.ballZ + w.ballVZ * eta;

    // Line up behind the ball relative to the goal we attack.
    const gx = px - this.aimOrCentre(w);
    const gz = pz - w.attackGoal.lineZ;
    const gLen = Math.hypot(gx, gz) || 1;
    let tx = px + (gx / gLen) * APPROACH_BEHIND;
    let tz = pz + (gz / gLen) * APPROACH_BEHIND;

    // If we're on the wrong side of the ball, arc around it instead of through it.
    const selfToBallX = px - w.selfX;
    const selfToBallZ = pz - w.selfZ;
    const wrongSide = selfToBallX * (-gx / gLen) + selfToBallZ * (-gz / gLen) < 0;
    if (wrongSide && ballDist < 3) {
      const side = w.selfX < px ? -1 : 1;
      tx += side * 1.3;
    } else if (ballDist < 1.3) {
      // Close and correctly lined up: run straight through it.
      tx = px;
      tz = pz;
    }
    this.setTarget(w, tx, tz, 1, false);
  }

  private aimOrCentre(w: BotWorld): number {
    return this.hadBall ? this.aimX : w.attackGoal.centerX;
  }

  private setTarget(w: BotWorld, x: number, z: number, speed: number, allowGoal: boolean): void {
    const zLimit = allowGoal ? w.halfLength + 0.5 : w.halfLength - WALL_MARGIN;
    this.targetX = clamp(x, -w.halfWidth + WALL_MARGIN, w.halfWidth - WALL_MARGIN);
    this.targetZ = clamp(z, -zLimit, zLimit);
    this.speedFactor = speed;
  }

  /** Deterministic PRNG (mulberry32) so bot behaviour is reproducible. */
  private random(): number {
    this.seed = (this.seed + 0x6d2b79f5) >>> 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
