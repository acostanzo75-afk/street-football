/**
 * Render quality presets. Picked automatically at startup (phones start on
 * medium, capable desktops on high) and overridable with `?quality=low|medium|high`.
 *
 * Every expensive visual feature is gated here so the game stays at 60 fps on
 * phones while desktops get the full look.
 */
export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualitySettings {
  level: QualityLevel;
  /** Upper bound for devicePixelRatio. Dynamic resolution may go lower. */
  maxPixelRatio: number;
  /** Lowest pixel ratio dynamic resolution may drop to. */
  minPixelRatio: number;
  antialias: boolean;
  /** 0 = no real-time shadows (blob shadows only). */
  shadowMapSize: number;
  /** Bloom + colour grade post stack. */
  postProcessing: boolean;
  /** Extra ambient props, clouds, birds. */
  decorDensity: number;
}

const PRESETS: Record<QualityLevel, Omit<QualitySettings, 'level'>> = {
  low: { maxPixelRatio: 1.25, minPixelRatio: 0.75, antialias: false, shadowMapSize: 0, postProcessing: false, decorDensity: 0.5 },
  medium: { maxPixelRatio: 2, minPixelRatio: 1, antialias: false, shadowMapSize: 1024, postProcessing: false, decorDensity: 1 },
  high: { maxPixelRatio: 2, minPixelRatio: 1, antialias: true, shadowMapSize: 2048, postProcessing: true, decorDensity: 1 },
};

const STORAGE_KEY = 'sf.quality';

function detectLevel(): QualityLevel {
  const coarse = window.matchMedia('(any-pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  if (coarse) return cores <= 4 ? 'low' : 'medium';
  return cores <= 2 ? 'medium' : 'high';
}

function isLevel(value: string | null): value is QualityLevel {
  return value === 'low' || value === 'medium' || value === 'high';
}

/** URL override > saved choice > device heuristic. */
export function resolveQuality(): QualitySettings {
  const fromUrl = new URLSearchParams(window.location.search).get('quality');
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); fall back to detection.
  }
  const level = isLevel(fromUrl) ? fromUrl : isLevel(saved) ? saved : detectLevel();
  return { level, ...PRESETS[level] };
}
