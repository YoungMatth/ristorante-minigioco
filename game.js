(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const restartBtn = document.getElementById("restart");

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

  // Feel
  const GRAVITY = 2200;
  const JUMP_V = -720;

  let running = true;
  let lastT = 0;
  let t = 0;
  let speed = 320;
  let score = 0;

  const groundPad = 58;
  const groundY = () => H() - groundPad;

  const player = { x: 90, y: 0, vy: 0, w: 26, h: 38, onGround: true };
  let obstacles = [];
  let spawnT = 0.6;

  function monthKey(){ return new Date().toISOString().slice(0,7); }

  function reset(){
    running = true;
    lastT = performance.now();
    t = 0;
    speed = 320;
    score = 0;
    obstacles = [];
    spawnT = 0.6;
    player.y = groundY();
    player.vy = 0;
    player.onGround = true;
    scoreEl.textContent = "0";
  }

  function jump(){
    if (!running) { reset(); return; }
    if (player.onGround){
      player.vy = JUMP_V;
      player.onGround = false;
    }
  }

  function spawnObstacle(){
    obstacles.push({
      x: W() + 40,
      w: 20 + Math.random()*10,
      h: 34 + Math.random()*12
    });
  }

  function rects(ax, ay, aw, ah, bx, by, bw, bh){
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  async function submitScore(finalScore){
    // 1) prendo client se già esiste
    let sb = window.__sb;

    // 2) fallback: ricreo client
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

  function update(dt){
    t += dt;
    speed += 20 * dt;

    // physics
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;

    const gy = groundY();
    if (player.y >= gy){
      player.y = gy;
      player.vy = 0;
      player.onGround = true;
    }

    // spawn
    spawnT -= dt;
    if (spawnT <= 0){
      spawnObstacle();
      spawnT = Math.max(0.65, 1.05 - t*0.02) + Math.random()*0.18;
    }

    // move
    for (const o of obstacles) o.x -= speed * dt;
    obstacles = obstacles.filter(o => o.x + o.w > -60);

    // score
    score = Math.floor((t * 12) + (speed - 320) * 0.35);
    scoreEl.textContent = String(score);

    // collision
    const px = player.x - player.w/2;
    const py = player.y - player.h;
    for (const o of obstacles){
      const ox = o.x;
      const oy = gy - o.h;
      if (rects(px+4, py+6, player.w-8, player.h-6, ox, oy, o.w, o.h)){
        gameOver();
        break;
      }
    }
  }

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

  function draw(){
    const w = W(), h = H();
    const gy = groundY();

    // bg
    const grad = ctx.createLinearGradient(0,0,0,h);
    grad.addColorStop(0,"#ffffff");
    grad.addColorStop(1,"#f6f2ea");
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,w,h);

    // ground
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, gy + 18);
    ctx.lineTo(w, gy + 18);
    ctx.stroke();

    // obstacles
    for (const o of obstacles){
      const x = o.x;
      const y = gy - o.h;
      ctx.fillStyle = "rgba(0,0,0,0.10)";
      ctx.beginPath();
      ctx.ellipse(x + o.w/2, gy + 16, o.w*0.9, 5, 0, 0, Math.PI*2);
      ctx.fill();

      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(x, y + o.h*0.38, o.w, o.h*0.62);
      ctx.beginPath();
      ctx.arc(x + o.w/2, y + o.h*0.20, o.w*0.38, 0, Math.PI*2);
      ctx.fill();
    }

    // player (king-ish)
    const px = player.x;
    const py = player.y;

    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(px, gy + 16, 18, 5, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = "#0f0f0f";
    roundRect(px-13, py-38, 26, 34, 10); ctx.fill();
    roundRect(px-14, py-46, 28, 10, 6); ctx.fill();

    ctx.fillStyle = "rgba(176,141,87,0.95)";
    ctx.beginPath();
    ctx.moveTo(px-10, py-46); ctx.lineTo(px-6, py-54); ctx.lineTo(px-2, py-46);
    ctx.lineTo(px+2, py-54); ctx.lineTo(px+6, py-46);
    ctx.lineTo(px+10, py-54); ctx.lineTo(px+14, py-46);
    ctx.closePath();
    ctx.fill();

    if (!running){
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillRect(0,0,w,h);
      ctx.fillStyle = "#111";
      ctx.font = "900 26px system-ui";
      ctx.fillText("Game Over", 18, 56);
      ctx.font = "600 14px system-ui";
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

  canvas.addEventListener("pointerdown", jump);
  restartBtn.addEventListener("click", reset);

  resize();
  reset();
  requestAnimationFrame((t0)=>{ lastT=t0; requestAnimationFrame(loop); });
})();
