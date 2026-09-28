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
    const { Game } = await import('./game/Game');
    const game = await Game.create(container);
    game.start();
    loading?.remove();
  } catch (error) {
    console.error(error);
    if (loading) loading.textContent = 'Failed to start the game. Please reload.';
  }
}

void main();
