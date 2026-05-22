(() => {
  "use strict";

  const CONFIG = {
    width: 960,
    height: 540,
    groundY: 420,
    gravity: 2200,
    jumpVelocity: -820,
    speed: {
      start: 330,
      max: 720,
      accelPerSecond: 8.8
    },
    scorePerSecond: 13,
    player: {
      x: 145,
      width: 66,
      height: 112,
      slideWidth: 102,
      slideHeight: 58,
      slideSeconds: 0.62
    },
    spawn: {
      firstDelay: 1.05,
      min: 0.82,
      max: 1.62,
      screenBuffer: 76
    },
    colors: {
      ink: "#20242a",
      skyTop: "#b9edff",
      skyBottom: "#fff8df",
      skyWarm: "#ffe3ef",
      cloud: "rgba(255, 255, 255, 0.9)",
      hillBack: "#c8f0a8",
      hillFront: "#84dca2",
      grass: "#75d981",
      grassShadow: "#3ebd74",
      track: "#bd8a66",
      trackDark: "#986648",
      stripe: "#fff0a8",
      decorPink: "#ff78a9",
      decorYellow: "#ffd166",
      decorBlue: "#70d6ff",
      decorMint: "#b8f2e6",
      runnerSkin: "#ffd0a7",
      runnerHair: "#34303a",
      runnerShirt: "#1b998b",
      runnerShorts: "#f25f4c",
      runnerShoe: "#20242a",
      runnerSock: "#ffffff",
      obstacleLow: "#7b5cff",
      obstacleHigh: "#ff8e3c"
    }
  };

  const canvas = document.querySelector("#gameCanvas");
  const ctx = canvas.getContext("2d");
  const ui = {
    score: document.querySelector("#scoreValue"),
    highScore: document.querySelector("#highScoreValue"),
    speed: document.querySelector("#speedValue"),
    messageLayer: document.querySelector("#messageLayer"),
    statusText: document.querySelector("#statusText"),
    statusSubtext: document.querySelector("#statusSubtext"),
    restartButton: document.querySelector("#restartButton")
  };

  const STORAGE_KEY = "festival-runner-high-score";

  const state = {
    mode: "ready",
    elapsed: 0,
    score: 0,
    highScore: loadHighScore(),
    speed: CONFIG.speed.start,
    spawnTimer: CONFIG.spawn.firstDelay,
    obstacles: [],
    player: createPlayer(),
    world: {
      clouds: 0,
      hills: 0,
      ground: 0,
      runnerTime: 0
    },
    flash: 0
  };

  const input = {
    down: false
  };

  function createPlayer() {
    return {
      airY: 0,
      vy: 0,
      slideTimer: 0,
      landSquash: 0,
      hitPulse: 0
    };
  }

  function loadHighScore() {
    try {
      const saved = Number.parseInt(localStorage.getItem(STORAGE_KEY), 10);
      return Number.isFinite(saved) ? saved : 0;
    } catch {
      return 0;
    }
  }

  function saveHighScore(value) {
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // The game remains playable even when browser storage is unavailable.
    }
  }

  function startGame() {
    state.mode = "playing";
    state.elapsed = 0;
    state.score = 0;
    state.speed = CONFIG.speed.start;
    state.spawnTimer = CONFIG.spawn.firstDelay;
    state.obstacles = [];
    state.player = createPlayer();
    state.flash = 0;
    hideMessage();
    updateUi();
  }

  function restartGame() {
    startGame();
  }

  function gameOver() {
    state.mode = "gameover";
    state.flash = 0.26;
    state.player.hitPulse = 0.18;

    const roundedScore = Math.floor(state.score);
    if (roundedScore > state.highScore) {
      state.highScore = roundedScore;
      saveHighScore(state.highScore);
    }

    ui.statusText.textContent = "ゲームオーバー";
    ui.statusSubtext.textContent = `Score ${roundedScore}。Rキーかボタンでもう一度。`;
    ui.restartButton.textContent = "リスタート";
    ui.messageLayer.classList.remove("is-hidden");
    updateUi();
  }

  function hideMessage() {
    ui.messageLayer.classList.add("is-hidden");
  }

  function showReadyMessage() {
    ui.statusText.textContent = "Spaceでスタート";
    ui.statusSubtext.textContent = "低い障害物はジャンプ、高い障害物はスライディングで回避。";
    ui.restartButton.textContent = "スタート";
    ui.messageLayer.classList.remove("is-hidden");
  }

  function updateUi() {
    ui.score.textContent = String(Math.floor(state.score));
    ui.highScore.textContent = String(state.highScore);
    ui.speed.textContent = `${(state.speed / CONFIG.speed.start).toFixed(2)}x`;
  }

  function handleJump() {
    if (state.mode !== "playing") {
      startGame();
      return;
    }

    const player = state.player;
    if (isGrounded(player) && !isSliding(player)) {
      player.vy = CONFIG.jumpVelocity;
      player.airY = -1;
    }
  }

  function handleSlide() {
    if (state.mode !== "playing") {
      startGame();
      return;
    }

    const player = state.player;
    if (isGrounded(player)) {
      player.slideTimer = CONFIG.player.slideSeconds;
    }
  }

  function handleRestart() {
    restartGame();
  }

  function isGrounded(player) {
    return player.airY >= 0 && player.vy === 0;
  }

  function isSliding(player) {
    return player.slideTimer > 0 && isGrounded(player);
  }

  function update(dt) {
    state.elapsed += dt;
    state.speed = Math.min(
      CONFIG.speed.max,
      CONFIG.speed.start + state.elapsed * CONFIG.speed.accelPerSecond
    );
    state.score += dt * CONFIG.scorePerSecond * (state.speed / CONFIG.speed.start);

    updatePlayer(dt);
    updateWorld(dt);
    updateObstacles(dt);

    for (const obstacle of state.obstacles) {
      if (rectsOverlap(getPlayerHitbox(), obstacle.hitbox)) {
        gameOver();
        break;
      }
    }
  }

  function updatePlayer(dt) {
    const player = state.player;
    state.world.runnerTime += dt * (state.speed / CONFIG.speed.start);

    if (!isGrounded(player)) {
      player.vy += CONFIG.gravity * dt;
      player.airY += player.vy * dt;

      if (player.airY >= 0) {
        player.airY = 0;
        player.vy = 0;
        player.landSquash = 0.18;
      }
    }

    if (player.slideTimer > 0) {
      player.slideTimer = Math.max(0, player.slideTimer - dt);
    }

    if (player.landSquash > 0) {
      player.landSquash = Math.max(0, player.landSquash - dt * 0.9);
    }

    if (player.hitPulse > 0) {
      player.hitPulse = Math.max(0, player.hitPulse - dt);
    }
  }

  function updateWorld(dt) {
    state.world.clouds = wrapOffset(state.world.clouds + state.speed * 0.11 * dt, 260);
    state.world.hills = wrapOffset(state.world.hills + state.speed * 0.34 * dt, 360);
    state.world.ground = wrapOffset(state.world.ground + state.speed * dt, 96);
    state.flash = Math.max(0, state.flash - dt);
  }

  function updateObstacles(dt) {
    state.spawnTimer -= dt;

    if (state.spawnTimer <= 0) {
      spawnObstacle();
      state.spawnTimer = nextSpawnDelay();
    }

    for (const obstacle of state.obstacles) {
      obstacle.x -= state.speed * dt;
      obstacle.animTime += dt;
      updateObstacleHitbox(obstacle);
    }

    state.obstacles = state.obstacles.filter((obstacle) => obstacle.x + obstacle.width > -80);
  }

  function nextSpawnDelay() {
    const t = Math.min(1, state.elapsed / 55);
    const min = lerp(CONFIG.spawn.min, 0.58, t);
    const max = lerp(CONFIG.spawn.max, 1.12, t);
    return random(min, max);
  }

  function spawnObstacle() {
    const type = Math.random() < 0.55 ? "low" : "high";
    const obstacle = {
      type,
      x: CONFIG.width + CONFIG.spawn.screenBuffer,
      y: 0,
      width: 0,
      height: 0,
      hitbox: null,
      animTime: 0
    };

    if (type === "low") {
      obstacle.width = random(42, 58);
      obstacle.height = random(46, 62);
      obstacle.y = CONFIG.groundY - obstacle.height;
    } else {
      obstacle.width = random(70, 92);
      obstacle.height = 50;
      obstacle.y = CONFIG.groundY - 118;
    }

    updateObstacleHitbox(obstacle);
    state.obstacles.push(obstacle);
  }

  function updateObstacleHitbox(obstacle) {
    if (obstacle.type === "low") {
      obstacle.hitbox = {
        x: obstacle.x + 5,
        y: obstacle.y + 4,
        width: obstacle.width - 10,
        height: obstacle.height - 5
      };
    } else {
      obstacle.hitbox = {
        x: obstacle.x + 5,
        y: obstacle.y + 6,
        width: obstacle.width - 10,
        height: obstacle.height - 12
      };
    }
  }

  function getPlayerHitbox() {
    const player = state.player;
    const sliding = isSliding(player);
    const width = sliding ? CONFIG.player.slideWidth : CONFIG.player.width;
    const height = sliding ? CONFIG.player.slideHeight : CONFIG.player.height;
    const feetY = CONFIG.groundY + player.airY;

    return {
      x: CONFIG.player.x + (sliding ? 9 : 10),
      y: feetY - height + (sliding ? 9 : 12),
      width: width - (sliding ? 17 : 20),
      height: height - (sliding ? 15 : 18)
    };
  }

  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  function draw() {
    drawSky();
    drawBackground();
    drawGround();
    drawObstacles();
    drawRunner();
    drawForeground();

    if (state.flash > 0) {
      ctx.save();
      ctx.globalAlpha = state.flash * 2.4;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
      ctx.restore();
    }
  }

  function drawSky() {
    const gradient = ctx.createLinearGradient(0, 0, 0, CONFIG.height);
    gradient.addColorStop(0, CONFIG.colors.skyTop);
    gradient.addColorStop(0.52, CONFIG.colors.skyWarm);
    gradient.addColorStop(1, CONFIG.colors.skyBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
  }

  function drawBackground() {
    const cloudOffset = state.world.clouds;
    const hillOffset = state.world.hills;

    drawPastelConfetti(cloudOffset * 0.4);
    drawSoftRainbow(CONFIG.width - wrapOffset(cloudOffset * 0.28, CONFIG.width + 420), 180);
    drawBunting(wrapOffset(cloudOffset * 0.58, 210));

    for (let x = -cloudOffset - 120; x < CONFIG.width + 180; x += 260) {
      drawCloud(x, 78 + ((x + 500) % 72), 1 + ((x + 260) % 3) * 0.08);
    }

    for (let x = -hillOffset - 220; x < CONFIG.width + 360; x += 360) {
      drawHill(x, CONFIG.groundY + 22, 210, 118, CONFIG.colors.hillBack);
      drawFestivalBooth(x + 150, CONFIG.groundY - 74);
    }

    for (let x = -hillOffset * 1.34 - 120; x < CONFIG.width + 260; x += 280) {
      drawHill(x, CONFIG.groundY + 32, 150, 86, CONFIG.colors.hillFront);
      drawFlowerPatch(x + 42, CONFIG.groundY - 6, 0.85);
      drawFlowerPatch(x + 178, CONFIG.groundY + 1, 0.72);
    }
  }

  function drawCloud(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = CONFIG.colors.cloud;
    ellipse(-20, 12, 38, 19);
    ellipse(15, 6, 44, 24);
    ellipse(52, 14, 36, 18);
    ctx.fillRect(-38, 12, 110, 20);

    ctx.fillStyle = "rgba(32, 36, 42, 0.45)";
    ellipse(2, 14, 2.5, 3.2);
    ellipse(35, 14, 2.5, 3.2);
    ctx.strokeStyle = "rgba(32, 36, 42, 0.38)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(18, 17, 8, 0.18, Math.PI - 0.18);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 120, 169, 0.22)";
    ellipse(-8, 19, 8, 4);
    ellipse(45, 19, 8, 4);
    ctx.restore();
  }

  function drawPastelConfetti(offset) {
    const colors = [
      CONFIG.colors.decorPink,
      CONFIG.colors.decorYellow,
      CONFIG.colors.decorBlue,
      CONFIG.colors.decorMint
    ];

    ctx.save();
    ctx.globalAlpha = 0.62;
    for (let i = 0; i < 28; i += 1) {
      const x = (i * 137 - offset) % (CONFIG.width + 140);
      const y = 42 + ((i * 47) % 230);
      ctx.fillStyle = colors[i % colors.length];
      if (i % 3 === 0) {
        drawTinyStar(x, y, 5 + (i % 2) * 2);
      } else if (i % 3 === 1) {
        drawHeart(x, y, 0.45);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawSoftRainbow(x, y) {
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.lineCap = "round";
    const bands = [
      "#ff9ebc",
      "#ffd166",
      "#9be36d",
      "#70d6ff"
    ];

    for (let i = 0; i < bands.length; i += 1) {
      ctx.strokeStyle = bands[i];
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(x, y, 116 - i * 14, Math.PI * 1.05, Math.PI * 1.82);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBunting(offset) {
    ctx.save();
    ctx.strokeStyle = "rgba(32, 36, 42, 0.16)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-40 - offset, 58);
    ctx.quadraticCurveTo(260 - offset, 104, 560 - offset, 58);
    ctx.quadraticCurveTo(760 - offset, 28, 1030 - offset, 62);
    ctx.stroke();

    const flagColors = [
      CONFIG.colors.decorPink,
      CONFIG.colors.decorYellow,
      CONFIG.colors.decorBlue,
      CONFIG.colors.decorMint
    ];

    for (let x = -34 - offset; x < CONFIG.width + 70; x += 42) {
      const y = 64 + Math.sin((x + offset) * 0.012) * 18;
      ctx.fillStyle = flagColors[Math.abs(Math.floor(x / 42)) % flagColors.length];
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 24, y + 4);
      ctx.lineTo(x + 10, y + 30);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHill(x, baseY, width, height, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(x + width * 0.5, baseY - height, x + width, baseY);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#ffffff";
    ellipse(x + width * 0.34, baseY - height * 0.46, width * 0.08, height * 0.08);
    ellipse(x + width * 0.66, baseY - height * 0.34, width * 0.06, height * 0.06);
    ctx.restore();
  }

  function drawFestivalBooth(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#ffe9a8";
    roundedRect(-32, 20, 92, 50, 6);
    ctx.fill();
    ctx.fillStyle = CONFIG.colors.decorPink;
    ctx.beginPath();
    ctx.moveTo(-42, 22);
    ctx.lineTo(5, -12);
    ctx.lineTo(70, 22);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = CONFIG.colors.decorYellow;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.arc(-22 + i * 23, 15, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 4; i += 1) {
      ctx.fillRect(-27 + i * 22, 22, 11, 16);
    }

    ctx.fillStyle = CONFIG.colors.decorBlue;
    ellipse(67, 4, 8, 10);
    ctx.strokeStyle = "rgba(32, 36, 42, 0.24)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(67, 14);
    ctx.lineTo(60, 28);
    ctx.stroke();
    ctx.restore();
  }

  function drawGround() {
    ctx.fillStyle = CONFIG.colors.grass;
    ctx.fillRect(0, CONFIG.groundY - 10, CONFIG.width, 28);

    ctx.fillStyle = CONFIG.colors.grassShadow;
    for (let x = -state.world.ground * 0.8; x < CONFIG.width + 60; x += 58) {
      ctx.beginPath();
      ctx.arc(x, CONFIG.groundY + 7, 24, Math.PI, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = CONFIG.colors.track;
    ctx.fillRect(0, CONFIG.groundY + 10, CONFIG.width, CONFIG.height - CONFIG.groundY - 10);

    ctx.fillStyle = CONFIG.colors.trackDark;
    for (let x = -state.world.ground; x < CONFIG.width + 96; x += 96) {
      ctx.fillRect(x, CONFIG.groundY + 48, 58, 7);
      ctx.fillRect(x + 32, CONFIG.groundY + 91, 42, 5);
    }

    ctx.fillStyle = CONFIG.colors.stripe;
    for (let x = -state.world.ground * 1.2; x < CONFIG.width + 70; x += 70) {
      ctx.fillRect(x, CONFIG.groundY + 18, 34, 6);
    }

    drawGroundCharms();
  }

  function drawFlowerPatch(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    for (let i = 0; i < 4; i += 1) {
      const stemX = i * 18;
      const stemY = Math.sin(i * 2.4) * 6;
      ctx.strokeStyle = "rgba(34, 138, 88, 0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(stemX, 16);
      ctx.lineTo(stemX + 2, stemY);
      ctx.stroke();

      ctx.fillStyle = i % 2 === 0 ? CONFIG.colors.decorPink : CONFIG.colors.decorYellow;
      ellipse(stemX - 4, stemY, 4, 4);
      ellipse(stemX + 4, stemY, 4, 4);
      ellipse(stemX, stemY - 4, 4, 4);
      ellipse(stemX, stemY + 4, 4, 4);
      ctx.fillStyle = "#ffffff";
      ellipse(stemX, stemY, 2, 2);
    }

    ctx.restore();
  }

  function drawGroundCharms() {
    const colors = [
      CONFIG.colors.decorPink,
      CONFIG.colors.decorYellow,
      CONFIG.colors.decorBlue,
      CONFIG.colors.decorMint
    ];

    ctx.save();
    ctx.globalAlpha = 0.72;
    for (let x = -state.world.ground * 0.55; x < CONFIG.width + 110; x += 110) {
      ctx.fillStyle = colors[Math.abs(Math.floor(x / 110)) % colors.length];
      if (Math.floor(x / 110) % 2 === 0) {
        drawHeart(x + 28, CONFIG.groundY + 84, 0.52);
      } else {
        drawTinyStar(x + 38, CONFIG.groundY + 79, 7);
      }
    }
    ctx.restore();
  }

  function drawTinyStar(x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.28, y - size * 0.28);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x + size * 0.28, y + size * 0.28);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size * 0.28, y + size * 0.28);
    ctx.lineTo(x - size, y);
    ctx.lineTo(x - size * 0.28, y - size * 0.28);
    ctx.closePath();
    ctx.fill();
  }

  function drawHeart(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.bezierCurveTo(-20, -4, -12, -24, 0, -14);
    ctx.bezierCurveTo(12, -24, 20, -4, 0, 10);
    ctx.fill();
    ctx.restore();
  }

  function drawObstacles() {
    for (const obstacle of state.obstacles) {
      if (obstacle.type === "low") {
        drawLowObstacle(obstacle);
      } else {
        drawHighObstacle(obstacle);
      }
    }
  }

  function drawLowObstacle(obstacle) {
    ctx.save();
    ctx.translate(obstacle.x, obstacle.y);
    ctx.fillStyle = CONFIG.colors.obstacleLow;
    roundedRect(0, 0, obstacle.width, obstacle.height, 7);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(8, 8, obstacle.width - 16, 8);
    ctx.fillStyle = "#4b36b5";
    ctx.fillRect(7, obstacle.height - 11, obstacle.width - 14, 7);
    ctx.restore();
  }

  function drawHighObstacle(obstacle) {
    const bob = Math.sin(obstacle.animTime * 8) * 2;

    ctx.save();
    ctx.translate(obstacle.x, obstacle.y + bob);
    ctx.strokeStyle = "rgba(32, 36, 42, 0.22)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(8, -34);
    ctx.lineTo(8, 54);
    ctx.moveTo(obstacle.width - 8, -34);
    ctx.lineTo(obstacle.width - 8, 54);
    ctx.stroke();

    ctx.fillStyle = CONFIG.colors.obstacleHigh;
    roundedRect(0, 0, obstacle.width, obstacle.height, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(12, 12, obstacle.width - 24, 8);
    ctx.fillStyle = "#c44f10";
    ctx.fillRect(12, 30, obstacle.width - 24, 8);
    ctx.restore();
  }

  function drawRunner() {
    const player = state.player;
    const sliding = isSliding(player);
    const feetY = CONFIG.groundY + player.airY;
    const t = state.world.runnerTime;
    const squash = player.landSquash;
    const hitShake = player.hitPulse > 0 ? Math.sin(player.hitPulse * 85) * 4 : 0;

    ctx.save();
    ctx.translate(CONFIG.player.x + hitShake, feetY);
    ctx.scale(1 + squash, 1 - squash * 0.55);

    if (sliding) {
      drawSlidingRunner(t);
    } else {
      drawStandingRunner(t, !isGrounded(player));
    }

    ctx.restore();
  }

  function drawStandingRunner(t, inAir) {
    const c = CONFIG.colors;
    const stride = Math.sin(t * 16);
    const backStride = Math.sin(t * 16 + Math.PI);
    const wobble = Math.sin(t * 22) * (inAir ? 1.2 : 3.1);

    drawLeg(-6, -16, stride, inAir ? 0.5 : 1);
    drawLeg(27, -16, backStride, inAir ? 0.5 : 1);

    ctx.save();
    ctx.translate(0, wobble * 0.3);
    ctx.fillStyle = c.runnerShorts;
    ellipse(20 + wobble, -44, 25 + Math.abs(wobble) * 0.45, 21);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ellipse(29 + wobble * 1.2, -48, 6, 4);
    ctx.restore();

    ctx.fillStyle = c.runnerShirt;
    roundedRect(12, -91, 47, 58, 16);
    ctx.fill();

    drawArm(45, -75, -stride);
    drawArm(22, -75, stride);

    ctx.fillStyle = c.runnerSkin;
    ellipse(55, -108, 24, 23);
    ctx.fillStyle = c.runnerHair;
    ellipse(47, -119, 17, 12);
    roundedRect(34, -114, 20, 22, 8);
    ctx.fill();

    ctx.fillStyle = c.ink;
    ellipse(64, -109, 2.5, 3);
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(67, -101, 7, 0.15, 0.75);
    ctx.stroke();
  }

  function drawSlidingRunner(t) {
    const c = CONFIG.colors;
    const wobble = Math.sin(t * 24) * 2.4;

    ctx.fillStyle = c.runnerShoe;
    roundedRect(73, -14, 28, 12, 5);
    ctx.fill();
    ctx.fillStyle = c.runnerSock;
    roundedRect(52, -22, 31, 11, 5);
    ctx.fill();
    ctx.fillStyle = c.runnerSkin;
    roundedRect(22, -28, 44, 14, 7);
    ctx.fill();

    ctx.fillStyle = c.runnerShorts;
    ellipse(24 + wobble, -34, 27, 19);
    ctx.fillStyle = "rgba(255,255,255,0.24)";
    ellipse(33 + wobble, -37, 6, 4);

    ctx.fillStyle = c.runnerShirt;
    roundedRect(30, -57, 58, 34, 14);
    ctx.fill();

    ctx.fillStyle = c.runnerSkin;
    ellipse(89, -54, 20, 18);
    ctx.fillStyle = c.runnerHair;
    roundedRect(76, -66, 21, 18, 7);
    ctx.fill();
    ctx.fillStyle = c.ink;
    ellipse(98, -54, 2.4, 2.8);

    ctx.strokeStyle = c.runnerSkin;
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(50, -45);
    ctx.lineTo(18, -31 + wobble * 0.3);
    ctx.stroke();
  }

  function drawLeg(hipX, hipY, stride, energy) {
    const c = CONFIG.colors;
    const kneeX = hipX + 11 + stride * 11 * energy;
    const kneeY = hipY + 34 - Math.abs(stride) * 6 * energy;
    const footX = kneeX + 8 - stride * 20 * energy;
    const footY = -5 + Math.max(0, stride) * 3 * energy;

    ctx.strokeStyle = c.runnerSkin;
    ctx.lineWidth = 11;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(hipX + 20, hipY);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(footX, footY);
    ctx.stroke();

    ctx.strokeStyle = c.runnerSock;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(footX - 1, footY - 8);
    ctx.lineTo(footX + 3, footY);
    ctx.stroke();

    ctx.fillStyle = c.runnerShoe;
    roundedRect(footX - 8, footY - 2, 26, 11, 5);
    ctx.fill();
  }

  function drawArm(shoulderX, shoulderY, swing) {
    const c = CONFIG.colors;
    ctx.strokeStyle = c.runnerSkin;
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(shoulderX + 17 + swing * 11, shoulderY + 20);
    ctx.lineTo(shoulderX + 4 + swing * 14, shoulderY + 34);
    ctx.stroke();
  }

  function drawForeground() {
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    for (let x = -state.world.ground * 1.8; x < CONFIG.width + 160; x += 160) {
      ctx.fillRect(x, CONFIG.groundY + 4, 70, 3);
    }
  }

  function roundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width * 0.5, height * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function ellipse(x, y, radiusX, radiusY) {
    ctx.beginPath();
    ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function wrapOffset(value, size) {
    return value % size;
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function fitCanvas() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(CONFIG.width * dpr);
    canvas.height = Math.floor(CONFIG.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function onKeyDown(event) {
    if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
      event.preventDefault();
      if (!event.repeat) {
        handleJump();
      }
    }

    if (event.code === "ArrowDown" || event.code === "KeyS") {
      event.preventDefault();
      input.down = true;
      if (!event.repeat) {
        handleSlide();
      }
    }

    if (event.code === "KeyR") {
      event.preventDefault();
      handleRestart();
    }
  }

  function onKeyUp(event) {
    if (event.code === "ArrowDown" || event.code === "KeyS") {
      input.down = false;
    }
  }

  function bindControls() {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", fitCanvas);
    ui.restartButton.addEventListener("click", handleRestart);

    document.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (button.dataset.action === "jump") {
          handleJump();
        } else {
          handleSlide();
        }
      });
    });
  }

  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;

    if (state.mode === "playing") {
      update(dt);
      updateUi();
    } else {
      state.world.runnerTime += dt * 0.6;
      updateWorld(dt);
      updatePlayer(dt);
    }

    draw();
    requestAnimationFrame(loop);
  }

  fitCanvas();
  bindControls();
  showReadyMessage();
  updateUi();
  requestAnimationFrame(loop);
})();
