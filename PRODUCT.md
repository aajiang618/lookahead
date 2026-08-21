# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React + TypeScript, three.js for the interactive 3D cube, Framer Motion for interface motion. Static build, no server. Confirmed by the user.

## Users

A single speedcuber training alone, at a desk, in short daily sessions. They already know full OLL and full PLL — every algorithm is committed. What they lack is *recognition speed*: the ability to identify which PLL they are about to face while the OLL algorithm is still executing, so the pause between the two stages disappears. Sessions are short and repeated daily rather than long and occasional.

## Scope

One skill: naming the PLL that an unexecuted OLL will leave. Plain PLL
recognition from a solved top was removed as a second track — it is a different
skill with its own tools, and carrying it made every screen answer two questions
at once. Three surfaces only: Train, Cases, Log.

## Product Purpose

Train OLL→PLL lookahead as an isolated, measurable skill. The user is shown a cube state where OLL is not yet solved, mentally applies the known OLL algorithm, and names the PLL that results — before ever touching the cube. The product's job is to make that prediction fast and automatic across all 21 PLL cases and all 57 OLL cases, growing the trained repertoire gradually rather than dumping the full set on day one.

Success is a falling median recognition latency on a repertoire that keeps growing, sustained by a daily habit the user actually keeps.

## Positioning

Existing cube trainers drill *algorithm* recall (see case → recite alg) or PLL recognition from a finished OLL. This trains the seam between the two stages: prediction of the next case from the current one, which is where the real time loss in a CFOP solve sits. Latency is a first-class graded signal, not a stopwatch bolted onto a flashcard app.

## Operating Context

- Desk, keyboard-first, one hand often on a physical cube.
- Short daily sessions (a few minutes), repeated. Streaks and daily targets are part of the ritual.
- The user may want to inspect a case in 3D — orbit it, look at the side faces — to understand *why* a pattern reads the way it does.
- Answers are given two ways, both confirmed: picking a PLL from a grid of case icons (measures pure latency), and reveal-then-self-grade (matches how cubers drill by hand).

## Capabilities and Constraints

- All 21 PLL cases and all 57 OLL cases, with standard names, algorithms, and generated scrambles.
- Scramble generation must produce a real, legal cube state that yields the intended OLL/PLL pair.
- Interactive 3D cube the user can orbit freely; also a flat 2D case diagram for fast scanning.
- Both a visual answer (rendered case) and a written answer (case name + algorithm).
- A scheduler that decides what to show each day, introduces new cases gradually, and re-surfaces weak ones.
- Progress is local-only: browser storage plus JSON export/import. No accounts, no backend, offline-capable.
- Recognition scheduling methodology is being researched separately; the scheduler must grade on *response latency*, not only correctness.

## Evidence on Hand

None supplied. No brand assets, logo, existing site, or user data exist. Case data (algorithms, case definitions) is sourced from public cubing references and is factual, not invented. No performance claims, testimonials, or user counts may be fabricated.

## Product Principles

1. **Latency is the score.** Correct-but-slow is a failure state, and the product must say so. Every drill is timed and every schedule decision reads that time.
2. **The repertoire grows, never floods.** New cases enter on the scheduler's terms. A session should always feel finishable.
3. **Train the seam, not the endpoints.** The distinguishing drill is always "OLL unsolved → which PLL?", not "which alg solves this?".
4. **The cube is inspectable truth.** Any claim the trainer makes about a case can be verified by orbiting the actual 3D state. Nothing is asserted that the cube can't show.
5. **Daily beats intense.** The design optimizes for returning tomorrow over maximizing today.

## Accessibility & Inclusion

Keyboard-first operation throughout (the drill loop must be playable without a mouse). No color-only signalling — cube colors are load-bearing to the domain, so state and correctness must never be encoded in color alone elsewhere. Respect `prefers-reduced-motion`.
