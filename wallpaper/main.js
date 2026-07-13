/* Cosmic Canvas — orchestrates the WebGL image layer (Ken Burns + crossfade +
 * parallax + click-ripple warp in one shader) and the 2D fx layer (starfield,
 * stardust, constellations). Reads the image list from manifest.js, which the
 * Python fetcher rewrites; we re-load it periodically via a fresh <script> tag
 * (fetch() is blocked on file:// but script tags are not). */
"use strict";

const settings = {
  slideshowMinutes: 20,
  crossfadeSeconds: 2.5,
  showCredit: true,
  shuffle: false,
  effectIntensity: 1.0,
  effectCycleMinutes: 0,   // 0 = switch effect with each wallpaper change
  showEffectName: true,
  parallaxEnabled: true,   // *Enabled flags = include this effect in the rotation
  stardustEnabled: true,
  rippleEnabled: true,
  constellationEnabled: true,
};

/* ------------------------------------------------------ effect rotation
 * Exactly one cursor effect is live at a time; the rotation advances with
 * each wallpaper change, or on its own timer if effectCycleMinutes > 0. */

const EFFECT_ORDER = ["parallax", "stardust", "ripple", "constellation"];
const EFFECT_LABELS = {
  parallax: "Parallax drift",
  stardust: "Stardust trail",
  ripple: "Lens ripple",
  constellation: "Constellation lines",
};
let effectIndex = 0;
let lastEffectSwitch = 0;
let toastTimer = null;

function effectRotation() {
  return EFFECT_ORDER.filter(name => settings[name + "Enabled"]);
}

function activeEffectName() {
  const rot = effectRotation();
  return rot.length ? rot[effectIndex % rot.length] : null;
}

function showEffectToast(name) {
  const el = document.getElementById("effectToast");
  if (!settings.showEffectName || !name) { el.classList.remove("visible"); return; }
  el.textContent = "✦ " + EFFECT_LABELS[name];
  el.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visible"), 5000);
}

function applyActiveEffect(withToast) {
  const active = activeEffectName();
  Parallax.enabled = active === "parallax";
  Stardust.enabled = active === "stardust";
  Ripple.enabled = active === "ripple";
  Constellation.enabled = active === "constellation";
  if (withToast) showEffectToast(active);
}

function advanceEffect(now) {
  const rot = effectRotation();
  if (rot.length > 1) effectIndex = (effectIndex + 1) % rot.length;
  lastEffectSwitch = now;
  applyActiveEffect(rot.length > 1);
}

/* ---------------------------------------------------------------- WebGL */

const glCanvas = document.getElementById("gl");
const gl = glCanvas.getContext("webgl", { antialias: false });

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5); // top-left origin
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
#define RIPPLE_COUNT 8
varying vec2 vUv;
uniform sampler2D uTexA, uTexB;
uniform float uMix;                 // 0 = A, 1 = B
uniform float uAspectA, uAspectB;   // image aspect ratios
uniform float uScreenAspect;
uniform vec2 uPanA, uPanB;          // Ken Burns pan (uv units)
uniform float uZoomA, uZoomB;
uniform vec2 uParallax;
uniform float uTime;
uniform vec4 uRipples[RIPPLE_COUNT]; // (u, v, startTime, unused)
uniform float uIntensity;

vec2 warp(vec2 uv) {
  vec2 off = vec2(0.0);
  for (int i = 0; i < RIPPLE_COUNT; i++) {
    vec4 rp = uRipples[i];
    if (rp.z <= 0.0) continue;
    float age = uTime - rp.z;
    if (age < 0.0 || age > 3.5) continue;
    vec2 d = uv - rp.xy;
    d.x *= uScreenAspect;            // circular in screen space
    float dist = length(d);
    float radius = age * 0.45;       // fast expansion = instant feedback
    float band = exp(-pow((dist - radius) * 15.0, 2.0));
    float fade = exp(-age * 1.4) * (1.0 - smoothstep(3.0, 3.5, age));
    vec2 dir = dist > 1e-4 ? d / dist : vec2(0.0);
    dir.x /= uScreenAspect;
    off -= dir * band * fade * 0.035 * uIntensity; // pull inward: lens-like
  }
  return off;
}

vec2 coverUv(vec2 uv, float imgAspect, vec2 pan, float zoom) {
  vec2 c = uv - 0.5;
  if (imgAspect > uScreenAspect) c.x *= uScreenAspect / imgAspect;
  else                           c.y *= imgAspect / uScreenAspect;
  c /= zoom;
  return clamp(c + 0.5 + pan, 0.002, 0.998);
}

void main() {
  vec2 uv = vUv + warp(vUv) + uParallax;
  vec3 a = texture2D(uTexA, coverUv(uv, uAspectA, uPanA, uZoomA)).rgb;
  vec3 b = texture2D(uTexB, coverUv(uv, uAspectB, uPanB, uZoomB)).rgb;
  vec3 color = mix(a, b, smoothstep(0.0, 1.0, uMix));
  float vig = 1.0 - 0.22 * smoothstep(0.45, 0.95, length(vUv - 0.5));
  gl_FragColor = vec4(color * vig, 1.0);
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s));
  return s;
}

