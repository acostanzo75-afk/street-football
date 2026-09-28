/**
 * Central art-direction palette. Every colour in the scene comes from here.
 *
 * Rules of the palette:
 * - Structure (cage, boards, rooftop, skyline) stays desaturated navy/slate/warm grey.
 * - Saturated accents are reserved for gameplay: teams, goals, ball, UI.
 * - Golden-hour lighting: warm key from the low sun, cool fill from the sky.
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
    key: 0xffd9b0,
    keyIntensity: 2.4,
    fillSky: 0xb8c8ff,
    fillGround: 0x6a4a52,
    fillIntensity: 1.25,
  },

  pitch: {
    turf: '#3b9a63',
    turfStripe: '#43a86c',
    turfWorn: '#6fae6a',
    line: 'rgba(255, 255, 255, 0.92)',
    runoff: 0xc4553f,
    runoffDark: 0x9c3f33,
  },

  structure: {
    rooftop: 0x6d6778,
    rooftopDark: 0x57526a,
    parapet: 0x4a4560,
    steel: 0x262c3d,
    steelLight: 0x3a4259,
    fence: 0x8a93b3,
    boardFace: 0x1e2742,
    rail: 0xffc53d,
    prop: 0x8a86a0,
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
    skin: 0xc98a62,
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

  goalFrame: 0xf6f6f2,
  outline: 0x10131f,
  rim: 0xfff0dc,
} as const;
