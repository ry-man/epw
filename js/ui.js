"use strict";

// Rendering + touch UI. All rules live in game.js.

const TEAM_COLORS = ["#e0452a", "#2f8fd8"];
const TEAM_TINTS = ["#fdeee9", "#e8f3fc"];
const FLOW_HEX = { null: "#8c8c8c", Fire: "#d63a2a", Water: "#2f7fd6" };
const BOARD_BG = "#f7f5ef";
const CASING = "#262626";
const SETTINGS_KEY = "epw-settings-v1";
const PLAYER_MODES = ["Human", "CPU Easy", "CPU Normal", "CPU Hard"];

const $ = (id) => document.getElementById(id);

let game = null;
let zoom = "auto";
let appliedZoom = 1;
let cell = 18;
let cpuTimer = null;
let overShown = false;
let derived = { version: -1 };
let staticLayer = null;
let staticKey = "";
let handKey = "";
let settings = loadSettings();

function loadSettings() {
  const defaults = { cycles: 10, p0: "Human", p1: "CPU Normal", speed: 1 };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch (e) {
    return defaults;
  }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* storage unavailable */ }
}

// ---------------------------------------------------------------- drawing --
function pathStar(ctx, cx, cy, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawTile(ctx, x0, y0, size, tile, colors) {
  const cx = x0 + size / 2;
  const cy = y0 + size / 2;
  const half = size / 2;
  const width = Math.max(4, Math.floor(size / 6));
  let channels = tileInfo(tile).channels;
  if (!colors) colors = channels.length > 1 ? ["#55514d", "#8a6d3b"] : ["#55514d"];
  const edge = (side) => [cx + DIRECTIONS[side][0] * half, cy + DIRECTIONS[side][1] * half];
  const stroke = (trace, color) => {
    ctx.lineJoin = "round";
    ctx.lineWidth = width + 3;
    ctx.strokeStyle = CASING;
    ctx.beginPath();
    trace();
    ctx.stroke();
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.beginPath();
    trace();
    ctx.stroke();
  };

  if (tile.name === "Cross") {
    // The second pipe is broken into stubs; the first bridges over the junction.
    const gap = width;
    for (const side of channels[1]) {
      const [ex, ey] = edge(side);
      const gx = cx + DIRECTIONS[side][0] * gap;
      const gy = cy + DIRECTIONS[side][1] * gap;
      stroke(() => { ctx.moveTo(ex, ey); ctx.lineTo(gx, gy); }, colors[1]);
    }
    const [a, b] = channels[0].map(edge);
    stroke(() => { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }, colors[0]);
    channels = [];
  }
  channels.forEach((channel, i) => {
    const color = colors[i];
    if (channel.length === 2) {
      const [a, b] = channel.map(edge);
      const straight = a[0] === b[0] || a[1] === b[1];
      stroke(() => {
        ctx.moveTo(a[0], a[1]);
        if (straight) ctx.lineTo(b[0], b[1]);
        else ctx.quadraticCurveTo(cx, cy, b[0], b[1]);
      }, color);
    } else {
      for (const side of channel) {
        const [ex, ey] = edge(side);
        stroke(() => { ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); }, color);
      }
      const hub = width;
      ctx.beginPath();
      ctx.arc(cx, cy, hub, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = CASING;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, hub * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
    }
  });
  if (tile.spawn !== null && tile.spawn !== undefined) {
    pathStar(ctx, cx, cy, size * 0.34, size * 0.14);
    ctx.fillStyle = tile.spawn === 0 ? "#d9472b" : "#397eb5";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
  }
}

function blend(a, b, amount) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v * (1 - amount) + pb[i] * amount)).join(",")})`;
}

function drawFactory(ctx, x1, y1, s, kind) {
  const fire = kind === "Fire";
  const [body, dark, light] = fire ? ["#c0392b", "#6e1f15", "#ffb347"] : ["#3d8fcf", "#1d4f7a", "#e6f6ff"];
  ctx.fillStyle = blend(body, BOARD_BG, 0.75);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2;
  ctx.fillRect(x1 + 2, y1 + 2, s - 4, s - 4);
  ctx.strokeRect(x1 + 2, y1 + 2, s - 4, s - 4);
  if (fire) {
    ctx.fillStyle = dark;
    ctx.fillRect(x1 + s * 0.68, y1 + s * 0.1, s * 0.16, s * 0.35);
    ctx.fillStyle = "#9a9a9a";
    ctx.beginPath();
    ctx.ellipse(x1 + s * 0.78, y1 + s * 0.11, s * 0.14, s * 0.085, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(x1 + s * 0.66, y1 + s * 0.45);
    ctx.lineTo(x1 + s * 0.76, y1 + s * 0.06);
    ctx.lineTo(x1 + s * 0.86, y1 + s * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(x1 + s * 0.1, y1 + s * 0.45);
  ctx.lineTo(x1 + s * 0.5, y1 + s * 0.2);
  ctx.lineTo(x1 + s * 0.9, y1 + s * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = body;
  ctx.fillRect(x1 + s * 0.14, y1 + s * 0.45, s * 0.72, s * 0.45);
  ctx.strokeRect(x1 + s * 0.14, y1 + s * 0.45, s * 0.72, s * 0.45);
  const cx = x1 + s * 0.5;
  const cy = y1 + s * 0.68;
  if (fire) {
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.2);
    ctx.quadraticCurveTo(cx + s * 0.2, cy, cx + s * 0.1, cy + s * 0.15);
    ctx.lineTo(cx, cy + s * 0.2);
    ctx.lineTo(cx - s * 0.1, cy + s * 0.15);
    ctx.quadraticCurveTo(cx - s * 0.2, cy, cx, cy - s * 0.2);
    ctx.fill();
  } else {
    ctx.strokeStyle = light;
    ctx.lineWidth = 2;
    const r = s * 0.19;
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(cx - r * Math.cos(a), cy - r * Math.sin(a));
      ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      ctx.stroke();
    }
  }
}

function drawConstruction(ctx, x, y, size) {
  const pad = size * 0.06;
  const x0 = x + pad;
  const y0 = y + pad;
  const w = size - 2 * pad;
  ctx.fillStyle = "#f2b705";
  ctx.fillRect(x0, y0, w, w);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, w);
  ctx.clip();
  ctx.fillStyle = "#222";
  const stripe = size * 0.2;
  for (let a = x0 - w; a < x0 + w; a += stripe * 2) {
    ctx.beginPath();
    ctx.moveTo(a, y0 + w);
    ctx.lineTo(a + stripe, y0 + w);
    ctx.lineTo(a + stripe + w * 0.5, y0);
    ctx.lineTo(a + w * 0.5, y0);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, y0, w, w);
  const cx = x + size / 2;
  ctx.fillStyle = "#ff6a1a";
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.22, y + size * 0.76);
  ctx.lineTo(cx + size * 0.22, y + size * 0.76);
  ctx.lineTo(cx + size * 0.07, y + size * 0.2);
  ctx.lineTo(cx - size * 0.07, y + size * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.fillRect(cx - size * 0.13, y + size * 0.37, size * 0.26, size * 0.13);
  ctx.fillStyle = "#222";
  ctx.fillRect(cx - size * 0.27, y + size * 0.76, size * 0.54, size * 0.06);
}

function drawActionFace(ctx, x, y, size, name) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (name === "Construction") {
    drawConstruction(ctx, x, y, size);
  } else if (name === "Bomb") {
    const r = size * 0.28;
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(cx, cy + size * 0.08, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a6d3b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.6, cy - r * 0.5);
    ctx.lineTo(cx + r, cy - r * 1.3);
    ctx.stroke();
    ctx.fillStyle = "#e85b32";
    ctx.font = `bold ${Math.max(12, size * 0.22)}px sans-serif`;
    ctx.fillText("\u2733", cx + r * 1.1, cy - r * 1.45);
  } else if (name === "Doubleplay") {
    ctx.fillStyle = "#8e44ad";
    ctx.font = `bold ${Math.max(14, size * 0.34)}px sans-serif`;
    ctx.fillText("x2", cx, cy - size * 0.14);
    ctx.fillStyle = "#333";
    ctx.font = `bold ${Math.max(8, size * 0.12)}px sans-serif`;
    ctx.fillText("DOUBLE", cx, cy + size * 0.16);
    ctx.fillText("PLAY", cx, cy + size * 0.28);
  } else {
    ctx.fillStyle = "#333";
    ctx.font = `bold ${Math.max(9, size * 0.14)}px sans-serif`;
    ctx.fillText("MOVE", cx, cy - size * 0.18);
    ctx.font = `bold ${Math.max(16, size * 0.36)}px sans-serif`;
    ctx.fillText(name.split(" ")[1], cx, cy + size * 0.16);
  }
}

function drawCitizen(ctx, owner, cx, cy, radius, mood, alpha = 1, scale = 1) {
  const r = radius * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  const color = TEAM_COLORS[owner];
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  // Cowboy hat: dented crown, team-colored band, wide brim.
  const line = Math.max(1, r * 0.1);
  ctx.lineWidth = line;
  const hatBand = owner === 0 ? "#c0392b" : "#2f7fd6";
  ctx.strokeStyle = hatBand;
  ctx.fillStyle = owner === 0 ? "#ff9aa8" : "#8fd0ff";
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.5, cy - r * 0.68);
  ctx.lineTo(cx - r * 0.45, cy - r * 1.15);
  ctx.lineTo(cx - r * 0.15, cy - r * 1.2);
  ctx.lineTo(cx, cy - r * 1.02);
  ctx.lineTo(cx + r * 0.15, cy - r * 1.2);
  ctx.lineTo(cx + r * 0.45, cy - r * 1.15);
  ctx.lineTo(cx + r * 0.5, cy - r * 0.68);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hatBand;
  ctx.fillRect(cx - r * 0.49, cy - r * 0.88, r * 0.98, r * 0.2);
  ctx.fillStyle = owner === 0 ? "#ffb3bd" : "#b3e0ff";
  ctx.beginPath();
  ctx.ellipse(cx, cy - r * 0.65, r * 1.3, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (mood === "dead") {
    ctx.strokeStyle = "#222";
    ctx.lineWidth = Math.max(1, r * 0.1);
    const er = r * 0.14;
    for (const dx of [-0.35, 0.35]) {
      const ex = cx + dx * r;
      const ey = cy - r * 0.2;
      ctx.beginPath();
      ctx.moveTo(ex - er, ey - er); ctx.lineTo(ex + er, ey + er);
      ctx.moveTo(ex - er, ey + er); ctx.lineTo(ex + er, ey - er);
      ctx.stroke();
    }
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.42, r * 0.18, r * 0.175, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = "#fff";
  for (const dx of [-0.35, 0.35]) {
    ctx.beginPath();
    ctx.arc(cx + dx * r, cy - r * 0.2, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#222";
  for (const dx of [-0.35, 0.35]) {
    ctx.beginPath();
    ctx.arc(cx + dx * r, cy - r * 0.18, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = Math.max(1.2, r * 0.13);
  ctx.beginPath();
  if (mood === "scared") ctx.ellipse(cx, cy + r * 0.45, r * 0.18, r * 0.24, 0, 0, Math.PI * 2);
  else ctx.arc(cx, cy + r * 0.1, r * 0.45, 0.25 * Math.PI, 0.75 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- layout ---
function effectiveZoom() {
  if (zoom !== "auto") return zoom;
  return game && game.startingGridLocked() ? 1.8 : 1;
}

function layout() {
  const wrap = $("boardWrap");
  const base = Math.floor(Math.min(wrap.offsetWidth, wrap.offsetHeight) / BOARD_SIZE);
  appliedZoom = effectiveZoom();
  cell = Math.max(10, Math.floor(base * appliedZoom));
  const canvas = $("board");
  const css = cell * BOARD_SIZE;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${css}px`;
  canvas.style.height = `${css}px`;
  canvas.width = Math.round(css * dpr);
  canvas.height = Math.round(css * dpr);
  staticKey = "";
  wrap.scrollLeft = (css - wrap.clientWidth) / 2;
  wrap.scrollTop = (css - wrap.clientHeight) / 2;
  if (game) paintBoard();
}

