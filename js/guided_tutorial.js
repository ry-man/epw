"use strict";

// Interactive tutorial: runs scripted situations on the real game UI with a coach card.
// Mirrors guided_tutorial.py. Board coordinates are relative to the 9x9 starting grid.

const GUIDE_GOLD = "#ffc83d";
const BASE_FACTORIES = [[2, 2, "Fire"], [6, 6, "Water"]];
const FIRE_LINE = [[3, 2, "Straight", "LR", null], [4, 2, "Straight", "LR", null]];
const DEFAULT_HANDS = ["Turn", "Straight", "Junction"];
const GUIDE_SPOTS = {
  board: ["boardWrap"],
  scores: ["scoreboard"],
  hand: ["hand", "handTitle"],
  dial: ["cycle"],
  rotate: ["rotateBtn"],
  discard: ["discardBtn"],
  end: ["endBtn"],
};

const GUIDED_STEPS = [
  {
    title: "Welcome",
    text: "This tutorial runs on the real game screen. Each step sets up a small situation, tells you what to try, "
      + "and waits while you do it. Use Next to move on, Skip if you get stuck, or Restart to reset the current step. "
      + "For tile counts and the full rulebook, use Game Rules from the menu.\n\nGoal of the game: your factories "
      + "send Fire or Water through connected pipes to destroy the enemy's citizens. The team that destroys more wins.",
  },
  {
    title: "The Board",
    spot: ["board"],
    text: "This is the board. Fire Folk (red, FF) own the Fire factory at the upper left; Ice Inhabitants (blue, II) "
      + "own the Water factory at the lower right. You build pipes from your factory toward the enemy.\n\n"
      + "For the first 2 event cycles everything must stay inside the shaded starting grid. After that the whole board opens up.",
  },
  {
    title: "The Scoreboard",
    spot: ["scores"],
    text: "Each team's card shows its score (enemy citizens you destroyed) and a bar for how many tiles remain in that "
      + "team's deck. The highlighted card is the team currently acting.",
  },
  {
    title: "Your Hand",
    spot: ["hand"],
    text: "Only the player whose turn it is sees their three tiles face-up. Tap a tile to select it. On your turn you "
      + "play one tile, then press End turn and your hand is refilled.",
  },
  {
    title: "The Event Cycle",
    spot: ["dial"],
    text: "The top row is the Event Cycle. It advances one space after BOTH players have taken a turn, then that space's "
      + "event happens:\n\u2022 Spaces 1, 2, 3 and 5: nothing - just keep building.\n\u2022 Space 4 (Both): each team places a citizen.\n"
      + "\u2022 Spaces 6 and 8 (FF): Fire Folk place a citizen.\n\u2022 Spaces 7 and 9 (II): Ice Inhabitants place a citizen.\n"
      + "\u2022 Space 10 (Prod): both factories produce - Fire and Water flow down every connected pipe and destroy "
      + "enemy citizens at open pipe ends. Then the cycle restarts at 1.\n\nThe bottom row is the Cycle Count: it fills in "
      + "one number each time a full 10-space cycle finishes. Gold numbers mark new-factory cycles: after the production "
      + "at the end of cycle 2 the starting grid opens up and each player places an extra factory, and again after every "
      + "2nd cycle (4, 6, 8...). The black number is the final cycle - the game ends after its production.",
  },
  {
    title: "Select a Tile",
    spot: ["hand"],
    hands: ["Turn", "Straight", "Junction"],
    text: "Try it: tap the Straight pipe in your hand.",
    goal: (g) => g.hand === "Straight",
    done: "Selected. It lifts up, and green dots on the board show where it could legally go.",
  },
  {
    title: "Rotate a Pipe",
    spot: ["hand", "rotate"],
    hands: ["Turn", "Junction", "Double turn"],
    text: "Select the Turn, then press Rotate (or the R key). The selected tile turns so you can line up its openings. "
      + "Every pipe can be rotated before you place it - a Double turn can even be flipped to the other diagonal. "
      + "No pipe has a dead end.",
    goal: () => guide.flags.rotated,
    done: "Good - rotate until the openings line up with where you want to connect.",
  },
  {
    title: "Place Your First Pipe",
    spot: ["hand"],
    cells: [[3, 2]],
    hands: ["Straight", "Turn", "Junction"],
    text: "A pipe must touch a factory (or another pipe). Select the Straight, tap the marked space beside the Fire "
      + "factory to PREVIEW it (green = legal, red = illegal), rotate if needed, then tap the same space again to place it.",
    goal: (g) => g.board.size >= 1,
    done: "Placed! The pipe is red because it is connected to a Fire factory; pipes not connected to any factory are grey.",
  },
  {
    title: "Connecting Pipes",
    board: [FIRE_LINE[0]],
    hands: ["Turn", "Junction", "Straight"],
    cells: [[4, 2], [3, 1], [3, 3]],
    text: "Wherever two tiles touch, either both have an opening there or both are closed. Open ports may face empty "
      + "spaces. Try previewing the Turn at a few of the marked spaces and rotate it - a red ghost means the openings "
      + "don't match. Then place a pipe that legally continues the line.",
    goal: (g) => g.board.size >= 2,
    done: "Nice. Also remember a pipe can never join Fire and Water: a channel carries one element or the other.",
  },
  {
    title: "Plus vs. Cross",
    factories: [[2, 2, "Fire"], [4, 0, "Water"]],
    board: [FIRE_LINE[0], [4, 1, "Straight", "UD", null]],
    hands: ["Plus", "Cross", "Turn"],
    cells: [[4, 2]],
    text: "A Fire pipe arrives from the left and a Water pipe from above. Select the Plus and preview it on the marked "
      + "space: all four sides join, so Fire and Water would mix - illegal (red). Now try the Cross: its left-right and "
      + "up-down channels never mix, so it is legal. Place the Cross.",
    goal: (g) => { const t = g.board.get(guideAt(4, 2)); return !!t && t.name === "Cross"; },
    done: "The Cross lets two pipes pass over each other. Double turns behave the same way.",
  },
  {
    title: "Citizens and Spawning",
    board: [[3, 2, "Straight", "LR", 0]],
    citizensEvent: [0],
    text: "At a citizen event you place a new citizen within 2 steps (up/down/left/right, ignoring obstacles) of one of "
      + "your factories or star pipes. The pipe next to the factory here is a star pipe, so it adds its own spawn range. "
      + "Valid spaces are tinted - tap one.",
    goal: (g) => g.citizens.length >= 1,
    done: "Citizen placed. If no open space existed the citizen would be destroyed immediately and count for your opponent!",
  },
  {
    title: "Production and Chains",
    spot: ["board"],
    board: FIRE_LINE,
    citizens: [[0, 6, 2], [1, 5, 2], [1, 5, 3], [1, 5, 4], [1, 7, 7]],
    text: "Frightened citizens are in danger: an enemy citizen sitting at an open end of a pipe carrying fire or water is "
      + "destroyed when the factory produces, and so is every same-team citizen touching a destroyed one (the chain rule). "
      + "Your own element never hurts you. Press the button to fire the factories and watch.",
    action: ["Produce!", () => guideProduce()],
    goal: () => guide.flags.produced,
    done: "The Ice citizen at the pipe end fell and took the two touching it along. The Fire citizen and the Ice citizen "
      + "standing apart were untouched. Don't cluster citizens!",
  },
  {
    title: "Bomb",
    spot: ["hand"],
    active: 1,
    board: FIRE_LINE,
    citizens: [[1, 5, 2], [1, 5, 3]],
    hands: ["Bomb", "Straight", "Turn"],
    text: "Now you are the Ice team and your citizens are threatened - the Fire pipe points at them. A Bomb destroys any "
      + "one pipe. Select the Bomb and tap a Fire pipe to cut it off.",
    goal: (g) => g.board.size < 2,
    done: "Pipe destroyed - nothing flows past the break, and your citizens are safe.",
  },
  {
    title: "Construction",
    active: 1,
    board: FIRE_LINE,
    citizens: [[1, 5, 2], [1, 5, 3]],
    hands: ["Construction", "Bomb", "Move 1"],
    cells: [[3, 2], [4, 2]],
    text: "Construction replaces a pipe with a permanent barricade. First tap the pipe touching the factory - it is "
      + "refused, because construction can't replace a pipe opening directly onto a factory. Then build over the other pipe.",
    goal: (g) => g.blocks.size >= 1,
    done: "A construction site can never be built on, moved onto, bombed or rebuilt.",
  },
  {
    title: "Moving Citizens",
    active: 1,
    board: FIRE_LINE,
    citizens: [[1, 5, 2], [1, 5, 3]],
    hands: ["Move 2", "Straight", "Turn"],
    text: "Move 1, 2 and 3 move one of your citizens that many spaces. Select Move 2, tap the threatened citizen at the "
      + "pipe end (green spaces show where it can go), then tap an empty destination. Movement is up/down/left/right and "
      + "can't pass through pipes, factories, construction or other citizens.",
    goal: (g) => g.citizens.length > 0 && g.threatenedCitizens().size === 0,
    done: "Safe! Moving out of danger is often better than cutting a pipe.",
  },
  {
    title: "Doubleplay",
    spot: ["hand"],
    hands: ["Doubleplay", "Straight", "Turn"],
    text: "Tap the Doubleplay twice to activate it. You must then play ALL the other tiles in your hand, in any order, "
      + "before ending your turn. Play the Straight and the Turn next to your factory or each other.",
    goal: (g) => g.pool !== null && g.pool.length === 0,
    done: "A Doubleplay turns one turn into several actions. Doubleplays drawn this way chain into up to 2 extra tiles each.",
  },
  {
    title: "Discarding",
    spot: ["discard"],
    hands: ["Bomb", "Straight", "Turn"],
    text: "There are no pipes on the board, so a Bomb has nothing to hit. Select it - the Discard button lights up only "
      + "when the selected tile has no legal move. Discard it.",
    goal: () => guide.flags.discarded,
    done: "The tile is removed from the game and immediately replaced from your deck.",
  },
  {
    title: "A Full Turn and the Event Cycle",
    spot: ["end", "dial"],
    position: 4,
    hands: ["Straight", "Turn", "Junction"],
    opponent: ["Straight", "Turn", "Junction"],
    text: "Play any legal tile next to your factory, then press End turn (or E). Then play as the Ice team the same way. "
      + "The Event Cycle is on space 4, so once both of you have moved a citizen event happens for both teams - place one citizen "
      + "each. Whoever has more living citizens places first (a tie goes to the player who just finished).",
    goal: (g) => g.eventPosition === 5 && !g.pendingPlacements.length,
    done: "That's one slot of the Event Cycle. Spaces 6-9 give citizens to a single team and space 10 is production, after which "
      + "the cycle restarts.",
  },
  {
    title: "New Factories",
    spot: ["board"],
    board: [...FIRE_LINE, [5, 6, "Straight", "LR", null]],
    steps: 20,
    factoryEvent: true,
    text: "When the early game ends, and every 2 cycles after, each player places a new factory anywhere on the board "
      + "right after production. Tinted spaces are legal - they must be empty and can't touch a pipe carrying the "
      + "opponent's element. Place one for each team (notice what each side is blocked from).",
    goal: (g) => g.factories.size >= 4,
    done: "New factories work immediately and provide spawn points. More factories means more pipes to build and more "
      + "danger for the enemy.",
  },
  {
    title: "Winning the Game",
    spot: ["scores"],
    text: "Before a game you choose 8, 10 or 12 full cycles. After the last production the player who destroyed more "
      + "citizens wins; ties are broken by Decimal Alive Score (each surviving citizen counts 1, destroyed ones count the "
      + "fraction of their potential life they completed). The game also ends early if both decks and hands run empty.",
  },
  {
    title: "You're Ready!",
    text: "Tips: keep citizens spread out and away from pipe ends, bomb or build over dangerous pipes, and use Move tiles "
      + "to dodge. Press Finish and start a game - Game Rules is always there for reference.",
  },
];

