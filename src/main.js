// Entry point: install shader overrides, boot the game, wire up the menu.
import { installFog } from './art/shaders.js';
import { Game } from './core/Game.js';
import { loadSensitivity } from './player/Player.js';

installFog();

const params = new URLSearchParams(location.search);
const debug = params.has('debug');
const time = params.has('t') ? parseFloat(params.get('t')) : null;

const $ = (s) => document.querySelector(s);
const menu = $('#menu');
const play = $('#play');
const bar = $('#loading-bar');
const text = $('#loading-text');

const game = new Game($('#game'), { debug, time });
window.game = game; // handy for poking at things from the console

function enter() {
  play.blur(); // a focused button would turn the next Space press into a click
  game.audio.start();
  menu.classList.add('hidden');
  game.hud.show(true);
  game.setPaused(false);
  if (!debug) game.input.lock();
}

game.input.onLockChange = (locked) => {
  if (debug) return;
  if (!locked && !game.hud.inventoryOpen && game.waves?.phase !== 'over') {
    game.setPaused(true);
    menu.classList.remove('hidden');
    menu.classList.add('ingame');
    play.textContent = 'Resume';
  } else if (locked) {
    menu.classList.add('hidden');
    game.setPaused(false);
  }
};

play.addEventListener('click', enter);
$('#again').addEventListener('click', () => location.reload());

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

game.init((p, msg) => {
  bar.style.width = `${Math.round(p * 100)}%`;
  text.textContent = msg;
}).then(() => {
  play.disabled = false;
  $('#loading').style.opacity = '0.5';
  if (debug) enter();
}).catch((err) => {
  console.error(err);
  text.textContent = `Something went wrong: ${err.message}`;
});
