// Self-hosted display font: no third-party request, works offline.
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/800-italic.css';
import '@fontsource/barlow-condensed/900-italic.css';
import './style.css';

function preventBrowserGestures(): void {
  // Stop page scroll / pull-to-refresh / pinch-zoom from stealing gameplay touches.
  const block = (e: Event): void => e.preventDefault();
  document.addEventListener('touchmove', block, { passive: false });
  document.addEventListener('gesturestart', block);
  document.addEventListener('contextmenu', block);
  document.addEventListener('dblclick', block);
}

function detectTouch(): void {
  const mark = (): void => document.body.classList.add('touch');
  if (window.matchMedia('(any-pointer: coarse)').matches) mark();
  // Hybrid devices: switch to touch UI the first time a finger is used.
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'touch') mark();
    },
    { passive: true },
  );
}

async function main(): Promise<void> {
  const container = document.getElementById('app');
  const loading = document.getElementById('loading');
  if (!container) throw new Error('#app container missing');

  preventBrowserGestures();
  detectTouch();

  try {
    // Loaded lazily so the loading screen paints while three.js + Rapier (WASM) download.
    // Canvas textures (signage, shirt number) use the display font, so load it first.
    const [{ Game }] = await Promise.all([
      import('./game/Game'),
      document.fonts.load('italic 900 32px "Barlow Condensed"'),
    ]);
    const game = await Game.create(container);
    game.start();
    if (loading) {
      loading.classList.add('hidden');
      loading.addEventListener('transitionend', () => loading.remove(), { once: true });
    }
  } catch (error) {
    console.error(error);
    const tag = loading?.querySelector('.splash-tag');
    if (tag) tag.textContent = 'Failed to start the game. Please reload.';
  }
}

void main();
