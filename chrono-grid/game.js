const {
  ART,
  CARD_FRAMES,
  START_AP,
  MAX_AP,
  AP_GAIN,
  BOARD,
  DECK_TARGET_SIZE,
  MAX_CARD_COPIES,
  DECK_STORAGE_KEY,
  LEADER_TRAIT_STORAGE_KEY,
  LEADER_TRAITS,
  CARDS,
  DECK
} = window.ChronoGridData;

const el = {
  stage: document.querySelector("#stage"),
  enemyGrid: document.querySelector("#enemyGrid"),
  playerGrid: document.querySelector("#playerGrid"),
  hand: document.querySelector("#hand"),
  handRail: document.querySelector("#handRail"),
  logPanel: document.querySelector("#logPanel"),
  logButton: document.querySelector("#logButton"),
  hint: document.querySelector("#hint"),
  log: document.querySelector("#log"),
  apPips: document.querySelector("#apPips"),
  apText: document.querySelector("#apText"),
  turnNumber: document.querySelector("#turnNumber"),
  endTurn: document.querySelector("#endTurnButton"),
  modeSelect: document.querySelector("#modeSelect"),
  cpuModeButton: document.querySelector("#cpuModeButton"),
  onlineModeButton: document.querySelector("#onlineModeButton"),
  deckModeButton: document.querySelector("#deckModeButton"),
  modeNotice: document.querySelector("#modeNotice"),
  deckEditButton: document.querySelector("#deckEditButton"),
  deckEditor: document.querySelector("#deckEditor"),
  deckBackButton: document.querySelector("#deckBackButton"),
  deckCloseButton: document.querySelector("#deckCloseButton"),
  deckResetButton: document.querySelector("#deckResetButton"),
  deckEditorStatus: document.querySelector("#deckEditorStatus"),
  leaderTraitPicker: document.querySelector("#leaderTraitPicker"),
  deckCardGrid: document.querySelector("#deckCardGrid"),
  deckList: document.querySelector("#deckList"),
  deckFocusCard: document.querySelector("#deckFocusCard"),
  deckFocusCopy: document.querySelector("#deckFocusCopy"),
  dragArrowLayer: document.querySelector("#dragArrowLayer"),
  dragArrowLine: document.querySelector("#dragArrowLine"),
  detailCard: document.querySelector("#detailCard"),
  detailCopy: document.querySelector("#detailCopy"),
  cellTemplate: document.querySelector("#cellTemplate"),
  cardTemplate: document.querySelector("#cardTemplate"),
  gridSettingsButton: document.querySelector("#gridSettingsButton"),
  gridSettingsMenu: document.querySelector("#gridSettingsMenu"),
  retireButton: document.querySelector("#retireButton"),
  settingsCloseButton: document.querySelector("#settingsCloseButton")
};

let state;
let nextId = 1;
let dragHoldTimer = null;
let deckEditorIds = [];
let deckEditorFocusId = null;
let deckEditorLeaderTraitId = "bulwark";
let deckEditorReturnToMode = false;
let currentMode = "cpu";
const bootParams = new URLSearchParams(location.search);
const EMBEDDED_MODE = bootParams.get("embedded") === "1";
const ENTRY_MODE = bootParams.get("entry") || (location.hash === "#deck" ? "deck" : "menu");
const EFFECT_KEYWORD_HELP = {
  固定: "攻撃範囲がカードごとに決まった位置を参照します。ユニットを移動しても攻撃範囲は変わりません。",
  変動: "攻撃範囲がユニットの現在位置を基準に動きます。ユニットを移動すると攻撃範囲も移動します。",
  召喚: "このカードを手札から場に出したときに発動する効果です。",
  発動: "このカードを使ったときに解決する効果です。",
  罠: "相手フィールドに伏せておき、条件を満たした相手ユニットが入ったときに発動します。",
  強化: "自分の場の対象に使い、そのユニットや大将を強くするカードです。"
};

if (EMBEDDED_MODE) {
  document.documentElement.classList.add("embedded-mode");
}

function createGame(mode = currentMode) {
  currentMode = mode;
  setGridSettingsOpen(false);
  nextId = 1;
  state = {
    mode,
    active: "player",
    turn: 1,
    selected: null,
    drag: null,
    cardDrag: null,
    suppressClick: false,
    animating: false,
    logOpen: false,
    winner: null,
    choice: null,
    log: [],
    player: createSide("あなた", "自分の大将", 18, 2, 1, "player", loadLeaderTraitId()),
    enemy: createSide("相手", "相手の大将", 18, 0, 1, "enemy", "bulwark")
  };
  state.player.deck = shuffle(loadPlayerDeckIds().map((id) => createCard(id, "player")));
  state.enemy.deck = shuffle(DECK.map((id) => createCard(id, "enemy")));
  draw("player", 5);
  draw("player", leaderTrait("player").bonusDraw || 0);
  draw("enemy", 5);
  addLog("バトル開始。カードを選び、盤面に召喚・設置・強化しよう。");
  startTurn("player", true);
  fitStage();
  render();
  if (!EMBEDDED_MODE && location.hash === "#deck") openDeckEditor();
}

function createSide(label, leaderName, hp, leaderR, leaderC, sideName, leaderTraitId = "bulwark") {
  const board = Array.from({ length: BOARD }, () =>
    Array.from({ length: BOARD }, () => ({ piece: null, trap: null }))
  );
  const traitId = LEADER_TRAITS[leaderTraitId] ? leaderTraitId : "bulwark";
  const leader = {
    id: `leader-${label}`,
    type: "leader",
    name: "大将",
    label: leaderName,
    side: sideName,
    r: leaderR,
    c: leaderC,
    hp,
    leaderTraitId: traitId,
    shield: 0,
    art: sideName === "player" ? ART.forest : ART.witch
  };
  board[leaderR][leaderC].piece = leader;
  return {
    label,
    leaderName,
    hp,
    maxHp: hp,
    leaderTraitId: traitId,
    maxAp: START_AP,
    ap: START_AP,
    hasStarted: false,
    leaderMove: 1,
    turnsStarted: 0,
    hand: [],
    deck: [],
    board
  };
}

function createCard(id, owner) {
  return { ...CARDS[id], uid: `${owner}-${nextId++}`, owner };
}

function loadPlayerDeckIds() {
  const saved = readSavedDeckIds();
  return saved.length ? saved : [...DECK];
}

function loadLeaderTraitId() {
  const saved = localStorage.getItem(LEADER_TRAIT_STORAGE_KEY);
  return LEADER_TRAITS[saved] ? saved : "bulwark";
}

function saveLeaderTraitId(id) {
  const safe = LEADER_TRAITS[id] ? id : "bulwark";
  localStorage.setItem(LEADER_TRAIT_STORAGE_KEY, safe);
  return safe;
}

function leaderTrait(sideName) {
  return LEADER_TRAITS[side(sideName).leaderTraitId] || LEADER_TRAITS.bulwark;
}

function readSavedDeckIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DECK_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return sanitizeDeckIds(parsed);
  } catch {
    return [];
  }
}

function sanitizeDeckIds(ids) {
  const counts = {};
  const result = [];
  ids.forEach((id) => {
    if (!CARDS[id]) return;
    counts[id] = counts[id] || 0;
    if (counts[id] >= MAX_CARD_COPIES) return;
    counts[id] += 1;
    result.push(id);
  });
  return result;
}

function saveDeckIds(ids) {
  const safe = sanitizeDeckIds(ids);
  localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(safe));
  return safe;
}

function deckCounts(ids = deckEditorIds) {
  return ids.reduce((counts, id) => {
    counts[id] = (counts[id] || 0) + 1;
    return counts;
  }, {});
}