function updateDerived() {
  if (!game || derived.version === game.version) return;
  const colors = new Map();
  for (const [p, list] of game.pipeColors()) colors.set(p, list.map((product) => FLOW_HEX[product]));
  const acting = game.actingPlayer();
  const human = !game.gameOver && !game.isCpu(acting);
  const threatened = new Set([...game.threatenedCitizens()].map((i) => game.citizens[i]));
  let place = new Set();
  let move = new Set();
  let legal = new Set();
  let rotate = new Set();
  let ownCitizens = new Set();
  if (human) {
    if (game.pendingPlacements.length) {
      place = game.placementCells(acting);
    } else if (game.hand && game.hand.startsWith("Move ") && !game.actionDone) {
      if (game.movingCitizen === null) {
        ownCitizens = new Set(game.citizens.filter((c) => c.owner === game.activePlayer));
      } else {
        move = game.currentMoveCells();
      }
    } else if (game.hand && game.hand in PIPE_CHANNELS && !game.actionDone) {
      const tile = game.currentTile();
      for (const p of game.pipeCandidateCells()) if (game.canPlacePipe(p, tile)) legal.add(p);
      rotate = game.rotationOnlyCells();
    }
  }
  derived = { version: game.version, colors, threatened, place, move, legal, rotate, ownCitizens };
}

