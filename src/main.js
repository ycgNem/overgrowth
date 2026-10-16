// Entry point: install shader overrides, boot the game, run the title and pause menus.
import { installFog, installSoftShadows } from './art/shaders.js';
import { Game } from './core/Game.js';
import { loadSave, clearSave } from './core/Save.js';
import { Menu } from './ui/Menu.js';

installFog();
// the sun's shadow camera (Sky.js): 96 m across, 1-320 m deep
installSoftShadows({ width: 96, depth: 319 });

const params = new URLSearchParams(location.search);
const debug = params.has('debug');
const time = params.has('t') ? parseFloat(params.get('t')) : null;

const $ = (s) => document.querySelector(s);

const game = new Game($('#game'), { debug, time });
// (the frame counter shows with Settings > Show FPS, or always with ?debug: Menu.applySettings)
window.game = game; // handy for poking at things from the console

const save = debug ? null : loadSave();

// into the forest: the menu dissolves, the camera flies down to the player's eye, then play
function enter() {
  menu.leave();
  game.audio.start();
  if (!debug) game.input.lock();
  game.flyIn(() => {
    menu.hide();
    game.hud.show(true);
    game.setPaused(false);
    game.begin();
    // the pointer lock was refused or dropped on the way in (a gamepad plays without it)
    if (!debug && !game.input.locked && !game.input.padActive) menu.showPause();
  });
}

// a new run starts from a clean world; reloading is the simplest honest reset
const toTitle = () => {
  game.autosave();
  location.reload();
};

const menu = new Menu(game, {
  save,
  onNew: (diff, kit) => {
    clearSave();
    game.setDifficulty(diff, kit);
    enter();
  },
  onContinue: () => {
    if (!game.loaded) game.loadFrom(save);
    enter();
  },
  onResume: () => {
    game.input.lock();
    // a gamepad can't take the pointer lock: just carry on
    if (game.input.padActive) {
      menu.hidePause();
      game.setPaused(false);
    }
  },
  onQuit: toTitle,
});
window.menu = menu; // (and for e2e screenshots)
window.menuOpen = (name) => menu.open(name);

game.input.onLockChange = (locked) => {
  if (debug || menu.mode === 'flying' || menu.mode === 'title' || menu.mode === 'boot') return;
  if (!locked && !game.hud.inventoryOpen && !game.modal && game.waves?.phase !== 'over') {
    game.setPaused(true);
    menu.showPause();
  } else if (locked && menu.mode === 'pause') {
    menu.hidePause();
    game.setPaused(false);
  }
};

// the gamepad: Start pauses; in a menu it steps through it
game.input.onPadPause = () => {
  if (menu.mode === 'play' && !game.paused && !game.modal) {
    game.setPaused(true);
    menu.showPause();
  }
};
game.input.menuNav = () => (menu.mode !== 'play' && menu.mode !== 'flying') || game.paused || !!game.modal;

// The overlays that are buttons and cards (boons, the endings, victory, game over) answer the
// arrow keys and Enter too, so a gamepad (which sends those in a menu) can pick on them
const OVERLAYS = ['#perks', '#ending', '#victory', '#gameover'];
let padFocus = 0;
addEventListener('keydown', (e) => {
  if (!game.modal) return;
  const el = OVERLAYS.map((s) => $(s)).find((o) => o && !o.classList.contains('hidden'));
  if (!el) return;
  const items = [...el.querySelectorAll('button, .perk')].filter((b) => b.offsetParent && !b.disabled);
  if (!items.length) return;
  const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.code];
  const cur = items.findIndex((b) => b.classList.contains('padfocus'));
  if (step) {
    padFocus = ((cur < 0 ? 0 : cur + step) + items.length) % items.length;
    for (const b of items) b.classList.remove('padfocus');
    items[padFocus].classList.add('padfocus');
    e.preventDefault();
  } else if (e.code === 'Enter') {
    (items[cur] || items.find((b) => b.classList.contains('primary')) || items[0]).click();
    for (const b of items) b.classList.remove('padfocus');
    e.preventDefault();
  }
});

const again = () => {
  clearSave();
  location.reload();
};
$('#again').addEventListener('click', again);
$('#over-title').addEventListener('click', () => location.reload());
$('#victory-title').addEventListener('click', toTitle);
$('#endless').addEventListener('click', () => game.continueEndless());

game.init((p, msg) => menu.progress(p, msg)).then(() => {
  menu.applyLoaded();
  if (debug) {
    $('#menu').classList.add('hidden');
    $('#title-fade').classList.add('hidden');
    menu.mode = 'flying';
    enter();
    return;
  }
  game.startTitle();
  menu.ready();
}).catch((err) => {
  console.error(err);
  menu.progress(1, `Something went wrong: ${err.message}`);
  // a daily or seeded world that won't build: a way back to the usual forest
  if (params.has('daily') || params.has('seed')) {
    const a = document.createElement('a');
    a.href = location.pathname;
    a.textContent = 'Back to the usual forest';
    a.style.cssText = 'display:block;margin-top:10px;color:#8affb0;pointer-events:auto';
    $('#loading-text').after(a);
  }
});
