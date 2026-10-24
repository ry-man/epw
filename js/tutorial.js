"use strict";
// Illustrated "How to Play" guide. Mirrors the desktop tutorial: same pages, diagrams and text.
// Diagrams are drawn with the real game graphics (drawTile, drawFactory, ... from ui.js).

const T_INK = "#2b2b2b";
const T_FIRE = "#e0452a";
const T_ICE = "#2f8fd8";

class Pen {
  constructor(ctx, cell) {
    this.ctx = ctx;
    this.C = cell;
  }

  font(size, bold = true) {
    return `${bold ? "bold " : ""}${Math.round(size * 4 / 3)}px "Segoe UI", system-ui, sans-serif`;
  }

  grid(cols, rows, shaded = []) {
    const { ctx, C } = this;
    const set = new Set(shaded.map(([x, y]) => `${x},${y}`));
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#d5d1c6";
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = set.has(`${x},${y}`) ? "#eee9d8" : "#f7f5ef";
        ctx.fillRect(x * C, y * C, C, C);
        ctx.strokeRect(x * C + 0.5, y * C + 0.5, C, C);
      }
    }
  }

  tint(x, y, color, outline = "") {
    const { ctx, C } = this;
    ctx.fillStyle = color;
    ctx.fillRect(x * C + 1, y * C + 1, C - 2, C - 2);
    if (outline) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = outline;
      ctx.strokeRect(x * C + 1, y * C + 1, C - 2, C - 2);
    }
  }

  rot(name, ports) {
    const wanted = [...ports].sort().join("");
    for (let r = 0; r < 4; r++) {
      if ([...TILE_INFO.get(`${name}|${r}`).ports].sort().join("") === wanted) return r;
    }
    return 0;
  }

  pipe(x, y, name, ports = null, product = null, spawn = null) {
    const rotation = ports ? this.rot(name, ports) : 0;
    const tile = { name, rotation, spawn };
    let colors;
    if (product !== null) {
      const n = TILE_INFO.get(`${name}|${rotation}`).channels.length;
      const products = Array.isArray(product) ? product : Array(n).fill(product);
      colors = products.map((q) => FLOW_HEX[q]);
    }
    drawTile(this.ctx, x * this.C, y * this.C, this.C, tile, colors);
  }

  factory(x, y, kind) {
    drawFactory(this.ctx, x * this.C, y * this.C, this.C, kind);
  }

  citizen(x, y, owner, mood = "happy") {
    drawCitizen(this.ctx, owner, (x + 0.5) * this.C, (y + 0.5) * this.C, this.C * 0.39, mood);
  }

  // Coordinates are in cells unless raw is true.
  text(x, y, s, size = 10, color = T_INK, bold = true, anchor = "center", raw = false) {
    const { ctx } = this;
    const px = raw ? x : x * this.C;
    const py = raw ? y : y * this.C;
    ctx.font = this.font(size, bold);
    ctx.fillStyle = color;
    ctx.textAlign = anchor === "w" ? "left" : "center";
    ctx.textBaseline = "middle";
    const lines = s.split("\n");
    const lh = size * 4 / 3 * 1.3;
    lines.forEach((line, i) => ctx.fillText(line, px, py + (i - (lines.length - 1) / 2) * lh));
  }

  arrow(x0, y0, x1, y1, color = "#555555") {
    const { ctx, C } = this;
    const ax = x0 * C, ay = y0 * C, bx = x1 * C, by = y1 * C;
    const ang = Math.atan2(by - ay, bx - ax);
    const head = 14;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx - Math.cos(ang) * 8, by - Math.sin(ang) * 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - head * Math.cos(ang - 0.45), by - head * Math.sin(ang - 0.45));
    ctx.lineTo(bx - head * Math.cos(ang + 0.45), by - head * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
  }

  badge(x, y, ok) {
    const { ctx, C } = this;
    const r = C * 0.2;
    const cx = x * C, cy = y * C;
    ctx.fillStyle = ok ? "#2e9c57" : "#d03030";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.round(r * 1.3 * 4 / 3)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ok ? "\u2713" : "\u2717", cx, cy);
  }

  // Card positions are in pixels.
  card(px, py, size, name, owner = 0, spawn = false, hidden = false) {
    const { ctx } = this;
    if (hidden) {
      ctx.fillStyle = "#555a66";
      ctx.fillRect(px, py, size, size);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#2b2e36";
      ctx.strokeRect(px, py, size, size);
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(size * 0.5 * 4 / 3)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", px + size / 2, py + size / 2);
      return;
    }
    ctx.fillStyle = owner === 0 ? "#fdeee9" : "#e8f3fc";
    ctx.fillRect(px, py, size, size);
    ctx.lineWidth = 3;
    ctx.strokeStyle = owner === 0 ? T_FIRE : T_ICE;
    ctx.strokeRect(px, py, size, size);
    if (name in PIPE_CHANNELS) {
      drawTile(ctx, px + 4, py + 4, size - 8, { name, rotation: 0, spawn: spawn ? owner : null });
    } else {
      drawActionFace(ctx, px, py, size, name);
    }
  }
}

