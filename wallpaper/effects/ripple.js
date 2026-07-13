/* Ripple: gravitational-lens style distortion radiating from each click.
 * The actual warp happens in the WebGL fragment shader (main.js); this module
 * just tracks active ripples and packs them into the shader uniform. */
"use strict";

const Ripple = (() => {
  const MAX = 8;         // must match RIPPLE_COUNT in the fragment shader
  const LIFETIME = 3.5;  // seconds, must cover the shader's fade-out
  let enabled = true;
  let ripples = [];

  function add(x, y, w, h, now) {
    if (!enabled || !w || !h) return; // viewport can be 0 during startup
    ripples.push({ u: x / w, v: y / h, t: now });
    if (ripples.length > MAX) ripples.shift();
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
    add, uniformData,
    set enabled(v) { enabled = v; if (!v) ripples = []; },
  };
})();
