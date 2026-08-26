/* ==========================================================
   ROAD RUSH — Vanilla JS Canvas Racing Game
   ========================================================== */

// ---------- DOM REFERENCES ----------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const startScreen = document.getElementById('startScreen');
const gameScreen = document.getElementById('gameScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const pauseOverlay = document.getElementById('pauseOverlay');
const crashFlash = document.getElementById('crashFlash');

const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const restartFromPauseBtn = document.getElementById('restartFromPauseBtn');
const restartBtn = document.getElementById('restartBtn');

const scoreVal = document.getElementById('scoreVal');
const lapVal = document.getElementById('lapVal');
const livesVal = document.getElementById('livesVal');
const speedVal = document.getElementById('speedVal');
const nitroBarInner = document.getElementById('nitroBarInner');

const startBestScore = document.getElementById('startBestScore');
const finalScoreVal = document.getElementById('finalScoreVal');
const finalBestVal = document.getElementById('finalBestVal');
const newBestTag = document.getElementById('newBestTag');
const comboIndicator = document.getElementById('comboIndicator');
const comboVal = document.getElementById('comboVal');

const touchControls = document.getElementById('touchControls');
const btnLeft = document.getElementById('btnLeft');
const btnRight = document.getElementById('btnRight');
const btnGas = document.getElementById('btnGas');
const btnBrake = document.getElementById('btnBrake');
const btnNitro = document.getElementById('btnNitro');

// ---------- CONSTANTS ----------
const ROAD_WIDTH = 300;
const ROAD_LEFT = (canvas.width - ROAD_WIDTH) / 2;
const LANE_COUNT = 3;
const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;

const CAR_WIDTH = 44;
const CAR_HEIGHT = 76;

const MAX_SPEED = 260;      // km/h display cap
const MIN_SPEED = 0;
const ACCEL_RATE = 140;     // km/h per second
const BRAKE_RATE = 220;     // km/h per second
const FRICTION_RATE = 60;   // natural deceleration km/h per second
const NITRO_MULTIPLIER = 1.6;
const NITRO_MAX = 100;
const NITRO_DRAIN_RATE = 34;   // per second while active
const NITRO_RECHARGE_RATE = 12; // per second while inactive

const HIGH_SCORE_KEY = 'roadRushHighScore';

const COIN_SIZE = 22;
const HAZARD_WIDTH = 50;
const HAZARD_HEIGHT = 30;
const COMBO_WINDOW = 2.2; // seconds to keep chaining an avoid-combo

// ---------- GAME STATE ----------
let state = 'START'; // START, PLAYING, PAUSED, GAME_OVER
let player, enemies, particles, coins, hazards;
let score, distance, lives, lap, lapDistance;
let speedKmh, nitroAmount, nitroActive;
let roadOffset;
let spawnTimer, spawnInterval;
let coinSpawnTimer, hazardSpawnTimer;
let invulnTimer;
let lastTime;
let shakeTimer;
let comboCount, comboTimer;
let hazardSlipTimer;
let cameraTilt;

const keys = {};

// ---------- AUDIO (lightweight WebAudio beeps, no external files) ----------
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      audioCtx = null;
    }
  }
}

function playTone(freq, duration, type, volume) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  gain.gain.value = volume || 0.15;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.stop(audioCtx.currentTime + duration);
}

function sfxCoin() { playTone(880, 0.12, 'square', 0.12); playTone(1320, 0.12, 'square', 0.08); }
function sfxCrash() { playTone(120, 0.3, 'sawtooth', 0.22); }
function sfxNitro() { playTone(200, 0.25, 'sine', 0.1); }
function sfxCombo() { playTone(660, 0.1, 'triangle', 0.1); }
function sfxHazard() { playTone(90, 0.2, 'sawtooth', 0.15); }

// ---------- HIGH SCORE (localStorage) ----------
function getHighScore() {
  try {
    return parseInt(localStorage.getItem(HIGH_SCORE_KEY), 10) || 0;
  } catch (e) {
    return 0;
  }
}

function setHighScore(value) {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(value));
  } catch (e) {
    /* localStorage unavailable — ignore, score just won't persist */
  }
}

