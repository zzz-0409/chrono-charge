const http = require("http");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8787);
const MAX_LP = 8000;
const UNIT_ZONES = 5;
const CORE_ZONES = 2;
const REACTION_ZONES = 3;

const chrono = loadChronoData();
const cards = chrono.cards;
const DECK_SIZE = chrono.DECK_SIZE || 40;
const ENVIRONMENT_DECK_PER_LEVEL = chrono.ENVIRONMENT_DECK_PER_LEVEL || 3;
const ENVIRONMENT_MAX_LEVEL = chrono.ENVIRONMENT_MAX_LEVEL || 3;
const starterEnvironmentDeck = chrono.starterEnvironmentDeck || {};

const rooms = new Map();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/health") {
      sendJson(res, 200, { ok: true, rooms: rooms.size });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "server error" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Chrono Charge server: http://localhost:${PORT}`);
});

function loadChronoData() {
  const context = { window: { Chrono: {} } };
  const code = fs.readFileSync(path.join(ROOT, "src", "data", "cards.js"), "utf8");
  vm.runInNewContext(code, context, { filename: "cards.js" });
  return context.window.Chrono;
}

async function handleApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/rooms") {
    const body = await readJson(req);
    const deck = validateDeck(body.deck);
    const environmentDeck = validateEnvironmentDeck(body.environmentDeck);
    const room = createRoom(deck, environmentDeck);
    sendJson(res, 200, {
      roomId: room.id,
      playerId: room.players.host.id,
      seat: "host",
    });
    return;
  }

  const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})(?:\/(join|state|action))?$/);
  if (!match) {
    sendJson(res, 404, { error: "not found" });
    return;
  }

  const room = rooms.get(match[1]);
  if (!room) {
    sendJson(res, 404, { error: "room not found" });
    return;
  }

  const route = match[2];
  if (req.method === "POST" && route === "join") {
    const body = await readJson(req);
    if (room.players.guest) {
      sendJson(res, 409, { error: "room is full" });
      return;
    }
    room.players.guest = {
      id: makeId(12),
      deck: validateDeck(body.deck),
      environmentDeck: validateEnvironmentDeck(body.environmentDeck),
    };
    startRoomGame(room);
    sendJson(res, 200, {
      roomId: room.id,
      playerId: room.players.guest.id,
      seat: "guest",
    });
    return;
  }

  if (req.method === "GET" && route === "state") {
    const playerId = url.searchParams.get("playerId");
    const seat = getSeat(room, playerId);
    if (!seat) {
      sendJson(res, 403, { error: "invalid player" });
      return;
    }
    sendJson(res, 200, roomSnapshot(room, seat));
    return;
  }

  if (req.method === "POST" && route === "action") {
    const body = await readJson(req);
    const seat = getSeat(room, body.playerId);
    if (!seat) {
      sendJson(res, 403, { error: "invalid player" });
      return;
    }
    applyAction(room, seat, body.action || {});
    sendJson(res, 200, roomSnapshot(room, seat));
    return;
  }

  sendJson(res, 404, { error: "not found" });
}

function createRoom(deck, environmentDeck) {
  let id = "";
  do {
    id = makeId(5);
  } while (rooms.has(id));
  const room = {
    id,
    status: "waiting",
    version: 1,
    players: {
      host: { id: makeId(12), deck, environmentDeck },
      guest: null,
    },
    game: null,
    logItems: [`ルーム ${id} を作成しました。友達にIDを伝えてください。`],
  };
  rooms.set(id, room);
  return room;
}

function startRoomGame(room) {
  const firstActive = Math.random() < 0.5 ? "host" : "guest";
  room.game = {
    turn: 1,
    active: firstActive,
    firstActive,
    openingTurn: true,
    completedTurns: 0,
    environmentCycle: 0,
    naturalEnvironmentLevel: 1,
    currentEnvironment: null,
    hostEnvironmentDeck: room.players.host.environmentDeck.slice(),
    guestEnvironmentDeck: room.players.guest.environmentDeck.slice(),
    finished: false,
    winner: null,
    pendingChoice: null,
    host: newDuelist("Host", room.players.host.deck),
    guest: newDuelist("Guest", room.players.guest.deck),
    logItems: [
      `ルーム ${room.id}: オンラインデュエル開始。`,
      `先攻は${firstActive === "host" ? "ホスト" : "ゲスト"}です。`,
    ],
  };
  drawCards(room.game.host, 5, room.game);
  drawCards(room.game.guest, 5, room.game);
  refreshTurn(room.game[firstActive]);
  changeEnvironment(room.game, room.game.naturalEnvironmentLevel);
  room.status = "playing";
  room.version += 1;
}