const guide = { active: false, index: 0, done: false, armed: false, flags: {}, saved: null, back: "title" };

const guideAt = (x, y) => pos(START_OFFSET + x, START_OFFSET + y);

function guideRotation(name, ports) {
  const wanted = [...ports].sort().join("");
  for (let rotation = 0; rotation < 4; rotation++) {
    if ([...tileInfo({ name, rotation }).ports].sort().join("") === wanted) return rotation;
  }
  return 0;
}

function guideLoad(g, step) {
  g.effects = [];
  g.board = new Map();
  for (const [x, y, name, ports, spawn] of step.board || []) {
    g.board.set(guideAt(x, y), { name, rotation: guideRotation(name, ports), spawn: spawn === undefined ? null : spawn });
  }
  g.factories = new Map((step.factories || BASE_FACTORIES).map(([x, y, kind]) => [guideAt(x, y), kind]));
  g.blocks = new Set();
  g.citizens = (step.citizens || []).map(([owner, x, y]) => ({ owner, position: guideAt(x, y), born: 0 }));
  g.destroyed = [0, 0];
  g.pendingPlacements = [];
  g.placementKind = "citizen";
  g.placementIndex = 0;
  g.gameOver = false;
  g.activePlayer = step.active || 0;
  g.turnsInPair = 0;
  g.eventPosition = step.position || 1;
  g.eventSteps = step.steps || 0;
  const tiles = (names) => names.map((name) => ({ name, spawn: false }));
  g.hands = [tiles(step.hands || DEFAULT_HANDS), tiles(step.hands || DEFAULT_HANDS)];
  if (step.opponent) g.hands[1 - g.activePlayer] = tiles(step.opponent);
  g.pool = null;
  g.selected = null;
  g.hand = null;
  g.rotation = 0;
  g.previewCell = null;
  g.movingCitizen = null;
  g.actionDone = false;
  g.playedCount = 0;
  g.marks = [null, null];
  g.recordPipeProductCounts();
  g.beginTurn();
  if (step.citizensEvent) g.scheduleCitizens(step.citizensEvent);
  if (step.factoryEvent) g.scheduleFactories();
}

