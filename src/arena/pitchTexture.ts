import * as THREE from 'three';
import { ARENA, GOAL } from '../game/config';
import { THEME } from '../render/theme';

/**
 * Procedural textures drawn once at startup. All pitch markings, wear and
 * turf variation live in a single canvas, so the pitch is one draw call.
 */

const PX_PER_M = 40;

/** Small deterministic PRNG so the textures look the same on every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [canvas, ctx];
}

function css(color: number, alpha = 1): string {
  const c = new THREE.Color(color);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${alpha})`;
}

function finish(canvas: HTMLCanvasElement, maxAnisotropy: number): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  return texture;
}

/** Canvas top = -Z (the goal home attacks), canvas left = -X. */
export function createPitchTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const m = PX_PER_M;
  const w = ARENA.width * m;
  const h = ARENA.length * m;
  const [canvas, ctx] = canvas2d(w, h);
  const rand = rng(7);
  const P = THEME.pitch;

  // Turf with mowing stripes.
  ctx.fillStyle = P.turf;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = P.turfStripe;
  const band = 2 * m;
  for (let y = 0; y < h; y += band * 2) ctx.fillRect(0, y, w, band);

  // Worn patches where play concentrates: centre spot and goal mouths.
  const wear = (x: number, y: number, r: number, a: number): void => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(170, 190, 120, ${a})`);
    g.addColorStop(1, 'rgba(170, 190, 120, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  wear(w / 2, h / 2, 3 * m, 0.22);
  wear(w / 2, 1.6 * m, 2.6 * m, 0.3);
  wear(w / 2, h - 1.6 * m, 2.6 * m, 0.3);

  // Fine grain: thousands of tiny blades break up the flat colour.
  for (let i = 0; i < 26000; i++) {
    const light = rand() > 0.5;
    ctx.fillStyle = light ? 'rgba(255,255,255,0.05)' : 'rgba(0,30,10,0.07)';
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 2 + rand() * 3);
  }

  // Goal areas tinted by the team that defends them.
  const areaR = 4 * m;
  ctx.fillStyle = css(THEME.teams.away.primary, 0.22);
  ctx.beginPath();
  ctx.arc(w / 2, 0, areaR, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = css(THEME.teams.home.primary, 0.22);
  ctx.beginPath();
  ctx.arc(w / 2, h, areaR, Math.PI, Math.PI * 2);
  ctx.fill();

  // Markings.
  ctx.strokeStyle = P.line;
  ctx.fillStyle = P.line;
  ctx.lineWidth = 0.12 * m;
  const inset = 0.3 * m;
  roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, 0.8 * m);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(inset, h / 2);
  ctx.lineTo(w - inset, h / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 2.6 * m, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, 0, areaR, 0, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, h, areaR, Math.PI, Math.PI * 2);
  ctx.stroke();
  for (const y of [6 * m, h - 6 * m, h / 2]) {
    ctx.beginPath();
    ctx.arc(w / 2, y, 0.16 * m, 0, Math.PI * 2);
    ctx.fill();
  }
  // Corner arcs.
  for (const [cx, cy, a0] of [
    [inset, inset, 0],
    [w - inset, inset, Math.PI / 2],
    [w - inset, h - inset, Math.PI],
    [inset, h - inset, Math.PI * 1.5],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, 0.7 * m, a0, a0 + Math.PI / 2);
    ctx.stroke();
  }

  // Centre emblem: a simple ball-and-star mark inside the circle.
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#ffffff';
  star(ctx, 1.7 * m, 0.75 * m);
  ctx.restore();

  // Line wear: faint scuffs over everything.
  for (let i = 0; i < 180; i++) {
    ctx.fillStyle = `rgba(40,70,40,${0.08 + rand() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(rand() * w, rand() * h, 4 + rand() * 18, 2 + rand() * 6, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  return finish(canvas, maxAnisotropy);
}

/** Rooftop concrete around the cage: tiles, a painted terracotta apron, drains. */
export function createRooftopTexture(width: number, length: number, maxAnisotropy: number): THREE.CanvasTexture {
  const m = 16;
  const w = Math.round(width * m);
  const h = Math.round(length * m);
  const [canvas, ctx] = canvas2d(w, h);
  const rand = rng(11);
  const S = THEME.structure;

  ctx.fillStyle = css(S.rooftop);
  ctx.fillRect(0, 0, w, h);
  // Concrete slabs with slight tonal variation.
  const slab = 2 * m;
  for (let y = 0; y < h; y += slab) {
    for (let x = 0; x < w; x += slab) {
      ctx.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},${0.02 + rand() * 0.04})`;
      ctx.fillRect(x, y, slab, slab);
    }
  }
  ctx.strokeStyle = css(S.rooftopDark, 0.9);
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += slab) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += slab) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
  }

  // Painted terracotta apron hugging the cage.
  const apronW = (ARENA.width + 2.4) * m;
  const apronH = (ARENA.length + GOAL.depth * 2 + 2.4) * m;
  const ax = (w - apronW) / 2;
  const ay = (h - apronH) / 2;
  ctx.fillStyle = css(THEME.pitch.runoff);
  roundRect(ctx, ax, ay, apronW, apronH, 0.6 * m);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 0.1 * m;
  roundRect(ctx, ax + 0.25 * m, ay + 0.25 * m, apronW - 0.5 * m, apronH - 0.5 * m, 0.4 * m);
  ctx.stroke();
  // Hazard hatching at the ends.
  ctx.save();
  ctx.beginPath();
  ctx.rect(ax, ay, apronW, 1.1 * m);
  ctx.rect(ax, ay + apronH - 1.1 * m, apronW, 1.1 * m);
  ctx.clip();
  ctx.strokeStyle = css(THEME.pitch.runoffDark, 0.9);
  ctx.lineWidth = 0.25 * m;
  for (let x = -apronH; x < w + apronH; x += 0.8 * m) {
    ctx.beginPath();
    ctx.moveTo(x, ay);
    ctx.lineTo(x + apronH, ay + apronH);
    ctx.stroke();
  }
  ctx.restore();

  // Stains.
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(30,25,40,${0.04 + rand() * 0.06})`;
    ctx.beginPath();
    ctx.ellipse(rand() * w, rand() * h, 6 + rand() * 30, 4 + rand() * 16, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(canvas, maxAnisotropy);
}

/** Tileable chain-link diamond pattern, used with alphaTest (no sorting cost). */
export function createFenceTexture(): THREE.CanvasTexture {
  const size = 64;
  const [canvas, ctx] = canvas2d(size, size);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size / 2, 0);
  ctx.lineTo(size, size / 2);
  ctx.lineTo(size / 2, size);
  ctx.closePath();
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Square net mesh, tileable. */
export function createNetTexture(): THREE.CanvasTexture {
  const size = 32;
  const [canvas, ctx] = canvas2d(size, size);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Sponsor-style board graphics (all fictional). One wide strip texture;
 * each board maps a different horizontal slice of it.
 */
export function createSignageTexture(): THREE.CanvasTexture {
  const panelW = 256;
  const panelH = 48;
  const slogans = ['STREET CUP', 'ROOFTOP FC', 'NO LIMITS', 'PLAY LOUD', 'KICK OFF', 'CITY LEAGUE'];
  const [canvas, ctx] = canvas2d(panelW * slogans.length, panelH);
  const colors = ['#1e2742', '#2a2250', '#1e2742', '#3a2040', '#1e2742', '#262a4a'];
  const accents = ['#ffc53d', '#ff4d5e', '#4de0c0', '#ffc53d', '#2e6bff', '#ff8a3d'];
  slogans.forEach((text, i) => {
    const x = i * panelW;
    ctx.fillStyle = colors[i] ?? '#1e2742';
    ctx.fillRect(x, 0, panelW, panelH);
    const accent = accents[i] ?? '#ffc53d';
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 34, 0);
    ctx.lineTo(x + 18, panelH);
    ctx.lineTo(x, panelH);
    ctx.fill();
    ctx.fillRect(x, panelH - 5, panelW, 5);
    ctx.font = 'italic 900 34px "Barlow Condensed", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x + 46, panelH / 2 - 1);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/**
 * Window pattern for near skyline towers: a colour map plus a matching
 * emissive mask where only the lit windows glow.
 */
export function createWindowTextures(): { color: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const [colorCanvas, c] = canvas2d(64, 128);
  const [glowCanvas, g] = canvas2d(64, 128);
  const rand = rng(3);
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, 64, 128);
  g.fillStyle = '#000000';
  g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 128; y += 14) {
    for (let x = 5; x < 64; x += 12) {
      const lit = rand();
      c.fillStyle = lit > 0.72 ? '#ffe1a8' : lit > 0.4 ? '#8f88ad' : '#6f6890';
      c.fillRect(x, y, 6, 8);
      if (lit > 0.72) {
        g.fillStyle = '#ffffff';
        g.fillRect(x, y, 6, 8);
      }
    }
  }
  const make = (canvas: HTMLCanvasElement): THREE.CanvasTexture => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Tiled vertically so windows keep a sane size on tall towers.
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 5);
    return texture;
  };
  return { color: make(colorCanvas), emissive: make(glowCanvas) };
}

/**
 * Spray-paint piece: chunky bubble letters with a gradient fill, dark outline,
 * highlight, drips and overspray, on a wall-coloured ground. Fictional text only.
 */
export function createGraffitiTexture(text: string, width: number, height: number, seed: number): THREE.CanvasTexture {
  const [canvas, ctx] = canvas2d(width, height);
  const rand = rng(seed);
  ctx.fillStyle = css(THEME.structure.parapet);
  ctx.fillRect(0, 0, width, height);
  // Old buffed-out paint patches behind the piece.
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.03 + rand() * 0.04})`;
    ctx.fillRect(rand() * width, rand() * height * 0.6, 40 + rand() * 160, 20 + rand() * 50);
  }
  const fontSize = Math.round(height * 0.78);
  ctx.font = `italic 900 ${fontSize}px "Barlow Condensed", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = width / 2;
  const cy = height / 2 + fontSize * 0.04;

  // Overspray glow behind the letters.
  ctx.save();
  ctx.shadowColor = 'rgba(255, 79, 163, 0.55)';
  ctx.shadowBlur = fontSize * 0.25;
  ctx.lineJoin = 'round';
  ctx.lineWidth = fontSize * 0.2;
  ctx.strokeStyle = '#141024';
  ctx.strokeText(text, cx, cy);
  ctx.restore();

  const fill = ctx.createLinearGradient(0, cy - fontSize / 2, 0, cy + fontSize / 2);
  fill.addColorStop(0, '#ffd23f');
  fill.addColorStop(0.5, '#ff7a2f');
  fill.addColorStop(1, '#ff4fa3');
  ctx.fillStyle = fill;
  ctx.fillText(text, cx, cy);

  // Highlight stripe across the upper third of the letters.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, cy - fontSize * 0.36, width, fontSize * 0.1);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(text, cx, cy);
  ctx.restore();

  // Drips running down from the letters.
  const measured = ctx.measureText(text).width;
  for (let i = 0; i < 14; i++) {
    const x = cx - measured / 2 + rand() * measured;
    const y = cy + fontSize * (0.2 + rand() * 0.15);
    const len = fontSize * (0.1 + rand() * 0.35);
    ctx.fillStyle = rand() > 0.5 ? '#ff4fa3' : '#ff7a2f';
    ctx.fillRect(x, y, 3 + rand() * 3, len);
    ctx.beginPath();
    ctx.arc(x + 2.5, y + len, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Spray speckle.
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(66,232,224,0.5)' : 'rgba(255,210,63,0.4)';
    ctx.fillRect(rand() * width, rand() * height, 1.5, 1.5);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx: CanvasRenderingContext2D, outer: number, inner: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}
