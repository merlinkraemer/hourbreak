import { startBanana } from "./banana.js";
import { startConfetti } from "./confetti.js";
import { startStarfield } from "./stars.js";

const $ = (id) => document.getElementById(id);

const el = {
  app: $("app"),
  bg: $("bg"),
  stars: $("stars"),
  banana: $("banana"),
  confetti: $("confetti"),
  combo: $("combo"),
  burst: $("burst"),
  party: $("party"),
  title: $("title"),
  hint: $("hint"),
  speaker: $("speaker"),
  activateLabel: $("activate-label"),
  activate: $("activate"),
  flash: $("flash"),
  flashText: $("flash-text"),
};

const SESSION_MS = 3600000;
const BACKGROUND_MS = 30000;
const VOLUME = 0.85;
const MIN_GAP_MIN = 30;
const WINDOW_BEFORE = 160;
const WINDOW_AFTER = 220;
const CRUISE_LEVEL = 12;
const COMBO_BASE = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
const COMBO_FACTORS = [2.5, 2, 2, 5, 2, 2];
const UNITS = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

const GAP_BUCKETS = [
  { weight: 55, min: 30, max: 45 },
  { weight: 30, min: 45, max: 80 },
  { weight: 15, min: 80, max: 150 },
];

const FIRST_GAP = { min: 300, max: 480 };
const BURST_CHANCE = 0.09;

const state = {
  clips: [],
  tricks: [],
  audio: new Map(),
  trickAudio: new Map(),
  backgrounds: [],
  bgIndex: -1,
  recent: [],
  running: false,
  startedAt: 0,
  endsAt: 0,
  nextAt: 0,
  chain: 0,
  windowFrom: 0,
  windowTo: 0,
  queued: false,
};

const root = document.documentElement;
const stars = startStarfield(el.stars);
const scatter = startConfetti(el.confetti);
const banana = startBanana(el.banana, { onLanded: handleLanded });

let missTimer = 0;
let comboHideTimer = 0;
let chaosTimer = 0;

function chaosRank() {
  return Math.min(state.chain, CRUISE_LEVEL);
}

function shortNumber(value) {
  let unit = 0;
  let v = value;
  while (v >= 1000 && unit < UNITS.length - 1) {
    v /= 1000;
    unit += 1;
  }
  const shown = v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
  return String(shown).replace(/\.0+$/, "") + UNITS[unit];
}

function comboLabel(count) {
  if (count <= 0) return "";
  if (count <= COMBO_BASE.length) return "x" + COMBO_BASE[count - 1];
  let value = COMBO_BASE[COMBO_BASE.length - 1];
  for (let i = COMBO_BASE.length; i < count; i += 1) value *= COMBO_FACTORS[(i - COMBO_BASE.length) % COMBO_FACTORS.length];
  return "x" + shortNumber(value);
}

function flipShape(count) {
  const turns = Math.min(1 + Math.floor(Math.max(0, count - 1) / 3), 6);
  const tumble = count >= 5 ? Math.min(1 + Math.floor((count - 5) / 4), 3) : 0;
  return { turns, tumble };
}

