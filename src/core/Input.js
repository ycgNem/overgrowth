// Keyboard + mouse state with pointer lock, rebindable keys, and a gamepad.
//
// Mouse look uses raw (unaccelerated) pointer-lock movement where the browser
// supports it, and drops the single-event spikes Chrome on Windows sometimes
// reports (a few hundred pixels in one event, which snaps the camera).
//
// The game asks for keys by their default code ('KeyE', 'Space'...). A rebinding maps a
// physical key onto one of those: press it and the game sees the default. A gamepad drives the
// same names (and the mouse's look and buttons), and steps through the menus with arrows.
const GAME_KEYS = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const SPIKE = 250; // px in one event; real flicks arrive spread over many events

// what can be rebound, in the Controls page's order: [code the game asks for, what it does]
export const BINDABLE = [
  ['KeyW', 'Forward'], ['KeyS', 'Back'], ['KeyA', 'Left'], ['KeyD', 'Right'], ['Space', 'Jump'], ['ShiftLeft', 'Sprint'],
  ['KeyE', 'Gather, search, open'], ['KeyF', 'Pack up, bury, the benches'], ['KeyG', 'Graft'], ['KeyR', 'Rotate, take all'],
  ['Tab', 'Satchel'], ['KeyT', 'Hurry the day'], ['KeyM', 'Sound on / off'],
];
const BIND_KEY = 'og.keys';

