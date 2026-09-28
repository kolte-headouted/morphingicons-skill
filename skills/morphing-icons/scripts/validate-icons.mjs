#!/usr/bin/env node
// Validates morphing-icon definitions against the three rules, and finds the
// best line ordering for a pair of icons that morph into each other often.
//
//   node validate-icons.mjs                    # check the built-in catalog
//   node validate-icons.mjs icons.json         # check your own icons
//   node validate-icons.mjs --pair menu close  # best line order for menu → close
//
// icons.json is an array of { id, name, family?, lines: [[x1,y1,x2,y2] ×3], rotation? }.
// It may also include the built-in ids; custom icons override them by id.

import { readFileSync } from "node:fs";
import { catalog, bakedLines, isCollapsed, rotateLine } from "../assets/morphing-icons.js";

const EPS = 1e-3;
const MARGIN = 0.08; // stroke caps need room inside the unit square

function distanceToSegment([px, py], [x1, y1, x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function validate(icons) {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const families = new Map();

  for (const icon of icons) {
    const where = `${icon.id}:`;
    if (ids.has(icon.id)) errors.push(`${where} duplicate id`);
    ids.add(icon.id);

    if (!Array.isArray(icon.lines) || icon.lines.length !== 3) {
      errors.push(`${where} rule 1 — needs exactly three lines, has ${icon.lines?.length ?? 0}`);
      continue;
    }
    if (icon.lines.some((l) => !Array.isArray(l) || l.length !== 4 || l.some((v) => typeof v !== "number"))) {
      errors.push(`${where} each line must be [x1, y1, x2, y2] numbers`);
      continue;
    }

    const baked = bakedLines({ rotation: 0, ...icon });
    const visible = baked.filter((l) => !isCollapsed(l));
    if (visible.length === 0) errors.push(`${where} has no visible lines`);

    for (const [x1, y1, x2, y2] of baked) {
      for (const v of [x1, y1, x2, y2]) {
        if (v < -EPS || v > 1 + EPS) errors.push(`${where} coordinate ${v.toFixed(3)} is outside the unit square`);
        else if (v < MARGIN || v > 1 - MARGIN) warnings.push(`${where} coordinate ${v.toFixed(3)} is within ${MARGIN} of the edge — round caps may clip`);
      }
    }

    // Rule 2: collapsed lines must hide their round-cap dot under a visible stroke.
    baked.forEach((l, i) => {
      if (!isCollapsed(l)) return;
      const onVisible = visible.some((v) => distanceToSegment([l[0], l[1]], v) < EPS);
      if (!onVisible) {
        errors.push(`${where} rule 2 — collapsed line ${i} at (${l[0].toFixed(2)}, ${l[1].toFixed(2)}) is not on a visible line; its dot floats in raw mode`);
      }
    });

    if (icon.family) {
      if (!families.has(icon.family)) families.set(icon.family, []);
      families.get(icon.family).push(icon);
    }
  }

  // Rule 3: family members share base lines and differ only by rotation.
  for (const [family, members] of families) {
    const [first, ...rest] = members;
    for (const m of rest) {
      const same = m.lines.every((l, i) => l.every((v, j) => Math.abs(v - first.lines[i][j]) < 1e-9));
      if (!same) errors.push(`family "${family}": ${m.id} has different base lines than ${first.id}; rotate the same lines instead`);
    }
    const rotations = members.map((m) => (((m.rotation ?? 0) % 360) + 360) % 360);
    if (new Set(rotations).size !== rotations.length) errors.push(`family "${family}": two members share the same rotation`);
    if (members.length === 1) warnings.push(`family "${family}" has one member; drop the family or add its rotations`);
  }

  // A family member whose base lines duplicate another icon should probably join it.
  for (const a of icons) {
    for (const b of icons) {
      if (a.id >= b.id || (a.family && a.family === b.family)) continue;
      for (let deg = 0; deg < 360; deg += 45) {
        const ra = bakedLines({ rotation: 0, ...a }).map((l) => rotateLine(l, deg));
        const rb = bakedLines({ rotation: 0, ...b });
        if (ra.every((l, i) => l.every((v, j) => Math.abs(v - rb[i][j]) < EPS)) && deg !== 0) {
          warnings.push(`${a.id} rotated ${deg}° equals ${b.id}; put them in one family so they rotate instead of scrambling`);
        }
      }
    }
  }

  return { errors, warnings };
}

// Finds the line permutation (and per-line start/end flip) of `to` that
// minimizes total endpoint travel from `from`. Collapsed lines only need one
// point, so they're scored by distance to the nearest endpoint.
function bestPairing(from, to) {
  const a = bakedLines({ rotation: 0, ...from });
  const b = bakedLines({ rotation: 0, ...to });
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const travel = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) + Math.hypot(p[2] - q[2], p[3] - q[3]);
  let best = null;
  for (const perm of perms) {
    for (let flips = 0; flips < 8; flips++) {
      const order = perm.map((idx, k) => {
        const l = to.lines[idx];
        return flips & (1 << k) ? [l[2], l[3], l[0], l[1]] : l;
      });
      const bakedOrder = perm.map((idx, k) => {
        const l = b[idx];
        return flips & (1 << k) ? [l[2], l[3], l[0], l[1]] : l;
      });
      const cost = bakedOrder.reduce((sum, l, i) => sum + travel(a[i], l), 0);
      if (!best || cost < best.cost - 1e-9) best = { cost, order, perm, flips };
    }
  }
  const current = b.reduce((sum, l, i) => sum + travel(a[i], l), 0);
  return { ...best, current };
}

const args = process.argv.slice(2);
let icons = catalog.map((i) => ({ ...i }));

const pairAt = args.indexOf("--pair");
const file = args.find((a, i) => !a.startsWith("--") && (pairAt === -1 || i < pairAt || i > pairAt + 2));
if (file) {
  const custom = JSON.parse(readFileSync(file, "utf8"));
  const byId = new Map(icons.map((i) => [i.id, i]));
  for (const c of custom) byId.set(c.id, { rotation: 0, family: null, ...c });
  icons = [...byId.values()];
}

if (pairAt !== -1) {
  const [fromId, toId] = args.slice(pairAt + 1, pairAt + 3);
  const from = icons.find((i) => i.id === fromId);
  const to = icons.find((i) => i.id === toId);
  if (!from || !to) {
    console.error(`Unknown id. Known: ${icons.map((i) => i.id).join(", ")}`);
    process.exit(2);
  }
  if (from.family && from.family === to.family) {
    console.log(`${fromId} → ${toId} share the "${from.family}" family: they rotate, line order doesn't matter.`);
    process.exit(0);
  }
  const { cost, current, order, perm, flips } = bestPairing(from, to);
  console.log(`${fromId} → ${toId}`);
  console.log(`  current travel: ${current.toFixed(3)}   best: ${cost.toFixed(3)}`);
  if (current - cost < 1e-6) {
    console.log("  current line order is already optimal.");
  } else {
    const moved = perm.some((p, i) => p !== i) ? `take its lines in order [${perm.join(", ")}]` : "keep its line order";
    const flipped = [0, 1, 2].filter((k) => flips & (1 << k));
    const flipNote = flipped.length ? `, swap start/end of line${flipped.length > 1 ? "s" : ""} ${flipped.join(", ")}` : "";
    console.log(`  for ${toId}: ${moved}${flipNote}:`);
    for (const l of order) console.log(`    [${l.map((v) => +v.toFixed(4)).join(", ")}]`);
    if (to.rotation) console.log(`  (base-orientation lines; ${toId}'s rotation of ${to.rotation}° still applies)`);
    if (to.family) console.log(`  ${toId} is in the "${to.family}" family — change the shared base lines for every member.`);
    console.log("  Travel is a heuristic: it changes every morph into this icon, so check its other partners and eyeball it.");
  }
  process.exit(0);
}

const { errors, warnings } = validate(icons);
for (const w of warnings) console.log(`warning  ${w}`);
for (const e of errors) console.log(`error    ${e}`);
console.log(`\n${icons.length} icons, ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