function createUnit(card, sideName, r, c) {
  return {
    id: `unit-${nextId++}`,
    type: "unit",
    cardId: card.id,
    name: card.name,
    side: sideName,
    r,
    c,
    cost: card.cost,
    atk: card.atk,
    hp: card.hp,
    maxHp: card.hp,
    pattern: card.pattern,
    trait: card.trait || null,
    rarity: card.rarity || "bronze",
    summonedTurn: side(sideName)?.turnsStarted || 0,
    lastMovedTurn: null,
    attackedTurn: null,
    moved: false,
    shield: 0,
    art: card.art,
    text: card.text
  };
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function side(name) {
  return state[name];
}

function opponent(name) {
  return name === "player" ? "enemy" : "player";
}

function draw(sideName, count = 1) {
  const target = side(sideName);
  for (let i = 0; i < count; i++) {
    if (!target.deck.length) {
      damageLeader(sideName, 1, "デッキ切れ");
      continue;
    }
    if (target.hand.length >= 7) {
      target.deck.shift();
      addLog(`${target.label}の手札が上限のため1枚消滅。`);
      continue;
    }
    target.hand.push(target.deck.shift());
  }
}

async function startTurn(sideName, first = false) {
  state.active = sideName;
  state.selected = null;
  const current = side(sideName);
  current.turnsStarted += 1;
  if (!current.hasStarted) {
    current.maxAp = START_AP;
    current.hasStarted = true;
  } else {
    current.maxAp = Math.min(MAX_AP, current.maxAp + AP_GAIN);
  }
  current.ap = current.maxAp;
  current.leaderMove = leaderTrait(sideName).leaderMoves || 1;
  if (!first) {
    if (sideName === "player") state.turn += 1;
    addLog(`${current.label}のターン開始。予約攻撃を解決。`);
    draw(sideName, 1);
  }
  checkWinner();
}

async function resolveAutoAttacks(sideName) {
  const units = pieces(sideName)
    .filter((piece) => piece.type === "unit")
    .sort((a, b) => boardOrder(a) - boardOrder(b));
  for (const unit of units) {
    const live = findPiece(unit.side, unit.id);
    if (!live || state.winner) continue;
    if (!canUnitAttack(live.piece)) continue;
    await fireUnit(live.piece);
    cleanup();
    checkWinner();
    render();
  }
  cleanup();
}

function canUnitAttack(unit) {
  const currentTurn = side(unit.side).turnsStarted;
  return unit.summonedTurn !== currentTurn
    && unit.lastMovedTurn !== currentTurn
    && unit.attackedTurn !== currentTurn;
}

async function fireUnit(unit) {
  unit.attackedTurn = side(unit.side).turnsStarted;
  const targetSide = opponent(unit.side);
  const damage = unit.atk + (unit.cardId === "clockWitch" && unit.lastMovedTurn !== side(unit.side).turnsStarted ? 1 : 0);
  addLog(`${label(unit.side)}の${unit.name}が${patternLabel(unit.pattern)}を攻撃。`);
  await showAttackFocus(unit);
  attackCells(unit).forEach(({ r, c }) => {
    const target = side(targetSide).board[r]?.[c]?.piece;
    if (target) damagePiece(targetSide, target, damage, unit.name);
  });
  await sleep(220);
}

function boardOrder(piece) {
  return piece.r * BOARD + piece.c + 1;
}

function attackCells(unit) {
  const mirrored = { r: BOARD - 1 - unit.r, c: unit.c };
  if (unit.pattern === "front") return [mirrored];
  if (unit.pattern === "column") return [0, 1, 2].map((r) => ({ r, c: unit.c }));
  if (unit.pattern === "frontRow") {
    const r = unit.side === "player" ? 2 : 0;
    return [0, 1, 2].map((c) => ({ r, c }));
  }
  return [mirrored];
}

function patternLabel(pattern) {
  return {
    front: "正面1マス",
    column: "同じ列",
    frontRow: "前列"
  }[pattern] || "指定範囲";
}

function label(sideName) {
  return side(sideName).label;
}

function pieces(sideName) {
  const found = [];
  side(sideName).board.forEach((row) => {
    row.forEach((cell) => {
      if (cell.piece) found.push(cell.piece);
    });
  });
  return found;
}

function findPiece(sideName, id) {
  for (let r = 0; r < BOARD; r++) {
    for (let c = 0; c < BOARD; c++) {
      const piece = side(sideName).board[r][c].piece;
      if (piece?.id === id) return { piece, r, c };
    }
  }
  return null;
}

function damagePiece(sideName, piece, amount, source) {
  if (piece.type === "leader") {
    damageLeader(sideName, amount, source);
    return;
  }
  const blocked = Math.min(amount, piece.shield || 0);
  piece.shield = Math.max(0, (piece.shield || 0) - amount);
  const finalDamage = Math.max(0, amount - blocked);
  piece.hp -= finalDamage;
  showDamagePopup(sideName, piece.r, piece.c, finalDamage);
  addLog(`${source}が${piece.name}に${finalDamage}ダメージ。`);
}

function damageLeader(sideName, amount, source) {
  const target = side(sideName);
  const leader = pieces(sideName).find((piece) => piece.type === "leader");
  let reduction = leader?.shield || 0;
  if (leader) leader.shield = 0;
  reduction += leaderTrait(sideName).damageReduction || 0;
  if (hasGuardInFront(sideName)) reduction += 1;
  const finalDamage = Math.max(0, amount - reduction);
  target.hp -= finalDamage;
  if (leader) leader.hp = target.hp;
  if (leader) showDamagePopup(sideName, leader.r, leader.c, finalDamage);
  addLog(`${source}が${target.label}の大将に${finalDamage}ダメージ。`);
}

function hasGuardInFront(sideName) {
  const leader = pieces(sideName).find((piece) => piece.type === "leader");
  if (!leader) return false;
  return pieces(sideName).some((piece) => {
    if (piece.type !== "unit" || piece.trait !== "guard" || piece.c !== leader.c) return false;
    return sideName === "player" ? piece.r < leader.r : piece.r > leader.r;
  });
}

function cleanup() {
  ["player", "enemy"].forEach((sideName) => {
    side(sideName).board.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell.piece?.type === "unit" && cell.piece.hp <= 0) {
          addLog(`${cell.piece.name}が破壊された。`);
          side(sideName).board[r][c].piece = null;
        }
      });
    });
  });
}

function checkWinner() {
  if (state.winner) return;
  if (state.player.hp <= 0 && state.enemy.hp <= 0) state.winner = "引き分け";
  else if (state.enemy.hp <= 0) state.winner = "勝利";
  else if (state.player.hp <= 0) state.winner = "敗北";
}

function addLog(text) {
  state.log.unshift(text);
  state.log = state.log.slice(0, 7);
}

function playCard(index, sideName, boardSide, r, c) {
  const owner = side(sideName);
  const card = owner.hand[index];
  if (!card || owner.ap < card.cost) return false;

  if (card.kind === "boost" && card.target === "none") {
    owner.ap -= card.cost;
    owner.hand.splice(index, 1);
    applyBoost(card, null, sideName);
    cleanup();
    checkWinner();
    return true;
  }

  if (card.kind === "unit") {
    if (boardSide !== sideName) return false;
    const cell = side(boardSide).board[r][c];
    if (cell.piece) return false;
    owner.ap -= card.cost;
    owner.hand.splice(index, 1);
    cell.piece = createUnit(card, sideName, r, c);
    addLog(`${owner.label}が${card.name}を召喚。`);
    triggerTrap(boardSide, cell.piece, r, c);
    resolveSummonEffect(card, sideName);
  }

  if (card.kind === "trap") {
    const targetSide = opponent(sideName);
    if (boardSide !== targetSide) return false;
    const cell = side(targetSide).board[r][c];
    if (cell.piece || cell.trap) return false;
    owner.ap -= card.cost;
    owner.hand.splice(index, 1);
    cell.trap = { ...card, owner: sideName };
    addLog(`${owner.label}が相手フィールドに罠を設置。`);
  }

  if (card.kind === "boost") {
    if (boardSide !== sideName) return false;
    const target = side(boardSide).board[r][c].piece;
    if (!target) return false;
    if (card.id === "hasteSeal" && target.type !== "unit") return false;
    owner.ap -= card.cost;
    owner.hand.splice(index, 1);
    applyBoost(card, target, sideName);
  }

  cleanup();
  checkWinner();
  return true;
}

