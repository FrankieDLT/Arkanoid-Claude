const canvas = document.getElementById( 'game' );
const ctx = canvas.getContext( '2d' );

// Fixed game constants
const W = 640, H = 480;
const BRICK = { cols: 10, rows: 6, w: 64, h: 32, top: 60 };
const ROW_COLORS = [ 'red', 'yellow', 'cyan', 'magenta', 'hotpink', 'green' ];
const PADDLE = { w: 100, h: 12, y: 440, speed: 480 };
const BALL = { size: 16, speed: 320 };
const LEVEL = {
  speedStep: 0.05,       // +5% of BALL.speed per level above 1
  speedCapFactor: 2,     // base speed never exceeds BALL.speed * 2
  holeChanceStep: 0.1,   // hole probability = min( holeChanceMax, ( level - 1 ) * step )
  holeChanceMax: 0.5,
};
const POWERUP = {
  dropChance: 0.10, // per destroyed brick; mutable on purpose, to force drops from the console
  types: [ 'triple', 'bar', 'frenzy' ], // each equally likely once a drop happens
  capsule: { w: 32, h: 16, fallSpeed: 120 }, // px, px/s
  tripleAngle: 25 * Math.PI / 180, // rotation of the two new balls
  maxBalls: 6,
  barDuration: 10, // seconds
  frenzyDuration: 10, // seconds
  frenzyFactor: 2, // ball speed multiplier
};
const BAR = { y: 468, h: 8 }; // full-width bar under the paddle
const CAPSULE_STYLE = {
  triple: { letter: 'T', color: '#2e86de' },
  bar: { letter: 'B', color: '#27ae60' },
  frenzy: { letter: 'F', color: '#e67e22' },
};
const SKINS = {
  retro: { label: 'Retro', filter: 'none' },
  pastel: { label: 'Pastel', filter: 'hue-rotate(20deg) saturate(0.55) brightness(1.25)' },
  neon: { label: 'Neon', filter: 'hue-rotate(-30deg) saturate(2.2) contrast(1.2) brightness(1.1)' },
};
const SKIN_ORDER = [ 'retro', 'pastel', 'neon' ];
const STORAGE = {
  highScore: 'arkanoid:v1:highscore', // stored as a decimal integer string
};
const PAUSE_MENU = {
  minLevel: 1,
  maxLevel: 99,
  minus: { x: W / 2 - 100, y: 330, w: 40, h: 40 }, // click targets, canvas space
  plus: { x: W / 2 + 60, y: 330, w: 40, h: 40 },
};
const MAX_STEP = 8; // px; max distance a ball moves per collision sub-step
const MAX_BOUNCE_ANGLE = 60 * Math.PI / 180; // from vertical, at paddle edges
const START_LIVES = 3, POINTS_PER_BRICK = 10;

// Mutable state
const state = {
  mode: 'ready', // 'ready' | 'playing' | 'gameover'
  paused: false, // overlay flag, independent of mode; freezes update()
  score: 0,
  lives: START_LIVES,
  level: 1,
  highScore: 0, // loaded from localStorage at startup
  newRecord: false, // true when the finished game beat the stored high score
  skin: 'retro', // key of SKINS; not persisted
  capsules: [], // { x, y, type }; x, y = top-left
  effects: {
    bar: 0, // remaining seconds, 0 = inactive
    frenzy: 0, // remaining seconds, 0 = inactive
  },
  paddle: { x: ( W - PADDLE.w ) / 2 },
  balls: [], // { x, y, vx, vy }; one ball while in 'ready'
  bricks: [],
  explosions: [], // { x, y, color, start }, start = timestamp in ms
};

// localStorage can throw (blocked or full); callers fall back to the in-memory value
function loadHighScore() {
  try {
    const n = parseInt( localStorage.getItem( STORAGE.highScore ), 10 );
    return Number.isFinite( n ) && n >= 0 ? n : 0;
  } catch ( e ) {
    return 0;
  }
}

function saveHighScore( n ) {
  try {
    localStorage.setItem( STORAGE.highScore, String( n ) );
  } catch ( e ) {
    // keep the value in memory only
  }
}

state.highScore = loadHighScore();

// Ball speed (px/s) for a level, including the cap
function baseBallSpeed( level ) {
  return BALL.speed * Math.min( LEVEL.speedCapFactor, 1 + LEVEL.speedStep * ( level - 1 ) );
}

