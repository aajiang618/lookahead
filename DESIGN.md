# Design

Recorded from the built interface, not from intention. Where this document and
the code disagree, the code is right and this file is stale.

## The world

**Quiet, and soft-edged.** It began as a head-up display — collimated
symbology, stroke-only structure, corner registration marks — and was quietened
deliberately. What survives is the part that was doing work: one accent colour,
a cube that is the only saturated thing on screen, and an interface that says as
little as possible.

Three rules run through everything:

1. **Subtract first.** If a rule, a tick, a bracket or a border can come out
   without losing meaning, it comes out. There is not a single border in the
   built interface — checked, not asserted: every element on every surface
   reports a computed border width of zero. Regions are separated by space, and
   given a surface a few percent lighter than the ground only when they
   genuinely need to group.
2. **Corners are rounded.** Every surface and control carries a radius, from a
   10px input to a fully round pill. The cube is the only hard-cornered thing in
   the app, which is exactly where the eye should catch.
3. **The cube is the only saturated colour on screen.** This is the rule that
   made the original direction cohere and it is untouched: everything the
   interface *says* is quiet, and the thing being read is loud.

Explicitly refused, still: neon accents, glow, bloom, gradient text, and drop
shadows. Soft corners, flat light — the softness is in the shape, not in fake
depth.

**What went, and why.** The two vertical tapes and the reticle were the most
instrument-like things here and the drill had already stopped using them; they
were dead code by the time they were deleted. The canopy gradients, the etched
scan lines, the corner registration marks and the boresight cross were texture,
and texture is the first thing to go. The active mode used to be an amber box,
which spent the one accent colour on saying where you already are; it is now a
sliding ivory pill, and the amber belongs to the button you press.

## Colour

Tokens live in `src/styles/tokens.css`.

| Token | Value | Role |
|---|---|---|
| `--ground` | `#0b0e10` | Instrument charcoal. The only background. |
| `--ground-deep` | `#070909` | Text on amber fills. |
| `--ground-lift` | `#11161a` | Hover ground. The only "raised" value, and it is barely raised. |
| `--ink` | `#e8e4d9` | Warm ivory. Primary symbology. **15.9:1** |
| `--ink-strong` | `#fbf8f0` | Readings and headings. |
| `--ink-dim` | `58%` ivory | **The floor for anything a person reads. 5.6:1** |
| `--ink-faint` | `32%` ivory | 2.5:1 — **never text.** What little stroke work is left. |
| `--ink-ghost` | `14%` ivory | Decorative rules. |
| `--caution` | `#ffb020` | Active mode box, target bug, the one filled control. |
| `--warning` | `#ff5c4d` | A missed answer. Nothing else. |

Cube facelets (`--face-u/d/f/b/r/l`) are domain colours and appear only inside
the 3D cube and the case diagrams.

The contrast split is load-bearing and was a real defect once: `--ink-faint`
carried body text at 2.5:1 before it was demoted to a stroke-only token.

**Ground is dark from the use scene, not from category habit** — a desk, at
night or under a lamp, cube in hand, eyes moving between a physical object and
a screen. A light ground would be the brighter thing in the room.

## Type

- **Archivo** — interface, labels, readings. Tabular numerals via `.readout`.
- **Spline Sans Mono** — move notation only (`R U R' U'`), which is genuine
  notation, not a technical costume.

Instrument lettering is the `.label` class: uppercase, `0.14em` tracking,
`0.5625–0.6875rem`, `--ink-dim`. Used for every caption and control.

No kicker or eyebrow sits above any heading; headings carry themselves.

## Motion

Almost none, and all of it disabled by `prefers-reduced-motion` **and** by the
in-app "reduce motion" setting, which sets `data-reduce-motion` on `:root` and
collapses the duration tokens.

| Verb | Where | Behaviour |
|---|---|---|
| **capture** | Mode tab, grid answer box | Discrete snap, spring stiffness 620–700. A mode engages; it does not fade. |
| **reveal** | The answer appearing | A short rise and fade, 220ms, easing out. |

The active mode tab slides between positions on a shared `layoutId`, which is
the only motion in the chrome. The cube's turn animation is cubic ease-out,
matching a well-tensioned puzzle.

The cube's turn animation is cubic ease-out, matching a well-tensioned puzzle.

## Surfaces

Three: **Train**, **Cases**, **Log**. Train is the cube. Cases is the per-OLL
progress tracker with a detail pane — the list *is* the tracker, so progress and
reference are one surface rather than two. Log is history and settings.

## Layout

- Mode tabs (`ModeStrip`) across the top, as a pill group. Nothing else lives in
  the header but the mark; the tagline that sat beside it said what the tabs
  already say.
