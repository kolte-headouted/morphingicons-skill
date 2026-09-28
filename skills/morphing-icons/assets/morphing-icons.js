// Morphing icons — framework-free web port of MorphingIconView.swift.
//
// Every icon is exactly three line segments in a unit square. Any icon can
// morph into any other by moving endpoints (spring-driven, interruptible),
// and icons in the same family morph by shortest-arc rotation instead.
//
//   import { MorphingIcon, icons } from "./morphing-icons.js";
//   const icon = new MorphingIcon(el, { icon: icons.plus, style: "blur" });
//   icon.set(icons.close);
//
// This module has no DOM access at import time, so the catalog and helpers
// can be imported from Node (see scripts/validate-icons.mjs).

// MARK: - Model

/** A line from [x1, y1] to [x2, y2] in unit-square coordinates. */
export const line = (x1, y1, x2, y2) => [x1, y1, x2, y2];

/**
 * A zero-length line parked at (x, y). The point must lie on one of the
 * icon's visible lines so the round-cap dot stays covered in raw mode.
 * The default (0.5, 0.5) is only safe when a visible line crosses the center.
 */
export const collapsed = (x = 0.5, y = 0.5) => [x, y, x, y];

export const isCollapsed = (l) => Math.hypot(l[2] - l[0], l[3] - l[1]) < 1e-4;

/** Rotates both endpoints around the unit-square center (0.5, 0.5). */
export function rotateLine(l, degrees) {
  if (degrees % 360 === 0) return l.slice();
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const rot = (x, y) => {
    const dx = x - 0.5;
    const dy = y - 0.5;
    return [0.5 + dx * c - dy * s, 0.5 + dx * s + dy * c];
  };
  return [...rot(l[0], l[1]), ...rot(l[2], l[3])];
}

/**
 * @param {{id: string, name: string, family?: string|null,
 *          lines: number[][], rotation?: number}} def
 */
export function defineIcon({ id, name, family = null, lines, rotation = 0 }) {
  if (lines.length !== 3) throw new Error(`${id}: every morph icon must use exactly three lines`);
  return Object.freeze({ id, name, family, lines, rotation });
}

/** Base lines with the icon's own rotation applied. */
export const bakedLines = (icon) => icon.lines.map((l) => rotateLine(l, icon.rotation));

const sameLines = (a, b) => a.every((l, i) => l.every((v, j) => Math.abs(v - b[i][j]) < 1e-9));

export function shortestDelta(from, to) {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  return d;
}

// MARK: - Icon catalog

const plusLines = [line(0.5, 0.14, 0.5, 0.86), collapsed(), line(0.14, 0.5, 0.86, 0.5)];

const arrowLines = [
  line(0.5, 0.16, 0.22, 0.44),
  line(0.5, 0.16, 0.78, 0.44),
  line(0.5, 0.16, 0.5, 0.84),
];

const chevronLines = [
  line(0.5, 0.38, 0.2, 0.62),
  line(0.5, 0.38, 0.8, 0.62),
  collapsed(0.5, 0.38),
];

export const icons = {
  plus: defineIcon({ id: "plus", name: "Plus", family: "plus", lines: plusLines }),
  close: defineIcon({ id: "close", name: "Close", family: "plus", lines: plusLines, rotation: 45 }),
  minus: defineIcon({
    id: "minus", name: "Minus",
    lines: [collapsed(), collapsed(), line(0.14, 0.5, 0.86, 0.5)],
  }),
  menu: defineIcon({
    id: "menu", name: "Menu",
    lines: [line(0.14, 0.26, 0.86, 0.26), line(0.14, 0.5, 0.86, 0.5), line(0.14, 0.74, 0.86, 0.74)],
  }),
  check: defineIcon({
    id: "check", name: "Check",
    lines: [collapsed(0.43, 0.78), line(0.18, 0.54, 0.43, 0.78), line(0.43, 0.78, 0.84, 0.3)],
  }),
  play: defineIcon({
    id: "play", name: "Play",
    lines: [line(0.34, 0.18, 0.34, 0.82), line(0.34, 0.18, 0.84, 0.5), line(0.34, 0.82, 0.84, 0.5)],
  }),
  arrowUp: defineIcon({ id: "arrow-up", name: "Arrow up", family: "arrow", lines: arrowLines }),
  arrowRight: defineIcon({ id: "arrow-right", name: "Arrow right", family: "arrow", lines: arrowLines, rotation: 90 }),
  arrowDown: defineIcon({ id: "arrow-down", name: "Arrow down", family: "arrow", lines: arrowLines, rotation: 180 }),
  arrowLeft: defineIcon({ id: "arrow-left", name: "Arrow left", family: "arrow", lines: arrowLines, rotation: 270 }),
  chevronUp: defineIcon({ id: "chevron-up", name: "Chevron up", family: "chevron", lines: chevronLines }),
  chevronDown: defineIcon({ id: "chevron-down", name: "Chevron down", family: "chevron", lines: chevronLines, rotation: 180 }),
};

