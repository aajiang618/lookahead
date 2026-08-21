# Design

Recorded from the built interface, not from intention. Where this document and
the code disagree, the code is right and this file is stale.

## The world

A **head-up display**. Not a metaphor applied to a dashboard — the actual
grammar of collimated symbology, because the skill being trained is reading
ahead of the moment, which is what a HUD exists for.

Three consequences run through everything:

1. **Structure is stroke, never fill.** There are no cards, no filled panels,
   no drop shadows, no rounded chrome. A region is bounded by a 1px rule and a
   pair of corner registration marks (`.registered`). A real HUD is one
   projector behind one piece of glass; it cannot fill a shape, only draw one.
2. **Symbology is monochrome.** Warm ivory, one caution amber, one warning red
   used sparingly. Everything the interface *says* is quiet.
3. **The cube is the only saturated colour on screen.** The thing being read is
   loud and nothing else is. This is the single rule that makes the rest cohere.

Explicitly refused: neon accents, glow, bloom, gradient text, glass blur as
decoration, and the near-black-plus-one-neon look that dark trainers default to.

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
| `--ink-faint` | `32%` ivory | 2.5:1 — **strokes only.** Ticks, marks, reticle at rest. Never text. |
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

Three verbs, borrowed from real symbology. Every one of them is disabled by
`prefers-reduced-motion` **and** by the in-app "reduce motion" setting, which
sets `data-reduce-motion` on `:root` and collapses the duration tokens.

| Verb | Where | Behaviour |
|---|---|---|
| **slew** | Tape pointers | Spring, stiffness 220 / damping 30. A damped settle, never a linear tween. |
| **capture** | Mode box, reticle lock, grid answer box | Discrete snap, stiffness 620–700. Modes engage; they do not fade. |
| **sweep** | New drill | One scan line crosses the viewport once. |
| **break** | Missed answer | Reticle corners fly outward, damping 14, so it overshoots and rings. |

The reticle is the interface's strongest signal and it is carried by
**position**, not colour: corners snap inward on a hit and outward on a miss.
That survives a colour-blind reading, which matters because the cube itself is
unavoidably colour-coded.

The cube's turn animation is cubic ease-out, matching a well-tensioned puzzle.

## Surfaces

Three: **Train**, **Cases**, **Log**. Train is the cube. Cases is the per-OLL
progress tracker with a detail pane — the list *is* the tracker, so progress and
reference are one surface rather than two. Log is history and settings.

## Layout

- Mode annunciator (`ModeStrip`) across the top; the active mode is boxed, the
  way an engaged flight mode is.
- Drill: latency tape left, cube in reticle centre, repertoire tape right,
  answer grid below.
- Answer grid is **7 columns, fixed order, forever**. See below.
- One max width (`--max-width`, 82rem); the log narrows to 58rem for reading.

**Responsive.** Below 46rem the two vertical tapes lie down into a compact
meter row above the cube and hand it the full width — at phone widths a
flanked cube is ~150px across, and the cube is the thing being read. The drill
stops competing for a fixed-height column there and simply scrolls.

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

## The tracking panel

The centrepiece, and the one place the layout reorganises itself. While a
prediction is being answered the stage is `tape | cube | tape`. The moment it is
answered, the tapes hide and the stage becomes `cube | tracking panel`: the
numbers are not what anyone is reading at that moment, the pieces are, and the
1200px of horizontal space was otherwise empty.

Three parts, all computed from the algorithm in `src/cube/tracking.ts`:

- **Piece map** — a top-down diagram of the four corner and four edge slots with
  arrows for where each one goes. Corners drawn square, edges round, so the two
  systems stay separable at a glance. The tracked pair is amber; the rest is
  hairline. Clicking a slot follows that piece.
- **Scrubber** — the algorithm as individually clickable moves with a sprung
  cursor on the current one. Stepping is manual by default: an animation you
  cannot pause teaches nothing.
- **Piece picker** — every slot with its destination spelled out (`UR → UL`, or
  `stays`). Pieces the algorithm never moves are dimmed, because following one
  teaches nothing.

**Movement arcs on the cube.** Piece movement is drawn as tube arcs floating at
y = 1.66, clear of the stickers at 1.48, rising with their own span so a long
diagonal clears the cube rather than grazing it. They are children of the cube
group, so they orbit registered to it. A mutual swap collapses to one arc with a
head at each end rather than two overlapping arrows. Amber for the pieces that
decide the answer, ink at 42% for the rest, and by default the rest are not
drawn at all — the necessary set is computed, not chosen. Geometry is a pure
module (`cubeArrows.ts`) so it can be built and checked without a browser; an
arc pointing at the wrong slot is not something the eye reliably catches.

