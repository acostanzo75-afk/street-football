import type { Score } from '../game/types';

export type BannerVariant = 'home' | 'away' | 'neutral';

/** Time reserved at the end of a banner for its exit animation. */
const BANNER_EXIT = 0.35;

/**
 * Arcade sports HUD: a compact broadcast-style scoreboard with the clock
 * integrated underneath, and an animated centre banner for GOAL / KICK OFF /
 * results. DOM writes only happen when a value changes.
 */
export class HUD {
  private readonly homeScore: HTMLSpanElement;
  private readonly awayScore: HTMLSpanElement;
  private readonly clock: HTMLSpanElement;
  private readonly banner: HTMLDivElement;
  private readonly bannerTitle: HTMLDivElement;
  private readonly bannerSub: HTMLDivElement;
  private bannerTimer = 0;
  private shownSeconds = -1;
  private lastScore: Score = { home: 0, away: 0 };

  constructor(parent: HTMLElement) {
    const root = document.createElement('div');
    root.className = 'hud';
    root.innerHTML = `
      <div class="scoreboard">
        <div class="sb-row">
          <div class="sb-team sb-home"><span>YOU</span></div>
          <div class="sb-center">
            <span class="sb-score" data-home>0</span>
            <span class="sb-sep"></span>
            <span class="sb-score" data-away>0</span>
          </div>
          <div class="sb-team sb-away"><span>OPP</span></div>
        </div>
        <div class="sb-clock"><span data-clock>3:00</span></div>
      </div>
      <div class="banner" data-banner>
        <div class="banner-band"></div>
        <div class="banner-title" data-banner-title></div>
        <div class="banner-sub" data-banner-sub></div>
      </div>
      <div class="hint"><kbd>WASD</kbd> move <kbd>Space</kbd> shoot</div>
    `;
    parent.appendChild(root);
    this.homeScore = query(root, '[data-home]');
    this.awayScore = query(root, '[data-away]');
    this.clock = query(root, '[data-clock]');
    this.banner = query(root, '[data-banner]');
    this.bannerTitle = query(root, '[data-banner-title]');
    this.bannerSub = query(root, '[data-banner-sub]');
  }

  setScore(score: Readonly<Score>): void {
    if (score.home !== this.lastScore.home) bump(this.homeScore);
    if (score.away !== this.lastScore.away) bump(this.awayScore);
    this.lastScore = { home: score.home, away: score.away };
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

  showBanner(title: string, subtitle: string, variant: BannerVariant, durationSeconds: number): void {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = subtitle;
    this.banner.dataset.variant = variant;
    this.banner.classList.remove('in', 'out');
    // Force reflow so the entry animation restarts even if a banner is showing.
    void this.banner.offsetWidth;
    this.banner.classList.add('in');
    this.bannerTimer = durationSeconds;
  }

  update(dt: number): void {
    if (this.bannerTimer <= 0) return;
    const before = this.bannerTimer;
    this.bannerTimer -= dt;
    if (before > BANNER_EXIT && this.bannerTimer <= BANNER_EXIT) this.banner.classList.add('out');
    if (this.bannerTimer <= 0) this.banner.classList.remove('in', 'out');
  }
}

function bump(el: HTMLElement): void {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function query<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`HUD element missing: ${selector}`);
  return node;
}