function applyBoost(card, target, sideName) {
  if (card.effect === "draw") {
    draw(sideName, card.draw || 1);
    addLog(`${label(sideName)}は${card.name}でカードを${card.draw || 1}枚引いた。`);
    return;
  }
  if (card.id === "hasteSeal") {
    target.atk += 1;
    addLog(`${target.name}に加速刻印。攻撃力+1。`);
  }
  if (card.id === "starShield") {
    target.shield = Math.max(target.shield || 0, 1);
    addLog(`${target.name}に星盾結界。次のダメージを軽減。`);
  }
}

function resolveSummonEffect(card, sideName) {
  if (card.effect !== "summonReturnDraw") return;
  const owner = side(sideName);
  if (!owner.hand.length) {
    addLog(`${card.name}の召喚効果。戻す手札がないため不発。`);
    return;
  }
  if (sideName !== "player") {
    const index = chooseReturnDrawIndex(owner.hand);
    completeReturnDrawChoice(sideName, index, card.name, { renderAfter: false });
    return;
  }
  state.choice = {
    type: "returnDraw",
    sideName,
    sourceName: card.name
  };
}

function chooseReturnDrawIndex(hand) {
  return hand
    .map((card, index) => ({ card, index }))
    .sort((a, b) => a.card.cost - b.card.cost || a.index - b.index)[0]?.index ?? -1;
}

function completeReturnDrawChoice(sideName, index, sourceName, { renderAfter = true } = {}) {
  const owner = side(sideName);
  const card = owner.hand[index];
  if (!card) return;
  owner.hand.splice(index, 1);
  owner.deck.push(card);
  owner.deck = shuffle(owner.deck);
  addLog(`${label(sideName)}は${sourceName}で${card.name}をデッキに戻した。`);
  draw(sideName, 1);
  state.choice = null;
  cleanup();
  checkWinner();
  if (renderAfter) render();
}

function movePiece(sideName, fromR, fromC, toR, toC) {
  const current = side(sideName);
  const from = current.board[fromR][fromC];
  const to = current.board[toR][toC];
  const piece = from.piece;
  if (!piece || to.piece) return false;
  const distance = Math.abs(fromR - toR) + Math.abs(fromC - toC);
  if (distance < 1) return false;

  if (piece.type === "leader") {
    if (current.leaderMove <= 0) return false;
    current.leaderMove -= 1;
  } else {
    if (current.ap < distance) return false;
    current.ap -= distance;
    piece.moved = true;
    piece.lastMovedTurn = current.turnsStarted;
  }

  from.piece = null;
  to.piece = piece;
  piece.r = toR;
  piece.c = toC;
  addLog(`${current.label}の${piece.name}が${distance}マス移動。`);
  if (piece.trait === "raid") damageLeader(opponent(sideName), 1, piece.name);
  triggerTrap(sideName, piece, toR, toC);
  cleanup();
  checkWinner();
  return true;
}

function triggerTrap(enteringSide, piece, r, c) {
  const cell = side(enteringSide).board[r][c];
  const trap = cell.trap;
  if (!trap || trap.owner === enteringSide) return;
  cell.trap = null;
  addLog(`${piece.name}が${trap.name}を踏んだ。`);
  if (trap.id === "spikeTrap") damagePiece(enteringSide, piece, 2, trap.name);
  if (trap.id === "snareTrap") {
    damagePiece(enteringSide, piece, 1, trap.name);
    side(enteringSide).ap = Math.max(0, side(enteringSide).ap - 1);
    addLog(`${label(enteringSide)}のAPが1減少。`);
  }
}

function selectCard(index) {
  if (state.choice || state.active !== "player" || state.winner || state.animating) return;
  if (state.suppressClick) {
    state.suppressClick = false;
    return;
  }
  const card = state.player.hand[index];
  if (!card) return;
  if (card.kind === "boost" && card.target === "none") {
    if (playCard(index, "player", "player", 0, 0)) state.selected = null;
    render();
    return;
  }
  state.selected = { type: "card", index };
  render();
}

function clickCell(boardSide, r, c) {
  if (state.choice || state.active !== "player" || state.winner || state.animating) return;
  if (state.suppressClick) {
    state.suppressClick = false;
    return;
  }
  const selected = state.selected;
  if (selected?.type === "card") {
    if (playCard(selected.index, "player", boardSide, r, c)) {
      state.selected = null;
    } else {
      const piece = side(boardSide).board[r][c].piece;
      if (piece) state.selected = { type: "piece", side: boardSide, r, c, id: piece.id };
    }
    render();
    return;
  }

  if (selected?.type === "piece") {
    const piece = side(boardSide).board[r][c].piece;
    if (piece) {
      state.selected = { type: "piece", side: boardSide, r, c, id: piece.id };
    } else if ((selected.side || "player") === "player" && boardSide === "player" && movePiece("player", selected.r, selected.c, r, c)) {
      state.selected = null;
    }
    render();
    return;
  }

  const piece = side(boardSide).board[r][c].piece;
  if (piece) {
    state.selected = { type: "piece", side: boardSide, r, c, id: piece.id };
    render();
  }
}

async function endTurn() {
  if (state.choice || state.active !== "player" || state.winner || state.animating) return;
  addLog("あなたのターン終了。");
  state.animating = true;
  render();
  await startTurn("enemy");
  if (!state.winner && state.mode === "cpu") await enemyAction();
  if (!state.winner) await startTurn("player");
  state.animating = false;
  render();
}

async function enemyAction() {
  await resolveAutoAttacks("enemy");
  if (state.winner) return;
  let moved = moveEnemyUnit();
  let guard = 0;
  while (side("enemy").ap > 0 && guard++ < 10 && !state.winner) {
    const reserveMoveAp = !moved && enemyCanMove() && side("enemy").ap > 1 ? 1 : 0;
    const playable = side("enemy").hand
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => card.cost <= side("enemy").ap - reserveMoveAp && enemyTarget(card))
      .sort((a, b) => b.card.cost - a.card.cost)[0];
    if (!playable) {
      if (!moved) moved = moveEnemyUnit();
      break;
    }
    const target = enemyTarget(playable.card);
    if (!target || !playCard(playable.index, "enemy", target.side, target.r, target.c)) break;
  }

  if (!moved) moveEnemyUnit();
}

function enemyCanMove() {
  return pieces("enemy").some((piece) => piece.type === "unit" && adjacentEmpty("enemy", piece.r, piece.c).length);
}

function moveEnemyUnit() {
  if (side("enemy").ap <= 0) return false;
  const mover = pieces("enemy")
    .filter((piece) => piece.type === "unit")
    .sort((a, b) => b.r - a.r || boardOrder(a) - boardOrder(b))
    .find((piece) => adjacentEmpty("enemy", piece.r, piece.c).length);
  if (!mover) return false;
  const target = preferredEnemyMoveTarget(mover);
  return target ? movePiece("enemy", mover.r, mover.c, target.r, target.c) : false;
}

function preferredEnemyMoveTarget(piece) {
  const options = adjacentEmpty("enemy", piece.r, piece.c);
  return options.sort((a, b) => {
    const forward = b.r - a.r;
    if (forward) return forward;
    return Math.abs(a.c - 1) - Math.abs(b.c - 1);
  })[0] || null;
}