export const catalog = Object.values(icons);

// MARK: - Spring

// SwiftUI's .spring(response: 0.3, dampingFraction: 0.8) with unit mass.
const RESPONSE = 0.3;
const DAMPING_FRACTION = 0.8;
const STIFFNESS = (2 * Math.PI / RESPONSE) ** 2;
const DAMPING = (4 * Math.PI * DAMPING_FRACTION) / RESPONSE;

/** A 1-D spring that keeps its velocity when retargeted, so it's interruptible. */
class Spring {
  constructor(value) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }
  snap(value) {
    this.value = this.target = value;
    this.velocity = 0;
  }
  step(dt) {
    const force = -STIFFNESS * (this.value - this.target) - DAMPING * this.velocity;
    this.velocity += force * dt;
    this.value += this.velocity * dt;
  }
  get settled() {
    return Math.abs(this.value - this.target) < 1e-4 && Math.abs(this.velocity) < 1e-3;
  }
  settle() {
    this.snap(this.target);
  }
}

// MARK: - Morphing icon component

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Renders an icon into `container` and morphs whenever `set()` is called.
 *
 * Options:
 *   icon       starting icon (default icons.plus)
 *   lineWidth  stroke width in viewBox units out of 100 (default 7.3,
 *              matching 11pt on a 150pt SwiftUI frame)
 *   color      stroke color (default "currentColor")
 *   style      "blur" | "fade" | "raw" (default "blur")
 *   speed      playback rate, 1 = real time (default 1)
 */
export class MorphingIcon {
  constructor(container, { icon = icons.plus, lineWidth = 7.3, color = "currentColor", style = "blur", speed = 1 } = {}) {
    this.current = icon;
    this.style = style;
    this.speed = speed;
    this.lineWidth = lineWidth;
    this.reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)");

