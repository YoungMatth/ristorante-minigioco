 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/game.js b/game.js
index 4e7057bd2710e33f2f32c31e2d2a373f102001b5..d80d6c48a5ad9ebaaad857e7db6d586a724697fb 100644
--- a/game.js
+++ b/game.js
@@ -1,304 +1,626 @@
 (() => {
-  const canvas = document.getElementById("c");
-  const ctx = canvas.getContext("2d");
-  const scoreEl = document.getElementById("score");
-  const restartBtn = document.getElementById("restart");
-
-  // === retina resize ===
-  function resize() {
-    const rect = canvas.getBoundingClientRect();
-    const dpr = Math.max(1, window.devicePixelRatio || 1);
-    canvas.width = Math.floor(rect.width * dpr);
-    canvas.height = Math.floor(rect.height * dpr);
-    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
-  }
-  window.addEventListener("resize", resize);
+  const DEBUG = false;
+  const LOG = (...args) => DEBUG && console.log("[ScaccoRunner]", ...args);
 
-  const W = () => canvas.getBoundingClientRect().width;
-  const H = () => canvas.getBoundingClientRect().height;
-
-  // === feel (salto più "tight") ===
-  const GRAVITY = 2300;
-  const JUMP_V = -720;
-  const COYOTE = 0.075;
+  const canvas = document.getElementById("gameCanvas");
+  const ctx = canvas.getContext("2d");
+  const scoreValueEl = document.getElementById("scoreValue");
+  const restartBtn = document.getElementById("restartBtn");
+  const monthLabel = document.getElementById("monthLabel");
+
+  const leaderboardList = document.getElementById("leaderboardList");
+  const leaderboardStatus = document.getElementById("leaderboardStatus");
+  const leaderboardEmpty = document.getElementById("leaderboardEmpty");
+
+  const gameOverModal = document.getElementById("gameOverModal");
+  const finalScoreEl = document.getElementById("finalScore");
+  const playerNameInput = document.getElementById("playerName");
+  const submitBtn = document.getElementById("submitBtn");
+  const retryBtn = document.getElementById("retryBtn");
+  const modalError = document.getElementById("modalError");
+
+  const GRAVITY = 2850;
+  const JUMP_VELOCITY = -820;
+  const COYOTE_TIME = 0.075;
   const JUMP_BUFFER = 0.09;
-
-  let running = true;
-  let lastT = 0;
-  let t = 0;
-  let speed = 340;
-  let score = 0;
-
-  const groundPad = 62;
-  const groundY = () => H() - groundPad;
+  const GROUND_MARGIN = 66;
+
+  const SESSION_SUBMIT_COOLDOWN_MS = 10000;
+  let lastSubmitAt = 0;
+
+  const state = {
+    running: true,
+    gameOver: false,
+    startedAt: performance.now(),
+    lastFrameTime: performance.now(),
+    elapsed: 0,
+    speed: 265,
+    score: 0,
+    screenFlash: 0,
+    parallaxA: 0,
+    parallaxB: 0,
+  };
 
   const player = {
-    x: 92,
+    x: 84,
     y: 0,
     vy: 0,
-    w: 26,
-    h: 40,
-    onGround: true,
-    coyoteT: 0,
-    jumpBufT: 0,
+    width: 28,
+    height: 46,
+    grounded: false,
+    coyoteLeft: 0,
+    jumpBufferLeft: 0,
+    squash: 0,
   };
 
-  let obstacles = [];
-  let spawnT = 0.7;
+  const obstacles = [];
+  const particles = [];
+  let nextSpawnIn = 0.9;
+
+  function getMonthKeyUTC() {
+    return new Date().toISOString().slice(0, 7);
+  }
 
-  function monthKey(){ return new Date().toISOString().slice(0,7); }
+  monthLabel.textContent = getMonthKeyUTC();
 
-  function reset() {
-    running = true;
-    lastT = performance.now();
-    t = 0;
-    speed = 340;
-    score = 0;
-    obstacles = [];
-    spawnT = 0.7;
+  function resizeCanvas() {
+    const rect = canvas.getBoundingClientRect();
+    const dpr = Math.min(window.devicePixelRatio || 1, 2);
+    canvas.width = Math.round(rect.width * dpr);
+    canvas.height = Math.round(rect.height * dpr);
+    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
+  }
 
+  window.addEventListener("resize", resizeCanvas);
+  resizeCanvas();
+
+  const W = () => canvas.getBoundingClientRect().width;
+  const H = () => canvas.getBoundingClientRect().height;
+  const groundY = () => H() - GROUND_MARGIN;
+
+  function resetGame() {
+    state.running = true;
+    state.gameOver = false;
+    state.startedAt = performance.now();
+    state.lastFrameTime = performance.now();
+    state.elapsed = 0;
+    state.speed = 265;
+    state.score = 0;
+    state.screenFlash = 0;
+    state.parallaxA = 0;
+    state.parallaxB = 0;
+    nextSpawnIn = 0.8;
+
+    obstacles.length = 0;
+    particles.length = 0;
+
+    player.x = 84;
     player.y = groundY();
     player.vy = 0;
-    player.onGround = true;
-    player.coyoteT = 0;
-    player.jumpBufT = 0;
+    player.grounded = true;
+    player.coyoteLeft = 0;
+    player.jumpBufferLeft = 0;
+    player.squash = 0;
 
-    scoreEl.textContent = "0";
+    scoreValueEl.textContent = "0";
+    closeGameOverModal();
   }
 
-  function requestJump(){
-    if (!running) { reset(); return; }
-    player.jumpBufT = JUMP_BUFFER;
+  function queueJump() {
+    if (state.gameOver) return;
+    player.jumpBufferLeft = JUMP_BUFFER;
   }
 
-  function doJump(){
-    player.vy = JUMP_V;
-    player.onGround = false;
-    player.coyoteT = 0;
-    player.jumpBufT = 0;
+  function executeJump() {
+    player.vy = JUMP_VELOCITY;
+    player.grounded = false;
+    player.coyoteLeft = 0;
+    player.jumpBufferLeft = 0;
+    player.squash = 0.25;
   }
 
-  function spawnObstacle(){
+  function createObstacle() {
+    const variant = Math.random() < 0.5
+      ? { width: 22, height: 38 }
+      : { width: 30, height: 52 };
+
     obstacles.push({
       x: W() + 40,
-      w: 20 + Math.random() * 10,
-      h: 34 + Math.random() * 12
+      width: variant.width,
+      height: variant.height,
+      tint: Math.random() * 0.2,
     });
   }
 
-  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh){
-    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
+  function createLandingParticles(x, y) {
+    for (let i = 0; i < 5; i += 1) {
+      particles.push({
+        x,
+        y,
+        vx: -35 + Math.random() * 70,
+        vy: -24 - Math.random() * 42,
+        life: 0.35 + Math.random() * 0.22,
+        age: 0,
+      });
+    }
+  }
+
+  function overlaps(a, b) {
+    return (
+      a.x < b.x + b.width &&
+      a.x + a.width > b.x &&
+      a.y < b.y + b.height &&
+      a.y + a.height > b.y
+    );
+  }
+
+  function safeScoreText(score) {
+    return Number.isFinite(score) ? String(Math.max(0, Math.floor(score))) : "0";
   }
 
-  async function submitScore(finalScore){
-    // 1) usa client già esposto da index.html
-    let sb = window.__sb;
+  function validateName(raw) {
+    const name = raw.trim();
+    if (!name) return "Inserisci un nome prima di inviare.";
+    if (name.length > 16) return "Il nome può avere massimo 16 caratteri.";
+    if (!/^[A-Za-zÀ-ÿ0-9 ._-]+$/.test(name)) {
+      return "Usa solo lettere, numeri, spazi e i simboli . - _";
+    }
+    return null;
+  }
 
-    // 2) fallback: ricrea client se window.__sb non c’è
-    if (!sb && window.supabase && window.__SUPABASE_URL && window.__SUPABASE_KEY) {
+  function getSupabaseClient() {
+    if (window.__sb) return window.__sb;
+    if (window.supabase && window.__SUPABASE_URL && window.__SUPABASE_KEY) {
+      const url = window.__SUPABASE_URL;
+      const key = window.__SUPABASE_KEY;
+      if (url.startsWith("YOUR_") || key.startsWith("YOUR_")) {
+        return null;
+      }
       try {
-        sb = window.supabase.createClient(window.__SUPABASE_URL, window.__SUPABASE_KEY);
-        window.__sb = sb;
-      } catch (e) {}
+        window.__sb = window.supabase.createClient(url, key);
+        return window.__sb;
+      } catch (error) {
+        LOG("Create client failed", error);
+        return null;
+      }
+    }
+    return null;
+  }
+
+  async function loadLeaderboard() {
+    const sb = getSupabaseClient();
+    if (!sb) {
+      leaderboardStatus.textContent = "Leaderboard offline: configura URL/KEY Supabase nel file index.html.";
+      leaderboardList.innerHTML = "";
+      leaderboardEmpty.hidden = false;
+      return;
+    }
+
+    const monthKey = getMonthKeyUTC();
+    leaderboardStatus.textContent = "Caricamento classifica...";
+
+    const { data, error } = await sb
+      .from("scores")
+      .select("name, score, created_at")
+      .eq("month_key", monthKey)
+      .order("score", { ascending: false })
+      .order("created_at", { ascending: true })
+      .limit(10);
+
+    if (error) {
+      LOG("loadLeaderboard error", error);
+      leaderboardStatus.textContent = "Errore caricamento leaderboard. Controlla configurazione Supabase.";
+      leaderboardList.innerHTML = "";
+      leaderboardEmpty.hidden = false;
+      return;
     }
 
+    renderLeaderboard(data || []);
+  }
+
+  function rankBadgeClass(index) {
+    if (index === 0) return "rank-badge rank-gold";
+    if (index === 1) return "rank-badge rank-silver";
+    if (index === 2) return "rank-badge rank-bronze";
+    return "rank-badge";
+  }
+
+  function renderLeaderboard(rows) {
+    leaderboardList.innerHTML = "";
+    if (!rows.length) {
+      leaderboardStatus.textContent = "Nessun record del mese per ora.";
+      leaderboardEmpty.hidden = false;
+      return;
+    }
+
+    leaderboardEmpty.hidden = true;
+    leaderboardStatus.textContent = `Aggiornata live (${getMonthKeyUTC()} UTC)`;
+
+    rows.forEach((row, idx) => {
+      const li = document.createElement("li");
+      const badge = document.createElement("span");
+      badge.className = rankBadgeClass(idx);
+      badge.textContent = `#${idx + 1}`;
+
+      const nameEl = document.createElement("span");
+      nameEl.textContent = row.name;
+
+      const scoreEl = document.createElement("span");
+      scoreEl.className = "score-number";
+      scoreEl.textContent = safeScoreText(row.score);
+
+      li.appendChild(badge);
+      li.appendChild(nameEl);
+      li.appendChild(scoreEl);
+      leaderboardList.appendChild(li);
+    });
+  }
+
+  function subscribeRealtime() {
+    const sb = getSupabaseClient();
+    if (!sb) return;
+
+    const channel = sb
+      .channel("scores-live")
+      .on(
+        "postgres_changes",
+        {
+          event: "INSERT",
+          schema: "public",
+          table: "scores",
+        },
+        (payload) => {
+          LOG("Realtime insert", payload);
+          if (payload.new?.month_key === getMonthKeyUTC()) {
+            loadLeaderboard().catch((error) => LOG("Realtime reload failed", error));
+          }
+        }
+      )
+      .subscribe((status) => {
+        LOG("Realtime status", status);
+      });
+
+    window.addEventListener("beforeunload", () => {
+      sb.removeChannel(channel);
+    });
+  }
+
+  async function submitScore() {
+    const sb = getSupabaseClient();
     if (!sb) {
-      alert("Leaderboard non configurata (Supabase non inizializzato).");
+      modalError.textContent = "Leaderboard non configurata. Aggiungi URL/KEY Supabase in index.html.";
+      return;
+    }
+
+    const now = Date.now();
+    if (now - lastSubmitAt < SESSION_SUBMIT_COOLDOWN_MS) {
+      modalError.textContent = "Attendi 10 secondi prima di inviare un altro punteggio.";
       return;
     }
 
-    const name = prompt("Inserisci il tuo nome (max 16):");
-    if (!name) return;
-    const clean = name.trim().slice(0,16);
-    if (!clean) return;
+    const validationError = validateName(playerNameInput.value);
+    if (validationError) {
+      modalError.textContent = validationError;
+      return;
+    }
+
+    const cleanName = playerNameInput.value.trim().slice(0, 16);
+    submitBtn.disabled = true;
+    retryBtn.disabled = true;
+    modalError.textContent = "Invio punteggio in corso...";
 
     const { error } = await sb.from("scores").insert({
-      name: clean,
-      score: finalScore,
-      month_key: monthKey()
+      name: cleanName,
+      score: Math.floor(state.score),
+      month_key: getMonthKeyUTC(),
     });
 
-    if (error) alert("Errore invio punteggio. Riprova.");
-    else alert("Punteggio inviato! 🏆");
+    submitBtn.disabled = false;
+    retryBtn.disabled = false;
+
+    if (error) {
+      LOG("submitScore error", error);
+      if (error.code === "42501") {
+        modalError.textContent = "Permessi negati: controlla RLS/policies.";
+      } else {
+        modalError.textContent = `Errore invio: ${error.message}`;
+      }
+      return;
+    }
+
+    lastSubmitAt = now;
+    modalError.textContent = "Punteggio inviato! Classifica aggiornata.";
+    await loadLeaderboard();
   }
 
-  function gameOver(){
-    running = false;
-    submitScore(score).catch(()=>{});
+  function openGameOverModal() {
+    finalScoreEl.textContent = safeScoreText(state.score);
+    modalError.textContent = "";
+    gameOverModal.classList.add("show");
+    setTimeout(() => playerNameInput.focus(), 40);
   }
 
-  // --- draw helpers ---
-  function roundRect(x,y,w,h,r){
-    const rr = Math.min(r, w/2, h/2);
-    ctx.beginPath();
-    ctx.moveTo(x+rr,y);
-    ctx.arcTo(x+w,y,x+w,y+h,rr);
-    ctx.arcTo(x+w,y+h,x,y+h,rr);
-    ctx.arcTo(x,y+h,x,y,rr);
-    ctx.arcTo(x,y,x+w,y,rr);
-    ctx.closePath();
+  function closeGameOverModal() {
+    gameOverModal.classList.remove("show");
+    modalError.textContent = "";
+    submitBtn.disabled = false;
+    retryBtn.disabled = false;
   }
 
-  function update(dt){
-    t += dt;
-    speed += 22 * dt;
+  function triggerGameOver() {
+    if (state.gameOver) return;
+    state.running = false;
+    state.gameOver = true;
+    state.screenFlash = 0.22;
+    openGameOverModal();
+  }
 
-    player.coyoteT = Math.max(0, player.coyoteT - dt);
-    player.jumpBufT = Math.max(0, player.jumpBufT - dt);
+  function update(dt) {
+    if (!state.running) {
+      state.screenFlash = Math.max(0, state.screenFlash - dt);
+      return;
+    }
+
+    state.elapsed += dt;
+    state.speed += 15 * dt;
+
+    state.parallaxA = (state.parallaxA + state.speed * 0.08 * dt) % W();
+    state.parallaxB = (state.parallaxB + state.speed * 0.15 * dt) % W();
+
+    player.coyoteLeft = Math.max(0, player.coyoteLeft - dt);
+    player.jumpBufferLeft = Math.max(0, player.jumpBufferLeft - dt);
 
-    // physics
     player.vy += GRAVITY * dt;
     player.y += player.vy * dt;
 
-    const gy = groundY();
-    if (player.y >= gy){
-      player.y = gy;
+    const gY = groundY();
+    const wasGrounded = player.grounded;
+
+    if (player.y >= gY) {
+      player.y = gY;
+      if (!player.grounded && Math.abs(player.vy) > 200) {
+        createLandingParticles(player.x, gY + 1);
+      }
       player.vy = 0;
-      if (!player.onGround) player.coyoteT = COYOTE;
-      player.onGround = true;
+      player.grounded = true;
+      player.coyoteLeft = COYOTE_TIME;
     } else {
-      if (player.onGround) player.coyoteT = COYOTE;
-      player.onGround = false;
+      if (wasGrounded) player.coyoteLeft = COYOTE_TIME;
+      player.grounded = false;
     }
 
-    // buffered jump
-    if (player.jumpBufT > 0 && (player.onGround || player.coyoteT > 0)) {
-      doJump();
+    if (player.jumpBufferLeft > 0 && (player.grounded || player.coyoteLeft > 0)) {
+      executeJump();
     }
 
-    // spawn
-    spawnT -= dt;
-    if (spawnT <= 0){
-      spawnObstacle();
-      spawnT = Math.max(0.62, 1.08 - t * 0.02) + Math.random() * 0.18;
-    }
+    player.squash = Math.max(0, player.squash - dt * 2.2);
 
-    // move obstacles
-    for (const o of obstacles) o.x -= speed * dt;
-    obstacles = obstacles.filter(o => o.x + o.w > -70);
+    nextSpawnIn -= dt;
+    if (nextSpawnIn <= 0) {
+      createObstacle();
+      const base = Math.max(0.58, 1.1 - state.elapsed * 0.018);
+      const jitter = 0.14 + Math.random() * 0.23;
+      nextSpawnIn = base + jitter;
+    }
 
-    // score (chiaro e soddisfacente)
-    score = Math.floor((t * 12) + (speed - 340) * 0.35);
-    scoreEl.textContent = String(score);
+    for (let i = obstacles.length - 1; i >= 0; i -= 1) {
+      obstacles[i].x -= state.speed * dt;
+      if (obstacles[i].x + obstacles[i].width < -40) obstacles.splice(i, 1);
+    }
 
-    // collisions
-    const px = player.x - player.w/2;
-    const py = player.y - player.h;
+    for (let i = particles.length - 1; i >= 0; i -= 1) {
+      const p = particles[i];
+      p.age += dt;
+      p.x += p.vx * dt;
+      p.y += p.vy * dt;
+      p.vy += 440 * dt;
+      if (p.age >= p.life) particles.splice(i, 1);
+    }
 
-    for (const o of obstacles){
-      const ox = o.x;
-      const oy = gy - o.h;
-      if (rectsOverlap(px+4, py+6, player.w-8, player.h-6, ox, oy, o.w, o.h)){
-        gameOver();
+    state.score = Math.floor(state.elapsed * 16 + (state.speed - 265) * 0.42);
+    scoreValueEl.textContent = safeScoreText(state.score);
+
+    const playerBox = {
+      x: player.x - player.width * 0.5 + 3,
+      y: player.y - player.height + 3,
+      width: player.width - 6,
+      height: player.height - 5,
+    };
+
+    for (const obstacle of obstacles) {
+      const obstacleBox = {
+        x: obstacle.x,
+        y: gY - obstacle.height,
+        width: obstacle.width,
+        height: obstacle.height,
+      };
+      if (overlaps(playerBox, obstacleBox)) {
+        triggerGameOver();
         break;
       }
     }
-  }
 
-  function draw(){
-    const w = W(), h = H();
-    const gy = groundY();
-
-    // background gradient
-    const grad = ctx.createLinearGradient(0,0,0,h);
-    grad.addColorStop(0,"#ffffff");
-    grad.addColorStop(1,"#f6f2ea");
-    ctx.fillStyle = grad;
-    ctx.fillRect(0,0,w,h);
+    state.screenFlash = Math.max(0, state.screenFlash - dt * 1.4);
+  }
 
-    // ground line
-    ctx.strokeStyle = "rgba(0,0,0,0.12)";
-    ctx.lineWidth = 2;
-    ctx.beginPath();
-    ctx.moveTo(0, gy + 18);
-    ctx.lineTo(w, gy + 18);
-    ctx.stroke();
-
-    // chequer band
-    const cell = 18, bandY = gy + 26;
-    for (let i=0; i<Math.ceil(w/cell); i++){
-      ctx.fillStyle = (i%2===0) ? "rgba(0,0,0,0.06)" : "rgba(176,141,87,0.10)";
-      ctx.fillRect(i*cell, bandY, cell, 10);
+  function drawBackground(w, h, gY) {
+    const sky = ctx.createLinearGradient(0, 0, 0, h);
+    sky.addColorStop(0, "#fffdf9");
+    sky.addColorStop(1, "#efe4cf");
+    ctx.fillStyle = sky;
+    ctx.fillRect(0, 0, w, h);
+
+    ctx.fillStyle = "rgba(183, 144, 72, 0.12)";
+    for (let i = -1; i < 3; i += 1) {
+      const x = i * w * 0.5 - state.parallaxA;
+      ctx.fillRect(x, gY - 170, w * 0.22, 130);
     }
 
-    // obstacles: stylized pawn
-    for (const o of obstacles){
-      const x = o.x;
-      const y = gy - o.h;
-
-      // shadow
-      ctx.fillStyle = "rgba(0,0,0,0.10)";
+    ctx.fillStyle = "rgba(24, 23, 21, 0.05)";
+    for (let i = -1; i < 4; i += 1) {
+      const x = i * w * 0.33 - state.parallaxB;
       ctx.beginPath();
-      ctx.ellipse(x + o.w/2, gy + 16, o.w*0.95, 5, 0, 0, Math.PI*2);
+      ctx.ellipse(x + 60, gY - 40, 70, 20, 0, 0, Math.PI * 2);
       ctx.fill();
+    }
 
-      // body + head
-      ctx.fillStyle = "#1a1a1a";
-      ctx.fillRect(x, y + o.h*0.38, o.w, o.h*0.62);
-      ctx.beginPath();
-      ctx.arc(x + o.w/2, y + o.h*0.20, o.w*0.38, 0, Math.PI*2);
-      ctx.fill();
+    ctx.fillStyle = "rgba(23, 22, 20, 0.12)";
+    ctx.fillRect(0, gY + 8, w, 4);
 
-      // gold highlight
-      ctx.fillStyle = "rgba(176,141,87,0.55)";
-      ctx.fillRect(x+2, y + o.h*0.55, 3, o.h*0.30);
+    const cell = 14;
+    const bandY = gY + 14;
+    for (let i = 0; i < Math.ceil(w / cell) + 1; i += 1) {
+      ctx.fillStyle = i % 2 === 0 ? "rgba(12, 12, 12, 0.1)" : "rgba(183, 144, 72, 0.22)";
+      ctx.fillRect(i * cell - (state.parallaxB % cell), bandY, cell, 12);
     }
+  }
+
+  function drawPawn(x, y, w, h, tint = 0) {
+    ctx.fillStyle = `rgba(17, 17, 17, ${0.96 - tint})`;
+
+    ctx.beginPath();
+    ctx.ellipse(x + w * 0.5, y + h * 0.15, w * 0.22, h * 0.11, 0, 0, Math.PI * 2);
+    ctx.fill();
+
+    ctx.beginPath();
+    ctx.moveTo(x + w * 0.2, y + h * 0.95);
+    ctx.lineTo(x + w * 0.8, y + h * 0.95);
+    ctx.lineTo(x + w * 0.68, y + h * 0.3);
+    ctx.lineTo(x + w * 0.32, y + h * 0.3);
+    ctx.closePath();
+    ctx.fill();
 
-    // player: simple king silhouette
-    const px = player.x;
-    const py = player.y;
+    ctx.fillStyle = "rgba(183, 144, 72, 0.55)";
+    ctx.fillRect(x + w * 0.18, y + h * 0.68, 3, h * 0.24);
 
-    // shadow
     ctx.fillStyle = "rgba(0,0,0,0.12)";
     ctx.beginPath();
-    ctx.ellipse(px, gy + 16, 18, 5, 0, 0, Math.PI*2);
+    ctx.ellipse(x + w * 0.5, groundY() + 14, w * 0.72, 5.5, 0, 0, Math.PI * 2);
     ctx.fill();
+  }
 
-    // body
-    ctx.fillStyle = "#0f0f0f";
-    roundRect(px - 13, py - 38, 26, 34, 10);
+  function drawPlayer(px, py) {
+    const stretch = player.grounded ? 1 - player.squash * 0.2 : 1 + player.squash * 0.28;
+    const squash = player.grounded ? 1 + player.squash * 0.24 : 1 - player.squash * 0.15;
+    const w = player.width * squash;
+    const h = player.height * stretch;
+
+    ctx.fillStyle = "rgba(0,0,0,0.13)";
+    ctx.beginPath();
+    ctx.ellipse(px, groundY() + 14, 18, 5.8, 0, 0, Math.PI * 2);
     ctx.fill();
 
-    // crown base
-    roundRect(px - 14, py - 46, 28, 10, 6);
+    ctx.save();
+    ctx.translate(px - w * 0.5, py - h);
+
+    ctx.fillStyle = "#0f0f0f";
+    roundRect(0, h * 0.2, w, h * 0.8, 8);
     ctx.fill();
 
-    // crown points (gold)
-    ctx.fillStyle = "rgba(176,141,87,0.95)";
+    ctx.fillStyle = "#1a1a1a";
+    ctx.fillRect(w * 0.45, h * 0.03, w * 0.1, h * 0.23);
+    ctx.fillRect(w * 0.22, h * 0.1, w * 0.56, h * 0.08);
+
+    ctx.fillStyle = "rgba(183, 144, 72, 0.8)";
+    ctx.fillRect(w * 0.18, h * 0.54, 3, h * 0.24);
+
+    ctx.restore();
+  }
+
+  function drawParticles() {
+    for (const p of particles) {
+      const alpha = Math.max(0, 1 - p.age / p.life);
+      ctx.fillStyle = `rgba(110, 94, 63, ${alpha * 0.5})`;
+      ctx.fillRect(p.x, p.y, 3, 3);
+    }
+  }
+
+  function drawOverlayFlash(w, h) {
+    if (state.screenFlash <= 0) return;
+    const alpha = Math.min(0.2, state.screenFlash);
+    ctx.fillStyle = `rgba(220, 75, 75, ${alpha})`;
+    ctx.fillRect(0, 0, w, h);
+  }
+
+  function roundRect(x, y, width, height, radius) {
+    const r = Math.min(radius, width * 0.5, height * 0.5);
     ctx.beginPath();
-    ctx.moveTo(px-10, py-46); ctx.lineTo(px-6, py-54); ctx.lineTo(px-2, py-46);
-    ctx.lineTo(px+2, py-54); ctx.lineTo(px+6, py-46);
-    ctx.lineTo(px+10, py-54); ctx.lineTo(px+14, py-46);
+    ctx.moveTo(x + r, y);
+    ctx.arcTo(x + width, y, x + width, y + height, r);
+    ctx.arcTo(x + width, y + height, x, y + height, r);
+    ctx.arcTo(x, y + height, x, y, r);
+    ctx.arcTo(x, y, x + width, y, r);
     ctx.closePath();
-    ctx.fill();
+  }
+
+  function draw() {
+    const w = W();
+    const h = H();
+    const gY = groundY();
 
-    // overlay game over
-    if (!running){
-      ctx.fillStyle = "rgba(255,255,255,0.75)";
-      ctx.fillRect(0,0,w,h);
-      ctx.fillStyle = "#111";
-      ctx.font = "900 26px system-ui, -apple-system, Segoe UI, Roboto, Arial";
-      ctx.fillText("Game Over", 18, 56);
-      ctx.font = "600 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
-      ctx.fillStyle = "rgba(0,0,0,0.65)";
-      ctx.fillText("Tap o Ricomincia per riprovare", 18, 80);
+    drawBackground(w, h, gY);
+
+    for (const obstacle of obstacles) {
+      drawPawn(obstacle.x, gY - obstacle.height, obstacle.width, obstacle.height, obstacle.tint);
     }
+
+    drawParticles();
+    drawPlayer(player.x, player.y);
+    drawOverlayFlash(w, h);
   }
 
-  function loop(now){
-    const dt = Math.min(0.033, (now - lastT)/1000);
-    lastT = now;
-    if (running) update(dt);
+  function frame(now) {
+    const dt = Math.min(0.033, (now - state.lastFrameTime) / 1000);
+    state.lastFrameTime = now;
+    update(dt);
     draw();
-    requestAnimationFrame(loop);
+    requestAnimationFrame(frame);
   }
 
-  // input
-  canvas.addEventListener("pointerdown", requestJump);
-  restartBtn.addEventListener("click", reset);
+  function bindEvents() {
+    const jumpHandler = (event) => {
+      if (event.target && event.target.closest("button, input")) return;
+      queueJump();
+    };
+
+    canvas.addEventListener("pointerdown", jumpHandler);
+    document.addEventListener("pointerdown", jumpHandler);
+
+    window.addEventListener("keydown", (event) => {
+      if (event.code === "Space" || event.code === "ArrowUp") {
+        event.preventDefault();
+        queueJump();
+      }
+    });
+
+    restartBtn.addEventListener("click", () => {
+      resetGame();
+    });
+
+    retryBtn.addEventListener("click", () => {
+      resetGame();
+    });
+
+    submitBtn.addEventListener("click", () => {
+      submitScore().catch((error) => {
+        LOG("submit button failure", error);
+        modalError.textContent = `Errore invio: ${error.message || "imprevisto"}`;
+      });
+    });
+
+    gameOverModal.addEventListener("pointerdown", (event) => {
+      if (event.target === gameOverModal) {
+        closeGameOverModal();
+      }
+    });
+  }
 
-  // start
-  resize();
-  reset();
-  requestAnimationFrame((t0)=>{ lastT = t0; requestAnimationFrame(loop); });
+  bindEvents();
+  resetGame();
+  loadLeaderboard().catch((error) => {
+    LOG("Initial leaderboard error", error);
+    leaderboardStatus.textContent = "Errore iniziale leaderboard.";
+  });
+  subscribeRealtime();
+  requestAnimationFrame(frame);
 })();
 
EOF
)
