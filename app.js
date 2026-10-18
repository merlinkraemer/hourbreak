(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const el = {
    page: $("page"),
    bgA: $("bg-a"),
    bgB: $("bg-b"),
    clock: $("clock"),
    lcdLabel: $("lcd-label"),
    sessionLeft: $("session-left"),
    next: $("next"),
    optimizations: $("optimizations"),
    meter: $("meter"),
    meterBar: $("meter").firstElementChild,
    start: $("start"),
    stop: $("stop"),
    length: $("length"),
    volume: $("volume"),
    cheat: $("cheat"),
    hint: $("hint"),
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
  const IDLE_TITLE = " \u2764 HOURBREAK \u2764 KEEP THIS TAB OPEN TO WORK BETTER ";
  const IDLE_HINT = "PRESS START, THEN LEAVE THIS TAB OPEN AND GO DO SOMETHING ELSE. THAT IS THE ENTIRE METHODOLOGY.";

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
    titleOffset: 0,
    lastClock: "",
  };

  let endTimer = 0;

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

  function showBackground(advance) {
    if (!state.backgrounds.length) return;
    const incoming = state.bgFront === "a" ? el.bgB : el.bgA;
    const outgoing = state.bgFront === "a" ? el.bgA : el.bgB;
    incoming.style.backgroundImage = 'url("thumbs/' + state.backgrounds[state.bgIndex].file + '")';
    incoming.classList.remove("on");
    void incoming.offsetWidth;
    incoming.classList.add("on");
    outgoing.classList.remove("on");
    state.bgFront = state.bgFront === "a" ? "b" : "a";
    if (advance !== false) state.bgIndex = (state.bgIndex + 1) % state.backgrounds.length;
  }

  function pickGapMs() {
    const total = GAP_BUCKETS.reduce((sum, b) => sum + b.weight, 0);
    let roll = Math.random() * total;
    const bucket = GAP_BUCKETS.find((b) => (roll -= b.weight) <= 0) || GAP_BUCKETS[0];
    const minutes = bucket.min + (bucket.max - bucket.min) * Math.pow(Math.random(), 1.9);
    return Math.max(MIN_GAP_MIN, minutes) * 60000;
  }

  function pickFirstGapMs() {
    return (FIRST_GAP.min + (FIRST_GAP.max - FIRST_GAP.min) * Math.random()) * 1000;
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

  function syncMeter(percent) {
    const hidden = !el.cheat.checked;
    el.meter.classList.toggle("hidden-bar", hidden);
    el.meterBar.style.width = (hidden ? 100 : Math.max(0, Math.min(100, percent || 0))) + "%";
  }

  function announce(clip) {
    el.flashText.textContent = clip.label;
    el.flash.classList.remove("on");
    void el.flash.offsetWidth;
    el.flash.classList.add("on");
    el.page.classList.remove("shake");
    void el.page.offsetWidth;
    el.page.classList.add("shake");
    setTimeout(() => el.page.classList.remove("shake"), 500);
    setTimeout(() => el.flash.classList.remove("on"), 1800);
  }

  function playClip(clip) {
    const node = audioFor(clip);
    try {
      node.currentTime = 0;
    } catch {}
    node.volume = state.volume;
    const started = node.play();
    if (started && started.catch) {
      started.catch(() => {
        el.hint.textContent = "YOUR BROWSER IS BLOCKING THE PRODUCTIVITY. CLICK ANYWHERE ON THIS PAGE, THEN PRESS START AGAIN.";
      });
    }

    state.recent.push(clip.file);
    if (state.recent.length > 6) state.recent.shift();
    state.lastAt = Date.now();

    announce(clip);
    showBackground();
    if (state.running) {
      el.lcdLabel.textContent = "DEEP WORK";
      el.lcdLabel.classList.add("hot");
      state.optimizations += 1;
      el.optimizations.textContent = state.optimizations;
      clearTimeout(endTimer);
      endTimer = setTimeout(() => {
        el.lcdLabel.textContent = "FOCUS";
        el.lcdLabel.classList.remove("hot");
      }, clip.seconds * 1000 + 120);
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
    state.lastClock = "";
    el.optimizations.textContent = "0";
    el.clock.textContent = "00:00";
    el.next.textContent = "??:??";

    el.start.disabled = true;
    el.stop.disabled = false;
    el.hint.textContent = state.forever
      ? "RUNNING FOREVER. THE NEXT OPTIMIZATION IS AT LEAST 30 MINUTES AWAY."
      : "RUNNING FOR " + spoken(span) + ". THE NEXT OPTIMIZATION IS AT LEAST 30 MINUTES AWAY.";
    syncMeter(0);

    audioFor(state.clips[0]);
    state.nextAt = Date.now() + pickFirstGapMs();
  }

  function stop(timeUp) {
    if (!state.running) return;
    state.running = false;
    el.start.disabled = false;
    el.stop.disabled = true;
    el.lcdLabel.textContent = "FOCUS";
    el.lcdLabel.classList.remove("hot");
    el.hint.textContent = timeUp
      ? "SESSION COMPLETE \u2014 " + state.optimizations + " OPTIMIZATIONS. YOUR OUTPUT IS NOW ROUGHLY 1000% HIGHER."
      : "PAUSED. YOUR POTENTIAL IS WAITING FOR YOU.";
    el.next.textContent = "--:--";
    syncMeter(100);
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

        if (el.cheat.checked) {
          el.next.textContent = mmss(Math.max(0, state.nextAt - now));
          const span = state.nextAt - state.lastAt;
          syncMeter(span > 0 ? ((now - state.lastAt) / span) * 100 : 0);
        }
      }
    }

    const since = state.running ? state.lastAt : 0;
    if (since) {
      const clock = mmss(now - since);
      if (clock !== state.lastClock) {
        state.lastClock = clock;
        el.clock.textContent = clock;
        if (!state.forever) document.title = "\u25cf " + clock + " of focus \u2014 HOURBREAK";
      }
    }

    if (!state.running) {
      state.titleOffset = (state.titleOffset + 1) % IDLE_TITLE.length;
      document.title = (IDLE_TITLE + IDLE_TITLE).slice(state.titleOffset, state.titleOffset + 48);
    }
  }

  function buildJukebox() {
    el.jukebox.textContent = "";
    for (const clip of state.clips) {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      name.className = "name";
      name.textContent = clip.label;
      const go = document.createElement("td");
      go.className = "go";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "PREVIEW";
      button.addEventListener("click", () => playClip(clip));
      go.append(button);
      row.append(name, go);
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

  function wire() {
    el.start.addEventListener("click", () => {
      unlock();
      start();
    });

    el.stop.addEventListener("click", () => stop(false));

    el.length.addEventListener("change", () => {
      if (state.running) stop(false);
    });

    el.volume.addEventListener("input", () => {
      state.volume = Number(el.volume.value) / 100;
      for (const node of state.audio.values()) node.volume = state.volume;
    });

    el.cheat.addEventListener("change", () => {
      syncMeter(0);
      if (!el.cheat.checked) el.next.textContent = state.running ? "??:??" : "--:--";
    });
  }

  async function loadSounds() {
    try {
      const response = await fetch("sounds/manifest.json", { cache: "no-cache" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      state.clips = await response.json();
    } catch (error) {
      el.hint.textContent = "COULD NOT LOAD sounds/manifest.json \u2014 " + error.message;
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
    state.bgIndex = 0;
    state.bgFront = "b";
    showBackground();
    setInterval(showBackground, BACKGROUND_MS);
  }

  function boot() {
    wire();
    syncMeter(100);
    el.hint.textContent = IDLE_HINT;
    loadBackgrounds();
    loadSounds();
  }

  boot();
})();