function enemyTarget(card) {
  if (card.kind === "boost" && card.target === "none") return { side: "enemy", r: 0, c: 0 };
  if (card.kind === "unit") {
    const cell = emptyCells("enemy")[0];
    return cell ? { side: "enemy", ...cell } : null;
  }
  if (card.kind === "trap") {
    const cell = emptyCells("player").filter(({ r, c }) => !state.player.board[r][c].trap)[0];
    return cell ? { side: "player", ...cell } : null;
  }
  if (card.kind === "boost") {
    const target = pieces("enemy").find((piece) => card.id !== "hasteSeal" || piece.type === "unit");
    return target ? { side: "enemy", r: target.r, c: target.c } : null;
  }
  return null;
}

function emptyCells(sideName) {
  const result = [];
  side(sideName).board.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!cell.piece) result.push({ r, c });
    });
  });
  return result;
}

function adjacentEmpty(sideName, r, c) {
  return [
    { r: r + 1, c },
    { r: r - 1, c },
    { r, c: c + 1 },
    { r, c: c - 1 }
  ].filter((pos) => inBounds(pos.r, pos.c) && !side(sideName).board[pos.r][pos.c].piece);
}

function inBounds(r, c) {
  return r >= 0 && r < BOARD && c >= 0 && c < BOARD;
}

function render() {
  fitStage();
  cleanup();
  checkWinner();
  renderHud();
  renderGrid("enemy", el.enemyGrid);
  renderGrid("player", el.playerGrid);
  renderHand();
  renderDetail();
  renderLog();
  renderBanner();
  renderChoiceModal();
  renderDragArrow();
}

function renderHud() {
  el.turnNumber.textContent = state.turn;
  el.apText.textContent = `${state.player.ap}/${state.player.maxAp}`;
  const blueCount = Math.min(10, state.player.ap);
  const orangeCount = Math.max(0, state.player.ap - 10);
  el.apPips.innerHTML = Array.from({ length: 10 }, (_, i) => {
    const active = i < blueCount;
    const over = i < orangeCount;
    return `<span class="pip${active ? "" : " empty"}${over ? " over" : ""}"></span>`;
  }).join("");
  el.endTurn.disabled = Boolean(state.choice) || state.active !== "player" || Boolean(state.winner) || state.animating;
  el.hint.textContent = hintText();
}

function renderGrid(sideName, root) {
  root.innerHTML = "";
  const warnings = attackWarningsFor(sideName);
  side(sideName).board.forEach((row, r) => {
    row.forEach((cell, c) => {
      const node = el.cellTemplate.content.firstElementChild.cloneNode(true);
      const warning = warnings.get(`${r}-${c}`);
      node.dataset.side = sideName;
      node.dataset.r = r;
      node.dataset.c = c;
      node.classList.toggle("has-trap", Boolean(cell.trap));
      node.classList.toggle("selected", selectedCell(sideName, r, c));
      node.classList.toggle("selectable", selectableCell(sideName, r, c));
      node.classList.toggle("targetable", targetableCell(sideName, r, c));
      node.classList.toggle("move-target", moveTargetCell(sideName, r, c));
      node.classList.toggle("card-drop-hover", cardDropHoverCell(sideName, r, c, true));
      node.classList.toggle("card-drop-invalid", cardDropHoverCell(sideName, r, c, false));
      node.classList.toggle("attack-soon", warning === 1);
      node.classList.toggle("attack-mid", warning === 2);
      node.classList.toggle("attack-late", warning === 3);
      if (cell.piece) renderPiece(cell.piece, node.querySelector(".piece"));
      node.addEventListener("pointerdown", (event) => startPieceDrag(event, sideName, r, c));
      node.addEventListener("click", () => clickCell(sideName, r, c));
      root.append(node);
    });
  });
}

function attackWarningsFor(targetSide) {
  const warnings = new Map();
  const attackerSide = opponent(targetSide);
  pieces(attackerSide)
    .filter((piece) => piece.type === "unit")
    .forEach((unit) => {
      attackCells(unit).forEach(({ r, c }) => {
        if (!inBounds(r, c)) return;
        const key = `${r}-${c}`;
        warnings.set(key, 1);
      });
    });
  return warnings;
}

function renderPiece(piece, root) {
  root.classList.add("active", piece.type);
  root.style.backgroundImage = `url("${piece.art}")`;
  if (piece.type === "leader") {
    root.innerHTML = `
      <span class="leader-crown" aria-label="大将">♛</span>
      <span class="leader-hp">${side(piece.side).hp}</span>
    `;
    return;
  }
  root.innerHTML = `
    <span class="piece-pattern">${patternMiniHtml(piece.pattern)}</span>
    <span class="piece-atk">${piece.atk}</span>
    <span class="piece-action" aria-label="attack"></span>
    <span class="piece-hp">${piece.hp}</span>
  `;
}

function patternMiniHtml(pattern) {
  const active = new Set(patternMiniCells(pattern).map(({ r, c }) => `${r}-${c}`));
  return Array.from({ length: 9 }, (_, i) => {
    const r = Math.floor(i / 3);
    const c = i % 3;
    return `<i class="${active.has(`${r}-${c}`) ? "on" : ""}"></i>`;
  }).join("");
}

function patternMiniCells(pattern) {
  if (pattern === "front") return [{ r: 0, c: 1 }];
  if (pattern === "column") return [0, 1, 2].map((r) => ({ r, c: 1 }));
  if (pattern === "frontRow") return [0, 1, 2].map((c) => ({ r: 0, c }));
  return [{ r: 1, c: 1 }];
}

function renderHand() {
  el.hand.innerHTML = "";
  state.player.hand.forEach((card, index) => {
    const node = makeCardNode(card);
    node.classList.toggle("selected", state.selected?.type === "card" && state.selected.index === index);
    const disabled = Boolean(state.choice) || card.cost > state.player.ap || state.active !== "player" || Boolean(state.winner) || state.animating;
    node.classList.toggle("disabled", disabled);
    node.classList.toggle("insufficient-cost", card.cost > state.player.ap && state.active === "player" && !state.winner && !state.animating);
    node.draggable = false;
    node.addEventListener("pointerdown", (event) => startHandCardDrag(event, index, node));
    node.addEventListener("click", () => selectCard(index));
    el.hand.append(node);
  });
}

function openDeckEditor({ returnToMode = false } = {}) {
  deckEditorReturnToMode = returnToMode;
  deckEditorIds = loadPlayerDeckIds();
  deckEditorLeaderTraitId = loadLeaderTraitId();
  deckEditorFocusId = deckEditorFocusId && CARDS[deckEditorFocusId] ? deckEditorFocusId : Object.keys(CARDS)[0];
  hideModeSelect();
  el.deckEditor.classList.add("open");
  el.deckEditor.setAttribute("aria-hidden", "false");
  el.deckCloseButton.textContent = returnToMode ? "戻る" : "対戦へ";
  if (EMBEDDED_MODE && ENTRY_MODE === "deck") el.deckCloseButton.textContent = "保存";
  renderDeckEditor();
}

function closeDeckEditor({ restart = true } = {}) {
  deckEditorIds = saveDeckIds(deckEditorIds);
  deckEditorLeaderTraitId = saveLeaderTraitId(deckEditorLeaderTraitId);
  if (EMBEDDED_MODE && ENTRY_MODE === "deck") {
    renderDeckEditor();
    el.deckEditorStatus.textContent = `${deckEditorIds.length} / ${DECK_TARGET_SIZE} saved`;
    return;
  }
  el.deckEditor.classList.remove("open");
  el.deckEditor.setAttribute("aria-hidden", "true");
  if (location.hash === "#deck") history.replaceState(null, "", location.pathname + location.search);
  if (deckEditorReturnToMode) {
    deckEditorReturnToMode = false;
    createGame(currentMode);
    showModeSelect();
    return;
  }
  if (restart) createGame();
}

function resetDeckEditor() {
  deckEditorIds = [...DECK];
  deckEditorLeaderTraitId = "bulwark";
  saveDeckIds(deckEditorIds);
  saveLeaderTraitId(deckEditorLeaderTraitId);
  renderDeckEditor();
}

