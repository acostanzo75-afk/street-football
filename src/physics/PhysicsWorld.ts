import RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS } from '../game/config';

export type Rapier = typeof RAPIER;

/**
 * Owns the Rapier world and the fixed-timestep accumulator.
 *
 * The simulation always advances in `PHYSICS.fixedTimeStep` increments,
 * independent of display refresh rate. Rendering interpolates between the
 * last two simulation states using the returned `alpha`.
 */
export class PhysicsWorld {
  readonly rapier: Rapier;
  readonly world: RAPIER.World;
  readonly fixedDt: number = PHYSICS.fixedTimeStep;

  private accumulator = 0;

  private constructor(rapier: Rapier) {
    this.rapier = rapier;
    this.world = new rapier.World({ x: 0, y: PHYSICS.gravity, z: 0 });
    this.world.timestep = this.fixedDt;
  }

  /** Rapier ships as WASM and must be initialised before any world is created. */
  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld(RAPIER);
  }

  /**
   * Runs as many fixed steps as the elapsed frame time allows.
   * `onStep` runs game logic before each world step.
   * `afterStep` runs after it (read back body state, detect goals).
   * Returns the interpolation factor (0..1) for rendering.
   */
  advance(frameDt: number, onStep: (dt: number) => void, afterStep: (dt: number) => void): number {
    this.accumulator += frameDt;
    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < PHYSICS.maxStepsPerFrame) {
      onStep(this.fixedDt);
      this.world.step();
      afterStep(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps++;
    }
    // Drop time we could not simulate rather than trying to catch up later.
    if (steps === PHYSICS.maxStepsPerFrame) this.accumulator = 0;
    return this.accumulator / this.fixedDt;
  }
}