    const baked = bakedLines(icon);
    this.coords = baked.map((l) => l.map((v) => new Spring(v)));
    this.opacities = baked.map((l) => new Spring(this.#opacityFor(l)));
    this.frame = new Spring(0);

    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("viewBox", "0 0 100 100");
    this.svg.setAttribute("aria-hidden", "true");
    this.svg.style.cssText = "display:block;width:100%;height:100%;overflow:visible";
    this.group = document.createElementNS(SVG_NS, "g");
    this.lines = [0, 1, 2].map(() => {
      const el = document.createElementNS(SVG_NS, "line");
      el.setAttribute("stroke", color);
      el.setAttribute("stroke-width", lineWidth);
      el.setAttribute("stroke-linecap", "round");
      this.group.appendChild(el);
      return el;
    });
    this.svg.appendChild(this.group);
    container.appendChild(this.svg);

    this.raf = 0;
    this.lastTime = 0;
    this.generation = 0;
    this.#render();
  }

  get isSettled() {
    return this.frame.settled && this.coords.every((l) => l.every((s) => s.settled)) && this.opacities.every((s) => s.settled);
  }

  setStyle(style) {
    this.style = style;
    this.#lineTargets().forEach((l, i) => (this.opacities[i].target = this.#opacityFor(l)));
    this.#start();
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  /** Morph to `target`. Safe to call at any time, including mid-morph. */
  set(target) {
    if (target.id === this.current.id) return;
    const source = this.current;
    this.current = target;
    const generation = ++this.generation;

    if (this.reduceMotion && this.reduceMotion.matches) {
      this.#crossfade(target, generation);
      return;
    }

    if (this.style === "blur") this.#blurPulse();

    // Rotation only works from a settled state: re-expressing the current
    // geometry as base lines + rotation is a snap, invisible when settled but
    // a jump mid-animation. Interrupted morphs use coordinates, which retarget.
    const canRotate = target.family && target.family === source.family && sameLines(target.lines, source.lines) && this.isSettled;

    if (canRotate) {
      this.frame.snap(this.frame.target + shortestDelta(this.frame.target, source.rotation));
      source.lines.forEach((l, i) => {
        l.forEach((v, j) => this.coords[i][j].snap(v));
        this.opacities[i].snap(this.#opacityFor(l));
      });
      this.frame.target += shortestDelta(this.frame.target, target.rotation);
    } else {
      // Express the target in the current frame so the on-screen result is a
      // straight coordinate morph with no rotation change.
      target.lines.forEach((l, i) => {
        rotateLine(l, target.rotation - this.frame.target).forEach((v, j) => (this.coords[i][j].target = v));
        this.opacities[i].target = this.#opacityFor(l);
      });
    }
    this.#start();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.svg.remove();
  }

  #opacityFor(l) {
    return this.style === "raw" || !isCollapsed(l) ? 1 : 0;
  }

  #lineTargets() {
    return this.coords.map((l) => l.map((s) => s.target));
  }

  #blurPulse() {
    // Snap in fast, dissolve as the spring settles (100 ms in, 280 ms out).
    const radius = this.lineWidth * 0.6 * (this.svg.clientWidth / 100);
    const inMs = 100 / this.speed;
    const outMs = 280 / this.speed;
    this.svg.animate(
      [
        { filter: "blur(0)" },
        { filter: `blur(${radius}px)`, offset: inMs / (inMs + outMs), easing: "ease-out" },
        { filter: "blur(0)" },
      ],
      { duration: inMs + outMs, easing: "ease-out" }
    );
  }

  #crossfade(target, generation) {
    const fadeOut = this.svg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100 / this.speed, easing: "ease-out", fill: "forwards" });
    fadeOut.onfinish = () => {
      if (generation !== this.generation) return;
      bakedLines(target).forEach((l, i) => {
        l.forEach((v, j) => this.coords[i][j].snap(v));
        this.opacities[i].snap(this.#opacityFor(l));
      });
      this.frame.snap(0);
      this.#render();
      fadeOut.cancel();
      this.svg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150 / this.speed, easing: "ease-out" });
    };
  }

  #start() {
    if (this.raf) return;
    this.lastTime = performance.now();
    const tick = (now) => {
      // Fixed substeps keep the explicit integrator stable on slow frames.
      let dt = Math.min((now - this.lastTime) / 1000, 1 / 20) * this.speed;
      this.lastTime = now;
      const springs = [this.frame, ...this.coords.flat(), ...this.opacities];
      while (dt > 0) {
        const h = Math.min(dt, 1 / 240);
        springs.forEach((s) => s.step(h));
        dt -= h;
      }
      if (this.isSettled) {
        springs.forEach((s) => s.settle());
        this.raf = 0;
      } else {
        this.raf = requestAnimationFrame(tick);
      }
      this.#render();
    };
    this.raf = requestAnimationFrame(tick);
  }

  #render() {
    this.group.setAttribute("transform", `rotate(${this.frame.value} 50 50)`);
    this.lines.forEach((el, i) => {
      const [x1, y1, x2, y2] = this.coords[i].map((s) => s.value * 100);
      el.setAttribute("x1", x1);
      el.setAttribute("y1", y1);
      el.setAttribute("x2", x2);
      el.setAttribute("y2", y2);
      el.setAttribute("opacity", Math.min(1, Math.max(0, this.opacities[i].value)));
    });
  }
}

/** Static, non-animating SVG markup for pickers and lists. */
export function iconSVG(icon, { lineWidth = 9, color = "currentColor" } = {}) {
  const segs = bakedLines(icon)
    .filter((l) => !isCollapsed(l))
    .map(([x1, y1, x2, y2]) => `<line x1="${x1 * 100}" y1="${y1 * 100}" x2="${x2 * 100}" y2="${y2 * 100}"/>`)
    .join("");
  return `<svg viewBox="0 0 100 100" aria-hidden="true" fill="none" stroke="${color}" stroke-width="${lineWidth}" stroke-linecap="round">${segs}</svg>`;
}