function newDuelist(name, deck) {
  return {
    name,
    lp: MAX_LP,
    deck: shuffle(deck.slice()),
    hand: [],
    grave: [],
    charge: [],
    units: Array(UNIT_ZONES).fill(null),
    cores: Array(CORE_ZONES).fill(null),
    reactions: Array(REACTION_ZONES).fill(null),
    chargedThisTurn: false,
    drewFromStarCore: false,
    shiftedThisTurn: false,
  };
}

function applyAction(room, seat, action) {
  const game = room.game;
  if (!game || game.finished) return;

  if (game.pendingChoice) {
    if (action.type === "choice" && game.pendingChoice.seat === seat) {
      resolvePendingChoice(game, action);
      checkGameEnd(game);
      room.version += 1;
    }
    return;
  }

  if (game.active !== seat) return;
  const player = game[seat];
  const opponentSeat = seat === "host" ? "guest" : "host";
  const opponent = game[opponentSeat];

  if (action.type === "charge") {
    chargeFromHand(game, player, Number(action.index));
  }

  if (action.type === "setReaction") {
    setReaction(game, player, Number(action.index), actionSlotIndex(action));
  }

  if (action.type === "playFromHand") {
    playFromHand(game, player, opponent, Number(action.index), seat, actionSlotIndex(action));
  }

  if (action.type === "attack") {
    attackWithUnit(game, player, opponent, Number(action.attackerIndex), action.targetIndex === null ? null : Number(action.targetIndex));
  }

  if (action.type === "endTurn") {
    endTurn(game);
  }

  checkGameEnd(game);
  room.version += 1;
}

function actionSlotIndex(action) {
  if (action.slotIndex === null || action.slotIndex === undefined) return null;
  const slot = Number(action.slotIndex);
  return Number.isInteger(slot) ? slot : null;
}

function chargeFromHand(game, player, index) {
  if (player.chargedThisTurn || !player.hand[index]) return false;
  const id = player.hand.splice(index, 1)[0];
  player.charge.push({ id, tapped: false });
  player.chargedThisTurn = true;
  log(game, `${cards[id].name}をチャージ。`);
  triggerChargeCore(game, player);
  return true;
}

function setReaction(game, player, index, preferredSlot = null) {
  const id = player.hand[index];
  const card = cards[id];
  const slot = preferredOpenSlot(player.reactions, preferredSlot);
  if (!card || card.type !== "リアクション" || slot === -1) return false;
  player.hand.splice(index, 1);
  player.reactions[slot] = { id, revealed: false };
  log(game, `${card.name}をセット。`);
  return true;
}

function playFromHand(game, player, opponent, index, seat, preferredSlot = null) {
  const id = player.hand[index];
  const card = cards[id];
  if (!card || !canPlayCard(player, card) || !payCost(player, card.cost)) return false;
  player.hand.splice(index, 1);

  if (!queueReactionChoice(game, opponent, player, card, "effect", (negated) => {
    resolvePlayedCard(game, player, opponent, card, negated, seat, preferredSlot);
  })) {
    resolvePlayedCard(game, player, opponent, card, false, seat, preferredSlot);
  }
  return true;
}

function resolvePlayedCard(game, player, opponent, card, negated, seat, preferredSlot = null) {
  const prefix = seat === "guest" ? "相手は" : "";
  if (card.type === "ユニット") {
    summonUnit(player, card.id, preferredSlot);
    log(game, `${prefix}${card.name}を召喚。`);
    if (!negated) {
      const pending = resolveEffect(game, card.effect, player, opponent, card);
      if (pending) appendPendingAfter(game, () => afterSummon(game, player, card.id));
      else afterSummon(game, player, card.id);
    } else {
      log(game, `${card.name}の召喚時効果は無効化された。`);
    }
    return;
  }

  if (card.type === "コア") {
    placeCore(player, card.id, preferredSlot);
    log(game, `${prefix}${card.name}を発動。`);
    if (!negated) resolveEffect(game, card.effect, player, opponent, card);
    if (negated) log(game, `${card.name}の効果は無効化された。`);
    return;
  }

  if (card.type === "スペル") {
    log(game, `${prefix}${card.name}を発動。`);
    if (!negated) resolveEffect(game, card.effect, player, opponent, card);
    if (negated) log(game, `${card.name}は無効化された。`);
    player.grave.push(card.id);
  }
}

