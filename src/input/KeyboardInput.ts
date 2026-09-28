/**
 * Desktop development controls: WASD / arrows to move, Space to shoot.
 * Produces screen-relative intent (x = right, y = forward).
 */
export class KeyboardInput {
  private readonly pressed = new Set<string>();
  private shootQueued = false;

  constructor(target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    // Losing focus while a key is held would otherwise leave it stuck.
    target.addEventListener('blur', () => this.pressed.clear());
  }

  /** Screen-relative move vector, each axis -1..1. */
  readMove(out: { x: number; y: number }): void {
    const p = this.pressed;
    out.x = (p.has('KeyD') || p.has('ArrowRight') ? 1 : 0) - (p.has('KeyA') || p.has('ArrowLeft') ? 1 : 0);
    out.y = (p.has('KeyW') || p.has('ArrowUp') ? 1 : 0) - (p.has('KeyS') || p.has('ArrowDown') ? 1 : 0);
  }

  consumeShoot(): boolean {
    const queued = this.shootQueued;
    this.shootQueued = false;
    return queued;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Space') {
      if (!e.repeat) this.shootQueued = true;
      e.preventDefault();
      return;
    }
    if (e.code.startsWith('Arrow')) e.preventDefault();
    this.pressed.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.pressed.delete(e.code);
  };
}
