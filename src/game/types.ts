export type TeamId = 'home' | 'away';

export interface Score {
  home: number;
  away: number;
}

/**
 * One tick of intent for a single player, in WORLD space.
 * This is the shape that will later be sent client → server, so it must stay
 * small, serialisable and free of camera/rendering concepts.
 */
export interface PlayerCommand {
  /** Desired horizontal movement direction, magnitude 0..1. */
  moveX: number;
  moveZ: number;
  /** True on the tick the shoot button was pressed (edge, not held). */
  shoot: boolean;
}

export function createPlayerCommand(): PlayerCommand {
  return { moveX: 0, moveZ: 0, shoot: false };
}

export function otherTeam(team: TeamId): TeamId {
  return team === 'home' ? 'away' : 'home';
}
