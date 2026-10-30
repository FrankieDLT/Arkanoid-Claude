const canvas = document.getElementById( 'game' );
const ctx = canvas.getContext( '2d' );

// Fixed game constants
const W = 640, H = 480;
const BRICK = { cols: 10, rows: 6, w: 64, h: 32, top: 60 };
const ROW_COLORS = [ 'red', 'yellow', 'cyan', 'magenta', 'hotpink', 'green' ];
const PADDLE = { w: 100, h: 12, y: 440, speed: 480 };
const BALL = { size: 16, speed: 320 };
const MAX_BOUNCE_ANGLE = 60 * Math.PI / 180; // from vertical, at paddle edges
const START_LIVES = 3, POINTS_PER_BRICK = 10;

// Mutable state
const state = {
  mode: 'ready', // 'ready' | 'playing' | 'gameover'
  score: 0,
  lives: START_LIVES,
  paddle: { x: ( W - PADDLE.w ) / 2 },
  ball: { x: 0, y: 0, vx: 0, vy: 0 },
  bricks: [],
  explosions: [], // { x, y, color, start }, start = timestamp in ms
};

function stickBallToPaddle() {
  state.ball.x = state.paddle.x + ( PADDLE.w - BALL.size ) / 2;
  state.ball.y = PADDLE.y - BALL.size;
  state.ball.vx = 0;
  state.ball.vy = 0;
}

function launchBall() {
  // Mostly upward with a small random horizontal component, normalized to BALL.speed
  const vx = ( Math.random() * 2 - 1 ) * 0.3;
  const vy = -1;
  const len = Math.hypot( vx, vy );
  state.ball.vx = vx / len * BALL.speed;
  state.ball.vy = vy / len * BALL.speed;
  state.mode = 'playing';
}

function createBricks() {
  const bricks = [];
  for ( let row = 0; row < BRICK.rows; row++ ) {
    for ( let col = 0; col < BRICK.cols; col++ ) {
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

state.bricks = createBricks();

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

function setKey( e, down ) {
  switch ( e.code ) {
    case 'ArrowLeft': case 'KeyA': keys.left = down; e.preventDefault(); break;
    case 'ArrowRight': case 'KeyD': keys.right = down; e.preventDefault(); break;
    case 'Space':
      e.preventDefault();
      if ( down && !e.repeat ) action();
      break;
  }
}

// Space or click: launches the ball when ready, restarts after game over
function action() {
  if ( state.mode === 'ready' ) launchBall();
  else if ( state.mode === 'gameover' ) resetGame();
}

canvas.addEventListener( 'mousedown', action );

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
  if ( mouseX !== null ) {
    state.paddle.x = mouseX - PADDLE.w / 2;
    mouseX = null; // keyboard takes over until the mouse moves again
  }
  if ( keys.left ) state.paddle.x -= PADDLE.speed * dt;
  if ( keys.right ) state.paddle.x += PADDLE.speed * dt;
  clampPaddle();

  if ( state.mode === 'ready' ) stickBallToPaddle();
  else if ( state.mode === 'playing' ) updateBall( dt );
}

function loseLife() {
  state.lives--;
  if ( state.lives <= 0 ) {
    state.mode = 'gameover';
  } else {
    state.mode = 'ready';
    stickBallToPaddle();
  }
}

function resetGame() {
  state.score = 0;
  state.lives = START_LIVES;
  state.bricks = createBricks();
  state.mode = 'ready';
  stickBallToPaddle();
}

function normalizeBallSpeed() {
  const b = state.ball;
  const len = Math.hypot( b.vx, b.vy );
  b.vx = b.vx / len * BALL.speed;
  b.vy = b.vy / len * BALL.speed;
}

// Destroys the first brick the ball overlaps and reflects the ball on the axis of least penetration
function collideBricks() {
  const b = state.ball;
  for ( const br of state.bricks ) {
    if ( !br.alive ) continue;
    if ( b.x + BALL.size <= br.x || b.x >= br.x + BRICK.w ||
         b.y + BALL.size <= br.y || b.y >= br.y + BRICK.h ) continue;

    br.alive = false;
    state.score += POINTS_PER_BRICK;
    playSound( 'brick' );
    state.explosions.push( { x: br.x, y: br.y, color: br.color, start: performance.now() } );

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
    return; // one brick per frame
  }
}

function updateBall( dt ) {
  const b = state.ball;
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
    b.vx = Math.sin( angle ) * BALL.speed;
    b.vy = -Math.cos( angle ) * BALL.speed;
    b.y = PADDLE.y - BALL.size;
    playSound( 'bounce' );
  }

  collideBricks();

  // Wall cleared: new wall, ball back on the paddle, score and lives carry over
  if ( !state.bricks.some( ( br ) => br.alive ) ) {
    state.bricks = createBricks();
    state.mode = 'ready';
    stickBallToPaddle();
    return;
  }

  normalizeBallSpeed();

  // Ball lost below the canvas
  if ( b.y > H ) loseLife();
}

function render() {
  ctx.clearRect( 0, 0, W, H );

  for ( const b of state.bricks ) {
    if ( b.alive ) drawSprite( ctx, 'block_' + b.color, b.x, b.y, BRICK.w, BRICK.h );
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

  // HUD, inside the top 60 px
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText( 'Score: ' + state.score, 16, BRICK.top / 2 );
  ctx.textAlign = 'right';
  ctx.fillText( 'Lives: ' + state.lives, W - 16, BRICK.top / 2 );
  ctx.textBaseline = 'alphabetic';

  if ( state.mode !== 'gameover' ) {
    drawSprite( ctx, 'ball', state.ball.x, state.ball.y, BALL.size, BALL.size );
  }

  if ( state.mode === 'gameover' ) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect( 0, 0, W, H );
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText( 'GAME OVER', W / 2, H / 2 );
    ctx.font = '20px sans-serif';
    ctx.fillText( 'Press Space or click to play again', W / 2, H / 2 + 40 );
  }
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
