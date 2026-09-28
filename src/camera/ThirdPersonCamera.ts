import * as THREE from 'three';
import { CAMERA } from '../game/config';
import { clamp, dampAngle, dampFactor, wrapAngle } from '../game/math';

/**
 * Automatic third-person camera. No manual control: on a phone both thumbs are busy.
 *
 * Yaw is anchored to the attacking direction and only partially follows the
 * ball (clamped). This matters because movement input is camera-relative:
 * if the camera followed the player's own heading, holding "right" would make
 * the camera turn, which would turn "right", and the player would run in circles.
 */
export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;

  private yaw: number;
  private readonly position = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredLook = new THREE.Vector3();
  private initialised = false;
  /** Seconds left of the kickoff fly-in. */
  private introRemaining = 0;

  /**
   * @param attackYaw yaw pointing from own goal toward the goal being attacked.
   */
  constructor(
    camera: THREE.PerspectiveCamera,
    private readonly attackYaw: number,
  ) {
    this.camera = camera;
    this.yaw = attackYaw;
  }

  /** Yaw of the camera's horizontal forward vector (yaw 0 = +Z). */
  getYaw(): number {
    return this.yaw;
  }

  /** Presentation-only kickoff sweep: starts high and orbited, settles behind the player. */
  playIntro(): void {
    this.introRemaining = CAMERA.introDuration;
    this.initialised = false;
  }

  /** Jump straight to the target framing (e.g. after a kickoff reset). */
  snap(): void {
    this.initialised = false;
  }

  update(dt: number, player: THREE.Vector3, ball: THREE.Vector3): void {
    const toBallX = ball.x - player.x;
    const toBallZ = ball.z - player.z;
    const ballDist = Math.hypot(toBallX, toBallZ);

    // Yaw: attacking direction, bent partly toward the ball when it's ahead.
    let targetYaw = this.attackYaw;
    if (ballDist > 0.75) {
      const offset = wrapAngle(Math.atan2(toBallX, toBallZ) - this.attackYaw);
      if (Math.abs(offset) < Math.PI / 2) {
        targetYaw += clamp(offset * CAMERA.ballYawWeight, -CAMERA.maxYawOffset, CAMERA.maxYawOffset);
      }
    }

    // Intro: 1 at the start of the sweep, easing to 0.
    let intro = 0;
    if (this.introRemaining > 0) {
      this.introRemaining = Math.max(0, this.introRemaining - dt);
      const t = this.introRemaining / CAMERA.introDuration;
      intro = t * t * (3 - 2 * t);
    }

    const baseYaw = this.initialised ? this.yaw : targetYaw;
    const orbitYaw = baseYaw + intro * CAMERA.introOrbit;
    const fx = Math.sin(orbitYaw);
    const fz = Math.cos(orbitYaw);

    // Pull back a little when the ball is far so both stay in frame.
    const distance =
      CAMERA.distance +
      Math.min(ballDist * CAMERA.distancePerBallMetre, CAMERA.maxExtraDistance) +
      intro * CAMERA.introExtraDistance;
    const height = CAMERA.height + intro * CAMERA.introExtraHeight;
    this.desiredPosition.set(player.x - fx * distance, height, player.z - fz * distance);

    // Look ahead of the player, nudged toward the ball.
    const focusScale = ballDist > 0 ? Math.min(CAMERA.ballFocus, CAMERA.maxBallFocusOffset / ballDist) : 0;
    this.desiredLook.set(
      player.x + fx * CAMERA.lookAhead + toBallX * focusScale,
      CAMERA.lookHeight,
      player.z + fz * CAMERA.lookAhead + toBallZ * focusScale,
    );

    if (!this.initialised || intro > 0) {
      // Snap (and follow the intro path exactly) instead of damping toward it.
      if (!this.initialised) this.yaw = targetYaw;
      this.position.copy(this.desiredPosition);
      this.lookTarget.copy(this.desiredLook);
      this.initialised = true;
    } else {
      this.yaw = dampAngle(this.yaw, targetYaw, CAMERA.yawDamping, dt);
      this.position.lerp(this.desiredPosition, dampFactor(CAMERA.positionDamping, dt));
      this.lookTarget.lerp(this.desiredLook, dampFactor(CAMERA.lookDamping, dt));
    }

    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookTarget);
  }
}
