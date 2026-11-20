import './onboarding.css';
import { u } from '../base';

type BrandColor = 'purple' | 'red' | 'orange' | 'blue' | 'green';

interface FocusOption {
  id: string;
  label: string;
  color: BrandColor;
  icon: string;
}

export interface OnboardingProfile {
  name: string;
  company: string;
  focus: string;
  focusLabel: string;
  done: true;
}

export const ONBOARDED_EVENT = 'primetech:onboarded';
const STEP_COUNT = 3;

const TEMPLATE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <symbol id="pt-logo" viewBox="0 0 120 120">
    <polygon points="30,28 50,4 84,4 78,30" fill="var(--ob-red)"/>
    <polygon points="88,6 118,50 92,52" fill="var(--ob-orange)"/>
    <polygon points="60,72 112,56 98,76 70,90" fill="var(--ob-blue)"/>
    <polygon points="8,84 40,66 40,100 22,120" fill="var(--ob-green)"/>
    <polygon points="0,44 34,40 14,82" fill="var(--ob-purple)"/>
  </symbol>
</defs></svg>
<div class="ob-field" aria-hidden="true">
  <div class="ob-shard ob-s-purple"><i></i></div>
  <div class="ob-shard ob-s-green"><i></i></div>
  <div class="ob-shard ob-s-red"><i></i></div>
  <div class="ob-shard ob-s-orange"><i></i></div>
  <div class="ob-shard ob-s-blue"><i></i></div>
</div>
<main class="ob-stage">
  <div class="ob-brand">
    <svg role="img" aria-label="PrimeTech logo"><use href="#pt-logo"/></svg>
    <div class="ob-wordmark">PrimeTech</div>
  </div>
  <div class="ob-head">
    <h1 class="ob-title" data-ob="title"></h1>
    <p class="ob-sub" data-ob="subtitle"></p>
  </div>
  <div class="ob-panel">
    <section class="ob-step" data-step="0">
      <div class="ob-fieldwrap">
        <label class="ob-sr" for="ob-name">Your name</label>
        <input class="ob-input" id="ob-name" type="text" placeholder="Your name" autocomplete="name" maxlength="60">
        <p class="ob-msg" data-ob="msg-name" role="alert"></p>
      </div>
    </section>
    <section class="ob-step" data-step="1">
      <div class="ob-fieldwrap">
        <label class="ob-sr" for="ob-company">Company or studio name</label>
        <input class="ob-input" id="ob-company" type="text" placeholder="Company or studio name" autocomplete="organization" maxlength="80">
        <p class="ob-msg" data-ob="msg-company" role="alert"></p>
        <button class="ob-quiet" type="button" data-ob="solo">I work independently</button>
      </div>
    </section>
    <section class="ob-step" data-step="2">
      <div class="ob-grid" data-ob="grid" role="radiogroup" aria-label="Primary production focus"></div>
      <div class="ob-other">
        <label class="ob-pill"><input type="radio" name="ob-focus" value="other" data-ob="focus-other"><span>Other</span></label>
        <input class="ob-input ob-input--sm" id="ob-other-text" type="text" placeholder="Describe your focus" maxlength="80" hidden aria-label="Describe your focus">
        <p class="ob-msg" data-ob="msg-focus" role="alert"></p>
      </div>
    </section>
  </div>
  <div class="ob-controls">
    <div class="ob-row">
      <button class="ob-back" type="button" data-ob="back" aria-label="Back" hidden>
        <svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
      </button>
      <button class="ob-next" type="button" data-ob="next"><span data-ob="next-label">Next</span>
        <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
    </div>
    <div class="ob-dots" data-ob="dots"></div>
  </div>
</main>
<div class="ob-launch" data-ob="launch" role="status" aria-live="polite">
  <div class="ob-logo-wrap"><div class="ob-ring"></div><svg aria-hidden="true"><use href="#pt-logo"/></svg></div>
  <h2 data-ob="launch-title"></h2>
  <p data-ob="launch-line"></p>
  <div class="ob-bar"><b data-ob="bar"></b></div>
