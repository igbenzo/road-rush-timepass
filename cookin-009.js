/* ═══════════════════════════════════════════════════════════
   ROAD RUSH — game.js
   Pure vanilla JS + HTML5 Canvas. No external dependencies.
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────────────────
//  CANVAS SETUP
// ─────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

const GAME_W = 480;
const GAME_H = 700;
canvas.width  = GAME_W;
canvas.height = GAME_H;

function resizeCanvas() {
  const scale = Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H);
  canvas.style.width  = Math.floor(GAME_W * scale) + 'px';
  canvas.style.height = Math.floor(GAME_H * scale) + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ─────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────
const ROAD_LEFT  = 80;
const ROAD_RIGHT = GAME_W - 80;
const ROAD_W     = ROAD_RIGHT - ROAD_LEFT;   // 320
const NUM_LANES  = 3;
const LANE_W     = ROAD_W / NUM_LANES;       // ~106.6

const PLAYER_W = 36;
const PLAYER_H = 60;
const ENEMY_W  = 36;
const ENEMY_H  = 60;

const MAX_SPEED     = 320;  // forward speed units/s
const ACCEL         = 180;
const BRAKE_FORCE   = 280;
const FRICTION      = 90;
const LATERAL_SPEED = 260;
const NITRO_SPEED   = 520;
const NITRO_MAX     = 100;
const NITRO_DRAIN   = 55;   // per second
const NITRO_REGEN   = 18;   // per second
const LIVES_START   = 3;
const SCORE_PER_SEC = 12;

// Road dash dimensions
const DASH_H     = 40;
const DASH_GAP   = 30;
const DASH_CYCLE = DASH_H + DASH_GAP;       // 70

// Enemy colours
const ENEMY_COLORS = ['#e53935', '#8e24aa', '#1e88e5', '#43a047', '#fb8c00', '#00897b'];

// ─────────────────────────────────────────────────────────
//  GAME STATE
// ─────────────────────────────────────────────────────────
// Possible values: 'START' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'
let state = 'START';

// ─────────────────────────────────────────────────────────
//  INPUT
// ─────────────────────────────────────────────────────────
const keys = {};

window.addEventListener('keydown', function (e) {
  keys[e.code] = true;

  // Prevent page scroll on arrow keys / space
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }

  if (e.code === 'KeyP' || e.code === 'Escape') {
    if      (state === 'PLAYING') pauseGame();
    else if (state === 'PAUSED')  resumeGame();
  }
});

window.addEventListener('keyup', function (e) {
  keys[e.code] = false;
});

// ─────────────────────────────────────────────────────────
//  DOM REFERENCES
// ─────────────────────────────────────────────────────────
const startScreen    = document.getElementById('startScreen');
const pauseScreen    = document.getElementById('pauseScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const hud            = document.getElementById('hud');

const startBtn        = document.getElementById('startBtn');
const resumeBtn       = document.getElementById('resumeBtn');
const restartBtnPause = document.getElementById('restartBtnPause');
const restartBtn      = document.getElementById('restartBtn');
const menuBtn         = document.getElementById('menuBtn');
const pauseBtn        = document.getElementById('pauseBtn');

const hudScoreEl     = document.getElementById('hudScore');
const hudBestEl      = document.getElementById('hudBest');
const hudSpeedEl     = document.getElementById('hudSpeed');
const hudLivesEl     = document.getElementById('hudLives');
const nitroBarEl     = document.getElementById('nitroBar');
const bestScoreStart = document.getElementById('bestScoreStart');
const finalScoreEl   = document.getElementById('finalScore');
const finalBestEl    = document.getElementById('finalBest');

// ─────────────────────────────────────────────────────────
//  PLAYER OBJECT
// ─────────────────────────────────────────────────────────
let player = {};

function createPlayer() {
  player = {
    x:           ROAD_LEFT + ROAD_W / 2 - PLAYER_W / 2,
    y:           GAME_H - PLAYER_H - 40,
    w:           PLAYER_W,
    h:           PLAYER_H,
    vx:          0,          // lateral velocity
    speed:       0,          // forward speed  (0–MAX_SPEED)
    nitro:       NITRO_MAX,
    nitroActive: false,
    invincible:  0,          // seconds of post-crash invincibility
  };
}

// ─────────────────────────────────────────────────────────
//  ENEMIES
// ─────────────────────────────────────────────────────────
let enemies    = [];
let enemyTimer = 0;

/** Return the X centre of a given lane (0-indexed). */
function laneCenter(laneIdx) {
  return ROAD_LEFT + laneIdx * LANE_W + LANE_W / 2;
}

