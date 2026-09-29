/**
 * Central art-direction palette. Every colour in the scene comes from here.
 *
 * Rules of the palette:
 * - Structure (cage, boards, rooftop, skyline) stays desaturated navy/slate/warm grey.
 * - Saturated accents are reserved for gameplay: teams, goals, ball, UI.
 * - Golden-hour lighting: warm sun key, sky-tinted ambient from the baked
 *   environment map, warm ground bounce.
 */
export const THEME = {
  sky: {
    top: 0x2b3a78,
    middle: 0x8e7bb8,
    horizon: 0xffb88a,
    sunGlow: 0xffe2b0,
  },
  fog: { color: 0xc99aa6, near: 40, far: 120 },

  light: {
    key: 0xffd2a4,
    keyIntensity: 3.2,
    environmentIntensity: 1.15,
    bounce: 0x8a5a55,
    exposure: 1.05,
  },

  pitch: {
    turf: '#348655',
    turfStripe: '#3a915d',
    turfWorn: '#6fae6a',
    line: 'rgba(255, 255, 255, 0.92)',
    runoff: 0xc4553f,
    runoffDark: 0x9c3f33,
  },

  structure: {
    rooftop: 0x9a93a6,
    rooftopDark: 0x7d768c,
    parapet: 0x6e6784,
    steel: 0x262c3d,
    steelLight: 0x3a4259,
    fence: 0x8a93b3,
    boardFace: 0x1e2742,
    rail: 0xffc53d,
    prop: 0xa9a4bd,
    propDark: 0x5f5b78,
    lampGlow: 0xfff1c8,
  },

  skyline: {
    near: 0x6c6391,
    far: 0x8a7fa6,
    window: 0xffd79a,
  },

  teams: {
    home: { primary: 0x2e6bff, secondary: 0xffd23f, shorts: 0x14203d, css: '#2e6bff' },
    away: { primary: 0xff4d5e, secondary: 0xffffff, shorts: 0x2a1420, css: '#ff4d5e' },
  },

  character: {
    skin: 0xc08a6c,
    hair: 0x2a1a14,
    shoe: 0xf4f4f0,
    sole: 0x1a1d29,
    sock: 0xf4f4f0,
    eye: 0x141824,
  },

  ball: {
    base: 0xfafaf6,
    panel: 0x1c2340,
    accent: 0xffc53d,
  },

  decor: {
    bulb: 0xffc98a,
    neonPink: 0xff4fa3,
    neonCyan: 0x42e8e0,
    cone: 0xff7a2f,
    foliage: 0x4f8f4a,
    foliageDark: 0x3a6e3d,
    wood: 0x8a5a3c,
    cloudTop: 0xffe6d2,
    cloudBottom: 0xb48fb4,
    hills: 0x8a7aa6,
    bird: 0x2a2440,
  },

  goalFrame: 0xf6f6f2,
} as const;
