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

**Three tabs on a bottom bar, icons only** (Heroicons outline, inlined — a
handful of paths do not justify a dependency and the offline build must not
fetch). Train, Cases, Log. On a phone the bar is fixed to the bottom where a
thumb already is, and the main area pads itself so the drill's strip never
slides under it. On a laptop the same strip sits in the header.

**Home is gone, and Today with it.** There were four tabs and the first was a
card that decided your day: what was due, how many new cases you were allowed,
a progress bar toward 57. Every part of it rested on the app knowing better than
the solver which cases they should be looking at, and it does not. Train now
opens on the selection, which is the only question the app needs answered before
it can start.

**The selection is all 57, grouped by shape family.** Dot, Fish, Lightning — the
names cubers already use, so selecting a meaningful batch is one press rather
than six. Every tile carries its own diagram, because a shape is recognised
faster than a numeral, which is rather the point of this app. Nothing is locked:
a case exists the moment it is chosen. The selection lives in settings rather
than in the URL — a 57-case set does not belong in a hash — so it survives a
reload and comes back next session.

**Tiles count seams, not reps.** A tile says `7/21`, or `new`. One OLL leaves 21
PLLs and each pairing is its own thing to recognise, so a rep count flatters:
twenty reps of one case can mean five of its twenty-one outcomes. The header
counts the same way, `n of 1197 seams seen`, because that is the honest size of
the thing being learned.

**The lesson is one sentence, and it leads with the thing to memorise.**
"Front a 2-bar, right no block — Gb, sharing it with Ga, Gc or Gd. Separate them
before you turn: UBL top vs UF top — same → …". The block pair and the case it
means come first, because *that* is what you want left in your head in a month;
the stickers you read it from come second, because they are only how you get
there today.

The pair is **not** unique — it leaves 2.6 cases on average — so the sentence
never says "that pair is Gb" flatly. It names what else shares the pattern,
drawn from the same joint corner/edge classification the rest of the app uses,
and then hands over the comparison that separates them. A recognition rule that
is false four times in ten is worse than none.

**"Real cube" shows the scramble alone, full screen, until you tap.** The clock
starts on the tap, not when the trial was built, because setting a case up in
your hands is not recognition and must not be timed as though it were. The panel
is the tap target — you should not have to aim while holding a cube.

It is a setting, off by default, where it used to be what the timed test always
did. With one training mode rather than five, the gate would otherwise cost a
tap on every rep of a session done entirely on screen — and most are. The case
picker that used to be layered on this screen has gone to its own page, which is
where the session now starts anyway.

**Teach once, then test — and the teaching is step by step.** A case's
introduction used to be four readings of one sentence in a row, which is copying
rather than learning. Only the first introducing rep teaches now, and it walks
three steps, the way you would be shown at a table: **the case** (the whole cube,
nothing emphasised), **notice these** (the handful of stickers that decide it lit
up), then **how it reads** (the pattern those colours make and the PLL it means).
The cube is the same throughout — only what is emphasised changes — so the shape
stays in the eye while the words build on it. The rest of the introduction, and
review, test with four options, and every answer carries the reading step's own
sentence.

**Four options is the answering surface everywhere** a rep is a test. The
21-cell grid is gone, and so is reveal-and-self-grade: it measured whether a
solver would admit to a miss rather than whether they had one, and a four-option
test answers the same question without asking anyone to be honest under time
pressure. A session that teaches a case and then asks you to grade yourself on
it never actually checks whether you knew it.

**Version 5 of the store resets learning state on load.** The largest reset yet:
the app no longer decides what you train, so phases, streaks and due dates earned
under a curriculum that unlocked cases on your behalf describe a schedule that
does not exist. Settings survive — with one exception that has now bitten four
times: a **superseded default is not a preference**. `reveal` was the old default
answering mode, `varyAngle` the old default camera, and the old cube zoom would
have kept the cube framed tight; each would have silently disabled the thing that
replaced it.

The migration carries one thing forward deliberately. The timed test's case
picker is the direct ancestor of the training selection, so a chosen set becomes
`trainCases` rather than being emptied — and it tests for length rather than for
presence, because the value being migrated from is usually an empty array and
`??` treats `[]` as a real answer. That bug was caught by the suite, not by
reading the code.

**The hidden attribute always wins** (`[hidden] { display: none !important }`).
Its UA style is a plain `display: none`, which any authored `display: flex` on
the same element silently defeats — which is exactly how the Cases list kept
rendering underneath the case it had supposedly handed the screen to.

