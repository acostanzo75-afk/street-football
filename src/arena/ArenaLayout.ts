import { ARENA, BALL, GOAL, PLAYER } from '../game/config';
import type { TeamId } from '../game/types';

/** Axis-aligned box used as a goal trigger volume. */
export interface Box3Data {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface GoalDefinition {
  /** Team that defends this goal (the other team scores into it). */
  defendedBy: TeamId;
  /** Z of the goal line. */
  lineZ: number;
  /** +1 if the goal extends toward +Z beyond its line, -1 toward -Z. */
  outwardSign: 1 | -1;
  /** Centre of the goal mouth, used for shot assistance. */
  centerX: number;
  centerY: number;
  /** Ball centre must be inside this box: i.e. the ball has fully crossed the line. */
  trigger: Box3Data;
}

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Pure data description of the arena: no Three.js, no Rapier.
 * Match rules (and later the server) depend on this, never on the visuals.
 */
export interface ArenaLayout {
  halfWidth: number;
  halfLength: number;
  goals: Record<TeamId, GoalDefinition>;
  playerSpawn: Record<TeamId, SpawnPoint>;
  ballSpawn: SpawnPoint;
}

function createGoal(defendedBy: TeamId, outwardSign: 1 | -1): GoalDefinition {
  const lineZ = (ARENA.length / 2) * outwardSign;
  const backZ = lineZ + GOAL.depth * outwardSign;
  // The whole ball must be past the line, so the trigger starts one radius in.
  const innerZ = lineZ + BALL.radius * outwardSign;
  return {
    defendedBy,
    lineZ,
    outwardSign,
    centerX: 0,
    centerY: GOAL.height * 0.45,
    trigger: {
      minX: -GOAL.width / 2,
      maxX: GOAL.width / 2,
      minY: -1,
      maxY: GOAL.height,
      minZ: Math.min(innerZ, backZ),
      maxZ: Math.max(innerZ, backZ),
    },
  };
}

export function createArenaLayout(): ArenaLayout {
  const playerY = PLAYER.capsuleHalfHeight + PLAYER.radius + 0.02;
  return {
    halfWidth: ARENA.width / 2,
    halfLength: ARENA.length / 2,
    goals: {
      // Home attacks -Z, so the goal at -Z is defended by away.
      away: createGoal('away', -1),
      home: createGoal('home', 1),
    },
    playerSpawn: {
      home: { x: PLAYER.spawn.x, y: playerY, z: PLAYER.spawn.z },
      away: { x: PLAYER.spawn.x, y: playerY, z: -PLAYER.spawn.z },
    },
    ballSpawn: { ...BALL.spawn },
  };
}

export function isInsideBox(box: Box3Data, x: number, y: number, z: number): boolean {
  return (
    x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY && z >= box.minZ && z <= box.maxZ
  );
}