function halfDisc(ctx, x, y, rad, outline) {
  ctx.fillStyle = T_FIRE;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, rad, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = T_ICE;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, rad, -Math.PI / 2, Math.PI / 2);
  ctx.closePath();
  ctx.fill();
  if (outline) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function reachable(sources, blocked, cols, rows, steps) {
  const reach = new Map();
  for (const src of sources) {
    const seen = new Map([[src.join(","), 0]]);
    const queue = [src];
    while (queue.length) {
      const cur = queue.shift();
      const d = seen.get(cur.join(","));
      if (d === steps) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = [cur[0] + dx, cur[1] + dy];
        const key = n.join(",");
        if (n[0] >= 0 && n[0] < cols && n[1] >= 0 && n[1] < rows && !seen.has(key) && !blocked.has(key)) {
          seen.set(key, d + 1);
          queue.push(n);
        }
      }
    }
    for (const key of seen.keys()) reach.set(key, true);
  }
  return [...reach.keys()].map((k) => k.split(",").map(Number));
}

// ---------------------------------------------------------------- diagrams

function dGoal(p) {
  p.grid(8, 4);
  p.factory(0, 1, "Fire");
  for (let x = 1; x < 6; x++) p.pipe(x, 1, "Straight", "LR", "Fire");
  p.citizen(6, 1, 1, "dead");
  p.text(3.5, 0.3, "Fire flows down the pipe...", 10, "#b02a14");
  p.text(6.5, 0.3, "...and destroys\nthe enemy!", 9, "#b02a14");
  p.factory(7, 3, "Water");
  for (let x = 2; x < 7; x++) p.pipe(x, 3, "Straight", "LR", "Water");
  p.citizen(1, 3, 0, "dead");
  p.text(4.5, 2.35, "Water does the same to the Fire Folk", 10, "#1d5f94");
}

function dBoard(p) {
  const shaded = [];
  for (let x = 2; x < 10; x++) for (let y = 1; y < 9; y++) shaded.push([x, y]);
  p.grid(12, 10, shaded);
  p.factory(4, 3, "Fire");
  p.factory(7, 6, "Water");
  p.text(6, 4.5, "STARTING GRID", 12, "#7a6a30");
  p.text(6, 5.1, "(early game: play stays inside)", 9, "#7a6a30", false);
  p.text(6, 0.9, "The full board opens after 2 event cycles", 10, "#555555", false);
}