function renderStatic() {
  const dpr = window.devicePixelRatio || 1;
  const size = cell * BOARD_SIZE;
  const key = `${game.version}|${cell}|${dpr}`;
  if (staticKey === key && staticLayer) return;
  staticKey = key;
  if (!staticLayer) staticLayer = document.createElement("canvas");
  staticLayer.width = Math.round(size * dpr);
  staticLayer.height = Math.round(size * dpr);
  const ctx = staticLayer.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = BOARD_BG;
  ctx.fillRect(0, 0, size, size);
  if (game.startingGridLocked()) {
    ctx.fillStyle = "rgba(60,50,30,0.13)";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(START_OFFSET * cell, START_OFFSET * cell, START_SIZE * cell, START_SIZE * cell);
    ctx.strokeStyle = "#8a6d3b";
    ctx.lineWidth = 2;
    ctx.strokeRect(START_OFFSET * cell, START_OFFSET * cell, START_SIZE * cell, START_SIZE * cell);
  }
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= BOARD_SIZE; i++) {
    ctx.moveTo(i * cell + 0.5, 0);
    ctx.lineTo(i * cell + 0.5, size);
    ctx.moveTo(0, i * cell + 0.5);
    ctx.lineTo(size, i * cell + 0.5);
  }
  ctx.stroke();

  const paintCells = (set, fill) => {
    ctx.fillStyle = fill;
    for (const p of set) {
      const [x, y] = xy(p);
      ctx.fillRect(x * cell + 1, y * cell + 1, cell - 1, cell - 1);
    }
  };
  paintCells(derived.place, "rgba(46,139,87,0.35)");
  paintCells(derived.move, "rgba(46,139,87,0.35)");
  for (const p of derived.legal) {
    const [x, y] = xy(p);
    ctx.fillStyle = "rgba(46,139,87,0.55)";
    ctx.beginPath();
    ctx.arc(x * cell + cell / 2, y * cell + cell / 2, Math.max(2, cell * 0.12), 0, Math.PI * 2);
    ctx.fill();
  }
  for (const p of derived.rotate) {
    const [x, y] = xy(p);
    const cx = x * cell + cell / 2;
    const cy = y * cell + cell / 2;
    const r = Math.max(4, cell * 0.2);
    const a0 = Math.PI * 0.15;
    const a1 = Math.PI * 1.65;
    ctx.strokeStyle = "rgba(46,139,87,0.85)";
    ctx.fillStyle = "rgba(46,139,87,0.85)";
    ctx.lineWidth = Math.max(2, cell * 0.06);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.stroke();
    const ex = cx + r * Math.cos(a1);
    const ey = cy + r * Math.sin(a1);
    const tx = -Math.sin(a1);
    const ty = Math.cos(a1);
    const h = Math.max(3, cell * 0.14);
    ctx.beginPath();
    ctx.moveTo(ex + tx * h, ey + ty * h);
    ctx.lineTo(ex - ty * h * 0.8, ey + tx * h * 0.8);
    ctx.lineTo(ex + ty * h * 0.8, ey - tx * h * 0.8);
    ctx.closePath();
    ctx.fill();
  }
  for (const p of game.blocks) {
    const [x, y] = xy(p);
    drawConstruction(ctx, x * cell, y * cell, cell);
  }
  for (const [p, tile] of game.board) {
    const [x, y] = xy(p);
    drawTile(ctx, x * cell, y * cell, cell, tile, derived.colors.get(p));
  }
  for (const [p, kind] of game.factories) {
    const [x, y] = xy(p);
    drawFactory(ctx, x * cell, y * cell, cell, kind);
  }
  if (game.previewCell && game.hand in PIPE_CHANNELS && !game.actionDone) {
    const [x, y] = xy(game.previewCell);
    const tile = game.currentTile();
    const ok = game.canPlacePipe(game.previewCell, tile);
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(x * cell, y * cell, cell, cell);
    drawTile(ctx, x * cell, y * cell, cell, tile);
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = ok ? "#2e8b57" : "#c0392b";
    ctx.strokeRect(x * cell + 1.5, y * cell + 1.5, cell - 3, cell - 3);
  }
  if (game.previewCell && game.pendingPlacements.length && game.placementKind === "citizen"
    && derived.place.has(game.previewCell)) {
    const [x, y] = xy(game.previewCell);
    const owner = game.pendingPlacements[game.placementIndex];
    ctx.save();
    ctx.globalAlpha = 0.6;
    drawCitizen(ctx, owner, x * cell + cell / 2, y * cell + cell / 2, cell * 0.39, "happy", 1, 1);
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#2e8b57";
    ctx.strokeRect(x * cell + 1.5, y * cell + 1.5, cell - 3, cell - 3);
  }
}

