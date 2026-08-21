# Lookahead

One thing: **read the PLL out of an OLL you have not executed yet.**

You are shown a cube with the OLL still pending and the algorithm you use for
it. You name the PLL it will leave. Timed to the hundredth of a second, one case
at a time, building across the 57 OLLs day by day.

It assumes you already know the algorithms. There is no PLL-recognition mode, no
alg trainer, no solve timer.

```bash
npm install
npm run dev
```

## The three screens

**Train** opens on a home page, not straight into a drill. **Today** runs the
scheduler's plan; **Learn** and **Review** are its two halves, so new material
and revision can happen at different times of day; **Learn more** spends past
the day's allowance when you want to. Underneath, **Practise one case** lets you
pick a PLL and see every OLL that can leave it — deliberately **unscored**,
because self-selected reps are exactly what breaks a spaced-repetition schedule.


The interface is white, plain-typed and soft-cornered: no borders anywhere, no
uppercase, one burnt-amber accent spent on the single control you press, and the
cube framed loose with air on every side. The cube is the only saturated colour
on screen and the only hard-cornered thing in the app.

**Train** — the drill, and it is almost entirely cube. A thin strip above (which
exercise, which OLL, your algorithm), the cube filling everything else, a thin
strip below. Nothing sits beside it, and the strips hold a fixed height so the
cube never resizes mid-rep.

A session is a run of **exercises**: one OLL, a few reps each, then the next
case. Every rep the same OLL leaves a different PLL — that is the skill. Nothing
is revealed until you commit: **Space** to reveal, then **J** if you had it or
**F** if you missed, and it moves straight on. Two keys per rep.

**The first time a case comes up, it teaches instead of testing** — in **one
step**, and by whichever route that particular case actually rewards:

> **Read the two rows** — Front row: UBR top, UR top, UFL front → no block.
> Right row: UFL top, UF top, UFR top → no block. That alone is Rb.

> **Follow the pieces** — Corners never move here, only twist: the three you can
> read now (UBR, UFR, UFL) are the three you get. Edges: UB → UR → UL → UB, so
> UR ← UB, UF stays.

A sticker keeps its colour through an algorithm — only its position changes — so
the front and right rows you are going to read **already exist on the cube**,
and for most cases most of them are already in sight. Where they are is computed
backwards through the algorithm's own facelet permutation.

**Colours unless following the pieces is decisively better.** The two are not
equally good to *memorise*: a colour pattern is a perceptual chunk and chunks
collapse into a single glance, while a piece mapping is a procedure that costs
the same every time you run it. So reading wins by default even where it is more
work today. The exception is not "reading is expensive here" but "there is
nothing to do here at all" — when an algorithm freezes a whole system, what you
can already see is what you will be left with. **Twelve of the 57 never move a
corner and five never move an edge; those seventeen follow the pieces and the
other forty read the colours.**

Two findings make the reading work, both checked across all 1,197 drills:

- **Colour relations alone always finish the job.** Relations between the
  stickers you can identify — same, opposite, neither — determine the case for
  **all 57 OLLs**. Relations rather than colours because an AUF changes every
  absolute colour in the last layer and changes no relation between two of them,
  so a rule written this way is AUF-proof by construction.
- **The six stickers of the two-sided read settle it alone about a third of the
  time** (426 of 1,197 drills), and the rest need **0.99 further comparisons on
  average**, four at the very worst. Each comparison is chosen by its *worst*
  branch, not its average: a rule is only as good as the reading that goes badly.

That runs for the four introducing reps of a case and never again: **hints only
exist after a case has been introduced**, because a hint on a rep that was never
a test is a worse copy of the lesson you already had.

**Back** (or `Esc`) leaves a session at any point and counts what you did.

**A** toggles arrows over the cube showing where the pieces travel. Off by
default so an unaided rep is the norm; they show the *algorithm's* fixed
permutation, not the answer, so leaving them on is training wheels rather than
cheating.

Afterwards, **H** takes a hint, and hints are a ladder rather than a lump — each rung gives
away strictly more than the last:

1. **Where to look.** The five pieces that decide this case light up on the
   cube: *"Only five pieces decide this: the UFR, UBR, UFL corners and the UF
   and UR edges. The other three follow from them."*