function dHand(p) {
  const s = 92;
  p.text(0.1, 0.35, "YOUR HAND", 10, T_FIRE, true, "w");
  p.card(10, 36, s, "Straight");
  p.card(10 + s + 14, 36, s, "Bomb");
  p.card(10 + 2 * (s + 14), 36, s, "Move 2");
  p.text(0.1, 0.35 + 2.0, "OPPONENT'S HAND (hidden from you)", 10, T_ICE, true, "w");
  for (let i = 0; i < 3; i++) p.card(10 + i * (s + 14), 36 + 2.0 * p.C + 4, s, "", 1, false, true);
  p.text(6.2, 1.1, "Tap a card\nto select it", 11, T_INK);
  p.arrow(4.5, 0.25, 4.5, 0.48);
  p.text(6.2, 3.4, "No legal move?\nDiscard and draw a\nreplacement now", 10, "#555555", false);
}

function dTurn(p) {
  p.grid(19, 4);
  const good = "#b9e5b9", goodEdge = "#2e8b57", bad = "#f4b4b4", badEdge = "#c0392b";

  p.factory(0, 1, "Fire");
  p.pipe(1, 1, "Straight", "LR", "Fire");
  p.tint(2, 1, good, goodEdge);
  p.pipe(2, 1, "Straight", "LR");
  p.badge(2.85, 1.15, true);
  p.text(1.75, 4.5, "Valid: an open end may\nface an empty space", 9, "#2e7d4a");

  p.factory(4, 1, "Fire");
  p.pipe(5, 1, "Straight", "LR", "Fire");
  p.tint(6, 1, good, goodEdge);
  p.pipe(6, 1, "Turn", "LU");
  p.badge(6.85, 1.15, true);
  p.text(5.5, 4.5, "Valid: a turn connects\nwhile its other port is open", 9, "#2e7d4a");

  p.factory(8, 1, "Fire");
  p.pipe(9, 1, "Straight", "LR", "Fire");
  p.tint(10, 1, bad, badEdge);
  p.pipe(10, 1, "Straight", "UD");
  p.badge(10.85, 1.15, false);
  p.text(9, 4.5, "Invalid: open side faces\na closed side", 9, "#b02a14");

  p.factory(12, 1, "Fire");
  p.pipe(13, 1, "Straight", "LR", "Fire");
  p.tint(14, 1, bad, badEdge);
  p.pipe(14, 1, "Straight", "LR");
  p.factory(15, 1, "Water");
  p.badge(14.85, 1.15, false);
  p.text(13.5, 4.5, "Invalid: joins Fire\nand Water", 9, "#b02a14");

  p.tint(18, 1, bad, badEdge);
  p.pipe(18, 1, "Straight", "LR");
  p.badge(18.85, 1.15, false);
  p.text(17.5, 4.5, "Invalid: no connection\nto a pipe or factory", 9, "#b02a14");
}

function dPipes(p) {
  const cell = 96;
  const { ctx } = p;
  Object.keys(PIPE_CHANNELS).forEach((name, i) => {
    const x = 48 + (i % 3) * cell;
    const y = 8 + Math.floor(i / 3) * 122;
    ctx.fillStyle = "#f7f5ef";
    ctx.fillRect(x, y, cell, cell);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#d5d1c6";
    ctx.strokeRect(x + 0.5, y + 0.5, cell, cell);
    drawTile(ctx, x, y, cell, { name, rotation: 0, spawn: null });
    p.text(x + cell / 2, y + cell + 10, name, 10, T_INK, true, "center", true);
  });
}

function dConnect(p) {
  p.grid(8, 4);
  p.pipe(0, 0, "Straight", "LR");
  p.pipe(1, 0, "Straight", "LR");
  p.badge(1.0, 0.2, true);
  p.pipe(4, 0, "Straight", "LR");
  p.pipe(5, 0, "Straight", "UD");
  p.badge(5.0, 0.2, false);
  p.text(1.0, 1.15, "Ends line up", 10, "#2e7d4a");
  p.text(5.0, 1.15, "Ports don't match", 10, "#b02a14");
  p.factory(0, 3, "Fire");
  p.pipe(1, 3, "Straight", "LR", "Fire");
  p.pipe(2, 3, "Straight", "LR");
  p.badge(2.5, 3.0, false);
  p.pipe(3, 3, "Straight", "LR", "Water");
  p.factory(4, 3, "Water");
  p.text(4.0, 4.35, "A pipe channel can never carry\nboth Fire and Water", 10, "#b02a14");
}

