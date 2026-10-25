"use strict";

// Game engine: a direct port of fire_n_ice.py (rules + CPU players), no DOM access.

const BOARD_SIZES = { 8: 15, 10: 17, 12: 19 };
let BOARD_SIZE = 17;
const START_SIZE = 9;
let START_OFFSET = (BOARD_SIZE - START_SIZE) >> 1;
const FACTORY_INSET = 2;
const SPAWN_FRACTION = 0.10;
const SPAWN_RANGE = 2;
const EVENT_SHORT = { 4: "Both", 6: "FF", 7: "II", 8: "FF", 9: "II", 10: "Prod" };

const DIRECTIONS = { L: [-1, 0], U: [0, -1], R: [1, 0], D: [0, 1] };
const SIDES = ["L", "U", "R", "D"];
const OPPOSITE = { L: "R", R: "L", U: "D", D: "U" };
const ROTATE = { L: "U", U: "R", R: "D", D: "L" };

const PIPE_CHANNELS = {
  "Turn": [["L", "U"]],
  "Straight": [["L", "R"]],
  "Junction": [["L", "U", "R"]],
  "Plus": [["L", "U", "R", "D"]],
  "Cross": [["L", "R"], ["U", "D"]],
  "Double turn": [["L", "U"], ["R", "D"]],
};
const PIPE_COUNTS = {
  "Turn": 50, "Straight": 25, "Junction": 40, "Plus": 20, "Cross": 20, "Double turn": 20,
};

const PLAYERS = ["Fire Folk (FF)", "Ice Inhabitants (II)"];
const FACTORY_OWNER = { Fire: 0, Water: 1 };
const FACTORIES_BY_OWNER = { 0: "Fire", 1: "Water" };

const EVENT_CYCLE_LENGTH = 10;
const FULL_BOARD_CYCLES = 2;
const GAME_LENGTHS = [8, 10, 12];
const GAME_TITLE = "E.P.W. - Elemental Plumbing Wars";
const FACTORY_CYCLE_INTERVAL = 2;
const CPU_SAMPLE_LIMIT = 20;
const DIFFICULTIES = {
  Easy: { sample: 4, noise: 6.0, smart: 0.0 },
  Normal: { sample: CPU_SAMPLE_LIMIT, noise: 0.01, smart: 0.75 },
  Hard: { sample: 45, noise: 0.0, smart: 1.0 },
};
const HAND_SIZE = 3;

const startFactories = () => [
  [`${START_OFFSET + FACTORY_INSET},${START_OFFSET + FACTORY_INSET}`, "Fire"],
  [
    `${START_OFFSET + START_SIZE - 1 - FACTORY_INSET},${START_OFFSET + START_SIZE - 1 - FACTORY_INSET}`,
    "Water",
  ],
];

const TILE_INFO = (() => {
  const info = new Map();
  for (const [name, base] of Object.entries(PIPE_CHANNELS)) {
    let channels = base;
    for (let rotation = 0; rotation < 4; rotation++) {
      const ports = new Set();
      const portIndex = {};
      channels.forEach((channel, i) => channel.forEach((side) => {
        ports.add(side);
        portIndex[side] = i;
      }));
      info.set(`${name}|${rotation}`, { channels, ports, portIndex });
      channels = channels.map((channel) => channel.map((side) => ROTATE[side]));
    }
  }
  return info;
})();

const tileInfo = (tile) => TILE_INFO.get(`${tile.name}|${tile.rotation}`);

// Positions are "x,y" strings so they can be used as Map/Set keys.
const neighborCache = new Map();
function neighbor(position, side) {
  const key = position + side;
  let result = neighborCache.get(key);
  if (result === undefined) {
    const [x, y] = xy(position);
    const [dx, dy] = DIRECTIONS[side];
    result = `${x + dx},${y + dy}`;
    neighborCache.set(key, result);
  }
  return result;
}
function xy(position) {
  const i = position.indexOf(",");
  return [Number(position.slice(0, i)), Number(position.slice(i + 1))];
}
const pos = (x, y) => `${x},${y}`;
const inBounds = (x, y) => x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
const manhattan = (a, b) => {
  const [ax, ay] = xy(a);
  const [bx, by] = xy(b);
  return Math.abs(ax - bx) + Math.abs(ay - by);
};
const randomChoice = (list) => list[Math.floor(Math.random() * list.length)];
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
function maxBy(list, fn) {
  let best = list[0];
  let bestValue = -Infinity;
  for (const item of list) {
    const value = fn(item);
    if (value > bestValue) { best = item; bestValue = value; }
  }
  return best;
}

class Game {
  constructor({ totalCycles = 10, cpu = [false, false], difficulty = ["Normal", "Normal"] } = {}) {
    this.totalCycles = totalCycles;
    BOARD_SIZE = BOARD_SIZES[totalCycles] || 17;
    START_OFFSET = (BOARD_SIZE - START_SIZE) >> 1;
    this.cpu = cpu;
    this.difficulty = difficulty;
    this.onChange = null;
    this.version = 0;
    this.message = "";

    this.board = new Map();
    this.citizens = [];
    this.destroyed = [0, 0];
    this.lifeRecords = [];
    this.decimalScores = [0, 0];
    const tileNames = [...Object.keys(PIPE_COUNTS), "Bomb", "Construction", "Move 1", "Move 2", "Move 3", "Doubleplay"];
    this.tilePlayCounts = PLAYERS.map(() => Object.fromEntries(tileNames.map((n) => [n, 0])));
    this.citizensDestroyedThisTurn = 0;
    this.maxCitizensDestroyedInTurn = 0;
    this.highestPipeProductCounts = { Fire: 0, Water: 0 };
    this.finalPipeProductCounts = { Fire: 0, Water: 0 };
    this.decks = [Game.makeDeck(), Game.makeDeck()];
    this.deckTotal = this.decks[0].length;
    this.activePlayer = 0;
    this.turnsInPair = 0;
    this.eventPosition = 1;
    this.eventSteps = 0;
    this.hand = null;
    this.handSpawn = false;
    this.hands = [[], []];
    this.pool = null;
    this.selected = null;
    this.turnDone = false;
    this.playedCount = 0;
    this.previewCell = null;
    this.undoStack = [];
    this.rotation = 0;
    this.actionDone = false;
    this.pendingPlacements = [];
    this.placementKind = "citizen";
    this.placementIndex = 0;
    this.factories = new Map(startFactories());
    this.blocks = new Set();
    this.movingCitizen = null;
    this.gameOver = false;
    this.winner = null;
    this.scores = [0, 0];
    this.effects = [];
    this.marks = [null, null];
    this.markEpoch = 0;
    for (const owner of [0, 1]) this.fillHand(owner);
    this.recordPipeProductCounts();
    this.beginTurn();
  }