function addDeckCard(id) {
  deckEditorFocusId = id;
  const counts = deckCounts();
  if (deckEditorIds.length >= DECK_TARGET_SIZE) return;
  if (!CARDS[id] || (counts[id] || 0) >= MAX_CARD_COPIES) return;
  deckEditorIds.push(id);
  saveDeckIds(deckEditorIds);
  renderDeckEditor();
}

function removeDeckCard(id) {
  deckEditorFocusId = id;
  const index = deckEditorIds.indexOf(id);
  if (index < 0) return;
  deckEditorIds.splice(index, 1);
  saveDeckIds(deckEditorIds);
  renderDeckEditor();
}

function renderDeckEditor() {
  const counts = deckCounts();
  const total = deckEditorIds.length;
  el.deckEditorStatus.textContent = `${total}枚 / ${DECK_TARGET_SIZE}枚`;
  el.deckEditorStatus.classList.toggle("warn", total !== DECK_TARGET_SIZE);
  renderLeaderTraitPicker();
  el.deckCardGrid.innerHTML = "";
  Object.values(CARDS)
    .sort((a, b) => a.cost - b.cost || rarityRank(b.rarity) - rarityRank(a.rarity))
    .forEach((card) => {
      const count = counts[card.id] || 0;
      const item = document.createElement("div");
      item.className = "deck-pool-card";
      item.classList.toggle("focused", deckEditorFocusId === card.id);
      item.classList.toggle("disabled", count >= MAX_CARD_COPIES || total >= DECK_TARGET_SIZE);
      item.append(makeCardNode(card));
      item.insertAdjacentHTML("beforeend", `<span class="deck-count">${count}/${MAX_CARD_COPIES}</span>`);
      const addButton = document.createElement("button");
      addButton.className = "deck-card-add";
      addButton.type = "button";
      addButton.textContent = "+";
      addButton.disabled = count >= MAX_CARD_COPIES || total >= DECK_TARGET_SIZE;
      addButton.addEventListener("click", (event) => {
        event.stopPropagation();
        addDeckCard(card.id);
      });
      item.append(addButton);
      item.addEventListener("click", () => {
        deckEditorFocusId = card.id;
        renderDeckEditor();
      });
      el.deckCardGrid.append(item);
    });

  el.deckList.innerHTML = "";
  Object.values(CARDS)
    .filter((card) => counts[card.id])
    .sort((a, b) => a.cost - b.cost || rarityRank(b.rarity) - rarityRank(a.rarity))
    .forEach((card) => {
      const row = document.createElement("div");
      row.className = "deck-list-row";
      row.classList.toggle("focused", deckEditorFocusId === card.id);
      row.innerHTML = `
        <span class="deck-list-art" style="background-image: url('${card.art}')"></span>
        <span class="deck-list-copy">
          <strong>${escapeHtml(card.name)}</strong>
          <small>${kindLabel(card.kind)} / cost ${card.cost}</small>
        </span>
        <b>x${counts[card.id]}</b>
        <button class="deck-card-remove" type="button">-</button>
      `;
      row.querySelector(".deck-card-remove").addEventListener("click", (event) => {
        event.stopPropagation();
        removeDeckCard(card.id);
      });
      row.addEventListener("click", () => {
        deckEditorFocusId = card.id;
        renderDeckEditor();
      });
      el.deckList.append(row);
    });
  renderDeckEditorFocus();
}

function renderLeaderTraitPicker() {
  el.leaderTraitPicker.innerHTML = `
    <div class="leader-trait-head">
      <strong>大将特性</strong>
      <span>${escapeHtml(LEADER_TRAITS[deckEditorLeaderTraitId].name)}</span>
    </div>
    <div class="leader-trait-options"></div>
    <p>${escapeHtml(LEADER_TRAITS[deckEditorLeaderTraitId].text)}</p>
  `;
  const options = el.leaderTraitPicker.querySelector(".leader-trait-options");
  Object.values(LEADER_TRAITS).forEach((trait) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "leader-trait-option";
    button.classList.toggle("selected", deckEditorLeaderTraitId === trait.id);
    button.innerHTML = `
      <strong>${escapeHtml(trait.name)}</strong>
      <small>${escapeHtml(trait.text)}</small>
    `;
    button.addEventListener("click", () => {
      deckEditorLeaderTraitId = saveLeaderTraitId(trait.id);
      renderDeckEditor();
    });
    options.append(button);
  });
}

function rarityRank(rarity) {
  return { bronze: 0, ornate: 1, silver: 2, rainbow: 3 }[rarity] || 0;
}

function renderDeckEditorFocus() {
  const card = CARDS[deckEditorFocusId] || Object.values(CARDS)[0];
  if (!card) return;
  deckEditorFocusId = card.id;
  el.deckFocusCard.innerHTML = "";
  const node = makeCardNode(card);
  node.addEventListener("click", () => showCardZoom(card, { className: "manual-zoom", closeOnClick: true }));
  el.deckFocusCard.append(node);
  el.deckFocusCopy.innerHTML = `
    <strong>${escapeHtml(card.name)}</strong>
    <span>${escapeHtml(kindLabel(card.kind))} / cost ${card.cost}</span>
    <small>${renderEffectText(card.text)}</small>
  `;
}

function makeCardNode(card) {
  const node = el.cardTemplate.content.firstElementChild.cloneNode(true);
  const rarity = card.rarity || "bronze";
  node.classList.add(`${card.kind}-card`);
  node.classList.add(`rarity-${rarity}`);
  node.dataset.rarity = rarity;
  node.style.setProperty("--card-frame", `url("${CARD_FRAMES[rarity] || CARD_FRAMES.bronze}")`);
  if (card.kind === "unit") node.classList.add("unit-card");
  node.querySelector(".card-art").style.backgroundImage = `url("${card.art}")`;
  node.querySelector(".card-name").textContent = card.name;
  node.querySelector(".badge-cost").textContent = card.cost;
  node.querySelector(".badge-atk").textContent = card.kind === "unit" ? card.atk : "";
  node.querySelector(".badge-action").classList.add(`badge-action-${card.kind}`);
  node.querySelector(".badge-action").setAttribute("aria-label", kindLabel(card.kind));
  node.querySelector(".badge-hp").textContent = card.kind === "unit" ? card.hp : "";
  return node;
}

function renderDetail() {
  const focus = currentFocus();
  el.detailCard.innerHTML = "";
  el.detailCopy.innerHTML = "";
  if (!focus) {
    el.detailCard.append(makeCardNode(CARDS.flameVanguard));
    el.detailCopy.innerHTML = `
      <strong>カードを選択</strong>
      <span class="kind">カード / ユニット詳細</span>
      <small>手札または自分フィールドのユニットを選ぶと、ここに効果が表示されます。</small>
    `;
    return;
  }
  if (focus.type === "card") {
    el.detailCard.append(makeCardNode(focus.card));
    el.detailCopy.innerHTML = `
      <strong>${escapeHtml(focus.card.name)}</strong>
      <span class="kind">${escapeHtml(kindLabel(focus.card.kind))} / コスト ${focus.card.cost}</span>
      <small>${renderEffectText(focus.card.text)}</small>
    `;
    return;
  }
  const piece = focus.piece;
  const trait = piece.type === "leader" ? leaderTrait(piece.side) : null;
  const pseudoCard = piece.type === "leader"
    ? { name: piece.label, kind: "unit", cost: 0, atk: "", hp: side(piece.side).hp, rarity: "bronze", art: piece.art }
    : { name: piece.name, kind: "unit", cost: piece.cost, atk: piece.atk, hp: piece.hp, rarity: piece.rarity, art: piece.art };
  el.detailCard.append(makeCardNode(pseudoCard));
  el.detailCopy.innerHTML = `
    <strong>${escapeHtml(piece.type === "leader" ? piece.label : piece.name)}</strong>
    <span class="kind">${piece.type === "leader" ? `大将 / ${escapeHtml(trait.name)}` : `ユニット / ${patternLabel(piece.pattern)}`}</span>
    <small>${piece.type === "leader" ? escapeHtml(`大将は1ターンに${trait.leaderMoves}回だけ無料で移動できます。${trait.text} 前方に守護者がいる時、受けるダメージを軽減します。`) : renderEffectText(piece.text)}</small>
  `;
  if (canShowAttackButton(piece)) {
    const button = document.createElement("button");
    button.className = "detail-attack-button";
    button.type = "button";
    button.textContent = "攻撃";
    button.addEventListener("click", attackSelectedUnit);
    el.detailCopy.append(button);
  }
}

