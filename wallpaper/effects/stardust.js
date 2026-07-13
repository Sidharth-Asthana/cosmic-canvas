/* Stardust: glowing particles emitted along the cursor path while dragging,
 * drifting and fading out. Drawn additively on the 2D fx canvas. */
"use strict";

const Stardust = (() => {
  const COLORS = ["#ffffff", "#ffe9b0", "#a8d8ff", "#ffc8f0", "#c8ffe0"];
  const MAX_PARTICLES = 900;
  let enabled = true;
  let intensity = 1.0;
  let particles = [];

  function emit(x, y, vx, vy) {
    if (!enabled) return;
    const n = Math.round(3 * intensity);
    for (let i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 8 + Math.random() * 30;
      particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: vx * 0.12 + Math.cos(angle) * speed,
        vy: vy * 0.12 + Math.sin(angle) * speed - 6, // slight upward drift
        life: 0,
        ttl: 1.2 + Math.random() * 1.8,
        size: 0.8 + Math.random() * 2.2,
        color: COLORS[(Math.random() * COLORS.length) | 0],
      });
    }
  }

  function update(dt) {
    for (const p of particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 0.6 * dt;
      p.vy *= 1 - 0.6 * dt;
    }
    particles = particles.filter(p => p.life < p.ttl);
  }

  function draw(ctx) {
    if (!particles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of particles) {
      const t = p.life / p.ttl;
      const alpha = (1 - t) * (1 - t);
      const r = p.size * (1 + t * 1.5);
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.5);
      glow.addColorStop(0, p.color);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  return {
    emit, update, draw,
    set enabled(v) { enabled = v; if (!v) particles = []; },
    set intensity(v) { intensity = v; },
  };
})();
