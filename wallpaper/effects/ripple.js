/* Ripple: gravitational-lens style distortion radiating from each click.
 * The actual warp happens in the WebGL fragment shader (main.js); this module
 * just tracks active ripples and packs them into the shader uniform. */
"use strict";

const Ripple = (() => {
  const MAX = 8;         // must match RIPPLE_COUNT in the fragment shader
  const LIFETIME = 3.5;  // seconds, must cover the shader's fade-out
  let enabled = true;
  let ripples = [];

  const FLASH_TIME = 0.45; // seconds of visible click flash

  function add(x, y, w, h, now) {
    if (!enabled || !w || !h) return; // viewport can be 0 during startup
    ripples.push({ u: x / w, v: y / h, x, y, t: now });
    if (ripples.length > MAX) ripples.shift();
  }

  /* Immediate visual feedback on the 2D canvas — the shader ring takes a
   * moment to expand, so a quick glow marks the click the instant it lands. */
  function draw(ctx, now) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const r of ripples) {
      const age = now - r.t;
      if (age > FLASH_TIME) continue;
      const k = age / FLASH_TIME;
      const radius = 14 + k * 230;
      const alpha = (1 - k) * (1 - k) * 0.7;
      const glow = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, radius);
      glow.addColorStop(0, `rgba(190, 225, 255, ${alpha * 0.6})`);
      glow.addColorStop(0.75, `rgba(150, 200, 255, ${alpha * 0.25})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* Pack into a flat Float32Array of vec4(u, v, startTime, 0) for the shader. */
  function uniformData(now) {
    ripples = ripples.filter(r => now - r.t < LIFETIME);
    const data = new Float32Array(MAX * 4);
    for (let i = 0; i < ripples.length; i++) {
      data[i * 4] = ripples[i].u;
      data[i * 4 + 1] = ripples[i].v;
      data[i * 4 + 2] = ripples[i].t;
    }
    return data;
  }

  return {
    add, uniformData, draw,
    set enabled(v) { enabled = v; if (!v) ripples = []; },
  };
})();
