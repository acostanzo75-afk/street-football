/**
 * DOM for the on-screen controls: a floating joystick on the left half and a
 * large SHOOT button bottom-right. Visual only; TouchInput owns the logic.
 */
export class MobileControls {
  readonly root: HTMLDivElement;
  readonly joystickZone: HTMLDivElement;
  readonly shootButton: HTMLButtonElement;

  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  /** Knob travel in px, measured once per touch to avoid layout reads while dragging. */
  private knobTravel = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'controls');
    this.joystickZone = el('div', 'joystick-zone');
    this.base = el('div', 'joystick-base');
    this.knob = el('div', 'joystick-knob');
    this.base.appendChild(this.knob);
    this.joystickZone.appendChild(this.base);

    this.shootButton = document.createElement('button');
    this.shootButton.className = 'shoot-button';
    this.shootButton.type = 'button';
    // Inline SVG ball icon + label: no image requests, crisp at any DPR.
    this.shootButton.innerHTML = `
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="20" fill="#fff" stroke="#10131f" stroke-width="3"/>
        <path d="M24 15l7.6 5.5-2.9 8.9h-9.4l-2.9-8.9z" fill="#10131f"/>
        <path d="M24 15V5M31.6 20.5l9.4-3M28.7 29.4l5.8 8M19.3 29.4l-5.8 8M16.4 20.5l-9.4-3" stroke="#10131f" stroke-width="2.5"/>
      </svg>
      <span>SHOOT</span>`;
    this.shootButton.setAttribute('aria-label', 'Shoot');

    this.root.append(this.joystickZone, this.shootButton);
    parent.appendChild(this.root);
  }

  /**
   * Moves the joystick under the touch point (kept fully on screen) and
   * returns its centre and travel radius in client pixels.
   */
  placeJoystick(clientX: number, clientY: number): { x: number; y: number; radius: number } {
    const zone = this.joystickZone.getBoundingClientRect();
    const size = this.base.offsetWidth;
    const half = size / 2;
    const x = clamp(clientX, zone.left + half, zone.right - half);
    const y = clamp(clientY, zone.top + half, zone.bottom - half);
    this.base.style.left = `${x - zone.left - half}px`;
    this.base.style.top = `${y - zone.top - half}px`;
    this.base.style.bottom = 'auto';
    this.base.classList.add('active');
    this.knobTravel = size * 0.4;
    return { x, y, radius: half * 0.8 };
  }

  /** Knob offset in units of the travel radius (-1..1). */
  setKnob(nx: number, ny: number): void {
    const x = nx * this.knobTravel;
    const y = ny * this.knobTravel;
    this.knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  releaseJoystick(): void {
    this.base.classList.remove('active');
    // Return to the CSS resting position.
    this.base.style.left = '';
    this.base.style.top = '';
    this.base.style.bottom = '';
    this.knob.style.transform = '';
  }

  setShootPressed(pressed: boolean): void {
    this.shootButton.classList.toggle('pressed', pressed);
  }
}

function el(tag: 'div', className: string): HTMLDivElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