function drawFrame() {
  requestAnimationFrame(drawFrame);
  if (!game || document.hidden) return;
  paintBoard();
}

function paintBoard() {
  updateDerived();
  renderStatic();
  const canvas = $("board");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const size = cell * BOARD_SIZE;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(staticLayer, 0, 0, size, size);
  const t = performance.now();
  const now = t;
  game.effects = game.effects.filter((e) => t - e.t < 4000);

  // flowing product glow
  for (const e of game.effects) {
    if (e.kind !== "flow") continue;
    const age = t - e.t - e.delay;
    if (age < 0 || age > 500) continue;
    const [x, y] = xy(e.position);
    ctx.globalAlpha = 0.55 * (1 - age / 500);
    ctx.fillStyle = e.product === "Fire" ? "#ffd27a" : "#bfe6ff";
    ctx.fillRect(x * cell, y * cell, cell, cell);
    ctx.globalAlpha = 1;
  }

  // last-move markers
  game.marks.forEach((m, owner) => {
    if (!m) return;
    const pulse = 0.45 + 0.55 * Math.abs(Math.sin(now / 350));
    for (const item of m.items) {
      const [x, y] = xy(item.position);
      ctx.globalAlpha = pulse;
      ctx.lineWidth = Math.max(2, cell * 0.1);
      ctx.strokeStyle = item.color || TEAM_COLORS[owner];
      ctx.strokeRect(x * cell + 1.5, y * cell + 1.5, cell - 3, cell - 3);
      ctx.globalAlpha = 1;
    }
  });

  // placement / construction pulse
  for (const e of game.effects) {
    if (e.kind !== "pipe") continue;
    const age = t - e.t;
    if (age > 450) continue;
    const [x, y] = xy(e.position);
    ctx.globalAlpha = 1 - age / 450;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    const grow = (age / 450) * cell * 0.4;
    ctx.strokeRect(x * cell - grow, y * cell - grow, cell + 2 * grow, cell + 2 * grow);
    ctx.globalAlpha = 1;
  }

  const radius = cell * 0.39;
  for (const citizen of game.citizens) {
    let [x, y] = xy(citizen.position);
    let cx = x * cell + cell / 2;
    let cy = y * cell + cell / 2;
    let scale = 1;
    for (const e of game.effects) {
      if (e.citizen !== citizen) continue;
      const age = t - e.t;
      if (e.kind === "place" && age < 450) scale = 0.3 + 0.7 * Math.min(1, age / 300) + 0.2 * Math.sin((age / 450) * Math.PI);
      if (e.kind === "move") {
        const total = 140 * (e.path.length - 1);
        if (age < total) {
          const f = age / 140;
          const i = Math.min(e.path.length - 2, Math.floor(f));
          const [ax, ay] = xy(e.path[i]);
          const [bx, by] = xy(e.path[i + 1]);
          const k = f - i;
          cx = (ax + (bx - ax) * k) * cell + cell / 2;
          cy = (ay + (by - ay) * k) * cell + cell / 2;
        }
      }
    }
    if (derived.ownCitizens.has(citizen) || game.citizens[game.movingCitizen] === citizen) {
      ctx.strokeStyle = "#2e8b57";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawCitizen(ctx, citizen.owner, cx, cy, radius, derived.threatened.has(citizen) ? "scared" : "happy", 1, scale);
  }

  // citizens destroyed by production linger briefly
  for (const e of game.effects) {
    if (e.kind !== "kill") continue;
    const age = t - e.t;
    if (age > 1100) continue;
    const [x, y] = xy(e.position);
    const cx = x * cell + cell / 2;
    const cy = y * cell + cell / 2;
    const alpha = age < 500 ? 1 : Math.max(0, 1 - (age - 500) / 600);
    drawCitizen(ctx, e.owner, cx, cy, radius, "scared", alpha, 1);
    if (age >= 500) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#c0392b";
      ctx.lineWidth = 3;
      const d = radius * 0.8;
      ctx.beginPath();
      ctx.moveTo(cx - d, cy - d);
      ctx.lineTo(cx + d, cy + d);
      ctx.moveTo(cx + d, cy - d);
      ctx.lineTo(cx - d, cy + d);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  drawGuideHints(ctx, t);
}

// ---------------------------------------------------------------- panels ---
function drawCard(canvas, name, spawn, back) {
  const size = canvas.clientWidth || 70;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = back ? "#d8d2c4" : BOARD_BG;
  ctx.fillRect(0, 0, size, size);
  if (back) {
    ctx.fillStyle = "#8a8272";
    ctx.font = `bold ${size * 0.4}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", size / 2, size / 2);
    return;
  }
  if (name in PIPE_CHANNELS) {
    const tile = { name, rotation: 0, spawn: spawn ? game.activePlayer : null };
    const pad = size * 0.14;
    drawTile(ctx, pad, pad, size - 2 * pad, tile);
  } else {
    drawActionFace(ctx, 0, 0, size, name);
  }
}

function renderHand() {
  const owner = game.activePlayer;
  const reveal = !game.isCpu(owner) && !game.gameOver;
  const inPool = game.pool !== null;
  const tiles = inPool ? game.pool : game.hands[owner];
  const undoAt = reveal && game.canUndo() ? Math.min(game.undoStack[game.undoStack.length - 1].index, tiles.length) : -1;
  const key = JSON.stringify([tiles, game.selected, owner, reveal, game.rotation, game.hand, game.turnDone, game.actionDone, undoAt]);
  const title = game.gameOver ? "Game over"
    : inPool ? `${PLAYERS[owner]} - Doubleplay: play all, any order`
      : `${PLAYERS[owner]} - ${reveal ? "your hand" : "thinking..."}`;
  const titleEl = $("handTitle");
  titleEl.textContent = title;
  titleEl.style.background = TEAM_COLORS[owner];
  if (key === handKey) return;
  handKey = key;
  const container = $("hand");
  container.innerHTML = "";
  const addUndo = () => {
    const btn = document.createElement("canvas");
    btn.className = "card undo";
    btn.title = "Undo the last tile placement";
    container.appendChild(btn);
    requestAnimationFrame(() => {
      if (!game) return;
      const size = btn.clientWidth || 70;
      const dpr = window.devicePixelRatio || 1;
      btn.width = Math.round(size * dpr);
      btn.height = Math.round(size * dpr);
      const ctx = btn.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#fbe9c8";
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = "#8a5a12";
      ctx.fillStyle = "#8a5a12";
      ctx.lineWidth = size * 0.07;
      ctx.lineCap = "round";
      const cx = size / 2;
      const cy = size * 0.42;
      const r = size * 0.22;
      ctx.beginPath();
      const a0 = Math.PI * 0.25;
      const a1 = a0 - Math.PI * 1.5;
      ctx.arc(cx, cy, r, a0, a1, true);
      ctx.stroke();
      // Head sits at the arc end, pointing along the counter-clockwise tangent.
      const px = cx + r * Math.cos(a1);
      const py = cy + r * Math.sin(a1);
      const tx = Math.sin(a1);
      const ty = -Math.cos(a1);
      const nx = Math.cos(a1);
      const ny = Math.sin(a1);
      const h = size * 0.14;
      ctx.beginPath();
      ctx.moveTo(px + tx * h * 1.3, py + ty * h * 1.3);
      ctx.lineTo(px + nx * h, py + ny * h);
      ctx.lineTo(px - nx * h, py - ny * h);
      ctx.closePath();
      ctx.fill();
      ctx.font = `bold ${size * 0.18}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("UNDO", cx, size * 0.85);
    });
    btn.addEventListener("click", () => game.undo());
  };
  tiles.forEach((tile, i) => {
    if (i === undoAt) addUndo();
    const canvas = document.createElement("canvas");
    canvas.className = `card${game.selected === i ? " selected" : ""}`;
    container.appendChild(canvas);
    requestAnimationFrame(() => {
      if (!game) return;
      drawCard(canvas, tile.name, tile.spawn, !reveal);
      if (reveal && game.selected === i && tile.name in PIPE_CHANNELS) {
        // Show the current rotation on the selected card.
        const size = canvas.clientWidth || 70;
        const ctx = canvas.getContext("2d");
        const pad = size * 0.14;
        ctx.fillStyle = BOARD_BG;
        ctx.fillRect(0, 0, size, size);
        drawTile(ctx, pad, pad, size - 2 * pad, { name: tile.name, rotation: game.rotation, spawn: tile.spawn ? owner : null });
      }
    });
    if (reveal) canvas.addEventListener("click", () => game.selectTile(i));
  });
  if (undoAt === tiles.length) addUndo();
}