function attackWithUnit(game, player, opponent, attackerIndex, targetIndex) {
  const unit = player.units[attackerIndex];
  if (!unit || unit.exhausted) return false;
  const attackerCard = cards[unit.id];
  if (queueReactionChoice(game, opponent, player, attackerCard, "attack", (negated) => {
    if (negated) {
      unit.exhausted = true;
      return;
    }
    resolveAttack(game, player, opponent, attackerIndex, targetIndex);
  })) {
    return true;
  }

  resolveAttack(game, player, opponent, attackerIndex, targetIndex);
  return true;
}

function resolveAttack(game, player, opponent, attackerIndex, targetIndex) {
  const unit = player.units[attackerIndex];
  if (!unit || unit.exhausted) return false;
  const attackerCard = cards[unit.id];
  const attackerAtk = getUnitAtk(player, unit, game);
  unit.exhausted = true;
  if (targetIndex === null || targetIndex === undefined || !opponent.units[targetIndex]) {
    const dealt = damage(game, opponent, attackerAtk);
    log(game, `${attackerCard.name}が直接攻撃。${dealt}ダメージ。`);
    return true;
  }

  const defender = opponent.units[targetIndex];
  const defenderCard = cards[defender.id];
  const defenderAtk = getUnitAtk(opponent, defender, game);
  const diff = Math.abs(attackerAtk - defenderAtk);
  if (attackerAtk >= defenderAtk) {
    destroyUnit(opponent, targetIndex);
    const dealt = diff > 0 ? damage(game, opponent, diff) : 0;
    log(game, `${attackerCard.name}が${defenderCard.name}を破壊。${dealt}ダメージ。`);
  } else {
    destroyUnit(player, attackerIndex);
    const dealt = damage(game, player, diff);
    log(game, `${attackerCard.name}は戦闘で破壊された。${dealt}ダメージ。`);
  }
  return true;
}

function queueReactionChoice(game, reactor, opponent, sourceCard, trigger, continuation) {
  const options = getUsableReactions(reactor, trigger);
  if (options.length === 0) return false;

  game.pendingChoice = {
    id: makeId(8),
    seat: seatOf(game, reactor),
    zone: "reaction",
    title: "リアクション確認",
    message: `${sourceCard.name}に対応できます。発動するカードを選んでください。`,
    candidates: options,
    allowPass: true,
    resolve: (candidate) => {
      let negated = false;
      if (candidate) {
        const card = cards[candidate.id];
        if (card && payCost(reactor, card.cost)) {
          reactor.reactions[candidate.index] = null;
          reactor.grave.push(candidate.id);
          log(game, `${card.name}を発動。`);
          applyReactionEffect(game, card, reactor, opponent);
          negated = true;
        }
      }
      continuation(negated);
    },
    afterResolve: null,
  };
  return true;
}

function getUsableReactions(player, trigger) {
  return player.reactions
    .map((entry, index) => ({ id: reactionId(entry), index }))
    .filter((entry) => entry.id && cards[entry.id].trigger === trigger && canPay(player, cards[entry.id].cost));
}

function autoReact(game, reactor, opponent, sourceCard, trigger) {
  const option = getUsableReactions(reactor, trigger)[0];
  if (!option) return false;
  const card = cards[option.id];
  if (!payCost(reactor, card.cost)) return false;
  reactor.reactions[option.index] = null;
  reactor.grave.push(option.id);
  log(game, `${card.name}を発動。`);
  applyReactionEffect(game, card, reactor, opponent);
  return true;
}

function applyReactionEffect(game, card, player, opponent) {
  if (card.effect === "negateAttackDamage") {
    const dealt = damage(game, opponent, 500);
    log(game, `${card.name}で攻撃を止め、${dealt}ダメージ。`);
    return;
  }
  if (card.effect === "negateAttackUntap") {
    untapOneCharge(player);
    log(game, `${card.name}で攻撃を止めた。`);
    return;
  }
  if (card.effect === "negateEffectDraw") {
    if (countThemeInCharge(player, "星導") >= 3) drawCards(player, 1, game);
    log(game, `${card.name}で効果を止めた。`);
    return;
  }
  log(game, `${card.name}で止めた。`);
}

function resolvePendingChoice(game, action) {
  const pending = game.pendingChoice;
  if (!pending || pending.id !== action.choiceId) return;
  const passed = pending.allowPass && (action.index === null || action.index === undefined || action.index === "pass");
  const requestedIndex = Number(action.index);
  const candidate = passed
    ? null
    : pending.candidates.find((entry) => entry.index === requestedIndex) || (pending.allowPass ? null : pending.candidates[0]);
  game.pendingChoice = null;
  pending.resolve(candidate);
  pending.afterResolve?.();
}

