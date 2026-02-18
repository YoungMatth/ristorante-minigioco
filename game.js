(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const restartBtn = document.getElementById("restart");

  // === retina resize ===
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);

  const W = () => canvas.getBoundingClientRect().width;
  const H = () => canvas.getBoundingClientRect().height;

  // === feel (salto più "tight") ===
  const GRAVITY = 2300;
  const JUMP_V = -720;
  const COYOTE = 0.075;
  const JUMP_BUFFER = 0.09;

  let running = true;
  let lastT = 0;
  let t = 0;
  let speed = 340;
  let score = 0;

  const groundPad = 62;
  const groundY = () => H() - groundPad;

  const player = {
    x: 92,
    y: 0,
    vy: 0,
    w: 26,
    h: 40,
    onGround: true,
    coyoteT: 0,
    jumpBufT: 0,
  };

  let obstacles = [];
  let spawnT = 0.7;

  function monthKey(){ return new Date().toISOString().slice(0,7); }

  function reset() {
    running = true;
    lastT = performance.now();
    t = 0;
    speed = 340;
    score = 0;
    obstacles = [];
    spawnT = 0.7;

    player.y = groundY();
    player.vy = 0;
    player.onGround = true;
    player.coyoteT = 0;
    player.jumpBufT = 0;

    scoreEl.textContent = "0";
  }

  function requestJump(){
    if (!running) { reset(); return; }
    player.jumpBufT = JUMP_BUFFER;
  }

  function doJump(){
    player.vy = JUMP_V;
    player.onGround = false;
    player.coyoteT = 0;
    player.jumpBufT = 0;
  }

  function spawnObstacle(){
    obstacles.push({
      x: W() + 40,
      w: 20 + Math.random() * 10,
      h: 34 + Math.random() * 12
    });
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh){
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  async function submitScore(finalScore){
    // 1) usa client già esposto da index.html
    let sb = window.__sb;

    // 2) fallback: ricrea client se window.__sb non c’è
    if (!sb && window.supabase && window.__SUPABASE_URL && window.__SUPABASE_KEY) {
      try {
        sb = window.supabase.createClient(window.__SUPABASE_URL, window.__SUPABASE_KEY);
        window.__sb = sb;
      } catch (e) {}
    }

    if (!sb) {
      alert("Leaderboard non configurata (Supabase non inizializzato).");
      return;
    }

    const name = prompt("Inserisci il tuo nome (max 16):");
    if (!name) return;
    const clean = name.trim().slice(0,16);
    if (!clean) return;

    const { error } = await sb.from("scores").insert({
      name: clean,
      score: finalScore,
      month_key: monthKey()
    });

    if (error) alert("Errore invio punteggio. Riprova.");
    else alert("Punteggio inviato! 🏆");
  }

  function gameOver(){
    running = false;
    submitScore(score).catch(()=>{});
  }

  // --- draw helpers ---
  function roundRect(x,y,w,h,r){
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);
    ctx.arcTo(x+w,y,x+w,y+h,rr);
    ctx.arcTo(x+w,y+h,x,y+h,rr);
    ctx.arcTo(x,y+h,x,y,rr);
    ctx.arcTo(x,y,x+w,y,rr);
    ctx.closePath();
  }

  function update(dt){
    t += dt;
    speed += 22 * dt;

    player.coyoteT = Math.max(0, player.coyoteT - dt);
    player.jumpBufT = Math.max(0, player.jumpBufT - dt);

    // physics
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;

    const gy = groundY();
    if (player.y >= gy){
      player.y = gy;
      player.vy = 0;
      if (!player.onGround) player.coyoteT = COYOTE;
      player.onGround = true;
    } else {
      if (player.onGround) player.coyoteT = COYOTE;
      player.onGround = false;
    }

    // buffered jump
    if (player.jumpBufT > 0 && (player.onGround || player.coyoteT > 0)) {
      doJump();
    }

    // spawn
    spawnT -= dt;
    if (spawnT <= 0){
      spawnObstacle();
      spawnT = Math.max(0.62, 1.08 - t * 0.02) + Math.random() * 0.18;
    }

    // move obstacles
    for (const o of obstacles) o.x -= speed * dt;
    obstacles = obstacles.filter(o => o.x + o.w > -70);

    // score (chiaro e soddisfacente)
    score = Math.floor((t * 12) + (speed - 340) * 0.35);
    scoreEl.textContent = String(score);

    // collisions
    const px = player.x - player.w/2;
    const py = player.y - player.h;

    for (const o of obstacles){
      const ox = o.x;
      const oy = gy - o.h;
      if (rectsOverlap(px+4, py+6, player.w-8, player.h-6, ox, oy, o.w, o.h)){
        gameOver();
        break;
      }
    }
  }

  function draw(){
    const w = W(), h = H();
    const gy = groundY();

    // background gradient
    const grad = ctx.createLinearGradient(0,0,0,h);
    grad.addColorStop(0,"#ffffff");
    grad.addColorStop(1,"#f6f2ea");
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,w,h);

    // ground line
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, gy + 18);
    ctx.lineTo(w, gy + 18);
    ctx.stroke();

    // chequer band
    const cell = 18, bandY = gy + 26;
    for (let i=0; i<Math.ceil(w/cell); i++){
      ctx.fillStyle = (i%2===0) ? "rgba(0,0,0,0.06)" : "rgba(176,141,87,0.10)";
      ctx.fillRect(i*cell, bandY, cell, 10);
    }

    // obstacles: stylized pawn
    for (const o of obstacles){
      const x = o.x;
      const y = gy - o.h;

      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.10)";
      ctx.beginPath();
      ctx.ellipse(x + o.w/2, gy + 16, o.w*0.95, 5, 0, 0, Math.PI*2);
      ctx.fill();

      // body + head
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(x, y + o.h*0.38, o.w, o.h*0.62);
      ctx.beginPath();
      ctx.arc(x + o.w/2, y + o.h*0.20, o.w*0.38, 0, Math.PI*2);
      ctx.fill();

      // gold highlight
      ctx.fillStyle = "rgba(176,141,87,0.55)";
      ctx.fillRect(x+2, y + o.h*0.55, 3, o.h*0.30);
    }

    // player: simple king silhouette
    const px = player.x;
    const py = player.y;

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(px, gy + 16, 18, 5, 0, 0, Math.PI*2);
    ctx.fill();

    // body
    ctx.fillStyle = "#0f0f0f";
    roundRect(px - 13, py - 38, 26, 34, 10);
    ctx.fill();

    // crown base
    roundRect(px - 14, py - 46, 28, 10, 6);
    ctx.fill();

    // crown points (gold)
    ctx.fillStyle = "rgba(176,141,87,0.95)";
    ctx.beginPath();
    ctx.moveTo(px-10, py-46); ctx.lineTo(px-6, py-54); ctx.lineTo(px-2, py-46);
    ctx.lineTo(px+2, py-54); ctx.lineTo(px+6, py-46);
    ctx.lineTo(px+10, py-54); ctx.lineTo(px+14, py-46);
    ctx.closePath();
    ctx.fill();

    // overlay game over
    if (!running){
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillRect(0,0,w,h);
      ctx.fillStyle = "#111";
      ctx.font = "900 26px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillText("Game Over", 18, 56);
      ctx.font = "600 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillText("Tap o Ricomincia per riprovare", 18, 80);
    }
  }

  function loop(now){
    const dt = Math.min(0.033, (now - lastT)/1000);
    lastT = now;
    if (running) update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // input
  canvas.addEventListener("pointerdown", requestJump);
  restartBtn.addEventListener("click", reset);

  // start
  resize();
  reset();
  requestAnimationFrame((t0)=>{ lastT = t0; requestAnimationFrame(loop); });
})();
