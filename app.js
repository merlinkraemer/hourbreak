(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const el = {
    page: $("page"),
    clock: $("clock"),
    lcdLabel: $("lcd-label"),
    sessionLeft: $("session-left"),
    next: $("next"),
    noiseCount: $("noise-count"),
    meter: $("meter"),
    meterBar: $("meter").firstElementChild,
    eq: $("eq"),
    now: $("now"),
    start: $("start"),
    stop: $("stop"),
    length: $("length"),
    volume: $("volume"),
    volumeOut: $("volume-out"),
    cheat: $("cheat"),
    hint: $("hint"),
    ticker: $("ticker"),
    log: $("log"),
    jukebox: $("jukebox").tBodies[0],
    libCount: $("lib-count"),
    specPanel: $("spec-panel"),
    visitor: $("visitor"),
    alltime: $("alltime"),
    flash: $("flash"),
    flashText: $("flash-text"),
    guestbook: $("guestbook"),
    guestbookLink: $("guestbook-link"),
    guestbookClose: $("guestbook-close"),
    entries: $("entries"),
    signForm: $("sign-form"),
    signName: $("sign-name"),
    signText: $("sign-text"),
  };

  const GAP_BUCKETS = [
    { weight: 62, min: 18, max: 145 },
    { weight: 28, min: 145, max: 360 },
    { weight: 10, min: 360, max: 780 },
  ];

  const BURST_CHANCE = 0.09;
  const FIRST_GAP = { min: 7, max: 45 };
  const MAX_LOG_LINES = 400;
  const TICKER_LINES = 14;

  const IDLE_TITLE = " ★ HOURBREAK \u2764 JUST KEEP THIS TAB OPEN \u2764 +1000% OUTPUT \u2764 READ OUR TESTIMONIALS ";
  const IDLE_TICKER = "initializing neural optimization pipeline . . .";
  const IDLE_HINT = "PRESS THE BIG BUTTON. THEN LEAVE THIS TAB OPEN AND GO DO SOMETHING ELSE FOR AN HOUR. THAT IS THE ENTIRE METHODOLOGY.";

  const state = {
    clips: [],
    audio: new Map(),
    hits: new Map(),
    recent: [],
    running: false,
    startedAt: 0,
    endsAt: 0,
    forever: false,
    nextAt: 0,
    lastAt: 0,
    noiseCount: 0,
    volume: 0.85,
    titleOffset: 0,
    ticker: [],
    lastClock: "",
  };

  let endTimer = 0;

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    },
  };

  const pad = (n, w) => String(n).padStart(w, "0");

  function mmss(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return pad(Math.floor(s / 60), 2) + ":" + pad(s % 60, 2);
  }

  function spoken(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60);
    return m + "m " + pad(s % 60, 2) + "s";
  }

  function stamp(at) {
    const d = new Date(at);
    return pad(d.getHours(), 2) + ":" + pad(d.getMinutes(), 2) + ":" + pad(d.getSeconds(), 2);
  }

  function pickGapMs() {
    const total = GAP_BUCKETS.reduce((sum, b) => sum + b.weight, 0);
    let roll = Math.random() * total;
    const bucket = GAP_BUCKETS.find((b) => (roll -= b.weight) <= 0) || GAP_BUCKETS[0];
    return (bucket.min + (bucket.max - bucket.min) * Math.pow(Math.random(), 1.9)) * 1000;
  }

  function pickFirstGapMs() {
    const span = FIRST_GAP.max - FIRST_GAP.min;
    return (FIRST_GAP.min + span * Math.pow(Math.random(), 1.5)) * 1000;
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

  function logLine(cls, text) {
    const line = document.createElement("div");
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = "[" + stamp(Date.now()) + "]";
    const body = document.createElement("span");
    body.className = cls;
    body.textContent = text;
    line.append(t, document.createTextNode(" "), body);
    el.log.append(line);
    while (el.log.childElementCount > MAX_LOG_LINES) el.log.firstElementChild.remove();
    el.log.scrollTop = el.log.scrollHeight;
  }

  function pushTicker(text) {
    state.ticker.push(text);
    while (state.ticker.length > TICKER_LINES) state.ticker.shift();
    el.ticker.textContent = state.ticker.join("  \u00b7  ");
  }

  function setBar(percent) {
    el.meterBar.style.width = Math.max(0, Math.min(100, percent)) + "%";
  }

  function syncMeter(percent) {
    const hidden = !el.cheat.checked;
    el.meter.classList.toggle("hidden-bar", hidden);
    setBar(hidden ? 100 : (percent || 0));
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
  }

  function bumpAllTime() {
    const total = store.get("hb.alltime", 1337) + 1;
    store.set("hb.alltime", total);
    el.alltime.textContent = total.toLocaleString("en-US");
  }

  function playClip(clip, manual) {
    const node = audioFor(clip);
    try {
      node.currentTime = 0;
    } catch {}
    node.volume = state.volume;
    const started = node.play();
    if (started && started.catch) {
      started.catch(() => {
        el.hint.textContent = "YOUR BROWSER IS BLOCKING THE PRODUCTIVITY. CLICK ANYWHERE ON THIS PAGE, THEN PRESS THE BIG BUTTON AGAIN.";
      });
    }

    state.recent.push(clip.file);
    if (state.recent.length > 6) state.recent.shift();
    state.lastAt = Date.now();

    el.now.textContent = clip.label;
    el.lcdLabel.textContent = "DEEP WORK";
    el.lcdLabel.classList.add("hot");
    el.eq.classList.add("on");
    announce(clip);
    bumpAllTime();

    const hits = (state.hits.get(clip.file) || 0) + 1;
    state.hits.set(clip.file, hits);
    paintJukeboxRow(clip.file);

    if (state.running) {
      state.noiseCount += 1;
      el.noiseCount.textContent = state.noiseCount;
      logLine("n", ">>> OPTIMIZATION APPLIED: " + clip.label);
      pushTicker(clip.label);
    } else {
      logLine("n", ">>> PREVIEW: " + clip.label + "   (manual run, no output was increased)");
    }

    clearTimeout(endTimer);
    endTimer = setTimeout(() => {
      el.lcdLabel.textContent = "FOCUS";
      el.lcdLabel.classList.remove("hot");
      el.eq.classList.remove("on");
    }, clip.seconds * 1000 + 120);
  }

  function fire() {
    const clip = pickClip();
    playClip(clip, false);
    if (Math.random() < BURST_CHANCE) {
      state.nextAt = Date.now() + 380 + Math.random() * 760;
      if (state.running) logLine("h", "   !! DOUBLE OPTIMIZATION INBOUND !!");
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
    state.lastAt = 0;
    state.noiseCount = 0;
    state.recent = [];
    state.hits.clear();
    el.noiseCount.textContent = "0";
    el.next.textContent = "??:??";
    el.clock.textContent = "00:00";
    el.log.textContent = "";
    state.ticker = [];
    el.ticker.textContent = IDLE_TICKER;
    paintJukebox();

    el.start.disabled = true;
    el.stop.disabled = false;
    el.hint.textContent = "DO NOT CLOSE THIS TAB. PRODUCTIVITY IS ACCUMULATING RIGHT NOW.";
    syncMeter(0);

    logLine("h", "*** SESSION STARTED \u2014 " + (state.forever ? "RUNNING FOREVER" : "RUNNING FOR " + spoken(span)) + " ***");
    logLine("s", "   .. " + state.clips.length + " optimization modules armed. nothing is scheduled. everything is scheduled. ..");

    audioFor(state.clips[0]);
    state.nextAt = Date.now() + pickFirstGapMs();
  }

  function stop(reason) {
    if (!state.running) return;
    state.running = false;
    el.start.disabled = false;
    el.stop.disabled = true;
    el.eq.classList.remove("on");
    el.lcdLabel.textContent = "FOCUS";
    el.lcdLabel.classList.remove("hot");
    el.hint.textContent = reason === "time"
      ? "SESSION COMPLETE. YOUR OUTPUT IS NOW ROUGHLY 1000% HIGHER. GO OUTSIDE."
      : "PAUSED. YOUR POTENTIAL IS WAITING FOR YOU.";
    logLine("e", reason === "time"
      ? "*** SESSION COMPLETE \u2014 " + state.noiseCount + " OPTIMIZATIONS IN " + spoken(Date.now() - state.startedAt) + " ***"
      : "*** STOPPED BY THE OPERATOR ***");
    el.next.textContent = "--:--";
    syncMeter(100);
  }

  function update() {
    const now = Date.now();

    if (state.running) {
      if (!state.forever && now >= state.endsAt) {
        stop("time");
      } else {
        if (now >= state.nextAt) fire();

        const left = state.forever ? now - state.startedAt : state.endsAt - now;
        el.sessionLeft.textContent = (state.forever ? "\u221e " : "") + mmss(left);

        if (el.cheat.checked) {
          const wait = Math.max(0, state.nextAt - now);
          el.next.textContent = mmss(wait);
          const span = state.nextAt - state.lastAt;
          syncMeter(span > 0 ? ((now - state.lastAt) / span) * 100 : 0);
        }
      }
    }

    const since = state.lastAt || state.startedAt;
    if (since) {
      const clock = mmss(now - since);
      if (clock !== state.lastClock) {
        state.lastClock = clock;
        el.clock.textContent = clock;
        if (state.running && !state.forever) {
          document.title = "\u25cf " + clock + " of focus \u2014 HOURBREAK";
        }
      }
    }

    if (!state.running) {
      state.titleOffset = (state.titleOffset + 1) % IDLE_TITLE.length;
      document.title = (IDLE_TITLE + IDLE_TITLE).slice(state.titleOffset, state.titleOffset + 62);
    }
  }

  function paintJukeboxRow(file) {
    const row = el.jukebox.querySelector('[data-file="' + file + '"]');
    if (!row) return;
    const cell = row.querySelector(".hits");
    cell.textContent = state.hits.get(file) || 0;
    if (state.hits.get(file)) {
      cell.classList.add("hot");
      row.classList.add("played");
    }
  }

  function paintJukebox() {
    for (const row of el.jukebox.children) {
      row.classList.remove("played");
      const cell = row.querySelector(".hits");
      cell.textContent = "0";
      cell.classList.remove("hot");
    }
  }

  function buildJukebox() {
    el.jukebox.textContent = "";
    state.clips.forEach((clip, index) => {
      const row = document.createElement("tr");
      row.dataset.file = clip.file;

      const idx = document.createElement("td");
      idx.className = "idx";
      idx.textContent = pad(index + 1, 2);

      const name = document.createElement("td");
      name.className = "name";
      name.textContent = clip.label;

      const sec = document.createElement("td");
      sec.className = "sec";
      sec.textContent = clip.seconds.toFixed(1);

      const hits = document.createElement("td");
      hits.className = "hits";
      hits.textContent = "0";

      const hear = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "\u25b6 PREVIEW";
      button.addEventListener("click", () => playClip(clip, state.running));
      hear.append(button);

      row.append(idx, name, sec, hits, hear);
      el.jukebox.append(row);
    });
    el.libCount.textContent = "(" + state.clips.length + " MODULES)";
  }

  function buildEqualizer() {
    el.eq.textContent = "";
    for (let i = 0; i < 11; i += 1) el.eq.append(document.createElement("b"));
  }

  function buildVisitorCounter() {
    const visits = store.get("hb.visits", 0) + 1;
    store.set("hb.visits", visits);
    const total = pad(1337 + visits, 6);
    el.visitor.textContent = "";
    for (const digit of total) {
      const span = document.createElement("span");
      span.textContent = digit;
      el.visitor.append(span);
    }
  }

  const TESTIMONIALS = [
    ["CTO @ STEALTH STARTUP", "i left this tab open for a week and shipped four products. i do not remember any of it. 5 stars"],
    ["growth hacker", "my output is up 1000%. my colleagues have asked me to stop."],
    ["webmaster (me)", "welcome to my page!!! this is the best i can do"],
    ["k3vin_98", "i forgot it was open and then i remembered. anyway rad"],
    ["Mom", "very nice honey. please come downstairs for dinner."],
  ];

  function renderTestimonials() {
    const extra = store.get("hb.guestbook", []);
    const rows = [...extra, ...TESTIMONIALS];
    el.entries.textContent = "";
    for (const [who, text] of rows) {
      const wrap = document.createElement("div");
      const name = document.createElement("span");
      name.className = "who";
      name.textContent = who + " wrote: ";
      const when = document.createElement("span");
      when.className = "when";
      when.textContent = " [posted 1998]";
      wrap.append(name, document.createTextNode(text), when);
      el.entries.append(wrap);
    }
  }

  function openTestimonials() {
    renderTestimonials();
    el.guestbook.hidden = false;
    el.signName.focus();
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

    el.stop.addEventListener("click", () => stop("manual"));

    el.length.addEventListener("change", () => {
      if (state.running) stop("manual");
    });

    el.volume.addEventListener("input", () => {
      state.volume = Number(el.volume.value) / 100;
      el.volumeOut.textContent = el.volume.value + "%";
      for (const node of state.audio.values()) node.volume = state.volume;
    });

    el.cheat.addEventListener("change", () => {
      syncMeter(0);
      if (el.cheat.checked) {
        logLine("e", "> sync timer revealed. u are now watching the clock instead of working.");
      } else {
        logLine("s", "   .. sync timer hidden. mystery restored ..");
      }
    });

    el.guestbookLink.addEventListener("click", (event) => {
      event.preventDefault();
      openTestimonials();
    });

    el.guestbookClose.addEventListener("click", () => { el.guestbook.hidden = true; });

    el.guestbook.addEventListener("click", (event) => {
      if (event.target === el.guestbook) el.guestbook.hidden = true;
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") el.guestbook.hidden = true;
    });

    el.signForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const who = el.signName.value.trim() || "anonymous";
      const text = el.signText.value.trim();
      if (!text) return;
      const list = store.get("hb.guestbook", []);
      list.unshift([who, text]);
      store.set("hb.guestbook", list.slice(0, 40));
      el.signName.value = "";
      el.signText.value = "";
      renderTestimonials();
    });

    document.querySelector(".webring").addEventListener("click", (event) => {
      const link = event.target.closest("[data-ring]");
      if (!link) return;
      event.preventDefault();
      if (link.dataset.ring === "random") {
        if (state.clips.length) playClip(pickClip(), state.running);
        return;
      }
      const site = link.dataset.ring === "prev"
        ? "CHEESEORAMA (92 visitors) \u2014 offline since 2001"
        : "DAVE'S GARAGE PAGE (800x600 only) \u2014 offline since 2003";
      window.alert("YOU HAVE LEFT THE HOURBREAK SYNERGY NETWORK.\n\nThe next site is:\n" + site + "\n\nThe network is broken. It is always broken.");
    });
  }

  async function boot() {
    buildEqualizer();
    buildVisitorCounter();
    wire();
    syncMeter(100);
    el.hint.textContent = IDLE_HINT;

    let manifest;
    try {
      const response = await fetch("sounds/manifest.json", { cache: "no-cache" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      manifest = await response.json();
    } catch (error) {
      el.hint.textContent = "COULD NOT LOAD sounds/manifest.json \u2014 " + error.message;
      logLine("e", "*** MANIFEST NOT LOADED: " + error.message + " ***");
      return;
    }

    state.clips = manifest;
    buildJukebox();
    el.alltime.textContent = store.get("hb.alltime", 1337).toLocaleString("en-US");

    for (const clip of state.clips) audioFor(clip);

    logLine("h", "*** WELCOME TO HOURBREAK \u2014 THE #1 PRODUCTIVITY INCREASER ***");
    logLine("s", "   .. " + state.clips.length + " optimization modules armed. awaiting operator. ..");

    setInterval(update, 200);
  }

  boot();
})();
