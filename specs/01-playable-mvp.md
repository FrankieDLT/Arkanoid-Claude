# SPEC 01 — Playable Arkanoid MVP

> **Status:** Approved
> **Depends on:** None
> **Date:** 2026-10-29
> **Objective:** A browser game (HTML5 Canvas 2D, vanilla JS) where the player moves a paddle with keyboard or mouse, bounces a ball to break a wall of bricks, and plays until all 3 lives are lost, with score, sprites, sounds, and break animations.

---

## Why this spec exists

`CLAUDE.md` flagged an unresolved stack conflict: the README says Python/Pygame, but the only existing code (`assets/spritesheet.js`) is browser JavaScript. This spec closes it in favor of **browser JS + Canvas 2D** so the existing sprite loader is reused as-is. The README line about Python/Pygame must be corrected as part of this spec.

---

## Scope

**In:**

- A single canvas game with states: `ready` (ball stuck on paddle), `playing`, `gameover`.
- Paddle controlled by keyboard (Left/Right arrows or A/D) and mouse (follows cursor X).
- Launching the ball with Space or mouse click; restarting after game over with Space or click.
- Ball movement and collisions against walls, ceiling, paddle, and bricks, at constant speed.
- Paddle bounce angle that depends on where the ball hits the paddle.
- Wall of 6 rows x 10 columns, one color per row, one hit destroys a brick, 10 points each.
- Regenerating the wall when all bricks are destroyed (ball resets on paddle, score and lives carry over).
- 3 lives; losing the ball below the paddle costs a life; at 0 lives, `gameover` screen.
- HUD showing score and lives.
- Rendering with `drawSprite` / `drawFrame` from `assets/spritesheet.js`.
- Sounds: `ball-bounce.mp3` on wall/paddle bounces, `break-sound.mp3` on brick destruction.
- Explosion animation (`EXPLOSION_FRAMES`, `EXPLOSION_DURATION`) on the destroyed brick's position.
- Correcting the README tech-stack line and updating `CLAUDE.md` (project status, run command).

**Out of scope (for future specs):**

- Win screen or level progression (clearing the wall just regenerates it).
- Gray multi-hit (armored) blocks.
- Power-ups, multiple balls, lasers.
- Speed increase over time.
- High-score persistence.
- Pause, menu, or title screen.
- Touch/mobile controls.
- Automated tests, build system, or package manifest.

---

## Data model

```js
// Fixed game constants (game.js)
const W = 640, H = 480;               // canvas size in px
const BRICK = { cols: 10, rows: 6, w: 64, h: 32, top: 60 }; // sprite 32x16 scaled x2
const ROW_COLORS = ['red', 'yellow', 'cyan', 'magenta', 'hotpink', 'green']; // row 0 to 5
const PADDLE = { w: 100, h: 12, y: 440, speed: 480 };       // speed in px/s
const BALL = { size: 16, speed: 320 };                        // speed in px/s
const MAX_BOUNCE_ANGLE = 60 * Math.PI / 180;                  // from vertical, at paddle edges
const START_LIVES = 3, POINTS_PER_BRICK = 10;

// Mutable state
const state = {
  mode: 'ready',          // 'ready' | 'playing' | 'gameover'
  score: 0,
  lives: START_LIVES,
  paddle: { x: 0 },       // left edge; y comes from PADDLE.y
  ball: { x: 0, y: 0, vx: 0, vy: 0 },  // top-left of the 16x16 sprite
  bricks: [/* { x, y, color, alive } */],
  explosions: [/* { x, y, color, start } */], // start = timestamp in ms
};
```

Conventions:

- Coordinates: origin top-left, Y grows downward.
- Velocities in pixels per second, positions updated with `dt` (seconds) from `requestAnimationFrame`, with `dt` capped at 1/30 s to avoid tunneling after a tab switch.
- Explosion frame index = `floor((now - start) / (EXPLOSION_DURATION / 4))`; the explosion is removed when the index reaches 4.
- The ball keeps `BALL.speed` after every bounce (the velocity vector is renormalized).

---

## Implementation plan

1. Create `index.html` (a 640x480 `<canvas id="game">`, loads `assets/spritesheet.js` then `game.js`) and an empty `game.js` that calls `loadSpritesheet` and starts the `requestAnimationFrame` loop. Manual test: serve with `python -m http.server`, open the page, see a blank canvas and no console errors.
2. Draw the paddle at the bottom and the 6x10 brick wall using `drawSprite`. Manual test: the wall shows 6 colored rows, in the order of `ROW_COLORS`.
3. Add paddle input: keyboard (arrows/A/D) and mouse X, clamped to the canvas. Manual test: the paddle moves with both inputs and never leaves the canvas.
4. Add the `ready` state: the ball sits centered on the paddle and follows it; Space or click launches it upward with a small random horizontal component. Manual test: the ball follows the paddle, then launches.
5. Implement ball movement and bounces against the left, right, and top walls. Manual test: the ball bounces off the walls and ceiling at constant speed.
6. Implement the paddle collision with angle based on hit position (center is near vertical, edges reach `MAX_BOUNCE_ANGLE`). Manual test: hitting the paddle's left edge sends the ball left, the right edge sends it right.
7. Implement brick collisions: destroy the brick, reflect the ball on the axis of least penetration, add `POINTS_PER_BRICK`. Manual test: bricks vanish on hit and the ball deflects correctly on top, bottom, and side hits.
8. Add lives and game over: the ball falling below the canvas costs a life and returns to `ready`; at 0 lives, enter `gameover`; Space or click restarts a full reset. Manual test: lose 3 balls, see the game over screen, restart.
9. Add the HUD (score and lives, drawn in the top 60 px) and the wall regeneration when no brick is alive. Manual test: score updates on each hit; clearing the wall (temporarily reduce the brick count in the console) gives a new wall with score and lives preserved.
10. Add sounds: `ball-bounce.mp3` on wall/ceiling/paddle bounces, `break-sound.mp3` on brick destruction. Create the `Audio` objects after the first user input to satisfy autoplay policies, and clone/restart them so rapid hits are audible. Manual test: both sounds play at the right events.
11. Add the explosion animation: on brick destruction push an entry in `state.explosions` and draw the matching `EXPLOSION_FRAMES[color]` frame. Manual test: a 4-frame animation plays for about 150 ms where the brick was.
12. Correct the README tech-stack line and update `CLAUDE.md` (project status and the run command). Manual test: both files describe the real project.

