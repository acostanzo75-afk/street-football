/**
 * All gameplay tuning lives here so feel can be iterated without touching logic.
 * Units: metres, seconds, radians, m/s.
 *
 * World axes: +Y is up. The pitch length runs along Z, width along X.
 * The home team (the local player) attacks the goal at -Z.
 */

export const PHYSICS = {
  /** Fixed simulation step. Physics never runs at display framerate. */
  fixedTimeStep: 1 / 60,
  /** Cap on catch-up steps per frame so a slow frame can't spiral. */
  maxStepsPerFrame: 5,
  /** Slightly stronger than earth gravity: snappier, more arcade ball flight. */
  gravity: -13,
} as const;

export const RENDER = {
  /** Mobile GPUs choke on 3x DPR; 2 keeps things sharp enough. */
  maxPixelRatio: 2,
  fov: 58,
  near: 0.1,
  far: 160,
} as const;

export const ARENA = {
  /** Playable width along X. */
  width: 16,
  /** Playable length along Z (goal line to goal line). */
  length: 28,
  /** Visible board height around the pitch. */
  boardHeight: 0.9,
  /** Invisible collider height of the walls (keeps lofted balls in play). */
  wallColliderHeight: 6,
  /** Invisible ceiling height. */
  ceilingHeight: 7,
  wallThickness: 0.5,
  wallRestitution: 0.6,
  wallFriction: 0.3,
  floorFriction: 0.9,
  floorRestitution: 0.45,
} as const;

export const GOAL = {
  width: 4,
  height: 2,
  depth: 1.4,
  postRadius: 0.07,
} as const;

export const PLAYER = {
  /** Capsule collider radius. */
  radius: 0.4,
  /** Capsule half-height of the cylindrical section (total height = 2*(halfHeight+radius)). */
  capsuleHalfHeight: 0.5,
  mass: 75,
  /** Top running speed. */
  maxSpeed: 7.5,
  /** Speed gained per second while the stick is held. */
  acceleration: 38,
  /** Speed lost per second once the stick is released (the "friction"). */
  deceleration: 30,
  /**
   * Extra acceleration multiplier when the input points away from current velocity,
   * so direction changes stay snappy instead of drifting.
   */
  turnBoost: 1.8,
  /** How fast the body faces its movement direction (rad/s). */
  turnSpeed: 14,
  /** Stick magnitude below which the player is considered idle. */
  inputDeadZone: 0.08,
  spawn: { x: 0, z: 4.5 },
} as const;

export const BALL = {
  /** Slightly larger than a real ball for readability on small screens. */
  radius: 0.24,
  mass: 0.45,
  restitution: 0.55,
  friction: 0.6,
  /** Rapier has no rolling resistance, so damping stands in for it. */
  linearDamping: 0.45,
  angularDamping: 0.8,
  spawn: { x: 0, y: 0.6, z: 0 },
  /** Below this height the ball is considered lost and is reset (safety net). */
  lostBelowY: -3,
} as const;

/** Light dribbling assistance: the ball is nudged, never attached. */
export const DRIBBLE = {
  /** Max horizontal distance (player centre to ball centre) for assistance. */
  controlRadius: 1.5,
  /** Cosine of the half-angle of the cone in front of the player that can control. */
  controlConeCos: Math.cos((70 * Math.PI) / 180),
  /** Ball must be roughly on the ground to be controlled. */
  maxControlHeight: 0.6,
  /** Where the ball "wants" to sit, measured from player centre along facing. */
  carryDistance: 0.95,
  /** Spring pulling the ball toward the carry point (1/s). */
  carrySpring: 6,
  /** How strongly ball velocity is blended toward the desired velocity (1/s). */
  controlStrength: 9,
  /** Ball speed cap while under assisted control. */
  maxControlledBallSpeed: 8.5,
  /** Player must be moving at least this fast for assistance to engage. */
  minPlayerSpeed: 0.6,
  /** After a shot, assistance is disabled so it can't swallow the kick. */
  lockoutAfterShot: 0.4,
} as const;

export const SHOOT = {
  /** Max horizontal distance (player centre to ball centre) for a kick. */
  range: 1.55,
  /** Forgiving cone: ball may be slightly to the side of the player. */
  coneCos: Math.cos((100 * Math.PI) / 180),
  maxBallHeight: 1.2,
  /** Horizontal launch speed at full power. */
  speed: 19,
  /** Vertical launch speed at full power. */
  lift: 3.2,
  /** Fixed power for now; variable power will feed this 0..1 value later. */
  defaultPower: 1,
  cooldown: 0.35,
  /** A press is remembered this long so slightly early taps still kick. */
  inputBuffer: 0.15,
  /** 0 = pure facing direction, 1 = straight at goal centre. */
  goalAssist: 0.3,
  /** Assist only applies when facing within this cone of the goal. */
  goalAssistConeCos: Math.cos((55 * Math.PI) / 180),
} as const;

export const CAMERA = {
  distance: 7.4,
  height: 5.0,
  /** Extra pull-back per metre of player-ball separation (keeps the ball in frame). */
  distancePerBallMetre: 0.12,
  maxExtraDistance: 2.2,
  /** Point looked at, above the player's feet. */
  lookHeight: 1.0,
  /** Look this far ahead of the player along camera forward. */
  lookAhead: 4.0,
  /** Fraction of player→ball offset added to the look target. */
  ballFocus: 0.35,
  maxBallFocusOffset: 4,
  /** Fraction of the ball's angular offset the camera yaw follows. */
  ballYawWeight: 0.45,
  /** Max yaw deviation from the attacking direction (keeps controls predictable). */
  maxYawOffset: (32 * Math.PI) / 180,
  /** Exponential smoothing rates (1/s). Higher = tighter follow. */
  positionDamping: 7,
  lookDamping: 9,
  yawDamping: 2.2,
} as const;

export const MATCH = {
  winningScore: 3,
  durationSeconds: 180,
  /** Time the GOAL message shows before positions reset. */
  goalResetDelay: 1.8,
  /** Time the result shows before a fresh match starts. */
  matchEndDelay: 3.2,
} as const;

export const TEAM_COLORS = {
  home: 0x2f7cf6,
  away: 0xe5484d,
} as const;