// Single source of ball speed (px/s); Frenzy multiplies the base and is not capped
function currentBallSpeed() {
  return baseBallSpeed( state.level ) * ( state.effects.frenzy > 0 ? POWERUP.frenzyFactor : 1 );
}

// Replaces all balls with a single stationary ball resting on the paddle
function stickBallToPaddle() {
  state.balls = [ {
    x: state.paddle.x + ( PADDLE.w - BALL.size ) / 2,
    y: PADDLE.y - BALL.size,
    vx: 0,
    vy: 0,
  } ];
}

function launchBall() {
  // Mostly upward with a small random horizontal component, normalized to the current speed
  const vx = ( Math.random() * 2 - 1 ) * 0.3;
  const vy = -1;
  const len = Math.hypot( vx, vy );
  const ball = state.balls[ 0 ];
  ball.vx = vx / len * currentBallSpeed();
  ball.vy = vy / len * currentBallSpeed();
  state.mode = 'playing';
}

// Small seeded PRNG: the same seed always yields the same sequence in [0, 1)
function mulberry32( seed ) {
  let a = seed >>> 0;
  return function () {
    a = ( a + 0x6D2B79F5 ) >>> 0;
    let t = a;
    t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
    t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
    return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
  };
}

// Rows x cols booleans (true = brick), seeded by level and left-right symmetric
function generateLevel( level ) {
  const rand = mulberry32( level );
  const holeChance = Math.min( LEVEL.holeChanceMax, ( level - 1 ) * LEVEL.holeChanceStep );
  const half = BRICK.cols / 2;
  const grid = [];
  for ( let row = 0; row < BRICK.rows; row++ ) {
    const line = new Array( BRICK.cols );
    for ( let col = 0; col < half; col++ ) {
      const brick = rand() >= holeChance;
      line[ col ] = brick;
      line[ BRICK.cols - 1 - col ] = brick;
    }
    grid.push( line );
  }
  if ( !grid.some( ( line ) => line.some( Boolean ) ) ) grid[ 0 ][ 0 ] = true;
  return grid;
}

function createBricks( level ) {
  const layout = generateLevel( level );
  const bricks = [];
  for ( let row = 0; row < BRICK.rows; row++ ) {
    for ( let col = 0; col < BRICK.cols; col++ ) {
      if ( !layout[ row ][ col ] ) continue;
      bricks.push( {
        x: col * BRICK.w,
        y: BRICK.top + row * BRICK.h,
        color: ROW_COLORS[ row ],
        alive: true,
      } );
    }
  }
  return bricks;
}

state.bricks = createBricks( state.level );

// Audio: created only after the first user input to satisfy autoplay policies
let sounds = null;

function initAudio() {
  if ( sounds ) return;
  sounds = {
    bounce: new Audio( 'assets/sounds/ball-bounce.mp3' ),
    brick: new Audio( 'assets/sounds/break-sound.mp3' ),
  };
}

// Plays a clone so rapid hits overlap instead of cutting each other off
function playSound( name ) {
  if ( !sounds ) return;
  const s = sounds[ name ].cloneNode();
  s.play().catch( () => {} );
}

window.addEventListener( 'keydown', initAudio, { once: true } );
window.addEventListener( 'mousedown', initAudio, { once: true } );

// Input
const keys = { left: false, right: false };
let mouseX = null; // canvas-space X of the cursor; null until the mouse moves

// Skin menu (game over screen only): moves the selection, wrapping around, and applies it at once
function cycleSkin( dir ) {
  const i = SKIN_ORDER.indexOf( state.skin );
  state.skin = SKIN_ORDER[ ( i + dir + SKIN_ORDER.length ) % SKIN_ORDER.length ];
  applySkin( SKINS[ state.skin ].filter );
}

function setKey( e, down ) {
  switch ( e.code ) {
    case 'ArrowLeft': case 'KeyA':
      keys.left = down;
      if ( down && !e.repeat && state.mode === 'gameover' ) cycleSkin( -1 );
      e.preventDefault();
      break;
    case 'ArrowRight': case 'KeyD':
      keys.right = down;
      if ( down && !e.repeat && state.mode === 'gameover' ) cycleSkin( 1 );
      e.preventDefault();
      break;
    case 'Space':
      e.preventDefault();
      if ( down && !e.repeat ) action();
      break;
    case 'KeyP':
      if ( down && !e.repeat && state.mode !== 'gameover' ) state.paused = !state.paused;
      break;
  }
}