2. **What the algorithm does to them.** Arrows come on, plus the movement in
   words: *"Corners stay put — only their twist changes. Edges cycle UR → UL →
   UF → UR."*
3. **What you will be left with.** The pattern, in the colour terms you read it
   by: *"When it lands: headlights on the front, headlights on the right —
   headlights = the two outer stickers the same, the middle one different.
   Exactly one case looks like that."*

The first two rungs never name a PLL — checked, for every case. Only the last
narrows to candidates, and even then usually to two or three.

**Taking a hint costs the rep.** It still counts for accuracy and still reaches
the day-scale scheduler, but it cannot advance the mastery streak: a rep you
needed help on is not evidence the case is automatic. Only the latest rung is on
screen at a time, in a fixed-height box, so asking for help never resizes the
cube.

The **scramble** sits under the prompt. Apply it from solved and a real cube
shows what is on screen — or ignore it and practise entirely on the 3D cube,
which you can drag to turn over and scroll to zoom.

**Cases** — per-OLL progress, and everything about one case in one place. The
list is the tracker: all 57, with recognition pace, rep count and hit rate,
filterable by automatic / learning / not started. Picking one opens the cube in
that state, its scramble, **which algorithm you use for it**, per-case stats,
what is still needed before it counts as automatic, and what you most often
misread it as.

**Log** — session history, the recognition trend, the pace ladder, settings, and
export/import. Progress lives in this browser only: no account, no server, works
offline. Export occasionally, because clearing site data clears it.

## On a phone

It installs. Open the published page in Safari, **Share → Add to Home Screen**,
and it runs full-screen with no browser chrome, offline, with its own icon. The
service worker precaches the whole shell at first launch, so after that it
starts on a train, on a plane, in a queue.

Progress is stored on the device it runs on, and a home-screen install has its
own storage — so a phone and a laptop keep separate progress. Move it with the
export/import in Log.

The drill is built for a thumb: the reveal and grade controls are full-height
targets, the cube takes the drag rather than the page, and the layout pads
itself around the notch and the home indicator.

```bash
npm run icons   # regenerate the home-screen icons from the app's own mark
```

## Choosing your algorithm matters

**28 of the 57 cases have published algorithms that leave a different PLL.** A
prediction is only correct against the algorithm you actually execute, so the
picker in Cases is load-bearing rather than a preference, and cases where the
variants disagree say so.

Every case starts on the algorithm the dataset lists first — the common one —
and stays there unless you pick another. A choice is kept for that case from
then on: the drill, the lesson, the hints, the arrows and the scramble are all
generated from whichever algorithm is selected.

## Recognition tips, computed per case

No advice here is hand-written. For each case the app works out:

- **Which pieces you can read** before you start. A last-layer sticker only
  identifies its piece if it is not the top colour, so every case has its own
  readable set — and on average **1.4 of the 8 pieces show no colour at all**
  from a two-sided view and must be inferred.
- **Which piece to follow**: one that is both readable now and actually moved by
  your algorithm.
- **Where it lands.**
- **How far the pattern narrows it.** Corner pattern plus edge pattern cuts 21
  cases to **2.6 on average, 4 at worst** — and the worst group is exactly the
  four G perms.

The arrows draw **only what a two-sided read depends on**, and point *into* the
front and right faces rather than out of them: the question is not "where does
this piece go" but "what will be sitting on the two faces I am about to read".
That averages 3.5 arcs, never more than 5.

Which five pieces matter is computed, not chosen. Exhaustive search over every
subset of the readable pieces, against all 21 outcomes at all four AUFs, says
the minimum is always **three corners and two edges** — and those turn out to be
exactly the pieces whose stickers face front and right. Two independent
derivations, one knowing nothing about which faces you can see, landing on the
same five.

Three findings shaped this, all in `scripts/explore-recognition.ts`:

1. **Every one of the 57 cases is unambiguous from the top, front and right.**
2. **Corners and edges must be classified under the same AUF.** Judge them
   separately and each picks its own flattering angle — H perm, whose edge
   permutation is identical to a U2 turn, then reads as "edges already solved".