const program = gl.createProgram();
gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(program);
gl.useProgram(program);

const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER,
  new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(program, "aPos");
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

const U = {};
for (const name of ["uTexA", "uTexB", "uMix", "uAspectA", "uAspectB",
  "uScreenAspect", "uPanA", "uPanB", "uZoomA", "uZoomB", "uParallax",
  "uTime", "uRipples", "uIntensity"])
  U[name] = gl.getUniformLocation(program, name);

function makeTexture() {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // 1x1 black placeholder until an image is uploaded
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA,
    gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  return t;
}

/* Two slots crossfading into each other; each carries its own Ken Burns path. */
const slots = [
  { tex: makeTexture(), aspect: 1, kb: null, entry: null },
  { tex: makeTexture(), aspect: 1, kb: null, entry: null },
];
let front = 0;           // slot currently fully visible
let mixValue = 0;        // 0 = front visible; animates to 1 during crossfade
let fading = false;

function newKenBurns(now) {
  const angle = Math.random() * Math.PI * 2;
  return {
    start: now,
    zoomFrom: 1.06, zoomTo: 1.06 + 0.06 * Math.random() + 0.04,
    panFrom: { x: Math.cos(angle) * 0.015, y: Math.sin(angle) * 0.015 },
    panTo: { x: -Math.cos(angle) * 0.015, y: -Math.sin(angle) * 0.015 },
    duration: Math.max(60, settings.slideshowMinutes * 60),
  };
}

function kbState(kb, now) {
  if (!kb) return { pan: [0, 0], zoom: 1.08 };
  const t = Math.min((now - kb.start) / kb.duration, 1);
  return {
    pan: [kb.panFrom.x + (kb.panTo.x - kb.panFrom.x) * t,
          kb.panFrom.y + (kb.panTo.y - kb.panFrom.y) * t],
    zoom: kb.zoomFrom + (kb.zoomTo - kb.zoomFrom) * t,
  };
}

/* ------------------------------------------------------------- playlist */

let playlist = [];
let playIndex = -1;
let lastAdvance = 0;
let manifestUpdated = "";

function applyManifest() {
  const m = window.SPACE_MANIFEST;
  if (!m || !m.images || m.updated === manifestUpdated) return;
  manifestUpdated = m.updated;
  playlist = m.images.slice();
  if (settings.shuffle) {
    for (let i = playlist.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
    }
  }
  document.getElementById("nowallpapers").style.display =
    playlist.length ? "none" : "flex";
  if (playIndex === -1 && playlist.length) advance(true);
}

function reloadManifest() {
  const tag = document.createElement("script");
  tag.src = "manifest.js?t=" + Date.now();
  tag.onload = () => { tag.remove(); applyManifest(); };
  tag.onerror = () => tag.remove();
  document.body.appendChild(tag);
}

function setCredit(entry) {
  const el = document.getElementById("credit");
  if (!settings.showCredit || !entry) { el.classList.remove("visible"); return; }
  const parts = [entry.telescope, entry.credit].filter(Boolean).join(" · ");
  el.innerHTML = `<div class="title"></div><div class="sub"></div>`;
  el.querySelector(".title").textContent = entry.title || "";
  el.querySelector(".sub").textContent = parts;
  el.classList.add("visible");
}