</div>
`;

export class Onboarding {
  private readonly storageKey: string;
  private readonly dataUrl: string;
  private root!: HTMLElement;
  private focusOptions: FocusOption[] = [];
  private step = 0;
  private name = '';
  private company = '';

  constructor(options: { storageKey?: string; dataUrl?: string } = {}) {
    this.storageKey = options.storageKey ?? 'primetech.onboarding';
    this.dataUrl = options.dataUrl ?? u('/library/onboarding.json');
  }

  readProfile(): OnboardingProfile | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? (JSON.parse(raw) as OnboardingProfile) : null;
    } catch {
      return null;
    }
  }

  /** Shows on first visit, and always at /onboarding so the flow can be reviewed again. */
  shouldShow(): boolean {
    return window.location.pathname === '/onboarding' || !this.readProfile()?.done;
  }

  async mount(parent: HTMLElement): Promise<void> {
    try {
      const resp = await fetch(this.dataUrl);
      if (!resp.ok) throw new Error(String(resp.status));
      this.focusOptions = ((await resp.json()) as { focus: FocusOption[] }).focus;
    } catch {
      return; // The studio stays usable if the options cannot be loaded.
    }
    const saved = this.readProfile();
    this.name = saved?.name ?? '';
    this.company = saved?.company ?? '';

    this.root = document.createElement('div');
    this.root.className = 'pt-ob';
    this.root.innerHTML = TEMPLATE;
    parent.appendChild(this.root);

    this.q<HTMLInputElement>('#ob-name').value = this.name;
    this.q<HTMLInputElement>('#ob-company').value = this.company;
    this.buildGrid();
    this.buildDots();
    this.wire();
    this.render();
  }

  private q<T extends Element>(selector: string): T {
    return this.root.querySelector<T>(selector) as T;
  }
  private d<T extends HTMLElement = HTMLElement>(key: string): T {
    return this.q<T>(`[data-ob="${key}"]`);
  }

  private buildGrid(): void {
    const grid = this.d('grid');
    for (const f of this.focusOptions) {
      const label = document.createElement('label');
      label.className = 'ob-card';
      label.style.setProperty('--ic', `var(--ob-${f.color})`);
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'ob-focus';
      input.value = f.id;
      const face = document.createElement('span');
      face.className = 'ob-face';
      face.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${f.icon}</svg>`;
      face.appendChild(document.createTextNode(f.label));
      label.append(input, face);
      grid.appendChild(label);
    }
  }

  private buildDots(): void {
    const dots = this.d('dots');
    for (let i = 0; i < STEP_COUNT; i++) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'ob-dot';
      dot.setAttribute('aria-label', `Step ${i + 1} of ${STEP_COUNT}`);
      dot.addEventListener('click', () => {
        if (i < this.step) this.go(i);
      });
      dots.appendChild(dot);
    }
  }

  private wire(): void {
    this.d('next').addEventListener('click', () => this.next());
    this.d('back').addEventListener('click', () => this.step > 0 && this.go(this.step - 1));
    this.d('solo').addEventListener('click', () => {
      this.q<HTMLInputElement>('#ob-company').value = 'Independent';
      this.next();
    });
    for (const id of ['#ob-name', '#ob-company', '#ob-other-text']) {
      const input = this.q<HTMLInputElement>(id);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.next();
        }
      });
      input.addEventListener('input', () => input.classList.remove('ob-bad'));
    }
    for (const radio of Array.from(this.root.querySelectorAll<HTMLInputElement>('input[name="ob-focus"]'))) {
      radio.addEventListener('change', () => {
        const other = this.d<HTMLInputElement>('focus-other').checked;
        this.q<HTMLInputElement>('#ob-other-text').hidden = !other;
        this.d('msg-focus').textContent = '';
        if (other) this.q<HTMLInputElement>('#ob-other-text').focus();
      });
    }
  }

  private first(name: string): string {
    return name.trim().split(/\s+/)[0] ?? '';
  }

  private render(): void {
    const copy: [string, string] =
      this.step === 0
        ? ['Welcome to PrimeTech', 'First, what should we call you?']
        : this.step === 1
          ? [`Nice to meet you, ${this.first(this.name)}`, 'What is your company or studio called?']
          : ['How do you want to use PrimeTech?', 'Choose your primary production focus.'];
    this.d('title').textContent = copy[0];
    this.d('subtitle').textContent = copy[1];

    this.root.querySelectorAll<HTMLElement>('.ob-step').forEach((s) => {
      s.classList.toggle('on', Number(s.dataset.step) === this.step);
    });
    Array.from(this.d('dots').children).forEach((dot, i) => {
      dot.classList.toggle('now', i === this.step);
      dot.classList.toggle('done', i < this.step);
      if (i === this.step) dot.setAttribute('aria-current', 'step');
      else dot.removeAttribute('aria-current');
    });
    this.d('back').hidden = this.step === 0;
    this.d('next-label').textContent = this.step === STEP_COUNT - 1 ? 'Enter Studio' : 'Next';
    for (const key of ['msg-name', 'msg-company', 'msg-focus']) this.d(key).textContent = '';
    this.q('#ob-name').classList.remove('ob-bad');
    this.q('#ob-company').classList.remove('ob-bad');
    if (this.step < 2) {
      const input = this.q<HTMLInputElement>(this.step === 0 ? '#ob-name' : '#ob-company');
      window.setTimeout(() => input.focus(), 60);
    }
  }

  private go(step: number): void {
    this.step = step;
    this.render();
  }

  private fail(inputSel: string, msgKey: string, text: string): void {
    const input = this.q<HTMLInputElement>(inputSel);
    input.classList.add('ob-bad');
    this.d(msgKey).textContent = text;
    input.focus();
  }

  private focusLabel(): string {
    const picked = this.root.querySelector<HTMLInputElement>('input[name="ob-focus"]:checked');
    if (!picked) return '';
    if (picked.value === 'other') return this.q<HTMLInputElement>('#ob-other-text').value.trim();
    return this.focusOptions.find((f) => f.id === picked.value)?.label ?? '';
  }

  private next(): void {
    if (this.step === 0) {
      this.name = this.q<HTMLInputElement>('#ob-name').value.trim();
      if (!this.name) return this.fail('#ob-name', 'msg-name', 'Enter your name to continue.');
      return this.go(1);
    }
    if (this.step === 1) {
      this.company = this.q<HTMLInputElement>('#ob-company').value.trim();
      if (!this.company) {
        return this.fail('#ob-company', 'msg-company', 'Enter a company name, or choose “I work independently.”');
      }
      return this.go(2);
    }
    const picked = this.root.querySelector<HTMLInputElement>('input[name="ob-focus"]:checked');
    if (!picked) {
      this.d('msg-focus').textContent = 'Pick the focus that fits your work best.';
      return;
    }
    if (picked.value === 'other' && !this.focusLabel()) {
      this.d('msg-focus').textContent = 'Tell us what you work on, or pick a focus above.';
      this.q<HTMLInputElement>('#ob-other-text').focus();
      return;
    }
    this.finish(picked.value);
  }

  private finish(focusId: string): void {
    const profile: OnboardingProfile = {
      name: this.name,
      company: this.company,
      focus: focusId === 'other' ? this.focusLabel() : focusId,
      focusLabel: this.focusLabel(),
      done: true,
    };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(profile));
    } catch {
      /* private browsing: the flow still completes */
    }

    const launch = this.d('launch');
    const bar = this.d('bar');
    launch.classList.add('on');
    this.d('launch-title').textContent = `Setting up your studio, ${this.first(this.name)}`;
    const lines = [
      `Creating the ${this.company} workspace`,
      `Loading ${profile.focusLabel} tools`,
      'Connecting AgentSam',
    ];
    let k = 0;
    this.d('launch-line').textContent = lines[0];
    window.setTimeout(() => (bar.style.width = '30%'), 50);
    const timer = window.setInterval(() => {
      k++;
      if (k < lines.length) {
        this.d('launch-line').textContent = lines[k];
        bar.style.width = `${30 + k * 30}%`;
        return;
      }
      window.clearInterval(timer);
      bar.style.width = '100%';
      window.setTimeout(() => this.ready(profile), 600);
    }, 900);
  }

  private ready(profile: OnboardingProfile): void {
    this.d('launch-title').textContent = `You're in, ${this.first(profile.name)}`;
    this.d('launch-line').textContent = `Your ${profile.focusLabel} studio is ready.`;
    this.d('launch').classList.add('ready');
    window.dispatchEvent(new CustomEvent<OnboardingProfile>(ONBOARDED_EVENT, { detail: profile }));
    window.setTimeout(() => this.dismiss(), 1100);
  }

  private dismiss(): void {
    this.root.classList.add('ob-leaving');
    window.setTimeout(() => {
      this.root.remove();
      if (window.location.pathname === '/onboarding') window.history.replaceState(null, '', '/');
    }, 500);
  }
}
