// ============================================================
// Jonathan's Adventure — Point-and-Click Engine
// ============================================================

const GAME_W = 800;
const GAME_H = 450;
const WORLD_W = 2400;
const VERB_BAR_H = 120;
const WALK_AREA_Y_MIN = 245; // kept for legacy reference
const WALK_AREA_Y_MAX = 318; // tightened bottom boundary

// Returns the sidewalk top-boundary Y for a given world X.
// Approximates the curved path shown in the reference image:
// sidewalk is higher (smaller Y) near the buildings and dips lower near the crosswalk.
function getStreetWalkYMin(worldX) {
  const x = Math.max(0, worldX);
  if (x < 380)  return 272;
  if (x < 580)  return 272 + (x - 380) / 200 * 22; // ramp down toward crosswalk
  if (x < 730)  return 294;                           // crosswalk zone — lowest point
  if (x < 930)  return 294 - (x - 730) / 200 * 22; // ramp back up
  return 272;
}

// ---- Canvas Setup ------------------------------------------
const gameCanvas = document.getElementById('gameCanvas');
const gc = gameCanvas.getContext('2d');
const uiCanvas = document.getElementById('uiCanvas');
const uc = uiCanvas.getContext('2d');
uiCanvas.style.pointerEvents = 'auto';

// ---- Asset Loader ------------------------------------------
const assetLoader = {
  total: 0,
  loaded: 0,
  get progress() { return this.total > 0 ? this.loaded / this.total : 0; },
  get isDone()   { return this.total > 0 && this.loaded >= this.total; },
};

function loadImage(src) {
  const img = new Image();
  assetLoader.total++;
  img.addEventListener('load',  () => { assetLoader.loaded++; });
  img.addEventListener('error', () => { assetLoader.loaded++; }); // count errors so we never hang
  img.src = src;
  return img;
}

// ---- Assets ------------------------------------------------
const titleScreenImage    = loadImage('title-screen.png');
const bgImage             = loadImage('background.jpg');
const bg2Image            = loadImage('background-2.png');
const whipImage           = loadImage('whip.png');
const cellPhoneImage      = loadImage('cell-phone.png');
const deliPackageImage    = loadImage('deli-package.png');
const deliPackageBgImage  = loadImage('deli-package-background.png');
const popeyesEmployeeSprite = loadImage('popeyes-employee-smoking.png');
const polyensoPosterImage = loadImage('polyenso-poster.png');
const dinerBgImage        = loadImage('diner-background.png');
const leafImages          = [1, 2, 3, 4].map(n => loadImage(`leaf${n}.png`));

// ---- Audio -----------------------------------------------------
// Sound effects — play on top of background music (volume independent)
function playSfx(src) {
  const sfx = new Audio(src);
  sfx.volume = 0.8;
  sfx.play().catch(() => {});
}

const mainMusic  = new Audio('main-music.mp3');
mainMusic.loop   = true;
mainMusic.volume = 0;

const dinerMusic  = new Audio('diner.mp3');
dinerMusic.loop   = true;
dinerMusic.volume = 0;

const MUSIC_MAX_VOL   = 0.7;
const MUSIC_FADE_SECS = 1.5 * 1000; // ms

const music = {
  current:   null,   // 'main' | 'diner' | null
  fadeFrom:  null,
  fadeTo:    null,
  fadeTimer: 0,

  _trackFor(name) { return name === 'diner' ? dinerMusic : mainMusic; },

  playMain()  { this._crossfade('main');  },
  playDiner() { this._crossfade('diner'); },

  _crossfade(to) {
    if (this.current === to) return;
    this.fadeFrom  = this.current;
    this.fadeTo    = to;
    this.current   = to;
    this.fadeTimer = 0;
    const toTrack  = this._trackFor(to);
    toTrack.volume = 0;
    toTrack.currentTime = 0;
    toTrack.play().catch(() => {});
  },

  muted: false,

  toggleMute() {
    this.muted = !this.muted;
    mainMusic.muted  = this.muted;
    dinerMusic.muted = this.muted;
    muteIcon.show(this.muted);
  },

  update(dtMs) {
    if (!this.fadeTo) return;
    this.fadeTimer += dtMs;
    const t = Math.min(this.fadeTimer / MUSIC_FADE_SECS, 1);

    this._trackFor(this.fadeTo).volume = t * MUSIC_MAX_VOL;

    if (this.fadeFrom) {
      const fromTrack = this._trackFor(this.fadeFrom);
      fromTrack.volume = (1 - t) * MUSIC_MAX_VOL;
      if (t >= 1) { fromTrack.pause(); fromTrack.currentTime = 0; }
    }

    if (t >= 1) { this.fadeTo = null; this.fadeFrom = null; }
  },
};

// ---- Mute Icon ---------------------------------------------
const muteIcon = {
  timer:   0,
  DURATION: 2000, // ms
  isMuted: false,

  show(muted) {
    this.isMuted = muted;
    this.timer   = this.DURATION;
  },

  update(dtMs) {
    if (this.timer > 0) this.timer -= dtMs;
  },

  draw(ctx) {
    if (this.timer <= 0) return;
    const alpha = Math.min(1, this.timer / 300); // quick fade-out in last 300ms
    ctx.save();
    ctx.globalAlpha = alpha;

    const size = 17;
    const pillW = size + 38, pillH = size + 10;
    const x = GAME_W - pillW - 10 + 6, y = 12;

    // pill background
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    roundRect(ctx, x - 6, y - 6, pillW, pillH, 7);
    ctx.fill();

    // speaker body
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.fillRect(x, y + size * 0.3, size * 0.35, size * 0.4);
    // speaker cone
    ctx.beginPath();
    ctx.moveTo(x + size * 0.35, y + size * 0.15);
    ctx.lineTo(x + size * 0.7,  y);
    ctx.lineTo(x + size * 0.7,  y + size);
    ctx.lineTo(x + size * 0.35, y + size * 0.85);
    ctx.closePath();
    ctx.fill();

    if (this.isMuted) {
      // X mark
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + size * 0.8,  y + size * 0.2);
      ctx.lineTo(x + size * 1.2,  y + size * 0.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + size * 1.2,  y + size * 0.2);
      ctx.lineTo(x + size * 0.8,  y + size * 0.8);
      ctx.stroke();
      // label
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 9px "Courier New"';
      ctx.textAlign = 'left';
      ctx.fillText('MUTED', x + size * 0.85, y + size * 1.05);
    } else {
      // sound arcs
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.lineCap  = 'round';
      for (let i = 1; i <= 2; i++) {
        const r = size * 0.28 * i;
        ctx.beginPath();
        ctx.arc(x + size * 0.7, y + size * 0.5, r, -Math.PI * 0.45, Math.PI * 0.45);
        ctx.stroke();
      }
      // label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px "Courier New"';
      ctx.textAlign = 'left';
      ctx.fillText('SOUND', x + size * 0.85, y + size * 1.05);
    }

    ctx.restore();
  },
};

// Map item IDs to their inventory/world images
const itemImages = {
  phone:       cellPhoneImage,
  whip:        whipImage,
  delipackage: deliPackageImage,
  poster:      polyensoPosterImage,
};

const SPRITE_COLS = 4;
const SPRITE_ROWS = 4;
const SPRITE_FRAME_W = 222;
const SPRITE_FRAME_H = 414;
const SPRITE_DISPLAY_H = 112;
const SPRITE_DISPLAY_W = SPRITE_DISPLAY_H * (SPRITE_FRAME_W / SPRITE_FRAME_H);

const spriteCanvas = loadImage('jonathan-walk-down-right.png');

// ---- Camera ------------------------------------------------
const camera = {
  x: 0,
  targetX: 0,
  update(dt = 1) {
    const diff = this.targetX - this.x;
    if (Math.abs(diff) > 0.5) this.x += diff * (1 - Math.pow(0.92, dt));
    else this.x = this.targetX;
  },
  follow(px) {
    const bgW = (bgImage.complete && bgImage.naturalWidth > 0)
      ? bgImage.naturalWidth * getBgScale() : WORLD_W;
    const maxX = Math.max(0, bgW - GAME_W);
    this.targetX = Math.max(0, Math.min(px - GAME_W / 2, maxX));
  }
};

// ---- Inventory ---------------------------------------------
const inventory = {
  items: [],
  add(item) {
    if (!this.items.find(i => i.id === item.id)) {
      this.items.push(item);
      showDialogue(`Picked up: ${item.name}.`);
    }
  },
  remove(id) { this.items = this.items.filter(i => i.id !== id); },
  has(id) { return !!this.items.find(i => i.id === id); }
};

// ---- Dialogue System ---------------------------------------
const dialogue = {
  lines: [],
  pending: [],
  timer: 0,
  show(speaker, text, duration = 3500, color = '#ffffff') {
    this.lines = [{ speaker, text }];
    this.pending = [];
    this.timer = duration;
    this.color = color;
    return this;
  },
  andThen(speaker, text, duration = 3500, color = '#ffffff') {
    this.pending.push({ speaker, text, duration, color });
    return this;
  },
  whenDone(fn) { this._onComplete = fn; return this; },
  update(dtMs = 16.667) {
    if (this.timer > 0) {
      this.timer -= dtMs;
      if (this.timer <= 0 && this.pending.length > 0) {
        const next = this.pending.shift();
        this.lines = [{ speaker: next.speaker, text: next.text }];
        this.timer = next.duration;
        this.color = next.color || '#ffffff';
      } else if (this.timer <= 0 && this.pending.length === 0 && this._onComplete) {
        const fn = this._onComplete;
        this._onComplete = null;
        fn();
      }
    }
  },
  draw(ctx, anchorX, anchorY) {
    if (this.timer <= 0) return;
    const line = this.lines[0];
    if (!line) return;
    const alpha = (this.timer < 1000 && this.pending.length === 0) ? this.timer / 1000 : 1;
    const fontSize = 16;
    const lineH = fontSize + 5;
    const maxW = 560;
    ctx.save();
    ctx.font = `bold ${fontSize}px "Courier New"`;
    const words = line.text.split(' ');
    const wrappedLines = [];
    let current = '';
    for (const word of words) {
      const test = current ? current + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && current) { wrappedLines.push(current); current = word; }
      else current = test;
    }
    if (current) wrappedLines.push(current);
    let centerX, baseY;
    if (anchorX !== undefined && anchorY !== undefined) {
      centerX = Math.max(maxW / 2 + 10, Math.min(GAME_W - maxW / 2 - 10, anchorX));
      baseY = anchorY - wrappedLines.length * lineH;
    } else {
      const charH = SPRITE_DISPLAY_H * player.getScale();
      centerX = Math.max(maxW / 2 + 10, Math.min(GAME_W - maxW / 2 - 10, player.x - camera.x));
      baseY = Math.max(fontSize + 8, player.y - charH - 8 - wrappedLines.length * lineH);
    }
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    wrappedLines.forEach((l, i) => {
      const ty = baseY + i * lineH;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 4; ctx.strokeText(l, centerX, ty);
      ctx.fillStyle = this.color || '#ffffff'; ctx.fillText(l, centerX, ty);
    });
    ctx.textAlign = 'left';
    ctx.restore();
  }
};

function showDialogue(text, speaker = 'Jonathan', color = '#ffffff') { dialogue.show(speaker, text, 4500, color); }

// ---- Helpers -----------------------------------------------
function wrapText(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && current) { lines.push(current); current = word; }
    else current = test;
  }
  if (current) lines.push(current);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ---- Phone Notification ------------------------------------
const phoneNotif = {
  sender: '', text: '', timer: 0, maxTimer: 4000,
  show(sender, text) { this.sender = sender; this.text = text; this.timer = this.maxTimer; },
  update(dtMs = 16.667) { if (this.timer > 0) this.timer -= dtMs; },
  draw(ctx) {
    if (this.timer <= 0) return;
    const t = this.timer / this.maxTimer;
    const alpha = this.timer < 1000 ? this.timer / 1000 : (t > 0.93 ? (1 - t) / 0.07 : 1);
    const w = 320, h = 60, x = GAME_W / 2 - w / 2, y = 14;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillStyle = 'rgba(18,18,28,0.94)';
    roundRect(ctx, x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = '#44445a'; ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 10); ctx.stroke();
    // Icon
    ctx.fillStyle = '#22bb55';
    roundRect(ctx, x + 12, y + 12, 36, 36, 7); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 18px "Courier New"';
    ctx.textAlign = 'center'; ctx.fillText('$', x + 30, y + 36); ctx.textAlign = 'left';
    // Text
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 11px "Courier New"';
    ctx.fillText(this.sender, x + 58, y + 24);
    ctx.fillStyle = '#aaaacc'; ctx.font = '11px "Courier New"';
    ctx.fillText(this.text, x + 58, y + 40);
    ctx.restore();
  }
};