function appendPendingAfter(game, handler) {
  if (!game.pendingChoice) return false;
  const previous = game.pendingChoice.afterResolve;
  game.pendingChoice.afterResolve = () => {
    previous?.();
    handler();
  };
  return true;
}

function queueChoice(game, player, zone, list, predicate, choice, handler, emptyHandler = () => {}) {
  const candidates = list
    .map((id, index) => ({ id, index }))
    .filter((entry) => cards[entry.id] && predicate(cards[entry.id], entry.index));
  if (candidates.length === 0) {
    emptyHandler();
    return false;
  }

  game.pendingChoice = {
    id: makeId(8),
    seat: seatOf(game, player),
    zone,
    title: choice.title,
    message: choice.message,
    candidates,
    resolve: handler,
    afterResolve: null,
  };
  return true;
}

function chooseFromDeck(game, player, predicate, choice, after = () => {}) {
  return queueChoice(game, player, "deck", player.deck, predicate, choice, (candidate) => {
    const [id] = player.deck.splice(candidate.index, 1);
    player.hand.push(id);
    player.deck = shuffle(player.deck);
    log(game, `${cards[id].name}を手札に加えた。`);
    after(true);
  }, () => after(false));
}

function chooseFromGrave(game, player, predicate, choice, after = () => {}) {
  return queueChoice(game, player, "grave", player.grave, predicate, choice, (candidate) => {
    const [id] = player.grave.splice(candidate.index, 1);
    player.hand.push(id);
    log(game, `${cards[id].name}を墓地から戻した。`);
    after(true);
  }, () => after(false));
}

function chooseSpecialSummonFromHand(game, player, predicate, choice) {
  const slot = player.units.findIndex((unit) => !unit);
  if (slot === -1) return false;
  return queueChoice(game, player, "hand", player.hand, predicate, choice, (candidate) => {
    const [id] = player.hand.splice(candidate.index, 1);
    player.units[slot] = { id, exhausted: false, atkMod: 0 };
    log(game, `${cards[id].name}を追加召喚。`);
    afterSummon(game, player, id);
  });
}

function chooseDiscardFromHand(game, player, choice) {
  return queueChoice(game, player, "hand", player.hand, () => true, choice, (candidate) => {
    const [id] = player.hand.splice(candidate.index, 1);
    player.grave.push(id);
    log(game, `${cards[id].name}を墓地に送った。`);
  });
}

function seatOf(game, player) {
  if (player === game.host) return "host";
  if (player === game.guest) return "guest";
  return null;
}

function completeTurn(game) {
  game.completedTurns += 1;
  if (game.completedTurns % 2 !== 0) return;
  game.environmentCycle += 1;
  game.naturalEnvironmentLevel = Math.min(ENVIRONMENT_MAX_LEVEL, 1 + Math.floor(game.environmentCycle / 2));
  changeEnvironment(game, game.naturalEnvironmentLevel);
}

function changeEnvironment(game, level) {
  const candidates = [...game.hostEnvironmentDeck, ...game.guestEnvironmentDeck]
    .filter((id) => cards[id]?.type === "環境" && cards[id].level === level);
  const fallback = Object.keys(starterEnvironmentDeck).filter((id) => cards[id]?.type === "環境" && cards[id].level === level);
  const pool = candidates.length ? candidates : fallback;
  if (pool.length === 0) return false;
  const next = pool[Math.floor(Math.random() * pool.length)];
  game.currentEnvironment = next;
  log(game, `環境が${cards[next].name}（Lv${cards[next].level}）になった。`);
  applyEnvironmentEnter(game, cards[next]);
  return true;
}

function applyEnvironmentEnter(game, card) {
  if (card.family === "星") {
    const drawAmount = card.level >= 3 ? 2 : 1;
    drawCards(game.host, drawAmount, game);
    drawCards(game.guest, drawAmount, game);
    let untapped = false;
    if (card.level >= 2) {
      untapped = untapOneCharge(game.host) || untapped;
      untapped = untapOneCharge(game.guest) || untapped;
    }
    log(game, `${card.name}で各プレイヤーは${drawAmount}枚ドロー。`);
    if (untapped) log(game, `${card.name}でチャージがアクティブになった。`);
    return;
  }

  if (card.family !== "風") return;
  if (card.level >= 3) {
    const hostChanged = removeRevealedReaction(game, game.host) || revealReactions(game.host, 1);
    const guestChanged = removeRevealedReaction(game, game.guest) || revealReactions(game.guest, 1);
    if (hostChanged || guestChanged) log(game, `${card.name}が表向きのリアクションを吹き飛ばした。`);
    return;
  }
  const amount = card.level >= 2 ? 2 : 1;
  if (revealReactions(game.host, amount) || revealReactions(game.guest, amount)) {
    log(game, `${card.name}でセットリアクションがめくられた。`);
  }
}