- Drill: a thin strip, the cube, a thin strip. Nothing beside the cube, ever.
- Answer grid is **7 columns, fixed order, forever**. See below.
- One max width (`--max-width`, 82rem); the log narrows to 58rem for reading.

**The cube is framed loose.** `cubeZoom` defaults to 0.82, below the 1.0 that
would fit its silhouette exactly, so there is air on every side. A cube pressed
against the edges of its frame is harder to read at a glance than one with room
around it, and glancing is the whole skill. Anyone still on the old tight
default is migrated to the new one; a zoom they chose themselves is left alone.

## The drill is one screen

Three rows: a thin strip, the cube, a thin strip. The cube takes every pixel the
strips do not — 78% of the viewport height on a laptop — and **nothing is ever
placed beside it**. The two strips keep a fixed height across ask and reveal so
the cube never resizes mid-rep and the answer never shifts the layout.

Revealing is a discrete swap between two keyed branches, deliberately not an
`AnimatePresence` crossfade: `mode="wait"` holds the incoming child until the
outgoing one finishes exiting, and when that exit does not complete the answer
never mounts at all. It is also the wrong motion — reveal is a capture in this
vocabulary, not a fade.

## Movement arcs on the cube

Opt-in, toggled with `A`, and drawn as tube arcs floating at y = 1.66 — clear of
the stickers at 1.48, rising with their own span so a long diagonal clears the
cube rather than grazing it. They are children of the cube group, so they orbit
registered to it. A mutual swap collapses to one arc with a head at each end
rather than two overlapping arrows. Amber for the pieces that decide the answer,
ink at 42% for the rest, and by default the rest are not drawn at all — the
necessary set is computed, not chosen.

Geometry is a pure module (`cubeArrows.ts`) so it can be built and checked
without a browser. An arc pointing at the wrong slot is not something the eye
reliably catches.

They show the *algorithm's* fixed permutation rather than the answer, which is
what makes leaving them on training wheels rather than cheating.

## Hints hold the layout still

Only the newest rung renders, in a box of fixed height. Stacking all three grew
the bottom strip and shrank the cube by 90px as you asked for help — the one
moment the view should be perfectly still. Each rung supersedes the last, so
nothing is lost by showing one.

## Rules that are product decisions, not style

- **The answer grid never reorders.** A grid that reshuffles must be searched,
  and search time contaminates a recognition measurement. Held fixed, it
  becomes spatial memory and drops out of the timing.
- **The canvas CSS size is pinned to its container.** `setSize(w, h, false)`
  updates the drawing buffer but not the CSS box, so an unpinned canvas lays
  out at its attribute size and grows its own parent.
- **The camera fits the viewport rather than sitting at a fixed distance.**
  Distance is derived from the frustum and the cube's silhouette radius (2.16
  world units for the three-quarter view), so the cube fills its frame at any
  aspect ratio. A fixed distance either crops on a short viewport or leaves the
  cube tiny on a wide one. `cubeZoom` scales that fit; scroll and pinch also work.
- **The cube's field is sized against its chrome**, `calc(100vh - 30rem)`
  clamped, not a bare `vh` fraction — so the answer grid never drops below the
  fold on a short window.
- **Accuracy is shown small and late.** Across 21 cases it saturates near 100%
  within weeks and then carries no information. Median latency is the headline.
- **No "starting class" is ever shown.** Classification picks its reference AUF
  jointly across corners and edges, so when the edges move the reference can
  shift and the corners appear to change class even for an algorithm that never
  touches one. True, but it reads as a contradiction — and a starting class is
  not something a solver can act on. The pieces are.
- **No progress bar without the reason beside it.** The repertoire shows what
  is actually missing — "3 more in a row under 0.71s", "1 more session" —
  because that is actionable and a bar is not.

## Components

`src/components/Hud.tsx` holds the vocabulary, now five parts: `ModeStrip`,
`Panel`, `Readout`, `Annunciation`, `Action`, `Ladder`. `Action` has exactly one
filled variant (`primary`, amber) and it is the thing you press to go on.
`Panel` is a rounded surface with no border, used only where content genuinely
needs grouping.

`CaseDiagram` renders the flat top-down case notation every algorithm sheet has
used for decades. `CubeView3D` is the interactive cube. `PllGrid` is the answer
surface.

## Accessibility

- Keyboard-first: the whole drill loop plays without a mouse. Type a case name
  to answer; `Space` advances; `F`/`J` self-grade.
- Focus is a 2px amber outline with offset, rounded to match whatever it lands
  on.
- Correctness is never colour-only: the grid answer box and the verdict text
  both carry it.
- Body text meets 4.5:1; `--ink-faint` is barred from text by contract.
- A skip link precedes the header.
- The 3D cube is `aria-hidden`; the case is also carried by a titled 2D diagram.
