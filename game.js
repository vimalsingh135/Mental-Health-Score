(() => {
  "use strict";

  const gameBtn = document.getElementById("game-btn");
  if (!gameBtn) return;

  // Build the overlay pieces once
  const canvas = document.createElement("canvas");
  canvas.id = "game-canvas";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const hint = document.createElement("div");
  hint.className = "game-hint";
  hint.textContent = "Move your mouse to aim, scroll to reach more — destroy everything!";
  document.body.appendChild(hint);

  const winOverlay = document.createElement("div");
  winOverlay.className = "win-modal-overlay";
  winOverlay.innerHTML = `
    <div class="win-modal">
      <h2>YOU WON THE GAME</h2>
      <p>chill kr bhai, you are amazing 🎉</p>
      <button type="button" id="win-ok-btn">OK</button>
    </div>
  `;
  document.body.appendChild(winOverlay);
  const winOkBtn = winOverlay.querySelector("#win-ok-btn");

  // Selectors for "destroyable" page elements
  const TARGET_SELECTOR = [
    "button", "select", "input", "label", "legend", "span",
    "h1", "p", ".eyebrow", ".score-number", ".score-band",
    ".seg-btn", ".idle-label", ".legend-index"
  ].join(",");

  let targets = [];
  let bullets = [];
  let particles = [];
  let mouse = { x: window.innerWidth / 2, y: window.innerHeight * 0.5 };
  let running = false;
  let fireTimer = null;
  let rafId = null;
  let hitElements = [];
  let cannonAngle = 0;
  let lastKillTime = 0;

  const BULLET_RADIUS = 5;
  const HIT_PADDING = 16; // more forgiving collision so stragglers die faster

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function collectTargets() {
    const els = document.querySelectorAll(TARGET_SELECTOR);
    targets = [];
    els.forEach((el) => {
      if (el.closest("#game-canvas, .win-modal-overlay, .game-hint")) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) return; // hidden/collapsed elements only
      targets.push(el); // position is recomputed live each frame, so scroll position doesn't matter
    });
  }

  function spawnBullet() {
    const speed = 15;
    bullets.push({
      x: mouse.x,
      y: mouse.y,
      vx: Math.cos(cannonAngle) * speed,
      vy: Math.sin(cannonAngle) * speed,
    });
  }

  function spawnParticles(x, y) {
    for (let i = 0; i < 14; i++) {
      const a = (Math.PI * 2 * i) / 14;
      const speed = 2 + Math.random() * 3;
      particles.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 1,
      });
    }
  }

  function bulletHitsRect(bx, by, rect) {
    return (
      bx >= rect.left - HIT_PADDING &&
      bx <= rect.right + HIT_PADDING &&
      by >= rect.top - HIT_PADDING &&
      by <= rect.bottom + HIT_PADDING
    );
  }

  function drawCannon() {
    ctx.save();
    ctx.translate(mouse.x, mouse.y);
    ctx.rotate(cannonAngle);

    // triangular cannon body, tip pointing in fire direction
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-14, -13);
    ctx.lineTo(-14, 13);
    ctx.closePath();
    ctx.fillStyle = "#A78BFA";
    ctx.strokeStyle = "#2C2049";
    ctx.lineWidth = 2.5;
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // glow ring at cannon location
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, 22, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(167,139,250,0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function tick() {
    if (!running) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    cannonAngle += 0.35; // continuous sweep so fire covers every direction over time

    // bullets
    bullets.forEach((b) => {
      b.x += b.vx;
      b.y += b.vy;
    });
    bullets = bullets.filter(
      (b) => b.x > -20 && b.x < canvas.width + 20 && b.y > -20 && b.y < canvas.height + 20
    );

    // collisions
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      for (let ti = targets.length - 1; ti >= 0; ti--) {
        const el = targets[ti];
        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > canvas.height) continue; // currently scrolled out of view, skip test
        if (bulletHitsRect(b.x, b.y, rect)) {
          spawnParticles(b.x, b.y);
          el.classList.add("game-target-hit");
          hitElements.push(el);
          targets.splice(ti, 1);
          bullets.splice(bi, 1);
          lastKillTime = performance.now();
          break;
        }
      }
    }

    // WIN CHECK — as soon as every target is gone, stop immediately.
    // (waiting for bullets/particles to also hit 0 would never fire, since bullets spawn forever)
    if (targets.length === 0) {
      endGame(true);
      return;
    }

    // Stall guard: if nothing's died in a while (bad luck on a tiny straggler), force-clear one
    if (performance.now() - lastKillTime > 1500) {
      const el = targets.pop();
      if (el) {
        const rect = el.getBoundingClientRect();
        spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2);
        el.classList.add("game-target-hit");
        hitElements.push(el);
      }
      lastKillTime = performance.now();
    }

    // particles
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.035;
    });
    particles = particles.filter((p) => p.life > 0);

    // draw bullets — dark fill with light outline so they're visible on any background
    bullets.forEach((b) => {
      ctx.beginPath();
      ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#1A1225";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#F1E9FE";
      ctx.stroke();
    });

    // draw particles
    particles.forEach((p) => {
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = "#E3B341";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    drawCannon();

    rafId = requestAnimationFrame(tick);
  }

  function onMouseMove(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }

  function scrollToTop() {
    window.scrollTo(0, 0); // consistent starting point; scrolling stays enabled during play
  }

  function startGame() {
    scrollToTop();
    resizeCanvas();
    collectTargets();
    bullets = [];
    particles = [];
    hitElements = [];
    cannonAngle = 0;
    lastKillTime = performance.now();
    running = true;

    canvas.classList.add("active");
    hint.classList.add("active");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("resize", resizeCanvas);

    fireTimer = setInterval(spawnBullet, 45);
    rafId = requestAnimationFrame(tick);
  }

  function endGame(won) {
    running = false;
    clearInterval(fireTimer);
    if (rafId) cancelAnimationFrame(rafId);
    canvas.classList.remove("active");
    hint.classList.remove("active");
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("resize", resizeCanvas);

    if (won) {
      winOverlay.classList.add("active");
    }
  }

  function resetPage() {
    hitElements.forEach((el) => el.classList.remove("game-target-hit"));
    hitElements = [];
    winOverlay.classList.remove("active");
  }

  gameBtn.addEventListener("click", startGame);
  winOkBtn.addEventListener("click", resetPage);
})();