  static makeDeck() {
    const deck = [];
    for (const [name, count] of Object.entries(PIPE_COUNTS)) {
      const spawns = Math.ceil(count * SPAWN_FRACTION);
      for (let i = 0; i < count; i++) deck.push({ name, spawn: i < spawns });
    }
    const add = (name, count) => { for (let i = 0; i < count; i++) deck.push({ name, spawn: false }); };
    add("Bomb", 15);
    add("Construction", 5);
    add("Move 1", 10);
    add("Move 2", 7);
    add("Move 3", 4);
    add("Doubleplay", 4);
    return shuffle(deck);
  }

  // ---- notifications -------------------------------------------------------
  setMessage(text) {
    this.message = text;
  }

  refresh() {
    this.version++;
    if (this.onChange) this.onChange();
  }

  addEffect(kind, details = {}) {
    this.effects.push({ kind, t: performance.now(), ...details });
  }

  // Remember the most recent move of each player so the UI can highlight it.
  mark(position, color = null, owner = null) {
    if (owner === null) owner = this.activePlayer;
    const current = this.marks[owner];
    if (!current || current.epoch !== this.markEpoch) {
      this.marks[owner] = { epoch: this.markEpoch, items: [] };
    }
    this.marks[owner].items.push({ position, color });
  }

  // ---- basic queries -------------------------------------------------------
  inStartingGrid(x, y) {
    return x >= START_OFFSET && x < START_OFFSET + START_SIZE
      && y >= START_OFFSET && y < START_OFFSET + START_SIZE;
  }

  startingGridLocked() {
    return this.eventSteps < FULL_BOARD_CYCLES * EVENT_CYCLE_LENGTH;
  }

  occupied(position) {
    return this.board.has(position) || this.factories.has(position) || this.blocks.has(position)
      || this.citizens.some((c) => c.position === position);
  }

  factoryFed(position) {
    const ports = tileInfo(this.board.get(position)).ports;
    return SIDES.some((side) => ports.has(side) && this.factories.has(neighbor(position, side)));
  }

  currentTile() {
    return { name: this.hand, rotation: this.rotation, spawn: this.handSpawn ? this.activePlayer : null };
  }

  canPlacePipe(position, tile, checkFlow = true) {
    const [x, y] = xy(position);
    if (!inBounds(x, y) || this.occupied(position)) return false;
    if (this.startingGridLocked() && !this.inStartingGrid(x, y)) return false;
    const ports = tileInfo(tile).ports;
    let connected = false;
    for (const side of SIDES) {
      const adjacent = neighbor(position, side);
      const other = this.board.get(adjacent);
      if (other) {
        const otherHasPort = tileInfo(other).ports.has(OPPOSITE[side]);
        if (ports.has(side) !== otherHasPort) return false;
        connected = connected || otherHasPort;
      } else if (this.factories.has(adjacent)) {
        connected = connected || ports.has(side);
      }
    }
    if (!connected) return false;
    if (!checkFlow) return true;
    this.board.set(position, tile);
    try {
      for (const products of this.pipeFlows().values()) if (products.size >= 2) return false;
      return true;
    } finally {
      this.board.delete(position);
    }
  }

  pipeCandidateCells() {
    const candidates = new Set();
    for (const source of [...this.board.keys(), ...this.factories.keys()]) {
      for (const side of SIDES) candidates.add(neighbor(source, side));
    }
    return candidates;
  }

  hasLegalPipePosition(tile) {
    for (const position of this.pipeCandidateCells()) {
      if (this.canPlacePipe(position, tile)) return true;
    }
    return false;
  }

  tileHasValidMove(name = this.hand, spawn = this.handSpawn) {
    if (!name) return false;
    if (name in PIPE_CHANNELS) {
      for (let rotation = 0; rotation < 4; rotation++) {
        const tile = { name, rotation, spawn: spawn ? this.activePlayer : null };
        if (this.hasLegalPipePosition(tile)) return true;
      }
      return false;
    }
    if (name === "Bomb") return this.board.size > 0;
    if (name === "Construction") return [...this.board.keys()].some((p) => !this.factoryFed(p));
    if (name.startsWith("Move ")) {
      const distance = Number(name.split(" ")[1]);
      return this.citizens.some(
        (c) => c.owner === this.activePlayer && this.moveCells(c.position, distance).size > 0,
      );
    }
    return name === "Doubleplay";
  }

  // ---- hands and turn flow -------------------------------------------------
  fillHand(owner) {
    while (this.hands[owner].length < HAND_SIZE && this.decks[owner].length) {
      this.hands[owner].push(this.decks[owner].pop());
    }
  }

  tileSource() {
    return this.pool !== null ? this.pool : this.hands[this.activePlayer];
  }

  beginTurn() {
    this.maxCitizensDestroyedInTurn = Math.max(this.maxCitizensDestroyedInTurn, this.citizensDestroyedThisTurn);
    this.citizensDestroyedThisTurn = 0;
    if (this.decks.every((d) => !d.length) && this.hands.every((h) => !h.length)) {
      this.finishGame();
      return;
    }
    this.fillHand(this.activePlayer);
    this.undoStack = [];
    this.pool = null;
    this.selected = null;
    this.hand = null;
    this.rotation = 0;
    this.previewCell = null;
    this.movingCitizen = null;
    this.actionDone = false;
    this.turnDone = !this.hands[this.activePlayer].length;
    this.setMessage(
      !this.turnDone ? "Select a tile from your hand to play." : "No tiles left in your hand; end your turn.",
    );
    this.refresh();
  }

  selectTile(index) {
    const source = this.tileSource();
    if (this.gameOver || this.pendingPlacements.length || this.turnDone || this.actionDone
      || !(index >= 0 && index < source.length)) return;
    const { name, spawn } = source[index];
    if (name === "Doubleplay" && this.pool === null && this.selected === index) {
      this.activateDoubleplay(index);
      return;
    }
    this.selected = index;
    this.hand = name;
    this.handSpawn = spawn;
    this.rotation = 0;
    this.previewCell = null;
    this.movingCitizen = null;
    if (name === "Doubleplay") {
      this.setMessage("Tap the Doubleplay again to activate it. You must then play your other two tiles (plus any tiles drawn from further Doubleplays).");
    } else if (this.tileHasValidMove()) {
      this.setMessage(`${name} selected. Use it on the board; it cannot be discarded while a legal move exists.`);
    } else {
      this.setMessage(`No legal move for ${name}. You may discard it to draw a replacement.`);
    }
    this.refresh();
  }

