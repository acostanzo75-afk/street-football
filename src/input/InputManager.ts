import type { PlayerCommand } from '../game/types';
import type { KeyboardInput } from './KeyboardInput';
import type { TouchInput } from './TouchInput';

/**
 * Merges all local input sources and converts screen-relative intent into a
 * world-space PlayerCommand using the camera's yaw.
 *
 * Only the resulting PlayerCommand crosses into the simulation, so the same
 * command can later be sent over the network unchanged.
 */
export class InputManager {
  private readonly move = { x: 0, y: 0 };

  constructor(
    private readonly keyboard: KeyboardInput,
    private readonly touch: TouchInput,
  ) {}

  /**
   * @param cameraYaw yaw of the camera's horizontal forward (yaw 0 = +Z).
   */
  sample(cameraYaw: number, out: PlayerCommand): void {
    if (this.touch.isJoystickActive()) this.touch.readMove(this.move);
    else this.keyboard.readMove(this.move);

    let { x, y } = this.move;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }

    // Camera basis on the ground plane.
    const forwardX = Math.sin(cameraYaw);
    const forwardZ = Math.cos(cameraYaw);
    const rightX = -forwardZ;
    const rightZ = forwardX;
    out.moveX = rightX * x + forwardX * y;
    out.moveZ = rightZ * x + forwardZ * y;

    // Both sources are consumed every frame so neither keeps a stale press.
    // OR-ing keeps a press the simulation hasn't consumed yet; the fixed step clears it.
    const touchShoot = this.touch.consumeShoot();
    const keyShoot = this.keyboard.consumeShoot();
    out.shoot = out.shoot || touchShoot || keyShoot;
  }
}
