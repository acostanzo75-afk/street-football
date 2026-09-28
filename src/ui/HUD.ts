import type { Score } from '../game/types';

/**
 * Minimal HTML overlay: score, match clock, and a transient centre message.
 * DOM writes only happen when the displayed value actually changes.
 */
export class HUD {
  private readonly homeScore: HTMLSpanElement;
  private readonly awayScore: HTMLSpanElement;
  private readonly clock: HTMLDivElement;
  private readonly message: HTMLDivElement;
  private messageTimer = 0;
  private shownSeconds = -1;

  constructor(parent: HTMLElement) {
    const root = document.createElement('div');
    root.className = 'hud';
    root.innerHTML = `
      <div class="scoreboard">
        <span class="team home">YOU</span>
        <span class="score" data-home>0</span>
        <span class="dash">-</span>
        <span class="score" data-away>0</span>
        <span class="team away">OPP</span>
      </div>
      <div class="clock" data-clock>3:00</div>
      <div class="message" data-message></div>
      <div class="hint">WASD / Arrows move · Space shoot</div>
    `;
    parent.appendChild(root);
    this.homeScore = query(root, '[data-home]');
    this.awayScore = query(root, '[data-away]');
    this.clock = query(root, '[data-clock]');
    this.message = query(root, '[data-message]');
  }

  setScore(score: Readonly<Score>): void {
    this.homeScore.textContent = String(score.home);
    this.awayScore.textContent = String(score.away);
  }

  setClock(remainingSeconds: number): void {
    const seconds = Math.ceil(remainingSeconds);
    if (seconds === this.shownSeconds) return;
    this.shownSeconds = seconds;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    this.clock.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  showMessage(text: string, variant: 'home' | 'away' | 'neutral', durationSeconds: number): void {
    this.message.textContent = text;
    this.message.dataset.variant = variant;
    this.message.classList.remove('visible');
    // Force reflow so the pop animation restarts even if the message was already showing.
    void this.message.offsetWidth;
    this.message.classList.add('visible');
    this.messageTimer = durationSeconds;
  }

  update(dt: number): void {
    if (this.messageTimer <= 0) return;
    this.messageTimer -= dt;
    if (this.messageTimer <= 0) this.message.classList.remove('visible');
  }
}

function query<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`HUD element missing: ${selector}`);
  return node;
}