function revealReactions(player, amount) {
  let revealed = 0;
  for (let i = 0; i < player.reactions.length && revealed < amount; i += 1) {
    const entry = player.reactions[i];
    const id = reactionId(entry);
    if (!id || reactionRevealed(entry)) continue;
    player.reactions[i] = { id, revealed: true };
    revealed += 1;
  }
  return revealed > 0;
}

function removeRevealedReaction(game, player) {
  const index = player.reactions.findIndex((entry) => reactionId(entry) && reactionRevealed(entry));
  if (index === -1) return false;
  const id = reactionId(player.reactions[index]);
  player.reactions[index] = null;
  player.grave.push(id);
  log(game, `${cards[id].name}は環境で墓地に送られた。`);
  return true;
}

function endTurn(game) {
  completeTurn(game);
  game.active = game.active === "host" ? "guest" : "host";
  if (game.openingTurn) {
    game.openingTurn = false;
  } else if (game.active === game.firstActive) {
    game.turn += 1;
  }
  const activePlayer = game[game.active];
  refreshTurn(activePlayer);
  drawCards(activePlayer, 1, game);
  log(game, `${game.active === "host" ? "ホスト" : "ゲスト"}のターン。`);
}

function resolveEffect(game, effect, player, opponent, sourceCard) {
  switch (effect) {
    case "starScout":
      return chooseFromDeck(game, player, (card) => card.name.includes("星導"), {
        title: "星導カードをサーチ",
        message: "デッキから手札に加えるカードを選んでください。",
      }, () => {
        if (countThemeInCharge(player, "星導") >= 2) drawCards(player, 1, game);
      });
    case "starLux":
      if (player.chargedThisTurn) {
        return chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.name.includes("星導") && card.cost <= 1, {
          title: "星導ユニットを追加召喚",
          message: "手札から追加召喚するユニットを選んでください。",
        });
      }
      return false;
    case "starMira":
      return chooseFromGrave(game, player, (card) => card.type === "スペル" && card.name.includes("星導"), {
        title: "星導スペルを回収",
        message: "墓地から手札に戻すカードを選んでください。",
      }, (moved) => {
        if (!moved) drawCards(player, 1, game);
      });
    case "starKai":
      if (countThemeInCharge(player, "星導") >= 3) damage(game, opponent, 500);
      break;
    case "starDragon":
      if (countThemeInCharge(player, "星導") >= 4 && destroyBestUnit(opponent)) log(game, "星龍の光が相手ユニットを破壊。");
      else damage(game, opponent, 1200);
      break;
    case "starInvite":
      return chooseFromDeck(game, player, (card) => card.type === "ユニット" && card.name.includes("星導"), {
        title: "星導ユニットをサーチ",
        message: "デッキから手札に加えるユニットを選んでください。",
      }, () => {
        if (countThemeInCharge(player, "星導") >= 2) drawCards(player, 1, game);
      });
    case "starLink":
      drawCards(player, 1, game);
      if (controlsThemeUnit(player, "星導")) {
        return chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.name.includes("星導") && card.cost <= 1, {
          title: "星導ユニットを追加召喚",
          message: "手札から追加召喚するユニットを選んでください。",
        });
      }
      return false;
    case "starReignite":
      return chooseFromGrave(game, player, (card) => card.name.includes("星導"), {
        title: "星導カードを回収",
        message: "墓地から手札に戻すカードを選んでください。",
      }, () => {
        untapOneCharge(player, (card) => card.name.includes("星導"));
      });
    case "starOrbit":
      drawCards(player, 1, game);
      break;
    case "blackGrinder":
      if (opponent.units.some(Boolean)) damage(game, opponent, 400);
      if (player.cores.some(Boolean)) drawCards(player, 1, game);
      break;
    case "blackGear":
      if (countThemeInCharge(player, "黒機") >= 2) {
        return chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.name.includes("黒機") && card.cost <= 1, {
          title: "黒機ユニットを追加召喚",
          message: "手札から追加召喚するユニットを選んでください。",
        });
      }
      return false;
    case "blackAnchor":
      exhaustBestUnit(game, opponent);
      if (player.cores.some(Boolean)) damage(game, opponent, 700);
      break;
    case "blackTower":
      damage(game, opponent, 600);
      break;
    case "blackRaid":
      damage(game, opponent, 800);
      if (controlsThemeUnit(player, "黒機")) exhaustBestUnit(game, opponent);
      break;
    case "drawDiscard":
      drawCards(player, 2, game);
      return chooseDiscardFromHand(game, player, {
        title: "手札を1枚捨てる",
        message: "墓地に送るカードを選んでください。",
      });
    case "bindUnit":
      exhaustBestUnit(game, opponent);
      damage(game, opponent, 500);
      break;
    case "recallUnit":
      return chooseFromGrave(game, player, (card) => card.type === "ユニット", {
        title: "ユニットを回収",
        message: "墓地から手札に戻すユニットを選んでください。",
      });
    case "zeroCore":
      drawCards(player, 1, game);
      break;
    default:
      if (sourceCard) log(game, `${sourceCard.name}の効果を処理。`);
  }
  return false;
}

