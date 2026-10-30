# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Arkanoid (brick-breaker) game. No game code, build system, package manifest, linter, or tests exist yet. There are no build, lint, or test commands. Update this file when they are added.

Stack is decided by `specs/01-playable-mvp.md` (state `Approved`): browser JavaScript, Canvas 2D, no libraries, no build step. Files will be `index.html` and `game.js` at the project root, loading `assets/spritesheet.js` first. Run by serving the folder (`python -m http.server`) and opening the page; `file://` can block audio and image loading. Verification is manual, per the spec's plan steps.

The README still says "developed in python with the library Pygame". That is wrong. Spec 01 step 12 corrects it.

Spec 01 fixes these design choices: canvas 640x480, `dt`-based movement in px/s with `dt` capped at 1/30 s, ball speed renormalized after every bounce, audio created only after first user input. Read the spec before changing game behavior.

## Assets

- `assets/spritesheet-breakout.png` is a single spritesheet. `assets/spritesheet.js` holds the frame coordinates (`sx, sy, sw, sh`) for it, in the global constants `SPRITES` (paddle, ball, and blocks by color) and `EXPLOSION_FRAMES` (4 frames per color, `EXPLOSION_DURATION = 150`).
- The sheet loader `loadSpritesheet(cb)` copies the image onto an offscreen canvas and queues callbacks until it is loaded. The image path `assets/spritesheet-breakout.png` is relative to the HTML page that loads the script.
- Draw with `drawSprite(ctx, name, x, y, w, h)`, where block names are prefixed `block_` (for example `block_red`), or with `drawFrame(ctx, frame, x, y, w, h)` for explosion frames. Both silently do nothing until the sheet is loaded.
- `EXPLOSION_FRAMES.gray` reuses the red frames. This may be a placeholder.
- Sounds are in `assets/sounds/`: `ball-bounce.mp3` and `break-sound.mp3`.

## Spec-driven workflow

Project skills in `.claude/skills/` define the workflow for features. Both are user-invoked only.

- `/spec <description>` asks clarifying questions, then writes `specs/NN-slug.md` in `Draft` state. It never writes code. A human changes the state to `Approved`.
- `/spec-impl <NN-slug>` implements only `Approved` specs. It creates the branch `spec-NN-slug` (controlled by `AutoCreateBranch` in `specs/.spec-config.yml`) and implements one plan step at a time, pausing for diff review. It never commits on its own.

The directory is not yet a git repository, so `/spec-impl` needs `git init` first. `specs/` holds `.spec-config.yml` (`AutoCreateBranch: true`) and `01-playable-mvp.md` (Approved, not yet implemented). `/neko` is also defined in `.claude/skills/neko/`.