// ---- End Screen Text ---------------------------------------
const endScreen = {
  MESSAGES: [
    { text: "Jonathan continued on to make one of the greatest games in history.",                              hold: 5000, font: 'italic 15px "Courier New"' },
    { text: "Ingo the investor continued investing in Jonathan's projects and got a cameo in each game.",       hold: 4000, font: 'italic 15px "Courier New"' },
    { text: "Happy birthday, Jonathan!",                                                                        hold: 99999, font: 'bold 22px "Courier New"' },
  ],
  FADE_IN_MS:  1200,
  FADE_OUT_MS: 800,

  visible:  false,
  msgIndex: 0,
  alpha:    0,
  phase:    'idle', // 'fade_in' | 'hold' | 'fade_out'
  timer:    0,

  show() {
    this.visible  = true;
    this.msgIndex = 0;
    this.alpha    = 0;
    this.phase    = 'fade_in';
    this.timer    = this.FADE_IN_MS;
  },

  update(dtMs) {
    if (!this.visible) return;
    this.timer -= dtMs;

    if (this.phase === 'fade_in') {
      this.alpha = Math.min(1, 1 - this.timer / this.FADE_IN_MS);
      if (this.timer <= 0) { this.alpha = 1; this.phase = 'hold'; this.timer = this.MESSAGES[this.msgIndex].hold; }

    } else if (this.phase === 'hold') {
      if (this.timer <= 0) { this.phase = 'fade_out'; this.timer = this.FADE_OUT_MS; }

    } else if (this.phase === 'fade_out') {
      this.alpha = Math.max(0, this.timer / this.FADE_OUT_MS);
      if (this.timer <= 0) {
        this.alpha = 0;
        this.msgIndex++;
        if (this.msgIndex < this.MESSAGES.length) { this.phase = 'fade_in'; this.timer = this.FADE_IN_MS; }
        else { this.visible = false; }
      }
    }
  },

  draw(ctx) {
    if (!this.visible || this.alpha <= 0) return;
    const msg = this.MESSAGES[this.msgIndex];
    if (!msg) return;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle   = '#ffffff';
    ctx.font        = msg.font;
    ctx.textAlign   = 'center';
    ctx.fillText(msg.text, GAME_W / 2, GAME_H / 2);
    ctx.restore();
  },
};

// ---- Fade Overlay ------------------------------------------
const fadeOverlay = {
  alpha: 0, target: 0, onComplete: null,
  fadeTo(target, cb) { this.target = target; this.onComplete = cb || null; },
  update(dt = 1) {
    if (Math.abs(this.alpha - this.target) > 0.002) {
      this.alpha += (this.target - this.alpha) * (1 - Math.pow(0.88, dt));
    } else {
      this.alpha = this.target;
      if (this.onComplete) { const cb = this.onComplete; this.onComplete = null; cb(); }
    }
  },
  draw(ctx) {
    if (this.alpha <= 0.002) return;
    ctx.save(); ctx.globalAlpha = Math.min(1, this.alpha);
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, GAME_W, GAME_H);
    ctx.restore();
  }
};

// ---- Game State --------------------------------------------
// 'street_start' | 'heading_to_diner' | 'puzzle_active' | 'puzzle_complete' | 'dialogue_tree' | 'ending'
let appState = 'loading'; // 'loading' | 'title' | 'playing'
let titleBlinkTimer = 0;  // ms accumulator for blinking text
let titleBlinkVisible = true;

let gameState = 'street_start';
let currentScene = 'street'; // 'street' | 'central_park' | 'diner'
let puzzleFireEscapeClimbed = false;
let puzzleDeliTalked = false; // true once player hears about the package from the Popeyes employee

// ---- Popeyes Employee Animation ----------------------------
const popeyesAnim = {
  frame: 0,
  state: 'idle',   // 'idle' | 'animating'
  timer: 3000,
  IDLE_DURATION:  3000,
  FRAME_DURATION:  100,
  FRAME_COUNT:       9,
  update(dtMs) {
    this.timer -= dtMs;
    if (this.timer <= 0) {
      if (this.state === 'idle') {
        this.state = 'animating';
        this.frame = 0;
        this.timer = this.FRAME_DURATION;
      } else {
        this.frame++;
        if (this.frame >= this.FRAME_COUNT) {
          this.frame = 0;
          this.state = 'idle';
          this.timer = this.IDLE_DURATION;
        } else {
          this.timer = this.FRAME_DURATION;
        }
      }
    }
  }
};

let inputLocked = false; // blocks world clicks during scripted dialogue sequences

// Park-specific walk area — curved to follow the stone path in the background.
// getParkWalkYMin(x) returns the upper Y boundary of the walkable path at a given X.
// The stone path curves: higher (lower Y) on the far left & right, dipping slightly
// lower (higher Y) in the mid-left area around the bench, then rising again center-right.
function getParkWalkYMin(x) {
  // Control points (x → y_min) — tweak these to match the background path:
  //   x=0   → 265  (park exit / left edge of path)
  //   x=200 → 272  (bench/lamp post area — path dips here)
  //   x=400 → 265  (center — path levels out)
  //   x=650 → 260  (right of center — path narrows/rises slightly)
  //   x=800 → 265  (far right edge)
  const pts = [
    [0,   265],
    [200, 272],
    [400, 265],
    [650, 260],
    [800, 265],
  ];
  // Linear interpolation between nearest control points
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return x < pts[0][0] ? pts[0][1] : pts[pts.length - 1][1];
}
const PARK_WALK_Y_MAX = 330;

// ---- Ingo Dialogue Data ------------------------------------
const ROUND2_OPTIONS = [
  { text: "Games like this helped shape me into who I am today.", response: "So this is just all about you then? Eh.", next: 'fail' },
  { text: "Games can reach people in a way that companies can't.", response: ["[Ingo scratches his mustache]", "Indeed. I hadn't thought of games like that."], next: 'round3' },
  { text: "I've heard games can make a lot of money.", response: "You heard wrong. Investing in this is a gamble and I'm not sure it's worth it.", next: 'fail' },
  { text: "I've always wanted to make games.", response: "So has everyone. That's not a reason.", next: 'fail' },
];

const INGO_ROUNDS = {
  round1: {
    question: "What have you actually shipped?",
    options: [
      { text: "I built Samaritan — a company I started to help people who are struggling.", response: "Yes, I've heard of it. Impressive.", next: 'round2' },
      { text: "I've made meaningful progress on Out of Body with just a few freelancers helping.", response: "And now here you are asking me for money for an unshipped project. Come back when you have something real.", next: 'fail' },
      { text: "I could have had a high paying job at a big tech company, but chose to build FoodCircles instead.", response: "0 to 1. Impressive.", next: 'round2_foodcircles' },
      { text: "Shipped? I've never worked in the packaging industry.", response: "[Ingo creases his forehead and blinks twice, slowly.]", next: 'fail' },
    ]
  },
  round2: {
    question: "So why build games? Why not another company like Samaritan?",
    options: ROUND2_OPTIONS,
  },
  round2_foodcircles: {
    question: "So why build games? Why not another company like FoodCircles?",
    options: ROUND2_OPTIONS,
  },
  round3: {
    question: "I already got your pitch about the WHAT. But WHY do you think it's important that people play Out of Body?",
    options: [
      { text: "I believe Out of Body will help everyone see they can live a life worth knowing.", response: "...", next: 'ending' },
      { text: "It's hard to explain in words. That's why it has to be a game.", response: "Why does that sound like you just haven't thought about this very much.", next: 'fail' },
      { text: "It makes people question if they're living a meaningful life.", response: "That's dark. Get some sleep.", next: 'fail' },
      { text: "It's a puzzle game about ghosts. What's not to like?", response: "Get out of here.", next: 'fail' },
    ]
  }
};