function pickClip() {
  const last = state.recent.slice(-3);
  let pool = state.clips.filter((c) => !last.includes(c.file));
  if (!pool.length) pool = state.clips;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickGapMs() {
  const total = GAP_BUCKETS.reduce((sum, b) => sum + b.weight, 0);
  let roll = Math.random() * total;
  const bucket = GAP_BUCKETS.find((b) => (roll -= b.weight) <= 0) || GAP_BUCKETS[0];
  const minutes = bucket.min + (bucket.max - bucket.min) * Math.pow(Math.random(), 1.9);
  return Math.max(MIN_GAP_MIN, minutes) * 60000;
}

function nextBackground() {
  if (!state.backgrounds.length) return;
  let index = state.bgIndex;
  while (index === state.bgIndex) index = Math.floor(Math.random() * state.backgrounds.length);
  state.bgIndex = index;
  el.bg.style.backgroundImage = 'url("thumbs/' + state.backgrounds[index].file + '")';
}

function audioFor(clip) {
  let node = state.audio.get(clip.file);
  if (!node) {
    node = new Audio("sounds/" + clip.file);
    node.preload = "auto";
    node.volume = VOLUME;
    state.audio.set(clip.file, node);
  }
  return node;
}

function trickFor(file) {
  let node = state.trickAudio.get(file);
  if (!node) {
    node = new Audio("tricks/" + file);
    node.preload = "auto";
    node.volume = VOLUME;
    state.trickAudio.set(file, node);
  }
  return node;
}

function playClip(clip) {
  const node = audioFor(clip);
  try {
    node.currentTime = 0;
  } catch {}
  const started = node.play();
  if (started && started.catch) started.catch(() => {});

  state.recent.push(clip.file);
  if (state.recent.length > 6) state.recent.shift();

  el.flashText.textContent = clip.label;
  el.flash.classList.remove("on");
  void el.flash.offsetWidth;
  el.flash.classList.add("on");
  setTimeout(() => el.flash.classList.remove("on"), 1900);

  nextBackground();
}

function fire() {
  const clip = pickClip();
  playClip(clip);
  if (Math.random() < BURST_CHANCE) {
    state.nextAt = Date.now() + 380 + Math.random() * 760;
  } else {
    state.nextAt = Date.now() + clip.seconds * 1000 + pickGapMs();
  }
}

function launch(now, count) {
  state.queued = false;
  if (!banana) return;
  const shape = flipShape(count);
  const ms = banana.kickflip(shape.turns, shape.tumble);
  if (!ms) return;
  state.windowFrom = now + ms - WINDOW_BEFORE;
  state.windowTo = now + ms + WINDOW_AFTER;
  clearTimeout(missTimer);
  missTimer = setTimeout(closeChain, state.windowTo - now + 30);
}

function handleLanded() {
  if (state.queued) launch(performance.now(), state.chain);
}

function playTrick(count) {
  if (!state.tricks.length) return;
  const band = Math.min(Math.floor((count - 1) / 5), state.tricks.length - 1);
  const node = trickFor(state.tricks[band].file);
  try {
    node.currentTime = 0;
  } catch {}
  node.volume = VOLUME;
  node.playbackRate = Math.min(1 + (count - 1) * 0.07, 2.1);
  const started = node.play();
  if (started && started.catch) started.catch(() => {});
}

function playFail() {
  const entry = state.tricks.find((trick) => trick.file === "fail.mp3");
  if (!entry) return;
  const node = trickFor(entry.file);
  try {
    node.currentTime = 0;
  } catch {}
  node.volume = VOLUME;
  node.playbackRate = 1;
  const started = node.play();
  if (started && started.catch) started.catch(() => {});
}

function showCombo(count) {
  const rank = chaosRank();
  const hue = (count * 47) % 360;
  el.combo.textContent = comboLabel(count) + "!".repeat(Math.min(count - 1, 9));
  el.combo.style.setProperty("--level", String(rank));
  el.combo.style.setProperty("--hue", String(hue));
  el.combo.style.setProperty("--pop", String(1.15 + rank * 0.08));
  el.combo.classList.remove("hit");
  void el.combo.offsetWidth;
  el.combo.classList.add("hit");
  clearTimeout(comboHideTimer);
  comboHideTimer = setTimeout(() => el.combo.classList.remove("hit"), 1000);
}

function goCrazy(count) {
  const rank = chaosRank();
  const hue = String((count * 47) % 360);

  root.style.setProperty("--level", String(rank));
  root.style.setProperty("--amp", String(3 + rank * 2.8));
  root.style.setProperty("--hue", hue);

  el.burst.style.setProperty("--level", String(rank));
  el.burst.style.setProperty("--hue", hue);
  el.burst.classList.remove("on");
  void el.burst.offsetWidth;
  el.burst.classList.add("on");

  el.party.style.setProperty("--level", String(rank));
  el.party.style.opacity = String(rank >= 5 ? Math.min((rank - 4) * 0.06, 0.55) : 0);

  const box = el.banana.getBoundingClientRect();
  if (scatter) scatter.burst(Math.min(30 + count * 30, 320), box.left + box.width / 2, box.top + box.height / 2);

  root.classList.remove("chaos");
  void root.offsetWidth;
  root.classList.add("chaos");
  clearTimeout(chaosTimer);
  chaosTimer = setTimeout(() => {
    root.classList.remove("chaos");
    el.party.style.opacity = "0";
  }, Math.max(260, 760 - rank * 34));

  if (banana) {
    banana.pop(count);
    banana.setIntensity(1 + rank * 0.35);
  }
  if (stars) stars.boost(rank);
}

function closeChain() {
  if (state.chain > 0) {
    playFail();
    if (banana) {
      banana.shake(0.16);
      banana.setIntensity(1);
    }
  }
  state.chain = 0;
  el.combo.classList.remove("hit");
}

function hit() {
  if (!banana) return;
  const now = performance.now();
  const inWindow = now >= state.windowFrom && now <= state.windowTo;

  if (inWindow) {
    state.chain += 1;
    state.windowFrom = 0;
    state.windowTo = 0;
    clearTimeout(missTimer);
    showCombo(state.chain);
    playTrick(state.chain);
    goCrazy(state.chain);
    if (banana.isFlipping()) state.queued = true;
    else launch(now, state.chain);
    return;
  }

  if (banana.isFlipping()) return;

  closeChain();
  clearTimeout(missTimer);
  launch(now, 0);
}

function start() {
  if (!state.clips.length || state.running) return;
  state.running = true;
  state.startedAt = Date.now();
  state.endsAt = state.startedAt + SESSION_MS;
  state.recent = [];
  el.app.classList.add("live");
  el.activateLabel.textContent = "deactivate";
  el.speaker.hidden = false;
  if (stars) stars.start();
  if (banana) banana.setActive(true);
  state.nextAt = Date.now() + (FIRST_GAP.min + (FIRST_GAP.max - FIRST_GAP.min) * Math.random()) * 1000;
}

function stop() {
  if (!state.running) return;
  state.running = false;
  el.app.classList.remove("live");
  el.activateLabel.textContent = "activate";
  el.speaker.hidden = true;
  if (stars) stars.stop();
  if (banana) banana.setActive(false);
  closeChain();
}

function update() {
  if (!state.running) return;
  if (Date.now() >= state.endsAt) {
    stop();
    return;
  }
  if (Date.now() >= state.nextAt) fire();
}

let audioUnlocked = false;
function unlock() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  const nodes = [
    ...state.clips.map((clip) => audioFor(clip)),
    ...state.tricks.map((trick) => trickFor(trick.file)),
  ];
  for (const node of nodes) {
    node.volume = 0;
    const started = node.play();
    if (started && started.then) {
      started.then(() => {
        node.pause();
        node.currentTime = 0;
        node.volume = VOLUME;
      }).catch(() => {
        node.volume = VOLUME;
      });
    }
  }
}

el.activate.addEventListener("click", () => {
  if (state.running) {
    stop();
  } else {
    unlock();
    start();
  }
});

el.banana.addEventListener("pointerdown", hit);

async function loadSounds() {
  try {
    const response = await fetch("sounds/manifest.json", { cache: "no-cache" });
    if (!response.ok) return;
    state.clips = await response.json();
  } catch {
    return;
  }
  for (const clip of state.clips) audioFor(clip);
  setInterval(update, 200);
}

async function loadTricks() {
  try {
    const response = await fetch("tricks/manifest.json", { cache: "no-cache" });
    if (!response.ok) return;
    state.tricks = await response.json();
  } catch {
    return;
  }
  for (const trick of state.tricks) trickFor(trick.file);
}

async function loadBackgrounds() {
  try {
    const response = await fetch("thumbs/manifest.json", { cache: "no-cache" });
    if (!response.ok) return;
    state.backgrounds = await response.json();
  } catch {
    return;
  }
  if (!state.backgrounds.length) return;
  nextBackground();
  setInterval(nextBackground, BACKGROUND_MS);
}

loadBackgrounds();
loadSounds();
loadTricks();
