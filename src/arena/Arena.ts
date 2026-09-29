import * as THREE from 'three';
import { ARENA, GOAL } from '../game/config';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { Backdrop } from '../render/Backdrop';
import { THEME } from '../render/theme';
import type { ArenaLayout } from './ArenaLayout';
import { createNetTexture } from './pitchTexture';
import { createCageView } from './view/CageView';
import { createDecorView } from './view/DecorView';
import { createGoalView } from './view/GoalView';
import { createRooftopView } from './view/RooftopView';

/**
 * Builds the arena: static colliders (from the layout) and the visual scene.
 * Colliders and visuals are built from the same numbers but never reference
 * each other, so a headless server can build only the colliders.
 *
 * Visual layers: ground (pitch, rooftop), midground (cage, goals, props,
 * street decor), background (sky, hills, skyline, clouds, birds).
 */
export class Arena {
  readonly group = new THREE.Group();
  private readonly backdrop: Backdrop;

  constructor(layout: ArenaLayout, physics: PhysicsWorld, maxAnisotropy: number, decorDensity: number) {
    buildArenaColliders(physics, layout);
    const netTexture = createNetTexture();
    this.backdrop = new Backdrop(decorDensity);
    this.group.add(
      createRooftopView(layout, maxAnisotropy),
      createCageView(layout),
      createGoalView(layout.goals.away, THEME.teams.away.primary, netTexture),
      createGoalView(layout.goals.home, THEME.teams.home.primary, netTexture),
      createDecorView(layout, decorDensity),
      this.backdrop.group,
    );
  }

  /** Ambient animation only (clouds, birds); never affects gameplay. */
  update(dt: number): void {
    this.backdrop.update(dt);
  }
}

/** Static colliders only. Kept separate so it can be reused without Three.js. */
export function buildArenaColliders(physics: PhysicsWorld, layout: ArenaLayout): void {
  const { rapier, world } = physics;
  const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
  const t = ARENA.wallThickness;
  const hw = layout.halfWidth;
  const hl = layout.halfLength;
  const wallH = ARENA.wallColliderHeight;

  const box = (hx: number, hy: number, hz: number, x: number, y: number, z: number): void => {
    world.createCollider(
      rapier.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(x, y, z)
        .setFriction(ARENA.wallFriction)
        .setRestitution(ARENA.wallRestitution),
      body,
    );
  };

  // Floor (covers pitch and goal interiors).
  world.createCollider(
    rapier.ColliderDesc.cuboid(hw + t * 2, 0.5, hl + GOAL.depth + t * 2)
      .setTranslation(0, -0.5, 0)
      .setFriction(ARENA.floorFriction)
      .setRestitution(ARENA.floorRestitution),
    body,
  );

  // Ceiling keeps lofted shots in play.
  box(hw + t * 2, t / 2, hl + GOAL.depth + t * 2, 0, ARENA.ceilingHeight + t / 2, 0);

  // Side walls: inner face exactly on the sideline.
  for (const sign of [-1, 1]) {
    box(t / 2, wallH / 2, hl + GOAL.depth + t, sign * (hw + t / 2), wallH / 2, 0);
  }

  const segmentHalf = (hw - GOAL.width / 2) / 2;
  for (const goal of [layout.goals.away, layout.goals.home]) {
    const s = goal.outwardSign;
    const wallZ = goal.lineZ + (t / 2) * s;
    // End wall either side of the goal mouth.
    for (const sign of [-1, 1]) {
      box(segmentHalf, wallH / 2, t / 2, sign * (GOAL.width / 2 + segmentHalf), wallH / 2, wallZ);
    }
    // Above the crossbar.
    const aboveH = (wallH - GOAL.height) / 2;
    box(GOAL.width / 2, aboveH, t / 2, 0, GOAL.height + aboveH, wallZ);

    // Goal box: back, sides, roof.
    const midZ = goal.lineZ + (GOAL.depth / 2) * s;
    box(GOAL.width / 2 + t, GOAL.height / 2 + t / 2, t / 2, 0, GOAL.height / 2, goal.lineZ + (GOAL.depth + t / 2) * s);
    for (const sign of [-1, 1]) {
      box(t / 2, GOAL.height / 2, GOAL.depth / 2, sign * (GOAL.width / 2 + t / 2), GOAL.height / 2, midZ);
    }
    box(GOAL.width / 2 + t, t / 2, GOAL.depth / 2, 0, GOAL.height + t / 2, midZ);
  }
}