// ---------- INITIALIZATION ----------
function initGame() {
  player = {
    lane: 1,
    x: laneCenterX(1) - CAR_WIDTH / 2,
    y: canvas.height - CAR_HEIGHT - 30,
    targetX: 0,
  };
  player.targetX = player.x;

  enemies = [];
  particles = [];
  coins = [];
  hazards = [];

  score = 0;
  distance = 0;
  lives = 3;
  lap = 1;
  lapDistance = 0;

  speedKmh = 0;
  nitroAmount = NITRO_MAX;
  nitroActive = false;

  roadOffset = 0;
  spawnTimer = 0;
  spawnInterval = 70;
  coinSpawnTimer = 90;
  hazardSpawnTimer = 200;
  invulnTimer = 0;
  shakeTimer = 0;
  comboCount = 0;
  comboTimer = 0;
  hazardSlipTimer = 0;
  cameraTilt = 0;

  comboIndicator.classList.add('hidden');
  updateHUD();
}

function laneCenterX(laneIndex) {
  return ROAD_LEFT + LANE_WIDTH * laneIndex + LANE_WIDTH / 2;
}

function moveLeftLane() {
  if (state !== 'PLAYING' || player.lane <= 0) return;
  player.lane--;
  player.targetX = laneCenterX(player.lane) - CAR_WIDTH / 2;
}

function moveRightLane() {
  if (state !== 'PLAYING' || player.lane >= LANE_COUNT - 1) return;
  player.lane++;
  player.targetX = laneCenterX(player.lane) - CAR_WIDTH / 2;
}

// ---------- INPUT HANDLING ----------
document.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;

  if (e.key === ' ') e.preventDefault(); // prevent page scroll

  if (state === 'PLAYING') {
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') moveLeftLane();
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') moveRightLane();
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      togglePause();
    }
  }
});

document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// ---------- SCREEN MANAGEMENT ----------
function showScreen(name) {
  startScreen.classList.add('hidden');
  gameScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');

  if (name === 'START') startScreen.classList.remove('hidden');
  if (name === 'PLAYING') gameScreen.classList.remove('hidden');
  if (name === 'GAME_OVER') gameOverScreen.classList.remove('hidden');
}

// ---------- BUTTON EVENTS ----------
startBtn.addEventListener('click', () => {
  startGame();
});

restartBtn.addEventListener('click', () => {
  startGame();
});

pauseBtn.addEventListener('click', togglePause);
resumeBtn.addEventListener('click', togglePause);

restartFromPauseBtn.addEventListener('click', () => {
  pauseOverlay.classList.add('hidden');
  startGame();
});

function togglePause() {
  if (state === 'PLAYING') {
    state = 'PAUSED';
    pauseOverlay.classList.remove('hidden');
  } else if (state === 'PAUSED') {
    state = 'PLAYING';
    pauseOverlay.classList.add('hidden');
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }
}

function startGame() {
  ensureAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  initGame();
  state = 'PLAYING';
  showScreen('PLAYING');
  startBestScore.textContent = getHighScore();
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

// ---------- ENEMY SPAWNING ----------
function spawnEnemy() {
  const lane = Math.floor(Math.random() * LANE_COUNT);

  // avoid spawning directly on top of an existing enemy in same lane too close
  const tooClose = enemies.some((e) => e.lane === lane && e.y < CAR_HEIGHT * 1.8);
  if (tooClose) return;

  const colors = ['#ff2e88', '#00e5ff', '#ffd23f', '#7b2fff', '#ff7a3d', '#39ff88'];
  const enemySpeed = 90 + Math.random() * 60; // km/h-equivalent baseline

  enemies.push({
    lane,
    x: laneCenterX(lane) - CAR_WIDTH / 2,
    y: -CAR_HEIGHT,
    color: colors[Math.floor(Math.random() * colors.length)],
    speedFactor: enemySpeed / 130,
  });
}

function spawnCoin() {
  const lane = Math.floor(Math.random() * LANE_COUNT);
  const tooClose = enemies.some((e) => e.lane === lane && e.y < CAR_HEIGHT * 1.5)
    || hazards.some((h) => h.lane === lane && h.y < CAR_HEIGHT * 1.5);
  if (tooClose) return;

  coins.push({
    lane,
    x: laneCenterX(lane) - COIN_SIZE / 2,
    y: -COIN_SIZE,
    spin: 0,
  });
}

function spawnHazard() {
  const lane = Math.floor(Math.random() * LANE_COUNT);
  const tooClose = enemies.some((e) => e.lane === lane && e.y < CAR_HEIGHT * 2)
    || coins.some((c) => c.lane === lane && c.y < CAR_HEIGHT * 2);
  if (tooClose) return;

  hazards.push({
    lane,
    x: laneCenterX(lane) - HAZARD_WIDTH / 2,
    y: -HAZARD_HEIGHT,
  });
}

// ---------- COLLISION ----------
function checkCollisions(dt) {
  // coins can always be collected, even mid-invulnerability
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    if (
      player.x < c.x + COIN_SIZE &&
      player.x + CAR_WIDTH > c.x &&
      player.y < c.y + COIN_SIZE &&
      player.y + CAR_HEIGHT > c.y
    ) {
      collectCoin();
      coins.splice(i, 1);
    }
  }

  // hazards cause a slip, not a life loss
  if (hazardSlipTimer <= 0) {
    for (let i = hazards.length - 1; i >= 0; i--) {
      const h = hazards[i];
      if (
        player.x < h.x + HAZARD_WIDTH &&
        player.x + CAR_WIDTH > h.x &&
        player.y < h.y + HAZARD_HEIGHT &&
        player.y + CAR_HEIGHT > h.y
      ) {
        triggerHazardSlip();
        hazards.splice(i, 1);
        break;
      }
    }
  }

  if (invulnTimer > 0) return;

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (
      player.x < e.x + CAR_WIDTH &&
      player.x + CAR_WIDTH > e.x &&
      player.y < e.y + CAR_HEIGHT &&
      player.y + CAR_HEIGHT > e.y
    ) {
      handleCrash();
      enemies.splice(i, 1);
      break;
    }
  }
}