function renderScoreboard() {
  [0, 1].forEach((o) => {
    const el = $(`score${o}`);
    el.classList.toggle("active", o === game.actingPlayer() && !game.gameOver);
    $(`points${o}`).textContent = game.destroyed[1 - o];
    $(`bar${o}`).style.width = `${(100 * game.decks[o].length) / game.deckTotal}%`;
    $(`who${o}`).textContent = game.isCpu(o) ? `CPU ${game.difficulty[o]}` : "Human";
  });
}

function renderCycle() {
  const row = $("cycleRow");
  if (row.children.length !== 10) {
    row.innerHTML = "";
    for (let i = 1; i <= 10; i++) {
      const chip = document.createElement("div");
      chip.className = "chip " + (EVENT_SHORT[i] ? EVENT_SHORT[i].toLowerCase() : "");
      chip.innerHTML = `<b>${i}</b><span>${EVENT_SHORT[i] || ""}</span>`;
      row.appendChild(chip);
    }
  }
  [...row.children].forEach((chip, i) => chip.classList.toggle("now", i + 1 === game.eventPosition));

  const counts = $("countRow");
  const total = game.totalCycles;
  if (counts.children.length !== total) {
    counts.innerHTML = "";
    counts.style.gridTemplateColumns = `repeat(${total}, 1fr)`;
    for (let n = 1; n <= total; n++) {
      const chip = document.createElement("div");
      chip.className = "count";
      if (n === total) chip.classList.add("end");
      else if (n >= FULL_BOARD_CYCLES && (n - FULL_BOARD_CYCLES) % FACTORY_CYCLE_INTERVAL === 0) chip.classList.add("key");
      chip.innerHTML = `<b>${n}</b><i></i>`;
      counts.appendChild(chip);
    }
  }
  const done = Math.floor(game.eventSteps / EVENT_CYCLE_LENGTH);
  [...counts.children].forEach((chip, i) => {
    chip.classList.toggle("done", i < done);
    chip.classList.toggle("now", i === done && !game.gameOver);
    const first = (((game.cycleFirst + i - done) % 2) + 2) % 2;
    const tag = chip.querySelector("i");
    tag.textContent = first === 0 ? "FF" : "II";
    tag.className = first === 0 ? "ff" : "ii";
  });
}

