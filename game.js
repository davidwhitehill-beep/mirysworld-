
/*
  Miry’s World Swipe
  - Mobile-friendly HTML5 Canvas lane-swipe game
  - No external assets needed; everything is drawn procedurally
*/

(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  // HUD
  const elCity = document.getElementById("city");
  const elScore = document.getElementById("score");
  const elLives = document.getElementById("lives");
  const overlay = document.getElementById("overlay");
  const title = document.getElementById("title");
  const subtitle = document.getElementById("subtitle");
  const startBtn = document.getElementById("startBtn");
  const muteBtn = document.getElementById("muteBtn");

  // Toast
  const toastWrap = document.getElementById("toast");
  let toastTimer = 0;
  function toast(msg){
    toastWrap.innerHTML = `<div class="show">${msg}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>{ toastWrap.innerHTML = ""; }, 1400);
  }

  // Simple tiny sound synth (no files)
  let muted = false;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;
  function ensureAudio(){
    if (muted) return;
    if (!audioCtx) audioCtx = new AudioCtx();
  }
  function beep(freq=440, dur=0.08, type="square", vol=0.06){
    if (muted) return;
    ensureAudio();
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t0);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.stop(t0 + dur);
  }
  function chord(){
    beep(523.25, 0.10, "triangle", 0.06);
    setTimeout(()=>beep(659.25, 0.10, "triangle", 0.05), 20);
    setTimeout(()=>beep(783.99, 0.12, "triangle", 0.045), 40);
  }

  // Game config
  const lanes = [-170, 0, 170]; // center offsets
  const roadX = W/2;
  const roadW = 520;

  const CITY_STOPS = [
    { name:"Los Angeles", blurb:"Home base! Avoid traffic cones and collect 🌴 souvenirs.", theme:"la" },
    { name:"Milan, Italy", blurb:"Fashion sprint! Dodge 👜 handbags flying off scooters.", theme:"milan" },
    { name:"Nice, France", blurb:"Train time! Avoid runaway 🧳 suitcases and collect 🥐.", theme:"nice" },
    { name:"Haifa, Israel", blurb:"Bar mitzvah mode for Reuben! Collect 🎉 confetti & avoid the DJ’s giant speakers.", theme:"haifa" },
    { name:"Tel Aviv", blurb:"Old friends! Collect 🕶️ and dodge 🛴 scooters.", theme:"tlv" },
    { name:"India", blurb:"Eat everything! Collect 🍛, dodge 🔥 spicy peppers.", theme:"india" },
    { name:"Bangkok, Thailand", blurb:"Temple awe! Collect 🛕 charms, dodge 🐒 cheeky monkeys.", theme:"bkk" },
    { name:"Sunny Los Angeles", blurb:"Back home! Final dash—collect 🏁 flags and don’t drop the suitcase.", theme:"la2" },
  ];

  // Entities
  const rand = (a,b)=>a+Math.random()*(b-a);
  const pick = (arr)=>arr[(Math.random()*arr.length)|0];

  const player = {
    lane: 1,
    y: H*0.78,
    x: roadX + lanes[1],
    vx: 0,
    boost: 0,        // invulnerable timer
    snack: 0,        // snack tokens
    wobble: 0
  };

  let score = 0;
  let lives = 3;
  let running = false;
  let t = 0;
  let last = 0;

  let levelIndex = 0;
  let levelTime = 0;
  const LEVEL_LEN = 22; // seconds
  let spawnTimer = 0;

  const things = []; // obstacles and collectibles
  const particles = [];

  // Sprite-less drawing helpers
  function roundedRect(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  function drawSky(theme){
    // background gradient varies by theme
    const g = ctx.createLinearGradient(0,0,0,H);
    if (theme==="la" || theme==="la2"){
      g.addColorStop(0, "#0b1a3a"); g.addColorStop(1, "#060913");
    } else if (theme==="milan"){
      g.addColorStop(0, "#1b0f2b"); g.addColorStop(1, "#060913");
    } else if (theme==="nice"){
      g.addColorStop(0, "#0b2a2a"); g.addColorStop(1, "#060913");
    } else if (theme==="haifa"){
      g.addColorStop(0, "#232a0d"); g.addColorStop(1, "#060913");
    } else if (theme==="tlv"){
      g.addColorStop(0, "#1a1030"); g.addColorStop(1, "#060913");
    } else if (theme==="india"){
      g.addColorStop(0, "#2a1308"); g.addColorStop(1, "#060913");
    } else if (theme==="bkk"){
      g.addColorStop(0, "#071f28"); g.addColorStop(1, "#060913");
    } else {
      g.addColorStop(0, "#0b1020"); g.addColorStop(1, "#060913");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);

    // Stars
    ctx.globalAlpha = 0.6;
    for (let i=0;i<70;i++){
      const sx = (Math.sin(i*999 + t*0.0002)+1)*0.5*W;
      const sy = (Math.cos(i*333 + t*0.00015)+1)*0.5*H*0.6;
      const s = 1 + (i%3);
      ctx.fillStyle = "rgba(233,237,255,0.75)";
      ctx.fillRect(sx, sy, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function drawSkyline(theme){
    // Simple silhouettes
    ctx.save();
    ctx.translate(0, H*0.46);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    const baseY = 240;

    function building(x,w,h){
      ctx.fillRect(x, baseY-h, w, h);
      ctx.globalAlpha = 0.25;
      for(let yy=baseY-h+12; yy<baseY-8; yy+=18){
        for(let xx=x+10; xx<x+w-10; xx+=18){
          ctx.fillStyle = "rgba(233,237,255,0.20)";
          ctx.fillRect(xx, yy, 6, 8);
        }
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
    }

    // Theme icons
    if (theme==="la" || theme==="la2"){
      building(40, 70, 210); building(140, 60, 160); building(220, 90, 240);
      building(350, 65, 180); building(440, 95, 260); building(560, 70, 200);
      // palm
      ctx.strokeStyle="rgba(124,247,197,0.45)";
      ctx.lineWidth=8; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(640,baseY); ctx.lineTo(630,baseY-110); ctx.stroke();
      ctx.lineWidth=5;
      for (let a=0;a<6;a++){
        ctx.beginPath();
        ctx.moveTo(630,baseY-110);
        ctx.lineTo(630+Math.cos(a)*55, baseY-110-30-Math.sin(a)*35);
        ctx.stroke();
      }
    } else if (theme==="milan"){
      building(60, 85, 230); building(170, 70, 170); building(270, 100, 255);
      building(410, 75, 190); building(505, 105, 280);
      // Duomo-ish triangles
      ctx.fillStyle="rgba(233,237,255,0.18)";
      for(let i=0;i<7;i++){
        ctx.beginPath();
        const x=110+i*55, y=baseY-250;
        ctx.moveTo(x,y+70); ctx.lineTo(x+28,y); ctx.lineTo(x+56,y+70); ctx.closePath();
        ctx.fill();
      }
    } else if (theme==="nice"){
      building(70, 80, 200); building(180, 70, 150); building(280, 95, 230);
      building(410, 80, 180); building(510, 110, 250);
      // waves
      ctx.strokeStyle="rgba(124,247,197,0.35)";
      ctx.lineWidth=6;
      for(let i=0;i<4;i++){
        ctx.beginPath();
        for(let x=0;x<=W;x+=40){
          const y = baseY-30 + i*22 + Math.sin((x+i*80+t*0.02)/90)*6;
          if (x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.stroke();
      }
    } else if (theme==="haifa"){
      building(70, 90, 220); building(190, 65, 160); building(270, 110, 260);
      building(420, 75, 200); building(520, 110, 275);
      // party banner
      ctx.fillStyle="rgba(255,92,122,0.35)";
      ctx.fillRect(0, baseY-285, W, 16);
      for(let i=0;i<16;i++){
        ctx.fillStyle = i%2? "rgba(124,247,197,0.45)" : "rgba(233,237,255,0.35)";
        ctx.beginPath();
        ctx.moveTo(20+i*44, baseY-270);
        ctx.lineTo(40+i*44, baseY-240);
        ctx.lineTo(60+i*44, baseY-270);
        ctx.closePath();
        ctx.fill();
      }
    } else if (theme==="tlv"){
      building(60, 90, 240); building(190, 70, 175); building(280, 110, 270);
      building(430, 80, 210); building(530, 110, 280);
      // sunglasses icon
      ctx.fillStyle="rgba(233,237,255,0.22)";
      roundedRect(280, baseY-280, 90, 30, 14); ctx.fill();
      roundedRect(375, baseY-280, 90, 30, 14); ctx.fill();
      ctx.fillRect(370, baseY-270, 8, 6);
    } else if (theme==="india"){
      building(40, 90, 230); building(160, 75, 170); building(260, 115, 260);
      building(420, 75, 200); building(520, 110, 275);
      // spice sun
      ctx.fillStyle="rgba(255,205,88,0.35)";
      ctx.beginPath();
      ctx.arc(610, baseY-260, 46, 0, Math.PI*2);
      ctx.fill();
    } else if (theme==="bkk"){
      building(60, 90, 210); building(190, 75, 165); building(275, 110, 250);
      building(420, 80, 190); building(520, 110, 270);
      // temple spires
      ctx.fillStyle="rgba(124,247,197,0.28)";
      for(let i=0;i<4;i++){
        const x=140+i*120, y=baseY-275;
        ctx.beginPath();
        ctx.moveTo(x, y+110);
        ctx.lineTo(x+24, y+55);
        ctx.lineTo(x+12, y);
        ctx.lineTo(x+48, y+55);
        ctx.lineTo(x+72, y+110);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawRoad(){
    // road slab
    ctx.save();
    const x0 = roadX - roadW/2;
    ctx.fillStyle = "rgba(233,237,255,0.06)";
    roundedRect(x0, H*0.52, roadW, H*0.50, 26);
    ctx.fill();

    // lane lines
    ctx.strokeStyle="rgba(233,237,255,0.12)";
    ctx.lineWidth = 6;
    for (let i=1;i<=2;i++){
      const lx = roadX + (i===1 ? -roadW/6 : roadW/6);
      ctx.setLineDash([24, 22]);
      ctx.beginPath();
      const scroll = (t*0.25) % 46;
      ctx.moveTo(lx, H*0.55 - scroll);
      ctx.lineTo(lx, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawPlayer(){
    ctx.save();
    // Smoothly slide to lane x
    const targetX = roadX + lanes[player.lane];
    player.x += (targetX - player.x) * 0.18;

    // wobble + boost glow
    player.wobble = Math.sin(t*0.02) * 6;

    const x = player.x, y = player.y + player.wobble;
    const s = 52;

    // boost aura
    if (player.boost > 0){
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = "rgba(124,247,197,0.35)";
      ctx.beginPath(); ctx.arc(x, y, 82, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Miry (simple character)
    // body
    ctx.fillStyle = "rgba(233,237,255,0.92)";
    roundedRect(x-s/2, y-s/2, s, s, 16); ctx.fill();

    // face
    ctx.fillStyle = "#0b1020";
    ctx.beginPath(); ctx.arc(x-12, y-6, 5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x+12, y-6, 5, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#0b1020";
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(x, y+12, 14, 0.1*Math.PI, 0.9*Math.PI); ctx.stroke();

    // hat
    ctx.fillStyle = "rgba(124,247,197,0.95)";
    roundedRect(x-34, y-54, 68, 22, 12); ctx.fill();
    roundedRect(x-20, y-74, 40, 26, 12); ctx.fill();

    // suitcase
    ctx.fillStyle = "rgba(255,92,122,0.9)";
    roundedRect(x+18, y+8, 34, 36, 10); ctx.fill();
    ctx.strokeStyle="rgba(233,237,255,0.6)";
    ctx.lineWidth=3;
    ctx.strokeRect(x+24, y+14, 22, 24);

    ctx.restore();
  }

  function spawnThing(){
    const theme = CITY_STOPS[levelIndex].theme;
    const lane = (Math.random()*3)|0;
    const x = roadX + lanes[lane];
    const y = H*0.50 - 80;

    // per-level flavor
    const packs = {
      la:   {obs:["cone","taxi"], good:["palm","film","snack"]},
      milan:{obs:["handbag","scooter"], good:["shoe","scarf","snack"]},
      nice: {obs:["suitcase","pigeon"], good:["croissant","train","snack"]},
      haifa:{obs:["speaker","confettiBomb"], good:["kippah","confetti","snack"]},
      tlv:  {obs:["scooter","beachball"], good:["sunglasses","friend","snack"]},
      india:{obs:["pepper","rickshaw"], good:["curry","chai","snack"]},
      bkk:  {obs:["monkey","tuk"], good:["temple","lotus","snack"]},
      la2:  {obs:["cone","taxi"], good:["flag","palm","snack"]},
    }[theme] || {obs:["cone"], good:["snack"]};

    const isGood = Math.random() < 0.55;
    const kind = isGood ? pick(packs.good) : pick(packs.obs);

    const speed = rand(420, 640) * (1 + levelIndex*0.06);
    const size = isGood ? rand(42, 58) : rand(50, 70);

    things.push({ x, y, lane, kind, isGood, speed, size });
  }

  function drawThing(o){
    ctx.save();
    const x=o.x, y=o.y, s=o.size;

    // soft shadow
    ctx.globalAlpha=0.25;
    ctx.fillStyle="rgba(0,0,0,0.6)";
    ctx.beginPath(); ctx.ellipse(x, y+28, s*0.45, s*0.18, 0, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;

    // icon-like shapes
    function badge(fill){
      ctx.fillStyle = fill;
      roundedRect(x-s/2, y-s/2, s, s, 14); ctx.fill();
      ctx.strokeStyle="rgba(233,237,255,0.18)";
      ctx.lineWidth=4; roundedRect(x-s/2, y-s/2, s, s, 14); ctx.stroke();
    }
    function emoji(e){
      ctx.font = `bold ${Math.floor(s*0.72)}px system-ui, Apple Color Emoji, Segoe UI Emoji`;
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillText(e, x, y+2);
    }

    if (o.isGood){
      badge("rgba(124,247,197,0.22)");
      const map = {
        palm:"🌴", film:"🎬", shoe:"👟", scarf:"🧣", croissant:"🥐", train:"🚆",
        kippah:"🧢", confetti:"🎉", sunglasses:"🕶️", friend:"🤝",
        curry:"🍛", chai:"🫖", temple:"🛕", lotus:"🪷",
        flag:"🏁", snack:"🍎"
      };
      emoji(map[o.kind] || "✨");
    } else {
      badge("rgba(255,92,122,0.22)");
      const map = {
        cone:"🚧", taxi:"🚕", handbag:"👜", scooter:"🛵",
        suitcase:"🧳", pigeon:"🕊️", speaker:"🔊", confettiBomb:"💥",
        beachball:"🏐", pepper:"🌶️", rickshaw:"🛺", monkey:"🐒",
        tuk:"🛺"
      };
      emoji(map[o.kind] || "💢");
    }

    ctx.restore();
  }

  function burst(x,y,good=true){
    const n = good ? 16 : 22;
    for (let i=0;i<n;i++){
      const a = rand(0, Math.PI*2);
      const sp = rand(120, 520);
      particles.push({
        x,y,
        vx: Math.cos(a)*sp,
        vy: Math.sin(a)*sp - rand(0,240),
        life: rand(0.35, 0.75),
        t: 0,
        good
      });
    }
  }

  function drawParticles(dt){
    for (let i=particles.length-1;i>=0;i--){
      const p = particles[i];
      p.t += dt;
      if (p.t >= p.life){ particles.splice(i,1); continue; }
      const k = 1 - (p.t/p.life);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 900 * dt;

      ctx.globalAlpha = 0.9*k;
      ctx.fillStyle = p.good ? "rgba(124,247,197,0.95)" : "rgba(255,92,122,0.95)";
      ctx.fillRect(p.x, p.y, 8, 8);
      ctx.globalAlpha = 1;
    }
  }

  // Collision helpers
  function hit(aX,aY, aR, bX,bY, bR){
    const dx=aX-bX, dy=aY-bY;
    return (dx*dx + dy*dy) <= (aR+bR)*(aR+bR);
  }

  function beginLevel(i){
    levelIndex = i;
    levelTime = 0;
    spawnTimer = 0;
    things.length = 0;
    particles.length = 0;

    const stop = CITY_STOPS[levelIndex];
    elCity.textContent = stop.name;

    // announce
    toast(`📍 ${stop.name}: ${stop.blurb}`);
    chord();
  }

  function endLevel(){
    // go to next
    if (levelIndex < CITY_STOPS.length-1){
      beginLevel(levelIndex+1);
    } else {
      // Victory
      running = false;
      overlay.classList.add("show");
      title.textContent = "Trip Complete!";
      subtitle.textContent = `Miry made it home with a score of ${Math.floor(score)}. The suitcase survives another Sunday… er, Sunny Los Angeles.`;
      startBtn.textContent = "Play Again";
      beep(880, 0.16, "triangle", 0.07);
      setTimeout(()=>beep(1175, 0.20, "triangle", 0.06), 140);
      setTimeout(()=>beep(1568, 0.24, "triangle", 0.05), 280);
    }
  }

  function resetGame(){
    score = 0;
    lives = 3;
    player.lane = 1;
    player.boost = 0;
    player.snack = 0;

    elScore.textContent = "0";
    elLives.textContent = String(lives);

    beginLevel(0);
  }

  // Input: swipe + tap fallback
  let touchStart = null;
  function onTouchStart(e){
    e.preventDefault();
    const p = getPoint(e);
    touchStart = {x:p.x, y:p.y, time: performance.now()};
    // Unlock audio on iOS
    ensureAudio();
  }
  function onTouchMove(e){
    e.preventDefault();
  }
  function onTouchEnd(e){
    e.preventDefault();
    if (!touchStart) return;

    const p = getPoint(e, true);
    const dx = p.x - touchStart.x;
    const dy = p.y - touchStart.y;
    const adx = Math.abs(dx), ady = Math.abs(dy);

    const SWIPE = 28; // pixels in canvas coords
    const quick = (performance.now() - touchStart.time) < 260;

    if (adx < SWIPE && ady < SWIPE){
      // Tap = boost if quick; else snack
      if (quick) doBoost();
      else doSnack();
      touchStart = null;
      return;
    }

    if (adx > ady){
      if (dx > 0) shiftLane(+1);
      else shiftLane(-1);
    } else {
      if (dy < 0) doBoost();
      else doSnack();
    }
    touchStart = null;
  }

  function getPoint(e, isEnd=false){
    const rect = canvas.getBoundingClientRect();
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    const clientX = touch ? touch.clientX : (e.clientX ?? rect.left);
    const clientY = touch ? touch.clientY : (e.clientY ?? rect.top);
    // Map to canvas coords
    const x = (clientX - rect.left) * (W/rect.width);
    const y = (clientY - rect.top) * (H/rect.height);
    return {x,y};
  }

  function shiftLane(dir){
    if (!running) return;
    const old = player.lane;
    player.lane = Math.max(0, Math.min(2, player.lane + dir));
    if (player.lane !== old) beep(392, 0.06, "square", 0.05);
  }

  function doBoost(){
    if (!running) return;
    player.boost = Math.max(player.boost, 0.65);
    toast("⬆️ BOOST! (briefly invincible)");
    beep(784, 0.08, "triangle", 0.06);
  }

  function doSnack(){
    if (!running) return;
    if (player.snack > 0 && lives < 3){
      player.snack -= 1;
      lives += 1;
      elLives.textContent = String(lives);
      toast("⬇️ Snack! +1 life");
      beep(523, 0.10, "triangle", 0.06);
      burst(player.x, player.y-20, true);
    } else if (player.snack > 0){
      player.snack -= 1;
      toast("⬇️ Snack! (delicious but you were already full lives)");
      beep(440, 0.08, "triangle", 0.05);
    } else {
      toast("⬇️ No snack tokens yet—collect 🍎 to snack!");
      beep(220, 0.06, "square", 0.03);
    }
  }

  // Buttons
  startBtn.addEventListener("click", () => {
    overlay.classList.remove("show");
    title.textContent = "Miry’s World Swipe";
    subtitle.textContent = "Swipe to dodge chaos, collect souvenirs, and keep the suitcase intact.";
    startBtn.textContent = "Start Trip";
    resetGame();
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  });

  muteBtn.addEventListener("click", () => {
    muted = !muted;
    muteBtn.textContent = muted ? "Sound: Off" : "Sound: On";
    if (!muted) ensureAudio();
  });

  // Attach events
  canvas.addEventListener("touchstart", onTouchStart, {passive:false});
  canvas.addEventListener("touchmove", onTouchMove, {passive:false});
  canvas.addEventListener("touchend", onTouchEnd, {passive:false});
  // mouse (desktop testing)
  canvas.addEventListener("mousedown", onTouchStart);
  window.addEventListener("mousemove", onTouchMove);
  window.addEventListener("mouseup", onTouchEnd);

  // Main loop
  function loop(now){
    if (!running) return;
    const dt = Math.min(0.033, (now - last)/1000);
    last = now;
    t += dt*1000;

    update(dt);
    render(dt);

    requestAnimationFrame(loop);
  }

  function update(dt){
    levelTime += dt;
    player.boost = Math.max(0, player.boost - dt);

    // Spawn
    spawnTimer -= dt;
    const spawnEvery = Math.max(0.35, 0.85 - levelIndex*0.06);
    if (spawnTimer <= 0){
      spawnTimer = spawnEvery;
      spawnThing();
    }

    // Move things
    for (let i=things.length-1;i>=0;i--){
      const o = things[i];
      o.y += o.speed * dt;

      // collision near player
      const pr = 46;
      const or = o.size*0.45;
      if (o.y > player.y-20 && o.y < player.y+60 && hit(player.x, player.y, pr, o.x, o.y, or)){
        if (o.isGood){
          // Score + tokens
          let add = 50;
          if (o.kind==="snack"){
            player.snack += 1;
            toast("🍎 Snack token collected!");
            add = 40;
          } else {
            toast("✨ Souvenir collected!");
          }
          score += add;
          elScore.textContent = String(Math.floor(score));
          burst(o.x, o.y, true);
          beep(659, 0.06, "triangle", 0.06);
          things.splice(i,1);
          continue;
        } else {
          if (player.boost > 0){
            // smash through
            score += 10;
            elScore.textContent = String(Math.floor(score));
            burst(o.x, o.y, true);
            beep(988, 0.05, "square", 0.05);
            things.splice(i,1);
            continue;
          }
          lives -= 1;
          elLives.textContent = String(lives);
          burst(o.x, o.y, false);
          beep(160, 0.12, "sawtooth", 0.06);
          toast("💥 Oof! Suitcase impact!");
          things.splice(i,1);

          if (lives <= 0){
            gameOver();
            return;
          }
        }
      }

      if (o.y > H+120){
        // missed good? small penalty
        if (o.isGood) score = Math.max(0, score - 5);
        things.splice(i,1);
      }
    }

    // passive score
    score += dt * (25 + levelIndex*3);
    elScore.textContent = String(Math.floor(score));

    // Level complete?
    if (levelTime >= LEVEL_LEN){
      endLevel();
    }
  }

  function gameOver(){
    running = false;
    overlay.classList.add("show");
    title.textContent = "Game Over (Jet Lag Wins)";
    subtitle.textContent = `Score: ${Math.floor(score)}. Try again—Miry still has snacks to collect.`;
    startBtn.textContent = "Retry";
    beep(110, 0.18, "sawtooth", 0.07);
    setTimeout(()=>beep(98, 0.24, "sawtooth", 0.06), 180);
  }

  function render(dt){
    const stop = CITY_STOPS[levelIndex];
    drawSky(stop.theme);
    drawSkyline(stop.theme);
    drawRoad();

    // level progress bar (top)
    const prog = Math.min(1, levelTime / LEVEL_LEN);
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "rgba(233,237,255,0.16)";
    roundedRect(18, 88, W-36, 14, 8); ctx.fill();
    ctx.fillStyle = "rgba(124,247,197,0.70)";
    roundedRect(18, 88, (W-36)*prog, 14, 8); ctx.fill();
    ctx.restore();

    // Things
    for (const o of things) drawThing(o);

    // Player
    drawPlayer();

    // Particles
    drawParticles(dt);

    // Bottom caption
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(18,26,51,0.66)";
    roundedRect(18, H-96, W-36, 66, 18); ctx.fill();
    ctx.strokeStyle = "rgba(233,237,255,0.12)";
    ctx.lineWidth = 2; roundedRect(18, H-96, W-36, 66, 18); ctx.stroke();

    ctx.fillStyle = "rgba(233,237,255,0.92)";
    ctx.font = "800 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign="left"; ctx.textBaseline="top";
    ctx.fillText(`Stop ${levelIndex+1}/${CITY_STOPS.length}: ${stop.name}`, 34, H-86);

    ctx.fillStyle = "rgba(233,237,255,0.70)";
    ctx.font = "650 15px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText(stop.blurb, 34, H-60);

    // snack tokens indicator
    ctx.textAlign="right";
    ctx.fillStyle = "rgba(233,237,255,0.92)";
    ctx.font = "800 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText(`🍎 x ${player.snack}`, W-34, H-76);
    ctx.restore();
  }

  // Title screen animation on canvas (even while overlay visible)
  function idle(){
    t += 16;
    drawSky("la");
    drawSkyline("la");
    drawRoad();

    // 8-bit-ish title
    ctx.save();
    ctx.globalAlpha=0.9;
    ctx.fillStyle="rgba(18,26,51,0.7)";
    roundedRect(44, 220, W-88, 210, 22); ctx.fill();
    ctx.strokeStyle="rgba(124,247,197,0.22)";
    ctx.lineWidth=3; roundedRect(44, 220, W-88, 210, 22); ctx.stroke();

    ctx.fillStyle="rgba(233,237,255,0.95)";
    ctx.textAlign="center";
    ctx.font="900 44px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("MIRY’S WORLD SWIPE", W/2, 270);

    ctx.font="800 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle="rgba(233,237,255,0.75)";
    ctx.fillText("Swipe to travel. Collect the good stuff. Dodge the chaos.", W/2, 322);

    // Little animated Miry sprite
    player.x = roadX + lanes[1];
    player.y = 520 + Math.sin(t*0.01)*6;
    player.boost = (Math.sin(t*0.005)+1)*0.5;
    drawPlayer();

    ctx.restore();

    if (!running) requestAnimationFrame(idle);
  }
  requestAnimationFrame(idle);
})();
