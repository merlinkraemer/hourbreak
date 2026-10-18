import { startObjectLayer } from "./objects.js";
import { startStarfield } from "./stars.js";
import { createSeven } from "./seven.js";

const $ = (id) => document.getElementById(id);

const el = {
  bg: $("bg"),
  stars: $("stars"),
  objects: $("objects"),
  title: $("title"),
  clock: $("clock"),
  hint: $("hint"),
  activate: $("activate"),
  flash: $("flash"),
  flashText: $("flash-text"),
};

const SESSION_MS = 3600000;
const BACKGROUND_MS = 180000;
const VOLUME = 0.85;
const MIN_GAP_MIN = 30;

const GAP_BUCKETS = [
  { weight: 55, min: 30, max: 45 },
  { weight: 30, min: 45, max: 80 },
  { weight: 15, min: 80, max: 150 },
];

const FIRST_GAP = { min: 300, max: 480 };
const BURST_CHANCE = 0.09;

const state = {
  clips: [],
  audio: new Map(),
  backgrounds: [],
  bgIndex: 0,
  recent: [],
  running: false,
  startedAt: 0,
  endsAt: 0,
  nextAt: 0,
};

const seven = createSeven(el.clock, "00:00");
const stars = startStarfield(el.stars);

const pad = (n, w) => String(n).padStart(w, "0");

function mmss(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return pad(Math.floor(s / 60), 2) + ":" + pad(s % 60, 2);
}

function nextBackground() {
  if (!state.backgrounds.length) return;
  el.bg.style.backgroundImage = 'url("thumbs/' + state.backgrounds[state.bgIndex].file + '")';
  state.bgIndex = (state.bgIndex + 1) % state.backgrounds.length;
}

function pickGapMs() {
  const total = GAP_BUCKETS.reduce((sum, b) => sum + b.weight, 0);
  let roll = Math.random() * total;
  const bucket = GAP_BUCKETS.find((b) => (roll -= b.weight) <= 0) || GAP_BUCKETS[0];
  const minutes = bucket.min + (bucket.max - bucket.min) * Math.pow(Math.random(), 1.9);
  return Math.max(MIN_GAP_MIN, minutes) * 60000;
}

function pickClip() {
  const last = state.recent.slice(-3);
  let pool = state.clips.filter((c) => !last.includes(c.file));
  if (!pool.length) pool = state.clips;
  return pool[Math.floor(Math.random() * pool.length)];
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

function start() {
  if (!state.clips.length || state.running) return;
  state.running = true;
  state.startedAt = Date.now();
  state.endsAt = state.startedAt + SESSION_MS;
  state.recent = [];

  seven.set("00:00");
  el.title.hidden = true;
  el.clock.hidden = false;
  el.hint.hidden = false;
  el.activate.textContent = "deactivate";
  if (stars) stars.start();

  const first = FIRST_GAP.min + (FIRST_GAP.max - FIRST_GAP.min) * Math.random();
  state.nextAt = Date.now() + first * 1000;
}

function stop() {
  if (!state.running) return;
  state.running = false;
  el.title.hidden = false;
  el.clock.hidden = true;
  el.hint.hidden = true;
  el.activate.textContent = "activate";
  if (stars) stars.stop();
}

function update() {
  if (!state.running) return;
  const now = Date.now();
  if (now >= state.endsAt) {
    seven.set(mmss(SESSION_MS));
    stop();
    return;
  }
  if (now >= state.nextAt) fire();
  seven.set(mmss(now - state.startedAt));
}

let audioUnlocked = false;
function unlock() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  for (const clip of state.clips) {
    const node = audioFor(clip);
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

startObjectLayer(el.objects);
loadBackgrounds();
loadSounds();
