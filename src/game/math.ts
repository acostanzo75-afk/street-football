/** Small allocation-free helpers shared by simulation and presentation code. */

/** Frame-rate independent exponential smoothing factor for a given rate (1/s). */
export function dampFactor(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/** Wraps an angle to (-PI, PI]. */
export function wrapAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** Rotates `current` toward `target` by at most `maxDelta`, along the shortest arc. */
export function rotateTowards(current: number, target: number, maxDelta: number): number {
  const diff = wrapAngle(target - current);
  if (Math.abs(diff) <= maxDelta) return target;
  return wrapAngle(current + Math.sign(diff) * maxDelta);
}

/** Exponentially smooths an angle along the shortest arc. */
export function dampAngle(current: number, target: number, rate: number, dt: number): number {
  return wrapAngle(current + wrapAngle(target - current) * dampFactor(rate, dt));
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