// the standard gamepad layout: buttons -> the codes they press
const PAD = { 0: 'Space', 1: 'KeyF', 2: 'KeyE', 3: 'Tab', 10: 'ShiftLeft', 11: 'KeyR', 12: 'KeyG', 13: 'KeyT' };
const DEAD = 0.18;
const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export function keyName(code) {
  if (!code) return '—';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('Left', ' L').replace('Right', ' R').replace('Space', 'Space');
}

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.pad = new Set(); // codes held on the gamepad
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, down: false, clicked: false, rclicked: false, rdown: false, wheel: 0 };
    this.locked = false;
    this.onLockChange = null;
    this.onPadPause = null; // the gamepad's Start
    this.lockedAt = 0;
    this.padActive = false; // a gamepad has been used (play without the pointer lock)
    this.padLook = 1; // the gamepad's look speed (Settings' sensitivity scales it too)
    this.padPrev = [];
    this.menuNav = () => false; // () => true while a menu (not the game) has the gamepad
    this.binds = {}; // default code -> physical code
    this.loadBinds();

    addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      // a focused button (the menu's Play) must never see Space/Enter as a click
      if ((e.code === 'Space' || e.code === 'Enter') && document.activeElement !== document.body) document.activeElement?.blur?.();
      const code = this.logical(e.code);
      if (!code) return;
      if (!e.repeat) this.pressed.add(code);
      this.keys.add(code);
    });
    addEventListener('keyup', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      const code = this.logical(e.code);
      if (code) this.keys.delete(code);
    });
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = this.mouse.rdown = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const mx = e.movementX, my = e.movementY;
      // the first events after locking can carry the whole cursor travel
      if (performance.now() - this.lockedAt < 80) return;
      if (Math.abs(mx) > SPIKE || Math.abs(my) > SPIKE) return;
      this.mouse.dx += mx;
      this.mouse.dy += my;
    });
    dom.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.clicked = true;
      } else if (e.button === 2) {
        this.mouse.rdown = true;
        this.mouse.rclicked = true;
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
      else if (e.button === 2) this.mouse.rdown = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => {
      if (this.locked) this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (this.locked) this.lockedAt = performance.now();
      this.mouse.dx = this.mouse.dy = 0;
      this.onLockChange?.(this.locked);
    });
  }

  // ---- rebinding
  loadBinds() {
    try {
      this.binds = JSON.parse(localStorage.getItem(BIND_KEY) || '{}') || {};
    } catch {
      this.binds = {};
    }
    this.rev = {};
    for (const [code, phys] of Object.entries(this.binds)) this.rev[phys] = code;
  }

  // the physical key now doing `code`
  bound(code) {
    return this.binds[code] || code;
  }

  // bind `code` (a default) to physical key `phys`. Whatever action had phys (bound to it, or
  // on it by default) swaps onto the key `code` had, so no action is ever left without a key
  rebind(code, phys) {
    const old = this.bound(code);
    if (old === phys) return;
    const actions = new Set([...BINDABLE.map(([c]) => c), ...Object.keys(this.binds)]);
    for (const c of actions) if (c !== code && this.bound(c) === phys) this.binds[c] = old;
    this.binds[code] = phys;
    for (const c of Object.keys(this.binds)) if (this.binds[c] === c) delete this.binds[c];
    try {
      localStorage.setItem(BIND_KEY, JSON.stringify(this.binds));
    } catch {
      // storage blocked: the binding lasts this visit only
    }
    this.loadBinds();
    this.keys.clear();
  }

  resetBinds() {
    this.binds = {};
    try {
      localStorage.removeItem(BIND_KEY);
    } catch {
      // storage blocked
    }
    this.loadBinds();
  }

  // what the game should see for a physical key: its binding, or itself unless it was moved away
  logical(phys) {
    if (this.rev[phys]) return this.rev[phys];
    if (this.binds[phys] && this.binds[phys] !== phys) return null;
    return phys;
  }

  // ---- the gamepad, read once a frame (Game.frame)
  poll(dt) {
    const pads = navigator.getGamepads?.() || [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp) return;
    const btn = (i) => !!gp.buttons[i]?.pressed;
    const prev = this.padPrev;
    const any = gp.buttons.some((b) => b.pressed) || gp.axes.some((a) => Math.abs(a) > 0.4);
    if (any && !this.padActive) this.padActive = true;
    if (!this.padActive) return;
    const rising = (i) => btn(i) && !prev[i];
    if (this.menuNav()) {
      // in a menu: the d-pad and the left stick step, A picks, B backs out
      const ax = gp.axes[1] || 0;
      const stick = ax > 0.6 ? 'down' : ax < -0.6 ? 'up' : null;
      const fire = (code) => {
        dispatchEvent(new KeyboardEvent('keydown', { code, key: code }));
        dispatchEvent(new KeyboardEvent('keyup', { code, key: code }));
      };
      const sx = gp.axes[0] || 0;
      const side = sx > 0.6 ? 'right' : sx < -0.6 ? 'left' : null;
      if (rising(12) || (stick === 'up' && this.padStick !== 'up')) fire('ArrowUp');
      if (rising(13) || (stick === 'down' && this.padStick !== 'down')) fire('ArrowDown');
      if (rising(14) || (side === 'left' && this.padSide !== 'left')) fire('ArrowLeft');
      if (rising(15) || (side === 'right' && this.padSide !== 'right')) fire('ArrowRight');
      this.padSide = side;
      if (rising(0)) fire('Enter');
      if (rising(1)) fire('Escape');
      this.padStick = stick;
      this.pad.clear();
    } else {
      this.pad.clear();
      for (const [i, code] of Object.entries(PAD)) {
        if (btn(+i)) {
          this.pad.add(code);
          if (!prev[i]) this.pressed.add(code);
        }
      }
      const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0);
      if (ly < -0.3) this.pad.add('KeyW');
      if (ly > 0.3) this.pad.add('KeyS');
      if (lx < -0.3) this.pad.add('KeyA');
      if (lx > 0.3) this.pad.add('KeyD');
      // the right stick looks (a curve, so small moves aim finely)
      const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
      const k = 900 * dt * this.padLook;
      this.mouse.dx += Math.sign(rx) * rx * rx * k;
      this.mouse.dy += Math.sign(ry) * ry * ry * k;
      // triggers: RT swings (the left button), LT uses (the right)
      const rt = (gp.buttons[7]?.value ?? 0) > 0.4, lt = (gp.buttons[6]?.value ?? 0) > 0.4;
      if (rt && !this.padRT) this.mouse.clicked = true;
      if (lt && !this.padLT) this.mouse.rclicked = true;
      if (this.padRT !== rt) this.mouse.down = rt;
      if (this.padLT !== lt) this.mouse.rdown = lt;
      this.padRT = rt;
      this.padLT = lt;
      // bumpers step along the belt
      if (rising(4)) this.mouse.wheel -= 1;
      if (rising(5)) this.mouse.wheel += 1;
      if (rising(9)) this.onPadPause?.();
    }
    this.padPrev = gp.buttons.map((b) => b.pressed);
  }

  lock() {
    // unadjustedMovement turns off OS mouse acceleration (Chrome/Edge); fall back if refused
    const raw = this.dom.requestPointerLock?.({ unadjustedMovement: true });
    if (raw && raw.catch) {
      raw.catch(() => {
        const p = this.dom.requestPointerLock?.();
        if (p && p.catch) p.catch(() => {});
      });
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code) || this.pad.has(code);
  }

  hit(code) {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.clicked = this.mouse.rclicked = false;
    this.mouse.wheel = 0;
  }
}
