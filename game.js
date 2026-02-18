(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  // canvas retina
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);

  const scoreEl = document.getElementById("score");
  const restartBtn = document.getElementById("restart");

  // Supabase client già creato in index.html
  const supabase = window.supabaseClient || window.supabase; // fallback (non usato)
  // In realtà usiamo la variabile globale "supabase" definita in index.html:
  const db = window.supabase ? null : null; // noop

  // Recupera il client creato in index.html
  // (è "supabase" nello scope globale della pagina)
  const sb = window.supabaseClientGlobal || window.supabaseInstance || window.supabaseClient || window.supabase;
  // più robusto: prendiamo quello globale nominato "supabase" se esiste
  const supa = (typeof window.supabase !== "undefined" && window.supabase.from) ? window.supabase : (typeof supabase !== "undefined" && supabase.from ? supabase : null);
  // ma nel nostro index.html si chiama "supabase" (const supabase = ...), quindi è globale? no: è nello script.
  // Soluzione: esponiamolo esplicitamente:
  // (se non c'è, non blocchiamo il gioco: il submit fallirà)
  // Nota: per semplicità, useremo window.__sb se presente.
  // Vedrai sotto: in start() proviamo a leggere window.__sb.
  
  function monthKey() {
    return new Date().toISOString().slice(0,7);
  }

  // Stato gioco
  let running = false;
  let lastT = 0;
  let time = 0;
  let speed = 220; // px/s
  let score = 0;

  const groundY = 260;
  const player = {
    x: 70,
    y: groundY,
    vy: 0,
    r: 14,
    onGround: true,
  };

  let obstacles = [];
  let spawnTimer = 0;

  function reset() {
    running = true;
    lastT = performance.now();
    time = 0;
    speed = 220;
    score = 0;
    scoreEl.textContent = "0";
    player.y = groundY;
    player.vy = 0;
    player.onGround = true;
    obstacles = [];
    spawnTimer = 0;
  }

  function jump() {
    if (!running) return;
    if (player.onGround) {
      player.vy = -520;
      player.onGround = false;
    }
  }

  function spawnObstacle() {
    // “pedone” come rettangolo con testina
    const w = 18;
    const h = 34;
    const gap = 320 + Math.random() * 260; // distanza variabile
    const lastX = obstacles.length ? obstacles[obstacles.length - 1].x : 520;
    obstacles.push({
      x: Math.max(520, lastX + gap),
      w, h,
    });
  }

  function collideCircleRect(cx, cy, r, rx, ry, rw, rh) {
    const x = Math.max(rx, Math.min(cx, rx + rw));
    const y = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - x;
    const dy = cy - y;
    return (dx*dx + dy*dy) <= r*r;
  }

  function gameOver() {
    running = false;
    draw(true);
    submitScore(score);
  }

  async function submitScore(finalScore) {
    // Chiedi nome
    const name = prompt("Inserisci il tuo nome per la classifica (max 16 caratteri):");
    if (!name) return;

    const clean = name.trim().slice(0, 16);
    if (!clean) return;

    // Qui serve il client Supabase. In index.html è "const supabase = ..."
    // Per renderlo accessibile qui, aggiungi 1 riga in index.html:
    // window.__sb = supabase;
    const sb = window.__sb;
    if (!sb) {
      alert("Leaderboard non configurata (manca Supabase).");
      return;
    }

    const { error } = await sb.from("scores").insert({
      name: clean,
      score: finalScore,
      month_key: monthKey(),
    });

    if (error) {
      alert("Errore invio punteggio. Riprova.");
    } else {
      alert("Punteggio inviato! 🏆");
    }
  }

  function update(dt) {
    time += dt;

    // accelera piano
    speed += 14 * dt;

    // gravità
    player.vy += 1200 * dt;
    player.y += player.vy * dt;

    if (player.y >= groundY) {
      player.y = groundY;
      player.vy = 0;
      player.onGround = true;
    }

    // spawn ostacoli
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnObstacle();
      spawnTimer = Math.max(0.8, 1.35 - time * 0.01); // più frequenti col tempo
    }

    // muovi ostacoli
    for (const o of obstacles) {
      o.x -= speed * dt;
    }
    // rimuovi fuori schermo
    obstacles = obstacles.filter(o => o.x + o.w > -40);

    // punteggio = tempo * fattore
    score = Math.floor(time * 10);
    scoreEl.textContent = String(score);

    // collisione
    for (const o of obstacles) {
      const rx = o.x;
      const ry = groundY - o.h;
      if (collideCircleRect(player.x, player.y, player.r, rx, ry, o.w, o.h)) {
        gameOver();
        break;
      }
    }
  }

  function draw(over=false) {
    // background
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // “pista”
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#0f0f0f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // linea terreno
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(0, groundY + 16, canvas.width, 3);

    // player (scacco)
    // corpo
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    ctx.fill();
    // corona semplice
    ctx.fillStyle = "#000000";
    ctx.fillRect(player.x - 8, player.y - 18, 16, 4);

    // ostacoli (pedoni)
    for (const o of obstacles) {
      const x = o.x;
      const y = groundY - o.h;
      ctx.fillStyle = "#d9d9d9";
      // base
      ctx.fillRect(x, y + 18, o.w, 16);
      // testa
      ctx.beginPath();
      ctx.arc(x + o.w/2, y + 10, 7, 0, Math.PI*2);
      ctx.fill();
    }

    if (over) {
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fff";
      ctx.font = "700 20px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillText("Game Over", 22, 50);
      ctx.font = "400 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillText("Premi Ricomincia o fai tap per ripartire", 22, 74);
    }
  }

  function loop(t) {
    const dt = Math.min(0.033, (t - lastT) / 1000);
    lastT = t;

    if (running) update(dt);
    draw(!running);

    requestAnimationFrame(loop);
  }

  // input: tap/click
  canvas.addEventListener("pointerdown", () => {
    if (!running) reset();
    else jump();
  });

  restartBtn.addEventListener("click", reset);

  // start
  resize();
  reset();
  requestAnimationFrame(loop);
})();