  activateDoubleplay(index) {
    const owner = this.activePlayer;
    const hand = this.hands[owner];
    hand.splice(index, 1);
    this.undoStack = [];
    this.tilePlayCounts[owner]["Doubleplay"] += 1;
    this.pool = this.expandDoubleplays([...hand], owner);
    hand.length = 0;
    this.selected = null;
    this.hand = null;
    this.actionDone = false;
    this.turnDone = !this.pool.length;
    this.setMessage(
      this.pool.length ? `Doubleplay! Play all ${this.pool.length} tiles in any order.`
        : "Doubleplay, but no tiles remain; end your turn.",
    );
    this.refresh();
  }

  expandDoubleplays(tiles, owner) {
    for (;;) {
      const count = tiles.filter((t) => t.name === "Doubleplay").length;
      if (!count) break;
      tiles = tiles.filter((t) => t.name !== "Doubleplay");
      for (let i = 0; i < 2 * count; i++) {
        if (this.decks[owner].length) tiles.push(this.decks[owner].pop());
      }
    }
    return tiles;
  }

  finishSelected() {
    const source = this.tileSource();
    const tileName = source[this.selected].name;
    source.splice(this.selected, 1);
    this.tilePlayCounts[this.activePlayer][tileName] += 1;
    this.recordPipeProductCounts();
    this.selected = null;
    this.hand = null;
    this.previewCell = null;
    this.movingCitizen = null;
    this.playedCount += 1;
    this.markEpoch += 1;
    if (this.pool === null) {
      this.turnDone = true;
    } else {
      this.actionDone = false;
      this.turnDone = !this.pool.length;
    }
  }

  afterAction() {
    if (this.actionDone && this.selected !== null) {
      this.finishSelected();
      if (this.turnDone) this.setMessage(`${this.message} Turn complete - end your turn.`);
      this.refresh();
    }
  }

  discardSelected() {
    if (this.selected === null || this.actionDone || this.gameOver || this.pendingPlacements.length) return false;
    if (this.tileHasValidMove()) {
      this.setMessage("You cannot discard this tile while a legal move exists.");
      this.refresh();
      return false;
    }
    this.tileSource().splice(this.selected, 1);
    this.undoStack = [];
    let replacement;
    if (this.pool === null) {
      const handSize = this.hands[this.activePlayer].length;
      this.fillHand(this.activePlayer);
      replacement = this.hands[this.activePlayer].length > handSize
        ? "Your hand has been replenished" : "No replacement tile remains in your deck";
    } else if (this.decks[this.activePlayer].length) {
      this.pool.push(this.decks[this.activePlayer].pop());
      this.pool = this.expandDoubleplays(this.pool, this.activePlayer);
      replacement = "A replacement tile has been added to your Doubleplay";
    } else {
      replacement = "No replacement tile remains in your deck";
    }
    this.selected = null;
    this.hand = null;
    this.previewCell = null;
    this.movingCitizen = null;
    this.actionDone = false;
    this.turnDone = !this.tileSource().length;
    this.setMessage(
      !this.turnDone ? `Tile removed from the game. ${replacement}; select a tile to play.`
        : "Tile removed from the game. No tiles remain; end your turn.",
    );
    this.refresh();
    return true;
  }

  rotateTile() {
    if (this.gameOver || this.pendingPlacements.length || !this.hand) return;
    if (this.isCpu(this.activePlayer) || !(this.hand in PIPE_CHANNELS)) return;
    this.rotation = (this.rotation + 1) % 4;
    if (this.previewCell !== null) {
      const ok = this.canPlacePipe(this.previewCell, this.currentTile());
      this.setMessage(ok ? "Tap the same space again to confirm."
        : "That pipe can't go there at this rotation. Rotate or pick another space.");
    } else {
      this.setMessage(`${this.hand} rotated. Tap a board space to preview it.`);
    }
    this.refresh();
  }

  // ---- board interaction ---------------------------------------------------
  // Human tap on a board cell. The first tap on a pipe placement previews it; a second confirms.
  onBoardTap(position) {
    if (this.gameOver || this.isCpu(this.actingPlayer())) return;
    const [x, y] = xy(position);
    if (inBounds(x, y) && !this.pendingPlacements.length && !this.actionDone
      && this.hand in PIPE_CHANNELS && this.previewCell !== position) {
      this.previewCell = position;
      this.setMessage(this.canPlacePipe(position, this.currentTile())
        ? "Rotate if needed, then tap the same space again to confirm."
        : "That pipe can't go there at this rotation. Rotate or pick another space.");
      this.refresh();
      return;
    }
    if (inBounds(x, y) && this.pendingPlacements.length && this.placementKind === "citizen"
      && this.previewCell !== position
      && this.validCitizenCells(this.pendingPlacements[this.placementIndex]).has(position)) {
      this.previewCell = position;
      this.setMessage("Tap the same space again to confirm the citizen, or tap another space.");
      this.refresh();
      return;
    }
    this.clickCell(position);
  }

  clickCell(position) {
    const human = !this.isCpu(this.activePlayer) && !this.pendingPlacements.length;
    const snap = human && this.hand ? this.snapshot() : null;
    const before = this.playedCount;
    this.clickBoard(position);
    this.afterAction();
    if (snap && this.playedCount > before) {
      this.undoStack.push({ snap, index: snap.selected });
      this.refresh();
    }
  }

  snapshot() {
    return structuredClone({
      board: this.board, blocks: this.blocks, citizens: this.citizens, factories: this.factories,
      hands: this.hands, pool: this.pool, tilePlayCounts: this.tilePlayCounts,
      marks: this.marks, markEpoch: this.markEpoch, playedCount: this.playedCount,
      turnDone: this.turnDone, highest: this.highestPipeProductCounts,
      selected: this.selected, message: this.message,
    });
  }

  canUndo() {
    return !this.gameOver && !this.pendingPlacements.length && this.undoStack.length > 0
      && !this.isCpu(this.activePlayer);
  }

  undo() {
    if (!this.canUndo()) return false;
    const { snap } = this.undoStack.pop();
    this.board = snap.board;
    this.blocks = snap.blocks;
    this.citizens = snap.citizens;
    this.factories = snap.factories;
    this.hands = snap.hands;
    this.pool = snap.pool;
    this.tilePlayCounts = snap.tilePlayCounts;
    this.marks = snap.marks;
    this.markEpoch = snap.markEpoch;
    this.playedCount = snap.playedCount;
    this.turnDone = snap.turnDone;
    this.highestPipeProductCounts = snap.highest;
    this.selected = null;
    this.hand = null;
    this.rotation = 0;
    this.previewCell = null;
    this.movingCitizen = null;
    this.actionDone = false;
    this.effects = [];
    this.setMessage("Tile placement undone. Select a tile to play.");
    this.refresh();
    return true;
  }

