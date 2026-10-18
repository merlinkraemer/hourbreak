import { startObjectLayer } from "./objects.js";

const $ = (id) => document.getElementById(id);

const el = {
  app: $("app"),
  bgA: $("bg-a"),
  bgB: $("bg-b"),
  objects: $("objects"),
  status: $("status"),
  clock: $("clock"),
  sessionLeft: $("session-left"),
  next: $("next"),
  optimizations: $("optimizations"),
  activate: $("activate"),
  length: $("length"),
  volume: $("volume"),
  cheat: $("cheat"),
  jukebox: $("jukebox").tBodies[0],
  libCount: $("lib-count"),
  flash: $("flash"),
  flashText: $("flash-text"),
};

const MIN_GAP_MIN = 30;
const BACKGROUND_MS = 20000;

const GAP_BUCKETS = [
  { weight: 55, min: 30, max: 45 },
  { weight: 30, min: 45, max: 80 },
  { weight: 15, min: 80, max: 150 },
];

const FIRST_GAP = { min: 8, max: 50 };
const BURST_CHANCE = 0.09;

const state = {
  clips: [],
  audio: new Map(),
  backgrounds: [],
  bgIndex: 0,
  bgFront: "a",
  recent: [],
  running: false,
  startedAt: 0,
  endsAt: 0,
  forever: false,
  nextAt: 0,
  lastAt: 0,
  optimizations: 0,
  volume: 0.85,
};

let endTimer = 0;
let lastClock = "";

const pad = (n, w) => String(n).padStart(w, "0");

function mmss(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return pad(Math.floor(s / 60), 2) + ":" + pad(s % 60, 2);
}

function spoken(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return minutes + " MINUTE" + (minutes === 1 ? "" : "S");
  const hours = minutes / 60;
  return (Number.isInteger(hours) ? hours : hours.toFixed(1)) + " HOUR" + (hours === 1 ? "" : "S");
}

function setStatus(text, hot) {
  el.status.textContent = text;
  el.status.classList.toggle("hot", Boolean(hot));
}

function showBackground() {
  if (!state.backgrounds.length) return;
  const incoming = state.bgFront === "a" ? el.bgB : el.bgA;
  const outgoing = state.bgFront === "a" ? el.bgA : el.bgB;
  incoming.style.backgroundImage = 'url("thumbs/' + state.backgrounds[state.bgIndex].file + '")';
  incoming.classList.remove("on");
  void incoming.offsetWidth;
  incoming.classList.add("on");
  outgoing.classList.remove("on");
  state.bgFront = state.bgFront === "a" ? "b" : "a";
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
    node.volume = state.volume;
    state.audio.set(clip.file, node);
  }
  return node;
}

function announce(clip) {
  el.flashText.textContent = clip.label;
  el.flash.classList.remove("on");
  void el.flash.offsetWidth;
  el.flash.classList.add("on");
  el.app.classList.remove("shake");
  void el.app.offsetWidth;
  el.app.classList.add("shake");
  setTimeout(() => el.app.classList.remove("shake"), 500);
  setTimeout(() => el.flash.classList.remove("on"), 1900);
}

function playClip(clip) {
  const node = audioFor(clip);
  try {
    node.currentTime = 0;
  } catch {}
  node.volume = state.volume;
  const started = node.play();
  if (started && started.catch) {
    started.catch(() => setStatus("click the page first, then try again", true));
  }

  state.recent.push(clip.file);
  if (state.recent.length > 6) state.recent.shift();
  state.lastAt = Date.now();

  announce(clip);
  showBackground();

  if (state.running) {
    setStatus(clip.label, true);
    state.optimizations += 1;
    el.optimizations.textContent = state.optimizations;
    clearTimeout(endTimer);
    endTimer = setTimeout(() => setStatus("running", false), clip.seconds * 1000 + 150);
  }
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
  if (!state.clips.length) return;
  const value = el.length.value;
  state.forever = value === "forever";
  const span = state.forever ? 0 : Number(value);

  state.running = true;
  state.startedAt = Date.now();
  state.endsAt = state.forever ? Infinity : state.startedAt + span;
  state.lastAt = state.startedAt;
  state.optimizations = 0;
  state.recent = [];

  el.optimizations.textContent = "0";
  el.clock.textContent = "00:00";
  lastClock = "";
  setStatus(state.forever ? "running forever" : "running for " + spoken(span), false);
  el.activate.textContent = "deactivate";
  el.activate.classList.add("on");

  state.nextAt = Date.now() + (FIRST_GAP.min + (FIRST_GAP.max - FIRST_GAP.min) * Math.random()) * 1000;
  if (!el.cheat.checked) el.next.textContent = "??:??";
}

function stop(timeUp) {
  if (!state.running) return;
  state.running = false;
  el.activate.textContent = "activate";
  el.activate.classList.remove("on");
  setStatus(timeUp
    ? "session complete \u2014 " + state.optimizations + " optimizations"
    : "paused", false);
  el.next.textContent = "--:--";
  document.title = "PRODUCTIVITY BOOST X1000";
}

function update() {
  const now = Date.now();

  if (state.running) {
    if (!state.forever && now >= state.endsAt) {
      stop(true);
    } else {
      if (now >= state.nextAt) fire();

      const left = state.forever ? now - state.startedAt : state.endsAt - now;
      el.sessionLeft.textContent = (state.forever ? "\u221e " : "") + mmss(left);

      const clock = mmss(now - state.lastAt);
      if (clock !== lastClock) {
        lastClock = clock;
        el.clock.textContent = clock;
        document.title = "\u25b8 " + clock + " \u2014 PRODUCTIVITY BOOST X1000";
      }

      if (el.cheat.checked) el.next.textContent = mmss(Math.max(0, state.nextAt - now));
    }
  }
}

function buildJukebox() {
  el.jukebox.textContent = "";
  for (const clip of state.clips) {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = clip.label;
    const cell = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "PREVIEW";
    button.addEventListener("click", () => playClip(clip));
    cell.append(button);
    row.append(name, cell);
    el.jukebox.append(row);
  }
  el.libCount.textContent = state.clips.length;
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
        node.volume = state.volume;
      }).catch(() => {
        node.volume = state.volume;
      });
    }
  }
}

el.activate.addEventListener("click", () => {
  if (state.running) {
    stop(false);
  } else {
    unlock();
    start();
  }
});

el.length.addEventListener("change", () => {
  if (state.running) stop(false);
});

el.volume.addEventListener("input", () => {
  state.volume = Number(el.volume.value) / 100;
  for (const node of state.audio.values()) node.volume = state.volume;
});

el.cheat.addEventListener("change", () => {
  if (state.running) el.next.textContent = el.cheat.checked ? mmss(Math.max(0, state.nextAt - Date.now())) : "??:??";
});

async function loadSounds() {
  try {
    const response = await fetch("sounds/manifest.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    state.clips = await response.json();
  } catch (error) {
    setStatus("sounds/manifest.json: " + error.message, true);
    return;
  }
  buildJukebox();
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
  for (const item of state.backgrounds) {
    const img = new Image();
    img.src = "thumbs/" + item.file;
  }
  showBackground();
  setInterval(showBackground, BACKGROUND_MS);
}

startObjectLayer(el.objects);
loadBackgrounds();
loadSounds();
