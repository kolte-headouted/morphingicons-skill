---
name: morphing-icons
description: Build line icons that smoothly morph into any other icon — hamburger to X, plus to close, play to check, arrows that rotate instead of scrambling. Every icon is exactly three line segments, so any icon can become any other by moving endpoints or rotating. Use whenever someone wants an animated icon transition, a morphing or toggle icon (menu/close, play/pause-style, expand/collapse chevron, add/remove, direction arrows), wants to add a new icon to a morphing set, or asks to port the morphing icon component to SwiftUI, web/SVG, React or another platform. Ships a SwiftUI component, a framework-free JS/SVG component, a demo page and a validator.
---

# Morphing icons

An icon system where **any icon can morph into any other**. The trick: every icon is built from the same raw material — exactly three line segments in a unit square with round caps — so a morph is just twelve numbers moving, a rotation, or both.

## What's in this skill

| File | What it is |
|---|---|
| `assets/MorphingIconView.swift` | SwiftUI component (iOS 18+): model, 12-icon catalog, `MorphingIconView`, static `IconGlyph` |
| `assets/morphing-icons.js` | Framework-free ES module port for the web: same catalog, `MorphingIcon` class, `iconSVG()` for static glyphs |
| `assets/demo.html` | Playground for the JS port: preview, 12-icon grid, Blur/Fade/Raw switch, 1×/0.5×/0.25× slow-mo |
| `scripts/validate-icons.mjs` | Checks icon definitions against the rules and finds the best line order for an icon pair |
| `references/designing-icons.md` | How to draw a new icon in three lines, with worked examples |

Copy the asset for the user's platform into their project rather than rewriting it; adapt naming and styling to their codebase afterwards.

## The three rules

Every icon definition must satisfy these. They are what make "any to any" work.

1. **Exactly three lines.** Each icon is three segments in a 0–1 unit square, drawn with round caps. Keep endpoints about 0.14 from the edges so caps don't clip.
2. **Collapse, don't disappear.** An icon that needs fewer lines (minus, check, chevron) parks the extras as zero-length segments *at a point on one of its visible lines* — the check's elbow, the chevron's apex. With round caps a zero-length line is still a dot, so parking it on a visible stroke keeps it hidden even when nothing fades. `collapsed` at the center (0.5, 0.5) is only safe if a visible line crosses the center (plus, minus).
3. **Rotate when shapes match.** Icons that are the same geometry at different rotations — the four arrows, chevron up/down, plus/close — share a `family` and identical base lines, and differ only by `rotation`. Same-family morphs turn along the shortest arc (arrow right → down turns 90°) instead of interpolating endpoints, which would scramble them.

**Line order is the choreography.** Line *i* of the source morphs into line *i* of the target, start into start. The catalog is ordered so the classic pairs look right: menu → close turns the outer bars into the diagonals and collapses the middle bar; plus → minus shrinks the vertical bar; arrow → chevron grows or collapses the shaft from the apex.

## Behaviour to preserve when porting or modifying

These details are what make it feel good. Keep them unless the user asks otherwise.

- **Spring, interruptible.** `spring(response: 0.3, dampingFraction: 0.8)` — on the web, stiffness `(2π/0.3)²` ≈ 439 and damping `4π·0.8/0.3` ≈ 33.5 with unit mass. Springs keep velocity when retargeted, so rapid taps never jump.
- **Rotate only from rest.** Re-expressing the on-screen icon as "base lines + rotation" is an instant snap, invisible when settled but a jump mid-animation. So the rotation path only runs when nothing is in flight; interrupted morphs fall back to coordinate interpolation.
- **Cross-family morphs happen in the current rotation frame.** Rotate the target lines by `target.rotation − frameRotation` and animate the coordinates, leaving the frame rotation alone. The world-space result is a straight morph with no spin.
- **Three morph styles.** `blur` — a blur pulse (0.6 × line width, 100 ms in, 280 ms out) masks the morph and collapsed lines fade; `fade` — collapsed lines fade, no blur; `raw` — pure geometry, nothing fades, collapsed dots tuck under visible strokes.
- **Reduced motion.** With reduce motion on, the morph becomes a quick crossfade (100 ms out, instant swap, 150 ms in). Opacity survives, movement goes.
- **Speed parameter.** A playback-rate multiplier (1, 0.5, 0.25) applied to every animation, for slow-motion review.
- **Around it (demo polish):** press scale 0.96 over 160 ms ease-out, labels swapped with a blur transition, grid cells cascading in with a 25 ms stagger on first appear only.

## Workflows

### Drop the component into a project

- **SwiftUI:** copy `assets/MorphingIconView.swift`. Use `MorphingIconView(icon: .menu, lineWidth: 10, color: .primary, style: .blur)` and change `icon` to morph. Use `IconGlyph` for static thumbnails. Needs iOS 18+.
- **Web / any JS framework:** copy `assets/morphing-icons.js`.
  ```js
  import { MorphingIcon, icons } from "./morphing-icons.js";
  const toggle = new MorphingIcon(buttonEl, { icon: icons.menu, style: "blur" });
  buttonEl.onclick = () => toggle.set(open ? icons.menu : icons.close);
  ```
  The container sets the size (the SVG fills it). `lineWidth` is in viewBox units out of 100. `color` defaults to `currentColor`. In React, create the instance in a `useEffect` on a ref, call `set()` when the prop changes, and call `destroy()` on cleanup. Don't re-render the SVG from React state, or you lose the springs.
- The icon itself is decorative (`aria-hidden`). Put the accessible label on the button and update it with the state ("Open menu" / "Close menu").
- To see it running, serve `assets/` (`python3 -m http.server`) and open `demo.html`. ES modules don't load from `file://`.

### Add a new icon

1. Read `references/designing-icons.md`.
2. Draw it in three lines on the unit grid. Reuse the catalog's conventions: 0.14 edge margin, bars at x 0.14–0.86, and so on.
3. If it's a rotation of an existing icon, add it to that family with the same `lines` and a new `rotation`. Don't redraw it.
4. Park unused lines with `collapsed(at:)` on a visible line: an endpoint or joint works best.
5. Pick the line order for the icon it will toggle with most often (see below).
6. Add it to **both** platform catalogs if the project uses both, and keep the coordinates identical.
7. Validate: put the new definitions in a JSON array and run `node scripts/validate-icons.mjs icons.json`, then check it in the demo under Raw at 0.25×, where any floating dot or crossed line is obvious.

### Tune a pair's choreography

`node scripts/validate-icons.mjs --pair <from-id> <to-id>` tries all 48 line orders and start/end flips and reports the one with the least endpoint travel. Travel is a heuristic, not a verdict. Changing an icon's order affects every morph *into* it, and a family's base lines are shared by all its members. Check the result in slow motion before committing.

## Gotchas

- `lines.count != 3` is a precondition failure in Swift and a thrown error in JS, by design.
- In raw mode, a collapsed line at the center of an icon with nothing at the center shows up as a stray dot. The validator reports this as a rule 2 error. (The README's `equals` example is a case of this: park it on the top bar, e.g. `(0.5, 0.38)`, instead.)
- Two icons that are secretly rotations of each other but live in different families will scramble instead of rotating. The validator warns about this.
- If you change the stroke width, change the blur radius with it. It's 0.6 × line width, so a thicker stroke needs a bigger blur.