// Space or click: launches the ball when ready, restarts after game over; ignored while paused
function action() {
  if ( state.paused ) return;
  if ( state.mode === 'ready' ) launchBall();
  else if ( state.mode === 'gameover' ) resetGame();
}

// Pause menu level select: restarts the wall at the chosen level, keeping score and lives
function setLevel( level ) {
  level = Math.max( PAUSE_MENU.minLevel, Math.min( PAUSE_MENU.maxLevel, level ) );
  if ( level === state.level ) return;
  state.level = level;
  resetEffects();
  state.bricks = createBricks( state.level );
  state.explosions = [];
  state.mode = 'ready';
  stickBallToPaddle();
}

function inRect( x, y, r ) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

canvas.addEventListener( 'mousedown', ( e ) => {
  if ( !state.paused ) return action();
  const rect = canvas.getBoundingClientRect();
  const x = ( e.clientX - rect.left ) * ( W / rect.width );
  const y = ( e.clientY - rect.top ) * ( H / rect.height );
  if ( inRect( x, y, PAUSE_MENU.minus ) ) setLevel( state.level - 1 );
  else if ( inRect( x, y, PAUSE_MENU.plus ) ) setLevel( state.level + 1 );
} );

window.addEventListener( 'keydown', ( e ) => setKey( e, true ) );
window.addEventListener( 'keyup', ( e ) => setKey( e, false ) );

canvas.addEventListener( 'mousemove', ( e ) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = ( e.clientX - rect.left ) * ( W / rect.width );
} );

function clampPaddle() {
  state.paddle.x = Math.max( 0, Math.min( W - PADDLE.w, state.paddle.x ) );
}

let lastTime = 0;

function update( dt ) {
  if ( state.paused ) return;
  if ( mouseX !== null ) {
    state.paddle.x = mouseX - PADDLE.w / 2;
    mouseX = null; // keyboard takes over until the mouse moves again
  }
  if ( keys.left ) state.paddle.x -= PADDLE.speed * dt;
  if ( keys.right ) state.paddle.x += PADDLE.speed * dt;
  clampPaddle();

  if ( state.mode === 'ready' ) stickBallToPaddle();
  else if ( state.mode === 'playing' ) {
    updateBalls( dt );
    updateCapsules( dt );
    state.effects.bar = Math.max( 0, state.effects.bar - dt );
    if ( state.effects.frenzy > 0 ) {
      state.effects.frenzy = Math.max( 0, state.effects.frenzy - dt );
      if ( state.effects.frenzy === 0 ) rescaleBalls(); // back to normal speed
    }
  }
}

// A fresh serve starts with normal rules: no bar, no Frenzy (so base ball speed), no capsules
function resetEffects() {
  state.effects.bar = 0;
  state.effects.frenzy = 0;
  state.capsules = [];
}

function loseLife() {
  state.lives--;
  resetEffects();
  if ( state.lives <= 0 ) {
    state.mode = 'gameover';
    if ( state.score > state.highScore ) {
      state.highScore = state.score;
      state.newRecord = true;
      saveHighScore( state.highScore );
    }
  } else {
    state.mode = 'ready';
    stickBallToPaddle();
  }
}

function resetGame() {
  state.score = 0;
  state.lives = START_LIVES;
  state.level = 1;
  state.newRecord = false;
  state.paused = false;
  resetEffects();
  state.bricks = createBricks( state.level );
  state.mode = 'ready';
  stickBallToPaddle();
}

function normalizeBallSpeed( b ) {
  const len = Math.hypot( b.vx, b.vy );
  b.vx = b.vx / len * currentBallSpeed();
  b.vy = b.vy / len * currentBallSpeed();
}

// Drops a capsule of a random type, centered on the destroyed brick
function spawnCapsule( br ) {
  const { w, h } = POWERUP.capsule;
  const type = POWERUP.types[ Math.floor( Math.random() * POWERUP.types.length ) ];
  state.capsules.push( { x: br.x + ( BRICK.w - w ) / 2, y: br.y + ( BRICK.h - h ) / 2, type } );
}