function canShowAttackButton(piece) {
  return state.active === "player"
    && !state.animating
    && !state.winner
    && piece?.type === "unit"
    && piece.side === "player"
    && canUnitAttack(piece);
}

async function attackSelectedUnit() {
  const focus = currentFocus();
  if (!focus || focus.type !== "piece" || !canShowAttackButton(focus.piece)) return;
  state.animating = true;
  render();
  const live = findPiece("player", focus.piece.id);
  if (live?.piece && canUnitAttack(live.piece)) {
    await fireUnit(live.piece);
    cleanup();
    checkWinner();
  }
  state.animating = false;
  render();
}

function currentFocus() {
  const selected = state.selected;
  if (selected?.type === "card") {
    const card = state.player.hand[selected.index];
    return card ? { type: "card", card } : null;
  }
  if (selected?.type === "piece") {
    const boardSide = selected.side || "player";
    const piece = side(boardSide).board[selected.r]?.[selected.c]?.piece;
    return piece ? { type: "piece", piece } : null;
  }
  return null;
}

function renderLog() {
  el.logPanel.classList.toggle("open", state.logOpen);
  el.log.innerHTML = state.log.map((line) => `<div>◇ ${escapeHtml(line)}</div>`).join("");
}

function renderBanner() {
  document.querySelector(".banner")?.remove();
  if (!state.winner) return;
  const banner = document.createElement("section");
  banner.className = "banner";
  banner.innerHTML = `
    <div class="banner-card">
      <h2>${escapeHtml(state.winner)}</h2>
      <p>プロトタイプ終了。リロードすると再戦できます。</p>
    </div>
  `;
  el.stage.append(banner);
}

function renderChoiceModal() {
  document.querySelector(".choice-layer")?.remove();
  if (!state.choice) return;
  const choice = state.choice;
  if (choice.type !== "returnDraw") return;
  const owner = side(choice.sideName);
  const layer = document.createElement("section");
  layer.className = "choice-layer";
  layer.innerHTML = `
    <div class="choice-dialog" role="dialog" aria-modal="true" aria-labelledby="choiceTitle">
      <div class="choice-copy">
        <strong id="choiceTitle">${escapeHtml(choice.sourceName)}</strong>
        <p>デッキに戻す手札を1枚選んでください。</p>
      </div>
      <div class="choice-card-grid"></div>
    </div>
  `;
  const grid = layer.querySelector(".choice-card-grid");
  owner.hand.forEach((card, index) => {
    const button = document.createElement("div");
    button.className = "choice-card";
    button.tabIndex = 0;
    button.setAttribute("role", "button");
    button.setAttribute("aria-label", `${card.name}をデッキに戻す`);
    const cardNode = makeCardNode(card);
    cardNode.tabIndex = -1;
    cardNode.setAttribute("aria-hidden", "true");
    button.append(cardNode);
    const name = document.createElement("span");
    name.textContent = card.name;
    button.append(name);
    button.addEventListener("click", () => completeReturnDrawChoice(choice.sideName, index, choice.sourceName));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      completeReturnDrawChoice(choice.sideName, index, choice.sourceName);
    });
    grid.append(button);
  });
  el.stage.append(layer);
}

function openFocusCardZoom() {
  if (state.animating) return;
  const focus = currentFocus();
  if (!focus) return;
  const card = focus.type === "card" ? focus.card : cardFromPiece(focus.piece);
  showCardZoom(card, { className: "manual-zoom", closeOnClick: true });
}

function showCardZoom(card, { className = "", closeOnClick = false } = {}) {
  document.querySelector(".card-zoom-layer")?.remove();
  const layer = document.createElement("section");
  layer.className = `card-zoom-layer ${className}`.trim();
  const wrap = document.createElement("div");
  wrap.className = "card-zoom-wrap";
  wrap.append(makeCardNode(card));
  layer.append(wrap);
  if (closeOnClick) layer.addEventListener("click", () => layer.remove());
  el.stage.append(layer);
  return layer;
}

async function showAttackFocus(unit) {
  const layer = showCardZoom(cardFromPiece(unit), { className: "attack-zoom" });
  await sleep(760);
  layer?.classList.add("closing");
  await sleep(130);
  layer?.remove();
}

function cardFromPiece(piece) {
  if (piece.type === "leader") {
    return { name: piece.label, kind: "unit", cost: 0, atk: "", hp: side(piece.side).hp, rarity: "bronze", art: piece.art };
  }
  return {
    name: piece.name,
    kind: "unit",
    cost: piece.cost,
    atk: piece.atk,
    hp: piece.hp,
    rarity: piece.rarity || "bronze",
    art: piece.art
  };
}

function showDamagePopup(sideName, r, c, amount) {
  if (amount <= 0) return;
  const point = cellCenter(sideName, r, c);
  const field = document.querySelector(".battlefield");
  if (!point || !field) return;
  const pop = document.createElement("span");
  pop.className = "damage-popup";
  pop.textContent = `-${amount}`;
  pop.style.left = `${point.x}px`;
  pop.style.top = `${point.y}px`;
  field.append(pop);
  setTimeout(() => pop.remove(), 780);
}

function hintText() {
  const selected = state.selected;
  if (state.winner) return `${state.winner}。リロードで再戦できます。`;
  if (state.choice) return "召喚効果でデッキに戻す手札を選んでください。";
  if (!selected) return "カードを選ぶ、または自分の大将・ユニットを選んで移動できます。";
  if (selected.type === "piece") return "空きマスを選ぶと移動します。ユニットは距離ぶんAP消費、大将は1回無料です。";
  const card = state.player.hand[selected.index];
  if (!card) return "";
  if (card.kind === "unit") return "自分フィールドの空きマスを選んで召喚します。";
  if (card.kind === "trap") return "相手フィールドの空きマスを選んで罠を設置します。";
  return "自分フィールドの対象を選んで強化します。";
}

function selectedCell(sideName, r, c) {
  const selected = state.selected;
  return selected?.type === "piece" && (selected.side || "player") === sideName && selected.r === r && selected.c === c;
}

function selectableCell(sideName, r, c) {
  return !state.choice && !state.animating && state.active === "player" && sideName === "player" && Boolean(sideName && side(sideName).board[r][c].piece);
}

function targetableCell(sideName, r, c) {
  const selected = state.selected;
  if (state.choice || state.animating || state.active !== "player" || selected?.type !== "card") return false;
  const card = state.player.hand[selected.index];
  return cardCanPlayAt(card, sideName, r, c);
}

function cardCanPlayAt(card, boardSide, r, c) {
  if (!card || card.cost > state.player.ap || !inBounds(r, c)) return false;
  if (card.kind === "boost" && card.target === "none") return false;
  const cell = side(boardSide).board[r][c];
  if (card.kind === "unit") return boardSide === "player" && !cell.piece;
  if (card.kind === "trap") return boardSide === "enemy" && !cell.piece && !cell.trap;
  if (card.kind === "boost") return boardSide === "player" && Boolean(cell.piece) && (card.id !== "hasteSeal" || cell.piece.type === "unit");
  return false;
}

