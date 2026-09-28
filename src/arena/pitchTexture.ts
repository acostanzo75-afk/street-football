import * as THREE from 'three';
import { ARENA, TEAM_COLORS } from '../game/config';

const PIXELS_PER_METRE = 40;

function hex(color: number, alpha = 1): string {
  const c = new THREE.Color(color);
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${alpha})`;
}

/**
 * Draws all pitch markings into a single canvas texture once at startup.
 * One textured plane = one draw call, far cheaper than line meshes.
 *
 * Canvas top maps to -Z (the goal home attacks), canvas left maps to -X.
 */
export function createPitchTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = ARENA.width * PIXELS_PER_METRE;
  const h = ARENA.length * PIXELS_PER_METRE;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  const m = PIXELS_PER_METRE;

  // Base court with alternating bands: bands make speed readable.
  ctx.fillStyle = '#2f8a57';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2b7f50';
  const band = 2 * m;
  for (let y = 0; y < h; y += band * 2) ctx.fillRect(0, y, w, band);

  // Team-tinted goal areas communicate which end belongs to whom.
  const areaRadius = 4 * m;
  ctx.fillStyle = hex(TEAM_COLORS.away, 0.28);
  ctx.beginPath();
  ctx.arc(w / 2, 0, areaRadius, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = hex(TEAM_COLORS.home, 0.28);
  ctx.beginPath();
  ctx.arc(w / 2, h, areaRadius, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 0.12 * m;

  // Border
  const inset = ctx.lineWidth / 2 + 0.15 * m;
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);

  // Halfway line and centre circle
  ctx.beginPath();
  ctx.moveTo(inset, h / 2);
  ctx.lineTo(w - inset, h / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 2.5 * m, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 0.18 * m, 0, Math.PI * 2);
  ctx.fill();

  // Goal area arcs and penalty spots
  ctx.beginPath();
  ctx.arc(w / 2, 0, areaRadius, 0, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, h, areaRadius, Math.PI, Math.PI * 2);
  ctx.stroke();
  for (const y of [6 * m, h - 6 * m]) {
    ctx.beginPath();
    ctx.arc(w / 2, y, 0.14 * m, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, maxAnisotropy);
  return texture;
}

/** A small transparent grid used for the goal nets. */
export function createNetTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
