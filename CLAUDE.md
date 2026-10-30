# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Arkanoid (brick-breaker) game, implemented per `specs/01-playable-mvp.md` and extended by `specs/02-levels-powerups-skins-highscore.md`: browser JavaScript, Canvas 2D, no libraries, no build step. Code is in `index.html` and `game.js` at the project root, and `index.html` loads `assets/spritesheet.js` first. There is no build system, package manifest, linter, or test suite, so there are no build, lint, or test commands.

Run by serving the folder (`python -m http.server`) and opening `http://localhost:8000`; `file://` can block audio and image loading. Verification is manual, against the spec's acceptance criteria.

Spec 01 fixes these design choices: canvas 640x480, `dt`-based movement in px/s with `dt` capped at 1/30 s, ball speed renormalized after every bounce, audio created only after first user input. Read the spec before changing game behavior.

Spec 02 adds, all in `game.js`:

- **Levels:** `generateLevel(level)` is a pure, seeded (mulberry32), left-right symmetric 6x10 layout; level 1 has no holes. `baseBallSpeed(level)` grows 5% of `BALL.speed` per level, capped at 2x (`LEVEL` constants). Clearing the wall goes to the next level and keeps score and lives.
- **Speed:** `currentBallSpeed()` is the single source of ball speed (base speed, times `POWERUP.frenzyFactor` while Frenzy is active). Balls move in sub-steps of at most `MAX_STEP` px so they cannot tunnel.
- **High score:** one integer in `localStorage` under `STORAGE.highScore`, accessed through `loadHighScore()` / `saveHighScore(n)` (try/catch, in-memory fallback) and written at game over.
- **Power-ups:** destroyed bricks drop capsules with probability `POWERUP.dropChance` (mutable, e.g. set it to 1 in the console to test). Types: `triple` (splits the first ball into 3, max `POWERUP.maxBalls`), `bar` (full-width bar at `BAR.y`), `frenzy` (2x ball speed). Bar and Frenzy last 10 s of `playing` time and refresh when caught again. `resetEffects()` clears effects and capsules on life loss, level change, and new game.
- **Pause menu** (added on branch `pauseLevelSelect`, no spec): `P` toggles `state.paused` (not on the game over screen). While paused, `update()` and `action()` do nothing and `renderPauseMenu()` draws a level selector; clicking its -/+ buttons (`PAUSE_MENU` hit boxes) calls `setLevel(n)` (clamped to 1-99), which regenerates the wall, calls `resetEffects()`, returns to `ready`, and keeps score and lives. `resetGame()` clears `paused`.
- **Skins:** `SKINS` / `SKIN_ORDER` (Retro, Pastel, Neon) are picked on the game over screen with Left/Right (or A/D); Space or click starts the game. The skin is not persisted. Only the spritesheet is filtered; background, HUD text, and capsules are not.

State additions: `state.balls` (replaces `state.ball`), `paused`, `level`, `highScore`, `newRecord`, `capsules`, `effects { bar, frenzy }` (remaining seconds), `skin`.

## Assets

- `assets/spritesheet-breakout.png` is a single spritesheet. `assets/spritesheet.js` holds the frame coordinates (`sx, sy, sw, sh`) for it, in the global constants `SPRITES` (paddle, ball, and blocks by color) and `EXPLOSION_FRAMES` (4 frames per color, `EXPLOSION_DURATION = 150`).
- `applySkin(filter)` rebuilds the drawing source from the original sheet using `ctx.filter` (`'none'` restores the original); it does nothing if the sheet is not loaded or `ctx.filter` is unsupported.
- The sheet loader `loadSpritesheet(cb)` copies the image onto an offscreen canvas and queues callbacks until it is loaded. The image path `assets/spritesheet-breakout.png` is relative to the HTML page that loads the script.
- Draw with `drawSprite(ctx, name, x, y, w, h)`, where block names are prefixed `block_` (for example `block_red`), or with `drawFrame(ctx, frame, x, y, w, h)` for explosion frames. Both silently do nothing until the sheet is loaded.
- `EXPLOSION_FRAMES.gray` reuses the red frames. This may be a placeholder.
- Sounds are in `assets/sounds/`: `ball-bounce.mp3` and `break-sound.mp3`.
## Spec-driven workflow

Features are specified before they are coded. Project skills in `.claude/skills/` define the workflow; both are user-invoked only (`disable-model-invocation`).

- `/spec <description>` asks clarifying questions (scope, data, integration, persistence, UX, risks), then writes `specs/NN-slug.md` in `Draft` state, following `.claude/skills/spec/template.md`. It never writes code. A human changes the state to `Approved`. Replies and specs use the language of the prompt and of the existing specs.
- `/spec-impl <NN-slug>` implements only `Approved` specs (the state label may be in any language). It creates the branch `spec-NN-slug` (controlled by `AutoCreateBranch` in `specs/.spec-config.yml`, currently `true`) and implements one step of the spec's implementation plan at a time, pausing for diff review. It never commits on its own.
- `/neko` (`.claude/skills/neko/`) is an unrelated joke skill that answers like a cat.

Spec layout: header (`Status`, `Depends on`, `Date`, `Objective`), then Why this spec exists, Scope, Data model, Implementation plan, Acceptance criteria, Decisions, Risks, and What is not in this spec. For new behavior, write or update a spec instead of diverging from it silently.

Current specs in `specs/`:

- `01-playable-mvp.md`: Approved; all plan steps implemented on branch `spec-01-playable-mvp`, acceptance criteria pending verification.
- `02-levels-powerups-skins-highscore.md`: Approved; all plan steps implemented on branch `spec-02-levels-powerups-skins-highscore`, acceptance criteria pending verification.

## Repository layout

- `index.html`: canvas page; loads `assets/spritesheet.js`, then `game.js`.
- `game.js`: all game logic (constants, `state`, update, render, input, audio).
- `assets/`: spritesheet PNG, `spritesheet.js` frame table, `sounds/`.
- `specs/`, `.claude/skills/`: spec-driven workflow.
- `README.md`: run instructions and controls. It does not yet mention pause (`P`) or skins.