function dCrossing(p) {
  const cell = 100;
  p.C = cell;
  p.ctx.fillStyle = "#f7f5ef";
  p.ctx.fillRect(0, 0, 4 * cell, cell + 70);
  p.pipe(0, 0, "Plus", "LURD", "Fire");
  p.pipe(2, 0, "Cross", "LURD", ["Fire", "Water"]);
  p.text(cell, cell + 12, "PLUS", 11, T_INK, true, "center", true);
  p.text(cell, cell + 38, "all four sides join:\none shared pipe", 9, T_INK, false, "center", true);
  p.text(3 * cell, cell + 12, "CROSS", 11, T_INK, true, "center", true);
  p.text(3 * cell, cell + 38, "one pipe bridges over the other:\ntwo separate pipes", 9, T_INK, false, "center", true);
}

function dSpawn(p) {
  p.grid(9, 7);
  const sources = [[4, 3], [1, 5]];
  const occupied = new Set(["5,3", "1,5", "4,3"]);
  const citizens = new Set(["3,2", "4,5"]);
  const srcKeys = new Set(sources.map((s) => s.join(",")));
  for (const [x, y] of reachable(sources, new Set(), 9, 7, 2)) {
    const key = `${x},${y}`;
    if (!occupied.has(key) && !srcKeys.has(key) && !citizens.has(key)) p.tint(x, y, "#f6c9bd");
  }
  p.factory(4, 3, "Fire");
  p.pipe(5, 3, "Straight", "LR", "Fire");
  p.pipe(1, 5, "Straight", "LR", null, 0);
  p.citizen(3, 2, 0);
  p.citizen(4, 5, 0);
  p.text(7.2, 3.0, "Pipes don't block\nplacement range", 9, "#555555");
  p.text(6.8, 0.6, "Shaded = where a Fire citizen\nmay appear (2 steps)", 9, "#b02a14");
  p.text(4.5, 7.25, "Star pipe = spawn point", 9, "#b02a14");
}

function dBomb(p) {
  p.grid(8, 3);
  p.pipe(0, 0, "Straight", "LR", "Fire");
  p.card(1.2 * p.C, 0.1 * p.C, p.C * 0.8, "Bomb");
  p.arrow(2.1, 0.5, 2.9, 0.5);
  p.text(4.0, 0.5, "pipe removed", 10, T_INK);
  p.pipe(0, 1, "Straight", "LR", "Water");
  p.card(1.2 * p.C, 1.1 * p.C, p.C * 0.8, "Construction");
  p.arrow(2.1, 1.5, 2.9, 1.5);
  drawConstruction(p.ctx, 3 * p.C, 1 * p.C, p.C);
  p.text(5.6, 1.5, "permanent: bombs and\nother tiles can't remove it", 10, T_INK);
  p.factory(0, 2, "Fire");
  p.pipe(1, 2, "Straight", "LR", "Fire");
  p.badge(1.5, 2.15, false);
  p.text(5.0, 2.5, "A pipe leaving a factory can't be built over", 10, "#b02a14");
}

function dMove(p) {
  p.grid(8, 4);
  const start = [1, 2];
  const walls = [0, 1, 2, 3].map((y) => [3, y]);
  const blocked = new Set(walls.map((w) => w.join(",")));
  for (const [x, y] of reachable([start], blocked, 8, 4, 2)) {
    if (!(x === start[0] && y === start[1])) p.tint(x, y, "#c5ecc5");
  }
  for (const [x, y] of walls) p.pipe(x, y, "Straight", "UD");
  p.citizen(start[0], start[1], 0);
  p.badge(5.5, 2.5, false);
  p.text(5.5, 1.5, "can't cross\npipes", 9, "#b02a14");
  p.text(1.5, 0.35, "Move 2: any green space\nup to 2 steps away", 9, "#2e7d4a");
}