  // Cells where the selected pipe fits only after being rotated.
  rotationOnlyCells() {
    const out = new Set();
    if (!(this.hand in PIPE_CHANNELS) || this.actionDone) return out;
    const spawn = this.handSpawn ? this.activePlayer : null;
    for (const position of this.pipeCandidateCells()) {
      if (this.canPlacePipe(position, this.currentTile())) continue;
      for (let r = 0; r < 4; r++) {
        if (r === this.rotation) continue;
        if (this.canPlacePipe(position, { name: this.hand, rotation: r, spawn })) { out.add(position); break; }
      }
    }
    return out;
  }

  clickBoard(position) {
    if (this.gameOver) return;
    const [x, y] = xy(position);
    if (!inBounds(x, y)) return;
    if (this.pendingPlacements.length) {
      this.placeCitizen(position);
      return;
    }
    if (this.actionDone || !this.hand) return;
    if (this.hand in PIPE_CHANNELS) {
      const tile = this.currentTile();
      if (this.canPlacePipe(position, tile)) {
        this.board.set(position, tile);
        this.previewCell = null;
        this.addEffect("pipe", { position });
        this.mark(position);
        this.actionDone = true;
        this.setMessage(`${this.hand} placed.`);
      } else {
        this.setMessage("That pipe cannot be placed there.");
      }
    } else if (this.hand === "Bomb") {
      if (this.board.has(position)) {
        this.board.delete(position);
        this.mark(position, "#222222");
        this.actionDone = true;
        this.setMessage("Pipe destroyed.");
      } else {
        this.setMessage("Choose a pipe tile to destroy.");
      }
    } else if (this.hand === "Construction") {
      if (!this.board.has(position)) {
        this.setMessage("Choose a pipe tile to build over.");
      } else if (this.factoryFed(position)) {
        this.setMessage("Construction cannot replace a pipe coming directly out of a factory.");
      } else {
        this.board.delete(position);
        this.blocks.add(position);
        this.mark(position, "#e0a100");
        this.actionDone = true;
        this.setMessage("Construction site established.");
      }
    } else if (this.hand.startsWith("Move ")) {
      this.moveCitizenClick(position, Number(this.hand.split(" ")[1]));
    }
    this.refresh();
  }

  moveCitizenClick(position, distance) {
    if (this.movingCitizen === null) {
      const index = this.citizens.findIndex((c) => c.position === position && c.owner === this.activePlayer);
      if (index >= 0) {
        this.movingCitizen = index;
        this.setMessage(`Citizen selected. Tap a clear destination within ${distance} steps.`);
      } else {
        this.setMessage("Select one of your own citizens first.");
      }
      return;
    }
    const citizen = this.citizens[this.movingCitizen];
    const path = this.canMove(citizen.position, position, distance);
    if (path) {
      this.mark(citizen.position);
      this.mark(position);
      citizen.position = position;
      this.addEffect("move", { citizen, path });
      this.actionDone = true;
      this.movingCitizen = null;
      this.setMessage("Citizen moved.");
    } else {
      const other = this.citizens.findIndex((c) => c.position === position && c.owner === this.activePlayer);
      if (other >= 0) {
        this.movingCitizen = other;
        this.setMessage(`Citizen selected. Tap a clear destination within ${distance} steps.`);
      } else {
        this.setMessage(`Cannot move there. Choose a clear space within ${distance} steps, avoiding pipes and citizens.`);
      }
    }
  }

  canMove(start, destination, maxSteps) {
    if (destination === start || this.occupied(destination)) return false;
    const paths = this.movePaths(start, maxSteps);
    if (!paths.has(destination)) return false;
    const path = [];
    let position = destination;
    while (position !== null) {
      path.push(position);
      position = paths.get(position);
    }
    return path.reverse();
  }

  movePaths(start, maxSteps) {
    const blocked = new Set([...this.board.keys(), ...this.factories.keys(), ...this.blocks,
      ...this.citizens.map((c) => c.position)]);
    const paths = new Map([[start, null]]);
    const distances = new Map([[start, 0]]);
    const queue = [start];
    for (let h = 0; h < queue.length; h++) {
      const position = queue[h];
      const steps = distances.get(position);
      if (steps >= maxSteps) continue;
      for (const side of SIDES) {
        const next = neighbor(position, side);
        const [x, y] = xy(next);
        if (inBounds(x, y) && !paths.has(next) && !blocked.has(next)
          && !(this.startingGridLocked() && !this.inStartingGrid(x, y))) {
          paths.set(next, position);
          distances.set(next, steps + 1);
          queue.push(next);
        }
      }
    }
    return paths;
  }

  moveCells(start, maxSteps) {
    const cells = new Set(this.movePaths(start, maxSteps).keys());
    cells.delete(start);
    return cells;
  }

  currentMoveCells() {
    if (this.movingCitizen === null || this.actionDone || this.pendingPlacements.length
      || !this.hand || !this.hand.startsWith("Move ")) return new Set();
    return this.moveCells(this.citizens[this.movingCitizen].position, Number(this.hand.split(" ")[1]));
  }

  // ---- flow simulation -----------------------------------------------------
  flood(factoryPositions) {
    const board = this.board;
    const visited = new Map();
    const queue = [];
    for (const factory of factoryPositions) {
      for (const side of SIDES) {
        const adjacent = neighbor(factory, side);
        const pipe = board.get(adjacent);
        if (!pipe) continue;
        const index = tileInfo(pipe).portIndex[OPPOSITE[side]];
        if (index === undefined) continue;
        const key = `${adjacent}#${index}`;
        if (!visited.has(key)) {
          visited.set(key, { position: adjacent, index, depth: 0 });
          queue.push(key);
        }
      }
    }
    for (let h = 0; h < queue.length; h++) {
      const node = visited.get(queue[h]);
      const pipe = board.get(node.position);
      for (const side of tileInfo(pipe).channels[node.index]) {
        const adjacent = neighbor(node.position, side);
        const other = board.get(adjacent);
        if (!other) continue;
        const otherIndex = tileInfo(other).portIndex[OPPOSITE[side]];
        if (otherIndex === undefined) continue;
        const key = `${adjacent}#${otherIndex}`;
        if (!visited.has(key)) {
          visited.set(key, { position: adjacent, index: otherIndex, depth: node.depth + 1 });
          queue.push(key);
        }
      }
    }
    return visited;
  }

