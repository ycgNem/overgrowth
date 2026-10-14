// Entry point: install shader overrides, boot the game, wire up the menu.
import { installFog, installSoftShadows } from './art/shaders.js';
import { Game } from './core/Game.js';
import { loadSensitivity } from './player/Player.js';
import { loadSave, clearSave, loadBest } from './core/Save.js';

installFog();
// the sun's shadow camera (Sky.js): 96 m across, 1-320 m deep
installSoftShadows({ width: 96, depth: 319 });

const params = new URLSearchParams(location.search);
const debug = params.has('debug');
const time = params.has('t') ? parseFloat(params.get('t')) : null;

const $ = (s) => document.querySelector(s);
const menu = $('#menu');
const play = $('#play');
const newRun = $('#newrun');
const bar = $('#loading-bar');
const text = $('#loading-text');

const game = new Game($('#game'), { debug, time });
// the frame counter is a developer tool
if (!debug) $('#fps')?.classList.add('hidden');
window.game = game; // handy for poking at things from the console

const save = debug ? null : loadSave();

function enter() {
  play.blur(); // a focused button would turn the next Space press into a click
  game.audio.start();
  menu.classList.add('hidden');
  game.hud.show(true);
  game.setPaused(false);
  newRun.classList.add('hidden');
  game.begin();
  if (!debug) game.input.lock();
}

game.input.onLockChange = (locked) => {
  if (debug) return;
  if (!locked && !game.hud.inventoryOpen && !game.modal && game.waves?.phase !== 'over') {
    game.setPaused(true);
    menu.classList.remove('hidden');
    menu.classList.add('ingame');
    play.textContent = 'Resume';
  } else if (locked) {
    menu.classList.add('hidden');
    game.setPaused(false);
  }
};

play.addEventListener('click', () => {
  // the first click on a saved run continues it
  if (save && !game.begun && !game.loaded) game.loadFrom(save);
  enter();
});
newRun.addEventListener('click', () => {
  clearSave();
  enter();
});
// a new run starts from a clean world; reloading is the simplest honest reset
const restart = () => {
  clearSave();
  location.reload();
};
$('#again').addEventListener('click', restart);
$('#victory-new').addEventListener('click', restart);
$('#endless').addEventListener('click', () => game.continueEndless());

// mouse sensitivity, remembered between visits
const sens = $('#sens input');
const sensOut = $('#sens output');
sens.value = String(loadSensitivity());
sensOut.textContent = Number(sens.value).toFixed(2);
sens.addEventListener('input', () => {
  const v = Number(sens.value);
  sensOut.textContent = v.toFixed(2);
  if (game.player) game.player.sensitivity = v;
  try {
    localStorage.setItem('og.sensitivity', String(v));
  } catch {
    // storage blocked: the setting just won't persist
  }
});
sens.addEventListener('change', () => sens.blur());

// glow (bloom) costs a little GPU; let slower machines turn it off
const bloom = $('#bloom-opt input');
try {
  bloom.checked = localStorage.getItem('og.bloom') !== '0';
} catch {
  // default on
}
game.bloom = bloom.checked;
bloom.addEventListener('change', () => {
  game.bloom = bloom.checked;
  bloom.blur();
  try {
    localStorage.setItem('og.bloom', bloom.checked ? '1' : '0');
  } catch {
    // storage blocked
  }
});

// render quality, remembered between visits (applied once the renderer is built)
const quality = $('#quality-opt select');
try {
  quality.value = localStorage.getItem('og.quality') || 'high';
} catch {
  // default high
}
quality.addEventListener('change', () => {
  game.setQuality(quality.value);
  quality.blur();
  try {
    localStorage.setItem('og.quality', quality.value);
  } catch {
    // storage blocked
  }
});

const best = loadBest();
if (best.nights > 0) $('#best').innerHTML = `Best run: <b>${best.nights}</b> night${best.nights === 1 ? '' : 's'} held`;

game.init((p, msg) => {
  bar.style.width = `${Math.round(p * 100)}%`;
  text.textContent = msg;
}).then(() => {
  game.setQuality(quality.value);
  play.disabled = false;
  $('#loading').style.opacity = '0.5';
  if (save) {
    play.textContent = `Continue · Day ${save.night}`;
    newRun.classList.remove('hidden');
  }
  if (debug) enter();
}).catch((err) => {
  console.error(err);
  text.textContent = `Something went wrong: ${err.message}`;
});