function guideProduce() {
  guide.flags.produced = true;
  game.eventPosition = 10;
  game.runEvent();
  game.refresh();
}

function guideEnter(index) {
  guide.index = Math.max(0, Math.min(index, GUIDED_STEPS.length - 1));
  guide.armed = false;
  guide.done = false;
  guide.flags = {};
  if (cpuTimer !== null) { clearTimeout(cpuTimer); cpuTimer = null; }
  const g = new Game({ totalCycles: 10, cpu: [false, false] });
  const rotate = g.rotateTile.bind(g);
  g.rotateTile = () => {
    const before = g.rotation;
    rotate();
    if (g.rotation !== before) { guide.flags.rotated = true; guideSync(); }
  };
  const discard = g.discardSelected.bind(g);
  g.discardSelected = () => {
    const ok = discard();
    if (ok) { guide.flags.discarded = true; guideSync(); }
    return ok;
  };
  game = g;
  guideLoad(g, GUIDED_STEPS[guide.index]);
  g.onChange = () => { render(); guideSync(); };
  derived = { version: -1 };
  handKey = "";
  staticKey = "";
  layout();
  guide.armed = true;
  render();
  guideRender();
}

function guideSync() {
  if (!guide.armed || !guide.active) return;
  const step = GUIDED_STEPS[guide.index];
  if (step.goal && !guide.done && step.goal(game)) {
    guide.done = true;
    guideRender();
  }
}