  pipeFlows() {
    const flows = new Map();
    for (const product of ["Fire", "Water"]) {
      const sources = [...this.factories].filter(([, name]) => name === product).map(([p]) => p);
      for (const key of this.flood(sources).keys()) {
        let set = flows.get(key);
        if (!set) flows.set(key, (set = new Set()));
        set.add(product);
      }
    }
    return flows;
  }

  pipeProductTileCounts() {
    const flows = this.pipeFlows();
    const counts = {};
    for (const product of ["Fire", "Water"]) {
      counts[product] = 0;
      for (const [position, tile] of this.board) {
        const n = tileInfo(tile).channels.length;
        for (let i = 0; i < n; i++) {
          const set = flows.get(`${position}#${i}`);
          if (set && set.has(product)) { counts[product]++; break; }
        }
      }
    }
    return counts;
  }

  recordPipeProductCounts() {
    const counts = this.pipeProductTileCounts();
    for (const product of Object.keys(counts)) {
      this.highestPipeProductCounts[product] = Math.max(this.highestPipeProductCounts[product], counts[product]);
    }
  }

  // Product carried by each channel of each pipe (null = empty), for drawing.
  pipeColors() {
    const flows = this.pipeFlows();
    const colors = new Map();
    for (const [position, tile] of this.board) {
      colors.set(position, tileInfo(tile).channels.map((_, i) => {
        const set = flows.get(`${position}#${i}`);
        return set && set.size ? [...set][0] : null;
      }));
    }
    return colors;
  }

  threatenedCitizens() {
    const threatened = new Set();
    const byPosition = new Map(this.citizens.map((c, i) => [c.position, i]));
    for (const [factoryPosition, product] of this.factories) {
      for (const node of this.flood([factoryPosition]).values()) {
        for (const side of tileInfo(this.board.get(node.position)).channels[node.index]) {
          const target = neighbor(node.position, side);
          const index = byPosition.get(target);
          if (index !== undefined && !this.board.has(target) && !this.factories.has(target)
            && this.citizens[index].owner !== FACTORY_OWNER[product]) threatened.add(index);
        }
      }
    }
    const queue = [...threatened];
    for (let h = 0; h < queue.length; h++) {
      const citizen = this.citizens[queue[h]];
      for (const side of SIDES) {
        const other = byPosition.get(neighbor(citizen.position, side));
        if (other !== undefined && !threatened.has(other) && this.citizens[other].owner === citizen.owner) {
          threatened.add(other);
          queue.push(other);
        }
      }
    }
    return threatened;
  }

  // ---- events, citizens, factories ----------------------------------------
  eventOrder(owners) {
    if (owners.length === 1) return owners;
    const living = owners.map((owner) => this.citizens.filter((c) => c.owner === owner).length);
    const first = living[0] === living[1] ? 1 - this.activePlayer : owners[living.indexOf(Math.max(...living))];
    return [first, owners.find((o) => o !== first)];
  }

  spawnSources(owner) {
    const sources = [...this.factories].filter(([, name]) => FACTORY_OWNER[name] === owner).map(([p]) => p);
    for (const [p, tile] of this.board) if (tile.spawn === owner) sources.push(p);
    return sources;
  }

  validCitizenCells(owner) {
    const cells = new Set();
    for (const source of this.spawnSources(owner)) {
      const queue = [[source, 0]];
      const seen = new Set([source]);
      for (let h = 0; h < queue.length; h++) {
        const [position, steps] = queue[h];
        if (steps === SPAWN_RANGE) continue;
        for (const side of SIDES) {
          const next = neighbor(position, side);
          const [x, y] = xy(next);
          if (inBounds(x, y) && !seen.has(next)) {
            seen.add(next);
            queue.push([next, steps + 1]);
            cells.add(next);
          }
        }
      }
    }
    const result = new Set();
    for (const cell of cells) {
      const [x, y] = xy(cell);
      if (!this.occupied(cell) && !(this.startingGridLocked() && !this.inStartingGrid(x, y))) result.add(cell);
    }
    return result;
  }

  scheduleCitizens(owners) {
    const placeable = owners.filter((owner) => this.validCitizenCells(owner).size);
    const forfeited = owners.filter((owner) => !placeable.includes(owner));
    for (const owner of forfeited) this.destroyed[owner] += 1;
    this.citizensDestroyedThisTurn += forfeited.length;
    this.pendingPlacements = placeable.length ? this.eventOrder(placeable) : [];
    this.placementIndex = 0;
    if (this.pendingPlacements.length) {
      this.setMessage(`${this.forfeitNote(forfeited)}${PLAYERS[this.pendingPlacements[0]]}: place a citizen on a highlighted space.`);
      this.refresh();
    } else {
      this.beginTurn();
      if (forfeited.length) {
        this.setMessage(this.forfeitNote(forfeited).trim());
        this.refresh();
      }
    }
  }

  forfeitNote(forfeited) {
    return forfeited.map(
      (owner) => `${PLAYERS[owner]} had no open spot; the citizen was destroyed (point to opponent). `,
    ).join("");
  }

  placeCitizen(position) {
    if (this.placementKind === "factory") {
      this.placeFactory(position);
      return;
    }
    const owner = this.pendingPlacements[this.placementIndex];
    if (!this.validCitizenCells(owner).has(position)) {
      this.setMessage(`Citizens must be placed within ${SPAWN_RANGE} cardinal steps of one of your factories or spawning tiles (highlighted). Intervening pipes, citizens, and construction sites do not block distance; the destination must be blank and inside the starting grid until it opens.`);
      return;
    }
    this.previewCell = null;
    const citizen = { owner, position, born: this.eventSteps };
    this.citizens.push(citizen);
    this.addEffect("place", { citizen });
    this.mark(position, null, owner);
    this.markEpoch += 1;
    this.placementIndex += 1;
    const forfeited = [];
    while (this.placementIndex < this.pendingPlacements.length
      && !this.validCitizenCells(this.pendingPlacements[this.placementIndex]).size) {
      const [lost] = this.pendingPlacements.splice(this.placementIndex, 1);
      this.destroyed[lost] += 1;
      this.citizensDestroyedThisTurn += 1;
      forfeited.push(lost);
    }
    const note = this.forfeitNote(forfeited);
    if (this.placementIndex === this.pendingPlacements.length) {
      this.pendingPlacements = [];
      this.beginTurn();
      if (note) this.setMessage(note.trim());
    } else {
      this.setMessage(`${note}${PLAYERS[this.pendingPlacements[this.placementIndex]]}: place a citizen.`);
    }
    this.refresh();
  }

  placementCells(owner) {
    return this.placementKind === "factory" ? this.validFactoryCells(owner) : this.validCitizenCells(owner);
  }

