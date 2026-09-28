# Designing icons in three lines

## The canvas

- Unit square, origin top-left, y pointing down. Rotation is clockwise around (0.5, 0.5), matching SwiftUI and SVG.
- Round caps, and all strokes the same width. The rendered weight comes from `lineWidth`, not from the geometry.
- Keep endpoints 0.14 from the edges (at least 0.08) so round caps don't clip at heavy weights.
- Shared measurements in the catalog:
  - Full-width bars run from 0.14 to 0.86.
  - Menu bars sit at y 0.26 / 0.5 / 0.74.
  - The arrow apex is at 0.16, the shaft ends at 0.84, and the heads reach ±0.28.
  - The chevron apex is at (0.5, 0.38) with arms to (0.2 | 0.8, 0.62).

## What fits

Anything you can draw with **three or fewer straight strokes**: plus, close, minus, menu, equals, check, play (triangle outline), pause, arrows, chevrons, caret, slash, divide-without-dots, a "less-than/greater-than", a simple download or upload arrow.

What doesn't fit: curves (search, refresh, heart), filled shapes, and anything that needs four or more strokes (square outline, grid). Don't force these into the system. Use an ordinary crossfade for them, or add a separate morphing set with a different line count. Every icon in one set must have the same number of lines.

## Step by step

1. **Sketch the visible strokes** (one to three) on the grid using the shared measurements.
2. **Is it a rotation of an existing icon?** If so, reuse that family's `lines` exactly, set `family`, and set `rotation` (90, 180, 270, 45…). Example: chevron right is the chevron family at 90°.
3. **Park the unused lines.** Use `collapsed(at: p)`, where `p` is on a visible stroke. Joints and endpoints are the best choice: the dot stays hidden in raw mode, and in fade/blur modes the line visibly grows from a place that makes sense.
4. **Order the lines for the partner.** Find the icon this one toggles with in the product: play ↔ pause, menu ↔ close, plus ↔ minus. Line *i* travels to line *i*, so match strokes that should visually become each other, and make the ones that should appear or vanish collapse into a point that's close by. Then run `node scripts/validate-icons.mjs icons.json --pair <partner> <new>` for a travel-minimizing suggestion.
5. **Validate** with `node scripts/validate-icons.mjs icons.json`.
6. **Watch it** in `assets/demo.html` in all three styles at 0.25×. Things to look for: strokes that cross each other mid-morph, dots that float in Raw, and a morph that spins when it shouldn't (a missing family) or scrambles when it should spin.

## Worked examples

These are all validated against the built-in catalog.

**Equals.** It has two bars, so the middle line parks on the top bar, which keeps menu → equals clean: the middle bar shrinks into the top bar.
```json
{ "id": "equals", "name": "Equals",
  "lines": [[0.14, 0.38, 0.86, 0.38], [0.5, 0.38, 0.5, 0.38], [0.14, 0.62, 0.86, 0.62]] }
```

**Pause, paired with play.** Line 0 is play's vertical edge and stays put. Line 1 is play's upper diagonal, which collapses into the top of the left bar. Line 2 is play's lower diagonal, which becomes the right bar. It runs bottom-to-top so it pivots instead of crossing over (this is the `--pair play pause` suggestion).
```json
{ "id": "pause", "name": "Pause",
  "lines": [[0.34, 0.2, 0.34, 0.8], [0.34, 0.2, 0.34, 0.2], [0.66, 0.8, 0.66, 0.2]] }
```

**Chevron left and right.** These join the existing chevron family, so there's no new geometry to draw.
```json
{ "id": "chevron-right", "name": "Chevron right", "family": "chevron",
  "lines": [[0.5, 0.38, 0.2, 0.62], [0.5, 0.38, 0.8, 0.62], [0.5, 0.38, 0.5, 0.38]], "rotation": 90 },
{ "id": "chevron-left", "name": "Chevron left", "family": "chevron",
  "lines": [[0.5, 0.38, 0.2, 0.62], [0.5, 0.38, 0.8, 0.62], [0.5, 0.38, 0.5, 0.38]], "rotation": 270 }
```

## Writing them in code

The JSON line format `[x1, y1, x2, y2]` maps directly onto both platforms:

```swift
static let pause = MorphIcon(
    id: "pause", name: "Pause", family: nil,
    lines: [
        IconLine(start: CGPoint(x: 0.34, y: 0.2), end: CGPoint(x: 0.34, y: 0.8)),
        .collapsed(at: CGPoint(x: 0.34, y: 0.2)),
        IconLine(start: CGPoint(x: 0.66, y: 0.8), end: CGPoint(x: 0.66, y: 0.2))
    ],
    rotationDegrees: 0
)
```

```js
pause: defineIcon({
  id: "pause", name: "Pause",
  lines: [line(0.34, 0.2, 0.34, 0.8), collapsed(0.34, 0.2), line(0.66, 0.8, 0.66, 0.2)],
}),
```

Remember to add new icons to the platform's `catalog` array if the UI lists them.
