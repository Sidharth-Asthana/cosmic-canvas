/* Constellation: dragging lays down connected star nodes joined by thin lines,
 * like sketching a constellation. The chain twinkles, then fades away. */
"use strict";

const Constellation = (() => {
  const NODE_SPACING = 55;   // min px between dropped nodes
  const FADE_AFTER = 2.5;    // seconds after drag ends
  const FADE_TIME = 3.0;
  let enabled = true;
  let chains = [];           // {nodes: [{x, y, phase}], endedAt: null|time}
  let current = null;

  function start(x, y) {
    if (!enabled) return;
    current = { nodes: [{ x, y, phase: Math.random() * 6.28 }], endedAt: null };
    chains.push(current);
  }

  function extend(x, y) {
    if (!enabled || !current) return;
    const last = current.nodes[current.nodes.length - 1];
    if (Math.hypot(x - last.x, y - last.y) >= NODE_SPACING) {
      current.nodes.push({ x, y, phase: Math.random() * 6.28 });
    }
  }

  function end(now) {
    if (current) current.endedAt = now;
    current = null;
  }

  function update(now) {
    chains = chains.filter(c =>
      c.endedAt === null || now - c.endedAt < FADE_AFTER + FADE_TIME);
  }

  function draw(ctx, now) {
    for (const chain of chains) {
      let alpha = 1;
      if (chain.endedAt !== null) {
        const since = now - chain.endedAt;
        alpha = since < FADE_AFTER ? 1 :
          Math.max(0, 1 - (since - FADE_AFTER) / FADE_TIME);
      }
      if (alpha <= 0 || chain.nodes.length === 0) continue;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      ctx.strokeStyle = `rgba(160, 200, 255, ${0.35 * alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      chain.nodes.forEach((n, i) => i ? ctx.lineTo(n.x, n.y) : ctx.moveTo(n.x, n.y));
      ctx.stroke();

      for (const n of chain.nodes) {
        const twinkle = 0.7 + 0.3 * Math.sin(now * 2.5 + n.phase);
        const r = 2.2 * twinkle;
        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4);
        glow.addColorStop(0, `rgba(220, 235, 255, ${0.9 * alpha * twinkle})`);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 4, 0, Math.PI * 2);
        ctx.fill();
        // 4-point star sparkle
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 * alpha * twinkle})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(n.x - r * 3, n.y); ctx.lineTo(n.x + r * 3, n.y);
        ctx.moveTo(n.x, n.y - r * 3); ctx.lineTo(n.x, n.y + r * 3);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  return {
    start, extend, end, update, draw,
    set enabled(v) { enabled = v; if (!v) { chains = []; current = null; } },
  };
})();
