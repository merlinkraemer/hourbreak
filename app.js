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
  grade: $("grade"),
  ring: $("ring"),
  burst: $("burst"),
  party: $("party"),
  strobe: $("strobe"),
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
const TRICK_VOLUME = 0.85;
const LOUD_GAIN = 3.6;
const MIN_GAP_MIN = 30;
const WINDOW_BEFORE = 170;
const WINDOW_AFTER = 230;
const WINDOW_FLOOR_BEFORE = 95;
const WINDOW_FLOOR_AFTER = 140;
const WINDOW_SHRINK = 4;
const PERFECT_MS = 45;
const LOCK_MS = 500;
const CRUISE_RANK = 20;
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
  upcoming: null,
  trickSource: null,
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
  landAt: 0,
  attemptLive: false,
  queued: false,
  lockUntil: 0,
};

const root = document.documentElement;
const stars = startStarfield(el.stars);
const scatter = startConfetti(el.confetti);
const banana = startBanana(el.banana, { onLanded: handleLanded });

let missTimer = 0;
let comboHideTimer = 0;
let chaosTimer = 0;
let gradeTimer = 0;
let audioContext = null;
let loudInput = null;
let trickInput = null;
const buffers = new Map();

function heat() {
  return Math.min(2, state.chain / 11);
}

function comboLabel(count) {
  if (count <= 0) return "";
  if (count <= COMBO_BASE.length) return "x" + COMBO_BASE[count - 1];
  let value = COMBO_BASE[COMBO_BASE.length - 1];
  for (let i = COMBO_BASE.length; i < count; i += 1) {
    value *= COMBO_FACTORS[(i - COMBO_BASE.length) % COMBO_FACTORS.length];
  }
  let unit = 0;
  let shown = value;
  while (shown >= 1000 && unit < UNITS.length - 1) {
    shown /= 1000;
    unit += 1;
  }
  const rounded = shown >= 100 ? Math.round(shown) : shown >= 10 ? Math.round(shown * 10) / 10 : Math.round(shown * 100) / 100;
  return "x" + String(rounded).replace(/\.0+$/, "") + UNITS[unit];
}

function flipShape(count) {
  const turns = Math.min(1 + Math.floor(Math.max(0, count - 1) / 3), 6);
  const tumble = count >= 5 ? Math.min(1 + Math.floor((count - 5) / 4), 3) : 0;
  return { turns, tumble };
}

function splitTitle() {
  const text = el.title.textContent;
  el.title.textContent = "";
  [...text].forEach((char, index) => {
    const span = document.createElement("span");
    span.style.setProperty("--i", String(index));
    span.textContent = char;
    el.title.append(span);
  });
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

function clipCurve() {
  const points = 4096;
  const curve = new Float32Array(points);
  const knee = Math.tanh(2.2);
  for (let i = 0; i < points; i += 1) {
    const x = (i / (points - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2.2) / knee;
  }
  return curve;
}

function audioGraph() {
  if (audioContext) return audioContext;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioContext = new Ctx();
  const gain = audioContext.createGain();
  gain.gain.value = LOUD_GAIN;
  const shaper = audioContext.createWaveShaper();
  shaper.curve = clipCurve();
  shaper.oversample = "2x";
  gain.connect(shaper);
  shaper.connect(audioContext.destination);
  loudInput = gain;
  trickInput = audioContext.createGain();
  trickInput.gain.value = TRICK_VOLUME;
  trickInput.connect(audioContext.destination);
  return audioContext;
}

function wakeAudio() {
  const ctx = audioGraph();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}

function loadBuffer(url) {
  let pending = buffers.get(url);
  if (!pending) {
    const ctx = audioGraph();
    if (!ctx) return Promise.reject(new Error("Web Audio unavailable"));
    pending = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(url + " " + response.status);
        return response.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data));
    pending.catch(() => buffers.delete(url));
    buffers.set(url, pending);
  }
  return pending;
}

