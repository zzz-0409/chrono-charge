const http = require("http");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8787);
const ACCOUNTS_FILE = path.join(ROOT, "accounts.json");
const DATABASE_URL = process.env.DATABASE_URL || "";
const db = createAccountDb();
const KEEPALIVE_INTERVAL_MS = Math.max(60_000, Number(process.env.KEEPALIVE_INTERVAL_MS || 300_000));
const KEEPALIVE_URLS = keepAliveUrls();
const MAX_LP = 8000;
const UNIT_ZONES = 5;
const CORE_ZONES = 2;
const REACTION_ZONES = 3;

const chrono = loadChronoData();
const cards = chrono.cards;
const DECK_SIZE = chrono.DECK_SIZE || 40;
const DRIVE_DECK_SIZE = chrono.DRIVE_DECK_SIZE || 10;
const MAX_DRIVE_COPIES = chrono.MAX_DRIVE_COPIES || 1;
const SOSAI_PAIRS = [
  ["sosai_hikari", "sosai_mint"],
  ["sosai_nene", "sosai_ruri"],
  ["sosai_coco", "sosai_luna"],
];
const SOSAI_DRIVE_PAIR_IDS = [
  "drive_sosai_unit",
  "drive_sosai_nene_ruri_unit",
  "drive_sosai_coco_luna_unit",
];

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
  startKeepAlive();
});

function loadChronoData() {
  const context = { window: { Chrono: {} } };
  const code = fs.readFileSync(path.join(ROOT, "src", "data", "cards.js"), "utf8");
  vm.runInNewContext(code, context, { filename: "cards.js" });
  return context.window.Chrono;
}

function keepAliveUrls() {
  const explicit = process.env.KEEPALIVE_URLS || process.env.KEEPALIVE_URL || "";
  const publicUrl = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "";
  const source = explicit || publicUrl;
  return source
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      if (/\/health(?:\?|$)/.test(entry)) return entry;
      return `${entry.replace(/\/+$/, "")}/health`;
    });
}