function advance(immediate) {
  if (!playlist.length || (fading && !immediate)) return;
  playIndex = (playIndex + 1) % playlist.length;
  const entry = playlist[playIndex];
  const img = new Image();
  img.onload = () => {
    const now = performance.now() / 1000;
    const back = 1 - front;
    const slot = slots[back];
    gl.bindTexture(gl.TEXTURE_2D, slot.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    slot.aspect = img.width / img.height;
    slot.kb = newKenBurns(now);
    slot.entry = entry;
    fading = true;
    lastAdvance = now;
    if (immediate) { front = back; mixValue = 0; fading = false; setCredit(entry); }
  };
  img.onerror = () => { lastAdvance = performance.now() / 1000; }; // retry next tick
  img.src = entry.file + "?v=" + (entry.published || "");
}

/* ------------------------------------------------------------ fx canvas */

const fxCanvas = document.getElementById("fx");
const fxCtx = fxCanvas.getContext("2d");

function resize() {
  // Round consistently: with fractional display scaling (125%/150%) the
  // canvas width assignment truncates, so an unrounded comparison mismatches
  // every frame and regenerates the starfield 60x/s (visible flicker).
  const dpr = window.devicePixelRatio || 1;
  const W = Math.round(window.innerWidth * dpr);
  const H = Math.round(window.innerHeight * dpr);
  if (glCanvas.width === W && glCanvas.height === H) return;
  glCanvas.width = W; glCanvas.height = H;
  fxCanvas.width = W; fxCanvas.height = H;
  fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  gl.viewport(0, 0, W, H);
  Parallax.regenerate();
}
window.addEventListener("resize", resize);
resize();

/* ---------------------------------------------------------------- input */

let dragging = false;
let lastMouse = { x: 0, y: 0, t: 0 };

window.addEventListener("mousemove", (e) => {
  const now = performance.now() / 1000;
  Parallax.onMouseMove(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
  if (dragging) {
    const dt = Math.max(now - lastMouse.t, 1e-3);
    Stardust.emit(e.clientX, e.clientY,
      (e.clientX - lastMouse.x) / dt * 0.05, (e.clientY - lastMouse.y) / dt * 0.05);
    Constellation.extend(e.clientX, e.clientY);
  }
  lastMouse = { x: e.clientX, y: e.clientY, t: now };
});

window.addEventListener("mousedown", (e) => {
  const now = performance.now() / 1000;
  dragging = true;
  Ripple.add(e.clientX, e.clientY, window.innerWidth, window.innerHeight, now);
  Constellation.start(e.clientX, e.clientY);
});

window.addEventListener("mouseup", () => {
  dragging = false;
  Constellation.end(performance.now() / 1000);
});
window.addEventListener("mouseleave", () => {
  dragging = false;
  Constellation.end(performance.now() / 1000);
});

/* ------------------------------------------------- Lively property hooks */

function livelyPropertyListener(name, val) {
  switch (name) {
    case "slideshowMinutes": settings.slideshowMinutes = Number(val); break;
    case "showCredit":
      settings.showCredit = !!val;
      setCredit(settings.showCredit ? slots[front].entry : null);
      break;
    case "shuffle": settings.shuffle = !!val; manifestUpdated = ""; applyManifest(); break;
    case "effectIntensity":
      settings.effectIntensity = Number(val);
      Stardust.intensity = Number(val);
      break;
    case "effectCycleMinutes":
      settings.effectCycleMinutes = Number(val);
      lastEffectSwitch = performance.now() / 1000;
      break;
    case "showEffectName":
      settings.showEffectName = !!val;
      showEffectToast(settings.showEffectName ? activeEffectName() : null);
      break;
    case "parallaxEnabled":
    case "stardustEnabled":
    case "rippleEnabled":
    case "constellationEnabled":
      settings[name] = !!val;
      effectIndex = 0; // rotation membership changed; restart from the top
      applyActiveEffect(true);
      break;
  }
}
window.livelyPropertyListener = livelyPropertyListener;

/* ----------------------------------------------------------- main loop */

let prevFrame = performance.now() / 1000;

function frame() {
  const now = performance.now() / 1000;
  const dt = Math.min(now - prevFrame, 0.1);
  prevFrame = now;

  // Layout can settle after load (and monitors change under Lively) without a
  // resize event reaching us — resize() early-returns when nothing changed.
  resize();

  Parallax.update(dt);
  Stardust.update(dt);
  Constellation.update(now);

  if (fading) {
    mixValue += dt / settings.crossfadeSeconds;
    if (mixValue >= 1) {
      front = 1 - front;
      mixValue = 0;
      fading = false;
      setCredit(slots[front].entry);
      if (settings.effectCycleMinutes === 0) advanceEffect(now);
    }
  } else if (playlist.length > 1 &&
             now - lastAdvance > settings.slideshowMinutes * 60) {
    advance(false);
  }

  if (settings.effectCycleMinutes > 0 &&
      now - lastEffectSwitch > settings.effectCycleMinutes * 60) {
    advanceEffect(now);
  }

  const a = slots[front], b = slots[1 - front];
  const kbA = kbState(a.kb, now), kbB = kbState(b.kb, now);
  const par = Parallax.imageOffset();

  gl.uniform1i(U.uTexA, 0);
  gl.uniform1i(U.uTexB, 1);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tex);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, b.tex);
  gl.uniform1f(U.uMix, fading ? mixValue : 0);
  gl.uniform1f(U.uAspectA, a.aspect);
  gl.uniform1f(U.uAspectB, b.aspect);
  gl.uniform1f(U.uScreenAspect, window.innerWidth / window.innerHeight);
  gl.uniform2f(U.uPanA, kbA.pan[0], kbA.pan[1]);
  gl.uniform2f(U.uPanB, kbB.pan[0], kbB.pan[1]);
  gl.uniform1f(U.uZoomA, kbA.zoom);
  gl.uniform1f(U.uZoomB, kbB.zoom);
  gl.uniform2f(U.uParallax, par.x, par.y);
  gl.uniform1f(U.uTime, now);
  gl.uniform4fv(U.uRipples, Ripple.uniformData(now));
  gl.uniform1f(U.uIntensity, settings.effectIntensity);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  const w = window.innerWidth, h = window.innerHeight;
  fxCtx.clearRect(0, 0, w, h);
  Parallax.draw(fxCtx, w, h, now);
  Stardust.draw(fxCtx);
  Ripple.draw(fxCtx, now);
  Constellation.draw(fxCtx, now);

  requestAnimationFrame(frame);
}

applyManifest();          // manifest.js was loaded synchronously in index.html
applyActiveEffect(false); // arm the first effect in the rotation, no toast
setInterval(reloadManifest, 10 * 60 * 1000);
requestAnimationFrame(frame);
