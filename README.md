# Lookahead

One thing: **read the PLL out of an OLL you have not executed yet.**

You are shown a cube with the OLL still pending and the algorithm you use for
it. You name the PLL it will leave. Timed to the hundredth of a second, on
whichever of the 57 OLLs you chose to train.

It assumes you already know the algorithms. There is no PLL-recognition mode, no
alg trainer, no solve timer.

```bash
npm install
npm run dev
```

## The three screens

**Three tabs, icons, along the bottom on a phone.** There is no Home and no
Today. The app used to open on a card that decided your day — what was due, how
much you were allowed to learn — and all of it rested on the app knowing better
than you which cases you should be looking at. It does not.

**Train** opens on the selection: all 57 cases, grouped by shape family the way
cubers already talk about them, and you pick. One case or twenty. A family
selects in one press, the choice is remembered between sessions, and nothing is
locked — a case exists the moment you choose it.

Then the drill. It is almost entirely cube: a thin strip above (which OLL, your
algorithm, whether this pairing is new), the cube filling everything else, a
thin strip below. Nothing sits beside it, and the strips hold a fixed height so
the cube never resizes mid-rep. Four options, each carrying the PLL's own
diagram, because matching a shape against a shape is the operation being
trained; a name is a label you have to translate back into a permutation first.

The interface is white, plain-typed and soft-cornered: no borders anywhere, no
uppercase, one burnt-amber accent spent on the single control you press, and the
cube framed loose with air on every side. The cube is the only saturated colour
on screen and the only hard-cornered thing in the app.

## The seam is the unit

One OLL leaves 21 different PLLs, and each of those pairings is its own thing to
recognise. There are **1,197 seams**, and "I have trained OLL 21" can easily
mean you have met four of its twenty-one outcomes.

So the app counts seams rather than reps. Every rep says whether this exact
pairing is **new** or one you have seen, and how far through the case's
twenty-one you are. Unseen outcomes are shown first: uniform random over 21
takes about 74 reps to cover them all and still does not guarantee it, whereas
draining the unseen ones first covers a case in exactly 21 and makes the "new"
flag mean something.

Cases shows the same thing per case — how many outcomes you have met, which
ones, and when you last reviewed it.

## A session

A run of **exercises**: one OLL, a few reps each, then the next case. Every rep
the same OLL leaves a different PLL — that is the skill. Answering is one press.

**The first time you ever train a case, it teaches instead of testing** — once,
in three steps, and by whichever route that particular case actually rewards.
After that it tests, because reading the same sentence four times in a row is
copying rather than learning.

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
can already see is what you will be left with. **Fourteen of the 57 follow the
pieces and the other forty-three read the colours.**

Two findings make the reading work, both checked across all 1,197 drills:

- **Colour relations alone always finish the job.** Relations between the
  stickers you can identify — same, opposite, neither — determine the case for
  **all 57 OLLs**. Relations rather than colours because an AUF changes every
  absolute colour in the last layer and changes no relation between two of them,
  so a rule written this way is AUF-proof by construction.
- **The six stickers of the two-sided read settle it alone about a third of the
  time**, and the rest need **0.99 further comparisons on average**, four at the
  very worst. Each comparison is chosen by its *worst* branch, not its average:
  a rule is only as good as the reading that goes badly.

## Right or wrong, and why

The verdict is two words. **Correct**, with the time — a right answer is its own
explanation, and printing a paragraph under every one of them is how a drill
turns into reading. **Incorrect**, with the case that actually landed and one
sentence saying what separates it from the one you picked.

That sentence is built from the corner and edge **classes** rather than from the
colours on screen, because an AUF changes every colour and no class — so it
stays true whichever way round the case arrived. It stops short of claiming the
difference was visible from two sides: often it was not, and telling someone
they should have seen something they could not is worse than saying nothing.
When two cases genuinely share both classes — the G perms do — it says so.

## Hints: both routes, a rung at a time

Two icons sit at the cube's edge, out of the line you read: the movement arrows,
and the hint ladder. A hint used to be the colour reading only, which is the
method the lesson already committed to — and a hint is asked for at exactly the
moment that method is not working. So the ladder now hands over **both**:

1. **Where to look.** The stickers that decide this case, lit on the cube.
2. **How the pieces move.** The swaps, said as arrivals — what ends up in the
   slot you are about to read — with the arcs drawn on the cube.
3. **What the colours say.** The blocks those pieces land in, and what that
   leaves.
4. **The comparison that settles it.**

Each rung gives away strictly more than the last. The first two are mechanism —
true of the case before any particular drill of it — and neither may name a case
or say what the reading leaves; the suite holds them to that.

**Taking a hint costs the rep.** It still counts for accuracy and still reaches
the day-scale scheduler, but it cannot advance the mastery streak: a rep you
needed help on is not evidence the case is automatic. Only the latest rung is on
screen at a time, in a fixed-height box, so asking for help never resizes the
cube.

After an answer, **C** lays the OLL and the PLL side by side with the algorithm
between them — the before and after together, which is the one comparison the
reveal otherwise takes away.

**A** toggles the arrows, **H** takes a hint, **Space** advances. The arrows
show the *algorithm's* fixed permutation, not the answer, so leaving them on is
training wheels rather than cheating.

