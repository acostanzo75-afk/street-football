import * as THREE from 'three';

let sharedTexture: THREE.CanvasTexture | null = null;

function getShadowTexture(): THREE.CanvasTexture {
  if (sharedTexture) return sharedTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,1)');
  gradient.addColorStop(0.6, 'rgba(0,0,0,0.6)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  sharedTexture = new THREE.CanvasTexture(canvas);
  return sharedTexture;
}

/**
 * Fake contact shadow. Real shadow maps are expensive on mobile GPUs; a blob
 * under each dynamic object gives most of the grounding for almost nothing.
 */
export function createBlobShadow(radius: number, opacity: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(radius * 2, radius * 2);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    map: getShadowTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1;
  return mesh;
}
