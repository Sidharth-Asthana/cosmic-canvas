/* Parallax drift: the image and a multi-depth starfield shift subtly with the
 * cursor. Exposes an eased offset for the WebGL image layer and draws its own
 * starfield layers on the 2D fx canvas. */
"use strict";

const Parallax = (() => {
  const LAYERS = [
    { depth: 0.25, count: 90, size: 0.9, alpha: 0.35 },
    { depth: 0.55, count: 50, size: 1.4, alpha: 0.5 },
    { depth: 1.0,  count: 22, size: 2.0, alpha: 0.7 },
  ];
  let enabled = true;
  let strength = 1.0;           // user-tunable multiplier
  const target = { x: 0, y: 0 }; // -0.5..0.5 from screen centre
  const eased = { x: 0, y: 0 };
  let stars = [];

  function regenerate() {
    stars = LAYERS.map(layer => Array.from({ length: layer.count }, () => ({
      x: Math.random(), y: Math.random(),
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 1.2,
    })));
  }
  regenerate();

  function onMouseMove(x, y, w, h) {
    target.x = x / w - 0.5;
    target.y = y / h - 0.5;
  }

  function update(dt) {
    const k = 1 - Math.exp(-dt * 2.2); // smooth chase
    eased.x += (target.x - eased.x) * k;
    eased.y += (target.y - eased.y) * k;
  }

  /* Image-layer UV offset (very small: 1.2% of frame at strength 1). */
  function imageOffset() {
    if (!enabled) return { x: 0, y: 0 };
    return { x: eased.x * 0.012 * strength, y: eased.y * 0.012 * strength };
  }

  function draw(ctx, w, h, time) {
    if (!enabled) return;
    ctx.save();
    for (let i = 0; i < LAYERS.length; i++) {
      const layer = LAYERS[i];
      const shift = 26 * layer.depth * strength;
      for (const s of stars[i]) {
        const twinkle = 0.75 + 0.25 * Math.sin(time * s.speed + s.phase);
        ctx.globalAlpha = layer.alpha * twinkle;
        ctx.fillStyle = "#fff";
        const px = (s.x * w - eased.x * shift + w) % w;
        const py = (s.y * h - eased.y * shift + h) % h;
        ctx.beginPath();
        ctx.arc(px, py, layer.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  return {
    onMouseMove, update, imageOffset, draw, regenerate,
    set enabled(v) { enabled = v; },
    set strength(v) { strength = v; },
  };
})();
