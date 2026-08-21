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
| `--ground` | `#ffffff` | White. The only background. |
| `--ground-deep` | `#ffffff` | Text that sits on a filled accent. |
| `--ground-lift` | `#f4f5f6` | Hover ground. |
| `--ink` | `#14181b` | Body and headings. **15.7:1** |
| `--ink-strong` | `#05070a` | Readings and titles. **19.6:1** |
| `--ink-dim` | `62%` ink | **The floor for anything a person reads. 6.4:1** |
| `--ink-faint` | `34%` ink | **Never text.** What little stroke work is left. |
| `--ink-ghost` | `12%` ink | Decorative rules. |
| `--surface` / `--surface-strong` | `4%` / `8%` ink | Grouping, in place of a border. |
| `--caution` | `#b45309` | The one filled control, and the one accent. |
| `--warning` | `#b91c1c` | A missed answer. Nothing else. |

Cube facelets (`--face-u/d/f/b/r/l`) are domain colours and appear only inside
the 3D cube and the case diagrams.

**The accent had to change with the ground.** The old signal amber `#ffb020`
reads at 1.8:1 on white — it cannot carry text and it cannot be a button.
`#b45309` reads at 5.0:1 on white *and* takes white text at 5.0:1, measured in
the browser, so one token works as ink and as fill.

The contrast split is load-bearing and was a real defect once: `--ink-faint`
carried body text before it was demoted to a stroke-only token.

**Ground is white because it was asked for.** The dark ground had a reason —
a desk at night, cube in hand, a screen that should not be the brightest thing
in the room — and that reason is now overruled by preference, which is a
perfectly good reason of its own. What survives the swap is the rule that
matters: the cube is the only saturated colour on screen, and on white it is the
only dark mass as well.

## Type

- **Archivo** — interface, labels, readings. Tabular numerals via `.readout`.
- **Spline Sans Mono** — move notation only (`R U R' U'`), which is genuine
  notation, not a technical costume.

Captions are the `.label` class: **plain sentence case, no tracking**,
`0.75rem`, `--ink-dim`. Used for every caption and control.

The caps and `0.14em` tracking that used to mark this out as an instrument were
the loudest thing left once the lines came out, so they went too. Two knock-on
repairs came with that, both caught by measurement rather than by eye:

- Captions at `0.5rem` were legible as tracked capitals and simply small as
  sentence case, so the floor came up to `0.6875rem`.
- The drill header stopped fitting a phone. It carried an exercise number and a
  rep counter; the exercise number is not something a solver can act on, so it
  is gone rather than shrunk.

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

**The cube is framed loose.** `cubeZoom` defaults to 0.7, well below the 1.0
that would fit its silhouette exactly, so there is a good deal of air on every
side. A cube pressed against the edges of its frame is harder to read at a
glance than one with room around it, and glancing is the whole skill. Anyone
still sitting on a default they never chose is migrated forward — the list of
superseded defaults lives in `store.ts` — while a zoom set by hand is left
alone.

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
