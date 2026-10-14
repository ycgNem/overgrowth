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
// the frame counter is a developer tool
if (!debug) $('#fps')?.classList.add('hidden');
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
    // the pointer lock was refused or dropped on the way in
    if (!debug && !game.input.locked) menu.showPause();
  });
}

// a new run starts from a clean world; reloading is the simplest honest reset
const toTitle = () => {
  game.autosave();
  location.reload();
};

const menu = new Menu(game, {
  save,
  onNew: (diff) => {
    clearSave();
    game.setDifficulty(diff);
    enter();
  },
  onContinue: () => {
    if (!game.loaded) game.loadFrom(save);
    enter();
  },
  onResume: () => game.input.lock(),
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
});