function fitMessage() {
  const box = $("message");
  let size = 15;
  box.style.fontSize = `${size}px`;
  while (size > 8 && box.scrollHeight > box.clientHeight + 1) {
    size -= 0.5;
    box.style.fontSize = `${size}px`;
  }
}

function render() {
  if (!game) return;
  if (effectiveZoom() !== appliedZoom) layout();
  const acting = game.actingPlayer();
  const header = $("turn");
  header.style.background = TEAM_COLORS[acting];
  let text = `Turn: ${PLAYERS[game.activePlayer]}`;
  if (game.pendingPlacements.length) {
    text = `${PLAYERS[acting]}: place ${game.placementKind === "factory" ? "a factory" : "a citizen"}`;
  }
  if (game.gameOver) text = "Game over";
  header.textContent = text;
  $("message").textContent = game.message;
  fitMessage();
  renderScoreboard();
  renderCycle();
  renderHand();

  const human = !game.gameOver && !game.isCpu(acting);
  const playable = human && !game.pendingPlacements.length;
  $("rotateBtn").disabled = !(playable && game.hand && game.hand in PIPE_CHANNELS);
  $("discardBtn").disabled = !(playable && game.selected !== null && !game.actionDone && !game.tileHasValidMove());
  $("endBtn").disabled = !(playable && game.turnDone);
  $("endBtn").classList.toggle("ready", playable && game.turnDone);

  if (game.gameOver) {
    if (!overShown) {
      overShown = true;
      showGameOver();
    }
  } else {
    scheduleCpu();
  }
}

