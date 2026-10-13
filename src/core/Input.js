// Keyboard + mouse state with pointer lock.
export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, down: false, clicked: false };
    this.locked = false;
    this.onLockChange = null;

    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    dom.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.clicked = true;
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    const p = this.dom.requestPointerLock?.();
    if (p && p.catch) p.catch(() => {});
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
    this.mouse.clicked = false;
  }
}