function dDouble(p) {
  const s = 72, gap = 10;
  const y1 = 10, y2 = 10 + s + 70;
  const row = (y, names) => {
    let x = 10;
    for (const name of names) {
      p.card(x, y, s, name);
      x += s + gap;
    }
    return x;
  };
  const note = (y, s2) => p.text(10, y, s2, 9, "#555555", false, "w", true);

  let x = row(y1, ["Doubleplay", "Straight", "Move 1"]);
  p.text(x / p.C + 0.4, (y1 + s / 2) / p.C, "= play all 3,\nin any order", 10, T_INK, true, "w");
  note(y1 + s + 14, "Play the Doubleplay, then the other two tiles in your hand.");
  row(y2, ["Doubleplay", "Doubleplay", "Bomb"]);
  x = 10 + 3 * (s + gap);
  p.arrow(x / p.C, (y2 + s / 2) / p.C, (x + 40) / p.C, (y2 + s / 2) / p.C);
  for (let i = 0; i < 2; i++) p.card(x + 52 + i * (s + gap), y2, s, "?", 1, false, true);
  note(y2 + s + 14, "A second Doubleplay isn't played - draw up to 2 fresh tiles to play instead.");
}

function dCycle(p) {
  const { ctx } = p;
  const cx = 150, cy = 150, r = 105;
  ctx.fillStyle = "#f1efe6";
  ctx.strokeStyle = "#c9c4b4";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const palette = { 4: "both", 6: T_FIRE, 8: T_FIRE, 7: T_ICE, 9: T_ICE, 10: "gold" };
  for (let n = 1; n <= 10; n++) {
    const ang = -Math.PI / 2 + (n - 1) * 2 * Math.PI / 10;
    const x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang);
    const k = palette[n];
    if (k === "both") {
      halfDisc(ctx, x, y, 21, true);
    } else {
      ctx.fillStyle = k || "#d9d5c6";
      ctx.beginPath();
      ctx.arc(x, y, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    }
    p.text(x, y, String(n), 13, k && k !== "gold" ? "#fff" : T_INK, true, "center", true);
  }
  p.text(cx, cy - 10, "EVENT", 12, T_INK, true, "center", true);
  p.text(cx, cy + 12, "CYCLE", 12, T_INK, true, "center", true);
  const lines = [
    [null, "Counter moves 1 space each time\nboth players have taken a turn."],
    ["both", "Space 4: BOTH place a citizen"],
    [T_FIRE, "Spaces 6 & 8: Fire Folk place a citizen"],
    [T_ICE, "Spaces 7 & 9: Ice Inhabitants place a citizen"],
    ["gold", "Space 10: factories PRODUCE"],
  ];
  let y = 55;
  for (const [color, line] of lines) {
    if (color === "both") {
      halfDisc(ctx, 327, y, 9, false);
    } else if (color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(327, y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    if (color) p.text(346, y, line, 10, T_INK, true, "w", true);
    else p.text(318, y, line, 10, T_INK, false, "w", true);
    y += color === null ? 46 : 40;
  }
}

function dProduction(p) {
  p.grid(9, 4);
  p.factory(0, 1, "Fire");
  for (let x = 1; x < 5; x++) p.pipe(x, 1, "Straight", "LR", "Fire");
  for (const [x, y] of [[5, 1], [6, 1], [5, 2], [6, 2]]) {
    p.tint(x, y, "#fbd9cf");
    p.citizen(x, y, 1, "dead");
  }
  p.citizen(8, 3, 1);
  p.citizen(2, 2, 0);
  p.text(5.5, 0.4, "At the pipe's open end...", 9, "#b02a14");
  p.text(6.0, 3.3, "...touching citizens\nof the same team die too", 9, "#b02a14");
  p.text(8.0, 2.35, "safe", 9, "#2e7d4a");
}

function dFactories(p) {
  p.grid(10, 5);
  p.factory(1, 2, "Fire");
  for (let x = 2; x < 5; x++) p.pipe(x, 2, "Straight", "LR", "Fire");
  p.factory(5, 2, "Water");
  p.badge(5.5, 2.0, false);
  p.factory(8, 3, "Water");
  p.badge(8.5, 3.0, true);
  p.text(5.5, 1.3, "touches a fire pipe", 9, "#b02a14");
  p.text(8.0, 5.3, "legal spot", 9, "#2e7d4a");
  p.text(5.0, 0.5, "New factories can go anywhere on the open board", 10, T_INK);
}

function dWinning(p) {
  const { ctx } = p;
  [["Fire Folk", T_FIRE, "#fdeee9", 7, 5], ["Ice Inhabitants", T_ICE, "#e8f3fc", 5, 7]].forEach(
    ([name, color, tint, score, lost], i) => {
      const x = 20 + i * 250;
      ctx.fillStyle = tint;
      ctx.fillRect(x, 20, 220, 150);
      ctx.lineWidth = i === 0 ? 4 : 2;
      ctx.strokeStyle = color;
      ctx.strokeRect(x, 20, 220, 150);
      ctx.fillStyle = color;
      ctx.fillRect(x, 20, 220, 24);
      p.text(x + 110, 32, name, 10, "#fff", true, "center", true);
      p.text(x + 110, 90, String(score), 29, color, true, "center", true);
      p.text(x + 110, 135, "citizens destroyed", 9, "#555555", false, "center", true);
      p.text(x + 110, 152, `Lost: ${lost}`, 9, "#555555", false, "center", true);
    },
  );
  p.text(130, 10, "\u2605 WINNER \u2605", 11, "#c58a00", true, "center", true);
}

// ---------------------------------------------------------------- pages

const TUTORIAL_PAGES = [
  ["The Goal", [448, 224, 56], dGoal, [
    "Two rival societies fight over a pipe-filled city: the Fire Folk (FF) and the Ice Inhabitants (II).",
    "Build pipes from your factory. Whenever the factories produce, fire or water rushes down the pipes "
    + "and destroys any enemy citizen standing at an open pipe end.",
    "Every enemy citizen destroyed is a point for you. The game ends after the chosen number of cycles "
    + "or when both players run out of tiles; the higher score wins (a tie is a draw).",
  ]],
  ["The Board", [408, 340, 34], dBoard, [
    "The board is a 20x20 grid. Each team starts with one factory (fire for FF, water for II) inside the "
    + "8x8 starting grid in the middle.",
    "For the first 2 event cycles - the early game - everything must stay inside the starting grid. "
    + "After that the whole board opens up.",
  ]],
  ["Your Hand", [560, 340, 60], dHand, [
    "Your hand is filled to 3 tiles from your own shuffled deck while tiles remain. Your opponent "
    + "cannot see your hand.",
    "Play a selected tile if it has a legal move. You may discard it only when no legal move exists; "
    + "the discarded tile is removed from the game and replaced from your deck immediately, without "
    + "ending your turn. At turn end, refill your hand to 3 if possible.",
    "Only the player whose turn it is sees their cards face-up.",
  ]],
  ["Placing a Pipe", [790, 205, 40], dTurn, [
    "A pipe must go on an empty board space and make at least one open connection to an existing "
    + "pipe or factory. During the first 2 event cycles, it must also be inside the starting grid.",
    "At every side where two pipe tiles touch, both sides must have an opening or both must be closed. "
    + "Open ports may face empty spaces; you do not have to fill every port.",
    "Even matching openings are invalid if they connect Fire and Water. The examples show two legal "
    + "placements and three common reasons a placement is illegal.",
    "Select a pipe card, tap a space to preview, press Rotate, then tap that same space "
    + "again to place it. A flash marks each player's last move.",
  ]],
  ["Pipe Tiles", [384, 260, 96], dPipes, [
    "There are 6 kinds of pipe tile. Every tile can be rotated before placing, so a Turn can bend "
    + "either way and a Double turn can be flipped to either diagonal. None has a dead end - "
    + "fire or water entering a tile always has a way out.",
    "Each pipe type has spawning-point copies equal to 10% of its deck count, rounded up. They are "
    + "marked with a star in your team color.",
    "Per deck: Turn 50, Straight 25, Junction 40, Plus 20, Cross 20, and Double turn 20.",
  ]],
  ["Connecting Pipes", [480, 280, 60], dConnect, [
    "Wherever two pipes touch, either both have an opening there or neither does. That means you can "
    + "never create a mismatched connection. A tile must still make at least one open connection to "
    + "an existing pipe or factory; other open ports may face empty spaces.",
    "A connected pipe channel may carry Fire or Water, never both. Pipes are colored red (Fire), "
    + "blue (Water), or grey (not connected to a factory).",
  ]],
  ["Plus vs. Cross", [400, 170, 100], dCrossing, [
    "Plus and Cross look similar but behave very differently.",
    "With a Plus, all four sides join into one pipe, so whatever flows in comes out of every side. "
    + "With a Cross, a left-right pipe passes over an up-down pipe - they never mix, so each can carry "
    + "a different element. Double turns work like Cross, with bent pipes.",
  ]],
  ["Citizens and Spawning", [432, 360, 48], dSpawn, [
    "At citizen events, place each new citizen within 2 cardinal steps of one of your factories or "
    + "star pipes. Count up/down/left/right; intervening pipes, citizens, and construction sites do not "
    + "block the distance.",
    "The destination must be blank. During the early game, it must also be inside the starting grid.",
    "If there is no open space, that citizen is destroyed immediately and counts for your opponent!",
    "If a star pipe is destroyed or replaced, it no longer provides a spawn point.",
  ]],
  ["Bombs and Construction", [512, 192, 64], dBomb, [
    "Bomb: destroys any one pipe. There are 15 Bomb tiles in each deck.",
    "Construction: replaces any pipe with a permanent barricade. Nothing can be built or moved onto it "
    + "for the rest of the game, and neither bombs nor other construction tiles can remove it. It can't "
    + "replace a pipe whose opening connects directly to a factory. Each deck has 5 Construction tiles.",
  ]],
  ["Moving Citizens", [448, 224, 56], dMove, [
    "Move 1, Move 2 and Move 3 let you move one of your citizens up to that many spaces.",
    "Select the tile, tap your citizen, then tap an empty destination. Movement is cardinal only "
    + "and cannot pass through pipes, factories, construction sites, or other citizens.",
    "Each deck has 10 Move 1, 7 Move 2, and 4 Move 3 tiles.",
  ]],
  ["Doubleplay", [480, 270, 60], dDouble, [
    "There are 4 Doubleplay tiles in each deck. Tap one twice to activate it; you must then play the "
    + "other two tiles in your hand as well, in any order.",
    "Each Doubleplay among those tiles is replaced by up to 2 tiles from your deck; repeat for any "
    + "Doubleplays drawn. Play all resulting tiles in any order. Discard a tile only if it has no legal "
    + "move; it is removed and immediately replaced from the deck, so you can continue your turn.",
  ]],
  ["The Event Cycle", [650, 310, 60], dCycle, [
    "The dial advances one space after both players complete a turn. The panel beside the board shows "
    + "how many full cycles have been played and which cycle triggers what.",
    "If both players place a citizen, whoever has more living citizens goes first; on a tie, the player "
    + "whose turn just ended goes first. Space 10 is the production event.",
  ]],
  ["Production and Chain Destruction", [504, 224, 56], dProduction, [
    "On space 10 every factory produces. Fire or water flows through all connected pipes, and every "
    + "enemy citizen at an open pipe end is destroyed. Your own citizens are safe from your own element.",
    "Chain rule: any citizen touching (up, down, left or right) a same-team citizen who is being destroyed "
    + "is destroyed too - the whole connected group falls. Don't cluster your citizens!",
  ]],
  ["New Factories", [480, 270, 44], dFactories, [
    "When the early game ends (after 2 cycles), and every 2 cycles after, both players place a new "
    + "factory anywhere on the board.",
    "It must be an empty space and cannot connect directly to a pipe carrying the opponent's element. "
    + "The player with more living citizens places first; on a tie, the player whose turn just ended goes "
    + "first. If a player has no legal space, that placement is skipped. New factories work and provide "
    + "spawn points immediately.",
  ]],
  ["Winning the Game", [520, 190, 40], dWinning, [
    "Before the game you choose how long it lasts: 8, 10 or 12 full event cycles. When the last cycle "
    + "ends, its production happens first; no further citizen or factory placement happens. The player "
    + "who destroyed more enemy citizens wins; a tie is a draw. The game can also end early when both "
    + "players' decks and hands are empty.",
    "The final summary also records each player's tiles played, each team's final and peak number of "
    + "product-carrying pipes, and the most citizens destroyed in one turn.",
    "Tips: use bombs to cut off an enemy pipe, keep your citizens spread out and away from pipe ends, "
    + "and use Construction to lock a dangerous pipe down for good.",
  ]],
  ["Controls", null, null, [
    "Rotate: turn the selected pipe before placing it.   Discard: enabled only when the selected tile has no legal move; it is removed and replaced immediately.",
    "End turn: finish your turn once you've played.   New game: open the menu (\u2630) to abandon this game and start another.",
    "Player settings: on the start screen, set either side (or both!) to Human or a CPU level.",
    "CPU speed: adjust how fast CPU turns go - choose Fast or Very fast to speed things up.",
    "Zoom: the \uD83D\uDD0D button zooms the board; drag to pan.",
    "Open How to play from the start screen or the menu at any time to see this guide again.",
  ]],
];

// ---------------------------------------------------------------- viewer

const tutorial = { page: 0 };

function renderTutorial() {
  const [title, size, draw, paragraphs] = TUTORIAL_PAGES[tutorial.page];
  $("tutTitle").textContent = title;
  $("tutStep").textContent = `Page ${tutorial.page + 1} of ${TUTORIAL_PAGES.length}`;
  $("tutBody").replaceChildren(...paragraphs.map((text) => {
    const p = document.createElement("p");
    p.textContent = text;
    return p;
  }));
  $("tutPrev").disabled = tutorial.page === 0;
  $("tutNext").disabled = tutorial.page === TUTORIAL_PAGES.length - 1;
  [...$("tutDots").children].forEach((d, i) => d.classList.toggle("on", i === tutorial.page));

  const holder = $("tutDiagram");
  const canvas = $("tutCanvas");
  holder.hidden = !draw;
  if (!draw) return;
  const [w, h, cell] = size;
  const avail = holder.clientWidth || w;
  const scale = Math.min(1, Math.max(avail / w, 0.7));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${Math.round(w * scale)}px`;
  canvas.style.height = `${Math.round(h * scale)}px`;
  canvas.width = Math.round(w * scale * dpr);
  canvas.height = Math.round(h * scale * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  ctx.fillStyle = "#fbf7ea";
  ctx.fillRect(0, 0, w, h);
  draw(new Pen(ctx, cell));
}

function tutorialGo(page) {
  tutorial.page = Math.max(0, Math.min(TUTORIAL_PAGES.length - 1, page));
  renderTutorial();
  $("rulesPanel").scrollTop = 0;
}

function setupTutorial() {
  const dots = $("tutDots");
  TUTORIAL_PAGES.forEach((_, i) => {
    const d = document.createElement("button");
    d.className = "dot";
    d.setAttribute("aria-label", `Page ${i + 1}`);
    d.addEventListener("click", () => tutorialGo(i));
    dots.appendChild(d);
  });
  $("tutPrev").addEventListener("click", () => tutorialGo(tutorial.page - 1));
  $("tutNext").addEventListener("click", () => tutorialGo(tutorial.page + 1));
  window.addEventListener("resize", () => { if (!$("rulesPanel").hidden) renderTutorial(); });
}

function openTutorial() {
  tutorialGo(0);
}