**Cases is master–detail, and on a phone those are separate pages.** Sharing one
screen gave 57 rows a 268px window with a cube parked underneath — four cases
visible out of fifty-seven, in a pane most people would not notice was
scrollable. Below 62rem the list fills the screen, tapping a case opens it as its
own page, and a back control returns. The route carries the selection
(`#/cases/oll-4`), so a case can be linked to and survives a reload.

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

## The camera never rotates

It used to, for variety, on the argument that rotating the camera cannot change
the cube and therefore cannot change the answer. True of the cube. False of the
solver.

**Fourteen of the 57 OLL top shapes repeat under a whole-cube rotation** — not
the four this file used to name. Shown one of those from a rotated camera, a
solver aligns to the shape, executes in a frame the drill never intended, and
gets a genuinely different PLL from the one being graded. Measured: with the
camera straight, **0 of 1,197 drills disagree**; reading them from a rotated
camera, most do.

So the cube is always presented in the orientation the algorithm is executed in,
through the reveal as well. Variety comes from the PLL underneath and the AUF,
which change every rep and cannot change the case's name. `MASTERY_MIN_ANGLES`
went from 3 to 1 with it — mastery counted distinct camera angles, and nothing
could ever have been mastered once the camera stopped moving.

## Algorithm choice is a recognition decision

An algorithm decides where the stickers you can see end up, so two variants of
one OLL can differ enormously in how much of the answer lands on the front and
right. Every variant is scored on how many of the 21 outcomes the two-sided read
pins down alone, and four cases use a variant other than the dataset's first:
**OLL 11 and 56 go from 2 of 21 to 13**. The suite re-derives the list and fails
if another published algorithm would now read better, so a hand-picked choice
cannot go stale. The picker in Cases overrides all of it — muscle memory beats a
marginal recognition gain.

## What the lesson says, in what order

Corners before edges, because the corner permutation splits the 21 cases into
three groups before you have looked at an edge — the order every recognition
guide teaches. Three steps:

1. **The case**, in the orientation you would execute it.
2. **What won't move** — the read stickers the algorithm leaves alone. These are
   free: what you see now is what will be there afterwards, which turns a
   six-sticker prediction into a two or three sticker one.
3. **What reveals it** — headlights on each face, then which edges match a
   corner beside them, then the case and what shares the pattern.

The textbook shortcut "headlights on both faces means the corners are solved"
is **not** used, because it does not survive checking: across the 84 PLL×AUF
positions it breaks 28 times. It describes headlights counted around all four
faces, which is not what two-sided recognition can see. The narrowing comes from
the joint corner/edge classification instead, which is exact.

## A new case teaches before it tests

The FIRST rep of a case you have never trained carries the method on screen,
and the hint ladder is withheld until it is done. Exactly one rep: it used to be
four, of which three showed a lesson nobody was still reading, and those three
were spent without ever counting toward anything.

**Three steps, then the answer.** The lesson walks the whole case, then the
stickers that will not move, then what the colours reveal — and the conclusion
lands with the revealed cube. The suite enforces the shape: four steps in order,
none of them thin, and no step longer than 260 characters, because the strip it
lives in is a fixed height.

**Which method depends on the case, and the bar for leaving the colours is
high.** Reading and following pieces are not equally good to *memorise*: a
colour pattern is a perceptual chunk and chunks collapse into a single glance
with practice, while a piece mapping is a procedure that costs about the same
every time you run it. So reading wins by default even where it is more work
today, because it is the route that gets faster.

The exception is not "reading is expensive here" — it is "there is nothing to do
here at all". When an algorithm freezes a whole system, the corners or edges you
can already see are the ones you will be left with, and that is not a mapping to
memorise, it is permission to skip half the problem. Zero work beats cheap work.
**Fourteen of the 57 freeze a whole system and follow the pieces; the other
forty-three read the colours.**

Both costs are still measured and still recorded on the choice, because they are
what the wording of the lesson is built from.

The average is taken over distinct readings rather than over the 84 outcome
states. Same number, a tenth of the work, which matters because it runs on a
phone the first time a case appears.

## The strips are reserved, and the reservation is measured

The cube must not change size when the answer appears, so the bottom strip
reserves the height of its **taller** branch — the ask, which carries the
scramble, the hint line and the four options. Those numbers are measured in a
browser rather than estimated: **239px of content on a laptop and 345px at 375px
wide**, giving reservations of 17rem and 23.25rem.

This has now gone stale five times, each time because the strip's content grew.
Most recently the options gained a diagram each and the hint box grew to fit the
longest rung, and the cube began growing 15px on every reveal on a phone. It is
measured on both viewports, on both branches, every time.

