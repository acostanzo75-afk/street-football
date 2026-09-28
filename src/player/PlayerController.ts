import { PLAYER } from '../game/config';
import { rotateTowards } from '../game/math';
import type { PlayerCommand } from '../game/types';
import type { Player } from './Player';

/**
 * Turns a world-space PlayerCommand into player motion.
 *
 * Deterministic given (state, command, dt), which is what a server-side
 * simulation or client-side prediction will need later.
 */
export class PlayerController {
  constructor(private readonly player: Player) {}

  fixedUpdate(command: PlayerCommand, dt: number): void {
    const player = this.player;
    let ix = command.moveX;
    let iz = command.moveZ;
    let magnitude = Math.hypot(ix, iz);
    if (magnitude > 1) {
      ix /= magnitude;
      iz /= magnitude;
      magnitude = 1;
    }
    const hasInput = magnitude > PLAYER.inputDeadZone;

    const vx = player.velocity.x;
    const vz = player.velocity.z;
    let targetX = 0;
    let targetZ = 0;
    let rate: number = PLAYER.deceleration;

    if (hasInput) {
      targetX = ix * PLAYER.maxSpeed;
      targetZ = iz * PLAYER.maxSpeed;
      rate = PLAYER.acceleration;
      // Reversing or cutting sharply: brake harder so turns feel snappy.
      const speed = Math.hypot(vx, vz);
      if (speed > 0.5 && (vx * ix + vz * iz) / speed < 0.3) rate *= PLAYER.turnBoost;

      player.facing = rotateTowards(player.facing, Math.atan2(ix, iz), PLAYER.turnSpeed * dt);
    }

    // Move velocity toward target by at most rate*dt (constant accel, no overshoot).
    const dx = targetX - vx;
    const dz = targetZ - vz;
    const diff = Math.hypot(dx, dz);
    const maxDelta = rate * dt;
    if (diff <= maxDelta) {
      player.applyHorizontalVelocity(targetX, targetZ);
    } else {
      const k = maxDelta / diff;
      player.applyHorizontalVelocity(vx + dx * k, vz + dz * k);
    }
  }
}