On the cube itself, tracking overrides last-layer focus: the tracked stickers
stay at full opacity and everything else drops to 0.14. Below 62rem the panel
stacks under the cube and the cube gives up height to it.

The panel has two tabs. **Follow the pieces** is the demonstration; **What to
look for** is the computed brief — the readable-piece table, the advice, and the
live class reading. Tabs rather than stacking, because both want the same
column and a solver wants one at a time.

## A new case teaches before it tests

The four introducing reps of a case carry the method on screen, and the hint
ladder is withheld until they are done.

**What it teaches is the reading, not the mechanism.** Three steps — the front
row, the right row, then the comparison that decides between what is left — all
in colours, because two-sided recognition is what a solver actually performs.
Corners and edges appear once, in a subordinate clause on the reveal. They were
the lesson in the first version of this, and that taught the wrong skill: piece
tracking is how you explain a reading, not how you make one.

The claim underneath it is checked rather than asserted: relations between the
legible stickers — same, opposite, neither — determine the case for all 57
OLLs, so the colours always finish. Relations rather than absolute colours,
because an AUF changes every colour in the last layer and no relation between
two of them.

Each comparison is chosen by minimising its **worst** branch rather than its
average, since a rule is only as good as the reading that goes badly. Candidate
sets are named up to four and counted past that — beyond four a list of case
names stops being something you can hold, and "leaves 11 of the 21" is the more
useful sentence anyway, because what it tells you is that the colours have not
done their work yet.

The conclusion reads the blocks off the **resolved state**, not off the case's
canonical recognition summary. The summary describes a PLL at its own reference
AUF; with a different AUF on the cube it is a different case's worth of words,
and printing it under a reading that says otherwise made the lesson contradict
itself.

Two consequences in the layout:

- The lesson steps forward in the same fixed box the hints use, so stepping from
  the front row to the right row does not move the cube.
- A lesson strip is taller than an ask strip, so the whole rep reserves the
  taller height, revealed half included. Sized to the longest lesson any of the
  1,197 drills produces: 5.4rem on a laptop, 9rem at 375px. Without that the
  cube grows the moment the answer appears — the one thing this layout exists to
  prevent.

## On a phone

Installed to a home screen there is no browser chrome, so the app owns the whole
window and the safe-area insets are its problem, not Safari's. Three rules:

- **Insets go on the outer edges only** — the shell header and the drill's
  bottom strip — so the strips keep the height they were designed at.
- **`100dvh`, not `100vh`.** In a browser tab iOS measures `vh` against the
  viewport with toolbars hidden, which pushes the button you press every rep
  under the address bar.
- **The cube takes the drag** (`touch-action: none`). Without it a slow rotate
  scrolls the document instead of turning the cube, which is the difference
  between the cube being an object and being a picture.

At `pointer: coarse` every control pressed during a rep becomes a thumb-height
target and the keyboard legends disappear, since they mean nothing there.

The header collapses to one row below 44rem — the wordmark keeps its glyph and
drops its text. A wrapped header costs about 32px, and on a phone that is 32px
off the cube on every screen.

The home-screen icon is generated, not drawn (`npm run icons`): the mark is
four corner brackets and a boresight, pure axis-aligned stroke, so it rasterises
exactly from filled rectangles in the app's own three colours.

Offline is cache-first, which is right here for a reason particular to this app:
everything it knows is computed on the device from two JSON files, and progress
lives in localStorage. There is no server state to be stale about.

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

`src/components/Hud.tsx` holds the vocabulary: `ModeStrip`, `Tape`, `Reticle`,
`Panel`, `Readout`, `Annunciation`, `Action`, `Ladder`. `Action` has exactly
one filled variant (`primary`, amber) and it is the thing you press to start.

`CaseDiagram` renders the flat top-down case notation every algorithm sheet has
used for decades. `CubeView3D` is the interactive cube. `PllGrid` is the answer
surface.

## Accessibility

- Keyboard-first: the whole drill loop plays without a mouse. Type a case name
  to answer; `Space` advances; `F`/`J` self-grade.
- Focus is a 1px amber outline with offset — the same language as the chrome.
- Correctness is never colour-only (reticle position, grid box).
- Body text meets 4.5:1; `--ink-faint` is barred from text by contract.
- A skip link precedes the header.
- The 3D cube is `aria-hidden`; the case is also carried by a titled 2D diagram.