function collectCoin() {
  const bonus = 40 + comboCount * 4;
  score += bonus;
  nitroAmount = Math.min(NITRO_MAX, nitroAmount + 8);
  sfxCoin();

  for (let i = 0; i < 8; i++) {
    particles.push({
      x: player.x + CAR_WIDTH / 2,
      y: player.y,
      vx: (Math.random() - 0.5) * 140,
      vy: -80 - Math.random() * 60,
      life: 0.4,
      color: '#ffe066',
    });
  }
}

function triggerHazardSlip() {
  hazardSlipTimer = 1.0;
  speedKmh *= 0.55;
  comboCount = 0;
  comboTimer = 0;
  comboIndicator.classList.add('hidden');
  sfxHazard();

  crashFlash.style.background = 'rgba(255, 200, 0, 0.35)';
  crashFlash.classList.remove('flashActive');
  void crashFlash.offsetWidth;
  crashFlash.classList.add('flashActive');
  setTimeout(() => { crashFlash.style.background = 'rgba(255, 0, 0, 0.35)'; }, 400);
}

function handleCrash() {
  lives--;
  invulnTimer = 1.5;
  speedKmh *= 0.4;
  comboCount = 0;
  comboTimer = 0;
  comboIndicator.classList.add('hidden');
  sfxCrash();
  triggerCrashEffect();

  if (lives <= 0) {
    endGame();
  }
}

function triggerCrashEffect() {
  crashFlash.classList.remove('flashActive');
  void crashFlash.offsetWidth; // reflow to restart animation
  crashFlash.classList.add('flashActive');

  gameScreen.classList.remove('shake');
  void gameScreen.offsetWidth;
  gameScreen.classList.add('shake');
  shakeTimer = 0.35;

  // small particle burst
  for (let i = 0; i < 14; i++) {
    particles.push({
      x: player.x + CAR_WIDTH / 2,
      y: player.y + CAR_HEIGHT / 2,
      vx: (Math.random() - 0.5) * 220,
      vy: (Math.random() - 0.5) * 220,
      life: 0.5 + Math.random() * 0.3,
      color: Math.random() > 0.5 ? '#ffcc00' : '#ff5533',
    });
  }
}

// ---------- UPDATE LOGIC ----------
function update(dt) {
  handleAcceleration(dt);
  handleNitro(dt);
  updatePlayerPosition(dt);
  updateRoad(dt);
  updateEnemies(dt);
  updateCoins(dt);
  updateHazards(dt);
  updateParticles(dt);
  updateSpawning(dt);
  updateScoreAndLap(dt);
  checkCollisions(dt);

  if (invulnTimer > 0) invulnTimer -= dt;
  if (hazardSlipTimer > 0) hazardSlipTimer -= dt;

  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) {
      comboCount = 0;
      comboIndicator.classList.add('hidden');
    }
  }

  const targetTilt = nitroActive ? 1 : 0;
  cameraTilt += (targetTilt - cameraTilt) * Math.min(1, dt * 4);

  if (shakeTimer > 0) {
    shakeTimer -= dt;
    if (shakeTimer <= 0) gameScreen.classList.remove('shake');
  }

  updateHUD();
}