function refreshTurn(player) {
  player.charge.forEach((charge) => { charge.tapped = false; });
  player.units.forEach((unit) => { if (unit) unit.exhausted = false; });
  player.chargedThisTurn = false;
  player.drewFromStarCore = false;
  player.shiftedThisTurn = false;
}

function canPlayCard(player, card) {
  if (card.type === "ユニット") return player.units.some((unit) => !unit);
  if (card.type === "コア") return player.cores.some((core) => !core);
  return card.type === "スペル";
}

function canPay(player, cost) {
  return player.charge.filter((charge) => !charge.tapped).length >= cost;
}

function payCost(player, cost) {
  if (!canPay(player, cost)) return false;
  let remaining = cost;
  player.charge.forEach((charge) => {
    if (remaining > 0 && !charge.tapped) {
      charge.tapped = true;
      remaining -= 1;
    }
  });
  return true;
}

function drawCards(player, amount, game) {
  for (let i = 0; i < amount; i += 1) {
    if (player.deck.length === 0) {
      player.lp = 0;
      log(game, `${player.name}は山札切れ。`);
      return;
    }
    player.hand.push(player.deck.pop());
  }
}

function summonUnit(player, id, preferredSlot = null) {
  const slot = preferredOpenSlot(player.units, preferredSlot);
  if (slot === -1) return false;
  player.units[slot] = { id, exhausted: false, atkMod: 0 };
  return true;
}

function specialSummonFromHand(game, player, predicate) {
  const slot = player.units.findIndex((unit) => !unit);
  if (slot === -1) return false;
  const index = player.hand.findIndex((id) => predicate(cards[id]));
  if (index === -1) return false;
  const id = player.hand.splice(index, 1)[0];
  player.units[slot] = { id, exhausted: false, atkMod: 0 };
  log(game, `${cards[id].name}を追加召喚。`);
  afterSummon(game, player, id);
  return true;
}

function placeCore(player, id, preferredSlot = null) {
  const slot = preferredOpenSlot(player.cores, preferredSlot);
  if (slot === -1) return false;
  player.cores[slot] = id;
  return true;
}

function addFromDeck(game, player, predicate) {
  const index = player.deck.findIndex((id) => predicate(cards[id]));
  if (index === -1) return false;
  const [id] = player.deck.splice(index, 1);
  player.hand.push(id);
  player.deck = shuffle(player.deck);
  log(game, `${cards[id].name}を手札に加えた。`);
  return true;
}

function addFromGrave(game, player, predicate) {
  const index = player.grave.findIndex((id) => predicate(cards[id]));
  if (index === -1) return false;
  const [id] = player.grave.splice(index, 1);
  player.hand.push(id);
  log(game, `${cards[id].name}を墓地から戻した。`);
  return true;
}

function discardLowestImpact(game, player) {
  if (player.hand.length === 0) return false;
  let index = 0;
  player.hand.forEach((id, handIndex) => {
    const current = cards[id];
    const chosen = cards[player.hand[index]];
    if (current.cost > chosen.cost) return;
    if (current.type === "リアクション" && chosen.type !== "リアクション") return;
    index = handIndex;
  });
  const [id] = player.hand.splice(index, 1);
  player.grave.push(id);
  log(game, `${cards[id].name}を墓地に送った。`);
  return true;
}