// Splits the first ball into 3: two copies rotated by +/- tripleAngle, up to maxBalls in total
function tripleBall() {
  const src = state.balls[ 0 ];
  if ( !src ) return;
  for ( const sign of [ 1, -1 ] ) {
    if ( state.balls.length >= POWERUP.maxBalls ) break;
    const a = sign * POWERUP.tripleAngle;
    state.balls.push( {
      x: src.x,
      y: src.y,
      vx: src.vx * Math.cos( a ) - src.vy * Math.sin( a ),
      vy: src.vx * Math.sin( a ) + src.vy * Math.cos( a ),
    } );
  }
}

// Rescales every moving ball to currentBallSpeed(), keeping its direction
function rescaleBalls() {
  for ( const b of state.balls ) {
    if ( b.vx !== 0 || b.vy !== 0 ) normalizeBallSpeed( b );
  }
}

// Catching an active effect again refreshes its timer
function applyCapsule( type ) {
  if ( type === 'triple' ) {
    tripleBall();
  } else if ( type === 'bar' ) {
    state.effects.bar = POWERUP.barDuration;
  } else if ( type === 'frenzy' ) {
    state.effects.frenzy = POWERUP.frenzyDuration;
    rescaleBalls();
  }
}

// Capsules fall; they are removed offscreen or when the paddle catches them
function updateCapsules( dt ) {
  const { w, h, fallSpeed } = POWERUP.capsule;
  const p = state.paddle;
  state.capsules = state.capsules.filter( ( c ) => {
    c.y += fallSpeed * dt;
    if ( c.y > H ) return false;
    if ( c.x + w > p.x && c.x < p.x + PADDLE.w &&
         c.y + h > PADDLE.y && c.y < PADDLE.y + PADDLE.h ) {
      applyCapsule( c.type );
      return false;
    }
    return true;
  } );
}

// Destroys the first brick the ball overlaps and reflects the ball on the axis of least penetration
function collideBricks( b ) {
  for ( const br of state.bricks ) {
    if ( !br.alive ) continue;
    if ( b.x + BALL.size <= br.x || b.x >= br.x + BRICK.w ||
         b.y + BALL.size <= br.y || b.y >= br.y + BRICK.h ) continue;

    br.alive = false;
    state.score += POINTS_PER_BRICK;
    playSound( 'brick' );
    state.explosions.push( { x: br.x, y: br.y, color: br.color, start: performance.now() } );
    if ( Math.random() < POWERUP.dropChance ) spawnCapsule( br );

    const overlapX = Math.min( b.x + BALL.size - br.x, br.x + BRICK.w - b.x );
    const overlapY = Math.min( b.y + BALL.size - br.y, br.y + BRICK.h - b.y );
    const fromLeft = b.x + BALL.size / 2 < br.x + BRICK.w / 2;
    const fromTop = b.y + BALL.size / 2 < br.y + BRICK.h / 2;

    if ( overlapX < overlapY ) {
      b.vx = fromLeft ? -Math.abs( b.vx ) : Math.abs( b.vx );
      b.x += fromLeft ? -overlapX : overlapX;
    } else {
      b.vy = fromTop ? -Math.abs( b.vy ) : Math.abs( b.vy );
      b.y += fromTop ? -overlapY : overlapY;
    }
    return; // one brick per sub-step
  }
}

// Moves one ball by dt and resolves walls, paddle and brick collisions
function stepBall( b, dt ) {
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  // Left and right walls
  if ( b.x < 0 ) {
    b.x = 0;
    b.vx = Math.abs( b.vx );
    playSound( 'bounce' );
  } else if ( b.x + BALL.size > W ) {
    b.x = W - BALL.size;
    b.vx = -Math.abs( b.vx );
    playSound( 'bounce' );
  }

  // Ceiling
  if ( b.y < 0 ) {
    b.y = 0;
    b.vy = Math.abs( b.vy );
    playSound( 'bounce' );
  }

  // Paddle: only when moving down, so a ball already bouncing up is not caught again
  const p = state.paddle;
  if ( b.vy > 0 &&
       b.x + BALL.size > p.x && b.x < p.x + PADDLE.w &&
       b.y + BALL.size > PADDLE.y && b.y < PADDLE.y + PADDLE.h ) {
    // -1 at the left edge, 0 at the center, 1 at the right edge
    const hit = Math.max( -1, Math.min( 1,
      ( b.x + BALL.size / 2 - ( p.x + PADDLE.w / 2 ) ) / ( PADDLE.w / 2 ) ) );
    const angle = hit * MAX_BOUNCE_ANGLE;
    b.vx = Math.sin( angle ) * currentBallSpeed();
    b.vy = -Math.cos( angle ) * currentBallSpeed();
    b.y = PADDLE.y - BALL.size;
    playSound( 'bounce' );
  }

  // Complete bar: only when moving down, same as the paddle
  if ( state.effects.bar > 0 && b.vy > 0 &&
       b.y + BALL.size > BAR.y && b.y < BAR.y + BAR.h ) {
    b.y = BAR.y - BALL.size;
    b.vy = -Math.abs( b.vy );
    playSound( 'bounce' );
  }

  collideBricks( b );
}