3. **"Corner pattern in → corner pattern out" is not a valid shortcut.** It
   fails for 20 of the 57, so the app does not offer it.

## Scheduling: review, and a little more each day

Two layers on two clocks, deliberately kept apart.

**ARTS** (`src/train/arts.ts`) decides which case comes next *within* a session,
from Kellman's Perceptual Learning Modules — speeded visual category
recognition, structurally the same task. It reads response time natively:

    P = a (N - D) [ b (1 - alpha) log(RT / r) + alpha W ]

An answer faster than `r` makes the logarithm negative, so a fluent case is
pushed away; a slow one returns soon; a wrong one jumps to `W`. `r` is your own
typical pace, so the sign flip sits at "faster than you usually are" rather than
at an absolute standard.

**FSRS-6** (`src/train/fsrs.ts`) decides which cases enter a session at all, at
day scale. Desired retention is 0.93 rather than the usual 0.90, and cases still
building fluency get a 0.75 interval multiplier — recognition *speed* decays
faster than accuracy, and FSRS only models accuracy. It receives exactly one
grade per case per day; ARTS updates every rep. Mixing those timescales is the
standard way to break an FSRS implementation.

**Latency becomes the grade** (`src/train/latency.ts`). Motor time is measured
and subtracted, then the answer is scored against your own rolling median with a
per-case offset, so a naturally slower solver is never punished for being slow —
only for being slow relative to themselves. Correct-but-slow grades as *Hard*,
never *Again*.

**New cases arrive gradually**: at most 6 in progress at once, 3 a day, and none
at all if your overall pace is regressing. The order is easiest-to-track first —
fewest moving pieces, shortest algorithms — with the dot cases last.

**Two kinds of leech.** The usual accuracy leech, and a *fluency* leech: a case
reliably correct and reliably slow. It never lapses, so no ordinary scheduler
would flag it, and it quietly costs a second every time it appears.

**A case cannot be mastered in one sitting.** Mastery needs a streak at pace,
consistent timing, three or more separate sessions, and three or more viewing
angles. Without that last one you memorise an image, not a case.

## Verifying it

```bash
npm run check
```

Three suites and a typecheck:

- **`scripts/verify-cases.ts`** — the cube engine and the case data. All turn,
  slice and rotation identities; 140 published algorithm variants each
  preserving the first two layers and solving their own case; **all 1,197
  OLL×PLL drills** generating validly and reading back as the intended PLL; every
  drill keeping the true PLL in the candidate set. It also derives every move's
  facelet permutation from the 3D renderer's own cubie geometry and checks it
  against the engine — if those disagreed, the cube on screen would turn the
  wrong way while the model stayed right.
  It also checks the lesson every case gives itself, across all 1,197 drills:
  four steps in order, none of them thin, **no narrowing the lesson states out
  loud ever ruling out the true case**, every branch set a genuine partition
  holding the answer, every lit sticker legible from the front and right, and —
  the strong claim — the colour comparisons always terminating on exactly one
  case. A recognition rule that can talk you out of the right answer is worse
  than no rule.
- **`scripts/verify-curriculum.ts`** — the unlock order and coverage.
- **`scripts/simulate-scheduler.ts`** — drives a synthetic solver through 90
  daily sessions and asserts the scheduler's properties: cases unlock gradually,
  the active set holds at its cap, cases reach mastery and earn multi-day
  intervals, and a slow-but-accurate case is caught as a fluency leech.

## Case data

`data/OLL.json` and `data/PLL.json` are the J Perm dataset — all 57 OLL and 21
PLL cases with algorithm variants, shape families and mnemonic notes.

Every geometric property (top masks, side stickers, block patterns, movement
arrows, recognition summaries) is **computed from the algorithms** at load time
rather than transcribed, so a diagram cannot disagree with the algorithm that
produces it. `auditCases()` runs at startup and the app says so loudly if the
data ever fails its own check.

## One subtlety worth knowing

OLL 20, 21, 28 and 57 have rotationally symmetric shapes. The shape alone does
not tell you which way round to apply the algorithm — and a different angle
yields a **different PLL**. Drills are therefore always built with the OLL in
canonical orientation, and visual variety comes from rotating the *camera*,
which by construction cannot change the answer.
