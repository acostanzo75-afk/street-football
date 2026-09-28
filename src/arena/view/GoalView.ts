import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GOAL } from '../../game/config';
import { outlinedMesh, toon } from '../../render/materials';
import { THEME } from '../../render/theme';
import type { GoalDefinition } from '../ArenaLayout';

const NET_CELL = 0.18;

/**
 * Street goal: chunky white frame, team-coloured base bars, depth frame and a
 * tinted net. Two merged frame meshes + one net mesh per goal.
 */
export function createGoalView(goal: GoalDefinition, teamColor: number, netTexture: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  group.position.z = goal.lineZ;
  const s = goal.outwardSign;
  const w = GOAL.width;
  const h = GOAL.height;
  const d = GOAL.depth;

  const bar = (r: number, a: THREE.Vector3, b: THREE.Vector3): THREE.BufferGeometry => {
    const length = a.distanceTo(b);
    const geometry = new THREE.CylinderGeometry(r, r, length, 10, 1);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a).normalize();
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(THREE.Object3D.DEFAULT_UP, dir));
    geometry.translate(mid.x, mid.y, mid.z);
    return geometry;
  };
  const joint = (r: number, p: THREE.Vector3): THREE.BufferGeometry =>
    new THREE.SphereGeometry(r, 10, 8).translate(p.x, p.y, p.z);

  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z * s);
  const R = 0.085;
  const r = 0.05;
  const frameParts = [
    bar(R, v(-w / 2, 0, 0), v(-w / 2, h, 0)),
    bar(R, v(w / 2, 0, 0), v(w / 2, h, 0)),
    bar(R, v(-w / 2, h, 0), v(w / 2, h, 0)),
    joint(R, v(-w / 2, h, 0)),
    joint(R, v(w / 2, h, 0)),
    // Depth frame: top rails back, then down to the ground.
    bar(r, v(-w / 2, h, 0), v(-w / 2, h, d * 0.6)),
    bar(r, v(w / 2, h, 0), v(w / 2, h, d * 0.6)),
    bar(r, v(-w / 2, h, d * 0.6), v(-w / 2, 0, d)),
    bar(r, v(w / 2, h, d * 0.6), v(w / 2, 0, d)),
    bar(r, v(-w / 2, h, d * 0.6), v(w / 2, h, d * 0.6)),
  ];
  const frame = mergeGeometries(frameParts);
  if (frame) group.add(outlinedMesh(frame, toon(THEME.goalFrame, { rim: true })));

  const baseParts = [
    bar(r, v(-w / 2, r, 0), v(-w / 2, r, d)),
    bar(r, v(w / 2, r, 0), v(w / 2, r, d)),
    bar(r, v(-w / 2, r, d), v(w / 2, r, d)),
  ];
  const base = mergeGeometries(baseParts);
  if (base) group.add(outlinedMesh(base, toon(teamColor)));

  // Net: back slope + roof + two sides, tinted towards the team colour.
  const netMaterial = new THREE.MeshBasicMaterial({
    map: netTexture,
    color: new THREE.Color(teamColor).lerp(new THREE.Color(0xffffff), 0.55),
    alphaTest: 0.45,
    side: THREE.DoubleSide,
  });
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, dd: THREE.Vector3): THREE.BufferGeometry => {
    const geometry = new THREE.BufferGeometry();
    const width = a.distanceTo(b);
    const height = a.distanceTo(dd);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([...a.toArray(), ...b.toArray(), ...c.toArray(), ...dd.toArray()], 3));
    geometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute([0, 0, width / NET_CELL, 0, width / NET_CELL, height / NET_CELL, 0, height / NET_CELL], 2),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    return geometry;
  };
  const netParts = [
    quad(v(-w / 2, 0, d), v(w / 2, 0, d), v(w / 2, h, d * 0.6), v(-w / 2, h, d * 0.6)),
    quad(v(-w / 2, h, 0), v(w / 2, h, 0), v(w / 2, h, d * 0.6), v(-w / 2, h, d * 0.6)),
  ];
  for (const x of [-w / 2, w / 2]) {
    const side = new THREE.BufferGeometry();
    const pts = [v(x, 0, 0), v(x, 0, d), v(x, h, d * 0.6), v(x, h, 0)];
    side.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => p.toArray()), 3));
    side.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(pts.flatMap((p) => [Math.abs(p.z) / NET_CELL, p.y / NET_CELL]), 2),
    );
    side.setIndex([0, 1, 2, 0, 2, 3]);
    netParts.push(side);
  }
  const net = mergeGeometries(netParts);
  if (net) group.add(new THREE.Mesh(net, netMaterial));
  return group;
}