  validFactoryCells(owner) {
    const enemyProduct = FACTORIES_BY_OWNER[1 - owner];
    const flows = this.pipeFlows();
    const cells = new Set();
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const position = pos(x, y);
        if (this.occupied(position)) continue;
        let blocked = false;
        for (const side of SIDES) {
          const adjacent = neighbor(position, side);
          const pipe = this.board.get(adjacent);
          if (!pipe) continue;
          const index = tileInfo(pipe).portIndex[OPPOSITE[side]];
          if (index === undefined) continue;
          const set = flows.get(`${adjacent}#${index}`);
          if (set && set.has(enemyProduct)) { blocked = true; break; }
        }
        if (!blocked) cells.add(position);
      }
    }
    return cells;
  }

  scheduleFactories() {
    const owners = [0, 1].filter((o) => this.validFactoryCells(o).size);
    this.placementKind = "factory";
    this.pendingPlacements = owners.length ? this.eventOrder(owners) : [];
    this.placementIndex = 0;
    if (this.pendingPlacements.length) {
      this.setMessage(`${PLAYERS[this.pendingPlacements[0]]}: place a new factory on a highlighted space (not touching a pipe carrying the opponent's material).`);
      this.refresh();
    } else {
      this.placementKind = "citizen";
      this.beginTurn();
    }
  }

  placeFactory(position) {
    const owner = this.pendingPlacements[this.placementIndex];
    if (!this.validFactoryCells(owner).has(position)) {
      this.setMessage("Factories need an empty space (highlighted) that doesn't touch a pipe already carrying the opponent's material.");
      return;
    }
    this.factories.set(position, FACTORIES_BY_OWNER[owner]);
    this.recordPipeProductCounts();
    this.addEffect("pipe", { position });
    this.mark(position, null, owner);
    this.markEpoch += 1;
    this.placementIndex += 1;
    while (this.placementIndex < this.pendingPlacements.length
      && !this.validFactoryCells(this.pendingPlacements[this.placementIndex]).size) {
      this.pendingPlacements.splice(this.placementIndex, 1);
    }
    if (this.placementIndex === this.pendingPlacements.length) {
      this.pendingPlacements = [];
      this.placementKind = "citizen";
      this.beginTurn();
    } else {
      this.setMessage(`${PLAYERS[this.pendingPlacements[this.placementIndex]]}: place a new factory.`);
    }
    this.refresh();
  }

  endTurn(fromCpu = false) {
    if (this.gameOver || this.pendingPlacements.length) return;
    if (!fromCpu && this.isCpu(this.activePlayer)) return;
    if (!this.turnDone) return;
    this.fillHand(this.activePlayer);
    this.hand = null;
    this.selected = null;
    this.pool = null;
    this.undoStack = [];
    this.activePlayer = 1 - this.activePlayer;
    this.turnsInPair += 1;
    if (this.turnsInPair === 2) {
      this.turnsInPair = 0;
      this.eventSteps += 1;
      this.runEvent();
      return;
    }
    this.beginTurn();
  }

  // Runs after both players have moved; the event for the slot just completed.
  runEvent() {
    const event = this.eventPosition;
    this.eventPosition = (event % 10) + 1;
    if (event === 4) this.scheduleCitizens([0, 1]);
    else if (event === 6 || event === 8) this.scheduleCitizens([0]);
    else if (event === 7 || event === 9) this.scheduleCitizens([1]);
    else if (event === 10) {
      this.produce();
      this.afterProduction();
    } else this.beginTurn();
  }

  afterProduction() {
    if (this.eventSteps >= this.totalCycles * EVENT_CYCLE_LENGTH) {
      this.finishGame();
      return;
    }
    const sinceOpen = this.eventSteps - FULL_BOARD_CYCLES * EVENT_CYCLE_LENGTH;
    if (sinceOpen >= 0 && sinceOpen % (FACTORY_CYCLE_INTERVAL * EVENT_CYCLE_LENGTH) === 0) {
      this.scheduleFactories();
      return;
    }
    this.beginTurn();
  }

  produce() {
    const killed = new Set();
    for (const [factoryPosition, product] of this.factories) {
      this.addEffect("factory", { position: factoryPosition, product });
      for (const node of this.flood([factoryPosition]).values()) {
        this.addEffect("flow", { position: node.position, product, delay: Math.min(node.depth * 60, 1500) });
        for (const side of tileInfo(this.board.get(node.position)).channels[node.index]) {
          const target = neighbor(node.position, side);
          if (this.board.has(target) || this.factories.has(target)) continue;
          this.citizens.forEach((citizen, index) => {
            if (citizen.position === target && citizen.owner !== FACTORY_OWNER[product]) killed.add(index);
          });
        }
      }
    }
    // Chain rule: same-team citizens orthogonally touching a destroyed citizen also die.
    const byPosition = new Map(this.citizens.map((c, i) => [c.position, i]));
    const queue = [...killed];
    for (let h = 0; h < queue.length; h++) {
      const citizen = this.citizens[queue[h]];
      for (const side of SIDES) {
        const other = byPosition.get(neighbor(citizen.position, side));
        if (other !== undefined && !killed.has(other) && this.citizens[other].owner === citizen.owner) {
          killed.add(other);
          queue.push(other);
        }
      }
    }
    const indexes = [...killed].sort((a, b) => b - a);
    for (const index of indexes) {
      const citizen = this.citizens[index];
      this.addEffect("kill", { position: citizen.position, owner: citizen.owner });
      this.destroyed[citizen.owner] += 1;
      this.lifeRecords.push([citizen.owner, citizen.born, this.eventSteps]);
      this.citizens.splice(index, 1);
    }
    this.citizensDestroyedThisTurn += indexes.length;
    this.setMessage(indexes.length
      ? `Factories produced. ${indexes.length} citizen(s) destroyed.`
      : "Factories produced; no citizens were destroyed.");
  }

  finishGame() {
    this.maxCitizensDestroyedInTurn = Math.max(this.maxCitizensDestroyedInTurn, this.citizensDestroyedThisTurn);
    this.finalPipeProductCounts = this.pipeProductTileCounts();
    for (const product of Object.keys(this.finalPipeProductCounts)) {
      this.highestPipeProductCounts[product] = Math.max(
        this.highestPipeProductCounts[product], this.finalPipeProductCounts[product],
      );
    }
    this.gameOver = true;
    this.decimalScores = this.computeDecimalScores();
    this.scores = [this.destroyed[1], this.destroyed[0]];
    const [d0, d1] = this.decimalScores;
    if (this.scores[0] !== this.scores[1]) this.winner = this.scores[0] > this.scores[1] ? 0 : 1;
    else if (Math.abs(d0 - d1) > 1e-9) this.winner = d0 > d1 ? 0 : 1;
    else this.winner = null;
    let result = this.winner === null ? "The game is a draw." : `${PLAYERS[this.winner]} win!`;
    if (this.winner !== null && this.scores[0] === this.scores[1]) result += " (Decimal Alive Score tie-breaker)";
    this.result = result;
    this.setMessage(`Game over. ${result}`);
    this.refresh();
  }

  // Each placed citizen is worth the fraction of its potential life it completed.
  computeDecimalScores() {
    const end = this.eventSteps;
    const totals = [0, 0];
    for (const [owner, born, died] of this.lifeRecords) {
      const potential = end - born;
      totals[owner] += potential > 0 ? Math.min(1, (died - born) / potential) : 0;
    }
    for (const citizen of this.citizens) totals[citizen.owner] += 1;
    return totals;
  }

  cycleMilestoneText() {
    const done = Math.floor(this.eventSteps / EVENT_CYCLE_LENGTH);
    const lines = [`Full cycles completed: ${done} of ${this.totalCycles}`];
    const milestones = [[FULL_BOARD_CYCLES, "Grid opens + factory placement"]];
    for (let count = FULL_BOARD_CYCLES + FACTORY_CYCLE_INTERVAL; count < this.totalCycles; count += FACTORY_CYCLE_INTERVAL) {
      milestones.push([count, "Factory placement"]);
    }
    milestones.push([this.totalCycles, "GAME ENDS"]);
    const upcoming = milestones.filter((m) => m[0] > done);
    const past = milestones.filter((m) => m[0] <= done).slice(-1);
    for (const [cycles, label] of past) lines.push(`\u2713 ${cycles} cycles: ${label}`);
    upcoming.slice(0, 3).forEach(([cycles, label], i) => {
      lines.push(`${i === 0 ? "\u25b6" : "\u2022"} ${cycles} cycles: ${label}`);
    });
    return lines.join("\n");
  }

  actingPlayer() {
    return this.pendingPlacements.length ? this.pendingPlacements[this.placementIndex] : this.activePlayer;
  }

  isCpu(owner) {
    return !!this.cpu[owner];
  }

  // ---- CPU -----------------------------------------------------------------
  cpuLevel() {
    return DIFFICULTIES[this.difficulty[this.actingPlayer()]] || DIFFICULTIES.Normal;
  }

  cpuSmart() {
    return Math.random() < this.cpuLevel().smart;
  }

  cpuNoise() {
    return (Math.random() - 0.5) * 2 * this.cpuLevel().noise;
  }

  cpuStep() {
    if (this.gameOver) return;
    const owner = this.actingPlayer();
    if (!this.isCpu(owner)) return;
    if (this.pendingPlacements.length) {
      if (this.placementKind === "factory") this.placeFactory(this.cpuChooseFactoryCell(owner));
      else this.placeCitizen(this.cpuChooseCitizenCell(owner));
    } else if (this.turnDone) {
      this.endTurn(true);
    } else {
      this.cpuPlayTile(owner);
      this.refresh();
    }
  }

  enemyFedCells(owner) {
    const theirs = [...this.factories].filter(([, n]) => FACTORY_OWNER[n] !== owner).map(([p]) => p);
    return new Set(theirs.length ? [...this.flood(theirs).values()].map((n) => n.position) : []);
  }

  cpuChooseFactoryCell(owner) {
    const cells = [...this.validFactoryCells(owner)];
    if (!this.cpuSmart()) return randomChoice(cells);
    const enemies = this.citizens.filter((c) => c.owner !== owner).map((c) => c.position);
    const mine = [...this.factories].filter(([, n]) => FACTORY_OWNER[n] === owner).map(([p]) => p);
    const theirs = [...this.factories].filter(([, n]) => FACTORY_OWNER[n] !== owner).map(([p]) => p);
    const enemySpawns = [...this.board].filter(([, t]) => t.spawn !== null && t.spawn !== owner).map(([p]) => p);
    const enemyFed = this.enemyFedCells(owner);
    const score = (cell) => {
      let total = Math.random();
      for (const e of enemies) {
        const d = manhattan(cell, e);
        if (d <= 6) total += (7 - d) * 0.8;
      }
      if (enemies.length) total -= 0.3 * Math.min(...enemies.map((e) => manhattan(cell, e)));
      for (const p of mine) {
        const d = manhattan(cell, p);
        if (d < 5) total -= (5 - d) * 3;
      }
      for (const p of enemySpawns) if (manhattan(cell, p) <= 4) total += 1.5;
      total += SIDES.filter((s) => this.board.has(neighbor(cell, s))).length;
      for (const p of theirs) if (manhattan(cell, p) < 3) total -= 4;
      if (SIDES.some((s) => enemyFed.has(neighbor(cell, s)))) total -= 3;
      return total;
    };
    return maxBy(cells, score);
  }

  cpuChooseCitizenCell(owner) {
    const danger = this.exposedCells(FACTORIES_BY_OWNER[1 - owner]);
    const cells = [...this.validCitizenCells(owner)];
    if (!this.cpuSmart()) return randomChoice(cells);
    const mine = this.citizens.filter((c) => c.owner === owner).map((c) => c.position);
    const enemyFed = this.enemyFedCells(owner);
    const score = (cell) => {
      let total = Math.random();
      if (danger.has(cell)) total -= 20;
      for (const p of mine) {
        const d = manhattan(cell, p);
        if (d === 1) total -= 8;
        else if (d === 2) total -= 2;
        else if (d === 3) total -= 0.5;
      }
      for (const p of enemyFed) {
        const d = manhattan(cell, p);
        if (d <= 1) total -= 3;
        else if (d <= 2) total -= 0.7;
      }
      return total;
    };
    return maxBy(cells, score);
  }

  // Bomb / construction target ordering: enemy spawn points, then enemy-fed pipes.
  cpuPipeTargets(owner, positions) {
    if (!this.cpuSmart()) return shuffle([...positions]);
    const enemyFed = this.enemyFedCells(owner);
    const enemyCitizens = this.citizens.filter((c) => c.owner !== owner).map((c) => c.position);
    const priority = (position) => {
      const spawn = this.board.get(position).spawn;
      if (spawn === owner) return 99;
      let value = 0;
      if (spawn !== null) value -= 10;
      if (enemyFed.has(position)) value -= 3;
      if (enemyCitizens.length) value += 0.01 * Math.min(...enemyCitizens.map((e) => manhattan(position, e)));
      return value + Math.random() * 0.5;
    };
    return positions.map((p) => [priority(p), p]).sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  }

  cpuPlayTile(owner) {
    const source = this.tileSource();
    const order = shuffle(source.map((_, i) => i));
    const names = source.map((t) => t.name);
    const smart = this.cpuSmart();
    if (this.pool === null) {
      const others = names.filter((n) => n !== "Doubleplay");
      for (const i of order) {
        if (source[i].name === "Doubleplay") {
          const useful = others.filter((n) => n in PIPE_CHANNELS || n === "Bomb" || n === "Construction").length;
          const play = !smart ? Math.random() < 0.5 : useful >= 2 && Math.random() < 0.4;
          if (play) {
            this.selected = null;
            this.selectTile(i);
            this.selectTile(i);
            return;
          }
        }
      }
    }
    let candidates = order.filter((i) => source[i].name !== "Doubleplay");
    if (!candidates.length) {
      this.selected = null;
      this.selectTile(order[0]);
      this.selectTile(order[0]);
      return;
    }
    const enemySpawns = [...this.board.values()].some((t) => t.spawn !== null && t.spawn !== owner);
    const danger = this.exposedCells(FACTORIES_BY_OWNER[1 - owner]);
    const threatened = this.citizens.some((c) => c.owner === owner && danger.has(c.position));
    const rank = (i) => {
      const name = source[i].name;
      if (name.startsWith("Move ") && threatened) return -2;
      if ((name === "Bomb" || name === "Construction") && enemySpawns) return -1;
      return 0;
    };
    if (smart) candidates = candidates.map((i) => [rank(i), i]).sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    for (const i of candidates) {
      const before = this.playedCount;
      this.selectTile(i);
      this.cpuAct(owner);
      this.afterAction();
      if (this.playedCount !== before) return;
    }
    this.selectTile(candidates[0]);
    this.discardSelected();
  }

  exposedCells(product) {
    const cells = new Set();
    const sources = [...this.factories].filter(([, name]) => name === product).map(([p]) => p);
    for (const node of this.flood(sources).values()) {
      for (const side of tileInfo(this.board.get(node.position)).channels[node.index]) {
        const target = neighbor(node.position, side);
        const [x, y] = xy(target);
        if (inBounds(x, y) && !this.board.has(target) && !this.factories.has(target) && !this.blocks.has(target)) {
          cells.add(target);
        }
      }
    }
    return cells;
  }

  adjacentPairs(owner) {
    const cells = new Set(this.citizens.filter((c) => c.owner === owner).map((c) => c.position));
    let pairs = 0;
    for (const cell of cells) {
      if (cells.has(neighbor(cell, "R"))) pairs++;
      if (cells.has(neighbor(cell, "D"))) pairs++;
    }
    return pairs;
  }

  evaluate(owner) {
    const mine = this.exposedCells(FACTORIES_BY_OWNER[owner]);
    const theirs = this.exposedCells(FACTORIES_BY_OWNER[1 - owner]);
    let score = 0.1 * mine.size - 0.05 * theirs.size;
    const enemy = this.citizens.filter((c) => c.owner !== owner).map((c) => c.position);
    for (const citizen of this.citizens) if (citizen.owner === owner && theirs.has(citizen.position)) score -= 10;
    score += 10 * enemy.filter((p) => mine.has(p)).length;
    if (mine.size && enemy.length) {
      let best = Infinity;
      for (const a of mine) for (const b of enemy) best = Math.min(best, manhattan(a, b));
      score -= 0.2 * best;
    }
    for (const tile of this.board.values()) {
      if (tile.spawn === owner) score += 4;
      else if (tile.spawn !== null) score -= 4;
    }
    score -= 2 * this.adjacentPairs(owner);
    score += 1.5 * this.adjacentPairs(1 - owner);
    return score;
  }

  cpuAct(owner) {
    const baseline = this.evaluate(owner);
    const sample = this.cpuLevel().sample;
    const hand = this.hand;
    let best = null;
    let bestScore = baseline;
    if (hand in PIPE_CHANNELS) {
      bestScore = baseline - 5;
      const seen = new Set();
      const options = [];
      let fallback = null;
      for (let rotation = 0; rotation < 4; rotation++) {
        const tile = { name: hand, rotation, spawn: this.handSpawn ? owner : null };
        const signature = tileInfo(tile).channels.map((ch) => [...ch].sort().join("")).sort().join("|");
        if (seen.has(signature)) continue;
        seen.add(signature);
        for (const position of this.pipeCandidateCells()) {
          if (this.canPlacePipe(position, tile, false)) options.push([position, rotation, tile]);
        }
      }
      shuffle(options);
      let tried = 0;
      for (const [position, rotation, tile] of options) {
        if (tried >= sample) break;
        if (!this.canPlacePipe(position, tile)) continue;
        if (fallback === null) fallback = [position, rotation];
        tried++;
        this.board.set(position, tile);
        const score = this.evaluate(owner) + this.cpuNoise();
        this.board.delete(position);
        if (score > bestScore) { best = [position, rotation]; bestScore = score; }
      }
      if (best === null) best = fallback;
      if (best === null) return false;
      this.rotation = best[1];
      this.clickCell(best[0]);
    } else if (hand === "Bomb" || hand === "Construction") {
      const construction = hand === "Construction";
      const candidates = construction ? [...this.board.keys()].filter((p) => !this.factoryFed(p)) : [...this.board.keys()];
      const targets = this.cpuPipeTargets(owner, candidates);
      const fallback = targets.length ? targets[0] : null;
      for (const position of targets.slice(0, sample)) {
        const tile = this.board.get(position);
        this.board.delete(position);
        if (construction) this.blocks.add(position);
        const score = this.evaluate(owner) + this.cpuNoise();
        if (construction) this.blocks.delete(position);
        this.board.set(position, tile);
        if (score > bestScore) { best = position; bestScore = score; }
      }
      if (best === null) best = fallback;
      if (best === null) return false;
      this.clickCell(best);
    } else if (hand && hand.startsWith("Move ")) {
      const distance = Number(hand.split(" ")[1]);
      const options = [];
      for (const citizen of shuffle(this.citizens.filter((c) => c.owner === owner))) {
        for (const cell of this.moveCells(citizen.position, distance)) options.push([citizen, citizen.position, cell]);
      }
      shuffle(options);
      const fallback = options.length ? [options[0][1], options[0][2]] : null;
      for (const [citizen, origin, cell] of options.slice(0, sample)) {
        citizen.position = cell;
        const score = this.evaluate(owner) + this.cpuNoise();
        citizen.position = origin;
        if (score > bestScore) { best = [origin, cell]; bestScore = score; }
      }
      if (best === null) best = fallback;
      if (best === null) return false;
      this.clickCell(best[0]);
      this.clickCell(best[1]);
    }
    return this.actionDone;
  }
}
