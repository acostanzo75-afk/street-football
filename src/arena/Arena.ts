import * as THREE from 'three';
import { ARENA, GOAL, TEAM_COLORS } from '../game/config';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { ArenaLayout, GoalDefinition } from './ArenaLayout';
import { createNetTexture, createPitchTexture } from './pitchTexture';

const NET_CELL = 0.25;

/**
 * Builds the arena: static colliders (from the layout) and the visual scene.
 * Colliders and visuals are built from the same numbers but never reference
 * each other, so a headless server can build only the colliders.
 */
export class Arena {
  readonly group = new THREE.Group();

  constructor(
    private readonly layout: ArenaLayout,
    physics: PhysicsWorld,
    maxAnisotropy: number,
  ) {
    buildArenaColliders(physics, layout);
    this.buildPitch(maxAnisotropy);
    this.buildBoards();
    const netTexture = createNetTexture();
    this.buildGoal(layout.goals.away, TEAM_COLORS.away, netTexture);
    this.buildGoal(layout.goals.home, TEAM_COLORS.home, netTexture);
    this.buildSurroundings();
  }

  private buildPitch(maxAnisotropy: number): void {
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA.width, ARENA.length),
      new THREE.MeshLambertMaterial({ map: createPitchTexture(maxAnisotropy) }),
    );
    pitch.rotation.x = -Math.PI / 2;
    this.group.add(pitch);

    // Concrete apron under the goals and around the boards.
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA.width + 6, ARENA.length + 8),
      new THREE.MeshLambertMaterial({ color: 0x59606b }),
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.01;
    this.group.add(apron);
  }

  private buildBoards(): void {
    const { halfWidth, halfLength } = this.layout;
    const t = 0.2;
    const h = ARENA.boardHeight;
    const sideMaterial = new THREE.MeshLambertMaterial({ color: 0xe8ecf1 });
    const sideGeometry = new THREE.BoxGeometry(t, h, ARENA.length + t * 2);
    for (const sign of [-1, 1]) {
      const board = new THREE.Mesh(sideGeometry, sideMaterial);
      board.position.set(sign * (halfWidth + t / 2), h / 2, 0);
      this.group.add(board);
    }

    // End boards take the colour of the team defending that end.
    const segmentLength = halfWidth - GOAL.width / 2;
    const endGeometry = new THREE.BoxGeometry(segmentLength, h, t);
    for (const goal of [this.layout.goals.away, this.layout.goals.home]) {
      const material = new THREE.MeshLambertMaterial({ color: TEAM_COLORS[goal.defendedBy] });
      for (const sign of [-1, 1]) {
        const board = new THREE.Mesh(endGeometry, material);
        board.position.set(
          sign * (GOAL.width / 2 + segmentLength / 2),
          h / 2,
          halfLength * goal.outwardSign + (t / 2) * goal.outwardSign,
        );
        this.group.add(board);
      }
    }
  }

  private buildGoal(goal: GoalDefinition, netColor: number, netTexture: THREE.Texture): void {
    const r = GOAL.postRadius;
    const w = GOAL.width;
    const h = GOAL.height;
    const d = GOAL.depth;
    const s = goal.outwardSign;
    const frame = new THREE.Group();
    frame.position.z = goal.lineZ;

    const postMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const postGeometry = new THREE.CylinderGeometry(r, r, h, 8);
    for (const x of [-w / 2, w / 2]) {
      const post = new THREE.Mesh(postGeometry, postMaterial);
      post.position.set(x, h / 2, 0);
      frame.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w + r * 2, 8), postMaterial);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, h, 0);
    frame.add(bar);

    const netMaterial = new THREE.MeshBasicMaterial({
      map: netTexture,
      color: netColor,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const addNet = (width: number, height: number, place: (mesh: THREE.Mesh) => void): void => {
      const geometry = new THREE.PlaneGeometry(width, height);
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, (uv.getX(i) * width) / NET_CELL, (uv.getY(i) * height) / NET_CELL);
      }
      const mesh = new THREE.Mesh(geometry, netMaterial);
      place(mesh);
      frame.add(mesh);
    };
    // Back
    addNet(w, h, (m) => m.position.set(0, h / 2, d * s));
    // Roof
    addNet(w, d, (m) => {
      m.rotation.x = Math.PI / 2;
      m.position.set(0, h, (d / 2) * s);
    });
    // Sides
    for (const x of [-w / 2, w / 2]) {
      addNet(d, h, (m) => {
        m.rotation.y = Math.PI / 2;
        m.position.set(x, h / 2, (d / 2) * s);
      });
    }
    this.group.add(frame);
  }

  private buildSurroundings(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      new THREE.MeshLambertMaterial({ color: 0x3b414a }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    this.group.add(ground);

    // A deterministic ring of simple blocks suggests a city without costing much.
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    const palette = [0xc9a27e, 0x9fb4c7, 0xd8d2c4, 0xb57f6a, 0x8fa89a];
    const materials = palette.map((color) => new THREE.MeshLambertMaterial({ color }));
    const count = 16;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radiusX = 26 + (i % 3) * 3;
      const radiusZ = 32 + ((i + 1) % 3) * 3;
      const building = new THREE.Mesh(geometry, materials[i % materials.length]);
      building.scale.set(7 + (i % 4) * 2, 8 + ((i * 7) % 5) * 3, 7 + ((i * 3) % 4) * 2);
      building.position.set(Math.sin(angle) * radiusX, 0, Math.cos(angle) * radiusZ);
      building.rotation.y = -angle;
      this.group.add(building);
    }
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