---

## Acceptance criteria

- [ ] Serving the folder with a static server and opening `index.html` shows the game with no console errors.
- [ ] The canvas is 640x480 and the initial wall has exactly 60 bricks in 6 rows of 10.
- [ ] Row colors from top to bottom are red, yellow, cyan, magenta, hotpink, green.
- [ ] The paddle moves with Left/Right arrows, A/D, and the mouse, and never leaves the canvas.
- [ ] Before launch, the ball stays on the paddle and follows it; Space or click launches it.
- [ ] The ball bounces off the left, right, and top walls.
- [ ] Hitting the paddle's left edge sends the ball leftward, the right edge rightward, and the center nearly vertical.
- [ ] The ball speed is `BALL.speed` (320 px/s) before and after every bounce.
- [ ] Hitting a brick removes it, adds exactly 10 points to the score, and deflects the ball.
- [ ] Losing the ball costs exactly one life and returns to the `ready` state with the wall unchanged.
- [ ] After losing the third life, a game over screen is shown; Space or click starts a new game with score 0, 3 lives, and a full wall.
- [ ] Destroying the last brick generates a full new wall, and score and lives are kept.
- [ ] The HUD always shows the current score and remaining lives.
- [ ] `ball-bounce.mp3` plays on each wall, ceiling, and paddle bounce, and `break-sound.mp3` on each brick destruction.
- [ ] A 4-frame explosion animation of the brick's color plays at the destroyed brick's position and disappears after about 150 ms.
- [ ] The README no longer says the game is developed in Python/Pygame.
- [ ] The only new files at the project root are `index.html` and `game.js`.

---

## Decisions

- **Yes:** browser JS + Canvas 2D. It reuses `assets/spritesheet.js` unchanged and needs no build step.
- **No:** Python + Pygame. It matches the README but would discard the existing loader and force porting the sprite coordinates.
- **No:** Phaser or another library. It adds a dependency and a manifest, which is more than an MVP needs.
- **Yes:** `index.html` + `game.js` at the root. Two files are enough for the MVP.
- **No:** ES modules in `src/`. The extra structure is not justified yet; split it in a later spec if `game.js` grows too large.
- **Yes:** served by a static server (`python -m http.server`). Opening via `file://` can block audio and image loading.
- **Yes:** keyboard and mouse controls. Both are cheap and cover the usual preferences.
- **Yes:** paddle bounce angle depends on hit position at constant speed. It gives control to the player and avoids endless vertical loops.
- **No:** speed increase over time. It needs tuning rules that belong in a later spec.
- **Yes:** regenerate the wall when cleared. It keeps the game from stalling without defining a win screen or level system.
- **No:** win screen. Left out of the MVP scope by the user; it comes with levels in a later spec.
- **Yes:** one hit per brick, 10 points flat, six colors. It keeps the data model minimal.
- **No:** gray multi-hit blocks. They need a hit counter per brick.
- **Yes:** `dt`-based movement in px/s with a cap of 1/30 s. The speed stays consistent across display refresh rates.
- **Yes:** explosion and both sounds are in the MVP, as requested.

---

## Risks

| Risk                                                       | Mitigation                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Browser autoplay policy blocks audio before user input     | Create and play audio only after the first key press or click (launch input).              |
| Ball tunnels through a brick or paddle on long frames      | Cap `dt` at 1/30 s; at 320 px/s the ball moves at most about 11 px per step, under 16 px. |
| Fast repeated bounces cut off a single `Audio` instance    | Restart `currentTime` or clone the audio node per play.                                    |
| `EXPLOSION_FRAMES.gray` reuses red frames (possible placeholder) | Gray bricks are out of scope, so it is never used in this spec.                      |
| Sprite sheet path is relative to the HTML page             | `index.html` lives at the project root, next to `assets/`.                                 |

---

## What is **not** in this spec

- Win screen, levels, or level progression.
- Armored (gray) blocks.
- Power-ups, multiple balls, lasers.
- Speed ramp-up.
- High-score persistence.
- Pause, title screen, or menus.
- Touch or mobile controls.
- Automated tests, build tools, or a package manifest.

Each one of those, if it lands, goes in its own spec.