function scheduleCpu() {
  if (cpuTimer !== null || game.gameOver || !game.isCpu(game.actingPlayer())) return;
  cpuTimer = setTimeout(() => {
    cpuTimer = null;
    if (!game || game.gameOver) return;
    game.cpuStep();
    render();
  }, Math.max(1, Math.round(600 / settings.speed)));
}

// -------------------------------------------------------------- overlays ---
function showOverlay(id) {
  for (const el of document.querySelectorAll(".panel")) el.hidden = el.id !== id;
  $("overlay").hidden = !id;
}

function hideOverlay() {
  $("overlay").hidden = true;
}

function showGameOver() {
  const g = game;
  const living = [0, 1].map((o) => g.citizens.filter((c) => c.owner === o).length);
  const banner = g.winner === null ? "#444" : TEAM_COLORS[g.winner];
  const result = g.result;
  const card = (o) => {
    const product = FACTORIES_BY_OWNER[o];
    const counts = Object.entries(g.tilePlayCounts[o]).map(([n, c]) => `${n}: ${c}`).join("<br>");
    return `<div class="sumcard${o === g.winner ? " win" : ""}" style="background:${TEAM_TINTS[o]};border-color:${TEAM_COLORS[o]}">
      <b style="color:${TEAM_COLORS[o]}">${PLAYERS[o]}</b>
      <div class="big" style="color:${TEAM_COLORS[o]}">${g.scores[o]}</div>
      <small>citizens destroyed</small>
      <small>Lost: ${g.destroyed[o]} &nbsp; Alive: ${living[o]}</small>
      <small><b style="color:${TEAM_COLORS[o]}">Decimal Alive Score: ${g.decimalScores[o].toFixed(2)}</b></small>
      <small class="left">Tiles played:<br>${counts}<br><br>${product} pipes at end: ${g.finalPipeProductCounts[product]}<br>Most ${product} pipes: ${g.highestPipeProductCounts[product]}</small>
    </div>`;
  };
  $("overBody").innerHTML = `<h2 style="background:${banner}">GAME OVER</h2>
    <p class="result" style="color:${banner}">${result}</p>
    <p>Most citizens destroyed in one turn: ${g.maxCitizensDestroyedInTurn}</p>
    <div class="sumrow">${card(0)}${card(1)}</div>`;
  showOverlay("overPanel");
}

function startGame() {
  if (cpuTimer !== null) { clearTimeout(cpuTimer); cpuTimer = null; }
  const modeToCpu = (mode) => mode !== "Human";
  const modeToLevel = (mode) => (mode.startsWith("CPU ") ? mode.slice(4) : "Normal");
  game = new Game({
    totalCycles: settings.cycles,
    cpu: [modeToCpu(settings.p0), modeToCpu(settings.p1)],
    difficulty: [modeToLevel(settings.p0), modeToLevel(settings.p1)],
  });
  game.onChange = render;
  overShown = false;
  derived = { version: -1 };
  handKey = "";
  staticKey = "";
  hideOverlay();
  layout();
  render();
}