function playBuffer(url, input, rate) {
  return loadBuffer(url).then((buffer) => {
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate || 1;
    source.connect(input);
    source.start();
    return source;
  });
}

function queueClip() {
  state.upcoming = pickClip();
  loadBuffer("sounds/" + state.upcoming.file).catch(() => {});
}

function playClip(clip) {
  playBuffer("sounds/" + clip.file, loudInput).catch(() => {});

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
  const clip = state.upcoming || pickClip();
  playClip(clip);
  queueClip();
  if (Math.random() < BURST_CHANCE) {
    state.nextAt = Date.now() + 380 + Math.random() * 760;
  } else {
    state.nextAt = Date.now() + clip.seconds * 1000 + pickGapMs();
  }
}

function launch(now, count) {
  state.queued = false;
  state.attemptLive = true;
  if (!banana) return;
  const shape = flipShape(count);
  const ms = banana.kickflip(shape.turns, shape.tumble);
  if (!ms) {
    state.attemptLive = false;
    return;
  }
  const shrink = count * WINDOW_SHRINK;
  state.landAt = now + ms;
  state.windowFrom = state.landAt - Math.max(WINDOW_FLOOR_BEFORE, WINDOW_BEFORE - shrink);
  state.windowTo = state.landAt + Math.max(WINDOW_FLOOR_AFTER, WINDOW_AFTER - shrink);
  showRing(ms, state.windowTo - state.landAt);
  clearTimeout(missTimer);
  missTimer = setTimeout(() => closeChain("late"), state.windowTo - now + 30);
}

function restart(node, ...classes) {
  node.classList.remove("closing", "open", "miss", "hit", "broke", "perfect");
  void node.offsetWidth;
  node.classList.add(...classes);
}

function showRing(closeMs, openMs) {
  el.ring.style.setProperty("--close", Math.round(closeMs) + "ms");
  el.ring.style.setProperty("--open", Math.round(openMs) + "ms");
  el.ring.style.setProperty("--hue", String((state.chain * 47 + 60) % 360));
  restart(el.ring, "closing");
}

function showGrade(text, kind) {
  el.grade.textContent = text;
  restart(el.grade, kind);
  clearTimeout(gradeTimer);
  gradeTimer = setTimeout(() => el.grade.classList.remove("hit", "perfect", "miss"), 900);
}

function handleLanded() {
  if (state.queued) launch(performance.now(), state.chain);
}

function playTrick(file, rate) {
  if (!audioContext) return;
  if (state.trickSource) {
    try {
      state.trickSource.stop();
    } catch {}
  }
  playBuffer("tricks/" + file, trickInput, rate)
    .then((source) => {
      state.trickSource = source;
    })
    .catch(() => {});
}

function playComboTrick(count) {
  if (!state.tricks.length) return;
  const band = Math.min(Math.floor((count - 1) / 5), state.tricks.length - 1);
  playTrick(state.tricks[band].file, Math.min(1 + (count - 1) * 0.07, 2.1));
}

function playFail() {
  if (state.tricks.some((trick) => trick.file === "fail.mp3")) playTrick("fail.mp3", 1);
}

function showCombo(count) {
  const rank = Math.min(count, CRUISE_RANK);
  el.combo.textContent = comboLabel(count) + "!".repeat(Math.min(count - 1, 4));
  el.combo.style.setProperty("--level", String(rank));
  el.combo.style.setProperty("--hue", String((count * 47) % 360));
  el.combo.style.setProperty("--pop", String(1.1 + heat() * 0.45));
  restart(el.combo, "hit");
  clearTimeout(comboHideTimer);
  comboHideTimer = setTimeout(() => el.combo.classList.remove("hit"), 1000);
}