function guideRender() {
  const step = GUIDED_STEPS[guide.index];
  const last = guide.index === GUIDED_STEPS.length - 1;
  const interactive = !!step.goal;
  $("coachCount").textContent = `Tutorial - step ${guide.index + 1} of ${GUIDED_STEPS.length}`;
  $("coachTitle").textContent = step.title;
  $("coachText").textContent = step.text;
  $("coachDone").hidden = !guide.done;
  $("coachDone").textContent = guide.done ? `\u2714 ${step.done}` : "";
  const action = $("coachAction");
  action.hidden = !step.action || guide.done;
  if (step.action) action.textContent = step.action[0];
  $("coachBack").disabled = guide.index === 0;
  $("coachRestart").hidden = !interactive;
  $("coachNext").textContent = last ? "Finish" : interactive && !guide.done ? "Skip \u25B6" : "Next \u25B6";
  $("coachNext").classList.toggle("primary", !interactive || guide.done || last);
  const spots = new Set((step.spot || []).flatMap((key) => GUIDE_SPOTS[key]));
  for (const ids of Object.values(GUIDE_SPOTS)) {
    for (const id of ids) $(id).classList.toggle("spot", spots.has(id));
  }
  $("coach").scrollTop = 0;
  layout();
}

function drawGuideHints(ctx, now) {
  if (!guide.active || guide.done) return;
  const cells = GUIDED_STEPS[guide.index].cells;
  if (!cells) return;
  ctx.save();
  ctx.strokeStyle = GUIDE_GOLD;
  ctx.lineWidth = 3 + Math.round(Math.sin(now / 220) + 1);
  ctx.setLineDash([5, 4]);
  for (const [x, y] of cells) {
    const [ax, ay] = xy(guideAt(x, y));
    ctx.strokeRect(ax * cell + 2, ay * cell + 2, cell - 4, cell - 4);
  }
  ctx.restore();
}