function cardDropHoverCell(sideName, r, c, valid) {
  const drag = state.cardDrag;
  if (!drag?.active || drag.targetSide !== sideName || drag.targetR !== r || drag.targetC !== c) return false;
  return valid ? drag.valid : !drag.valid;
}

function moveTargetCell(sideName, r, c) {
  const selected = state.selected;
  if (state.choice || state.animating || state.active !== "player" || selected?.type !== "piece" || (selected.side || "player") !== "player" || sideName !== "player") return false;
  const cell = side(sideName).board[r][c];
  if (cell.piece) return false;
  const piece = state.player.board[selected.r][selected.c].piece;
  if (!piece) return false;
  const distance = Math.abs(selected.r - r) + Math.abs(selected.c - c);
  if (distance < 1) return false;
  return piece.type === "leader" ? state.player.leaderMove > 0 : state.player.ap >= distance;
}

function startHandCardDrag(event, index, node) {
  if (event.button !== 0 || state.choice || state.active !== "player" || state.winner || state.animating) return;
  const card = state.player.hand[index];
  if (!card || card.cost > state.player.ap) return;
  if (card.kind === "boost" && card.target === "none") return;
  clearTimeout(dragHoldTimer);
  const ghost = node.cloneNode(true);
  ghost.classList.add("hand-card-ghost");
  ghost.style.left = `${event.clientX}px`;
  ghost.style.top = `${event.clientY}px`;
  document.body.append(ghost);
  state.cardDrag = {
    index,
    startX: event.clientX,
    startY: event.clientY,
    pointerX: event.clientX,
    pointerY: event.clientY,
    active: false,
    valid: false,
    targetSide: null,
    targetR: null,
    targetC: null,
    ghost
  };
}

function updateHandCardDrag(event) {
  const drag = state.cardDrag;
  if (!drag) return;
  drag.pointerX = event.clientX;
  drag.pointerY = event.clientY;
  const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
  if (!drag.active && distance < 8) {
    updateCardDragGhost(drag);
    return;
  }

  const card = state.player.hand[drag.index];
  if (!card) {
    cleanupHandCardDrag();
    return;
  }

  drag.active = true;
  state.selected = { type: "card", index: drag.index };
  state.suppressClick = true;

  const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest(".cell");
  if (cell) {
    drag.targetSide = cell.dataset.side;
    drag.targetR = Number(cell.dataset.r);
    drag.targetC = Number(cell.dataset.c);
    drag.valid = cardCanPlayAt(card, drag.targetSide, drag.targetR, drag.targetC);
  } else {
    drag.targetSide = null;
    drag.targetR = null;
    drag.targetC = null;
    drag.valid = false;
  }

  updateCardDragGhost(drag);
  render();
}

function finishHandCardDrag() {
  const drag = state.cardDrag;
  if (!drag) return;
  const wasActive = drag.active;
  if (!wasActive) {
    cleanupHandCardDrag();
    return;
  }
  const card = state.player.hand[drag.index];
  const shouldPlay = wasActive && drag.valid && cardCanPlayAt(card, drag.targetSide, drag.targetR, drag.targetC);
  cleanupHandCardDrag(false);
  if (shouldPlay) {
    if (playCard(drag.index, "player", drag.targetSide, drag.targetR, drag.targetC)) state.selected = null;
  }
  render();
  if (wasActive) setTimeout(() => {
    state.suppressClick = false;
  }, 0);
}

function updateCardDragGhost(drag) {
  if (!drag.ghost) return;
  drag.ghost.classList.toggle("active", drag.active);
  drag.ghost.classList.toggle("valid", drag.valid);
  drag.ghost.classList.toggle("invalid", drag.active && !drag.valid);
  drag.ghost.style.left = `${drag.pointerX}px`;
  drag.ghost.style.top = `${drag.pointerY}px`;
}

function cleanupHandCardDrag(resetSuppress = true) {
  state.cardDrag?.ghost?.remove();
  state.cardDrag = null;
  if (resetSuppress) state.suppressClick = false;
}

function startPieceDrag(event, sideName, r, c) {
  if (event.button !== 0 || state.choice || state.active !== "player" || state.winner || state.animating || sideName !== "player") return;
  const piece = side("player").board[r][c].piece;
  if (!piece) return;
  event.preventDefault();
  state.selected = null;
  clearTimeout(dragHoldTimer);
  state.drag = { fromR: r, fromC: c, targetR: r, targetC: c, route: [], valid: false, armed: false };
  dragHoldTimer = setTimeout(() => {
    if (!state?.drag) return;
    state.drag.armed = true;
  }, 180);
  state.suppressClick = false;
}

function updatePieceDrag(event) {
  if (!state?.drag || state.drag.animating) return;
  const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest(".cell");
  if (!cell || cell.dataset.side !== "player") {
    state.drag.targetR = null;
    state.drag.targetC = null;
    state.drag.valid = false;
    state.drag.pointerX = event.clientX;
    state.drag.pointerY = event.clientY;
    render();
    return;
  }
  const targetR = Number(cell.dataset.r);
  const targetC = Number(cell.dataset.c);
  if (!state.drag.armed && (targetR !== state.drag.fromR || targetC !== state.drag.fromC)) return;
  const route = appendDraggedCell(state.drag.fromR, state.drag.fromC, state.drag.route, targetR, targetC);
  state.drag.targetR = targetR;
  state.drag.targetC = targetC;
  state.drag.route = route;
  state.drag.valid = route.length > 0 && routeIsMovable(state.drag.fromR, state.drag.fromC, route);
  state.drag.pointerX = event.clientX;
  state.drag.pointerY = event.clientY;
  state.suppressClick = true;
  render();
}

async function finishPieceDrag() {
  if (!state?.drag || state.drag.animating) return;
  clearTimeout(dragHoldTimer);
  const drag = state.drag;
  if (drag.valid) {
    state.drag.animating = true;
    render();
    await movePieceByRoute("player", drag.fromR, drag.fromC, [...drag.route]);
  } else if (!drag.route.length) {
    const piece = state.player.board[drag.fromR][drag.fromC].piece;
    if (piece) state.selected = { type: "piece", side: "player", r: drag.fromR, c: drag.fromC, id: piece.id };
  }
  state.drag = null;
  render();
}

function appendDraggedCell(fromR, fromC, route, targetR, targetC) {
  if (!inBounds(targetR, targetC)) return route;
  if (targetR === fromR && targetC === fromC) return [];

  const existingIndex = route.findIndex((pos) => pos.r === targetR && pos.c === targetC);
  if (existingIndex >= 0) return route.slice(0, existingIndex + 1);

  const current = route.length ? route[route.length - 1] : { r: fromR, c: fromC };
  const adjacent = Math.abs(current.r - targetR) + Math.abs(current.c - targetC) === 1;
  if (!adjacent) return route;
  return [...route, { r: targetR, c: targetC }];
}

function routeIsMovable(fromR, fromC, route) {
  const piece = side("player").board[fromR][fromC].piece;
  if (!piece || !route.length) return false;
  if (route.some(({ r, c }) => side("player").board[r][c].piece)) return false;
  if (piece.type === "leader") return state.player.leaderMove > 0;
  return state.player.ap >= route.length;
}