/** Dynamic spawn interval shrinks as score grows (more traffic = harder). */
function spawnInterval() {
  return Math.max(0.42, 1.2 - Math.floor(score / 1000) * 0.06);
}

function spawnEnemy() {
  const lane = Math.floor(Math.random() * NUM_LANES);
  const ex   = laneCenter(lane) - ENEMY_W / 2;

  // Skip spawn if it would overlap the player on the first rows
  if (Math.abs(ex - player.x) < PLAYER_W + 8 && player.y < GAME_H * 0.5) return;

  enemies.push({
    x:     ex,
    y:     -ENEMY_H - 10,
    w:     ENEMY_W,
    h:     ENEMY_H,
    speed: 90 + Math.random() * 90 + Math.min(score / 600, 100),
    color: ENEMY_COLORS[Math.floor(Math.random() * ENEMY_COLORS.length)],
  });
}

// ─────────────────────────────────────────────────────────
//  SCORE & LIVES
// ─────────────────────────────────────────────────────────
let score     = 0;
let lives     = LIVES_START;
let bestScore = parseInt(localStorage.getItem('roadRushBest') || '0', 10);

// ─────────────────────────────────────────────────────────
//  ROAD SCROLL
// ─────────────────────────────────────────────────────────
let roadOffset = 0;

// ─────────────────────────────────────────────────────────
//  VISUAL EFFECTS
// ─────────────────────────────────────────────────────────
let screenShake = 0;   // seconds remaining
let shakeX      = 0;
let shakeY      = 0;
let crashFlash  = 0;   // seconds remaining
let nitroGlow   = 0;   // 0-1 intensity
let speedLines  = [];  // array of speed-line objects

function newSpeedLine() {
  return {
    x:     ROAD_LEFT + Math.random() * ROAD_W,
    y:     Math.random() * GAME_H,
    len:   20 + Math.random() * 50,
    alpha: 0.25 + Math.random() * 0.45,
  };
}

// ─────────────────────────────────────────────────────────
//  TIMING
// ─────────────────────────────────────────────────────────
let lastTime = 0;
let rafId    = null;

// ─────────────────────────────────────────────────────────
//  INITIALISE / RESET
// ─────────────────────────────────────────────────────────
function initGame() {
  createPlayer();
  enemies     = [];
  enemyTimer  = 0;
  score       = 0;
  lives       = LIVES_START;
  roadOffset  = 0;
  screenShake = 0;
  shakeX      = 0;
  shakeY      = 0;
  crashFlash  = 0;
  nitroGlow   = 0;
  speedLines  = [];
  updateHUD();
}

// ─────────────────────────────────────────────────────────
//  OVERLAY HELPERS
// ─────────────────────────────────────────────────────────
function showScreen(name) {
  startScreen.classList.remove('active');
  pauseScreen.classList.remove('active');
  gameOverScreen.classList.remove('active');
  if (name === 'start')    startScreen.classList.add('active');
  if (name === 'pause')    pauseScreen.classList.add('active');
  if (name === 'gameover') gameOverScreen.classList.add('active');
}

// ─────────────────────────────────────────────────────────
//  STATE TRANSITIONS
// ─────────────────────────────────────────────────────────
function startGame() {
  initGame();
  state = 'PLAYING';
  showScreen(null);
  hud.classList.remove('hud-hidden');
  lastTime = performance.now();
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(gameLoop);
}

function pauseGame() {
  if (state !== 'PLAYING') return;
  state = 'PAUSED';
  showScreen('pause');
  // gameLoop checks state each frame — it will simply stop scheduling itself
}

function resumeGame() {
  if (state !== 'PAUSED') return;
  state    = 'PLAYING';
  lastTime = performance.now();   // reset dt so we don't get a huge jump
  showScreen(null);
  rafId = requestAnimationFrame(gameLoop);
}

function gameOver() {
  state = 'GAMEOVER';
  if (score > bestScore) {
    bestScore = Math.floor(score);
    localStorage.setItem('roadRushBest', bestScore);
  }
  finalScoreEl.textContent = 'SCORE: ' + fmtScore(score);
  finalBestEl.textContent  = 'BEST:  ' + fmtScore(bestScore);
  showScreen('gameover');
  hud.classList.add('hud-hidden');
}

function goToMenu() {
  state = 'START';
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  hud.classList.add('hud-hidden');
  bestScoreStart.textContent = 'BEST SCORE: ' + fmtScore(bestScore);
  showScreen('start');
  // Restart the idle menu animation
  bgAnim();
}