function startGuide(back) {
  if (guide.active) return;
  if (cpuTimer !== null) { clearTimeout(cpuTimer); cpuTimer = null; }
  guide.saved = { game, boardSize: BOARD_SIZE, startOffset: START_OFFSET };
  guide.back = back;
  guide.active = true;
  document.body.classList.add("tutoring");
  $("title").hidden = true;
  $("coach").hidden = false;
  hideOverlay();
  guideEnter(0);
}

function exitGuide() {
  if (!guide.active) return;
  guide.active = false;
  guide.armed = false;
  document.body.classList.remove("tutoring");
  $("coach").hidden = true;
  for (const ids of Object.values(GUIDE_SPOTS)) for (const id of ids) $(id).classList.remove("spot");
  const saved = guide.saved;
  guide.saved = null;
  BOARD_SIZE = saved.boardSize;
  START_OFFSET = saved.startOffset;
  game = saved.game;
  derived = { version: -1 };
  handKey = "";
  staticKey = "";
  layout();
  if (game) render();
  if (guide.back === "title") {
    $("title").hidden = false;
    renderTitle();
  } else {
    showOverlay(guide.back);
  }
}

function setupGuide() {
  $("coachExit").addEventListener("click", exitGuide);
  $("coachBack").addEventListener("click", () => guideEnter(guide.index - 1));
  $("coachRestart").addEventListener("click", () => guideEnter(guide.index));
  $("coachNext").addEventListener("click", () => {
    if (guide.index === GUIDED_STEPS.length - 1) exitGuide();
    else guideEnter(guide.index + 1);
  });
  $("coachAction").addEventListener("click", () => GUIDED_STEPS[guide.index].action[1]());
}