function updateCoins(dt) {
  const basePixelSpeed = speedToPixelsPerSecond(speedKmh);
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.y += basePixelSpeed * 0.75 * dt;
    c.spin += dt * 6;
    if (c.y > canvas.height + COIN_SIZE) coins.splice(i, 1);
  }
}

function updateHazards(dt) {
  const basePixelSpeed = speedToPixelsPerSecond(speedKmh);
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    h.y += basePixelSpeed * 0.75 * dt;
    if (h.y > canvas.height + HAZARD_HEIGHT) hazards.splice(i, 1);
  }
}

function handleAcceleration(dt) {
  const accelerating = keys['w'] || keys['arrowup'];
  const braking = keys['s'] || keys['arrowdown'];

  if (accelerating) {
    speedKmh += ACCEL_RATE * dt;
  } else if (braking) {
    speedKmh -= BRAKE_RATE * dt;
  } else {
    // natural friction pulls speed toward a cruising baseline
    if (speedKmh > 60) {
      speedKmh -= FRICTION_RATE * dt;
    } else if (speedKmh < 60) {
      speedKmh += FRICTION_RATE * 0.5 * dt;
    }
  }

  const cap = nitroActive ? MAX_SPEED * NITRO_MULTIPLIER : MAX_SPEED;
  speedKmh = Math.max(MIN_SPEED, Math.min(cap, speedKmh));
}

function handleNitro(dt) {
  const wantsNitro = keys[' '] && nitroAmount > 0;
  const wasActive = nitroActive;

  if (wantsNitro) {
    nitroActive = true;
    nitroAmount -= NITRO_DRAIN_RATE * dt;
    if (nitroAmount < 0) nitroAmount = 0;
  } else {
    nitroActive = false;
    nitroAmount += NITRO_RECHARGE_RATE * dt;
    if (nitroAmount > NITRO_MAX) nitroAmount = NITRO_MAX;
  }

  if (nitroActive && !wasActive) sfxNitro();
}

function updatePlayerPosition(dt) {
  // smooth horizontal lane transition
  player.x += (player.targetX - player.x) * Math.min(1, dt * 10);

  // oil-slick slip: brief loss of precise control
  if (hazardSlipTimer > 0) {
    player.x += Math.sin(hazardSlipTimer * 40) * 3;
  }
}

function updateRoad(dt) {
  const pixelSpeed = speedToPixelsPerSecond(speedKmh);
  roadOffset += pixelSpeed * dt;
  if (roadOffset > 40) roadOffset -= 40;
}

function speedToPixelsPerSecond(kmh) {
  // arbitrary but consistent mapping for a good visual feel
  return kmh * 1.1;
}

function updateEnemies(dt) {
  const basePixelSpeed = speedToPixelsPerSecond(speedKmh);

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    // enemy moves relative to player's speed + own baseline factor
    const relativeSpeed = basePixelSpeed * (0.55 + e.speedFactor * 0.5);
    e.y += relativeSpeed * dt;

    if (e.y > canvas.height + CAR_HEIGHT) {
      enemies.splice(i, 1);
      registerAvoid();
    }
  }
}