// ---- Diner Scene Manager -----------------------------------
const dinerScene = {
  phase: 'inactive', // 'lines' | 'question' | 'response' | 'jonathan_speaking' | 'inactive'
  currentRoundKey: 'round1',
  pendingOption: null,
  convoAttempt: 0,
  firstVisitDone: false,
  hoveredOption: -1,

  enter() {
    currentScene = 'diner';
    music.playDiner();
    pendingInteraction = null;
    if (!this.firstVisitDone) {
      this.firstVisitDone = true;
      this.showLines([
        { speaker: 'Ingo', text: "Hmm, finally decided to show up, eh?" },
        { speaker: 'Ingo', text: "Ok, you've got five minutes. Bring it on." },
        { speaker: 'Jonathan', text: "(You pitch Out of Body. The concept, the feeling, the nostalgia.)" },
        { speaker: 'Ingo', text: "You know how many times I've heard that pitch. Different wrapper, same dream." },
        { speaker: 'Ingo', text: "Guess how many of those actually go somewhere?" },
        { speaker: 'Jonathan', text: "This is different." },
        { speaker: 'Ingo', text: "Maybe so. I like the idea, but don't get too cocky. I don't know if I trust you to see it through." },
        { speaker: 'Ingo', text: "Come back in fifteen minutes with proof you can finish something." },
        { speaker: 'Ingo', text: "I don't care what it is. Just finish it." },
      ], () => {
        this.exit();
        gameState = 'puzzle_active';
        setTimeout(() => showDialogue("Fifteen minutes. Better make it count.", 'Jonathan'), 300);
      });
    } else {
      gameState = 'dialogue_tree';
      this.convoAttempt++;
      if (this.convoAttempt === 1) {
        this.showLines([
          { speaker: 'Ingo', text: "You gave some egghead a package that doesn't belong to him? I guess the fire escape was clever." },
          { speaker: 'Ingo', text: "You want $10,000? I need to know you're serious. What have you actually shipped?" },
        ], () => this.showQuestion());
      } else {
        const retryLine = this.currentRoundKey === 'round1'
          ? "Alright. Let's try this from the top."
          : "Let's pick up where we left off.";  // covers round2, round2_foodcircles, round3
        this.showLines([
          { speaker: 'Ingo', text: "You again." },
          { speaker: 'Ingo', text: retryLine },
        ], () => this.showQuestion());
      }
    }
  },

  showLines(lines, onComplete) {
    this.phase = 'lines';
    const color = l => l.speaker === 'Jonathan' ? '#ffffff' : '#ff69b4';
    let d = dialogue.show(lines[0].speaker, lines[0].text, 4500, color(lines[0]));
    for (let i = 1; i < lines.length; i++) d = d.andThen(lines[i].speaker, lines[i].text, 4500, color(lines[i]));
    d.whenDone(() => { this.phase = 'inactive'; if (onComplete) onComplete(); });
  },

  showQuestion() {
    this.phase = 'question';
    this.hoveredOption = -1;
    const round = INGO_ROUNDS[this.currentRoundKey];
    if (round) dialogue.show('Ingo', round.question, 30000, '#ff69b4');
  },

  selectOption(idx) {
    const round = INGO_ROUNDS[this.currentRoundKey];
    if (!round || idx < 0 || idx >= round.options.length) return;
    const option = round.options[idx];
    this.phase = 'jonathan_speaking';
    this.pendingOption = option;
    dialogue.show('Jonathan', option.text, 2800, '#ffffff').whenDone(() => {
      const opt = this.pendingOption;
      this.pendingOption = null;
      this.showResponse(opt.response, opt.next === 'fail' ? 3500 : 3000, () => {
        if (opt.next === 'fail') {
          dialogue.show('Ingo', "This isn't going anywhere. You know where to find me.", 3500, '#ff69b4')
            .whenDone(() => this.exit());
        } else if (opt.next === 'ending') {
          const flavour = opt.text.startsWith("It's those moments")
            ? "[He sets his coffee down.]"
            : "[He looks at you for a long moment.]";
          this.showLines([
            { speaker: 'Ingo', text: flavour },
            { speaker: 'Ingo', text: "You know why I stopped taking meetings three years ago?" },
            { speaker: 'Jonathan', text: "No." },
            { speaker: 'Ingo', text: "Because I made so much money from investing and got bored." },
            { speaker: 'Ingo', text: "But I agreed to meet with you because I thought I sensed something different." },
            { speaker: 'Ingo', text: "And I was right." },
            { speaker: 'Ingo', text: "I believe in Out of Body, whether it makes money or not." },
            { speaker: 'Ingo', text: "The story, the nostalgia. It WILL connect with people. It will make them think critically." },
            { speaker: 'Ingo', text: "In this AI rat race, we need that." },
            { speaker: 'Ingo', text: "Send me your info." },
          ], () => { this.exit(); this.triggerEnding(); });
        } else {
          this.currentRoundKey = opt.next;
          this.showQuestion();
        }
      });
    });
  },

  showResponse(textOrLines, duration, onComplete) {
    this.phase = 'response';
    const lines = Array.isArray(textOrLines) ? textOrLines : [textOrLines];
    let d = dialogue.show('Ingo', lines[0], duration, '#ff69b4');
    for (let i = 1; i < lines.length; i++) d = d.andThen('Ingo', lines[i], duration, '#ff69b4');
    d.whenDone(() => { this.phase = 'inactive'; if (onComplete) onComplete(); });
  },

  update(dtMs = 16.667) {
    // Dialogue timing is handled by the global dialogue system via whenDone callbacks
  },

  exit() { this.phase = 'inactive'; currentScene = 'street'; music.playMain(); },

  triggerEnding() {
    gameState = 'ending';
    setTimeout(() => {
      phoneNotif.show('Chase Bank', 'You received $10,000.00 from Ingo Nutsy');
      showDialogue("Huh.", 'Jonathan');
    }, 1200);
    setTimeout(() => showDialogue("Out of Body. Here we go.", 'Jonathan'), 5500);
    setTimeout(() => fadeOverlay.fadeTo(1, () => endScreen.show()), 9500);
  },

  handleClick(sx, sy) {
    if (this.phase === 'lines' || this.phase === 'response') {
      // Advance or dismiss the global dialogue line
      if (dialogue.pending.length > 0) {
        const next = dialogue.pending.shift();
        dialogue.lines = [{ speaker: next.speaker, text: next.text }];
        dialogue.timer = next.duration;
        dialogue.color = next.color || '#ffffff';
      } else if (dialogue.timer > 0) {
        dialogue.timer = 0;
        if (dialogue._onComplete) { const fn = dialogue._onComplete; dialogue._onComplete = null; fn(); }
      }
      return;
    }
    if (this.phase === 'question' && this.hoveredOption >= 0) { this.selectOption(this.hoveredOption); }
  },

  handleMouseMove(sx, sy) {
    this.hoveredOption = this.phase === 'question' ? this.getOptionAt(sx, sy) : -1;
  },

  getOptionAt(sx, sy) {
    if (this.phase !== 'question') return -1;
    const barY = GAME_H - VERB_BAR_H;
    const rowH = Math.floor(VERB_BAR_H / 4);
    if (sx < 0 || sx > GAME_W || sy < barY) return -1;
    const i = Math.floor((sy - barY) / rowH);
    return (i >= 0 && i < 4) ? i : -1;
  },

  // --- Drawing ---

  drawScene(ctx) {
    this.drawDinerBackground(ctx);
  },

  drawDinerBackground(ctx) {
    const sceneH = GAME_H - VERB_BAR_H;
    // Use photo background if loaded
    if (dinerBgImage.complete && dinerBgImage.naturalWidth > 0) {
      const scale = Math.max(GAME_W / dinerBgImage.naturalWidth, sceneH / dinerBgImage.naturalHeight);
      const drawW = dinerBgImage.naturalWidth * scale;
      const drawH = dinerBgImage.naturalHeight * scale;
      const offsetX = (GAME_W - drawW) / 2;
      const offsetY = (sceneH - drawH) / 2;
      ctx.drawImage(dinerBgImage, offsetX, offsetY, drawW, drawH);
      return;
    }
    // Fallback: canvas-drawn placeholder
    // Walls
    ctx.fillStyle = '#150d06';
    ctx.fillRect(0, 0, GAME_W, sceneH);
    // Upper wall colour
    ctx.fillStyle = '#1e1208';
    ctx.fillRect(0, 0, GAME_W, sceneH * 0.55);
    // Night window
    ctx.fillStyle = '#07070f';
    ctx.fillRect(210, 12, 380, 95);
    ctx.strokeStyle = '#3a2510'; ctx.lineWidth = 7;
    ctx.strokeRect(210, 12, 380, 95);
    ctx.strokeStyle = '#281608'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(400, 12); ctx.lineTo(400, 107); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(210, 59); ctx.lineTo(590, 59); ctx.stroke();
    // Street lights through glass
    ctx.fillStyle = 'rgba(255,200,80,0.12)';
    [260, 330, 470, 540].forEach(lx => { ctx.beginPath(); ctx.arc(lx, 40, 14, 0, Math.PI * 2); ctx.fill(); });
    // OPEN neon sign
    ctx.save();
    ctx.fillStyle = 'rgba(255,90,90,0.9)';
    ctx.font = 'bold 22px "Courier New"';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(255,80,80,0.8)'; ctx.shadowBlur = 14;
    ctx.fillText('OPEN', 690, 52);
    ctx.shadowBlur = 0; ctx.restore();
    ctx.textAlign = 'left';
    // Wainscoting line
    ctx.fillStyle = '#2a1a0a';
    ctx.fillRect(0, sceneH * 0.53, GAME_W, 6);
    // Left booth back (Jonathan's side)
    ctx.fillStyle = '#5c1a1a';
    ctx.fillRect(20, sceneH * 0.53 + 6, 240, 115);
    ctx.fillStyle = '#7a2424';
    ctx.fillRect(25, sceneH * 0.53 + 10, 230, 105);
    // Left booth seat
    ctx.fillStyle = '#5c1a1a';
    ctx.fillRect(20, sceneH * 0.53 + 121, 240, 28);
    ctx.fillStyle = '#7a2424';
    ctx.fillRect(25, sceneH * 0.53 + 124, 230, 24);
    // Right booth back (Ingo's side)
    ctx.fillStyle = '#5c1a1a';
    ctx.fillRect(540, sceneH * 0.53 + 6, 240, 115);
    ctx.fillStyle = '#7a2424';
    ctx.fillRect(545, sceneH * 0.53 + 10, 230, 105);
    // Right booth seat
    ctx.fillStyle = '#5c1a1a';
    ctx.fillRect(540, sceneH * 0.53 + 121, 240, 28);
    ctx.fillStyle = '#7a2424';
    ctx.fillRect(545, sceneH * 0.53 + 124, 230, 24);
    // Table
    ctx.fillStyle = '#c8a870';
    ctx.fillRect(220, sceneH * 0.53 + 80, 360, 65);
    ctx.fillStyle = '#b09058';
    ctx.fillRect(220, sceneH * 0.53 + 140, 360, 5);
    ctx.fillStyle = '#d8b880';
    ctx.fillRect(220, sceneH * 0.53 + 80, 360, 7);
    // Coffee cup (Ingo's side of table)
    const cy = sceneH * 0.53 + 88;
    ctx.fillStyle = '#f5f5f5'; ctx.fillRect(450, cy, 24, 28);
    ctx.fillStyle = '#c8a468'; ctx.fillRect(452, cy + 2, 20, 24);
    ctx.fillStyle = '#f5f5f5'; ctx.fillRect(473, cy + 10, 10, 4);
    ctx.fillStyle = '#e8e8e8';
    ctx.beginPath(); ctx.ellipse(462, cy + 30, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
    // Floor
    const floorY = sceneH * 0.53 + 149;
    ctx.fillStyle = '#1a0e07';
    ctx.fillRect(0, floorY, GAME_W, sceneH - floorY);
    // Tile lines
    ctx.strokeStyle = '#0e0804'; ctx.lineWidth = 1;
    for (let tx = 0; tx < GAME_W; tx += 55) {
      ctx.beginPath(); ctx.moveTo(tx, floorY); ctx.lineTo(tx, sceneH); ctx.stroke();
    }
    for (let ty = floorY; ty < sceneH; ty += 40) {
      ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(GAME_W, ty); ctx.stroke();
    }
  },

  drawIngo(ctx) {
    const ix = 598, iy = Math.floor((GAME_H - VERB_BAR_H) * 0.53) + 121; // seated at right booth

    // Arms on table
    ctx.fillStyle = '#4a4a5c';
    ctx.fillRect(ix - 10, iy - 22, 100, 18);
    ctx.fillStyle = '#c8a878';
    ctx.beginPath(); ctx.ellipse(ix - 5, iy - 12, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ix + 85, iy - 12, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
    // Torso
    ctx.fillStyle = '#4a4a5c';
    ctx.fillRect(ix + 5, iy - 88, 70, 68);
    // Lapels
    ctx.fillStyle = '#3a3a4c';
    ctx.beginPath(); ctx.moveTo(ix + 22, iy - 88); ctx.lineTo(ix + 37, iy - 62); ctx.lineTo(ix + 12, iy - 62); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(ix + 58, iy - 88); ctx.lineTo(ix + 43, iy - 62); ctx.lineTo(ix + 68, iy - 62); ctx.closePath(); ctx.fill();
    // Shirt
    ctx.fillStyle = '#d0d0d0';
    ctx.beginPath(); ctx.moveTo(ix + 28, iy - 88); ctx.lineTo(ix + 52, iy - 88); ctx.lineTo(ix + 46, iy - 62); ctx.lineTo(ix + 34, iy - 62); ctx.closePath(); ctx.fill();
    // Neck
    ctx.fillStyle = '#c8a878';
    ctx.fillRect(ix + 30, iy - 104, 20, 18);
    // Head
    ctx.fillStyle = '#c8a878';
    ctx.beginPath(); ctx.ellipse(ix + 40, iy - 126, 28, 30, 0, 0, Math.PI * 2); ctx.fill();
    // Hair
    ctx.fillStyle = '#909090';
    ctx.beginPath(); ctx.ellipse(ix + 40, iy - 151, 26, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ix + 40, iy - 147, 22, 9, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ix + 12, iy - 130, 7, 16, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ix + 68, iy - 130, 7, 16, 0.2, 0, Math.PI * 2); ctx.fill();
    // Ears
    ctx.fillStyle = '#c8a878';
    ctx.beginPath(); ctx.ellipse(ix + 12, iy - 126, 6, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ix + 68, iy - 126, 6, 10, 0, 0, Math.PI * 2); ctx.fill();
    // Eyes
    ctx.fillStyle = '#2a1a0a';
    ctx.beginPath(); ctx.ellipse(ix + 28, iy - 130, 4.5, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ix + 52, iy - 130, 4.5, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a0a00';
    ctx.beginPath(); ctx.ellipse(ix + 28, iy - 130, 2, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ix + 52, iy - 130, 2, 2, 0, 0, Math.PI * 2); ctx.fill();
    // Eyebrows (skeptical — one slightly raised)
    ctx.strokeStyle = '#6a5040'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(ix + 21, iy - 143); ctx.lineTo(ix + 35, iy - 140); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ix + 45, iy - 141); ctx.lineTo(ix + 59, iy - 137); ctx.stroke();
    // Nose
    ctx.fillStyle = '#b89060';
    ctx.beginPath(); ctx.ellipse(ix + 40, iy - 120, 4.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    // Mouth (neutral/slight frown)
    ctx.strokeStyle = '#8a6040'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ix + 30, iy - 110);
    ctx.bezierCurveTo(ix + 35, iy - 108, ix + 45, iy - 108, ix + 50, iy - 110);
    ctx.stroke();
    // Label
    ctx.fillStyle = '#55556a'; ctx.font = '9px "Courier New"';
    ctx.textAlign = 'center'; ctx.fillText('INGO', ix + 40, iy + 12); ctx.textAlign = 'left';
  },

  drawPanel(ctx) {
    const barY = GAME_H - VERB_BAR_H;
    const pad = 12;
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, barY, GAME_W, VERB_BAR_H);
    ctx.strokeStyle = '#2a2a4a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, barY); ctx.lineTo(GAME_W, barY); ctx.stroke();

    if (this.phase === 'lines') {
      const blink = Math.floor(Date.now() / 500) % 2 === 0;
      ctx.fillStyle = blink ? '#666688' : '#333355';
      ctx.font = '10px "Courier New"';
      ctx.textAlign = 'right';
      ctx.fillText('[ click to continue ]', GAME_W - pad, GAME_H - 8);
      ctx.textAlign = 'left';

    } else if (this.phase === 'question') {
      const round = INGO_ROUNDS[this.currentRoundKey];
      if (!round) return;
      const rowH = Math.floor(VERB_BAR_H / 4);
      round.options.forEach((opt, i) => {
        const ry = barY + i * rowH;
        const hov = this.hoveredOption === i;
        ctx.fillStyle = hov ? '#1e1e3e' : (i % 2 === 0 ? '#0d0d1a' : '#111128');
        ctx.fillRect(0, ry, GAME_W, rowH);
        ctx.strokeStyle = '#2a2a4a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(GAME_W, ry); ctx.stroke();
        ctx.fillStyle = hov ? '#ffffff' : '#aaaadd';
        ctx.font = (hov ? 'bold ' : '') + '11px "Courier New"';
        const label = '► ' + opt.text;
        const wrapped = wrapText(ctx, label, GAME_W - pad * 2);
        wrapped.slice(0, 2).forEach((wl, li) => {
          ctx.fillText(wl, pad, ry + (rowH / 2) + (li - (Math.min(wrapped.length,2) - 1) / 2) * 14 + 4);
        });
      });
      // Bottom rule
      ctx.strokeStyle = '#2a2a4a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, barY + VERB_BAR_H); ctx.lineTo(GAME_W, barY + VERB_BAR_H); ctx.stroke();
    }
    // response and jonathan_speaking phases: bar is silent (text shown on screen)
  },
};

// ---- Park Scene Manager ------------------------------------
const parkScene = {
  treeState: 'normal', // 'normal' | 'leaves_shaken' | 'whip_visible' | 'done'
  treeShakeTimer: 0,
  leaves: [],
  // Whip render position (world-space) — placeholder, user to confirm
  whipWorldX: 380, whipWorldY: 308,

  enter() {
    currentScene = 'central_park';
    player.x = 120; player.y = 300;
    player.targetX = 120; player.targetY = 300;
    player.facing = 1;
    parkCamera.x = 0; parkCamera.targetX = 0;
    showDialogue("I love when nobody is around.", 'Jonathan');
  },

  exit() {
    currentScene = 'street';
    // Return player near the park entrance on the street
    player.x = 720; player.y = 285;
    player.targetX = 720; player.targetY = 285;
    player.facing = -1;
    pendingInteraction = null;
  },

  pushTree() {
    if (this.treeState === 'normal') {
      this.treeState = 'leaves_shaken';
      this.treeShakeTimer = 60;
      this.spawnLeaves(7);
      inputLocked = true;
      dialogue.show('Jonathan', "The tree shudders. A shower of leaves... and something else up there catches the light.", 4500)
        .whenDone(() => { inputLocked = false; });
    } else if (this.treeState === 'leaves_shaken') {
      this.treeState = 'whip_visible';
      this.treeShakeTimer = 45;
      this.spawnLeaves(10);
      playSfx('zelda-secret.mp3');
      showDialogue("It tumbles down. An actual whip. In a tree. In Central Park.", 'Jonathan');
    } else if (this.treeState === 'whip_visible') {
      showDialogue("It's already on the ground. Pick it up.", 'Jonathan');
    } else {
      showDialogue("You push the tree again for no reason. It doesn't judge you.", 'Jonathan');
    }
  },

  spawnLeaves(count) {
    const treeCx = 390;
    // For the first push (count === 7) use a fixed image pool so each asset is
    // represented exactly: leaf1×2, leaf2×2, leaf3×2, leaf4×1 = 7 total.
    // For any other call assign images randomly.
    let imgPool = null;
    if (count === 7) {
      imgPool = [0, 0, 1, 1, 2, 2, 3];
      // Fisher-Yates shuffle so the pairing is random each time
      for (let i = imgPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [imgPool[i], imgPool[j]] = [imgPool[j], imgPool[i]];
      }
    }
    for (let i = 0; i < count; i++) {
      this.leaves.push({
        x:    treeCx + (Math.random() - 0.5) * 100,
        y:    120 + Math.random() * 60,
        vx:   (Math.random() - 0.5) * 1.5,
        vy:   0.6 + Math.random() * 1.2,
        rot:  Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.12,
        alpha: 1,
        size: 12 + Math.random() * 10,   // display half-size in px
        imgIndex: imgPool ? imgPool[i] : Math.floor(Math.random() * 4),
        life: 90 + Math.random() * 60
      });
    }
  },

  update(dt = 1) {
    if (this.treeShakeTimer > 0) this.treeShakeTimer -= dt;
    const TREE_FADE_BOTTOM = 256; // ~1s below the tree hotspot bottom
    const TREE_FADE_START  = TREE_FADE_BOTTOM - 40; // begin fading 40px above
    for (let i = this.leaves.length - 1; i >= 0; i--) {
      const l = this.leaves[i];
      l.x += l.vx * dt; l.y += l.vy * dt;
      l.rot += l.rotV * dt; l.life -= dt;
      // Fade by remaining life
      l.alpha = Math.min(1, l.life / 30);
      // Also fade out as leaf approaches the tree hotspot bottom
      if (l.y >= TREE_FADE_START) {
        const posAlpha = 1 - (l.y - TREE_FADE_START) / (TREE_FADE_BOTTOM - TREE_FADE_START);
        l.alpha = Math.min(l.alpha, Math.max(0, posAlpha));
      }
      if (l.life <= 0 || l.alpha <= 0) this.leaves.splice(i, 1);
    }
  },

  interact(hotspot) {
    const verb = verbBar.selectedVerb;

    // Walk-only hotspots always trigger their transition
    if (hotspot.walkOnly && hotspot.id === 'park_exit') {
      fadeOverlay.fadeTo(1, () => {
        this.exit();
        fadeOverlay.fadeTo(0);
      });
      return;
    }

    if (hotspot.id === 'park_tree') {
      if (verb === 'Push') { this.pushTree(); return; }
      if (verb === 'Use') { showDialogue("You try to use the tree. The tree is unmoved by your verb selection.", 'Jonathan'); return; }
      if (verb === 'Look at') {
        if (this.treeState === 'normal')
          showDialogue("A massive oak. Roots that probably know more about this city than anyone.", 'Jonathan');
        else if (this.treeState === 'leaves_shaken')
          showDialogue("There's something up in those branches. Long and coiled. That can't be right.", 'Jonathan');
        else if (this.treeState === 'whip_visible')
          showDialogue("An honest-to-god whip on the ground. Push the tree again and it falls — or just pick it up.", 'Jonathan');
        else
          showDialogue("Just a tree now. You kind of owe it an apology.", 'Jonathan');
        return;
      }
      if (verb === 'Pick up') { showDialogue("You can't pick up a tree.", 'Jonathan'); return; }
      if (verb === 'Talk to') { showDialogue("You tell the tree about Ingo. The tree seems unmoved.", 'Jonathan'); return; }
      if (verb === 'Pull') { showDialogue("You try to pull the tree toward you. The tree wins.", 'Jonathan'); return; }
    }

    if (hotspot.id === 'park_whip') {
      if (verb === 'Look at') {
        if (this.treeState !== 'whip_visible') { showDialogue("There's nothing there.", 'Jonathan'); return; }
        showDialogue("An actual whip. On the ground. In Central Park. Just sitting there.", 'Jonathan'); return;
      }
      if (verb === 'Use') { showDialogue("You'll need to actually pick it up.", 'Jonathan'); return; }
      if (verb === 'Pick up') {
        if (this.treeState !== 'whip_visible') { showDialogue("There's nothing there.", 'Jonathan'); return; }
        playSfx('zelda-item.mp3');
        inventory.add({ id: 'whip', name: "Indy's Whip" });
        this.treeState = 'done';
        showDialogue("It's surprisingly well-made. And old. Real old.", 'Jonathan');
        return;
      }
    }

    if (hotspot.id === 'park_lamppost') {
      if (verb === 'Look at')   { showDialogue("A cast-iron lamp post. It hums quietly. Very New York.", 'Jonathan'); return; }
      if (verb === 'Talk to')   { showDialogue("You have a brief one-sided conversation with a lamp post. It listens better than most people.", 'Jonathan'); return; }
      if (verb === 'Push')      { showDialogue("You push it. It holds. The city's infrastructure is fine.", 'Jonathan'); return; }
      if (verb === 'Pull')      { showDialogue("You try to pull it toward you. It is bolted into the ground. It wins.", 'Jonathan'); return; }
      if (verb === 'Use')       { showDialogue("You grab the post and do a little spin around it. A moment of levity.", 'Jonathan'); return; }
      if (verb === 'Pick up')   { showDialogue("It's bolted into the ground. And also very tall. No.", 'Jonathan'); return; }
      if (verb === 'Give')      { showDialogue("The lamp post is not in a position to receive gifts.", 'Jonathan'); return; }
      if (verb === 'Open')      { showDialogue("It's a lamp post, not a cabinet.", 'Jonathan'); return; }
      showDialogue("It's a lamp post. It illuminates things.", 'Jonathan'); return;
    }

    if (hotspot.id === 'park_bench') {
      if (verb === 'Look at')   { showDialogue("A green park bench. Someone left a newspaper from three days ago.", 'Jonathan'); return; }
      if (verb === 'Use')       { showDialogue("You sit for a moment. This is nice. Then you remember Ingo.", 'Jonathan'); return; }
      if (verb === 'Push')      { showDialogue("The bench scrapes a quarter-inch. A moral victory.", 'Jonathan'); return; }
      if (verb === 'Talk to')   { showDialogue("The bench offers no response. Wisest thing in the park.", 'Jonathan'); return; }
    }

    if (hotspot.id === 'park_fountain') {
      if (verb === 'Look at')   { showDialogue("A stone fountain. The water catches the last of the light.", 'Jonathan'); return; }
      if (verb === 'Use')       { showDialogue("You take a sip. Cold and good.", 'Jonathan'); return; }
      if (verb === 'Push')      { showDialogue("The fountain doesn't budge. It has been here longer than you.", 'Jonathan'); return; }
      if (verb === 'Talk to')   { showDialogue("You tell the fountain your problems. It keeps flowing.", 'Jonathan'); return; }
    }

    if (hotspot.id === 'park_trash') {
      if (verb === 'Look at')   { showDialogue("NYC Parks trash can. Mostly full. One very sad hot dog.", 'Jonathan'); return; }
      if (verb === 'Use')       { showDialogue("You peek inside. Nothing useful. Well. Maybe the hot dog.", 'Jonathan'); return; }
      if (verb === 'Push')      { showDialogue("You push it. It wobbles. You feel better for no reason.", 'Jonathan'); return; }
      if (verb === 'Pick up')   { showDialogue("You try to pick up a trash can. You cannot.", 'Jonathan'); return; }
    }

    if (hotspot.id === 'park_skyline') {
      if (verb === 'Look at')   { showDialogue("I'll bring Jackie and Noa to this spot for a sunset picnic sometime.", 'Jonathan'); return; }
      if (verb === 'Talk to')   { showDialogue("The skyline doesn't talk back. But it listens.", 'Jonathan'); return; }
      if (verb === 'Use')       { showDialogue("You stand here and take it in. Yeah. This is the city.", 'Jonathan'); return; }
      if (verb === 'Pick up')   { showDialogue("You cannot take the skyline. Believe me, people have tried.", 'Jonathan'); return; }
      if (verb === 'Push')      { showDialogue("The skyline remains unmoved. As always.", 'Jonathan'); return; }
      showDialogue("You admire the view.", 'Jonathan'); return;
    }

    if (hotspot.id === 'park_grass') {
      if (verb === 'Look at')   { showDialogue("This looks like a great spot for a grass nap.", 'Jonathan'); return; }
      if (verb === 'Use') {
        dialogue.show('Jonathan', "You lay down for a 30-second power nap. Ingo wants you to hurry...", 3000)
          .andThen('Jonathan', "...but then you remember: 'Hurry is waste. Waste is cracked bowl which never know rice.'", 5000);
        return;
      }
      if (verb === 'Pick up')   { showDialogue("You can't pick up grass. Well, technically you can. But that's not what this is.", 'Jonathan'); return; }
      if (verb === 'Push')      { showDialogue("You can't push grass. Well — you could. But you won't.", 'Jonathan'); return; }
      if (verb === 'Talk to')   { showDialogue("You whisper something to the grass. It sways a little. Close enough.", 'Jonathan'); return; }
      showDialogue("Nice patch of grass.", 'Jonathan'); return;
    }

    // Default
    switch (verb) {
      case 'Look at':  showDialogue(hotspot.look || `You look at ${hotspot.name}.`, 'Jonathan'); break;
      case 'Talk to':  showDialogue(hotspot.talk || `Nothing to say to ${hotspot.name}.`, 'Jonathan'); break;
      case 'Use':      showDialogue(hotspot.use  || `Can't use ${hotspot.name}.`, 'Jonathan'); break;
      case 'Push':     showDialogue(`Pushing ${hotspot.name} does nothing.`, 'Jonathan'); break;
      case 'Pull':     showDialogue(`You try to pull ${hotspot.name}. Nothing happens.`, 'Jonathan'); break;
      default:         showDialogue(`You can't do that here.`, 'Jonathan'); break;
    }
  },

  drawScene(ctx) {
    this.drawBackground(ctx);
    this.drawLeaves(ctx);
    if (this.treeState === 'whip_visible') this.drawWhipOnGround(ctx);
    player.draw(ctx, parkCamera.x);
    const vis = getParkVisibleHotspots();
    drawHotspots(ctx, parkCamera.x, hoveredHotspot, vis);
    dialogue.draw(ctx);
  },

  drawBackground(ctx) {
    if (bg2Image.complete && bg2Image.naturalWidth > 0) {
      const scale = Math.max(GAME_W / bg2Image.naturalWidth, (GAME_H - VERB_BAR_H) / bg2Image.naturalHeight);
      const srcW = GAME_W / scale, srcH = (GAME_H - VERB_BAR_H) / scale;
      const srcX = parkCamera.x / scale, srcY = (bg2Image.naturalHeight - srcH) / 2;
      ctx.drawImage(bg2Image, srcX, srcY, srcW, srcH, 0, 0, GAME_W, GAME_H - VERB_BAR_H);
    } else {
      ctx.fillStyle = '#1a3a1a';
      ctx.fillRect(0, 0, GAME_W, GAME_H - VERB_BAR_H);
      ctx.fillStyle = '#2a5a2a';
      ctx.font = 'bold 24px "Courier New"';
      ctx.textAlign = 'center';
      ctx.fillText('Central Park', GAME_W / 2, (GAME_H - VERB_BAR_H) / 2);
      ctx.textAlign = 'left';
    }
  },

  drawLeaves(ctx) {
    for (const l of this.leaves) {
      const img = leafImages[l.imgIndex];
      if (!img.complete || !img.naturalWidth) continue;
      ctx.save();
      ctx.globalAlpha = l.alpha;
      ctx.translate(l.x - parkCamera.x, l.y);
      ctx.rotate(l.rot);
      // Keep natural aspect ratio, scale by size
      const aspect = img.naturalWidth / img.naturalHeight;
      const h = l.size;
      const w = h * aspect;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  },

  drawWhipOnGround(ctx) {
    if (!whipImage.complete || !whipImage.naturalWidth) return;
    const wx = this.whipWorldX - parkCamera.x;
    const wy = this.whipWorldY;
    const drawW = 72, drawH = 36;
    ctx.save();
    ctx.drawImage(whipImage, wx - drawW / 2, wy - drawH / 2, drawW, drawH);
    ctx.restore();
  },

  drawPanel(ctx) {
    verbBar.draw(ctx);
  }
};

// ---- Park Camera (no-scroll since bg2 fits one screen) -----
const parkCamera = { x: 0, targetX: 0, update() {} };

// ---- Park Hotspots (placeholder positions — user to confirm) ----
// NOTE: All positions are in world-space (same as screen-space since parkCamera.x is always 0)
const parkHotspots = [
  {
    id: 'park_exit', name: 'Street',
    x: 0, y: 200, w: 55, h: 130,
    walkOnly: true,
  },
  {
    id: 'park_lamppost', name: 'Lamp Post',
    x: 105, y: 80, w: 41, h: 345,
    look: "A cast-iron lamp post. It hums quietly. Very New York."
  },
  {
    id: 'park_bench', name: 'Park Bench',
    x: 172, y: 225, w: 153, h: 95,
    look: "A green park bench. Someone left a newspaper from three days ago."
  },
  {
    id: 'park_fountain', name: 'Water Fountain',
    x: 670, y: 219, w: 63, h: 70,
    look: "A stone fountain. The water catches the last of the light."
  },
  {
    id: 'park_trash', name: 'Trash Can',
    x: 733, y: 235, w: 58, h: 58,
    look: "NYC Parks trash can. Mostly full. One very sad hot dog."
  },
  {
    id: 'park_tree', name: 'Big Oak Tree',
    x: 229, y: 0, w: 193, h: 186,
    look: "A massive oak. Roots that probably know more about this city than anyone."
  },
  {
    id: 'park_whip', name: "Whip",
    x: 357, y: 280, w: 80, h: 35,
    look: "An honest-to-god whip, coiled on the ground. Where did this even come from?"
  },
  {
    id: 'park_skyline', name: 'NYC Skyline',
    x: 440, y: 50, w: 148, h: 113,
  },
  {
    id: 'park_grass', name: 'Grassy Area',
    x: 375, y: 185, w: 143, h: 90,
  },
];

function getParkVisibleHotspots() {
  return parkHotspots.filter(h => {
    if (h.id === 'park_whip') return parkScene.treeState === 'whip_visible';
    return true;
  });
}

// ---- Verbs -------------------------------------------------
const VERBS = ['Give', 'Pick up', 'Use', 'Open', 'Talk to', 'Push', 'Close', 'Look at', 'Pull'];

const verbBar = {
  selectedVerb: 'Look at',
  hoveredVerb: null,
  layout() {
    const barY = GAME_H - VERB_BAR_H, pad = 10, gap = 5, cols = 3, rows = 3, vSecW = 300;
    const btnW = (vSecW - pad * 2 - gap * (cols - 1)) / cols;
    const btnH = (VERB_BAR_H - pad * 2 - gap * (rows - 1)) / rows;
    const vX = pad, vY = barY + pad;
    const iX = vSecW + pad, iCols = 5, iRows = 1;
    const iW = GAME_W - iX - pad;
    const slotW = (iW - gap * (iCols - 1)) / iCols;
    const slotH = VERB_BAR_H - pad * 2;
    const iY = barY + pad;
    return { barY, pad, gap, cols, rows, btnW, btnH, vX, vY, iX, iY, iCols, iRows, slotW, slotH };
  },
  draw(ctx) {
    const L = this.layout();
    ctx.fillStyle = '#0d0d1a'; ctx.fillRect(0, L.barY, GAME_W, VERB_BAR_H);
    ctx.strokeStyle = '#2a2a4a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, L.barY); ctx.lineTo(GAME_W, L.barY); ctx.stroke();
    const divX = L.iX - L.pad / 2;
    ctx.beginPath(); ctx.moveTo(divX, L.barY + L.pad); ctx.lineTo(divX, L.barY + VERB_BAR_H - L.pad); ctx.stroke();
    VERBS.forEach((verb, i) => {
      const col = i % L.cols, row = Math.floor(i / L.cols);
      const bx = L.vX + col * (L.btnW + L.gap), by = L.vY + row * (L.btnH + L.gap);
      const sel = verb === this.selectedVerb, hov = verb === this.hoveredVerb;
      ctx.fillStyle = sel ? '#2a2a5e' : hov ? '#1a1a3a' : '#111128';
      roundRect(ctx, bx, by, L.btnW, L.btnH, 3); ctx.fill();
      ctx.strokeStyle = sel ? '#6666cc' : '#333355'; ctx.lineWidth = 1;
      roundRect(ctx, bx, by, L.btnW, L.btnH, 3); ctx.stroke();
      ctx.fillStyle = sel ? '#aaaaff' : '#7777aa';
      ctx.font = `${sel ? 'bold ' : ''}11px "Courier New"`;
      ctx.textAlign = 'center';
      ctx.fillText(verb, bx + L.btnW / 2, by + L.btnH / 2 + 4);
    });
    for (let row = 0; row < L.iRows; row++) {
      for (let col = 0; col < L.iCols; col++) {
        const sx = L.iX + col * (L.slotW + L.gap), sy = L.iY + row * (L.slotH + L.gap);
        const item = inventory.items[row * L.iCols + col];
        ctx.fillStyle = '#0a0a16';
        roundRect(ctx, sx, sy, L.slotW, L.slotH, 3); ctx.fill();
        ctx.strokeStyle = '#333355'; ctx.lineWidth = 1;
        roundRect(ctx, sx, sy, L.slotW, L.slotH, 3); ctx.stroke();
        if (item) {
          const img = itemImages[item.id];
          if (img && img.complete && img.naturalWidth > 0) {
            // Draw image centered and fitted within slot with padding
            const pad2 = 5;
            const maxW = L.slotW - pad2 * 2;
            const maxH = L.slotH - pad2 * 2 - 10; // leave 10px for label
            const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
            const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
            const ix = sx + (L.slotW - dw) / 2, iy = sy + pad2 + (maxH - dh) / 2;
            ctx.drawImage(img, ix, iy, dw, dh);
            // Small name label at bottom of slot
            ctx.fillStyle = '#aaaadd'; ctx.font = '8px "Courier New"';
            ctx.textAlign = 'center';
            ctx.fillText(item.name, sx + L.slotW / 2, sy + L.slotH - 3);
          } else {
            // Fallback: text only
            ctx.fillStyle = '#aaaadd'; ctx.font = '9px "Courier New"';
            ctx.textAlign = 'center';
            ctx.fillText(item.name, sx + L.slotW / 2, sy + L.slotH / 2 + 3);
          }
        }
      }
    }
    ctx.textAlign = 'left';
  },
  getVerbAt(x, y) {
    const L = this.layout();
    for (let i = 0; i < VERBS.length; i++) {
      const col = i % L.cols, row = Math.floor(i / L.cols);
      const bx = L.vX + col * (L.btnW + L.gap), by = L.vY + row * (L.btnH + L.gap);
      if (x >= bx && x <= bx + L.btnW && y >= by && y <= by + L.btnH) return VERBS[i];
    }
    return null;
  },
  getInventoryItemAt(x, y) {
    const L = this.layout();
    for (let row = 0; row < L.iRows; row++) {
      for (let col = 0; col < L.iCols; col++) {
        const sx = L.iX + col * (L.slotW + L.gap), sy = L.iY + row * (L.slotH + L.gap);
        const item = inventory.items[row * L.iCols + col];
        if (item && x >= sx && x <= sx + L.slotW && y >= sy && y <= sy + L.slotH) return item;
      }
    }
    return null;
  }
};

// ---- Hotspots ----------------------------------------------
const hotspots = [
  {
    id: 'fireescape', name: 'Fire Escape',
    x: 110, y: 0, w: 74, h: 129,
    look: "The fire escape zig zags up the brownstone. The bottom ladder is retracted. Someone has left a package on the second landing.",
    talk: "You say hi to the fire escape. Old habit.",
    use: "The bottom ladder is retracted. You'd need something to pull it down.",
    pickup: "It's bolted to a building.",
  },
  {
    id: 'fire_escape_package', name: 'Deli Package',
    x: 138, y: 10, w: 44, h: 35,
    look: "A sealed package just sitting on a fire escape landing. Somebody's not getting their delivery today.",
    talk: "It's a cardboard box. I've had worse conversations, but still.",
    pickup: "It's on the second landing. I can't reach it from down here.",
    push: "I'd need to be up there to push anything.",
    pull: "Nothing to grab onto from here.",
    use: "Use what, exactly? And how would I even get up there?",
  },
  {
    id: 'deli', name: 'Westside News & Deli',
    x: 105, y: 131, w: 123, h: 116,
    look: "A cramped deli stuffed with lottery tickets, newspapers in four languages, and a fridge that hums too loud.",
    talk: "The owner nods at you. 'The usual?' He doesn't know what your usual is. Neither do you.",
    use: "You buy a coffee. It comes in a blue Anthora cup. Perfect.",
    pickup: "You can't steal the deli. Though it's tempting.",
  },
  {
    id: 'popeyes_employee', name: "Popeyes Employee",
    x: 230, y: 185, w: 42, h: 105,
    look: "A Popeyes employee in full uniform, clearly on a smoke break. They're staring up at the fire escape like it owes them something.",
    talk: "Thanks again for your help. Come back sometime and I'll sneak you some spicy chicken.", // fallback; puzzle states handled in interact()
    use: "You're not sure what you'd use on a person having a smoke break.",
    pickup: "You cannot pick up a person.",
  },
  {
    id: 'popeyes', name: 'Popeyes Restaurant',
    x: 226, y: 89, w: 136, h: 190,
    look: "The red and orange glow of Popeyes cuts through the dusk. The smell of fried chicken drifts out onto the sidewalk.",
    talk: "The cashier gives you a dead-eyed stare. This isn't a talking situation.",
    use: "You order a spicy chicken sandwich, a biscuit, and mashed potatoes. Correct choice.",
    pickup: "You can't put a Popeyes in your pocket. Though you wish you could.",
  },
  {
    id: 'citibike', name: 'Citi Bike Dock',
    x: 362, y: 212, w: 139, h: 105,
    look: "A row of sky-blue bikes, half of them docked. One has a suspicious wobble.",
    talk: "You tell the nearest bike it looks tired. It doesn't respond.",
    use: "Do I have time for a quick bike workout?",
    pickup: "You attempt to put a Citi Bike in your pocket. You cannot.",
  },
  {
    id: 'poster', name: 'Polyenso Concert Poster',
    x: 501, y: 120, w: 51, h: 109,
    collected: false,
    look: "A weathered poster — POLYENSO, live at the Mercury Lounge. Show date: this Saturday. Someone circled it in red marker.",
    talk: "You read the poster aloud. A passing dog glances at you.",
    use: "You take a photo of the poster with your phone.",
    pickup: "You carefully peel the poster off the wall. It tears a little. You take it anyway.",
    pickupItem: { id: 'poster', name: 'Polyenso Poster' }
  },
  {
    id: 'park_entrance', name: 'Central Park',
    x: 654, y: 110, w: 106, h: 131,
    walkOnly: true,
  },
];

// ---- Player Character: Jonathan ----------------------------
const player = {
  x: 400, y: 285, targetX: 400, targetY: 285,
  speed: 3.2, facing: 1, walking: false,
  walkFrame: 0, walkTimer: 0, WALK_FRAMES: 16,
  getScale() {
    const yMin = currentScene === 'central_park' ? getParkWalkYMin(this.x) : getStreetWalkYMin(this.x);
    const yMax = currentScene === 'central_park' ? PARK_WALK_Y_MAX : WALK_AREA_Y_MAX;
    const t = Math.max(0, Math.min(1, (this.y - yMin) / (yMax - yMin)));
    return 0.7 + t * 0.3; // min 0.7 → max 1.0
  },
  update(dt = 1) {
    const dx = this.targetX - this.x, dy = this.targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1) {
      this.walking = true;
      this.facing = dx > 0 ? 1 : -1;
      const step = Math.min(this.speed * dt, dist);
      this.x += (dx / dist) * step; this.y += (dy / dist) * step;
      this.walkTimer += dt;
      if (this.walkTimer >= 6) { this.walkTimer = 0; this.walkFrame = (this.walkFrame + 1) % this.WALK_FRAMES; }
    } else {
      this.walking = false; this.walkFrame = 0;
    }
    if (currentScene === 'street') camera.follow(this.x);
  },
  draw(ctx, camX) {
    const sx = this.x - camX, sy = this.y, s = this.getScale();
    ctx.save(); ctx.translate(sx, sy);
    if (spriteCanvas.complete && spriteCanvas.naturalWidth > 0) {
      const frameIdx = this.walking ? this.walkFrame : 0;
      const col = frameIdx % SPRITE_COLS, row = Math.floor(frameIdx / SPRITE_COLS);
      const drawW = SPRITE_DISPLAY_W * s, drawH = SPRITE_DISPLAY_H * s;
      if (this.facing === -1) ctx.scale(-1, 1);
      ctx.filter = 'sepia(35%) saturate(1.15) brightness(0.92)';
      ctx.drawImage(spriteCanvas, col * SPRITE_FRAME_W, row * SPRITE_FRAME_H, SPRITE_FRAME_W, SPRITE_FRAME_H, -drawW / 2, -drawH, drawW, drawH);
      ctx.filter = 'none';
    } else {
      ctx.scale(this.facing * s, s);
      this.drawCharacter(ctx);
    }
    ctx.restore();
  },
  drawCharacter(ctx) {
    const legSwing = this.walking ? Math.sin(this.walkFrame * Math.PI * 2 / this.WALK_FRAMES) * 5 : 0;
    const armSwing = this.walking ? Math.sin(this.walkFrame * Math.PI * 2 / this.WALK_FRAMES) * 6 : 0;
    const bodyBob = this.walking ? Math.abs(Math.sin(this.walkFrame * Math.PI / this.WALK_FRAMES)) * -1 : 0;
    ctx.fillStyle = '#1a1a2e';
    ctx.save(); ctx.translate(4, -12 + bodyBob); ctx.rotate((legSwing * Math.PI) / 180); ctx.fillRect(-4, 0, 8, 22); ctx.restore();
    ctx.save(); ctx.translate(-4, -12 + bodyBob); ctx.rotate((-legSwing * Math.PI) / 180); ctx.fillRect(-4, 0, 8, 22); ctx.restore();
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath(); ctx.ellipse(7, -2, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-7, -2, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#888888';
    ctx.save(); ctx.translate(0, bodyBob);
    ctx.beginPath(); ctx.moveTo(-13, -12); ctx.lineTo(13, -12); ctx.lineTo(11, -46); ctx.lineTo(-11, -46); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6e6e6e';
    ctx.beginPath(); ctx.moveTo(-10, -42); ctx.lineTo(10, -42); ctx.lineTo(8, -50); ctx.lineTo(-8, -50); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#888888';
    ctx.save(); ctx.translate(13, -40); ctx.rotate((armSwing * Math.PI) / 180); ctx.fillRect(0, 0, 8, 26);
    ctx.fillStyle = '#5c3a1e'; ctx.beginPath(); ctx.ellipse(4, 28, 5, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#888888';
    ctx.save(); ctx.translate(-21, -40); ctx.rotate((-armSwing * Math.PI) / 180); ctx.fillRect(0, 0, 8, 26);
    ctx.fillStyle = '#5c3a1e'; ctx.beginPath(); ctx.ellipse(4, 28, 5, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#757575'; ctx.fillRect(-10, -28, 20, 12);
    ctx.strokeStyle = '#666666'; ctx.lineWidth = 1; ctx.strokeRect(-10, -28, 20, 12);
    ctx.restore();
    ctx.save(); ctx.translate(0, bodyBob);
    ctx.fillStyle = '#5c3a1e'; ctx.fillRect(-4, -56, 8, 10);
    ctx.beginPath(); ctx.ellipse(0, -67, 13, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.ellipse(-4, -69, 2.5, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(4, -69, 2.5, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(-3.5, -69.5, 1.2, 1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(4.5, -69.5, 1.2, 1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a2e15'; ctx.beginPath(); ctx.ellipse(0, -65, 2.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2010'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -62, 4, 0.1, Math.PI - 0.1); ctx.stroke();
    ctx.fillStyle = '#5c3a1e';
    ctx.beginPath(); ctx.ellipse(-13, -67, 3, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(13, -67, 3, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b3fa0';
    ctx.beginPath(); ctx.ellipse(0, -73, 13.5, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -79, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5a2e8a'; ctx.lineWidth = 1;
    for (let ri = -9; ri <= 9; ri += 4.5) { ctx.beginPath(); ctx.moveTo(ri, -74); ctx.lineTo(ri, -70); ctx.stroke(); }
    ctx.fillStyle = '#8855cc'; ctx.beginPath(); ctx.ellipse(0, -85, 4, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  walkTo(worldX, worldY) {
    const yMin = currentScene === 'central_park' ? getParkWalkYMin(worldX) + 10 : getStreetWalkYMin(worldX) + 8;
    const yMax = currentScene === 'central_park' ? PARK_WALK_Y_MAX : WALK_AREA_Y_MAX;
    const clampedY = Math.max(yMin, Math.min(yMax, worldY));
    this.targetX = worldX; this.targetY = clampedY;
  }
};

// ---- NPC Drawing -------------------------------------------
function drawNPCs(ctx, camX) {
  if (gameState === 'ending') return;
  // Popeyes employee only appears after the first diner visit unlocks the puzzle
  if (gameState === 'street_start' || gameState === 'heading_to_diner') return;
  const nx = 251 - camX;
  if (nx > -50 && nx < GAME_W + 50) drawPopeyesEmployee(ctx, nx, 278);
}

function drawPopeyesEmployee(ctx, x, y) {
  if (!popeyesEmployeeSprite.complete || !popeyesEmployeeSprite.naturalWidth) return;
  // Sprite sheet is a 3×3 grid (9 frames total): 996×1956px → each frame 332×652px
  const COLS = 3;
  const frameW = popeyesEmployeeSprite.naturalWidth / COLS;
  const frameH = popeyesEmployeeSprite.naturalHeight / (popeyesAnim.FRAME_COUNT / COLS);
  const col = popeyesAnim.frame % COLS;
  const row = Math.floor(popeyesAnim.frame / COLS);
  const dispH = 85;
  const dispW = (frameW / frameH) * dispH;
  ctx.drawImage(
    popeyesEmployeeSprite,
    col * frameW, row * frameH, frameW, frameH,
    x - dispW / 2, y - dispH, dispW, dispH
  );
}

// ---- Hotspot Drawing ---------------------------------------
let debugHotspots = false;
document.addEventListener('keydown', e => {
  if (e.key === 'h' || e.key === 'H') debugHotspots = !debugHotspots;
  if (e.key === 'm' || e.key === 'M') { music.toggleMute(); return; }
  if (e.key === ' ') {
    e.preventDefault();
    if (appState === 'title') { startGame(); return; }
    // Advance diner dialogue via global dialogue system
    if (currentScene === 'diner' && (dinerScene.phase === 'lines' || dinerScene.phase === 'response')) {
      dinerScene.handleClick(0, 0); return;
    }
    if (dialogue.timer > 0) {
      if (dialogue.pending.length > 0) {
        // Skip to next line immediately
        const next = dialogue.pending.shift();
        dialogue.lines = [{ speaker: next.speaker, text: next.text }];
        dialogue.timer = next.duration;
        dialogue.color = next.color || '#ffffff';
      } else {
        // No more lines — dismiss and fire completion callback if any
        dialogue.timer = 0;
        if (dialogue._onComplete) {
          const fn = dialogue._onComplete;
          dialogue._onComplete = null;
          fn();
        }
      }
    }
  }
});

function drawHotspots(ctx, camX, hoveredId, visibleHotspots) {
  if (!visibleHotspots) visibleHotspots = getVisibleHotspots();
  visibleHotspots.forEach(h => {
    const sx = h.x - camX;
    if (debugHotspots) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,100,100,0.85)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.strokeRect(sx, h.y, h.w, h.h);
      ctx.fillStyle = 'rgba(255,100,100,0.15)';
      ctx.fillRect(sx, h.y, h.w, h.h);
      ctx.fillStyle = '#ffffff'; ctx.font = '9px monospace';
      ctx.fillText(h.name, sx + 3, h.y + 11);
      ctx.restore();
    }
  });
}

function getVisibleHotspots() {
  return hotspots.filter(h => {
    if (h.collected) return false;
    if (h.id === 'popeyes_employee') return gameState === 'puzzle_active' || gameState === 'puzzle_complete' || gameState === 'dialogue_tree' || gameState === 'ending';
    if (h.id === 'fire_escape_package') return !puzzleFireEscapeClimbed && !inventory.has('delipackage');
    return true;
  });
}

function getActiveHotspots() {
  return currentScene === 'central_park' ? getParkVisibleHotspots() : getVisibleHotspots();
}

// ---- Cursor & Hover ----------------------------------------
let hoveredHotspot = null, cursorLabel = '', mouseScreenX = 0, mouseScreenY = 0;

function getHotspotAtWorld(wx, wy) {
  const matches = getActiveHotspots().filter(h => {
    if (usingItem?.id === 'whip' && h.id === 'popeyes_employee') return false;
    return wx >= h.x && wx <= h.x + h.w && wy >= h.y && wy <= h.y + h.h;
  });
  if (!matches.length) return null;
  // Prefer the smallest-area hotspot so specific hotspots win over large ones
  return matches.reduce((a, b) => (a.w * a.h <= b.w * b.h ? a : b));
}

function drawCursorLabel(ctx, sx, sy) {
  if (!cursorLabel) return;
  ctx.save(); ctx.font = '12px "Courier New"';
  const w = ctx.measureText(cursorLabel).width + 16;
  let lx = sx + 12, ly = sy - 16;
  if (lx + w > GAME_W) lx = sx - w - 4;
  if (ly < 0) ly = sy + 20;
  ctx.fillStyle = 'rgba(0,0,0,0.8)'; roundRect(ctx, lx, ly, w, 20, 3); ctx.fill();
  ctx.fillStyle = '#ddddff'; ctx.fillText(cursorLabel, lx + 8, ly + 14);
  ctx.restore();
}

// ---- Interaction Handler -----------------------------------
function interact(hotspot) {
  const verb = verbBar.selectedVerb;

  // Give / Use-item modes — resolve before any scene routing
  if (givingItem) {
    const item = givingItem;
    givingItem = null;
    handleGiveItemTo(item, hotspot);
    return;
  }
  if (usingItem) {
    const item = usingItem;
    usingItem = null;
    handleUseItemOn(item, hotspot);
    return;
  }

  // Park scene — route to park interact
  if (currentScene === 'central_park') { parkScene.interact(hotspot); return; }

  // Walk-only transitions (park entrance, etc.)
  if (hotspot.walkOnly && hotspot.id === 'park_entrance') {
    if (gameState === 'street_start' || gameState === 'heading_to_diner') {
      showDialogue("I'm not positive... but I think I need to do something in this area first.", 'Jonathan');
      return;
    }
    fadeOverlay.fadeTo(1, () => {
      parkScene.enter();
      fadeOverlay.fadeTo(0);
    });
    return;
  }

  // Popeyes employee — package tip
  if (hotspot.id === 'popeyes_employee') {
    if (verb === 'Talk to') {
      if (!inventory.has('delipackage') && !puzzleFireEscapeClimbed) {
        puzzleDeliTalked = true;
        dialogue.show('Popeyes Employee', "Yo, you see that package up on the fire escape? Been there three days. Nobody's gotten it down.", 4000, '#4488ff')
          .andThen('Popeyes Employee', "I'm not gonna steal it — of course not. I just wanna make sure it gets to whoever it belongs to. *wink*", 4000, '#4488ff');
        return;
      } else if (puzzleFireEscapeClimbed && inventory.has('delipackage')) {
        showDialogue("You got it down! See, I knew someone would handle it. Not me though. I had nothing to do with this.", 'Popeyes Employee', '#4488ff'); return;
      } else {
        showDialogue("*takes a long drag* Fresh air, man. That's all I'm doing out here.", 'Popeyes Employee', '#4488ff'); return;
      }
    }
  }

  // Deli — Ingo scene entry + puzzle-aware
  if (hotspot.id === 'deli') {
    if (gameState === 'heading_to_diner' || gameState === 'puzzle_complete' || gameState === 'dialogue_tree') {
      dinerScene.enter(); return;
    }
    if (gameState === 'puzzle_active') {
      if (verb === 'Look at')  { showDialogue("Ingo and 10k are waiting for me in there if I can get this right.", 'Jonathan'); return; }
      if (verb === 'Talk to')  { showDialogue("Not yet. Ingo said I need to finish something first.", 'Jonathan'); return; }
      if (verb === 'Use')      { showDialogue("I can't give up. I need to finish something before I go back in there.", 'Jonathan'); return; }
      if (verb === 'Give')     { showDialogue("Give what? Select an item from your inventory first.", 'Jonathan'); return; }
    }
  }

  // Citi Bike — no longer part of puzzle

  // Fire Escape Package hotspot
  if (hotspot.id === 'fire_escape_package') {
    const duringPuzzle = gameState === 'puzzle_active';
    if (verb === 'Look at') {
      showDialogue(duringPuzzle
        ? "I wonder if I can use something to get the ladder down and grab the package."
        : "A sealed package just sitting on a fire escape landing. Somebody's not getting their delivery today.", 'Jonathan'); return;
    }
    if (verb === 'Talk to') {
      showDialogue("It's a cardboard box. I've had worse conversations, but still.", 'Jonathan'); return;
    }
    if (verb === 'Pick up') {
      if (duringPuzzle) {
        showDialogue(inventory.has('whip')
          ? "I could use Indy's whip to pull that ladder down."
          : "The ladder's retracted. I need something to reach it.", 'Jonathan');
      } else {
        showDialogue("It's on the second landing. I can't reach it from down here.", 'Jonathan');
      }
      return;
    }
    if (verb === 'Push') {
      showDialogue(duringPuzzle
        ? "I need to get up there first. That ladder's the real problem."
        : "I'd need to be up there to push anything.", 'Jonathan'); return;
    }
    if (verb === 'Pull') {
      showDialogue(duringPuzzle
        ? "If I could get that ladder down, I could climb up and grab it."
        : "Nothing to grab onto from here.", 'Jonathan'); return;
    }
    if (verb === 'Use') {
      showDialogue(duringPuzzle
        ? "I need something that can reach that ladder."
        : "Use what, exactly? And how would I even get up there?", 'Jonathan'); return;
    }
    return;
  }

  // Fire Escape — puzzle-aware
  if (hotspot.id === 'fireescape' && gameState === 'puzzle_active') {
    if (verb === 'Look at') {
      if (!puzzleFireEscapeClimbed) {
        showDialogue("There's a package sitting on the second landing. Been there a few days by the looks of it.", 'Jonathan'); return;
      } else {
        showDialogue("Empty landing. You already got the package down.", 'Jonathan'); return;
      }
    }
    if (verb === 'Use') {
      if (inventory.has('whip')) {
        doFireEscapeWhip(); return;
      } else {
        showDialogue("The ladder's retracted. You need something to reach it.", 'Jonathan'); return;
      }
    }
  }

  // Default
  switch (verb) {
    case 'Look at':  showDialogue(hotspot.look, 'Jonathan'); break;
    case 'Talk to':  showDialogue(hotspot.talk, 'Jonathan'); break;
    case 'Use':      showDialogue(hotspot.use, 'Jonathan'); break;
    case 'Pick up':
      if (hotspot.pickupItem) { inventory.add(hotspot.pickupItem); hotspot.collected = true; }
      else showDialogue(hotspot.pickup, 'Jonathan'); break;
    case 'Give':  showDialogue(`You have nothing to give to ${hotspot.name}.`, 'Jonathan'); break;
    case 'Open':  showDialogue(`You can't open ${hotspot.name}.`, 'Jonathan'); break;
    case 'Close': showDialogue(`You can't close ${hotspot.name}.`, 'Jonathan'); break;
    case 'Push':  showDialogue(`Pushing ${hotspot.name} does nothing.`, 'Jonathan'); break;
    case 'Pull':  showDialogue(`You try to pull ${hotspot.name}. Nothing happens.`, 'Jonathan'); break;
  }
}

// ---- Mouse Handling ----------------------------------------
function toCanvasCoords(e) {
  const rect = uiCanvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (GAME_W / rect.width), y: (e.clientY - rect.top) * (GAME_H / rect.height) };
}

uiCanvas.addEventListener('mousemove', (e) => {
  const { x, y } = toCanvasCoords(e);
  mouseScreenX = x; mouseScreenY = y;
  if (currentScene === 'diner') { dinerScene.handleMouseMove(x, y); return; }
  verbBar.hoveredVerb = verbBar.getVerbAt(x, y);
  const activeCamX = currentScene === 'central_park' ? parkCamera.x : camera.x;
  const h = getHotspotAtWorld(x + activeCamX, y);
  hoveredHotspot = h ? h.id : null;
  cursorLabel = h ? `${h.walkOnly ? 'Walk to' : verbBar.selectedVerb}: ${h.name}` : '';
});

uiCanvas.addEventListener('click', (e) => {
  const { x: sx, y: sy } = toCanvasCoords(e);
  if (currentScene === 'diner') { dinerScene.handleClick(sx, sy); return; }
  const verb = verbBar.getVerbAt(sx, sy);
  if (verb) { verbBar.selectedVerb = verb; return; }
  if (sy >= GAME_H - VERB_BAR_H) {
    const item = verbBar.getInventoryItemAt(sx, sy);
    if (item) handleInventoryItemAction(item);
    return;
  }
  if (inputLocked) return; // block world movement & hotspot interaction during scripted sequences
  const activeCamX = currentScene === 'central_park' ? parkCamera.x : camera.x;
  const worldX = sx + activeCamX, worldY = sy;
  const h = getHotspotAtWorld(worldX, worldY);
  if (h) { player.walkTo(h.x + h.w / 2, h.y + h.h); pendingInteraction = { hotspot: h }; }
  else {
    if (givingItem) { givingItem = null; showDialogue("Never mind.", 'Jonathan'); }
    if (usingItem)  { usingItem  = null; showDialogue("Never mind.", 'Jonathan'); }
    player.walkTo(worldX, worldY);
  }
});

uiCanvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (currentScene === 'diner') return;
  const { x: sx, y: sy } = toCanvasCoords(e);
  if (sy >= GAME_H - VERB_BAR_H) return;
  const h = getHotspotAtWorld(sx + camera.x, sy);
  if (h && h.look) showDialogue(h.look, 'Jonathan');
});

// ---- Inventory Item Actions --------------------------------
function handleInventoryItemAction(item) {
  const verb = verbBar.selectedVerb;
  if (item.id === 'phone') {
    if (verb === 'Look at' || verb === 'Use') {
      if (gameState === 'street_start') {
        inputLocked = true;
        gameState = 'heading_to_diner';
        dialogue.show('Ingo', "From Ingo: I'm at the deli on 79th for 30 mins. If you're serious about making this game, come talk to me.", 4000, '#ff69b4')
          .andThen('Jonathan', "Oh shoot, I need to go meet with him now!")
          .whenDone(() => { inputLocked = false; });
      } else if (gameState === 'heading_to_diner') {
        showDialogue("I need to get to the deli.", 'Jonathan');
      } else {
        showDialogue("Ingo's text. The deli on 79th.", 'Jonathan');
      }
      return;
    }
    showDialogue("It's your phone.", 'Jonathan'); return;
  }
  if (item.id === 'whip') {
    if (verb === 'Look at') { showDialogue("Why does this feel familiar?", 'Jonathan'); return; }
    if (verb === 'Use') { usingItem = item; showDialogue("Use it on what?", 'Jonathan'); return; }
  }
  if (item.id === 'delipackage') {
    if (verb === 'Look at') { showDialogue("It's a decrepit looking package from the fire escape.", 'Jonathan'); return; }
    if (verb === 'Open')    { showDialogue("I think opening someone else's mail is illegal.", 'Jonathan'); return; }
    if (verb === 'Give')    { givingItem = item; showDialogue("Give it to who?", 'Jonathan'); return; }
  }
  if (item.id === 'poster') {
    if (verb === 'Look at') { showDialogue("I'd pay to have Polyenso just play a continuous soundtrack as I go about my life.", 'Jonathan'); return; }
  }
  // Generic fallback for other inventory items
  switch (verb) {
    case 'Look at': showDialogue(`You look at the ${item.name}.`, 'Jonathan'); break;
    case 'Use':     showDialogue(`You use the ${item.name}.`, 'Jonathan'); break;
    default:        showDialogue(`You can't do that with the ${item.name}.`, 'Jonathan'); break;
  }
}

// ---- Give / Use Item To Hotspot ----------------------------
let givingItem = null;
let usingItem   = null;

function handleGiveItemTo(item, hotspot) {
  if (item.id === 'delipackage') {
    if (hotspot.id === 'popeyes_employee') {
      dialogue.show('Popeyes Employee', "Oh, I know who this belongs to. I'll get it to him. Don't worry about it.", 4000, '#4488ff')
        .whenDone(() => showDialogue("I'd consider that completing something. Back to Ingo!", 'Jonathan'));
      inventory.remove('delipackage');
      gameState = 'puzzle_complete';
      return;
    }
    // All other targets — keep item, give flavour response
    if (hotspot.id === 'deli')        { showDialogue("I should let the Popeye's guy have the satisfaction of delivering this.", 'Jonathan'); return; }
    if (hotspot.id === 'fireescape')  { showDialogue("You could put it back up there. But why would you do that?", 'Jonathan'); return; }
    if (hotspot.id === 'popeyes')     { showDialogue("You approach the counter with a stranger's package. The cashier's expression says everything.", 'Jonathan'); return; }
    if (hotspot.id === 'citibike')    { showDialogue("The bike rack has no interest in your delivery logistics.", 'Jonathan'); return; }
    if (hotspot.id === 'poster')      { showDialogue("Polyenso is a band, not a mailing address.", 'Jonathan'); return; }
    if (hotspot.id === 'park_entrance') { showDialogue("You can't give a package to a park.", 'Jonathan'); return; }
    showDialogue("That's not the right move.", 'Jonathan');
  }
}

function doFireEscapeWhip() {
  showDialogue("You crack the whip at the bottom rung. It hooks on. You yank — the ladder screeches down. Nice.", 'Jonathan');
  setTimeout(() => {
    showDialogue("On the landing: one sealed package. 'West 79th Coffee Supply Co.' The deli guy's filters.", 'Jonathan');
    inventory.add({ id: 'delipackage', name: 'Deli Package' });
    puzzleFireEscapeClimbed = true;
  }, 2500);
}

function handleUseItemOn(item, hotspot) {
  if (item.id === 'whip') {
    if (hotspot.id === 'fireescape') {
      if (gameState !== 'puzzle_active') {
        showDialogue("Looks like there's nothing up there worth cracking a whip at.", 'Jonathan'); return;
      }
      if (!puzzleDeliTalked) {
        showDialogue("I mean, I definitely could… but do I have a reason to?", 'Jonathan'); return;
      }
      if (puzzleFireEscapeClimbed) {
        showDialogue("Already got the package. The ladder's down.", 'Jonathan'); return;
      }
      doFireEscapeWhip(); return;
    }
    // Package on fire escape — whip goes past it, not useful
    if (hotspot.id === 'fire_escape_package') {
      showDialogue(gameState === 'puzzle_active'
        ? "The whip snaps past the package. Getting the ladder is the move, not the package."
        : "The whip snaps past the package. Impressive form. Zero results.", 'Jonathan'); return;
    }
    // Silly dialogues for everything else
    if (hotspot.id === 'deli')         { showDialogue("You crack the whip in the deli doorway. The owner gives you a look that transcends language.", 'Jonathan'); return; }
    if (hotspot.id === 'citibike')     { showDialogue("The Citi Bike dock is completely unbothered. It has seen things.", 'Jonathan'); return; }
    if (hotspot.id === 'poster')       { showDialogue("You whip the Polyenso poster. The band would probably think this is cool.", 'Jonathan'); return; }
    if (hotspot.id === 'popeyes')      { showDialogue("You snap the whip outside Popeyes. Your dignity takes the hit. The chicken remains unamused.", 'Jonathan'); return; }
    if (hotspot.id === 'park_entrance'){ showDialogue("You crack the whip at Central Park. The park is not impressed.", 'Jonathan'); return; }
    if (hotspot.id === 'park_tree')    { showDialogue("The tree shudders. You feel like you've done this before.", 'Jonathan'); return; }
    if (hotspot.id === 'park_bench')   { showDialogue("You whip the bench. A pigeon startles somewhere. Worth it.", 'Jonathan'); return; }
    if (hotspot.id === 'park_lamppost'){ showDialogue("The whip wraps around the post. You spin exactly once. Completely unnecessary.", 'Jonathan'); return; }
    if (hotspot.id === 'park_fountain'){ showDialogue("You crack the whip at the fountain. Water goes everywhere. A happy child in a skull t-shirt smiles at the chaos.", 'Jonathan'); return; }
    if (hotspot.id === 'park_trash')   { showDialogue("The trash can tips over. That hot dog was already sad. It didn't need this.", 'Jonathan'); return; }
    if (hotspot.id === 'park_skyline') { showDialogue("You crack the whip at the Manhattan skyline. The skyline has seen worse.", 'Jonathan'); return; }
    if (hotspot.id === 'park_grass')   { showDialogue("You whip the grass. The grass accepts it. The grass has always accepted everything.", 'Jonathan'); return; }
    if (hotspot.id === 'park_whip')    { showDialogue("You try to whip the whip with the whip. You need a moment.", 'Jonathan'); return; }
    if (hotspot.id === 'park_exit')    { showDialogue("You crack the whip dramatically at the exit. Classic.", 'Jonathan'); return; }
    showDialogue("You crack the whip dramatically. Nothing happens. Still pretty cool though.", 'Jonathan');
  }
}

// ---- Pending Interaction -----------------------------------
let pendingInteraction = null;

function checkPendingInteraction() {
  if (!pendingInteraction) return;
  const h = pendingInteraction.hotspot;
  const walkYMin = currentScene === 'central_park' ? getParkWalkYMin(h.x + h.w / 2) : getStreetWalkYMin(h.x + h.w / 2);
  let interactY = Math.max(h.y + h.h, walkYMin);
  if (currentScene === 'central_park') interactY = Math.min(interactY, PARK_WALK_Y_MAX);
  const dx = player.x - (h.x + h.w / 2), dy = player.y - interactY;
  if (Math.sqrt(dx * dx + dy * dy) < 60 && !player.walking) {
    interact(h); pendingInteraction = null;
  }
}

// ---- Background Drawing ------------------------------------
function getBgScale() {
  if (!bgImage.complete || !bgImage.naturalWidth) return 1;
  return Math.max(GAME_W / bgImage.naturalWidth, (GAME_H - VERB_BAR_H) / bgImage.naturalHeight);
}

function drawBackground(ctx) {
  if (bgImage.complete && bgImage.naturalWidth > 0) {
    const scale = getBgScale(), srcW = GAME_W / scale, srcH = (GAME_H - VERB_BAR_H) / scale;
    const srcX = camera.x / scale, srcY = (bgImage.naturalHeight - srcH) / 2;
    ctx.drawImage(bgImage, srcX, srcY, srcW, srcH, 0, 0, GAME_W, GAME_H - VERB_BAR_H);
  } else {
    drawFallbackScene(ctx);
  }
}

function drawDinerPlaceholder(ctx, h, sx) {
  ctx.save();
  // Storefront
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(sx, h.y, h.w, h.h);
  // Awning
  ctx.fillStyle = '#cc3333';
  ctx.fillRect(sx, h.y, h.w, 28);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px "Courier New"';
  ctx.fillText("79TH ST DINER", sx + 8, h.y + 18);
  // Window
  ctx.fillStyle = '#0a0a18';
  ctx.fillRect(sx + 10, h.y + 35, h.w - 20, 80);
  ctx.strokeStyle = '#555566'; ctx.lineWidth = 2;
  ctx.strokeRect(sx + 10, h.y + 35, h.w - 20, 80);
  // Warm light inside
  ctx.fillStyle = 'rgba(255,180,80,0.15)';
  ctx.fillRect(sx + 12, h.y + 37, h.w - 24, 76);
  // OPEN sign in window
  ctx.fillStyle = 'rgba(255,80,80,0.85)';
  ctx.font = 'bold 13px "Courier New"';
  ctx.fillText('OPEN', sx + 40, h.y + 75);
  // Door
  ctx.fillStyle = '#2a1a1a';
  ctx.fillRect(sx + 55, h.y + 120, 50, 58);
  ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 2;
  ctx.strokeRect(sx + 55, h.y + 120, 50, 58);
  ctx.restore();
}

function drawFallbackScene(ctx) {
  const camX = camera.x, sceneH = GAME_H - VERB_BAR_H;
  const sky = ctx.createLinearGradient(0, 0, 0, sceneH * 0.6);
  sky.addColorStop(0, '#1a0a2e'); sky.addColorStop(0.4, '#2d1b5e'); sky.addColorStop(1, '#7b3a6e');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, GAME_W, sceneH * 0.6);
  const buildings = [
    { x: 0, w: 280, h: 200, color: '#0d0d1a' }, { x: 250, w: 200, h: 160, color: '#0f0f20' },
    { x: 420, w: 350, h: 220, color: '#0a0a16' }, { x: 730, w: 220, h: 185, color: '#0d0d1c' },
    { x: 900, w: 300, h: 195, color: '#0b0b18' }, { x: 1160, w: 260, h: 210, color: '#0e0e1e' },
    { x: 1380, w: 320, h: 175, color: '#0c0c1a' }, { x: 1660, w: 280, h: 200, color: '#0f0f22' },
    { x: 1900, w: 500, h: 190, color: '#0a0a15' },
  ];
  buildings.forEach(b => {
    ctx.fillStyle = b.color; ctx.fillRect(b.x - camX, sceneH - b.h, b.w, b.h);
    ctx.fillStyle = 'rgba(255,220,100,0.4)';
    for (let wx = b.x + 15; wx < b.x + b.w - 15; wx += 22)
      for (let wy = sceneH - b.h + 20; wy < sceneH - 40; wy += 28)
        if (Math.random() > 0.35) ctx.fillRect(wx - camX, wy, 10, 14);
  });
  const sidewalk = ctx.createLinearGradient(0, sceneH * 0.75, 0, sceneH);
  sidewalk.addColorStop(0, '#2a2a3a'); sidewalk.addColorStop(1, '#1a1a28');
  ctx.fillStyle = sidewalk; ctx.fillRect(0, sceneH * 0.75, GAME_W, sceneH * 0.25);
  ctx.fillStyle = '#333344'; ctx.fillRect(0, sceneH * 0.72, GAME_W, 4);
  hotspots.forEach(h => {
    if (h.id === 'diner') return;
    const sx = h.x - camX;
    if (sx > -h.w && sx < GAME_W) drawHotspotPlaceholder(ctx, h, sx);
  });
}

function drawHotspotPlaceholder(ctx, h, sx) {
  const sy = h.y;
  ctx.save();
  switch (h.id) {
    case 'popeyes': {
      ctx.fillStyle = '#8b0000'; ctx.fillRect(sx, sy, h.w, h.h);
      ctx.fillStyle = '#cc2200'; ctx.fillRect(sx + 5, sy + 5, h.w - 10, 30);
      ctx.fillStyle = '#ff6600'; ctx.font = 'bold 14px "Courier New"'; ctx.fillText("POPEYE'S", sx + 12, sy + 25);
      ctx.fillStyle = '#ffcc00'; ctx.font = '10px "Courier New"'; ctx.fillText('Louisiana Kitchen', sx + 8, sy + 38);
      ctx.fillStyle = 'rgba(255,140,0,0.3)'; ctx.fillRect(sx + 10, sy + 45, h.w - 20, 50);
      ctx.strokeStyle = '#ff6600'; ctx.strokeRect(sx + 10, sy + 45, h.w - 20, 50); break;
    }
    case 'citibike': {
      ctx.fillStyle = '#003f87'; ctx.fillRect(sx + 5, sy + h.h - 12, h.w - 10, 12);
      for (let i = 0; i < 3; i++) {
        const bx = sx + 12 + i * 32, by = sy + h.h - 40;
        ctx.fillStyle = '#0080c8'; ctx.fillRect(bx, by, 24, 30);
        ctx.fillStyle = '#0060a0';
        ctx.beginPath(); ctx.arc(bx + 5, by + 28, 8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(bx + 19, by + 28, 8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ccddff'; ctx.font = '10px "Courier New"'; ctx.fillText('CITI BIKE', sx + 15, sy + 14);
      break;
    }
    case 'poster': {
      ctx.fillStyle = '#f0e8c8'; ctx.fillRect(sx, sy, h.w, h.h);
      ctx.fillStyle = '#1a1a2e'; ctx.fillRect(sx + 4, sy + 4, h.w - 8, h.h - 8);
      ctx.fillStyle = '#9b5de5'; ctx.font = 'bold 11px "Courier New"'; ctx.fillText('POLYENSO', sx + 8, sy + 25);
      ctx.fillStyle = '#f0f0f0'; ctx.font = '9px "Courier New"';
      ctx.fillText('LIVE', sx + 14, sy + 40); ctx.fillText('Mercury Lounge', sx + 6, sy + 52); ctx.fillText('Saturday', sx + 14, sy + 65);
      ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx + h.w / 2, sy + h.h / 2, 18, 0, Math.PI * 2); ctx.stroke(); break;
    }
    case 'deli': {
      ctx.fillStyle = '#1a3a1a'; ctx.fillRect(sx, sy, h.w, h.h);
      ctx.fillStyle = '#2a5a2a'; ctx.fillRect(sx + 5, sy + 5, h.w - 10, 28);
      ctx.fillStyle = '#88ff88'; ctx.font = 'bold 9px "Courier New"'; ctx.fillText('WESTSIDE NEWS', sx + 8, sy + 20);
      ctx.fillStyle = '#66cc66'; ctx.font = '8px "Courier New"'; ctx.fillText('& DELI', sx + 30, sy + 32);
      ctx.fillStyle = 'rgba(255,220,100,0.5)'; ctx.fillRect(sx + 10, sy + 40, h.w - 20, 60);
      ctx.fillStyle = '#f5f5e0';
      for (let ni = 0; ni < 3; ni++) {
        ctx.fillRect(sx + 14 + ni * 36, sy + 48, 28, 40);
        ctx.fillStyle = '#222'; ctx.font = '6px "Courier New"'; ctx.fillText('NEWS', sx + 16 + ni * 36, sy + 60);
        ctx.fillStyle = '#f5f5e0';
      }
      break;
    }
    case 'park_entrance': {
      ctx.fillStyle = 'rgba(40,80,40,0.4)'; ctx.fillRect(sx, sy, h.w, h.h);
      ctx.fillStyle = '#88cc88'; ctx.font = 'bold 10px "Courier New"';
      ctx.textAlign = 'center'; ctx.fillText('Central Park', sx + h.w / 2, sy + h.h / 2);
      ctx.textAlign = 'left'; break;
    }
    case 'fireescape': {
      ctx.strokeStyle = '#555566'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx + 10, sy); ctx.lineTo(sx + 10, sy + h.h);
      ctx.moveTo(sx + h.w - 10, sy); ctx.lineTo(sx + h.w - 10, sy + h.h); ctx.stroke();
      ctx.lineWidth = 4;
      for (let pi = 0; pi < 3; pi++) {
        const py = sy + pi * 65 + 40;
        ctx.beginPath(); ctx.moveTo(sx + 5, py); ctx.lineTo(sx + h.w - 5, py); ctx.stroke();
        ctx.lineWidth = 2;
        for (let ri = sx + 14; ri < sx + h.w - 10; ri += 10) {
          ctx.beginPath(); ctx.moveTo(ri, py); ctx.lineTo(ri, py - 20); ctx.stroke();
        }
        ctx.lineWidth = 4;
      }
      // Package on second landing — visible always until retrieved
      if (!puzzleFireEscapeClimbed) {
        if (deliPackageImage.complete && deliPackageImage.naturalWidth > 0) {
          const pkgW = 34, pkgH = 24;
          ctx.drawImage(deliPackageImage, sx + 15, sy + 18, pkgW, pkgH);
        } else {
          ctx.fillStyle = '#c8a870'; ctx.fillRect(sx + 18, sy + 22, 30, 22);
          ctx.strokeStyle = '#8a6030'; ctx.lineWidth = 1;
          ctx.strokeRect(sx + 18, sy + 22, 30, 22);
        }
      }
      ctx.fillStyle = '#2d4a1e'; ctx.beginPath(); ctx.arc(sx + h.w / 2, sy + 95, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a8a3a'; ctx.beginPath(); ctx.arc(sx + h.w / 2, sy + 90, 8, Math.PI, 0); ctx.fill(); break;
    }
  }
  ctx.restore();
}

// ---- UI Helpers --------------------------------------------
// ---- World Item Rendering ----------------------------------
function drawWorldItems(ctx, camX) {
  // Deli package on fire escape second landing — visible until retrieved
  if (!puzzleFireEscapeClimbed) {
    const feH = hotspots.find(h => h.id === 'fireescape');
    if (feH) {
      const sx = feH.x - camX;
      if (sx > -60 && sx < GAME_W + 60) {
        if (deliPackageBgImage.complete && deliPackageBgImage.naturalWidth > 0) {
          // Second landing, front right corner — 65% of original 58×39 asset
          const pkgW = 25, pkgH = 18;
          const pkgX = sx + feH.w * 0.62;
          const pkgY = feH.y + feH.h * 0.16;
          ctx.drawImage(deliPackageBgImage, pkgX, pkgY, pkgW, pkgH);
        }
      }
    }
  }
}

function drawVerbIndicator(ctx) {
  ctx.save(); ctx.font = '11px "Courier New"';
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(4, 4, 100, 18);
  ctx.fillStyle = '#aaaaff'; ctx.fillText(`[ ${verbBar.selectedVerb} ]`, 8, 16);
  ctx.restore();
}

// ---- Loading Screen ----------------------------------------
function drawLoadingScreen(ctx) {
  // Background
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  const pct = assetLoader.progress;
  const barW = Math.floor(GAME_W * 0.55);
  const barH = 6;
  const barX = Math.floor((GAME_W - barW) / 2);
  const barY = Math.floor(GAME_H / 2) + 18;

  // Label
  ctx.font = 'bold 13px "Courier New"';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#6b4fa0';
  ctx.fillText('Loading...', GAME_W / 2, barY - 14);

  // Bar track
  ctx.fillStyle = '#1e1e3e';
  roundRect(ctx, barX, barY, barW, barH, 3);
  ctx.fill();

  // Bar fill
  if (pct > 0) {
    ctx.fillStyle = '#9b6dff';
    roundRect(ctx, barX, barY, Math.floor(barW * pct), barH, 3);
    ctx.fill();
  }

  // Percentage
  ctx.font = '10px "Courier New"';
  ctx.fillStyle = '#4a3570';
  ctx.fillText(`${Math.floor(pct * 100)}%`, GAME_W / 2, barY + barH + 14);
}

// ---- Title Screen ------------------------------------------
function drawTitleScreen(ctx) {
  const sceneH = GAME_H; // use full canvas including verb bar area
  if (titleScreenImage.complete && titleScreenImage.naturalWidth > 0) {
    const scale = Math.max(GAME_W / titleScreenImage.naturalWidth, sceneH / titleScreenImage.naturalHeight);
    const drawW = titleScreenImage.naturalWidth * scale;
    const drawH = titleScreenImage.naturalHeight * scale;
    ctx.drawImage(titleScreenImage, (GAME_W - drawW) / 2, (sceneH - drawH) / 2, drawW, drawH);
  } else {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
  }

  if (titleBlinkVisible) {
    ctx.save();
    ctx.font = 'bold 16px "Courier New"';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.fillText('Press Space to Start', GAME_W / 2, GAME_H * 0.88);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

function startGame() {
  appState = 'playing';
  music.playMain();
  inventory.items.push({ id: 'phone', name: 'Cell Phone' });
  setTimeout(() => showDialogue("Upper West Side. Dusk. The city smells like possibility and garbage.", 'Jonathan'), 500);
}

// ---- Game Loop ---------------------------------------------
let lastTime = 0;

function gameLoop(timestamp) {
  const dtMs = lastTime ? Math.min(timestamp - lastTime, 50) : 16.667;
  const dt = dtMs / (1000 / 60);
  lastTime = timestamp;

  // ---- Loading screen ----
  if (appState === 'loading') {
    if (assetLoader.isDone) { appState = 'title'; }
    gc.clearRect(0, 0, GAME_W, GAME_H);
    drawLoadingScreen(gc);
    uc.clearRect(0, 0, GAME_W, GAME_H);
    requestAnimationFrame(gameLoop);
    return;
  }

  // ---- Title screen ----
  if (appState === 'title') {
    titleBlinkTimer += dtMs;
    if (titleBlinkTimer >= 600) { titleBlinkTimer = 0; titleBlinkVisible = !titleBlinkVisible; }
    gc.clearRect(0, 0, GAME_W, GAME_H);
    drawTitleScreen(gc);
    uc.clearRect(0, 0, GAME_W, GAME_H);
    requestAnimationFrame(gameLoop);
    return;
  }

  // ---- Playing ----
  if (currentScene === 'street') {
    player.update(dt); camera.update(dt); checkPendingInteraction();
    if (gameState !== 'street_start' && gameState !== 'heading_to_diner' && gameState !== 'ending') {
      popeyesAnim.update(dtMs);
    }
  } else if (currentScene === 'central_park') {
    player.update(dt); parkCamera.update(dt); checkPendingInteraction();

    parkScene.update(dt);
  }
  dialogue.update(dtMs); phoneNotif.update(dtMs); dinerScene.update(dtMs); fadeOverlay.update(dt); music.update(dtMs); muteIcon.update(dtMs); endScreen.update(dtMs);

  // --- Draw game canvas ---
  gc.clearRect(0, 0, GAME_W, GAME_H);
  if (currentScene === 'street') {
    drawBackground(gc);
    drawWorldItems(gc, camera.x);
    drawNPCs(gc, camera.x);
    drawHotspots(gc, camera.x, hoveredHotspot);
    player.draw(gc, camera.x);
  } else if (currentScene === 'central_park') {
    parkScene.drawScene(gc);
  } else {
    dinerScene.drawScene(gc);
  }
  if (currentScene === 'diner') {
    const dinerSpeaker = dialogue.lines[0]?.speaker;
    const dax = dinerSpeaker === 'Jonathan' ? 180 : 620;
    dialogue.draw(gc, dax, 110);
  } else {
    dialogue.draw(gc);
  }

  // --- Draw UI canvas ---
  uc.clearRect(0, 0, GAME_W, GAME_H);
  if (currentScene === 'street' || currentScene === 'central_park') {
    drawVerbIndicator(uc);
    verbBar.draw(uc);
    drawCursorLabel(uc, mouseScreenX, mouseScreenY);
  } else {
    dinerScene.drawPanel(uc);
  }
  phoneNotif.draw(uc);
  muteIcon.draw(uc);
  fadeOverlay.draw(uc);
  endScreen.draw(uc);

  requestAnimationFrame(gameLoop);
}

// ---- Boot --------------------------------------------------
// camera.targetX is already 0 by default; bgImage onload no longer needed

requestAnimationFrame(gameLoop);