function goCrazy(count) {
  const rank = Math.min(count, CRUISE_RANK);
  const power = heat();
  const hue = String((count * 47) % 360);

  root.style.setProperty("--level", String(rank));
  root.style.setProperty("--chaos", power.toFixed(3));
  root.style.setProperty("--amp", (1 + power * 26).toFixed(2));
  root.style.setProperty("--tilt", (power * 4).toFixed(2));
  root.style.setProperty("--hue", hue);
  root.classList.toggle("hard", power >= 1.05);

  el.burst.style.setProperty("--level", String(rank));
  el.burst.style.setProperty("--hue", hue);
  el.burst.style.setProperty("--burst", Math.min(power * 0.45, 0.75).toFixed(3));
  el.burst.classList.remove("on");
  void el.burst.offsetWidth;
  el.burst.classList.add("on");

  el.party.style.setProperty("--level", String(rank));
  el.party.style.opacity = String(power >= 0.55 ? Math.min((power - 0.45) * 0.3, 0.32) : 0);
  el.strobe.style.opacity = String(power >= 1 ? Math.min((power - 0.9) * 0.18, 0.16) : 0);

  const box = el.banana.getBoundingClientRect();
  if (scatter) {
    scatter.burst(Math.round(Math.min(power * 200, 380)), box.left + box.width / 2, box.top + box.height / 2);
  }

  root.classList.remove("chaos");
  void root.offsetWidth;
  root.classList.add("chaos");
  clearTimeout(chaosTimer);
  chaosTimer = setTimeout(() => {
    root.classList.remove("chaos", "hard");
    el.party.style.opacity = "0";
    el.strobe.style.opacity = "0";
  }, Math.round(420 + power * 430));

  if (banana) {
    banana.pop(0.05 + power * 0.3);
    banana.setIntensity(1 + power * 4);
  }
  if (stars) stars.boost(power * 16);
}

function closeChain(reason) {
  const broke = state.chain > 0;
  const clicked = reason === "early";
  if (broke || clicked) {
    if (broke) playFail();
    if (banana) {
      banana.abort();
      banana.wobble(broke ? 1 : 0.55);
      banana.setIntensity(1);
    }
    restart(el.ring, "miss");
    if (reason) showGrade(clicked ? "TOO EARLY" : "TOO LATE", "miss");
  } else {
    el.ring.classList.remove("closing", "open");
  }
  if (broke) {
    el.combo.textContent = comboLabel(state.chain);
    restart(el.combo, "broke");
  } else {
    el.combo.classList.remove("hit");
  }
  state.chain = 0;
  state.attemptLive = false;
  state.queued = false;
  state.lockUntil = performance.now() + LOCK_MS;
}

function hit() {
  if (!banana) return;
  const now = performance.now();
  if (now < state.lockUntil) return;
  const inWindow = now >= state.windowFrom && now <= state.windowTo;

  if (inWindow) {
    const perfect = Math.abs(now - state.landAt) <= PERFECT_MS;
    state.chain += 1;
    state.windowFrom = 0;
    state.windowTo = 0;
    state.attemptLive = true;
    clearTimeout(missTimer);
    restart(el.ring, perfect ? "perfect" : "hit");
    showGrade(perfect ? "PERFECT!" : "NICE", perfect ? "perfect" : "hit");
    showCombo(state.chain);
    playComboTrick(state.chain);
    goCrazy(state.chain + (perfect ? 2 : 0));
    if (banana.isFlipping()) state.queued = true;
    else launch(now, state.chain);
    return;
  }

  if (state.attemptLive) {
    closeChain("early");
    return;
  }

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
  queueClip();
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

root.addEventListener("pointerdown", wakeAudio);
root.addEventListener("touchend", wakeAudio);

el.activate.addEventListener("click", () => {
  if (state.running) {
    stop();
  } else {
    wakeAudio();
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
  for (const trick of state.tricks) loadBuffer("tricks/" + trick.file).catch(() => {});
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

splitTitle();
loadBackgrounds();
loadSounds();
if (document.readyState === "complete") loadTricks();
else window.addEventListener("load", loadTricks, { once: true });
