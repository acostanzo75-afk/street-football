import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Small geometry helpers shared by the arena views. */

/** mergeGeometries needs matching attributes, so every part is made non-indexed. */
export function nonIndexed(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

/** Soft-edged box, translated. Rounded edges catch light and read as "designed". */
export function roundedBox(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  radius = Math.min(w, h, d) * 0.12,
): THREE.BufferGeometry {
  return nonIndexed(new RoundedBoxGeometry(w, h, d, 2, radius)).translate(x, y, z);
}

export function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return nonIndexed(new THREE.BoxGeometry(w, h, d)).translate(x, y, z);
}

/** Cylinder between two points (bars, rails, poles). */
export function bar(r: number, a: THREE.Vector3, b: THREE.Vector3, radialSegments = 8): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(r, r, a.distanceTo(b), radialSegments, 1);
  const dir = b.clone().sub(a).normalize();
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(THREE.Object3D.DEFAULT_UP, dir));
  const mid = a.clone().add(b).multiplyScalar(0.5);
  geometry.translate(mid.x, mid.y, mid.z);
  return nonIndexed(geometry);
}

/**
 * Merges parts into one mesh (one draw call) and adds it to `parent`.
 * Parts are normalised to non-indexed geometry so any mix can be merged.
 */
export function addMerged(
  parent: THREE.Object3D,
  parts: THREE.BufferGeometry[],
  material: THREE.Material,
  shadows: { cast: boolean; receive: boolean } = { cast: true, receive: true },
): THREE.Mesh | null {
  if (parts.length === 0) return null;
  const geometry = mergeGeometries(parts.map(nonIndexed));
  if (!geometry) return null;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = shadows.cast;
  mesh.receiveShadow = shadows.receive;
  parent.add(mesh);
  return mesh;
}