function setupSetupPanel() {
  const lengths = $("lengths");
  for (const cycles of GAME_LENGTHS) {
    const label = document.createElement("label");
    label.className = "seg";
    label.innerHTML = `<input type="radio" name="len" value="${cycles}"><span>${cycles} cycles</span>`;
    lengths.appendChild(label);
  }
  for (const id of ["p0", "p1"]) {
    const select = $(`${id}mode`);
    for (const mode of PLAYER_MODES) select.add(new Option(mode, mode));
  }
  const sync = () => {
    for (const input of lengths.querySelectorAll("input")) input.checked = Number(input.value) === settings.cycles;
    $("p0mode").value = settings.p0;
    $("p1mode").value = settings.p1;
    $("speed").value = String(settings.speed);
  };
  sync();
  lengths.addEventListener("change", (e) => { settings.cycles = Number(e.target.value); saveSettings(); });
  $("p0mode").addEventListener("change", (e) => { settings.p0 = e.target.value; saveSettings(); });
  $("p1mode").addEventListener("change", (e) => { settings.p1 = e.target.value; saveSettings(); });
  $("speed").addEventListener("change", (e) => { settings.speed = Number(e.target.value); saveSettings(); });
  $("startBtn").addEventListener("click", startGame);
  $("rulesBtn").addEventListener("click", () => { $("rulesBack").dataset.back = "setupPanel"; showOverlay("rulesPanel"); openTutorial(); });
  $("menuRules").addEventListener("click", () => { $("rulesBack").dataset.back = "menuPanel"; showOverlay("rulesPanel"); openTutorial(); });
  $("setupTutorialBtn").addEventListener("click", () => startGuide("setupPanel"));
  $("menuTutorial").addEventListener("click", () => startGuide("menuPanel"));
  $("rulesBack").addEventListener("click", () => {
    const back = $("rulesBack").dataset.back;
    if (back === "title") hideOverlay(); else showOverlay(back);
  });
  $("menuBtn").addEventListener("click", () => showOverlay("menuPanel"));
  $("menuClose").addEventListener("click", hideOverlay);
  $("menuNew").addEventListener("click", () => { sync(); showOverlay("setupPanel"); });
  $("overNew").addEventListener("click", () => { sync(); showOverlay("setupPanel"); });
  $("overClose").addEventListener("click", hideOverlay);
  $("menuSpeed").addEventListener("change", (e) => { settings.speed = Number(e.target.value); saveSettings(); });
  $("menuSpeed").value = String(settings.speed);
  $("menuBtn").addEventListener("click", () => { $("menuSpeed").value = String(settings.speed); });
}

function setupControls() {
  $("board").addEventListener("click", (e) => {
    if (!game) return;
    const rect = $("board").getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * BOARD_SIZE);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * BOARD_SIZE);
    if (inBounds(x, y)) game.onBoardTap(pos(x, y));
  });
  $("rotateBtn").addEventListener("click", () => game && game.rotateTile());
  $("discardBtn").addEventListener("click", () => game && !game.isCpu(game.activePlayer) && game.discardSelected());
  $("endBtn").addEventListener("click", () => game && game.endTurn());
  $("zoomBtn").addEventListener("click", () => {
    const order = ["auto", 1, 1.6, 2.2];
    zoom = order[(order.indexOf(zoom) + 1) % order.length];
    $("zoomBtn").textContent = `\u{1F50D} ${zoom === "auto" ? "Auto" : `${zoom}x`}`;
    layout();
    if (game) render();
  });
  window.addEventListener("resize", () => { layout(); handKey = ""; if (game) render(); });
  if (window.ResizeObserver) {
    let lastW = 0;
    let lastH = 0;
    new ResizeObserver(() => {
      const wrap = $("boardWrap");
      if (wrap.offsetWidth === lastW && wrap.offsetHeight === lastH) return;
      lastW = wrap.offsetWidth;
      lastH = wrap.offsetHeight;
      if (lastW > 0 && lastH > 0) layout();
    }).observe($("boardWrap"));
  }
  window.addEventListener("keydown", (e) => {
    if (!game) return;
    if (e.key === "r" || e.key === "R") game.rotateTile();
    if (e.key === "e" || e.key === "E") game.endTurn();
  });
}

window.addEventListener("load", () => {
  setupSetupPanel();
  setupControls();
  setupTutorial();
  setupGuide();
  layout();
  requestAnimationFrame(drawFrame);
  showOverlay(null);
  $("title").hidden = false;
  renderTitle();
  window.addEventListener("resize", renderTitle);
  $("titleStart").addEventListener("click", () => { $("title").hidden = true; showOverlay("setupPanel"); });
  $("titleRules").addEventListener("click", () => {
    $("rulesBack").dataset.back = "title";
    showOverlay("rulesPanel");
    openTutorial();
  });
  $("titleTutorial").addEventListener("click", () => startGuide("title"));
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
});