function afterSummon(game, player, id) {
  if (cards[id].name.includes("星導") && player.cores.includes("star_orbit") && !player.drewFromStarCore) {
    player.drewFromStarCore = true;
    drawCards(player, 1, game);
    log(game, "星導の軌道環で1枚ドロー。");
  }
}

function triggerChargeCore(game, player) {
  if (player.cores.includes("generic_zero") && !player.shiftedThisTurn) {
    player.shiftedThisTurn = true;
    drawCards(player, 1, game);
    chooseDiscardFromHand(game, player, {
      title: "手札を1枚捨てる",
      message: "ゼロシフト装置で墓地に送るカードを選んでください。",
    });
    log(game, "ゼロシフト装置が起動。");
  }
}

function destroyBestUnit(player) {
  const target = player.units
    .map((unit, index) => ({ unit, index }))
    .filter((entry) => entry.unit)
    .sort((a, b) => getUnitAtk(player, b.unit) - getUnitAtk(player, a.unit))[0];
  if (!target) return false;
  destroyUnit(player, target.index);
  return true;
}

function exhaustBestUnit(game, player) {
  const target = player.units
    .map((unit, index) => ({ unit, index }))
    .filter((entry) => entry.unit && !entry.unit.exhausted)
    .sort((a, b) => getUnitAtk(player, b.unit, game) - getUnitAtk(player, a.unit, game))[0];
  if (!target) return false;
  target.unit.exhausted = true;
  log(game, `${cards[target.unit.id].name}を行動済みにした。`);
  return true;
}

function destroyUnit(player, index) {
  const unit = player.units[index];
  if (!unit) return false;
  player.grave.push(unit.id);
  player.units[index] = null;
  return true;
}

function untapOneCharge(player, predicate = () => true) {
  const charge = player.charge.find((entry) => entry.tapped && predicate(cards[entry.id]));
  if (!charge) return false;
  charge.tapped = false;
  return true;
}

function countThemeInCharge(player, theme) {
  return player.charge.filter((entry) => cards[entry.id].name.includes(theme)).length;
}

function controlsThemeUnit(player, theme) {
  return player.units.some((unit) => unit && cards[unit.id].name.includes(theme));
}

function getUnitAtk(player, unit, game = null) {
  if (!unit) return 0;
  let atk = cards[unit.id].atk + (unit.atkMod || 0);
  if (player.cores.includes("black_tower") && cards[unit.id].name.includes("黒機")) atk += 200;
  if (cards[unit.id].id === "star_guard") atk += player.cores.filter(Boolean).length * 300;
  atk += getEnvironmentAtkMod(game);
  return atk;
}

function getEnvironmentAtkMod(game) {
  const environment = cards[game?.currentEnvironment];
  if (!environment || environment.type !== "環境") return 0;
  if (environment.family === "晴れ") return environment.level * 100;
  if (environment.family === "雪") return environment.level * -100;
  return 0;
}

function damage(game, player, amount) {
  const dealt = Math.max(0, amount - getEnvironmentDamageReduction(game));
  player.lp = Math.max(0, player.lp - dealt);
  return dealt;
}

function getEnvironmentDamageReduction(game) {
  const environment = cards[game?.currentEnvironment];
  if (!environment || environment.type !== "環境") return 0;
  if (environment.family === "雨") return environment.level * 100;
  return 0;
}

function checkGameEnd(game) {
  if (game.finished) return true;
  if (game.host.lp <= 0 || game.guest.lp <= 0) {
    game.finished = true;
    game.winner = game.host.lp > game.guest.lp ? "host" : "guest";
    log(game, game.winner === "host" ? "ホストの勝利。" : "ゲストの勝利。");
    return true;
  }
  return false;
}

function roomSnapshot(room, seat) {
  if (room.status === "waiting" || !room.game) {
    return {
      roomId: room.id,
      status: "waiting",
      version: room.version,
      seat,
      message: `ルーム ${room.id}: 相手の参加待ち`,
    };
  }
  const enemySeat = seat === "host" ? "guest" : "host";
  const game = room.game;
  const player = publicDuelist(game[seat], true);
  const enemy = publicDuelist(game[enemySeat], false);
  return {
    roomId: room.id,
    status: game.finished ? "finished" : "playing",
    version: room.version,
    seat,
    turn: game.turn,
    active: game.active === seat ? "player" : "enemy",
    finished: game.finished,
    won: game.finished ? game.winner === seat : false,
    currentEnvironment: game.currentEnvironment,
    naturalEnvironmentLevel: game.naturalEnvironmentLevel,
    environmentCycle: game.environmentCycle,
    pendingChoice: publicPendingChoice(game.pendingChoice, seat),
    waitingChoice: publicWaitingChoice(game.pendingChoice, seat),
    player,
    enemy,
    logItems: game.logItems.slice(),
  };
}