function startKeepAlive() {
  if (KEEPALIVE_URLS.length === 0) return;
  const ping = async () => {
    await Promise.allSettled(KEEPALIVE_URLS.map(async (url) => {
      const started = Date.now();
      const response = await fetch(url, { cache: "no-store" });
      console.log(`keepalive ${response.status} ${url} ${Date.now() - started}ms`);
    }));
  };
  setInterval(() => {
    ping().catch((error) => console.warn("keepalive failed:", error.message));
  }, KEEPALIVE_INTERVAL_MS).unref?.();
  setTimeout(() => {
    ping().catch((error) => console.warn("keepalive failed:", error.message));
  }, 15_000).unref?.();
  console.log(`Keepalive enabled every ${Math.round(KEEPALIVE_INTERVAL_MS / 1000)}s: ${KEEPALIVE_URLS.join(", ")}`);
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/accounts") {
    await handleAccountApi(req, res, url.searchParams.get("name"));
    return;
  }

  const accountMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)$/);
  if (accountMatch) {
    await handleAccountApi(req, res, decodeURIComponent(accountMatch[1]));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/rooms") {
    const body = await readJson(req);
    const deck = validateDeck(body.deck);
    const driveDeck = validateDriveDeck(body.driveDeck);
    const room = createRoom(deck, driveDeck);
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
      driveDeck: validateDriveDeck(body.driveDeck),
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

async function handleAccountApi(req, res, rawName) {
  const name = normalizeAccountName(rawName);
  if (req.method === "GET") {
    sendJson(res, 200, { account: await loadAccount(name) });
    return;
  }
  if (req.method === "PUT" || req.method === "POST") {
    const body = await readJson(req);
    const incoming = sanitizeAccountRecord(name, body.account || body || {});
    const current = await loadAccount(name);
    const account = mergeAccountRecord(name, current, incoming);
    await saveAccount(name, account);
    sendJson(res, 200, { account });
    return;
  }
  sendJson(res, 405, { error: "method not allowed" });
}

function createRoom(deck, driveDeck) {
  let id = "";
  do {
    id = makeId(5);
  } while (rooms.has(id));
  const room = {
    id,
    status: "waiting",
    version: 1,
    players: {
      host: { id: makeId(12), deck, driveDeck },
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
    activationEvents: [],
    finished: false,
    winner: null,
    pendingChoice: null,
    host: newDuelist("Host", room.players.host.deck, room.players.host.driveDeck),
    guest: newDuelist("Guest", room.players.guest.deck, room.players.guest.driveDeck),
    logItems: [
      `ルーム ${room.id}: オンラインデュエル開始。`,
      `先攻は${firstActive === "host" ? "ホスト" : "ゲスト"}です。`,
    ],
  };
  drawCards(room.game.host, 5, room.game);
  drawCards(room.game.guest, 5, room.game);
  refreshTurn(room.game[firstActive]);
  room.status = "playing";
  room.version += 1;
}

function newDuelist(name, deck, driveDeck = []) {
  return {
    name,
    lp: MAX_LP,
    deck: shuffle(deck.slice()),
    driveDeck: driveDeck.slice(),
    driveUsed: [],
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
  log(game, `${player.name}はリアクションをセット。`);
  return true;
}

function playFromHand(game, player, opponent, index, seat, preferredSlot = null) {
  const id = player.hand[index];
  const card = cards[id];
  if (!card || !canPlayCard(player, card) || !payCost(player, card.cost)) return false;
  player.hand.splice(index, 1);
  if (card.effect) addActivation(game, card, seat, "effect");

  if (card.effect && queueReactionChoice(game, opponent, player, card, "effect", (negated) => {
    resolvePlayedCard(game, player, opponent, card, negated, seat, preferredSlot);
  })) {
    return true;
  }
  resolvePlayedCard(game, player, opponent, card, false, seat, preferredSlot);
  return true;
}

function resolvePlayedCard(game, player, opponent, card, negated, seat, preferredSlot = null) {
  const prefix = seat === "guest" ? "相手は" : "";
  if (card.type === "ユニット") {
    summonUnit(player, card.id, preferredSlot);
    log(game, `${prefix}${card.name}を召喚。`);
    if (!negated && card.effect) {
      const pending = resolveEffect(game, card.effect, player, opponent, card);
      if (pending) appendPendingAfter(game, () => afterSummon(game, player, card.id));
      else afterSummon(game, player, card.id);
    } else if (negated) {
      log(game, `${card.name}の通常召喚時効果は無効化された。`);
    } else {
      afterSummon(game, player, card.id);
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
  if (!canAttack(game, player)) return false;
  const unit = player.units[attackerIndex];
  if (!unit || unit.exhausted) return false;
  const attackerCard = cards[unit.id];
  if (queueReactionChoice(game, opponent, player, attackerCard, "attack", (negated) => {
    if (negated) {
      unit.exhausted = true;
      return;
    }
    resolveAttack(game, player, opponent, attackerIndex, targetIndex);
  }, attackerIndex)) {
    return true;
  }

  resolveAttack(game, player, opponent, attackerIndex, targetIndex);
  return true;
}

function canAttack(game, player) {
  if (!game || !player) return false;
  if (game.finished || game.pendingChoice) return false;
  if (seatOf(game, player) !== game.active) return false;
  if (game.turn === 1 && game.active === game.firstActive && game.completedTurns === 0) return false;
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
  if (attackerAtk > defenderAtk) {
    destroyUnit(opponent, targetIndex);
    const dealt = damage(game, opponent, diff);
    log(game, `${attackerCard.name}が${defenderCard.name}を破壊。${dealt}ダメージ。`);
  } else if (attackerAtk < defenderAtk) {
    destroyUnit(player, attackerIndex);
    const dealt = damage(game, player, diff);
    log(game, `${attackerCard.name}は戦闘で破壊された。${dealt}ダメージ。`);
  } else {
    destroyUnit(player, attackerIndex);
    destroyUnit(opponent, targetIndex);
    log(game, `${attackerCard.name}と${defenderCard.name}は相打ち。`);
  }
  return true;
}

function queueReactionChoice(game, reactor, opponent, sourceCard, trigger, continuation, sourceIndex = null) {
  return queueReactionChainStep(game, [], { trigger, source: sourceCard, sourceIndex }, reactor, opponent, continuation, true);
}

function queueReactionChainStep(game, chain, event, reactor, opponent, continuation, firstStep = false) {
  const options = getUsableReactions(reactor, event.trigger);
  if (options.length === 0) return false;

  game.pendingChoice = {
    id: makeId(8),
    seat: seatOf(game, reactor),
    zone: "reaction",
    title: "リアクション確認",
    message: `${event.source.name}に対応できます。発動するカードを選んでください。`,
    candidates: options,
    allowPass: true,
    confirmLabel: "発動",
    passLabel: "発動しない",
    resolve: (candidate) => {
      if (candidate) {
        const card = cards[candidate.id];
        if (card && payCost(reactor, card.cost)) {
          reactor.reactions[candidate.index] = null;
          reactor.grave.push(candidate.id);
          addActivation(game, card, seatOf(game, reactor), "reaction");
          log(game, `${card.name}を発動。`);
          const link = { card, player: reactor, opponent, event, negated: false };
          chain.push(link);
          const nextEvent = { trigger: "effect", source: card, chainLink: link };
          if (queueReactionChainStep(game, chain, nextEvent, opponent, reactor, continuation)) return;
          resolveReactionChain(game, chain, continuation);
          return;
        }
      }
      if (chain.length > 0) {
        resolveReactionChain(game, chain, continuation);
      }
      else continuation(false);
    },
    afterResolve: null,
  };
  return true;
}

function resolveReactionChain(game, chain, continuation) {
  let baseNegated = false;
  if (chain.length > 0) log(game, "チェーンを解決。");
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const link = chain[i];
    if (link.negated) {
      log(game, `${link.card.name}は無効化された。`);
      continue;
    }
    const result = applyReactionEffect(game, link.card, link.player, link.opponent, link.event);
    if (result?.negates) {
      if (i === 0) baseNegated = true;
      else chain[i - 1].negated = true;
    }
  }
  continuation(baseNegated);
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
  addActivation(game, card, seatOf(game, reactor), "reaction");
  log(game, `${card.name}を発動。`);
  applyReactionEffect(game, card, reactor, opponent, { trigger, source: sourceCard });
  return true;
}

function applyReactionEffect(game, card, player, opponent, event = {}) {
  if (card.effect === "negateAttackDamage") {
    const dealt = damage(game, opponent, 500);
    log(game, `${card.name}で攻撃を止め、${dealt}ダメージ。`);
    return { negates: true };
  }
  if (card.effect === "negateAttackUntap") {
    untapOneCharge(player);
    log(game, `${card.name}で攻撃を止めた。`);
    return { negates: true };
  }
  if (card.effect === "negateEffectDraw") {
    if (countThemeInCharge(player, "星導") >= 3) drawCards(player, 1, game);
    log(game, `${card.name}で効果を止めた。`);
    return { negates: true };
  }
  if (card.effect === "bladeCounter") {
    const sourceIndex = Number(event.sourceIndex);
    const targetIndex = Number.isInteger(sourceIndex) && opponent.units[sourceIndex]
      ? sourceIndex
      : opponent.units.findIndex((unit) => unit && unit.id === event.source?.id);
    if (targetIndex !== -1) {
      const targetName = cards[opponent.units[targetIndex].id].name;
      if (countThemeInCharge(player, "断刃") >= 3) {
        destroyUnit(opponent, targetIndex);
        log(game, `${card.name}で${targetName}を破壊。`);
      } else {
        opponent.units[targetIndex].exhausted = true;
        opponent.units[targetIndex].exhaustedUntilOwnerTurnEnd = true;
        opponent.units[targetIndex].exhaustedUntilOwnerTurnEndReady = false;
        log(game, `${card.name}で${targetName}を行動済みにした。`);
      }
      return { negates: true };
    }
    log(game, `${card.name}で攻撃を止めた。`);
    return { negates: true };
  }
  if (card.effect === "cyberShield") {
    if (countThemeUnits(player, "電脳") >= 2) drawCards(player, 1, game);
    log(game, `${card.name}で攻撃を止めた。`);
    return { negates: true };
  }
  if (card.effect === "cyberCounterhack") {
    if (countThemeUnits(player, "電脳") >= 2) revealReactions(opponent, 1);
    log(game, `${card.name}で効果を止めた。`);
    return { negates: true };
  }
  if (card.effect === "sosaiStreamCancel") {
    if (hasSosaiPair(player)) drawCards(player, 1, game);
    log(game, `${card.name}で効果を止めた。`);
    return { negates: true };
  }
  if (card.effect === "watchSignal") {
    drawCards(player, 1, game);
    log(game, `${card.name}で1枚ドロー。攻撃は継続する。`);
    return { negates: false };
  }
  if (card.effect === "noisePing") {
    const revealed = revealReactions(opponent, 1);
    log(game, revealed > 0
      ? `${card.name}で相手のリアクション1枚を表向きにした。`
      : `${card.name}を発動。表向きにできるリアクションはなかった。`);
    return { negates: false };
  }
  log(game, `${card.name}で止めた。`);
  return { negates: true };
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
    delayBeforeOpenMs: choice.delayBeforeOpenMs || 0,
    candidates,
    resolve: handler,
    afterResolve: null,
  };
  return true;
}

function queueUnitTargetChoice(game, chooser, targetPlayer, predicate, choice, handler, emptyHandler = () => {}) {
  const candidates = targetPlayer.units
    .map((unit, index) => ({ id: unit?.id, unit, index }))
    .filter((entry) => entry.unit && predicate(entry.unit, entry.index));
  if (candidates.length === 0) {
    emptyHandler();
    return false;
  }

  game.pendingChoice = {
    id: makeId(8),
    seat: seatOf(game, chooser),
    zone: "unitTarget",
    title: choice.title,
    message: choice.message,
    delayBeforeOpenMs: choice.delayBeforeOpenMs || 0,
    candidates,
    confirmLabel: choice.confirmLabel,
    resolve: handler,
    afterResolve: null,
  };
  return true;
}

function chooseDestroyUnit(game, chooser, targetPlayer, after = () => {}) {
  return queueUnitTargetChoice(game, chooser, targetPlayer, () => true, {
    title: "破壊するユニットを選択",
    message: "破壊する相手ユニットを選んでください。",
    confirmLabel: "決定",
  }, (candidate) => {
    destroyUnit(targetPlayer, candidate.index);
    after(true);
  }, () => after(false));
}

function chooseReturnUnitToHand(game, chooser, targetPlayer, after = () => {}) {
  return queueUnitTargetChoice(game, chooser, targetPlayer, () => true, {
    title: "戻すユニットを選択",
    message: "手札に戻す相手ユニットを選んでください。",
    confirmLabel: "決定",
  }, (candidate) => {
    const unit = targetPlayer.units[candidate.index];
    const targetName = cards[unit.id].name;
    targetPlayer.hand.push(unit.id);
    targetPlayer.units[candidate.index] = null;
    log(game, `${targetName}を手札に戻した。`);
    after(true);
  }, () => after(false));
}

function chooseDestroyExhaustedUnit(game, chooser, targetPlayer, after = () => {}) {
  return queueUnitTargetChoice(game, chooser, targetPlayer, (unit) => unit.exhausted, {
    title: "破壊する行動済みユニットを選択",
    message: "破壊する相手の行動済みユニットを選んでください。",
    confirmLabel: "決定",
  }, (candidate) => {
    const targetName = cards[targetPlayer.units[candidate.index].id].name;
    destroyUnit(targetPlayer, candidate.index);
    log(game, `${targetName}を破壊した。`);
    after(true);
  }, () => after(false));
}

function chooseExhaustUnit(game, chooser, targetPlayer, after = () => {}) {
  return queueUnitTargetChoice(game, chooser, targetPlayer, (unit) => !unit.exhausted, {
    title: "行動済みにするユニットを選択",
    message: "次の相手ターン終了まで行動済みにする相手ユニットを選んでください。",
    confirmLabel: "決定",
  }, (candidate) => {
    const unit = targetPlayer.units[candidate.index];
    unit.exhausted = true;
    unit.exhaustedUntilOwnerTurnEnd = true;
    unit.exhaustedUntilOwnerTurnEndReady = false;
    log(game, `${cards[unit.id].name}を次のターン終了まで行動済みにした。`);
    after(true);
  }, () => after(false));
}

function queueReactionTargetChoice(game, chooser, targetPlayer, predicate, choice, handler, emptyHandler = () => {}) {
  const candidates = targetPlayer.reactions
    .map((entry, index) => ({ id: reactionId(entry), entry, index }))
    .filter((candidate) => candidate.id && predicate(candidate.entry, candidate.index));
  if (candidates.length === 0) {
    emptyHandler();
    return false;
  }

  game.pendingChoice = {
    id: makeId(8),
    seat: seatOf(game, chooser),
    zone: "reactionTarget",
    title: choice.title,
    message: choice.message,
    delayBeforeOpenMs: choice.delayBeforeOpenMs || 0,
    candidates,
    confirmLabel: choice.confirmLabel,
    resolve: handler,
    afterResolve: null,
  };
  return true;
}

function chooseRevealReaction(game, chooser, targetPlayer, after = () => {}) {
  return queueReactionTargetChoice(game, chooser, targetPlayer, (entry) => reactionId(entry) && !reactionRevealed(entry), {
    title: "公開するリアクションを選択",
    message: "公開状態にする相手のセットリアクションを選んでください。",
    confirmLabel: "決定",
  }, (candidate) => {
    const id = reactionId(targetPlayer.reactions[candidate.index]);
    targetPlayer.reactions[candidate.index] = { id, revealed: true };
    after(true);
  }, () => after(false));
}

function chooseRemoveRevealedReaction(game, chooser, targetPlayer, after = () => {}) {
  return queueReactionTargetChoice(game, chooser, targetPlayer, (entry) => reactionId(entry) && reactionRevealed(entry), {
    title: "墓地に送るリアクションを選択",
    message: "墓地に送る相手の公開リアクションを選んでください。",
    confirmLabel: "決定",
  }, (candidate) => {
    const id = reactionId(targetPlayer.reactions[candidate.index]);
    targetPlayer.reactions[candidate.index] = null;
    targetPlayer.grave.push(id);
    log(game, `${cards[id].name}を墓地に送った。`);
    after(true);
  }, () => after(false));
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

function chooseFromHandToCharge(game, player, predicate, choice, after = () => {}) {
  return queueChoice(game, player, "hand", player.hand, predicate, choice, (candidate) => {
    const [id] = player.hand.splice(candidate.index, 1);
    player.charge.push({ id, tapped: false });
    log(game, `${cards[id].name}をチャージに置いた。`);
    after(true);
  }, () => after(false));
}

function chooseFromGraveToCharge(game, player, predicate, choice, after = () => {}) {
  return queueChoice(game, player, "grave", player.grave, predicate, choice, (candidate) => {
    const [id] = player.grave.splice(candidate.index, 1);
    player.charge.push({ id, tapped: false });
    log(game, `${cards[id].name}を墓地からチャージに置いた。`);
    after(true);
  }, () => after(false));
}

function chooseSpecialSummonFromHand(game, player, predicate, choice, opponent = null, after = () => {}) {
  const slot = player.units.findIndex((unit) => !unit);
  if (slot === -1) {
    after(false);
    return false;
  }
  return queueChoice(game, player, "hand", player.hand, predicate, choice, (candidate) => {
    const [id] = player.hand.splice(candidate.index, 1);
    player.units[slot] = { id, exhausted: false, atkMod: 0 };
    log(game, `${cards[id].name}を追加召喚。`);
    resolveSpecialSummonEffect(game, player, opponent || opponentOf(game, player), id, () => {
      afterSummon(game, player, id);
      after(true);
    });
  }, () => after(false));
}

function resolveSpecialSummonEffect(game, player, opponent, id, after = () => {}) {
  const card = cards[id];
  if (!card?.specialEffect) {
    after(false);
    return false;
  }
  addActivation(game, card, seatOf(game, player), "effect");
  const resolveEffectAfterReactions = (negated) => {
    if (negated) {
      log(game, `${card.name}の追加召喚時効果は無効化された。`);
      after(false);
      return;
    }
    const pending = resolveEffect(game, card.specialEffect, player, opponent, card);
    if (pending) appendPendingAfter(game, () => after(true));
    else after(true);
  };
  if (queueReactionChoice(game, opponent, player, card, "effect", resolveEffectAfterReactions)) return true;
  resolveEffectAfterReactions(false);
  return true;
}

function chooseDiscardFromHand(game, player, choice, after = () => {}) {
  return queueChoice(game, player, "hand", player.hand, () => true, choice, (candidate) => {
    const [id] = player.hand.splice(candidate.index, 1);
    player.grave.push(id);
    log(game, `${cards[id].name}を墓地に送った。`);
    after(true);
  }, () => {
    after(false);
  });
}

function seatOf(game, player) {
  if (player === game.host) return "host";
  if (player === game.guest) return "guest";
  return null;
}

function opponentOf(game, player) {
  return player === game.host ? game.guest : game.host;
}

function completeTurn(game) {
  const player = game[game.active];
  player?.units.forEach((unit) => {
    if (!unit?.exhaustedUntilOwnerTurnEnd) return;
    if (!unit.exhaustedUntilOwnerTurnEndReady) return;
    unit.exhaustedUntilOwnerTurnEnd = false;
    unit.exhaustedUntilOwnerTurnEndReady = false;
    unit.exhausted = false;
  });
  game.completedTurns += 1;
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
  return revealed;
}

function removeRevealedReaction(game, player) {
  const index = player.reactions.findIndex((entry) => reactionId(entry) && reactionRevealed(entry));
  if (index === -1) return false;
  const id = reactionId(player.reactions[index]);
  player.reactions[index] = null;
  player.grave.push(id);
  log(game, `${cards[id].name}は墓地に送られた。`);
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
          delayBeforeOpenMs: 560,
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
      if (countThemeInCharge(player, "星導") >= 4) {
        return chooseDestroyUnit(game, player, opponent, (destroyed) => {
          if (destroyed) log(game, "星龍の光が相手ユニットを破壊。");
          else damage(game, opponent, 1200);
        });
      }
      damage(game, opponent, 1200);
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
    case "starNavigator":
      return chooseFromHandToCharge(game, player, (card) => card.name.includes("星導"), {
        title: "星導カードをチャージ",
        message: "手札からチャージに置く「星導」カードを選んでください。",
      }, (moved) => {
        if (!moved) return;
        chooseFromDeck(game, player, (card) => card.name.includes("星導"), {
          title: "星導カードをサーチ",
          message: "デッキから手札に加える「星導」カードを選んでください。",
        });
      });
    case "starChart":
      return chooseFromGraveToCharge(game, player, (card) => card.name.includes("星導"), {
        title: "星導カードをチャージ",
        message: "墓地からチャージに置く「星導」カードを選んでください。",
      }, () => {
        if (controlsThemeUnit(player, "星導")) untapOneCharge(player);
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
      return chooseExhaustUnit(game, player, opponent, () => {
        if (player.cores.some(Boolean)) damage(game, opponent, 700);
      });
    case "blackTower":
      damage(game, opponent, 600);
      break;
    case "blackRaid":
      damage(game, opponent, 800);
      if (controlsThemeUnit(player, "黒機")) return chooseExhaustUnit(game, player, opponent);
      break;
    case "bladeTracker":
      return chooseExhaustUnit(game, player, opponent, (exhausted) => {
        if (!exhausted) damage(game, opponent, 300);
      });
    case "bladeMarksmith":
      if (hasExhaustedUnit(opponent)) drawCards(player, 1, game);
      break;
    case "bladeEdgeguard":
      if (countThemeInCharge(player, "断刃") >= 2) return chooseExhaustUnit(game, player, opponent);
      break;
    case "bladeExecutioner":
      if (hasExhaustedUnit(opponent)) return chooseDestroyExhaustedUnit(game, player, opponent);
      return chooseExhaustUnit(game, player, opponent);
    case "bladeArbiter":
      if (countThemeInCharge(player, "断刃") >= 4) return chooseDestroyUnit(game, player, opponent);
      return chooseDestroyExhaustedUnit(game, player, opponent);
    case "bladeMark":
      return chooseExhaustUnit(game, player, opponent, () => {
        if (controlsThemeUnit(player, "断刃")) damage(game, opponent, 400);
      });
    case "bladeCleave":
      if (hasExhaustedUnit(opponent)) return chooseDestroyExhaustedUnit(game, player, opponent);
      return chooseExhaustUnit(game, player, opponent);
    case "bladeWarrant":
      return chooseFromDeck(game, player, (card) => card.type === "ユニット" && card.name.includes("断刃"), {
        title: "断刃ユニットをサーチ",
        message: "デッキから手札に加えるユニットを選んでください。",
      }, () => {
        if (hasExhaustedUnit(opponent)) drawCards(player, 1, game);
      });
    case "bladeScaffold":
      return chooseExhaustUnit(game, player, opponent);
    case "cyberMio":
      return chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.name.includes("電脳") && card.cost <= 1, {
        title: "電脳ユニットを追加召喚",
        message: "手札から追加召喚するユニットを選んでください。",
      }, opponent);
    case "cyberReiSpecial":
      return chooseFromDeck(game, player, (card) => card.type === "リアクション" && card.name.includes("電脳"), {
        title: "電脳リアクションをサーチ",
        message: "デッキから手札に加えるリアクションを選んでください。",
      });
    case "cyberShionSpecial": {
      const revealed = revealReactions(opponent, 1);
      if (revealed > 0) damage(game, opponent, 500);
      break;
    }
    case "cyberYuna":
      return chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.name.includes("電脳") && card.cost <= 2, {
        title: "電脳ユニットを追加召喚",
        message: "手札から追加召喚するユニットを選んでください。",
      }, opponent);
    case "cyberYunaSpecial":
      untapOneCharge(player);
      break;
    case "cyberAkariSpecial":
      drawCards(player, 2, game);
      return chooseDiscardFromHand(game, player, {
        title: "手札を1枚捨てる",
        message: "墓地に送るカードを選んでください。",
        delayBeforeOpenMs: 560,
      }, () => {
        removeRevealedReaction(game, opponent);
      });
    case "cyberPreview":
      return chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.name.includes("電脳") && card.cost <= 1, {
        title: "電脳ユニットを追加召喚",
        message: "手札から追加召喚するユニットを選んでください。",
      }, opponent, (moved) => {
        if (moved) drawCards(player, 1, game);
      });
    case "cyberIntrusion": {
      revealReactions(opponent, 1);
      if (countThemeUnits(player, "電脳") >= 2) {
        return chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.name.includes("電脳"), {
          title: "電脳ユニットを追加召喚",
          message: "手札から追加召喚するユニットを選んでください。",
          delayBeforeOpenMs: 560,
        }, opponent);
      }
      return false;
    }
    case "cyberNetwork":
      return chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.name.includes("電脳") && card.cost <= 1, {
        title: "電脳ユニットを追加召喚",
        message: "手札から追加召喚するユニットを選んでください。",
      }, opponent);
    case "cyberBackchannel":
      return chooseFromDeck(game, player, (card) => card.type === "リアクション" && (card.theme === "電脳" || !card.theme), {
        title: "リアクションをサーチ",
        message: "デッキから手札に加えるリアクションを選んでください。",
      }, () => {
        revealReactions(opponent, 1);
        if (opponent.reactions.some((entry) => reactionId(entry) && reactionRevealed(entry))) {
          chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.theme === "電脳" && card.cost <= 2, {
            title: "電脳ユニットを追加召喚",
            message: "手札から追加召喚する「電脳」ユニットを選んでください。",
            delayBeforeOpenMs: 560,
          }, opponent);
        }
      });
    case "probeDrone":
      if (revealReactions(opponent, 1) > 0) {
        return chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.theme === "電脳" && card.cost <= 2, {
          title: "電脳ユニットを追加召喚",
          message: "手札から追加召喚する「電脳」ユニットを選んでください。",
          delayBeforeOpenMs: 560,
        }, opponent);
      }
      break;
    case "sosaiHikari":
      return chooseFromDeck(game, player, (card) => card.id === "sosai_mint", {
        title: "ミントをサーチ",
        message: "デッキから手札に加えるミントを選んでください。",
      }, () => {
        if (controlsCard(player, "sosai_mint")) drawCards(player, 1, game);
      });
    case "sosaiMint": {
      revealReactions(opponent, 1);
      if (controlsCard(player, "sosai_hikari")) removeRevealedReaction(game, opponent);
      break;
    }
    case "sosaiNene":
      return chooseFromDeck(game, player, (card) => card.id === "sosai_ruri", {
        title: "ルリをサーチ",
        message: "デッキから手札に加えるルリを選んでください。",
      }, () => {
        if (controlsCard(player, "sosai_ruri")) chooseReturnUnitToHand(game, player, opponent);
      });
    case "sosaiRuri":
      return chooseFromDeck(game, player, (card) => card.id === "sosai_nene", {
        title: "ネネをサーチ",
        message: "デッキから手札に加えるネネを選んでください。",
      }, () => {
        if (controlsCard(player, "sosai_nene")) {
          damage(game, opponent, 700);
          drawCards(player, 1, game);
        }
      });
    case "sosaiCoco":
      return chooseFromDeck(game, player, (card) => card.id === "sosai_luna", {
        title: "ルナをサーチ",
        message: "デッキから手札に加えるルナを選んでください。",
      }, () => {
        if (controlsCard(player, "sosai_luna")) {
          untapOneCharge(player);
          drawCards(player, 1, game);
        }
      });
    case "sosaiLuna":
      damage(game, opponent, 700);
      if (controlsCard(player, "sosai_coco")) return chooseDestroyUnit(game, player, opponent);
      break;
    case "sosaiLiveStart":
      return chooseFromDeck(game, player, (card) => card.type === "ユニット" && card.name.includes("双彩"), {
        title: "双彩ユニットをサーチ",
        message: "デッキから手札に加えるユニットを選んでください。",
      }, () => {
        if (hasSosaiPair(player)) drawCards(player, 1, game);
      });
    case "sosaiHeartSync":
      return chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.name.includes("双彩") && card.cost <= 2, {
        title: "双彩ユニットを追加召喚",
        message: "手札から追加召喚するユニットを選んでください。",
      }, opponent, (moved) => {
        if (moved && hasSosaiPair(player)) drawCards(player, 1, game);
      });
    case "sosaiPopStage":
      drawCards(player, 1, game);
      break;
    case "drawDiscard":
      drawCards(player, 2, game);
      return chooseDiscardFromHand(game, player, {
        title: "手札を1枚捨てる",
        message: "墓地に送るカードを選んでください。",
        delayBeforeOpenMs: 560,
      });
    case "genericFieldNotes":
      drawCards(player, 1, game);
      if (!player.units.some(Boolean)) {
        return chooseFromHandToCharge(game, player, () => true, {
          title: "手札をチャージ",
          message: "手札からチャージに置くカードを選んでください。",
        });
      }
      break;
    case "bindUnit":
      return chooseExhaustUnit(game, player, opponent, () => {
        damage(game, opponent, 500);
      });
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
  player.units.forEach((unit) => {
    if (!unit) return;
    if (unit.exhaustedUntilOwnerTurnEnd) {
      unit.exhausted = true;
      unit.exhaustedUntilOwnerTurnEndReady = true;
      return;
    }
    unit.exhausted = false;
  });
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
  if (cardHasTheme(cards[id], "星導") && player.cores.includes("star_orbit") && !player.drewFromStarCore) {
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
      delayBeforeOpenMs: 560,
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

function returnBestUnitToHand(game, player) {
  const target = player.units
    .map((unit, index) => ({ unit, index }))
    .filter((entry) => entry.unit)
    .sort((a, b) => getUnitAtk(player, b.unit, game) - getUnitAtk(player, a.unit, game))[0];
  if (!target) return false;
  const targetName = cards[target.unit.id].name;
  player.hand.push(target.unit.id);
  player.units[target.index] = null;
  log(game, `${targetName}を手札に戻した。`);
  return true;
}

function destroyBestExhaustedUnit(game, player) {
  const target = player.units
    .map((unit, index) => ({ unit, index }))
    .filter((entry) => entry.unit && entry.unit.exhausted)
    .sort((a, b) => getUnitAtk(player, b.unit, game) - getUnitAtk(player, a.unit, game))[0];
  if (!target) return false;
  const targetName = cards[target.unit.id].name;
  destroyUnit(player, target.index);
  log(game, `${targetName}を破壊した。`);
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

function hasExhaustedUnit(player) {
  return player.units.some((unit) => unit && unit.exhausted);
}

function hasSetReaction(player) {
  return player.reactions.some((entry) => reactionId(entry));
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
  return player.charge.filter((entry) => cardHasTheme(cards[entry.id], theme)).length;
}

function countThemeUnits(player, theme) {
  return player.units.filter((unit) => unit && cardHasTheme(cards[unit.id], theme)).length;
}

function controlsCard(player, id) {
  return player.units.some((unit) => unit?.id === id);
}

function hasSosaiPair(player) {
  return (
    player.units.some((unit) => unit && SOSAI_DRIVE_PAIR_IDS.includes(unit.id)) ||
    SOSAI_PAIRS.some(([first, second]) => controlsCard(player, first) && controlsCard(player, second))
  );
}

function hasSosaiPairMate(player, id) {
  if (SOSAI_DRIVE_PAIR_IDS.includes(id)) return true;
  return SOSAI_PAIRS.some(([first, second]) => (
    (id === first && controlsCard(player, second)) ||
    (id === second && controlsCard(player, first))
  ));
}

function controlsThemeUnit(player, theme) {
  return player.units.some((unit) => unit && cardHasTheme(cards[unit.id], theme));
}

function getUnitAtk(player, unit, game = null) {
  if (!unit) return 0;
  let atk = cards[unit.id].atk + (unit.atkMod || 0);
  if (player.cores.includes("black_tower") && cardHasTheme(cards[unit.id], "黒機")) atk += 200;
  if (cards[unit.id].id === "star_guard") atk += player.cores.filter(Boolean).length * 300;
  if (player.cores.includes("blade_scaffold") && cardHasTheme(cards[unit.id], "断刃")) atk += 200;
  if (player.cores.includes("cyber_network") && cardHasTheme(cards[unit.id], "電脳")) atk += 100;
  if (player.cores.includes("sosai_pop_stage") && cardHasTheme(cards[unit.id], "双彩") && hasSosaiPairMate(player, unit.id)) atk += 300;
  if (player.cores.includes("drive_star_core") && cardHasTheme(cards[unit.id], "星導")) atk += 300;
  if (player.cores.includes("drive_black_core") && cardHasTheme(cards[unit.id], "黒機")) atk += 300;
  if (player.cores.includes("drive_blade_core") && cardHasTheme(cards[unit.id], "断刃")) atk += 300;
  if (player.cores.includes("drive_cyber_core") && cardHasTheme(cards[unit.id], "電脳")) atk += 200;
  if (player.cores.includes("drive_sosai_core") && cardHasTheme(cards[unit.id], "双彩") && hasSosaiPairMate(player, unit.id)) atk += 500;
  return atk;
}

function cardHasTheme(card, theme) {
  return Boolean(card && (card.theme === theme || card.name.includes(theme)));
}

function damage(game, player, amount) {
  const dealt = amount;
  player.lp = Math.max(0, player.lp - dealt);
  return dealt;
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
    firstActive: game.firstActive === seat ? "player" : "enemy",
    completedTurns: game.completedTurns || 0,
    active: game.active === seat ? "player" : "enemy",
    finished: game.finished,
    won: game.finished ? game.winner === seat : false,
    pendingChoice: publicPendingChoice(game.pendingChoice, seat),
    waitingChoice: publicWaitingChoice(game.pendingChoice, seat),
    activationEvents: publicActivationEvents(game.activationEvents, seat),
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
    confirmLabel: choice.confirmLabel,
    passLabel: choice.passLabel,
    delayBeforeOpenMs: choice.delayBeforeOpenMs || 0,
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

function publicActivationEvents(events = [], seat) {
  return events.map((event) => ({
    eventId: event.eventId,
    id: event.cardId,
    kind: event.kind,
    owner: event.seat === seat ? "player" : "enemy",
  }));
}

function publicDuelist(player, includeHand) {
  return {
    name: player.name,
    lp: player.lp,
    deck: Array(player.deck.length).fill(null),
    driveDeck: includeHand ? player.driveDeck.slice() : Array(player.driveDeck.length).fill(null),
    driveUsed: player.driveUsed.slice(),
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

function addActivation(game, card, seat, kind) {
  if (!game || !card?.id) return;
  game.activationEvents = game.activationEvents || [];
  game.activationEvents.push({
    eventId: makeId(8),
    cardId: card.id,
    seat,
    kind,
  });
  if (game.activationEvents.length > 40) game.activationEvents.shift();
}

function log(game, message) {
  game.logItems.push(message);
  if (game.logItems.length > 80) game.logItems.shift();
}

function validateDeck(deck) {
  if (!Array.isArray(deck) || deck.length === 0) throw new Error("deck is required");
  const valid = deck.filter((id) => cards[id] && !isDriveCard(cards[id]) && cards[id].type !== "環境");
  if (valid.length !== DECK_SIZE) throw new Error(`deck must be ${DECK_SIZE} cards`);
  return valid;
}

function validateDriveDeck(driveDeck) {
  if (!Array.isArray(driveDeck) || driveDeck.length === 0) throw new Error("drive deck is required");
  const valid = driveDeck.filter((id) => isDriveCard(cards[id]));
  if (valid.length !== DRIVE_DECK_SIZE) throw new Error(`drive deck must be ${DRIVE_DECK_SIZE} cards`);
  const counts = {};
  valid.forEach((id) => {
    counts[id] = (counts[id] || 0) + 1;
  });
  if (Object.values(counts).some((count) => count > MAX_DRIVE_COPIES)) {
    throw new Error(`drive card copies must be ${MAX_DRIVE_COPIES}`);
  }
  return valid;
}

function isDriveCard(card) {
  return Boolean(card?.driveKind || card?.type?.includes("ドライブ"));
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

function loadAccounts() {
  try {
    const saved = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
    if (saved && typeof saved === "object") return saved.accounts || saved;
  } catch {
    return {};
  }
  return {};
}

function saveAccounts(accounts) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify({ accounts }, null, 2), "utf8");
}

async function loadAccount(name) {
  if (db) return db.loadAccount(name);
  return loadAccounts()[name] || null;
}

async function saveAccount(name, account) {
  if (db) {
    await db.saveAccount(name, account);
    return;
  }
  const accounts = loadAccounts();
  accounts[name] = account;
  saveAccounts(accounts);
}

function createAccountDb() {
  if (!DATABASE_URL) return null;
  let Pool;
  try {
    ({ Pool } = require("pg"));
  } catch (error) {
    console.warn("DATABASE_URL is set, but the pg package is not installed. Falling back to accounts.json.", error.message);
    return null;
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
  });
  const ready = pool.query(`
    create table if not exists chrono_accounts (
      name text primary key,
      account jsonb not null,
      updated_at timestamptz not null default now()
    )
  `).catch((error) => {
    console.error("Failed to initialize Postgres account store:", error.message);
    throw error;
  });

  return {
    async loadAccount(name) {
      await ready;
      const result = await pool.query("select account from chrono_accounts where name = $1", [name]);
      return result.rows[0]?.account || null;
    },
    async saveAccount(name, account) {
      await ready;
      await pool.query(
        `insert into chrono_accounts (name, account, updated_at)
         values ($1, $2::jsonb, now())
         on conflict (name)
         do update set account = excluded.account, updated_at = now()`,
        [name, JSON.stringify(account)],
      );
    },
  };
}

function sanitizeAccountRecord(name, account = {}) {
  return {
    name,
    activeDeckId: sanitizeId(account.activeDeckId || "main"),
    gems: Math.max(0, Math.floor(Number(account.gems) || 0)),
    dust: Math.max(0, Math.floor(Number(account.dust) || 0)),
    collection: sanitizeCounts(account.collection),
    collectionRoyal: sanitizeCounts(account.collectionRoyal),
    decks: sanitizeDecks(account.decks),
  };
}

function mergeAccountRecord(name, current, incoming) {
  if (!current) return incoming;
  return sanitizeAccountRecord(name, {
    ...current,
    ...incoming,
    gems: Math.max(0, Math.floor(Number(incoming.gems) || 0)),
    dust: Math.max(0, Math.floor(Number(incoming.dust) || 0)),
    collection: incoming.collection || current.collection,
    collectionRoyal: incoming.collectionRoyal || current.collectionRoyal,
    decks: { ...(current.decks || {}), ...(incoming.decks || {}) },
    activeDeckId: incoming.activeDeckId || current.activeDeckId,
  });
}

function sanitizeCounts(source = {}) {
  const result = {};
  Object.entries(source || {}).forEach(([id, count]) => {
    if (!cards[id]) return;
    const safeCount = Math.max(0, Math.floor(Number(count) || 0));
    if (safeCount > 0) result[id] = safeCount;
  });
  return result;
}

function sanitizeDecks(source = {}) {
  const result = {};
  Object.entries(source || {}).forEach(([rawId, deck]) => {
    const id = sanitizeId(rawId);
    const mainDeck = trimDeckCounts(sanitizeCounts(deck.mainDeck || deck.counts), DECK_SIZE);
    const driveDeck = trimDeckCounts(sanitizeCounts(deck.driveDeck || deck.driveCounts), DRIVE_DECK_SIZE);
    const mainDeckRoyal = trimDeckCounts(sanitizeCounts(deck.mainDeckRoyal || deck.royalCounts), DECK_SIZE);
    const driveDeckRoyal = trimDeckCounts(sanitizeCounts(deck.driveDeckRoyal || deck.driveRoyalCounts), DRIVE_DECK_SIZE);
    result[id] = {
      id,
      name: String(deck.name || "メインデッキ").trim().slice(0, 32) || "メインデッキ",
      mainDeck,
      driveDeck,
      mainDeckRoyal,
      driveDeckRoyal,
      updatedAt: String(deck.updatedAt || new Date().toISOString()),
    };
  });
  return result;
}

function trimDeckCounts(source, size) {
  const result = {};
  let total = 0;
  Object.entries(source || {}).some(([id, count]) => {
    const room = size - total;
    if (room <= 0) return true;
    const add = Math.min(count, room);
    if (add > 0) {
      result[id] = add;
      total += add;
    }
    return false;
  });
  return result;
}

function mergeMaxCounts(a = {}, b = {}) {
  const result = {};
  [...Object.keys(a || {}), ...Object.keys(b || {})].forEach((id) => {
    if (!cards[id]) return;
    const count = Math.max(Number(a[id]) || 0, Number(b[id]) || 0);
    if (count > 0) result[id] = count;
  });
  return result;
}

function normalizeAccountName(name) {
  return String(name || "Player").trim().replace(/\s+/g, " ").slice(0, 24) || "Player";
}

function sanitizeId(id) {
  return String(id || "main").replace(/[^a-zA-Z0-9_-]/g, "_") || "main";
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
