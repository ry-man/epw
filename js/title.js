"use strict";
// Title screen: canvas port of title_screen.py (same scene, drawn at 1100x640 and scaled to fit).

const TITLE_W = 1100;
const TITLE_H = 640;
const TITLE_TEXT = "E.P.W.";
const TITLE_SUB = "Elemental Plumbing Wars";
const TS_DARK = "#1c1c1c";

function tsLerp(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((p, i) => Math.round(p + (pb[i] - p) * t)).join(",")})`;
}

function tsLerpHex(a, b, t) {
  const c = tsLerp(a, b, t).match(/\d+/g).map(Number);
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

class TitleArt {
  constructor(ctx) {
    this.c = ctx;
  }

  rect(x0, y0, x1, y1, fill, outline = null, lw = 1) {
    const c = this.c;
    if (fill) { c.fillStyle = fill; c.fillRect(x0, y0, x1 - x0, y1 - y0); }
    if (outline) { c.lineWidth = lw; c.strokeStyle = outline; c.strokeRect(x0, y0, x1 - x0, y1 - y0); }
  }

  oval(x0, y0, x1, y1, fill, outline = null, lw = 1) {
    const c = this.c;
    c.beginPath();
    c.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (outline) { c.lineWidth = lw; c.strokeStyle = outline; c.stroke(); }
  }

  poly(pts, fill, outline = null, lw = 1) {
    const c = this.c;
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (outline) { c.lineWidth = lw; c.lineJoin = "miter"; c.strokeStyle = outline; c.stroke(); }
  }

  line(pts, color, lw, round = false) {
    const c = this.c;
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.lineWidth = lw;
    c.strokeStyle = color;
    c.lineCap = round ? "round" : "butt";
    c.lineJoin = round ? "round" : "miter";
    c.stroke();
    c.lineCap = "butt";
    c.lineJoin = "miter";
  }

  text(x, y, s, font, fill) {
    const c = this.c;
    c.font = font;
    c.fillStyle = fill;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(s, x, y);
  }

  pipe(points, color, width = 30) {
    const flat = points.flat();
    this.line(flat, TS_DARK, width + 8, true);
    this.line(flat, color, width, true);
    this.line(flat, tsLerpHex(color, "#ffffff", 0.45), Math.max(3, Math.floor(width / 6)), true);
  }

  flange(x, y, vertical, color, width = 30) {
    const [w, h] = vertical ? [width + 12, 12] : [12, width + 12];
    this.rect(x - w / 2, y - h / 2, x + w / 2, y + h / 2, color, TS_DARK, 3);
  }

  flame(x, y, s, outer = "#ff8a1f", inner = "#ffe45c") {
    this.poly([
      x, y - s * 1.9, x + s * 0.55, y - s * 0.8, x + s * 0.9, y - s * 1.2,
      x + s * 0.9, y, x, y + s * 0.3, x - s * 0.9, y, x - s * 0.9, y - s * 1.2,
      x - s * 0.55, y - s * 0.8,
    ], outer, "#c4380f", 2);
    this.poly([
      x, y - s * 1.1, x + s * 0.4, y - s * 0.3, x + s * 0.3, y, x, y + s * 0.1,
      x - s * 0.3, y, x - s * 0.4, y - s * 0.3,
    ], inner);
  }

  fireFactory(x, y, w, h) {
    const brick = "#a8321c", dark = "#4e130a";
    const shades = ["#6b5b57", "#58494a", "#463c3e"];
    for (const cx of [x + w * 0.2, x + w * 0.72]) {
      this.rect(cx - 18, y - h * 0.38, cx + 18, y + h * 0.3, "#5a2a22", TS_DARK, 3);
      this.rect(cx - 22, y - h * 0.42, cx + 22, y - h * 0.34, "#2e1511", TS_DARK, 3);
      this.flame(cx, y - h * 0.46, 20);
      [[10, -h * 0.72, 16], [-12, -h * 0.9, 20], [14, -h * 1.1, 24]].forEach(([dx, dy, r], i) => {
        this.oval(cx + dx - r, y + dy - r, cx + dx + r, y + dy + r, shades[i]);
      });
    }
    const bodyTop = y + h * 0.15;
    this.rect(x, bodyTop, x + w, y + h, brick, TS_DARK, 4);
    const rows = Math.floor((y + h - bodyTop) / 18);
    for (let row = 0; row < rows; row++) {
      const ry = bodyTop + 18 * (row + 1);
      this.line([x + 2, ry, x + w - 2, ry], dark, 1);
      for (let bx = 0; bx <= Math.floor(w / 36); bx++) {
        const px = x + bx * 36 + (row % 2 ? 18 : 0);
        if (px > x && px < x + w) this.line([px, ry - 18, px, ry], dark, 1);
      }
    }
    this.poly([x - 14, bodyTop, x + w / 2, y - h * 0.1, x + w + 14, bodyTop], "#3d1812", TS_DARK, 4);
    this.oval(x + w / 2 - 28, bodyTop - 10, x + w / 2 + 28, bodyTop + 46, "#ff9b2f", TS_DARK, 4);
    this.flame(x + w / 2, bodyTop + 40, 17, "#ffcf3d", "#fff6c4");
    for (const wx of [x + w * 0.16, x + w * 0.76]) {
      this.rect(wx, y + h * 0.52, wx + 40, y + h * 0.52 + 36, "#ffb347", TS_DARK, 3);
      this.line([wx + 20, y + h * 0.52, wx + 20, y + h * 0.52 + 36], TS_DARK, 2);
    }
    const d = [x + w * 0.4, y + h * 0.58, x + w * 0.6, y + h];
    this.rect(d[0], d[1], d[2], d[3], "#2a0d08", TS_DARK, 3);
    this.oval(d[0] + 6, d[1] + 8, d[2] - 6, d[3] - 4, "#ff6a1a");
  }

  iceFactory(x, y, w, h) {
    const ice = "#6bb6ea", dark = "#245c8c";
    for (const [cx, ch] of [[x + w * 0.2, 0.5], [x + w * 0.72, 0.38]]) {
      const top = y - h * ch;
      this.poly([cx - 20, y + h * 0.3, cx - 12, top + 20, cx, top - 22, cx + 12, top + 20, cx + 20, y + h * 0.3],
        "#bfe8ff", TS_DARK, 3);
      this.line([cx, top - 10, cx, y + h * 0.2], "#ffffff", 3);
    }
    const bodyTop = y + h * 0.15;
    this.rect(x, bodyTop, x + w, y + h, ice, TS_DARK, 4);
    for (let row = 1; row <= Math.floor((y + h - bodyTop) / 30); row++) {
      this.line([x + 2, bodyTop + row * 30, x + w - 2, bodyTop + row * 30], dark, 1);
    }
    this.poly([x - 14, bodyTop, x + w / 2, y - h * 0.1, x + w + 14, bodyTop], "#e9f6ff", TS_DARK, 4);
    const count = 9;
    for (let i = 0; i < count; i++) {
      const ix = x - 6 + ((w + 12) * i) / (count - 1);
      const ih = 16 + ((i * 7) % 19);
      this.poly([ix - 6, bodyTop, ix + 6, bodyTop, ix, bodyTop + ih], "#d4f0ff", "#5aa0d0");
    }
    const cx = x + w / 2, cy = bodyTop + 18;
    for (const [color, lw] of [[TS_DARK, 7], ["#ffffff", 3]]) {
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        this.line([cx - 26 * Math.cos(a), cy - 26 * Math.sin(a), cx + 26 * Math.cos(a), cy + 26 * Math.sin(a)], color, lw);
      }
    }
    for (const wx of [x + w * 0.16, x + w * 0.76]) {
      this.rect(wx, y + h * 0.52, wx + 40, y + h * 0.52 + 36, "#d7f3ff", TS_DARK, 3);
      this.line([wx, y + h * 0.52 + 18, wx + 40, y + h * 0.52 + 18], TS_DARK, 2);
    }
    const d = [x + w * 0.4, y + h * 0.58, x + w * 0.6, y + h];
    this.rect(d[0], d[1], d[2], d[3], "#0f3555", TS_DARK, 3);
    this.oval(d[0] + 6, d[1] + 8, d[2] - 6, d[3] - 4, "#7fd4ff");
    this.rect(x - 4, y + h - 6, x + w + 4, y + h + 4, "#ffffff", "#99aacc", 1);
  }

  citizen(x, feetY, facing, owner, r = 40) {
    const body = owner === 0 ? "#f0653f" : "#5aa9e6";
    const rim = owner === 0 ? "#8a2a12" : "#1d5f94";
    const cy = feetY - 12 - r;
    for (const sx of [-0.45, 0.45]) this.oval(x + sx * r - 14, feetY - 14, x + sx * r + 14, feetY + 4, "#2b2b2b");
    this.line([x + facing * r * 0.9, cy + r * 0.2, x + facing * r * 1.45, cy - r * 0.25], rim, 8, true);
    this.oval(x + facing * r * 1.45 - 11, cy - r * 0.25 - 11, x + facing * r * 1.45 + 11, cy - r * 0.25 + 11, body, rim, 3);
    this.line([x - facing * r * 0.9, cy + r * 0.3, x - facing * r * 1.25, cy + r * 0.75], rim, 8, true);
    this.oval(x - facing * r * 1.25 - 10, cy + r * 0.75 - 10, x - facing * r * 1.25 + 10, cy + r * 0.75 + 10, body, rim, 3);
    this.oval(x - r, cy - r, x + r, cy + r, body, "#ffffff", 4);
    this.oval(x - r - 2, cy - r - 2, x + r + 2, cy + r + 2, null, rim, 2);
    for (const sign of [-1, 1]) {
      const ex = x + sign * r * 0.4, ey = cy - r * 0.12;
      this.oval(ex - 11, ey - 10, ex + 11, ey + 10, "#ffffff", TS_DARK, 2);
      this.oval(ex + facing * 4 - 5, ey - 5, ex + facing * 4 + 5, ey + 5, TS_DARK);
      this.line([ex + sign * 16, ey - 24, ex - sign * 4, ey - 7], TS_DARK, 6, true);
    }
    const c = this.c;
    c.beginPath();
    c.ellipse(x, cy + r * 0.625, r * 0.5, r * 0.325, 0, (-20 * Math.PI) / 180, (-160 * Math.PI) / 180, true);
    c.lineWidth = 5;
    c.strokeStyle = TS_DARK;
    c.stroke();
    for (let i = -2; i <= 2; i++) {
      const tx = x + i * r * 0.16;
      this.rect(tx - 4, cy + r * 0.52, tx + 4, cy + r * 0.62, "#ffffff", TS_DARK, 1);
    }
    const vx = x - facing * r * 0.6, vy = cy - r * 0.62;
    for (const [dx, dy] of [[-6, -6], [6, 6], [-6, 6], [6, -6]]) this.line([vx, vy, vx + dx, vy + dy], "#c0141c", 3);
    const hy = cy - r * 0.72;
    const hatBand = owner === 0 ? "#c0392b" : "#2f7fd6";
    const crown = owner === 0 ? "#ff9aa8" : "#8fd0ff";
    const brim = owner === 0 ? "#ffb3bd" : "#b3e0ff";
    this.poly([x - r * 0.5, hy, x - r * 0.45, cy - r * 1.2, x - r * 0.15, cy - r * 1.26, x, cy - r * 1.06,
      x + r * 0.15, cy - r * 1.26, x + r * 0.45, cy - r * 1.2,       x + r * 0.5, hy], crown, hatBand, 3);
          this.rect(x - r * 0.49, cy - r * 0.94, x + r * 0.49, hy, hatBand);
          this.oval(x - r * 1.35, hy - r * 0.22, x + r * 1.35, hy + r * 0.22, brim, hatBand, 3);
  }
}

function drawTitleScene(ctx) {
  const t = new TitleArt(ctx);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const uni = (a, b) => a + (b - a) * rnd();
  const W = TITLE_W, H = TITLE_H;

  const steps = 55;
  for (let i = 0; i < steps; i++) {
    const k = i / (steps - 1);
    const left = tsLerp("#3a0f0a", "#1a0e22", Math.min(1, k * 2));
    const right = tsLerp("#1a0e22", "#0c2a4a", Math.min(1, Math.max(0, (k - 0.5) * 2)));
    t.rect((W * i) / steps, 0, (W * (i + 1)) / steps + 1, H, k < 0.5 ? left : right);
  }
  const sparks = ["#ff9b2f", "#ffd24d", "#ff6a1a"];
  for (let i = 0; i < 70; i++) {
    const ex = uni(10, W * 0.47), ey = uni(150, H - 30), r = uni(1.5, 3.5);
    t.oval(ex - r, ey - r, ex + r, ey + r, sparks[Math.floor(rnd() * 3)]);
  }
  for (let i = 0; i < 70; i++) {
    const sx = uni(W * 0.53, W - 10), sy = uni(150, H - 30), r = uni(1.5, 4);
    t.oval(sx - r, sy - r, sx + r, sy + r, "#e8f6ff");
  }
  const ground = H - 28;
  t.rect(0, ground, W * 0.5, H, "#2a0c08");
  t.rect(W * 0.5, ground, W, H, "#0a1f38");

  const impact = '149px Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Black", sans-serif';
  t.text(W / 2 + 6, 99, TITLE_TEXT, impact, "#000000");
  t.text(W / 2 - 3, 89, TITLE_TEXT, impact, "#ffffff");
  t.text(W / 2, 92, TITLE_TEXT, impact, "#ffc83d");
  const georgia = 'italic bold 40px Georgia, "Times New Roman", serif';
  t.text(W / 2 + 2, 192, TITLE_SUB, georgia, "#000000");
  t.text(W / 2, 190, TITLE_SUB, georgia, "#f4ecd8");

  const fw = 250, fh = 230;
  const fy = ground - fh - 2;
  t.fireFactory(40, fy, fw, fh);
  t.iceFactory(W - 40 - fw, fy, fw, fh);

  const upper = 392;
  const lower = ground - 22;
  const fireEnd = W / 2 - 36, iceEnd = W / 2 + 36;
  t.pipe([[40 + fw, upper], [fireEnd - 40, upper], [fireEnd - 40, upper + 10]], "#d63a2a");
  t.pipe([[W - 40 - fw, upper], [iceEnd + 40, upper], [iceEnd + 40, upper + 10]], "#2f7fd6");
  t.pipe([[40 + fw * 0.5, fy + fh], [40 + fw * 0.5, lower], [fireEnd, lower]], "#d63a2a");
  t.pipe([[W - 40 - fw * 0.5, fy + fh], [W - 40 - fw * 0.5, lower], [iceEnd, lower]], "#2f7fd6");
  for (const px of [40 + fw + 40, fireEnd - 90]) t.flange(px, upper, false, "#8d2216");
  for (const px of [W - 40 - fw - 40, iceEnd + 90]) t.flange(px, upper, false, "#1b4f8f");
  for (const px of [200, fireEnd - 120]) t.flange(px, lower, false, "#8d2216");
  for (const px of [W - 200, iceEnd + 120]) t.flange(px, lower, false, "#1b4f8f");

  const cx = W / 2, cy = 330;
  t.oval(cx - 70, cy - 70, cx + 70, cy + 70, "#2a1034");
  t.poly([cx + 8, cy - 62, cx - 22, cy + 4, cx - 2, cy + 4, cx - 14, cy + 62, cx + 26, cy - 12, cx + 4, cy - 12],
    "#fff2a8", "#ff9b2f", 3);
  t.text(cx, cy + 92, "VS", '48px Impact, Haettenschweiler, "Arial Black", sans-serif', "#ffffff");
  for (let ang = 0; ang < 360; ang += 30) {
    const a = (ang * Math.PI) / 180;
    t.line([cx + 74 * Math.cos(a), cy + 74 * Math.sin(a), cx + 92 * Math.cos(a), cy + 92 * Math.sin(a)], "#fff2a8", 3);
  }

  t.citizen(fireEnd - 150, upper - 15, 1, 0, 46);
  t.citizen(iceEnd + 150, upper - 15, -1, 1, 46);
  t.citizen(fireEnd - 20, lower - 15, 1, 0, 34);
  t.citizen(iceEnd + 20, lower - 15, -1, 1, 34);
}

function renderTitle() {
  const screen = document.getElementById("title");
  if (screen.hidden) return;
  const stage = document.getElementById("titleStage");
  const canvas = document.getElementById("titleCanvas");
  const aw = stage.clientWidth, ah = stage.clientHeight;
  if (aw < 10 || ah < 10) return;
  const scale = Math.min(aw / TITLE_W, ah / TITLE_H);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${Math.floor(TITLE_W * scale)}px`;
  canvas.style.height = `${Math.floor(TITLE_H * scale)}px`;
  canvas.width = Math.floor(TITLE_W * scale * dpr);
  canvas.height = Math.floor(TITLE_H * scale * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  drawTitleScene(ctx);
}