function publicPendingChoice(choice, seat) {
  if (!choice || choice.seat !== seat) return null;
  return {
    id: choice.id,
    zone: choice.zone,
    title: choice.title,
    message: choice.message,
    allowPass: Boolean(choice.allowPass),
    candidates: choice.candidates.map((entry) => ({
      id: entry.id,
      index: entry.index,
    })),
  };
}

function publicWaitingChoice(choice, seat) {
  if (!choice || choice.seat === seat) return null;
  return {
    id: choice.id,
    zone: choice.zone,
  };
}

function publicDuelist(player, includeHand) {
  return {
    name: player.name,
    lp: player.lp,
    deck: Array(player.deck.length).fill(null),
    hand: includeHand ? player.hand.slice() : Array(player.hand.length).fill(null),
    grave: player.grave.slice(),
    charge: player.charge.map((entry) => ({ ...entry })),
    units: player.units.map((unit) => (unit ? { ...unit } : null)),
    cores: player.cores.slice(),
    reactions: publicReactions(player.reactions, includeHand),
    chargedThisTurn: player.chargedThisTurn,
  };
}

function publicReactions(reactions, includeHand) {
  return reactions.map((entry) => {
    const id = reactionId(entry);
    if (!id) return null;
    if (includeHand || reactionRevealed(entry)) return { id, revealed: reactionRevealed(entry) };
    return { facedown: true };
  });
}

function log(game, message) {
  game.logItems.push(message);
  if (game.logItems.length > 80) game.logItems.shift();
}

function validateDeck(deck) {
  if (!Array.isArray(deck) || deck.length === 0) throw new Error("deck is required");
  const valid = deck.filter((id) => cards[id] && cards[id].type !== "環境");
  if (valid.length !== DECK_SIZE) throw new Error(`deck must be ${DECK_SIZE} cards`);
  return valid;
}

function validateEnvironmentDeck(deck) {
  const source = Array.isArray(deck) && deck.length > 0 ? deck : expandCounts(starterEnvironmentDeck);
  const result = [];
  const levelCounts = new Map();
  source.forEach((id) => {
    const card = cards[id];
    if (!card || card.type !== "環境" || result.includes(id)) return;
    const current = levelCounts.get(card.level) || 0;
    if (current >= ENVIRONMENT_DECK_PER_LEVEL) return;
    result.push(id);
    levelCounts.set(card.level, current + 1);
  });
  Object.keys(starterEnvironmentDeck).forEach((id) => {
    const card = cards[id];
    if (!card || result.includes(id)) return;
    const current = levelCounts.get(card.level) || 0;
    if (current >= ENVIRONMENT_DECK_PER_LEVEL) return;
    result.push(id);
    levelCounts.set(card.level, current + 1);
  });
  for (let level = 1; level <= ENVIRONMENT_MAX_LEVEL; level += 1) {
    if ((levelCounts.get(level) || 0) !== ENVIRONMENT_DECK_PER_LEVEL) {
      throw new Error(`environment deck needs ${ENVIRONMENT_DECK_PER_LEVEL} cards for level ${level}`);
    }
  }
  return result;
}

function expandCounts(counts) {
  return Object.entries(counts).flatMap(([id, count]) => Array(count).fill(id));
}

function getSeat(room, playerId) {
  if (room.players.host?.id === playerId) return "host";
  if (room.players.guest?.id === playerId) return "guest";
  return null;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function serveStatic(req, res, url) {
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": cacheControl(filePath),
    });
    res.end(data);
  });
}

function cacheControl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if ([".html", ".css", ".js"].includes(ext)) return "no-store";
  return "public, max-age=86400";
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
  }[ext] || "application/octet-stream";
}

function shuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeId(length) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < length; i += 1) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function reactionId(entry) {
  return typeof entry === "string" ? entry : entry?.id;
}

function reactionRevealed(entry) {
  return Boolean(entry && typeof entry === "object" && entry.revealed);
}

function preferredOpenSlot(list, preferredSlot) {
  const slot = Number(preferredSlot);
  if (Number.isInteger(slot) && slot >= 0 && slot < list.length && !list[slot]) return slot;
  return list.findIndex((entry) => !entry);
}