The **scramble** sits under the prompt. Apply it from solved and a real cube
shows what is on screen — or ignore it and practise entirely on the 3D cube,
which you can drag to turn over and scroll to zoom. With **Real cube** on, the
scramble is shown alone and full screen and the clock starts when you tap,
because setting a case up in your hands is not recognition and must not be timed
as though it were.

**Cases** — per-OLL progress, and everything about one case in one place. The
list is the tracker: all 57, with recognition pace, outcomes met, hit rate and
when you last reviewed it, filterable by today / learning / automatic / not
started. Picking one opens the cube in that state, its scramble, **which
algorithm you use for it**, per-case stats, all twenty-one outcomes with the
ones you have met marked, and a control to train that case on its own.

**Log** — session history, the recognition trend, the pace ladder, settings, and
export/import. Progress lives in this browser only: no account, no server, works
offline. Export occasionally, because clearing site data clears it.

**Back** (or `Esc`) leaves a session at any point and counts what you did.


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

**26 of the 57 cases have published algorithms that leave a different PLL.** A
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

## What is left of scheduling

**You choose the cases.** There is no unlock order, no daily cap on new
material, no accuracy gate and no active-set ceiling. All of that existed to
answer one question — which cases should this solver be allowed to meet today —
and the question now has a better answer. What survives is everything that
*measures*.

**ARTS** (`src/train/arts.ts`) decides which case comes next *within* a session,
from Kellman's Perceptual Learning Modules — speeded visual category
recognition, structurally the same task. This one still earns its keep: ordering
inside a chosen set is a question you have not answered by choosing it. It reads
response time natively:

    P = a (N - D) [ b (1 - alpha) log(RT / r) + alpha W ]

An answer faster than `r` makes the logarithm negative, so a fluent case is
pushed away; a slow one returns soon; a wrong one jumps to `W`. `r` is your own
typical pace, so the sign flip sits at "faster than you usually are" rather than
at an absolute standard.

**FSRS-6** (`src/train/fsrs.ts`) still runs at day scale, but its output is now
information rather than a gate: it says when a case would be worth revisiting,
and Cases shows you. Desired retention is 0.93 rather than the usual 0.90, and
cases still building fluency get a 0.75 interval multiplier — recognition
*speed* decays faster than accuracy, and FSRS only models accuracy. It receives
exactly one grade per case per day; ARTS updates every rep. Mixing those
timescales is the standard way to break an FSRS implementation.

**Latency becomes the grade** (`src/train/latency.ts`). Motor time is measured
and subtracted, then the answer is scored against your own rolling median with a
per-case offset, so a naturally slower solver is never punished for being slow —
only for being slow relative to themselves. Correct-but-slow grades as *Hard*,
never *Again*.

**Two kinds of leech.** The usual accuracy leech, and a *fluency* leech: a case
reliably correct and reliably slow. It never lapses, so no ordinary scheduler
would flag it, and it quietly costs a second every time it appears.

**A case cannot be mastered in one sitting.** Mastery needs a streak at pace,
consistent timing, and three or more separate sessions.

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
  And it checks that a wrong answer explains itself: across every ordered pair of
  the 21 cases, the explanation names the case that landed, the case you picked,
  and the property that genuinely separates them — or says plainly that nothing
  on the front and right does.
- **`scripts/verify-training.ts`** — the training model. That the shape families
  cover all 57 cases; that a case teaches exactly once; that unseen outcomes come
  first, so all 21 of a case's seams appear within 21 reps and none repeats
  before then; and that a profile from the old scheduled model migrates without
  carrying its ghosts — learning state reset, deliberate settings kept,
  superseded defaults reset rather than inherited.
- **`scripts/simulate-scheduler.ts`** — drives a synthetic solver through 90
  daily sessions of a growing selection and asserts what still holds: a case
  teaches once however long it is drilled, every well-drilled case has met all 21
  outcomes, cases reach mastery and earn multi-day intervals, no single case
  dominates a session, and a slow-but-accurate case is caught as a fluency
  leech.

## Case data

`data/OLL.json` and `data/PLL.json` are the J Perm dataset — all 57 OLL and 21
PLL cases with algorithm variants, shape families and mnemonic notes.

Every geometric property (top masks, side stickers, block patterns, movement
arrows, recognition summaries) is **computed from the algorithms** at load time
rather than transcribed, so a diagram cannot disagree with the algorithm that
produces it. `auditCases()` runs at startup and the app says so loudly if the
data ever fails its own check.

## One subtlety worth knowing

**Fourteen** of the 57 OLL top shapes repeat under a whole-cube rotation — not
the four usually named. The shape alone does not tell you which way round to
apply the algorithm, and a different angle yields a **different PLL**. So every
drill is built *and shown* in the orientation the algorithm is executed in, the
reveal included — and the view is reset to it at the start of every rep, so
turning the cube over to study one case cannot leave the next one rotated.

The camera used to rotate between reps for variety, on the argument that moving
the camera cannot move the cube. True of the cube, false of the solver: shown
one of those fourteen from a rotated angle you align to the shape, execute in a
frame the drill never intended, and get a different PLL from the one being
graded. Measured — with the camera straight, 0 of 1,197 drills disagree with
themselves; read from a rotated camera, 3,528 of 4,788 do.

**Algorithm choice is a recognition decision too.** Every published variant is
scored on how much of the answer the two-sided read pins down on its own, and
four cases use a variant other than the one listed first — OLL 11 and 56 go from
2 of 21 to 13. The suite re-derives that list, so the choice cannot go stale.