// ── Button wiring ──────────────────────────────────────────
startBtn.addEventListener('click',        startGame);
resumeBtn.addEventListener('click',       resumeGame);
restartBtnPause.addEventListener('click', startGame);
restartBtn.addEventListener('click',      startGame);
menuBtn.addEventListener('click',         goToMenu);
pauseBtn.addEventListener('click', function () {
  if      (state === 'PLAYING') pauseGame();
  else if (state === 'PAUSED')  resumeGame();
});

// ─────────────────────────────────────────────────────────
//  MAIN GAME LOOP
// ─────────────────────────────────────────────────────────
function gameLoop(timestamp) {
  if (state !== 'PLAYING') return;   // stops the loop when not playing

  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);  // cap at 50 ms
  lastTime = timestamp;

  update(dt);
  render();

  rafId = requestAnimationFrame(gameLoop);
}

// ─────────────────────────────────────────────────────────
//  UPDATE
// ─────────────────────────────────────────────────────────
function update(dt) {
  handleInput(dt);
  moveEnemies(dt);
  spawnEnemies(dt);
  checkCollisions();
  updateScore(dt);
  updateEffects(dt);
  updateHUD();
}

// ── Player input & movement ─────────────────────────────
function handleInput(dt) {
  const p = player;

  const up    = keys['KeyW']     || keys['ArrowUp'];
  const down  = keys['KeyS']     || keys['ArrowDown'];
  const left  = keys['KeyA']     || keys['ArrowLeft'];
  const right = keys['KeyD']     || keys['ArrowRight'];
  const nitro = keys['Space'];

  // ── Nitro state ──────────────────────────────────────
  p.nitroActive = nitro && p.nitro > 0;
  const topSpeed = p.nitroActive ? NITRO_SPEED : MAX_SPEED;

  if (p.nitroActive) {
    p.nitro   = Math.max(0, p.nitro - NITRO_DRAIN * dt);
    nitroGlow = Math.min(1, nitroGlow + dt * 4);
  } else {
    p.nitro   = Math.min(NITRO_MAX, p.nitro + NITRO_REGEN * dt);
    nitroGlow = Math.max(0, nitroGlow - dt * 3);
  }

  // ── Forward speed ────────────────────────────────────
  if (up) {
    p.speed = Math.min(topSpeed, p.speed + ACCEL * dt);
  } else if (down) {
    p.speed = Math.max(0, p.speed - BRAKE_FORCE * dt);
  } else {
    p.speed = Math.max(0, p.speed - FRICTION * dt);
  }

  // ── Lateral movement ─────────────────────────────────
  if (left)       p.vx = -LATERAL_SPEED;
  else if (right) p.vx =  LATERAL_SPEED;
  else            p.vx *= 0.75;    // smooth dampen

  p.x += p.vx * dt;

  // Clamp inside road boundaries
  p.x = Math.max(ROAD_LEFT + 2, Math.min(ROAD_RIGHT - p.w - 2, p.x));

  // Road scrolls at player forward speed
  roadOffset = (roadOffset + p.speed * dt) % DASH_CYCLE;
}

// ── Enemy movement ──────────────────────────────────────
function moveEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    // Enemy apparent speed = its own speed + player forward speed
    e.y += (e.speed + player.speed) * dt;
    if (e.y > GAME_H + ENEMY_H) {
      enemies.splice(i, 1);
      score += 15;   // bonus for passing an enemy safely
    }
  }
}

// ── Enemy spawning ──────────────────────────────────────
function spawnEnemies(dt) {
  enemyTimer += dt;
  if (enemyTimer >= spawnInterval()) {
    enemyTimer = 0;
    spawnEnemy();
  }
}

// ── Collision detection (AABB with slight inset) ────────
function checkCollisions() {
  if (player.invincible > 0) return;

  const p = player;
  const px1 = p.x + 4,       py1 = p.y + 6;
  const px2 = p.x + p.w - 4, py2 = p.y + p.h - 6;

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e  = enemies[i];
    const ex1 = e.x + 4,       ey1 = e.y + 6;
    const ex2 = e.x + e.w - 4, ey2 = e.y + e.h - 6;

    if (px1 < ex2 && px2 > ex1 && py1 < ey2 && py2 > ey1) {
      handleCrash(i);
      break;
    }
  }
}