The same discipline caught a second thing. The hint box hides its overflow, and
at its old height the two longest rungs — 138 characters for "where to look" and
165 for the piece swaps — were being silently clipped on a phone, losing the line
that names the right row. The box is sized to the longest rung any case
produces, computed across all 1,197 drills rather than eyeballed.

An earlier failure is worth keeping in mind: a verification pass once confirmed
this was fine because the rep being measured happened to be a *teaching* rep,
which reserves its own larger height. The check confirmed the case that was fine
and never exercised the one that wasn't.

## A way out

The drill has a **Back** control in its top strip, and `Esc` does the same. It
ends the session and returns to standby with whatever was done counted. Until
it existed the only exits from a started session were to finish it or reload the
page, which is not a thing an app installed on a phone should make you do.

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

The home-screen icon is generated, not drawn (`npm run icons`): the mark is four
corner brackets and a cross, pure axis-aligned stroke, so it rasterises exactly
from filled rectangles in the app's own three colours.

Offline is cache-first, which is right here for a reason particular to this app:
everything it knows is computed on the device from two JSON files, and progress
lives in localStorage. There is no server state to be stale about.

**An unoriented sticker is grey**, the way every algorithm sheet has drawn it.
It was near-black, which on a white page turned a dot case into eight black
squares — the cube looked switched off rather than unsolved.

## A hint carries both routes, one rung at a time

A hint used to be a different account of the case from the one it was taught
with — pieces, then arrows, then shape — while the lesson spoke in colours. Two
vocabularies for one skill is one too many, so a hint became the colour reading
alone.

That was one correction too far. The lesson commits to a single method per case,
because a lesson has to leave you with one thing to memorise; but a hint is asked
for at exactly the moment that method is not working, and answering with the same
method again is no help at all. So the ladder carries **both routes**, in four
rungs: where to look, how the pieces move, what the colours say, and the
comparison that settles it.

The first two are mechanism — true of the case before any particular drill of it
— and the suite holds both to the same bar: neither may name a case, and neither
may say what the reading leaves. That check earned its keep immediately, catching
the word "only" in "only twist", which is innocent but phrased exactly like a
conclusion; the rung says "just twist" instead.

**The two aids are icons at the cube's edge.** They were labelled buttons in the
bottom strip, in the middle of the line you read every rep. You reach for them
while looking at the cube, so they sit beside it, and they are absolutely
positioned so that showing or hiding them cannot change the strip's height.

## Hints hold the layout still

Only the newest rung renders, in a box of fixed height. Stacking them grew the
bottom strip and shrank the cube by 90px as you asked for help — the one moment
the view should be perfectly still. Each rung supersedes the last, so nothing is
lost by showing one. The box is sized to the longest rung any of the 57 cases
produces, because it hides its overflow and a box that silently clips a hint is
worse than one that never offered it.

## Rules that are product decisions, not style

- **Four options are shuffled; twenty-one were not.** The old 21-cell grid was
  held in fixed positions forever, because a grid that reshuffles must be
  searched and search time contaminates a recognition measurement. Four options
  are read at a glance rather than searched, so the argument inverts: fixed
  positions would let a solver learn where the answer tends to sit. The shuffle
  is seeded from the drill, so it is stable across a re-render and never moves
  under the pointer.
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
used for decades — and it now does most of the work in the app, as the tile on
the selection screen, the row marker in Cases, the seam map, and the face of each
of the four answer options. `CubeView3D` is the interactive cube. `PllChoices` is
the answer surface.

## Accessibility

- Keyboard-first: the whole drill loop plays without a mouse. `Space` advances
  and steps the lesson, `H` takes a hint, `A` toggles the arrows, `Esc` leaves.
- Focus is a 2px amber outline with offset, rounded to match whatever it lands
  on.
- Correctness is never colour-only: the verdict is the words *Correct* or
  *Incorrect*, not a colour on a tile.
- Every contrast in this document is measured in a browser, not derived. Two
  failures found that way: `--ink-faint` on the selection tiles at 2.1:1, and
  amber-on-amber at 3.6:1 wherever an accent-tinted ground carried accent text.
  `color-mix` interpolates in oklab, so reasoning about the sRGB blend gives the
  wrong answer by a quarter of a point — which is exactly the margin these
  failures sat in.
- Body text meets 4.5:1; `--ink-faint` is barred from text by contract.
- A skip link precedes the header.
- The 3D cube is `aria-hidden`; the case is also carried by a titled 2D diagram.
