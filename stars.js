const COUNT = 150;
const DRIFT = 0.045;
const RESOLUTION = 2;
const NEAR = 0.02;

export function startStarfield(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const stars = [];
  let width = 2;
  let height = 2;
  let cx = 1;
  let cy = 1;
  let last = performance.now();
  let frame = 0;
  let running = false;
  let boostUntil = 0;
  let boostAmount = 0;

  function place(star) {
    star.x = Math.random() * 2 - 1;
    star.y = Math.random() * 2 - 1;
    star.z = 1;
  }

  for (let i = 0; i < COUNT; i += 1) {
    const star = {};
    place(star);
    star.z = NEAR + Math.random() * (1 - NEAR);
    stars.push(star);
  }

  function resize() {
    canvas.width = Math.max(2, Math.round(window.innerWidth / RESOLUTION));
    canvas.height = Math.max(2, Math.round(window.innerHeight / RESOLUTION));
    width = canvas.width;
    height = canvas.height;
    cx = width / 2;
    cy = height / 2;
  }

  function step() {
    const now = performance.now();
    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";

    for (const star of stars) {
      const boosted = now < boostUntil;
      star.z -= DRIFT * (boosted ? 1 + boostAmount * 0.4 : 1) * delta;
      if (star.z <= NEAR) place(star);

      const depth = 1 - star.z;
      const sx = Math.round(cx + (star.x / star.z) * cx);
      const sy = Math.round(cy + (star.y / star.z) * cy);

      if (sx < -4 || sy < -4 || sx > width + 4 || sy > height + 4) {
        place(star);
        continue;
      }

      ctx.globalAlpha = Math.min(1, 0.2 + depth * 0.8 + (boosted ? 0.3 : 0));
      const size = 1 + Math.round(depth * 2) + (boosted ? Math.min(3, Math.round(boostAmount / 4)) : 0);
      ctx.fillRect(sx, sy, size, size);
    }

    ctx.globalAlpha = 1;
    frame = requestAnimationFrame(step);
  }

  function start() {
    if (running) return;
    running = true;
    resize();
    last = performance.now();
    step();
  }

  function stop() {
    running = false;
    cancelAnimationFrame(frame);
    frame = 0;
    ctx.clearRect(0, 0, width, height);
  }

  resize();
  window.addEventListener("resize", resize);

  return {
    start,
    stop,
    boost(amount) {
      boostAmount = Math.max(0, amount);
      boostUntil = performance.now() + 1500;
    },
  };
}