function handleCrash(enemyIdx) {
  lives -= 1;
  enemies.splice(enemyIdx, 1);

  // Nudge player back to safe start position
  player.y     = GAME_H - PLAYER_H - 40;
  player.speed *= 0.25;

  // 2-second invincibility window
  player.invincible = 2.0;

  // Screen effects
  screenShake = 0.45;
  crashFlash  = 0.5;

  if (lives <= 0) {
    lives = 0;
    updateHUD();
    setTimeout(gameOver, 650);
  }
}

// ── Score ───────────────────────────────────────────────
function updateScore(dt) {
  if (player.speed > 8) {
    const ratio      = player.speed / MAX_SPEED;
    const nitroBonus = player.nitroActive ? 2 : 1;
    score += SCORE_PER_SEC * ratio * nitroBonus * dt;
  }
}

// ── Effects update ──────────────────────────────────────
function updateEffects(dt) {
  if (player.invincible > 0) player.invincible -= dt;

  // Screen shake
  if (screenShake > 0) {
    screenShake -= dt;
    const mag = (screenShake / 0.45) * 10;
    shakeX = (Math.random() - 0.5) * mag;
    shakeY = (Math.random() - 0.5) * mag;
  } else {
    shakeX = 0;
    shakeY = 0;
  }

  if (crashFlash > 0) crashFlash -= dt;

  // Speed lines
  const targetCount = player.nitroActive ? 22 : (player.speed > 60 ? 12 : 0);
  while (speedLines.length < targetCount) speedLines.push(newSpeedLine());
  while (speedLines.length > targetCount) speedLines.pop();

  for (let i = speedLines.length - 1; i >= 0; i--) {
    const sl = speedLines[i];
    sl.y     += (player.speed * 1.8 + 180) * dt;
    sl.alpha -= dt * 1.1;
    if (sl.y > GAME_H || sl.alpha <= 0) {
      speedLines[i] = newSpeedLine();
      speedLines[i].y = 0;
    }
  }
}

// ── HUD update ──────────────────────────────────────────
function updateHUD() {
  hudScoreEl.textContent = fmtScore(score);
  hudBestEl.textContent  = fmtScore(bestScore);
  hudSpeedEl.textContent = Math.floor(player.speed / MAX_SPEED * 220);

  const hearts = '❤️ '.repeat(Math.max(0, lives)).trim() || '💀';
  hudLivesEl.textContent = hearts;

  const pct = (player.nitro / NITRO_MAX) * 100;
  nitroBarEl.style.width = pct + '%';
  if (player.nitroActive) nitroBarEl.classList.add('active');
  else                    nitroBarEl.classList.remove('active');
}

function fmtScore(n) {
  return String(Math.floor(n)).padStart(6, '0');
}