function registerAvoid() {
  comboCount++;
  comboTimer = COMBO_WINDOW;

  const multiplier = 1 + Math.min(comboCount, 10) * 0.15;
  score += Math.round(15 * multiplier);

  if (comboCount >= 2) {
    comboVal.textContent = comboCount;
    comboIndicator.classList.remove('hidden');
    comboIndicator.style.animation = 'none';
    void comboIndicator.offsetWidth;
    comboIndicator.style.animation = 'comboPop 0.35s ease';
    if (comboCount % 3 === 0) sfxCombo();
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function updateSpawning(dt) {
  const difficultyFactor = Math.max(0.35, 1 - distance / 30000);

  spawnTimer -= dt * 60;
  if (spawnTimer <= 0) {
    spawnEnemy();
    // as difficulty ramps, occasionally double-spawn for a tougher weave
    if (difficultyFactor < 0.7 && Math.random() < 0.3) spawnEnemy();
    spawnInterval = (45 + Math.random() * 35) * difficultyFactor;
    spawnTimer = spawnInterval;
  }

  coinSpawnTimer -= dt * 60;
  if (coinSpawnTimer <= 0) {
    spawnCoin();
    coinSpawnTimer = 80 + Math.random() * 60;
  }

  hazardSpawnTimer -= dt * 60;
  if (hazardSpawnTimer <= 0) {
    spawnHazard();
    hazardSpawnTimer = (160 + Math.random() * 100) * Math.max(0.5, difficultyFactor);
  }
}

function updateScoreAndLap(dt) {
  const distDelta = speedToPixelsPerSecond(speedKmh) * dt;
  distance += distDelta;
  lapDistance += distDelta;

  // distance-based score, faster driving = more score
  score += distDelta * 0.05;

  // simple lap system: every 4000 "distance units" completes a lap
  const LAP_LENGTH = 4000;
  if (lapDistance >= LAP_LENGTH) {
    lapDistance -= LAP_LENGTH;
    lap++;
    if (lap > 3) {
      lap = 3; // cap display; game continues endlessly past lap 3
    }
  }
}

// ---------- HUD ----------
function updateHUD() {
  scoreVal.textContent = String(Math.floor(score)).padStart(6, '0');
  lapVal.textContent = `${lap}/3`;
  livesVal.textContent = '❤️'.repeat(Math.max(0, lives)) + '🖤'.repeat(Math.max(0, 3 - lives));
  speedVal.textContent = Math.round(speedKmh);
  nitroBarInner.style.width = nitroAmount + '%';
}

// ---------- RENDERING ----------
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  // subtle zoom + tilt punch while nitro is active, for extra "juice"
  if (cameraTilt > 0.01) {
    const zoom = 1 + cameraTilt * 0.035;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
  }

  drawGrass();
  drawRoad();
  drawLaneMarkings();
  drawHazards();
  drawCoins();
  drawParticles();
  drawEnemies();
  drawPlayer();

  if (nitroActive) drawSpeedLines();

  ctx.restore();
}

function drawCoins() {
  coins.forEach((c) => {
    const cx = c.x + COIN_SIZE / 2;
    const cy = c.y + COIN_SIZE / 2;
    const squash = Math.abs(Math.cos(c.spin));

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(Math.max(0.15, squash), 1);

    ctx.shadowColor = '#ffd23f';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(0, 0, COIN_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#c98a00';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#4a2e00';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
    ctx.restore();
  });
}

function drawHazards() {
  hazards.forEach((h) => {
    ctx.save();
    ctx.fillStyle = 'rgba(20, 20, 25, 0.85)';
    ctx.beginPath();
    ctx.ellipse(h.x + HAZARD_WIDTH / 2, h.y + HAZARD_HEIGHT / 2, HAZARD_WIDTH / 2, HAZARD_HEIGHT / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(120, 150, 200, 0.35)';
    ctx.beginPath();
    ctx.ellipse(h.x + HAZARD_WIDTH / 2 - 6, h.y + HAZARD_HEIGHT / 2 - 4, HAZARD_WIDTH / 5, HAZARD_HEIGHT / 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawGrass() {
  // deep synthwave sky-to-ground gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  skyGrad.addColorStop(0, '#1a0f3d');
  skyGrad.addColorStop(0.35, '#3a1a52');
  skyGrad.addColorStop(0.55, '#17142b');
  skyGrad.addColorStop(1, '#0d0b1f');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // retro sun near the top
  const sunX = canvas.width / 2;
  const sunY = 90;
  const sunR = 60;
  const sunGrad = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
  sunGrad.addColorStop(0, '#ffd23f');
  sunGrad.addColorStop(0.5, '#ff7a3d');
  sunGrad.addColorStop(1, '#ff2e88');
  ctx.save();
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = sunGrad;
  ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);
  // sun scanlines
  ctx.fillStyle = 'rgba(23, 20, 43, 0.85)';
  for (let i = 0; i < 6; i++) {
    const ly = sunY - sunR + sunR * 0.65 + i * 8;
    ctx.fillRect(sunX - sunR, ly, sunR * 2, 3);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255, 122, 61, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.stroke();

  // side terrain strips with neon-tinted grid, outside the road
  drawSideGrid(0, ROAD_LEFT);
  drawSideGrid(ROAD_LEFT + ROAD_WIDTH, canvas.width - (ROAD_LEFT + ROAD_WIDTH));
}

function drawSideGrid(startX, width) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(startX, 160, width, canvas.height - 160);
  ctx.clip();

  ctx.strokeStyle = 'rgba(0, 229, 255, 0.18)';
  ctx.lineWidth = 1;
  const spacing = 34;
  const offset = roadOffset % spacing;
  for (let y = -spacing; y < canvas.height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(startX, y + offset + 160);
    ctx.lineTo(startX + width, y + offset + 160);
    ctx.stroke();
  }
  for (let x = startX; x <= startX + width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 160);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRoad() {
  const roadGrad = ctx.createLinearGradient(ROAD_LEFT, 0, ROAD_LEFT + ROAD_WIDTH, 0);
  roadGrad.addColorStop(0, '#1c1830');
  roadGrad.addColorStop(0.5, '#211c3a');
  roadGrad.addColorStop(1, '#1c1830');
  ctx.fillStyle = roadGrad;
  ctx.fillRect(ROAD_LEFT, 0, ROAD_WIDTH, canvas.height);

  // glowing edge strips
  ctx.shadowBlur = 12;

  ctx.shadowColor = '#ff2e88';
  ctx.fillStyle = '#ff2e88';
  ctx.fillRect(ROAD_LEFT - 5, 0, 4, canvas.height);

  ctx.shadowColor = '#00e5ff';
  ctx.fillStyle = '#00e5ff';
  ctx.fillRect(ROAD_LEFT + ROAD_WIDTH + 1, 0, 4, canvas.height);

  ctx.shadowBlur = 0;
}

function drawLaneMarkings() {
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 4;
  ctx.setLineDash([26, 24]);
  ctx.lineDashOffset = -roadOffset;
  ctx.shadowColor = '#ffd23f';
  ctx.shadowBlur = 8;

  for (let lane = 1; lane < LANE_COUNT; lane++) {
    const x = ROAD_LEFT + LANE_WIDTH * lane;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
}

function drawCar(x, y, bodyColor, isPlayer) {
  ctx.save();

  const cx = x + CAR_WIDTH / 2;

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(cx, y + CAR_HEIGHT - 2, CAR_WIDTH / 2, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // neon glow outline behind the body
  ctx.shadowColor = isPlayer ? '#00e5ff' : bodyColor;
  ctx.shadowBlur = isPlayer ? 16 : 10;

  // body gradient (sleeker wedge / tapered nose shape)
  const bodyGrad = ctx.createLinearGradient(x, y, x + CAR_WIDTH, y);
  bodyGrad.addColorStop(0, shadeColor(bodyColor, -25));
  bodyGrad.addColorStop(0.5, bodyColor);
  bodyGrad.addColorStop(1, shadeColor(bodyColor, -25));
  ctx.fillStyle = bodyGrad;

  ctx.beginPath();
  ctx.moveTo(cx, y);                                   // nose tip
  ctx.lineTo(x + CAR_WIDTH - 4, y + 16);                // right shoulder
  ctx.lineTo(x + CAR_WIDTH, y + CAR_HEIGHT - 14);        // right rear
  ctx.quadraticCurveTo(x + CAR_WIDTH, y + CAR_HEIGHT, x + CAR_WIDTH - 8, y + CAR_HEIGHT);
  ctx.lineTo(x + 8, y + CAR_HEIGHT);
  ctx.quadraticCurveTo(x, y + CAR_HEIGHT, x, y + CAR_HEIGHT - 14);
  ctx.lineTo(x + 4, y + 16);                            // left shoulder
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;

  // windshield + rear window (angled)
  ctx.fillStyle = 'rgba(150, 230, 255, 0.85)';
  ctx.beginPath();
  ctx.moveTo(cx, y + 14);
  ctx.lineTo(x + CAR_WIDTH - 9, y + 26);
  ctx.lineTo(x + CAR_WIDTH - 11, y + 34);
  ctx.lineTo(x + 11, y + 34);
  ctx.lineTo(x + 9, y + 26);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(150, 230, 255, 0.6)';
  roundRect(ctx, x + 8, y + CAR_HEIGHT - 30, CAR_WIDTH - 16, 14, 3);
  ctx.fill();

  // racing stripe
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(cx - 3, y + 6, 6, CAR_HEIGHT - 16);

  // headlights / taillights
  ctx.fillStyle = isPlayer ? '#eafcff' : '#ffe58a';
  ctx.fillRect(x + 5, y + 4, 7, 5);
  ctx.fillRect(x + CAR_WIDTH - 12, y + 4, 7, 5);

  ctx.fillStyle = '#ff2e4d';
  ctx.shadowColor = '#ff2e4d';
  ctx.shadowBlur = 6;
  ctx.fillRect(x + 5, y + CAR_HEIGHT - 8, 7, 5);
  ctx.fillRect(x + CAR_WIDTH - 12, y + CAR_HEIGHT - 8, 7, 5);
  ctx.shadowBlur = 0;

  // wheels
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(x - 3, y + 10, 5, 15);
  ctx.fillRect(x + CAR_WIDTH - 2, y + 10, 5, 15);
  ctx.fillRect(x - 3, y + CAR_HEIGHT - 26, 5, 15);
  ctx.fillRect(x + CAR_WIDTH - 2, y + CAR_HEIGHT - 26, 5, 15);

  ctx.restore();
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0x00ff) + percent;
  let b = (num & 0x0000ff) + percent;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `rgb(${r}, ${g}, ${b})`;
}

function drawPlayer() {
  // blink while invulnerable after a crash
  if (invulnTimer > 0 && Math.floor(invulnTimer * 10) % 2 === 0) return;
  drawCar(player.x, player.y, nitroActive ? '#00e5ff' : '#ffd23f', true);
}

function drawEnemies() {
  enemies.forEach((e) => drawCar(e.x, e.y, e.color, false));
}

function drawParticles() {
  particles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 4, 4);
    ctx.globalAlpha = 1;
  });
}

function drawSpeedLines() {
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.55)';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 4;
  for (let i = 0; i < 8; i++) {
    const x = ROAD_LEFT - 20 + Math.random() * (ROAD_WIDTH + 40);
    const len = 20 + Math.random() * 30;
    const y = Math.random() * canvas.height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + len);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

function roundRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// ---------- GAME OVER ----------
function endGame() {
  state = 'GAME_OVER';

  const finalScore = Math.floor(score);
  const best = getHighScore();
  const isNewBest = finalScore > best;

  if (isNewBest) {
    setHighScore(finalScore);
  }

  finalScoreVal.textContent = finalScore;
  finalBestVal.textContent = isNewBest ? finalScore : best;
  newBestTag.classList.toggle('hidden', !isNewBest);

  showScreen('GAME_OVER');
}

// ---------- MAIN LOOP ----------
function loop(now) {
  if (state !== 'PLAYING') return;

  const dt = Math.min(0.05, (now - lastTime) / 1000); // clamp dt to avoid big jumps on tab switch
  lastTime = now;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

// ---------- TOUCH / MOBILE CONTROLS ----------
const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (isTouchDevice) {
  document.body.classList.add('touch-device');
}

function bindHoldButton(el, keyName) {
  if (!el) return;
  const press = (e) => { e.preventDefault(); keys[keyName] = true; };
  const release = (e) => { e.preventDefault(); keys[keyName] = false; };
  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', release);
}

function bindTapButton(el, handler) {
  if (!el) return;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handler();
  });
}

bindHoldButton(btnGas, 'w');
bindHoldButton(btnBrake, 's');
bindHoldButton(btnNitro, ' ');
bindTapButton(btnLeft, moveLeftLane);
bindTapButton(btnRight, moveRightLane);

// swipe left/right on the canvas itself as a natural alternative to the buttons
let swipeStartX = null;
let swipeStartY = null;
const SWIPE_THRESHOLD = 35;

canvas.addEventListener('touchstart', (e) => {
  if (state !== 'PLAYING') return;
  const t = e.changedTouches[0];
  swipeStartX = t.clientX;
  swipeStartY = t.clientY;
}, { passive: true });

canvas.addEventListener('touchend', (e) => {
  if (state !== 'PLAYING' || swipeStartX === null) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - swipeStartX;
  const dy = t.clientY - swipeStartY;

  if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0) moveRightLane();
    else moveLeftLane();
  }
  swipeStartX = null;
  swipeStartY = null;
}, { passive: true });

// ---------- INITIAL SETUP ----------
startBestScore.textContent = getHighScore();
showScreen('START');