async function movePieceByRoute(sideName, fromR, fromC, route) {
  const current = side(sideName);
  const piece = current.board[fromR][fromC].piece;
  if (!piece || !routeIsMovable(fromR, fromC, route)) return false;

  if (piece.type === "leader") {
    current.leaderMove -= 1;
  } else {
    current.ap -= route.length;
    piece.moved = true;
    piece.lastMovedTurn = current.turnsStarted;
  }

  let prev = { r: fromR, c: fromC };
  for (const next of route) {
    current.board[prev.r][prev.c].piece = null;
    current.board[next.r][next.c].piece = piece;
    piece.r = next.r;
    piece.c = next.c;
    prev = next;
    render();
    await sleep(130);
  }

  addLog(`${current.label}の${piece.name}が${route.length}マス移動。`);
  if (piece.trait === "raid") damageLeader(opponent(sideName), 1, piece.name);
  triggerTrap(sideName, piece, piece.r, piece.c);
  cleanup();
  checkWinner();
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderDragArrow() {
  if (!el.dragArrowLayer || !el.dragArrowLine) return;
  if (!state?.drag) {
    el.dragArrowLine.setAttribute("points", "");
    el.dragArrowLayer.classList.remove("invalid");
    return;
  }

  if (!state.drag.armed || !state.drag.route.length) {
    el.dragArrowLine.setAttribute("points", "");
    el.dragArrowLayer.classList.remove("invalid");
    return;
  }

  const points = [];
  const origin = cellCenter("player", state.drag.fromR, state.drag.fromC);
  if (origin) points.push(origin);

  state.drag.route.forEach(({ r, c }) => {
    const point = cellCenter("player", r, c);
    if (point) points.push(point);
  });

  el.dragArrowLine.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
  el.dragArrowLayer.classList.toggle("invalid", !state.drag.valid);
}

function cellCenter(sideName, r, c) {
  const cell = document.querySelector(`.cell[data-side="${sideName}"][data-r="${r}"][data-c="${c}"]`);
  const field = document.querySelector(".battlefield");
  if (!cell || !field) return null;
  const cellRect = cell.getBoundingClientRect();
  const fieldRect = field.getBoundingClientRect();
  const scaleX = fieldRect.width / field.offsetWidth || 1;
  const scaleY = fieldRect.height / field.offsetHeight || 1;
  return {
    x: (cellRect.left + cellRect.width / 2 - fieldRect.left) / scaleX,
    y: (cellRect.top + cellRect.height / 2 - fieldRect.top) / scaleY
  };
}

function kindShort(kind) {
  return { unit: "待", trap: "罠", boost: "強" }[kind] || "";
}

function kindLabel(kind) {
  return { unit: "ユニット", trap: "罠", boost: "強化" }[kind] || kind;
}

function renderEffectText(value) {
  const text = String(value || "");
  const pattern = /\[([^\]\n]{1,16})\]/g;
  let html = "";
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const keyword = match[1];
    const start = match.index || 0;
    html += escapeHtml(text.slice(lastIndex, start));
    html += `[<button class="effect-keyword" type="button" data-keyword="${escapeHtml(keyword)}">${escapeHtml(keyword)}</button>]`;
    lastIndex = start + match[0].length;
  }
  html += escapeHtml(text.slice(lastIndex));
  return html;
}

function showKeywordHelp(keyword) {
  const title = keyword || "";
  const text = EFFECT_KEYWORD_HELP[title] || "このキーワードの説明は準備中です。";
  closeKeywordHelp();
  const layer = document.createElement("section");
  layer.className = "keyword-help-layer";
  layer.innerHTML = `
    <div class="keyword-help-dialog" role="dialog" aria-modal="true" aria-labelledby="keywordHelpTitle">
      <strong id="keywordHelpTitle">${escapeHtml(title)}</strong>
      <p>${escapeHtml(text)}</p>
      <button class="keyword-help-close" type="button">閉じる</button>
    </div>
  `;
  layer.addEventListener("click", (event) => {
    if (event.target === layer) closeKeywordHelp();
  });
  layer.querySelector(".keyword-help-close").addEventListener("click", closeKeywordHelp);
  el.stage.append(layer);
  layer.querySelector(".keyword-help-close").focus({ preventScroll: true });
}

function closeKeywordHelp() {
  document.querySelector(".keyword-help-layer")?.remove();
}

function handleEffectTagClick(event) {
  const tag = event.target.closest(".effect-keyword");
  if (!tag) return;
  event.preventDefault();
  event.stopPropagation();
  showKeywordHelp(tag.dataset.keyword || tag.textContent.replace(/[[\]]/g, ""));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function fitStage() {
  const w = 1280;
  const h = 720;
  const scale = Math.min(window.innerWidth / w, window.innerHeight / h);
  document.documentElement.style.setProperty("--stage-w", `${w}px`);
  document.documentElement.style.setProperty("--stage-h", `${h}px`);
  document.documentElement.style.setProperty("--scale", `${scale}`);
}

function showModeSelect() {
  el.modeNotice.textContent = "";
  el.modeSelect.classList.add("open");
  el.modeSelect.setAttribute("aria-hidden", "false");
}

function hideModeSelect() {
  el.modeSelect.classList.remove("open");
  el.modeSelect.setAttribute("aria-hidden", "true");
}

function startCpuMode() {
  hideModeSelect();
  createGame("cpu");
}

function showOnlineNotice() {
  el.modeNotice.textContent = "オンライン対戦は準備中です。今はCPU対戦を遊べます。";
}

function setGridSettingsOpen(open) {
  if (!el.gridSettingsButton || !el.gridSettingsMenu) return;
  el.gridSettingsButton.setAttribute("aria-expanded", String(Boolean(open)));
  el.gridSettingsMenu.hidden = !open;
}

function retireBattle() {
  setGridSettingsOpen(false);
  if (!state || state.winner) return;
  state.selected = null;
  state.drag = null;
  cleanupHandCardDrag();
  state.animating = false;
  state.winner = "敗北";
  addLog("リタイアしました。");
  render();
}

function navigateHost(view) {
  if (EMBEDDED_MODE && window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "chrono-grid:navigate", view }, location.origin);
    return;
  }
  if (view === "home") location.href = "../";
}

function returnFromDeckEditor() {
  deckEditorIds = saveDeckIds(deckEditorIds);
  deckEditorLeaderTraitId = saveLeaderTraitId(deckEditorLeaderTraitId);
  if (EMBEDDED_MODE) {
    navigateHost("home");
    return;
  }
  closeDeckEditor();
}

el.endTurn.addEventListener("click", endTurn);
el.cpuModeButton.addEventListener("click", startCpuMode);
el.onlineModeButton.addEventListener("click", showOnlineNotice);
el.deckModeButton.addEventListener("click", () => openDeckEditor({ returnToMode: true }));
el.deckEditButton.addEventListener("click", openDeckEditor);
el.deckBackButton?.addEventListener("click", returnFromDeckEditor);
el.deckCloseButton.addEventListener("click", () => closeDeckEditor());
el.deckResetButton.addEventListener("click", resetDeckEditor);
el.gridSettingsButton?.addEventListener("click", () => {
  setGridSettingsOpen(el.gridSettingsMenu?.hidden);
});
el.settingsCloseButton?.addEventListener("click", () => setGridSettingsOpen(false));
el.retireButton?.addEventListener("click", retireBattle);
el.detailCard.addEventListener("click", openFocusCardZoom);
el.detailCopy.addEventListener("click", handleEffectTagClick);
el.deckFocusCopy.addEventListener("click", handleEffectTagClick);
el.logButton.addEventListener("click", () => {
  state.logOpen = !state.logOpen;
  renderLog();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setGridSettingsOpen(false);
  if (event.key === "Escape") closeKeywordHelp();
  if (event.key === "Escape") document.querySelector(".card-zoom-layer")?.remove();
});
document.addEventListener("pointermove", updatePieceDrag);
document.addEventListener("pointermove", updateHandCardDrag);
document.addEventListener("pointerup", finishPieceDrag);
document.addEventListener("pointerup", finishHandCardDrag);
document.addEventListener("pointercancel", finishPieceDrag);
document.addEventListener("pointercancel", () => cleanupHandCardDrag());
window.addEventListener("resize", () => {
  fitStage();
  render();
});

createGame("cpu");
if (EMBEDDED_MODE) {
  hideModeSelect();
  if (ENTRY_MODE === "deck") openDeckEditor();
} else if (location.hash !== "#deck") {
  showModeSelect();
}