// ─────────────────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────────────────
function render() {
  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawBackground();
  drawRoad();
  drawSpeedLines();
  drawEnemies();
  drawPlayer();

  // Red crash-flash overlay
  if (crashFlash > 0) {
    ctx.fillStyle = 'rgba(255,30,30,' + Math.min(0.45, crashFlash * 0.9) + ')';
    ctx.fillRect(-10, -10, GAME_W + 20, GAME_H + 20);
  }

  // Nitro cyan glow at the bottom
  if (nitroGlow > 0) {
    const grd = ctx.createLinearGradient(0, GAME_H, 0, GAME_H - 200);
    grd.addColorStop(0, 'rgba(0,229,255,' + (0.22 * nitroGlow) + ')');
    grd.addColorStop(1, 'rgba(0,229,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, GAME_W, GAME_H);
  }

  ctx.restore();
}

// ── Background (grass + rumble strips) ─────────────────
function drawBackground() {
  // Grass
  ctx.fillStyle = '#2d5a1b';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // Subtle scrolling grass stripes for parallax feel
  ctx.fillStyle = '#2a521a';
  const stripeH = 30;
  const stripeGap = 60;
  for (let y = -stripeH; y < GAME_H + stripeGap; y += stripeGap) {
    const oy = ((y + roadOffset * 0.28) % (GAME_H + stripeGap)) - stripeH;
    ctx.fillRect(0,          oy, ROAD_LEFT,              stripeH);
    ctx.fillRect(ROAD_RIGHT, oy, GAME_W - ROAD_RIGHT,    stripeH);
  }

  // Red/white rumble strips on both shoulders
  drawRumbleStrip(ROAD_LEFT - 14, 14);
  drawRumbleStrip(ROAD_RIGHT,     14);
}

function drawRumbleStrip(x, w) {
  const h = 28;
  for (let y = -h; y < GAME_H + h * 2; y += h * 2) {
    const oy = ((y + roadOffset * 0.9) % (GAME_H + h * 2)) - h;
    ctx.fillStyle = '#e53935';
    ctx.fillRect(x, oy,     w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, oy + h, w, h);
  }
}

// ── Road surface + lane markings ────────────────────────
function drawRoad() {
  // Asphalt base
  ctx.fillStyle = '#2c2c2c';
  ctx.fillRect(ROAD_LEFT, 0, ROAD_W, GAME_H);

  // Edge-darkening gradient for depth
  const edgeGrd = ctx.createLinearGradient(ROAD_LEFT, 0, ROAD_RIGHT, 0);
  edgeGrd.addColorStop(0,   'rgba(0,0,0,0.22)');
  edgeGrd.addColorStop(0.08,'rgba(0,0,0,0)');
  edgeGrd.addColorStop(0.92,'rgba(0,0,0,0)');
  edgeGrd.addColorStop(1,   'rgba(0,0,0,0.22)');
  ctx.fillStyle = edgeGrd;
  ctx.fillRect(ROAD_LEFT, 0, ROAD_W, GAME_H);

  // White lane dashes
  ctx.fillStyle = '#dddddd';
  for (let lane = 1; lane < NUM_LANES; lane++) {
    const lx = ROAD_LEFT + lane * LANE_W - 2;
    for (let y = -DASH_H; y < GAME_H + DASH_H; y += DASH_CYCLE) {
      const oy = ((y + roadOffset) % (GAME_H + DASH_H)) - DASH_H;
      ctx.fillRect(lx, oy, 4, DASH_H);
    }
  }

  // Solid yellow edge lines
  ctx.fillStyle = '#fdd835';
  ctx.fillRect(ROAD_LEFT,      0, 4, GAME_H);
  ctx.fillRect(ROAD_RIGHT - 4, 0, 4, GAME_H);
}

// ── Speed lines ─────────────────────────────────────────
function drawSpeedLines() {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth   = 1.5;
  for (const sl of speedLines) {
    ctx.globalAlpha = Math.max(0, sl.alpha);
    ctx.beginPath();
    ctx.moveTo(sl.x, sl.y);
    ctx.lineTo(sl.x, sl.y + sl.len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─────────────────────────────────────────────────────────
//  CAR DRAWING
// ─────────────────────────────────────────────────────────
/**
 * Draw a top-down car using canvas primitives.
 * @param {number}  x, y        – top-left corner
 * @param {number}  w, h        – dimensions
 * @param {string}  bodyColor   – main body hex colour
 * @param {string}  roofColor   – cabin/roof hex colour
 * @param {boolean} isPlayer    – affects headlight position & nitro flame
 * @param {boolean} skip        – if true, skip drawing (blink effect)
 */
function drawCar(x, y, w, h, bodyColor, roofColor, isPlayer, skip) {
  if (skip) return;

  const cx = x + w / 2;

  // Drop shadow
  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.fillStyle   = '#000000';
  ctx.beginPath();
  ctx.ellipse(cx, y + h - 5, w * 0.42, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Body
  ctx.fillStyle = bodyColor;
  rrect(ctx, x + 3, y + 8, w - 6, h - 16, 6);
  ctx.fill();

  // Roof/cabin
  ctx.fillStyle = roofColor;
  rrect(ctx, x + 6, y + 18, w - 12, Math.floor(h * 0.34), 4);
  ctx.fill();

  // Windshields (front & rear)
  ctx.fillStyle = 'rgba(155,215,255,0.62)';
  rrect(ctx, x + 7, y + 20, w - 14, 12, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(155,215,255,0.42)';
  rrect(ctx, x + 7, y + h - 32, w - 14, 10, 3);
  ctx.fill();

  if (isPlayer) {
    // Headlights (top of car = front)
    ctx.fillStyle = '#fff9c4';
    ctx.fillRect(x + 4,      y + 8, 7, 5);
    ctx.fillRect(x + w - 11, y + 8, 7, 5);
    // Taillights (bottom = rear)
    ctx.fillStyle = '#ef5350';
    ctx.fillRect(x + 4,      y + h - 14, 7, 5);
    ctx.fillRect(x + w - 11, y + h - 14, 7, 5);
  } else {
    // Enemy faces player → taillights on top
    ctx.fillStyle = '#ef5350';
    ctx.fillRect(x + 4,      y + 8, 7, 5);
    ctx.fillRect(x + w - 11, y + 8, 7, 5);
  }

  // Wheels (four corners)
  ctx.fillStyle = '#111111';
  ctx.fillRect(x - 2,      y + 14,      7, 12);
  ctx.fillRect(x + w - 5,  y + 14,      7, 12);
  ctx.fillRect(x - 2,      y + h - 26,  7, 12);
  ctx.fillRect(x + w - 5,  y + h - 26,  7, 12);

  // Wheel rims
  ctx.fillStyle = '#555555';
  ctx.fillRect(x,           y + 16,      3, 8);
  ctx.fillRect(x + w - 3,   y + 16,      3, 8);
  ctx.fillRect(x,           y + h - 24,  3, 8);
  ctx.fillRect(x + w - 3,   y + h - 24,  3, 8);

  // Nitro exhaust flame on player
  if (isPlayer && player.nitroActive) {
    const flameH = 12 + Math.random() * 14;
    const fg = ctx.createLinearGradient(cx, y + h, cx, y + h + flameH);
    fg.addColorStop(0,   '#00e5ff');
    fg.addColorStop(0.5, '#7c5cd8');
    fg.addColorStop(1,   'rgba(124,92,216,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(cx - 6, y + h);
    ctx.lineTo(cx + 6, y + h);
    ctx.lineTo(cx,     y + h + flameH);
    ctx.closePath();
    ctx.fill();
  }
}

function drawPlayer() {
  const p = player;
  // Blink (alternate frames) during invincibility
  const blink = p.invincible > 0 && (Math.floor(p.invincible / 0.12) % 2 === 0);
  drawCar(p.x, p.y, p.w, p.h, '#1565c0', '#0d47a1', true, blink);
}

function drawEnemies() {
  for (const e of enemies) {
    const accent = darken(e.color, 30);
    drawCar(e.x, e.y, e.w, e.h, e.color, accent, false, false);
  }
}

// ─────────────────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────────────────
/** Canvas rounded-rectangle path (no fill/stroke — caller applies). */
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x,     y + h, x,      y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x,     y,     x + r,  y);
  ctx.closePath();
}

/** Darken a hex colour by `amount` (0-255). */
function darken(hex, amount) {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────────────────────
//  ANIMATED MENU BACKGROUND
//  Runs an idle scrolling road on the canvas behind the
//  start/gameover overlays so something moves on screen.
// ─────────────────────────────────────────────────────────
let bgOffset    = 0;
let bgAnimRafId = null;

function bgAnim() {
  if (state === 'PLAYING' || state === 'PAUSED') return;

  bgOffset = (bgOffset + 2) % DASH_CYCLE;

  // Grass
  ctx.fillStyle = '#2d5a1b';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // Asphalt
  ctx.fillStyle = '#2c2c2c';
  ctx.fillRect(ROAD_LEFT, 0, ROAD_W, GAME_H);

  // Yellow edges
  ctx.fillStyle = '#fdd835';
  ctx.fillRect(ROAD_LEFT,      0, 4, GAME_H);
  ctx.fillRect(ROAD_RIGHT - 4, 0, 4, GAME_H);

  // Lane dashes
  ctx.fillStyle = '#dddddd';
  for (let lane = 1; lane < NUM_LANES; lane++) {
    const lx = ROAD_LEFT + lane * LANE_W - 2;
    for (let y = -DASH_H; y < GAME_H + DASH_H; y += DASH_CYCLE) {
      const oy = ((y + bgOffset) % (GAME_H + DASH_H)) - DASH_H;
      ctx.fillRect(lx, oy, 4, DASH_H);
    }
  }

  // A few idle enemy cars drifting down for visual flair
  const demoY = (bgOffset * 3) % (GAME_H + 120) - 60;
  drawCar(laneCenter(0) - ENEMY_W / 2, demoY,        ENEMY_W, ENEMY_H, '#e53935', '#b71c1c', false, false);
  drawCar(laneCenter(2) - ENEMY_W / 2, demoY + 200,  ENEMY_W, ENEMY_H, '#1e88e5', '#0d47a1', false, false);
  drawCar(laneCenter(1) - ENEMY_W / 2, demoY + 420,  ENEMY_W, ENEMY_H, '#43a047', '#1b5e20', false, false);

  bgAnimRafId = requestAnimationFrame(bgAnim);
}

// ─────────────────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────────────────
bestScoreStart.textContent = 'BEST SCORE: ' + fmtScore(bestScore);
createPlayer();   // initialise player so HUD calls don't throw before first game
bgAnim();         // start the menu animation immediately
