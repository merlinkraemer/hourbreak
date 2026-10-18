const COLORS = ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff", "#ff8800", "#ffffff"];
const RESOLUTION = 2;
const GRAVITY = 1200;
const DRAG = 0.55;
const LIFE = 2.2;
const MAX = 700;

export function startConfetti(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const parts = [];
  let width = 2;
  let height = 2;
  let last = performance.now();
  let frame = 0;

  function resize() {
    canvas.width = Math.max(2, Math.round(window.innerWidth / RESOLUTION));
    canvas.height = Math.max(2, Math.round(window.innerHeight / RESOLUTION));
    width = canvas.width;
    height = canvas.height;
  }

  function loop() {
    const now = performance.now();
    const delta = Math.min((now - last) / 1000, 0.05);
    last = now;

    ctx.clearRect(0, 0, width, height);

    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const part = parts[i];
      part.vy += GRAVITY * delta;
      part.vx -= part.vx * DRAG * delta;
      part.x += part.vx * delta;
      part.y += part.vy * delta;
      part.rot += part.vr * delta;
      part.life -= delta / LIFE;

      if (part.life <= 0 || part.y > height + 30) {
        parts.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.translate(part.x, part.y);
      ctx.rotate(part.rot);
      ctx.globalAlpha = Math.min(1, part.life * 1.6);
      ctx.fillStyle = part.color;
      ctx.fillRect(-part.size * 0.5, -part.size * 0.35, part.size, part.size * 0.7);
      ctx.restore();
    }

    ctx.globalAlpha = 1;

    if (parts.length) frame = requestAnimationFrame(loop);
    else frame = 0;
  }

  function burst(count, originX, originY) {
    const x = originX / RESOLUTION;
    const y = originY / RESOLUTION;
    const total = Math.min(count, MAX - parts.length);
    if (total <= 0) return;

    for (let i = 0; i < total; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 620;
      parts.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 220,
        size: 3 + Math.random() * 9,
        color: COLORS[i % COLORS.length],
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 22,
        life: 1,
      });
    }

    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(loop);
    }
  }

  function clear() {
    parts.length = 0;
    cancelAnimationFrame(frame);
    frame = 0;
    ctx.clearRect(0, 0, width, height);
  }

  resize();
  window.addEventListener("resize", resize);

  return { burst, clear };
}