// Moves every ball in sub-steps of at most MAX_STEP px so fast balls cannot tunnel
function updateBalls( dt ) {
  for ( const b of state.balls ) {
    const steps = Math.max( 1, Math.ceil( Math.hypot( b.vx, b.vy ) * dt / MAX_STEP ) );
    for ( let i = 0; i < steps; i++ ) {
      stepBall( b, dt / steps );

      // Wall cleared: next level, ball back on the paddle, score and lives carry over
      if ( !state.bricks.some( ( br ) => br.alive ) ) {
        state.level++;
        resetEffects();
        state.bricks = createBricks( state.level );
        state.mode = 'ready';
        stickBallToPaddle();
        return;
      }

      normalizeBallSpeed( b );
      if ( b.y > H ) break; // lost below the canvas
    }
  }

  // A life is lost only when the last ball is gone
  state.balls = state.balls.filter( ( b ) => b.y <= H );
  if ( state.balls.length === 0 ) loseLife();
}

function render() {
  ctx.clearRect( 0, 0, W, H );

  for ( const b of state.bricks ) {
    if ( b.alive ) drawSprite( ctx, 'block_' + b.color, b.x, b.y, BRICK.w, BRICK.h );
  }

  if ( state.effects.bar > 0 ) {
    ctx.fillStyle = '#7fd1ff';
    ctx.fillRect( 0, BAR.y, W, BAR.h );
  }

  drawSprite( ctx, 'paddle', state.paddle.x, PADDLE.y, PADDLE.w, PADDLE.h );
  // Explosions: 4 frames over EXPLOSION_DURATION; finished ones are removed
  const now = performance.now();
  const frameTime = EXPLOSION_DURATION / 4;
  state.explosions = state.explosions.filter( ( ex ) => {
    const idx = Math.floor( ( now - ex.start ) / frameTime );
    if ( idx >= 4 ) return false;
    drawFrame( ctx, EXPLOSION_FRAMES[ ex.color ][ Math.max( 0, idx ) ], ex.x, ex.y, BRICK.w, BRICK.h );
    return true;
  } );

  // Capsules: colored rounded rectangles with the type letter
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for ( const c of state.capsules ) {
    const style = CAPSULE_STYLE[ c.type ];
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.roundRect( c.x, c.y, POWERUP.capsule.w, POWERUP.capsule.h, 8 );
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText( style.letter, c.x + POWERUP.capsule.w / 2, c.y + POWERUP.capsule.h / 2 + 1 );
  }

  // HUD, inside the top 60 px
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText( 'Score: ' + state.score, 16, BRICK.top / 2 );
  // HI shows the larger of the saved value and the current score, so the record moves live
  ctx.fillText( 'HI: ' + Math.max( state.highScore, state.score ), 170, BRICK.top / 2 );
  ctx.textAlign = 'center';
  ctx.fillText( 'Level ' + state.level, W / 2 + 20, BRICK.top / 2 );
  ctx.textAlign = 'left';
  // Lives: one ball icon per life, right-aligned, label to the left of the icons
  const LIFE_ICON = 16, LIFE_GAP = 4;
  const iconsW = state.lives * LIFE_ICON + Math.max( 0, state.lives - 1 ) * LIFE_GAP;
  const iconsX = W - 16 - iconsW;
  for ( let i = 0; i < state.lives; i++ ) {
    drawSprite( ctx, 'ball', iconsX + i * ( LIFE_ICON + LIFE_GAP ),
      BRICK.top / 2 - LIFE_ICON / 2, LIFE_ICON, LIFE_ICON );
  }
  // Remaining seconds of active timed effects, under the score
  const timers = [];
  if ( state.effects.bar > 0 ) timers.push( 'BAR ' + Math.ceil( state.effects.bar ) + 's' );
  if ( state.effects.frenzy > 0 ) timers.push( 'FRENZY ' + Math.ceil( state.effects.frenzy ) + 's' );
  if ( timers.length ) {
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText( timers.join( '   ' ), 16, BRICK.top - 10 );
    ctx.font = 'bold 20px sans-serif';
  }
  ctx.textAlign = 'right';
  ctx.fillText( 'Lives:', iconsX - ( state.lives > 0 ? 8 : 0 ), BRICK.top / 2 );
  ctx.textBaseline = 'alphabetic';

  if ( state.mode !== 'gameover' ) {
    for ( const b of state.balls ) drawSprite( ctx, 'ball', b.x, b.y, BALL.size, BALL.size );
  }

  if ( state.paused ) renderPauseMenu();

  if ( state.mode === 'gameover' ) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect( 0, 0, W, H );
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText( 'GAME OVER', W / 2, H / 2 );
    ctx.font = '20px sans-serif';
    ctx.fillText( 'High score: ' + state.highScore, W / 2, H / 2 + 36 );
    if ( state.newRecord ) {
      ctx.fillStyle = '#ffd400';
      ctx.fillText( 'New record!', W / 2, H / 2 + 64 );
      ctx.fillStyle = '#fff';
    }
    ctx.fillText( 'Press Space or click to play again', W / 2, H / 2 + 98 );

    // Skin picker: current skin highlighted
    ctx.fillText( 'Skin (Left / Right):', W / 2, H / 2 + 138 );
    const gap = 120;
    SKIN_ORDER.forEach( ( key, i ) => {
      const selected = key === state.skin;
      ctx.font = selected ? 'bold 24px sans-serif' : '20px sans-serif';
      ctx.fillStyle = selected ? '#ffd400' : '#aaa';
      ctx.fillText( selected ? '[ ' + SKINS[ key ].label + ' ]' : SKINS[ key ].label,
        W / 2 + ( i - ( SKIN_ORDER.length - 1 ) / 2 ) * gap, H / 2 + 172 );
    } );
  }
}

