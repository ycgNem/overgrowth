// Keyboard + mouse state with pointer lock.
//
// Mouse look uses raw (unaccelerated) pointer-lock movement where the browser
// supports it, and drops the single-event spikes Chrome on Windows sometimes
// reports (a few hundred pixels in one event, which snaps the camera).
const GAME_KEYS = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const SPIKE = 250; // px in one event; real flicks arrive spread over many events

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, down: false, clicked: false, rclicked: false, rdown: false, wheel: 0 };
    this.locked = false;
    this.onLockChange = null;
    this.lockedAt = 0;

    addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      // a focused button (the menu's Play) must never see Space/Enter as a click
      if ((e.code === 'Space' || e.code === 'Enter') && document.activeElement !== document.body) document.activeElement?.blur?.();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      this.keys.delete(e.code);
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
    return this.keys.has(code);
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
