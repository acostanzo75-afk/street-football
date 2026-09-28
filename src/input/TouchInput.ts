import type { MobileControls } from '../ui/MobileControls';

/** Fraction of the joystick radius treated as "no input". */
const DEAD_ZONE = 0.12;

/**
 * Pointer-event handling for the on-screen joystick and SHOOT button.
 *
 * Each control tracks its own pointerId, so the joystick and the button work
 * simultaneously with two thumbs. Visuals are delegated to MobileControls.
 */
export class TouchInput {
  private joystickPointer: number | null = null;
  private originX = 0;
  private originY = 0;
  private radius = 1;
  private moveX = 0;
  private moveY = 0;
  private shootQueued = false;

  constructor(private readonly controls: MobileControls) {
    const zone = controls.joystickZone;
    zone.addEventListener('pointerdown', this.onJoystickDown);
    zone.addEventListener('pointermove', this.onJoystickMove);
    zone.addEventListener('pointerup', this.onJoystickUp);
    zone.addEventListener('pointercancel', this.onJoystickUp);
    zone.addEventListener('lostpointercapture', this.onJoystickUp);

    const button = controls.shootButton;
    button.addEventListener('pointerdown', this.onShootDown);
    button.addEventListener('pointerup', this.onShootUp);
    button.addEventListener('pointercancel', this.onShootUp);
    button.addEventListener('lostpointercapture', this.onShootUp);
  }

  isJoystickActive(): boolean {
    return this.joystickPointer !== null;
  }

  /** Screen-relative move vector (x = right, y = up/forward), magnitude 0..1. */
  readMove(out: { x: number; y: number }): void {
    out.x = this.moveX;
    out.y = this.moveY;
  }

  consumeShoot(): boolean {
    const queued = this.shootQueued;
    this.shootQueued = false;
    return queued;
  }

  private readonly onJoystickDown = (e: PointerEvent): void => {
    if (this.joystickPointer !== null) return;
    e.preventDefault();
    this.joystickPointer = e.pointerId;
    this.controls.joystickZone.setPointerCapture(e.pointerId);
    // Floating joystick: it appears under the thumb wherever it lands.
    const placed = this.controls.placeJoystick(e.clientX, e.clientY);
    this.originX = placed.x;
    this.originY = placed.y;
    this.radius = placed.radius;
    this.updateStick(e.clientX, e.clientY);
  };

  private readonly onJoystickMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.joystickPointer) return;
    e.preventDefault();
    this.updateStick(e.clientX, e.clientY);
  };

  private readonly onJoystickUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.joystickPointer) return;
    this.joystickPointer = null;
    this.moveX = 0;
    this.moveY = 0;
    this.controls.releaseJoystick();
  };

  private updateStick(clientX: number, clientY: number): void {
    let dx = (clientX - this.originX) / this.radius;
    let dy = (clientY - this.originY) / this.radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    this.controls.setKnob(dx, dy);

    const clamped = Math.min(1, len);
    if (clamped < DEAD_ZONE) {
      this.moveX = 0;
      this.moveY = 0;
      return;
    }
    // Rescale so output ramps from 0 at the dead zone edge to 1 at the rim.
    const scaled = (clamped - DEAD_ZONE) / (1 - DEAD_ZONE);
    const nx = dx / (clamped || 1);
    const ny = dy / (clamped || 1);
    this.moveX = nx * scaled;
    // Screen Y grows downward; forward is up.
    this.moveY = -ny * scaled;
  }

  private readonly onShootDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.controls.shootButton.setPointerCapture(e.pointerId);
    this.shootQueued = true;
    this.controls.setShootPressed(true);
  };

  private readonly onShootUp = (): void => {
    this.controls.setShootPressed(false);
  };
}