function renderPauseMenu() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect( 0, 0, W, H );
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText( 'PAUSED', W / 2, 100 );

  ctx.font = '20px sans-serif';
  ctx.fillText( 'Lives', W / 2, 160 );
  const ICON = 20, GAP = 6;
  const iconsW = state.lives * ICON + Math.max( 0, state.lives - 1 ) * GAP;
  for ( let i = 0; i < state.lives; i++ ) {
    drawSprite( ctx, 'ball', W / 2 - iconsW / 2 + i * ( ICON + GAP ), 180, ICON, ICON );
  }

  ctx.fillText( 'Active power-ups', W / 2, 240 );
  const active = [];
  if ( state.effects.bar > 0 ) active.push( 'Bar ' + Math.ceil( state.effects.bar ) + 's' );
  if ( state.effects.frenzy > 0 ) active.push( 'Frenzy ' + Math.ceil( state.effects.frenzy ) + 's' );
  if ( state.balls.length > 1 ) active.push( 'Multiball x' + state.balls.length );
  ctx.fillStyle = active.length ? '#ffd400' : '#aaa';
  ctx.fillText( active.length ? active.join( '   ' ) : 'None', W / 2, 270 );

  ctx.fillStyle = '#fff';
  ctx.fillText( 'Level select', W / 2, 310 );
  for ( const [ r, label ] of [ [ PAUSE_MENU.minus, '-' ], [ PAUSE_MENU.plus, '+' ] ] ) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect( r.x, r.y, r.w, r.h );
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText( label, r.x + r.w / 2, r.y + r.h / 2 + 1 );
  }
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText( String( state.level ), W / 2, PAUSE_MENU.minus.y + PAUSE_MENU.minus.h / 2 + 1 );

  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#aaa';
  ctx.fillText( 'Changing level restarts the wall (score and lives kept)', W / 2, 395 );
  ctx.fillText( 'Press P to resume', W / 2, 425 );
  ctx.textBaseline = 'alphabetic';
}

function frame( now ) {
  const dt = Math.min( ( now - lastTime ) / 1000, 1 / 30 );
  lastTime = now;
  update( dt );
  render();
  requestAnimationFrame( frame );
}

loadSpritesheet( () => {
  requestAnimationFrame( ( now ) => {
    lastTime = now;
    requestAnimationFrame( frame );
  } );
} );
