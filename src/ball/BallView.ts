import * as THREE from 'three';
import { BALL } from '../game/config';
import { createBlobShadow } from '../render/blobShadow';
import { outlinedMesh, toon } from '../render/materials';
import { THEME } from '../render/theme';

/** Visual is drawn slightly larger than the collider: easier to track on a phone. */
const VISUAL_SCALE = 1.12;

/**
 * Stylised football: white shell, navy pentagon panels and a yellow accent band
 * (the band makes spin obvious), outlined, with a see-through silhouette,
 * contact shadow and a faint ground marker.
 */
export class BallView {
  readonly root = new THREE.Group();
  readonly ball: THREE.Mesh;

  private readonly shadow: THREE.Mesh;
  private readonly marker: THREE.Mesh;

  constructor() {
    const geometry = createBallGeometry(BALL.radius * VISUAL_SCALE);
    this.ball = outlinedMesh(geometry, toon(0xffffff, { vertexColors: true, rim: true }));

    // Silhouette drawn ONLY where something hides the ball (GreaterDepth):
    // the player's body often sits between camera and ball while dribbling.
    const xray = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: THEME.ball.accent,
        transparent: true,
        opacity: 0.75,
        depthFunc: THREE.GreaterDepth,
        depthWrite: false,
      }),
    );
    xray.renderOrder = 3;
    this.ball.add(xray);

    this.shadow = createBlobShadow(BALL.radius * 1.35, 0.55);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(BALL.radius * 1.5, BALL.radius * 1.85, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: THEME.ball.accent, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.marker.renderOrder = 1;
    this.root.add(this.ball, this.shadow, this.marker);
  }

  update(position: THREE.Vector3, rotation: THREE.Quaternion): void {
    this.ball.position.copy(position);
    this.ball.quaternion.copy(rotation);
    const height = Math.max(0, position.y - BALL.radius);
    // Shadow and marker shrink with height: a strong depth cue for lofted balls.
    const s = 1 / (1 + height * 0.45);
    this.shadow.position.set(position.x, 0.021, position.z);
    this.shadow.scale.setScalar(s);
    this.marker.position.set(position.x, 0.022, position.z);
    this.marker.scale.setScalar(s);
  }
}

function createBallGeometry(radius: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, 3);
  const base = new THREE.IcosahedronGeometry(1, 0);
  const basePositions = base.getAttribute('position');
  const corners: THREE.Vector3[] = [];
  for (let i = 0; i < basePositions.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(basePositions, i).normalize();
    if (!corners.some((c) => c.distanceToSquared(v) < 1e-6)) corners.push(v);
  }
  base.dispose();

  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const bandAxis = new THREE.Vector3(1, 0.35, 0.2).normalize();
  const panelCos = Math.cos((19 * Math.PI) / 180);
  const white = new THREE.Color(THEME.ball.base);
  const panel = new THREE.Color(THEME.ball.panel);
  const accent = new THREE.Color(THEME.ball.accent);
  // IcosahedronGeometry is non-indexed: every 3 vertices form one face.
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    centroid.copy(a).add(b).add(c).normalize();
    let color = white;
    if (corners.some((corner) => corner.dot(centroid) > panelCos)) color = panel;
    else if (Math.abs(centroid.dot(bandAxis)) < 0.09) color = accent;
    for (let k = 0; k < 3; k++) color.toArray(colors, (i + k) * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
