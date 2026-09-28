# Morphing Icons

A SwiftUI icon component where any icon can smoothly morph into any other.

<p align="center">
  <img src="demo.gif" width="300" alt="Live demo — icons morphing between plus, close, arrows, chevrons, menu, check and play" />
</p>

<p align="center"><a href="demo.mov">Full-quality screen recording</a></p>

Every icon is built from the same raw material — exactly three line segments — so any icon can become any other icon by moving twelve coordinates, rotating, or both.

## The three rules

1. **Exactly three lines.** Every icon is three line segments in a unit square, drawn with round caps.
2. **Collapse, don't disappear.** Icons that need fewer lines (minus, check, chevrons) park the extras as zero-length segments at a point on one of their visible lines — the check's elbow, the chevron's apex — so the round cap stays covered even when nothing fades.
3. **Rotate when shapes match.** Icons that share geometry at different rotations — the four arrows, the chevrons, plus → close — belong to a *family* and morph by shortest-arc rotation instead of coordinate interpolation. Arrow right → arrow down turns 90°; it never scrambles endpoints.

## Icon catalog

Plus · Close · Minus · Menu · Check · Play · Arrow up/right/down/left · Chevron up/down

All twelve are interchangeable. Line orderings are chosen so the classic pairs look right: menu → close does the hamburger-to-X (outer bars become the diagonals, middle bar collapses), plus → minus shrinks the vertical bar, arrow → chevron grows or collapses the shaft from center.

## Three morph styles

A sliding segmented switch under the grid toggles how the morph treats non-geometry:

- **Blur** — a blur pulse masks the morph; collapsed lines fade out
- **Fade** — collapsed lines fade out, no blur
- **Raw** — pure geometry, nothing hidden: collapsed lines visibly shrink down and tuck their round-cap dot under a visible line's stroke (the check's elbow, the chevron's apex), so nothing floats once the morph settles

The component takes it as a parameter: `MorphingIconView(icon: .check, style: .raw)`.

## Interaction details

- **Spring-driven and interruptible.** Morphs use a spring (`response: 0.3, dampingFraction: 0.8`) so they retarget continuously when interrupted mid-animation.
- **No jumps under rapid tapping.** Cross-family morphs are expressed in the current rotation frame, and rotation morphs only engage from a settled state — interrupted morphs fall back to coordinate interpolation, which retargets smoothly.
- **Soft blur pulse.** A blur (0.6 × line width) snaps in as a morph begins and dissolves as the spring settles, masking the lines moving and fading so the change reads as one transformation.
- **Press feedback.** Grid cells scale to 0.96 on press (160 ms ease-out).
- **Blur-masked labels.** The icon name swaps with `.blurReplace`, so the change reads as one transformation instead of two overlapping texts.
- **Staggered entrance.** Grid cells cascade in with a 25 ms stagger on first appear only.
- **Reduced motion.** With Reduce Motion enabled, morphs become a quick crossfade — opacity survives, movement goes.
- **Slow-mo toggle.** A pill next to the style switch cycles 1× → 0.5× → 0.25×, playing every morph at half or quarter speed for frame-by-frame eyeballing — the component takes it as a `speed:` parameter.

## Usage

Drop `MorphingIconsScreen.swift` into any SwiftUI iOS app target. `FontShim.swift` provides system-font fallbacks for the demo screen's font helpers; delete it if your project already has Open Sauce One wired up.

The component itself is independent of the demo screen:

```swift
MorphingIconView(icon: .arrowRight, lineWidth: 10, color: .primary)
```

Change the `icon` value and the view morphs to it. Defining a new icon is three lines and a rotation:

```swift
static let equals = MorphIcon(
    id: "equals", name: "Equals", family: nil,
    lines: [
        IconLine(start: CGPoint(x: 0.14, y: 0.38), end: CGPoint(x: 0.86, y: 0.38)),
        .collapsed(at: CGPoint(x: 0.5, y: 0.38)),
        IconLine(start: CGPoint(x: 0.14, y: 0.62), end: CGPoint(x: 0.86, y: 0.62))
    ],
    rotationDegrees: 0
)
```

## Claude skill

[`skills/morphing-icons`](skills/morphing-icons) packages this technique as a skill for Claude Code (and other agents that read `SKILL.md`). It includes the SwiftUI component, a framework-free JS/SVG port with a demo page, a guide to drawing new icons in three lines, and a validator that checks the three rules and suggests the best line order for a pair of icons.

To install it for yourself:

```sh
cp -r skills/morphing-icons ~/.claude/skills/
```

Or copy it into a project's `.claude/skills/` so everyone working in that repo gets it. After that, ask Claude for things like "make the nav menu button morph into a close icon" or "add a pause icon to the morphing set".

```sh
node skills/morphing-icons/scripts/validate-icons.mjs            # check the catalog
node skills/morphing-icons/scripts/validate-icons.mjs --pair menu close
```

## Requirements

iOS 18+ (uses `.blurReplace` and `withAnimation` completion callbacks).
