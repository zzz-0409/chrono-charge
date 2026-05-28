const http = require("http");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8787);
const ACCOUNTS_FILE = path.join(ROOT, "accounts.json");
const DATABASE_URL = process.env.DATABASE_URL || "";
const db = createAccountDb();
const DEVELOPER_USERNAME = "zzz0409";
const DEVELOPER_PASSWORD = process.env.DEVELOPER_PASSWORD || "Pe933086";
const KEEPALIVE_INTERVAL_MS = Math.max(60_000, Number(process.env.KEEPALIVE_INTERVAL_MS || 300_000));
const KEEPALIVE_URLS = keepAliveUrls();
const MAX_LP = 8000;
const UNIT_ZONES = 5;
const CORE_ZONES = 2;
const REACTION_ZONES = 3;
const RANKED_INITIAL_POINTS = 1000;
const RANKED_WIN_DELTA = 30;
const RANKED_LOSS_DELTA = -18;
const RANKED_WAITING_TTL_MS = 10 * 60 * 1000;
const RANKED_CPU_FALLBACK_MS = 15 * 1000;
const RANKED_DISCONNECT_GRACE_MS = 30 * 1000;
const RANKED_LEADERBOARD_LIMIT = 50;
const DAILY_LOGIN_BONUS_GEMS = 1000;
const LOGIN_BONUS_CYCLE_DAYS = 10;

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
  console.log(`Chrono Drive server: http://localhost:${PORT}`);
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
  if (url.pathname === "/api/auth/register") {
    await handleRegisterApi(req, res);
    return;
  }

  if (url.pathname === "/api/auth/login") {
    await handleLoginApi(req, res);
    return;
  }

  if (url.pathname === "/api/auth/logout") {
    await handleLogoutApi(req, res);
    return;
  }

  if (url.pathname === "/api/account") {
    await handleAuthenticatedAccountApi(req, res);
    return;
  }

  if (url.pathname === "/api/ranked/queue") {
    await handleRankedQueueApi(req, res);
    return;
  }

  if (url.pathname === "/api/ranked/resume") {
    await handleRankedResumeApi(req, res);
    return;
  }

  if (url.pathname === "/api/ranked/leaderboard") {
    await handleRankedLeaderboardApi(req, res);
    return;
  }

  if (url.pathname === "/api/accounts") {
    sendJson(res, 410, { error: "password login is required" });
    return;
  }

  const accountMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)$/);
  if (accountMatch) {
    sendJson(res, 410, { error: "password login is required" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/rooms") {
    const body = await readJson(req);
    const deck = validateDeck(body.deck);
    const driveDeck = validateDriveDeck(body.driveDeck);
    const playerName = normalizeAccountName(body.playerName || body.displayName || "Player");
    const room = createRoom(deck, driveDeck, playerName);
    sendJson(res, 200, {
      roomId: room.id,
      playerId: room.players.host.id,
      seat: "host",
      mode: room.mode,
      ranked: Boolean(room.ranked),
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
    if (room.mode === "ranked") {
      sendJson(res, 403, { error: "use ranked matchmaking" });
      return;
    }
    const body = await readJson(req);
    if (room.players.guest) {
      sendJson(res, 409, { error: "room is full" });
      return;
    }
    room.players.guest = {
      id: makeId(12),
      name: normalizeAccountName(body.playerName || body.displayName || "Player"),
      deck: validateDeck(body.deck),
      driveDeck: validateDriveDeck(body.driveDeck),
    };
    startRoomGame(room);
    sendJson(res, 200, {
      roomId: room.id,
      playerId: room.players.guest.id,
      seat: "guest",
      mode: room.mode,
      ranked: Boolean(room.ranked),
      matched: true,
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
    await prepareRoomForSeat(room, seat);
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
    touchRankedSeat(room, seat);
    await applyAction(room, seat, body.action || {});
    sendJson(res, 200, roomSnapshot(room, seat));
    return;
  }

  sendJson(res, 404, { error: "not found" });
}

async function handleRegisterApi(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method not allowed" });
    return;
  }
  const body = await readJson(req);
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  const displayName = normalizeAccountName(body.displayName || "Player");
  if (!username || password.length < 4) {
    sendJson(res, 400, { error: "username and password are required" });
    return;
  }
  if (isDeveloperUsername(username) && password !== DEVELOPER_PASSWORD) {
    sendJson(res, 403, { error: "invalid developer password" });
    return;
  }

  const current = await loadAccount(username);
  if (current) {
    sendJson(res, 409, { error: "username already exists" });
    return;
  }

  const account = sanitizeAccountRecord(username, {
    ...createDefaultAccountRecord(username, displayName),
    username,
    displayName,
    passwordHash: hashPassword(password),
  });
  const loginBonus = applyDailyLoginBonus(account);
  const token = applySessionToken(account);
  await saveAccount(username, account);
  sendJson(res, 200, { account: publicAccount(account), token, loginBonus });
}

async function handleLoginApi(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method not allowed" });
    return;
  }
  const body = await readJson(req);
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  let account = await loadAccount(username);

  if (!account && isDeveloperUsername(username) && password === DEVELOPER_PASSWORD) {
    account = sanitizeAccountRecord(username, {
      ...createDefaultAccountRecord(username, username),
      passwordHash: hashPassword(password),
    });
  }
  if (account && !account.passwordHash && isDeveloperUsername(username) && password === DEVELOPER_PASSWORD) {
    account = sanitizeAccountRecord(username, {
      ...account,
      username,
      displayName: account.displayName || account.name || username,
      passwordHash: hashPassword(password),
    });
  }

  if (!account?.passwordHash || (isDeveloperUsername(username) && password !== DEVELOPER_PASSWORD) || !verifyPassword(password, account.passwordHash)) {
    sendJson(res, 401, { error: "invalid username or password" });
    return;
  }

  account = sanitizeAccountRecord(username, account);
  const loginBonus = applyDailyLoginBonus(account);
  const token = applySessionToken(account);
  await saveAccount(username, account);
  sendJson(res, 200, { account: publicAccount(account), token, loginBonus });
}

async function handleLogoutApi(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method not allowed" });
    return;
  }
  const auth = await authenticateRequest(req);
  if (auth) {
    delete auth.account.sessionTokenHash;
    delete auth.account.sessionIssuedAt;
    await saveAccount(auth.username, auth.account);
  }
  sendJson(res, 200, { ok: true });
}

async function handleAuthenticatedAccountApi(req, res) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    sendJson(res, 401, { error: "login required" });
    return;
  }

  if (req.method === "GET") {
    const loginBonus = applyDailyLoginBonus(auth.account);
    if (loginBonus) {
      await saveAccount(auth.username, auth.account);
    }
    sendJson(res, 200, { account: publicAccount(auth.account), loginBonus });
    return;
  }

  if (req.method === "PUT" || req.method === "POST") {
    const body = await readJson(req);
    const incoming = sanitizeAccountRecord(auth.username, {
      ...auth.account,
      ...(body.account || body || {}),
      username: auth.username,
      displayName: normalizeAccountName((body.account || body || {}).displayName || auth.account.displayName || auth.username),
      passwordHash: auth.account.passwordHash,
      sessionTokenHash: auth.account.sessionTokenHash,
      sessionIssuedAt: auth.account.sessionIssuedAt,
    });
    const account = mergeAccountRecord(auth.username, auth.account, incoming);
    account.passwordHash = auth.account.passwordHash;
    account.sessionTokenHash = auth.account.sessionTokenHash;
    account.sessionIssuedAt = auth.account.sessionIssuedAt;
    await saveAccount(auth.username, account);
    sendJson(res, 200, { account: publicAccount(account) });
    return;
  }

  sendJson(res, 405, { error: "method not allowed" });
}

async function handleRankedQueueApi(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method not allowed" });
    return;
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    sendJson(res, 401, { error: "login required" });
    return;
  }

  const body = await readJson(req);
  const deck = validateDeck(body.deck);
  const driveDeck = validateDriveDeck(body.driveDeck);
  const playerName = normalizeAccountName(body.playerName || body.displayName || auth.account.displayName || auth.username);
  const rankedRecord = sanitizeRankedRecord(auth.account.ranked);

  cleanupRankedWaitingRooms();
  removeRankedWaitingRoomsFor(auth.username);

  const waitingRoom = findRankedWaitingRoom(auth.username);
  if (waitingRoom) {
    waitingRoom.players.guest = {
      id: makeId(12),
      name: playerName,
      account: auth.username,
      deck,
      driveDeck,
    };
    waitingRoom.ranked.accounts.guest = auth.username;
    waitingRoom.ranked.profiles.guest = rankedProfile({
      username: auth.username,
      name: playerName,
      points: rankedRecord.points,
    });
    touchRankedSeat(waitingRoom, "guest");
    startRoomGame(waitingRoom);
    sendJson(res, 200, {
      roomId: waitingRoom.id,
      playerId: waitingRoom.players.guest.id,
      seat: "guest",
      mode: "ranked",
      ranked: true,
      matched: true,
    });
    return;
  }

  const room = createRoom(deck, driveDeck, playerName, {
    mode: "ranked",
    hostUsername: auth.username,
    hostRankedPoints: rankedRecord.points,
  });
  sendJson(res, 200, {
    roomId: room.id,
    playerId: room.players.host.id,
    seat: "host",
    mode: "ranked",
    ranked: true,
    matched: false,
  });
}

async function handleRankedResumeApi(req, res) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    sendJson(res, 401, { error: "login required" });
    return;
  }

  const found = findRankedRoomForAccount(auth.username);
  if (!found) {
    sendJson(res, 200, { room: null });
    return;
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    if (body.action === "abandon" && found.room.game && !found.room.game.finished) {
      await finishRankedRoomByForfeit(found.room, found.seat);
    }
  } else if (req.method !== "GET") {
    sendJson(res, 405, { error: "method not allowed" });
    return;
  }

  touchRankedSeat(found.room, found.seat);
  await prepareRoomForSeat(found.room, found.seat);
  sendJson(res, 200, { room: rankedResumePayload(found.room, found.seat) });
}

async function handleRankedLeaderboardApi(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "method not allowed" });
    return;
  }

  const accounts = await listAccountRecords();
  const entries = accounts
    .map((account) => {
      const clean = sanitizeAccountRecord(account.username || account.name, account);
      const ranked = sanitizeRankedRecord(clean.ranked);
      return {
        username: clean.username,
        displayName: clean.displayName || clean.name || clean.username,
        rank: rankName(ranked.points),
        points: ranked.points,
        wins: ranked.wins,
        losses: ranked.losses,
        streak: ranked.streak,
        bestPoints: ranked.bestPoints,
        updatedAt: ranked.updatedAt,
      };
    })
    .sort((a, b) => (
      b.points - a.points ||
      b.wins - a.wins ||
      a.losses - b.losses ||
      a.username.localeCompare(b.username)
    ))
    .slice(0, RANKED_LEADERBOARD_LIMIT)
    .map((entry, index) => ({ ...entry, place: index + 1 }));

  sendJson(res, 200, { entries, limit: RANKED_LEADERBOARD_LIMIT });
}

function createRoom(deck, driveDeck, playerName = "Player", options = {}) {
  let id = "";
  do {
    id = makeId(5);
  } while (rooms.has(id));
  const mode = options.mode === "ranked" ? "ranked" : "room";
  const hostUsername = normalizeUsername(options.hostUsername);
  const hostRankedPoints = rankedPointsValue(options.hostRankedPoints);
  const now = Date.now();
  const room = {
    id,
    mode,
    status: "waiting",
    createdAt: now,
    version: 1,
    players: {
      host: { id: makeId(12), name: normalizeAccountName(playerName), account: hostUsername, deck, driveDeck },
      guest: null,
    },
    game: null,
    ranked: mode === "ranked"
      ? {
        accounts: { host: hostUsername, guest: "" },
        profiles: {
          host: rankedProfile({
            username: hostUsername,
            name: playerName,
            points: hostRankedPoints,
          }),
          guest: null,
        },
        lastSeenAt: { host: now, guest: 0 },
        cpuSeat: "",
        reported: false,
        results: {},
      }
      : null,
    logItems: [
      mode === "ranked"
        ? "マッチング中 0秒"
        : `ルーム ${id} を作成しました。友達にIDを伝えてください。`,
    ],
  };
  rooms.set(id, room);
  return room;
}

function startRoomGame(room) {
  const firstActive = Math.random() < 0.5 ? "host" : "guest";
  const modeLabel = room.mode === "ranked" ? "ランク戦" : "ルーム";
  room.game = {
    turn: 1,
    active: firstActive,
    firstActive,
    openingTurn: true,
    completedTurns: 0,
    activationEvents: [],
    soundEvents: [],
    finished: false,
    winner: null,
    pendingChoice: null,
    host: newDuelist(room.players.host.name || "Host", room.players.host.deck, room.players.host.driveDeck),
    guest: newDuelist(room.players.guest.name || "Guest", room.players.guest.deck, room.players.guest.driveDeck),
    logItems: [
      `${modeLabel} ${room.id}: オンラインデュエル開始。`,
      `先攻は${firstActive === "host" ? "ホスト" : "ゲスト"}です。`,
    ],
  };
  drawCards(room.game.host, 5, room.game);
  drawCards(room.game.guest, 5, room.game);
  refreshTurn(room.game[firstActive]);
  room.status = "playing";
  room.version += 1;
}

function findRankedWaitingRoom(username) {
  for (const room of rooms.values()) {
    if (room.mode !== "ranked" || room.status !== "waiting" || !room.ranked || room.players.guest) continue;
    if (room.ranked.accounts.host === username) continue;
    return room;
  }
  return null;
}

function removeRankedWaitingRoomsFor(username) {
  for (const [id, room] of rooms.entries()) {
    if (room.mode !== "ranked" || room.status !== "waiting") continue;
    if (room.ranked?.accounts?.host === username) rooms.delete(id);
  }
}

function cleanupRankedWaitingRooms() {
  const now = Date.now();
  for (const [id, room] of rooms.entries()) {
    if (room.mode === "ranked" && room.status === "waiting" && now - Number(room.createdAt || now) > RANKED_WAITING_TTL_MS) {
      rooms.delete(id);
    }
  }
}

async function prepareRoomForSeat(room, seat) {
  touchRankedSeat(room, seat);
  maybeStartRankedCpuFallback(room);
  await advanceRankedCpu(room);
  await finalizeRankedRoom(room);
}

function touchRankedSeat(room, seat) {
  if (!room?.ranked || !seat || isRankedCpuSeat(room, seat)) return;
  room.ranked.lastSeenAt = room.ranked.lastSeenAt || {};
  room.ranked.lastSeenAt[seat] = Date.now();
}

function rankedProfile(options = {}) {
  const username = normalizeUsername(options.username);
  const points = rankedPointsValue(options.points);
  return {
    username,
    name: normalizeAccountName(options.name || username || "CPU"),
    points,
    cpu: Boolean(options.cpu),
    aiLevel: Math.max(1, Math.min(5, Math.floor(Number(options.aiLevel) || rankedCpuAiLevel(points)))),
  };
}

function rankedPointsValue(value, fallback = RANKED_INITIAL_POINTS) {
  const numeric = Number(value);
  return Math.max(0, Math.floor(Number.isFinite(numeric) ? numeric : fallback));
}

function maybeStartRankedCpuFallback(room) {
  if (!room?.ranked || room.status !== "waiting" || room.players.guest) return false;
  if (Date.now() - Number(room.createdAt || Date.now()) < RANKED_CPU_FALLBACK_MS) return false;
  const hostProfile = room.ranked.profiles?.host || rankedProfile({ points: RANKED_INITIAL_POINTS, name: "Player" });
  const cpuProfile = chooseRankedCpuProfile(hostProfile.points);
  room.players.guest = {
    id: makeId(12),
    name: cpuProfile.name,
    account: "",
    deck: cpuProfile.deck,
    driveDeck: cpuProfile.driveDeck,
    cpu: true,
  };
  room.ranked.accounts.guest = "";
  room.ranked.profiles.guest = rankedProfile(cpuProfile);
  room.ranked.cpuSeat = "guest";
  room.ranked.lastSeenAt.guest = Number.POSITIVE_INFINITY;
  startRoomGame(room);
  log(room.game, `${cpuProfile.name}がマッチングに参加しました。`);
  room.version += 1;
  return true;
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
    abyss: [],
    charge: [],
    units: Array(UNIT_ZONES).fill(null),
    cores: Array(CORE_ZONES).fill(null),
    reactions: Array(REACTION_ZONES).fill(null),
    chargedThisTurn: false,
    drewFromStarCore: false,
    shiftedThisTurn: false,
  };
}

async function applyAction(room, seat, action) {
  const game = room.game;
  if (!game || game.finished) return;

  if (action.type === "claimDisconnectWin") {
    if (canClaimDisconnectWin(room, seat)) {
      await finishRankedRoomByDisconnect(room, seat);
    }
    return;
  }

  if (game.pendingChoice) {
    if (action.type === "choice" && game.pendingChoice.seat === seat) {
      resolvePendingChoice(game, action);
      checkGameEnd(game);
      await advanceRankedCpu(room);
      await finalizeRankedRoom(room);
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
  await advanceRankedCpu(room);
  await finalizeRankedRoom(room);
  room.version += 1;
}

function actionSlotIndex(action) {
  if (action.slotIndex === null || action.slotIndex === undefined) return null;
  const slot = Number(action.slotIndex);
  return Number.isInteger(slot) ? slot : null;
}

async function advanceRankedCpu(room) {
  if (!room?.ranked || !room.game || room.game.finished) return;
  const cpuSeat = room.ranked.cpuSeat;
  if (!cpuSeat || room.game.active !== cpuSeat) return;

  const game = room.game;
  let safety = 0;
  while (!game.finished && game.active === cpuSeat && safety < 60) {
    safety += 1;
    if (game.pendingChoice) {
      if (game.pendingChoice.seat !== cpuSeat) break;
      resolveCpuPendingChoice(room);
      checkGameEnd(game);
      continue;
    }

    const acted = runRankedCpuTurnSlice(room);
    checkGameEnd(game);
    if (!acted || game.pendingChoice) break;
  }

  if (safety >= 60 && !game.finished && game.active === cpuSeat && !game.pendingChoice) {
    endTurn(game);
  }
  await finalizeRankedRoom(room);
  room.version += 1;
}

function runRankedCpuTurnSlice(room) {
  const game = room.game;
  const cpuSeat = room.ranked.cpuSeat;
  const cpu = game[cpuSeat];
  const opponentSeat = cpuSeat === "host" ? "guest" : "host";
  const opponent = game[opponentSeat];
  const profile = room.ranked.profiles?.[cpuSeat] || rankedProfile({ cpu: true });
  const aiLevel = profile.aiLevel || rankedCpuAiLevel(profile.points);

  if (!cpu.chargedThisTurn && shouldCpuCharge(cpu, aiLevel)) {
    const index = chooseCpuChargeIndex(cpu, aiLevel);
    if (chargeFromHand(game, cpu, index)) {
      resolveCpuPendingChoice(room);
      return true;
    }
  }

  if (setCpuReactions(game, cpu, aiLevel)) return true;

  const playLimit = cpuPlayLimit(aiLevel);
  for (let i = 0; i < playLimit; i += 1) {
    const move = chooseCpuPlay(cpu, aiLevel);
    if (!move) break;
    if (playFromHand(game, cpu, opponent, move.index, cpuSeat)) {
      resolveCpuPendingChoice(room);
      return true;
    }
  }

  const attack = chooseCpuAttack(game, cpu, opponent, aiLevel);
  if (attack) {
    attackWithUnit(game, cpu, opponent, attack.attackerIndex, attack.targetIndex);
    resolveCpuPendingChoice(room);
    return true;
  }

  endTurn(game);
  return true;
}

function resolveCpuPendingChoice(room) {
  const game = room.game;
  const cpuSeat = room.ranked.cpuSeat;
  let safety = 0;
  while (game.pendingChoice && game.pendingChoice.seat === cpuSeat && safety < 20) {
    safety += 1;
    const choice = game.pendingChoice;
    resolvePendingChoice(game, {
      type: "choice",
      choiceId: choice.id,
      index: chooseCpuChoiceIndex(room, choice),
    });
  }
}

function shouldCpuCharge(cpu, aiLevel) {
  if (!cpu.hand.length) return false;
  if (cpu.hand.length === 1 && aiLevel >= 3 && canCpuUseHandCard(cpu, cpu.hand[0])) return false;
  if (aiLevel <= 1 && Math.random() < 0.22) return false;
  return true;
}

function chooseCpuChargeIndex(cpu, aiLevel) {
  const entries = cpu.hand.map((id, index) => ({ id, index, card: cards[id] })).filter((entry) => entry.card);
  if (entries.length === 0) return 0;
  if (aiLevel <= 2 && Math.random() < 0.35) return entries[Math.floor(Math.random() * entries.length)].index;
  const reaction = entries.find((entry) => entry.card.type === "リアクション" && cpu.charge.length < 2);
  if (reaction) return reaction.index;
  return entries.slice().sort((a, b) => (b.card.cost || 0) - (a.card.cost || 0))[0].index;
}

function canCpuUseHandCard(cpu, id) {
  const card = cards[id];
  if (!card) return false;
  if (card.type === "リアクション") return cpu.reactions.some((entry) => !entry);
  return canPlayCard(cpu, card) && canPay(cpu, card.cost);
}

function setCpuReactions(game, cpu, aiLevel) {
  if (aiLevel <= 1 && Math.random() < 0.35) return false;
  const slot = cpu.reactions.findIndex((entry) => !entry);
  if (slot === -1) return false;
  const index = cpu.hand.findIndex((id) => cards[id]?.type === "リアクション");
  if (index === -1) return false;
  setReaction(game, cpu, index, slot);
  return true;
}

function chooseCpuPlay(cpu, aiLevel) {
  const playable = cpu.hand
    .map((id, index) => ({ id, index, card: cards[id] }))
    .filter((entry) => entry.card && entry.card.type !== "リアクション" && canPlayCard(cpu, entry.card) && canPay(cpu, entry.card.cost));
  if (playable.length === 0) return null;
  if (aiLevel <= 1 && Math.random() < 0.28) return null;
  if (aiLevel <= 2 && Math.random() < 0.35) return playable[Math.floor(Math.random() * playable.length)];
  return playable
    .slice()
    .sort((a, b) => cpuPlayScore(b.card, aiLevel) - cpuPlayScore(a.card, aiLevel))[0];
}

function cpuPlayScore(card, aiLevel) {
  const typeBonus = card.type === "コア" ? 18 : card.type === "ユニット" ? 14 : 10;
  const effectBonus = card.effect ? 8 : 0;
  const atkBonus = Math.floor((card.atk || 0) / 200);
  return typeBonus + effectBonus + atkBonus + (card.cost || 0) * (aiLevel >= 4 ? 4 : 2);
}

function cpuPlayLimit(aiLevel) {
  if (aiLevel >= 5) return 7;
  if (aiLevel >= 4) return 5;
  if (aiLevel >= 3) return 4;
  return 2;
}

function chooseCpuAttack(game, cpu, opponent, aiLevel) {
  if (!canAttack(game, cpu)) return null;
  const attackers = cpu.units
    .map((unit, index) => ({ unit, index }))
    .filter((entry) => entry.unit && !entry.unit.exhausted);
  if (attackers.length === 0) return null;

  for (const attacker of attackers) {
    const targetIndex = chooseCpuAttackTarget(game, cpu, attacker.unit, opponent, aiLevel);
    if (targetIndex !== undefined) return { attackerIndex: attacker.index, targetIndex };
  }
  return null;
}

function chooseCpuAttackTarget(game, cpu, attacker, opponent, aiLevel) {
  const attackerAtk = getUnitAtk(cpu, attacker, game);
  const targets = opponent.units
    .map((unit, index) => ({ unit, index }))
    .filter((entry) => entry.unit)
    .map((entry) => ({ ...entry, atk: getUnitAtk(opponent, entry.unit, game) }));
  if (targets.length === 0) return null;
  const winningTargets = targets
    .filter((entry) => entry.atk <= attackerAtk)
    .sort((a, b) => b.atk - a.atk);
  if (winningTargets.length > 0) return winningTargets[0].index;
  if (aiLevel <= 2 && Math.random() < 0.32) {
    return targets.slice().sort((a, b) => a.atk - b.atk)[0].index;
  }
  return undefined;
}

function chooseCpuChoiceIndex(room, choice) {
  const profile = room.ranked.profiles?.[room.ranked.cpuSeat] || rankedProfile({ cpu: true });
  const aiLevel = profile.aiLevel || 1;
  if (!choice?.candidates?.length) return choice?.allowPass ? "pass" : null;
  if (choice.allowPass) {
    if (choice.zone === "reaction" && Math.random() > cpuReactionChance(aiLevel)) return "pass";
    if (choice.zone === "effectActivation" && aiLevel <= 1 && Math.random() < 0.3) return "pass";
  }
  const candidates = choice.candidates.slice();
  candidates.sort((a, b) => cpuCandidateScore(b) - cpuCandidateScore(a));
  return candidates[0]?.index ?? (choice.allowPass ? "pass" : null);
}

function cpuCandidateScore(candidate) {
  const card = cards[candidate.id];
  if (!card) return 0;
  return (card.cost || 0) * 5 + (card.atk || 0) / 100 + (card.effect ? 8 : 0) + (card.driveKind ? 6 : 0);
}

function cpuReactionChance(aiLevel) {
  if (aiLevel >= 5) return 0.92;
  if (aiLevel >= 4) return 0.78;
  if (aiLevel >= 3) return 0.62;
  if (aiLevel >= 2) return 0.45;
  return 0.28;
}

function rankedCpuAiLevel(points) {
  if (points >= 2600) return 5;
  if (points >= 2200) return 4;
  if (points >= 1700) return 3;
  if (points >= 1200) return 2;
  return 1;
}

function chooseRankedCpuProfile(playerPoints) {
  const options = Array.isArray(chrono.cpuDecks) && chrono.cpuDecks.length
    ? chrono.cpuDecks
    : [{ name: "CPU", deck: chrono.cpuDeck || chrono.starterDeck || {}, driveDeck: chrono.cpuDriveDeck || chrono.starterDriveDeck || {} }];
  const basePoints = rankedPointsValue(playerPoints);
  const spread = basePoints >= 2200 ? 260 : basePoints >= 1600 ? 210 : 160;
  const points = Math.max(700, Math.min(2800, basePoints + Math.floor((Math.random() * 2 - 1) * spread)));
  const aiLevel = rankedCpuAiLevel(points);
  const deckIndex = Math.min(options.length - 1, Math.max(0, aiLevel - 1));
  const source = options[deckIndex] || options[Math.floor(Math.random() * options.length)] || options[0];
  return {
    cpu: true,
    username: "",
    name: `${String(source.name || "CPU").replace(/^CPU:\s*/, "")} CPU ${points}RP`,
    points,
    aiLevel,
    deck: expandDeckCounts(source.deck || chrono.cpuDeck || chrono.starterDeck || {}),
    driveDeck: expandDeckCounts(source.driveDeck || chrono.cpuDriveDeck || chrono.starterDriveDeck || {}),
  };
}

function expandDeckCounts(counts = {}) {
  return Object.entries(counts || {}).flatMap(([id, count]) => Array(Math.max(0, Math.floor(Number(count) || 0))).fill(id));
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
  resolvePlayedCard(game, player, opponent, card, seat, preferredSlot);
  return true;
}

function resolvePlayedCard(game, player, opponent, card, seat, preferredSlot = null) {
  const prefix = seat === "guest" ? "相手は" : "";
  if (card.type === "ユニット") {
    summonUnit(player, card.id, preferredSlot);
    log(game, `${prefix}${card.name}を召喚。`);
    if (card.effect) {
      const activate = () => activateEffectWithReactions(game, player, opponent, card, card.effect, `${card.name}の通常召喚時効果は無効化された。`, () => {
        afterSummon(game, player, card.id);
      });
      if (triggeredEffectIsOptional(card, "通常召喚時")) {
        queueEffectActivationChoice(game, player, card, {
          title: `${card.name}の通常召喚時効果`,
          message: "通常召喚時効果を発動しますか？",
        }, activate, () => {
          log(game, `${card.name}の通常召喚時効果は発動しなかった。`);
          afterSummon(game, player, card.id);
        });
      } else {
        activate();
      }
    } else {
      afterSummon(game, player, card.id);
    }
    return;
  }

  if (card.type === "コア") {
    placeCore(player, card.id, preferredSlot);
    log(game, `${prefix}${card.name}を発動。`);
    if (card.effect) activateEffectWithReactions(game, player, opponent, card, card.effect, `${card.name}の効果は無効化された。`);
    return;
  }

  if (card.type === "スペル") {
    log(game, `${prefix}${card.name}を発動。`);
    if (card.effect) activateEffectWithReactions(game, player, opponent, card, card.effect, `${card.name}は無効化された。`);
    player.grave.push(card.id);
  }
}

function effectSectionText(card, triggerLabel) {
  const text = card?.text || "";
  const marker = `${triggerLabel}：`;
  const start = text.indexOf(marker);
  if (start === -1) return text;
  const rest = text.slice(start + marker.length);
  const next = rest.search(/(?:通常召喚時|追加召喚時|召喚時|発動時|効果)：/);
  return next === -1 ? rest : rest.slice(0, next);
}

function triggeredEffectIsOptional(card, triggerLabel) {
  const section = effectSectionText(card, triggerLabel);
  if (section.includes("発動できる")) return true;
  if (section.includes("発動する")) return false;
  return card?.type === "ユニット" || card?.driveKind === "unit" || triggerLabel.includes("召喚");
}

function queueEffectActivationChoice(game, player, card, choice, onActivate, onPass = () => {}) {
  game.pendingChoice = {
    id: makeId(8),
    seat: seatOf(game, player),
    zone: "effectActivation",
    title: choice.title || `${card.name}の効果`,
    message: choice.message || `${card.name}の効果を発動しますか？`,
    candidates: [{ id: card.id, index: 0 }],
    allowPass: true,
    confirmLabel: choice.confirmLabel || "発動する",
    passLabel: choice.passLabel || "発動しない",
    resolve: (candidate) => {
      if (candidate) onActivate();
      else onPass();
    },
    afterResolve: null,
  };
  return true;
}

function queueOptionalAdditionalEffect(game, player, sourceCard, message, onActivate, onPass = () => {}) {
  return queueEffectActivationChoice(game, player, sourceCard, {
    title: `${sourceCard?.name || "カード"}の追加効果`,
    message,
    confirmLabel: "追加で発動する",
  }, onActivate, onPass);
}

function activateEffectWithReactions(game, player, opponent, card, effect, negatedMessage, after = () => {}) {
  addActivation(game, card, seatOf(game, player), "effect");
  const finish = (negated) => {
    if (negated) {
      log(game, negatedMessage || `${card.name}の効果は無効化された。`);
      after(false);
      return;
    }
    const pending = resolveEffect(game, effect, player, opponent, card);
    if (pending) appendPendingAfter(game, () => after(true));
    else after(true);
  };
  if (queueReactionChoice(game, opponent, player, card, "effect", finish)) return true;
  finish(false);
  return false;
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
    destroyUnit(opponent, targetIndex, game);
    const dealt = damage(game, opponent, diff);
    log(game, `${attackerCard.name}が${defenderCard.name}を破壊。${dealt}ダメージ。`);
  } else if (attackerAtk < defenderAtk) {
    destroyUnit(player, attackerIndex, game);
    const dealt = damage(game, player, diff);
    log(game, `${attackerCard.name}は戦闘で破壊された。${dealt}ダメージ。`);
  } else {
    destroyUnit(player, attackerIndex, game);
    destroyUnit(opponent, targetIndex, game);
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
  const resolveAt = (i) => {
    if (i < 0) {
      continuation(baseNegated);
      return;
    }
    const link = chain[i];
    if (link.negated) {
      log(game, `${link.card.name}は無効化された。`);
      resolveAt(i - 1);
      return;
    }
    const finish = (result) => {
      if (result?.negates) {
        if (i === 0) baseNegated = true;
        else chain[i - 1].negated = true;
      }
      resolveAt(i - 1);
    };
    const result = applyReactionEffect(game, link.card, link.player, link.opponent, link.event, finish);
    if (result?.pending) return;
    finish(result);
  };
  resolveAt(chain.length - 1);
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

function applyReactionEffect(game, card, player, opponent, event = {}, after = null) {
  const finishReaction = (result) => {
    if (after) after(result);
    return result;
  };
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
    if (countThemeInCharge(player, "星導") >= 3) {
      queueOptionalAdditionalEffect(game, player, card, "チャージに「星導」が3枚以上あります。追加で1枚ドローしますか？", () => {
        drawCards(player, 1, game);
        log(game, `${card.name}で効果を止めた。`);
        finishReaction({ negates: true });
      }, () => {
        log(game, `${card.name}で効果を止めた。`);
        finishReaction({ negates: true });
      });
      return { pending: true };
    }
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
        queueOptionalAdditionalEffect(game, player, card, "チャージに「断刃」が3枚以上あります。追加でそのユニットを破壊しますか？", () => {
          destroyUnit(opponent, targetIndex, game);
          log(game, `${card.name}で${targetName}を破壊。`);
          finishReaction({ negates: true });
        }, () => {
          log(game, `${card.name}で攻撃を止めた。`);
          finishReaction({ negates: true });
        });
        return { pending: true };
      }
      log(game, `${card.name}で攻撃を止めた。`);
      return { negates: true };
    }
    log(game, `${card.name}で攻撃を止めた。`);
    return { negates: true };
  }
  if (card.effect === "cyberShield") {
    if (countThemeUnits(player, "電脳") >= 2) {
      queueOptionalAdditionalEffect(game, player, card, "自分フィールドに「電脳」ユニットが2体以上います。追加で1枚ドローしますか？", () => {
        drawCards(player, 1, game);
        log(game, `${card.name}で攻撃を止めた。`);
        finishReaction({ negates: true });
      }, () => {
        log(game, `${card.name}で攻撃を止めた。`);
        finishReaction({ negates: true });
      });
      return { pending: true };
    }
    log(game, `${card.name}で攻撃を止めた。`);
    return { negates: true };
  }
  if (card.effect === "cyberCounterhack") {
    if (countThemeUnits(player, "電脳") >= 2) {
      queueOptionalAdditionalEffect(game, player, card, "自分フィールドに「電脳」ユニットが2体以上います。追加で相手リアクションを公開しますか？", () => {
        chooseRevealReaction(game, player, opponent, () => {
          log(game, `${card.name}で効果を止めた。`);
          finishReaction({ negates: true });
        });
      }, () => {
        log(game, `${card.name}で効果を止めた。`);
        finishReaction({ negates: true });
      });
      return { pending: true };
    }
    log(game, `${card.name}で効果を止めた。`);
    return { negates: true };
  }
  if (card.effect === "sosaiStreamCancel") {
    if (hasSosaiPair(player)) {
      queueOptionalAdditionalEffect(game, player, card, "自分フィールドに「双彩」のペアがそろっています。追加で1枚ドローしますか？", () => {
        drawCards(player, 1, game);
        log(game, `${card.name}で効果を止めた。`);
        finishReaction({ negates: true });
      }, () => {
        log(game, `${card.name}で効果を止めた。`);
        finishReaction({ negates: true });
      });
      return { pending: true };
    }
    log(game, `${card.name}で効果を止めた。`);
    return { negates: true };
  }
  if (card.effect === "keikanBindingClause") {
    if (countThemeChargeTypes(player, "契環") >= 3) {
      queueOptionalAdditionalEffect(game, player, card, "チャージに「契環」のカード種類が3種類以上あります。追加でそのユニットを行動済みにしますか？", () => {
        exhaustSourceUnitUntilOwnerTurnEnd(game, opponent, event);
        log(game, `${card.name}で攻撃を止めた。`);
        finishReaction({ negates: true });
      }, () => {
        log(game, `${card.name}で攻撃を止めた。`);
        finishReaction({ negates: true });
      });
      return { pending: true };
    }
    log(game, `${card.name}で攻撃を止めた。`);
    return { negates: true };
  }
  if (card.effect === "keikanNullClause") {
    if (countThemeChargeTypes(player, "契環") >= 3) {
      queueOptionalAdditionalEffect(game, player, card, "チャージに「契環」のカード種類が3種類以上あります。追加で1枚ドローしますか？", () => {
        drawCards(player, 1, game);
        log(game, `${card.name}で効果を止めた。`);
        finishReaction({ negates: true });
      }, () => {
        log(game, `${card.name}で効果を止めた。`);
        finishReaction({ negates: true });
      });
      return { pending: true };
    }
    log(game, `${card.name}で効果を止めた。`);
    return { negates: true };
  }
  if (card.effect === "watchSignal") {
    drawCards(player, 1, game);
    log(game, `${card.name}で1枚ドロー。攻撃は継続する。`);
    return { negates: false };
  }
  if (card.effect === "noisePing") {
    let immediateResult = null;
    const queued = chooseRevealReaction(game, player, opponent, (revealed) => {
      log(game, revealed
        ? `${card.name}で相手のリアクション1枚を表向きにした。`
        : `${card.name}を発動。表向きにできるリアクションはなかった。`);
      if (after) after({ negates: false });
      else immediateResult = { negates: false };
    });
    if (queued) return { pending: true };
    return immediateResult || { negates: false };
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
    allowPass: Boolean(choice.allowPass),
    confirmLabel: choice.confirmLabel,
    passLabel: choice.passLabel,
    candidates,
    resolve: (candidate) => {
      if (!candidate) {
        emptyHandler();
        return;
      }
      handler(candidate);
    },
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
    destroyUnit(targetPlayer, candidate.index, game);
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
    destroyUnit(targetPlayer, candidate.index, game);
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
    title: "ロストゾーンに送るリアクションを選択",
    message: "ロストゾーンに送る相手の公開リアクションを選んでください。",
    confirmLabel: "決定",
  }, (candidate) => {
    const id = reactionId(targetPlayer.reactions[candidate.index]);
    targetPlayer.reactions[candidate.index] = null;
    targetPlayer.grave.push(id);
    log(game, `${cards[id].name}をロストゾーンに送った。`);
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
    log(game, `${cards[id].name}をロストゾーンから戻した。`);
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
    log(game, `${cards[id].name}をロストゾーンからチャージに置いた。`);
    after(true);
  }, () => after(false));
}

function chooseSpecialSummonFromHand(game, player, predicate, choice, opponent = null, after = () => {}) {
  const slot = player.units.findIndex((unit) => !unit);
  if (slot === -1) {
    after(false);
    return false;
  }
  return queueChoice(game, player, "hand", player.hand, predicate, {
    ...choice,
    allowPass: choice.allowPass ?? true,
    confirmLabel: choice.confirmLabel || "召喚する",
    passLabel: choice.passLabel || "召喚しない",
  }, (candidate) => {
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
  const activate = () => activateEffectWithReactions(game, player, opponent, card, card.specialEffect, `${card.name}の追加召喚時効果は無効化された。`, after);
  if (triggeredEffectIsOptional(card, "追加召喚時")) {
    queueEffectActivationChoice(game, player, card, {
      title: `${card.name}の追加召喚時効果`,
      message: "追加召喚時効果を発動しますか？",
    }, activate, () => {
      log(game, `${card.name}の追加召喚時効果は発動しなかった。`);
      after(false);
    });
    return true;
  }
  activate();
  return true;
}

function chooseDiscardFromHand(game, player, choice, after = () => {}) {
  return queueChoice(game, player, "hand", player.hand, () => true, choice, (candidate) => {
    const [id] = player.hand.splice(candidate.index, 1);
    player.grave.push(id);
    log(game, `${cards[id].name}をロストゾーンに送った。`);
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
  log(game, `${cards[id].name}はロストゾーンに送られた。`);
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
        if (countThemeInCharge(player, "星導") >= 2) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "チャージに「星導」が2枚以上あります。追加で1枚ドローしますか？", () => {
            drawCards(player, 1, game);
          });
        }
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
        message: "ロストゾーンから手札に戻すカードを選んでください。",
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
        if (countThemeInCharge(player, "星導") >= 2) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "チャージに「星導」が2枚以上あります。追加で1枚ドローしますか？", () => {
            drawCards(player, 1, game);
          });
        }
      });
    case "starLink":
      drawCards(player, 1, game);
      if (controlsThemeUnit(player, "星導")) {
        return queueOptionalAdditionalEffect(game, player, sourceCard, "自分フィールドに「星導」ユニットがいます。追加で手札から召喚しますか？", () => {
          chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.name.includes("星導") && card.cost <= 1, {
            title: "星導ユニットを追加召喚",
            message: "手札から追加召喚するユニットを選んでください。",
          });
        });
      }
      return false;
    case "starReignite":
      return chooseFromGrave(game, player, (card) => card.name.includes("星導"), {
        title: "星導カードを回収",
        message: "ロストゾーンから手札に戻すカードを選んでください。",
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
        message: "ロストゾーンからチャージに置く「星導」カードを選んでください。",
      }, () => {
        if (controlsThemeUnit(player, "星導")) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "自分フィールドに「星導」ユニットがいます。追加でチャージをアクティブにしますか？", () => {
            untapOneCharge(player);
          });
        }
      });
    case "starSurveyorNoll":
      if (player.chargedThisTurn) {
        return chooseFromHandToCharge(game, player, (card) => card.name.includes("星導"), {
          title: "星導カードをチャージ",
          message: "手札からチャージに置く「星導」カードを選んでください。",
        }, (moved) => {
          if (moved && countThemeInCharge(player, "星導") >= 3) {
            queueOptionalAdditionalEffect(game, player, sourceCard, "チャージに「星導」が3枚以上あります。追加で1枚ドローしますか？", () => {
              drawCards(player, 1, game);
            });
          }
        });
      }
      break;
    case "starObservationRecord":
      return chooseFromDeck(game, player, (card) => card.type === "コア" && card.theme === "星導", {
        title: "星導コアをサーチ",
        message: "デッキから手札に加える「星導」コアを選んでください。",
      }, () => {
        if (countThemeInCharge(player, "星導") >= 3) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "チャージに「星導」が3枚以上あります。追加で1枚ドローしますか？", () => {
            drawCards(player, 1, game);
          });
        }
      });
    case "starOrbit":
      drawCards(player, 1, game);
      break;
    case "blackGrinder":
      if (opponent.units.some(Boolean)) damage(game, opponent, 400);
      if (player.cores.some(Boolean)) {
        return queueOptionalAdditionalEffect(game, player, sourceCard, "自分のコアがあります。追加で1枚ドローしますか？", () => {
          drawCards(player, 1, game);
        });
      }
      break;
    case "blackGear":
      if (countThemeInCharge(player, "黒機") >= 2) {
        return chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.name.includes("黒機") && card.cost <= 1, {
          title: "黒機ユニットを追加召喚",
          message: "手札から追加召喚するユニットを選んでください。",
        });
      }
      return false;
    case "blackSupplyEngineer":
      if (hasThemeCore(player, "黒機")) {
        return chooseFromDeck(game, player, (card) => card.type === "スペル" && card.theme === "黒機", {
          title: "黒機スペルをサーチ",
          message: "デッキから手札に加える「黒機」スペルを選んでください。",
        });
      }
      damage(game, opponent, 300);
      break;
    case "blackBindingGunner":
      if (hasThemeCore(player, "黒機")) {
        return chooseExhaustUnit(game, player, opponent, (exhausted) => {
          if (exhausted) drawCards(player, 1, game);
        });
      }
      break;
    case "blackAnchor":
      return chooseExhaustUnit(game, player, opponent, () => {
        if (player.cores.some(Boolean)) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "自分のコアがあります。追加で相手に700ダメージを与えますか？", () => {
            damage(game, opponent, 700);
          });
        }
      });
    case "blackTower":
      damage(game, opponent, 600);
      break;
    case "blackRaid":
      damage(game, opponent, 800);
      if (controlsThemeUnit(player, "黒機")) {
        return queueOptionalAdditionalEffect(game, player, sourceCard, "自分フィールドに「黒機」ユニットがいます。追加で相手ユニットを行動済みにしますか？", () => {
          chooseExhaustUnit(game, player, opponent);
        });
      }
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
        if (controlsThemeUnit(player, "断刃")) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "自分フィールドに「断刃」ユニットがいます。追加で相手に400ダメージを与えますか？", () => {
            damage(game, opponent, 400);
          });
        }
      });
    case "bladeCleave":
      if (hasExhaustedUnit(opponent)) return chooseDestroyExhaustedUnit(game, player, opponent);
      return chooseExhaustUnit(game, player, opponent);
    case "bladeWarrant":
      return chooseFromDeck(game, player, (card) => card.type === "ユニット" && card.name.includes("断刃"), {
        title: "断刃ユニットをサーチ",
        message: "デッキから手札に加えるユニットを選んでください。",
      }, () => {
        if (hasExhaustedUnit(opponent)) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "相手の行動済みユニットがいます。追加で1枚ドローしますか？", () => {
            drawCards(player, 1, game);
          });
        }
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
    case "cyberShionSpecial":
      return chooseRevealReaction(game, player, opponent, (revealed) => {
        if (revealed) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "リアクションを公開しました。追加で相手に500ダメージを与えますか？", () => {
            damage(game, opponent, 500);
          });
        }
      });
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
        message: "ロストゾーンに送るカードを選んでください。",
        delayBeforeOpenMs: 560,
      }, () => {
        chooseRemoveRevealedReaction(game, player, opponent);
      });
    case "cyberPacketMana":
      return chooseFromDeck(game, player, (card) => card.type === "スペル" && card.theme === "電脳", {
        title: "電脳スペルをサーチ",
        message: "デッキから手札に加える「電脳」スペルを選んでください。",
      }, (searched) => {
        if (searched && opponent.reactions.some((entry) => reactionId(entry) && reactionRevealed(entry))) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "相手の公開状態リアクションがあります。追加で1枚ドローしますか？", () => {
            drawCards(player, 1, game);
          });
        }
      });
    case "cyberPreview":
      return chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.name.includes("電脳") && card.cost <= 1, {
        title: "電脳ユニットを追加召喚",
        message: "手札から追加召喚するユニットを選んでください。",
      }, opponent, (moved) => {
        if (moved) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "ユニットを追加召喚しました。追加で1枚ドローしますか？", () => {
            drawCards(player, 1, game);
          });
        }
      });
    case "cyberIntrusion": {
      return chooseRevealReaction(game, player, opponent, () => {
        if (countThemeUnits(player, "電脳") >= 2) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "自分フィールドに「電脳」ユニットが2体以上います。追加で手札から召喚しますか？", () => {
            chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.name.includes("電脳"), {
              title: "電脳ユニットを追加召喚",
              message: "手札から追加召喚するユニットを選んでください。",
              delayBeforeOpenMs: 560,
            }, opponent);
          });
        }
      });
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
        chooseRevealReaction(game, player, opponent, () => {
          if (opponent.reactions.some((entry) => reactionId(entry) && reactionRevealed(entry))) {
            queueOptionalAdditionalEffect(game, player, sourceCard, "公開状態のリアクションがあります。追加で手札から召喚しますか？", () => {
              chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.theme === "電脳" && card.cost <= 2, {
                title: "電脳ユニットを追加召喚",
                message: "手札から追加召喚する「電脳」ユニットを選んでください。",
                delayBeforeOpenMs: 560,
              }, opponent);
            });
          }
        });
      });
    case "cyberTraceRoute":
      return chooseRevealReaction(game, player, opponent, (revealed) => {
        if (revealed) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "リアクションを公開しました。追加でコスト1以下の「電脳」ユニットをサーチしますか？", () => {
            chooseFromDeck(game, player, (card) => card.type === "ユニット" && card.theme === "電脳" && card.cost <= 1, {
              title: "電脳ユニットをサーチ",
              message: "デッキから手札に加えるコスト1以下の「電脳」ユニットを選んでください。",
            });
          });
        }
      });
    case "probeDrone":
      return chooseRevealReaction(game, player, opponent, (revealed) => {
        if (revealed) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "リアクションを公開しました。追加で手札から召喚しますか？", () => {
            chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.theme === "電脳" && card.cost <= 1, {
              title: "電脳ユニットを追加召喚",
              message: "手札から追加召喚する「電脳」ユニットを選んでください。",
              delayBeforeOpenMs: 560,
            }, opponent);
          });
        }
      });
    case "keikanScribeYura":
      return chooseFromDeck(game, player, (card) => card.type === "スペル" && card.theme === "契環", {
        title: "契環スペルをサーチ",
        message: "デッキから手札に加える「契環」スペルを選んでください。",
      }, () => {
        if (countThemeChargeTypes(player, "契環") >= 2) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "チャージに「契環」のカード種類が2種類以上あります。追加で1枚ドローしますか？", () => {
            drawCards(player, 1, game);
          });
        }
      });
    case "keikanCharmRen":
      return chooseFromHandToCharge(game, player, (card) => card.theme === "契環", {
        title: "契環カードをチャージ",
        message: "手札からチャージに置く「契環」カードを選んでください。",
      }, (moved) => {
        if (moved && countThemeChargeTypes(player, "契環") >= 2) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "チャージに「契環」のカード種類が2種類以上あります。追加で「契環」チャージをアクティブにしますか？", () => {
            untapOneCharge(player, (card) => card.theme === "契環");
          });
        }
      });
    case "keikanMediatorSae":
      if (countThemeChargeTypes(player, "契環") >= 3) {
        return chooseFromGrave(game, player, (card) => card.theme === "契環", {
          title: "契環カードを回収",
          message: "ロストゾーンから手札に戻す「契環」カードを選んでください。",
        }, () => {
          chooseExhaustUnit(game, player, opponent);
        });
      }
      break;
    case "keikanOathbearerKuga":
      if (countThemeInCharge(player, "契環") >= 4) {
        return chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.theme === "契環" && card.cost <= 1, {
          title: "契環ユニットを追加召喚",
          message: "手札から追加召喚するコスト1以下の「契環」ユニットを選んでください。",
        }, opponent);
      }
      break;
    case "keikanRingAdeptMay":
      if (countThemeChargeTypes(player, "契環") >= 2) untapOneCharge(player, (card) => card.theme === "契環");
      if (hasThemeCore(player, "契環")) {
        return queueOptionalAdditionalEffect(game, player, sourceCard, "自分フィールドに「契環」コアがあります。追加で1枚ドローしますか？", () => {
          drawCards(player, 1, game);
        });
      }
      break;
    case "keikanOathScript":
      return chooseFromDeck(game, player, (card) => card.type === "ユニット" && card.theme === "契環", {
        title: "契環ユニットをサーチ",
        message: "デッキから手札に加える「契環」ユニットを選んでください。",
      }, () => {
        queueOptionalAdditionalEffect(game, player, sourceCard, "追加で手札から「契環」カードをチャージに置きますか？", () => {
          chooseFromHandToCharge(game, player, (card) => card.theme === "契環", {
            title: "契環カードをチャージ",
            message: "手札からチャージに置く「契環」カードを選んでください。",
          });
        });
      });
    case "keikanSealExchange":
      return chooseFromGraveToCharge(game, player, (card) => card.theme === "契環", {
        title: "契環カードをチャージ",
        message: "ロストゾーンからチャージに置く「契環」カードを選んでください。",
      }, (moved) => {
        if (moved && countThemeChargeTypes(player, "契環") >= 3) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "チャージに「契環」のカード種類が3種類以上あります。追加で1枚ドローしますか？", () => {
            drawCards(player, 1, game);
          });
        }
      });
    case "keikanWitnessRing":
      drawCards(player, 1, game);
      break;
    case "sosaiHikari":
      return chooseFromDeck(game, player, (card) => card.id === "sosai_mint", {
        title: "ミントをサーチ",
        message: "デッキから手札に加えるミントを選んでください。",
      }, () => {
        if (controlsCard(player, "sosai_mint")) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "自分フィールドに「双彩のミント」がいます。追加で1枚ドローしますか？", () => {
            drawCards(player, 1, game);
          });
        }
      });
    case "sosaiMint":
      return chooseRevealReaction(game, player, opponent, () => {
        if (controlsCard(player, "sosai_hikari")) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "自分フィールドに「双彩のヒカリ」がいます。追加で表向きリアクションをロストゾーンに送りますか？", () => {
            chooseRemoveRevealedReaction(game, player, opponent);
          });
        }
      });
    case "sosaiNene":
      return chooseFromDeck(game, player, (card) => card.id === "sosai_ruri", {
        title: "ルリをサーチ",
        message: "デッキから手札に加えるルリを選んでください。",
      }, () => {
        if (controlsCard(player, "sosai_ruri")) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "自分フィールドに「双彩のルリ」がいます。追加で相手ユニットを手札に戻しますか？", () => {
            chooseReturnUnitToHand(game, player, opponent);
          });
        }
      });
    case "sosaiRuri":
      return chooseFromDeck(game, player, (card) => card.id === "sosai_nene", {
        title: "ネネをサーチ",
        message: "デッキから手札に加えるネネを選んでください。",
      }, () => {
        if (controlsCard(player, "sosai_nene")) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "自分フィールドに「双彩のネネ」がいます。追加で700ダメージと1枚ドローを行いますか？", () => {
            damage(game, opponent, 700);
            drawCards(player, 1, game);
          });
        }
      });
    case "sosaiCoco":
      return chooseFromDeck(game, player, (card) => card.id === "sosai_luna", {
        title: "ルナをサーチ",
        message: "デッキから手札に加えるルナを選んでください。",
      }, () => {
        if (controlsCard(player, "sosai_luna")) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "自分フィールドに「双彩のルナ」がいます。追加でチャージをアクティブにして1枚ドローしますか？", () => {
            untapOneCharge(player);
            drawCards(player, 1, game);
          });
        }
      });
    case "sosaiLuna":
      damage(game, opponent, 700);
      if (controlsCard(player, "sosai_coco")) {
        return queueOptionalAdditionalEffect(game, player, sourceCard, "自分フィールドに「双彩のココ」がいます。追加で相手ユニットを破壊しますか？", () => {
          chooseDestroyUnit(game, player, opponent);
        });
      }
      break;
    case "sosaiLiveStart":
      return chooseFromDeck(game, player, (card) => card.type === "ユニット" && card.name.includes("双彩"), {
        title: "双彩ユニットをサーチ",
        message: "デッキから手札に加えるユニットを選んでください。",
      }, () => {
        if (hasSosaiPair(player)) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "自分フィールドに「双彩」のペアがそろっています。追加で1枚ドローしますか？", () => {
            drawCards(player, 1, game);
          });
        }
      });
    case "sosaiHeartSync":
      return chooseSpecialSummonFromHand(game, player, (card) => card.type === "ユニット" && card.name.includes("双彩") && card.cost <= 2, {
        title: "双彩ユニットを追加召喚",
        message: "手札から追加召喚するユニットを選んでください。",
      }, opponent, (moved) => {
        if (moved && hasSosaiPair(player)) {
          queueOptionalAdditionalEffect(game, player, sourceCard, "自分フィールドに「双彩」のペアがそろっています。追加で1枚ドローしますか？", () => {
            drawCards(player, 1, game);
          });
        }
      });
    case "sosaiPopStage":
      drawCards(player, 1, game);
      break;
    case "drawDiscard":
      drawCards(player, 2, game);
      return chooseDiscardFromHand(game, player, {
        title: "手札を1枚捨てる",
        message: "ロストゾーンに送るカードを選んでください。",
        delayBeforeOpenMs: 560,
      });
    case "genericFieldNotes":
      drawCards(player, 1, game);
      if (!player.units.some(Boolean)) {
        return queueOptionalAdditionalEffect(game, player, sourceCard, "自分フィールドにユニットがいません。追加で手札1枚をチャージに置きますか？", () => {
          chooseFromHandToCharge(game, player, () => true, {
            title: "手札をチャージ",
            message: "手札からチャージに置くカードを選んでください。",
          });
        });
      }
      break;
    case "genericSurveyTeam":
      if (player.charge.length < opponent.charge.length) {
        return chooseFromHandToCharge(game, player, () => true, {
          title: "手札をチャージ",
          message: "前線測量班でチャージに置くカードを選んでください。",
        });
      }
      break;
    case "genericFieldMedic":
      if (player.lp < opponent.lp) drawCards(player, 1, game);
      break;
    case "genericSupplyBox":
      drawCards(player, 1, game);
      if (player.hand.length <= 3) {
        return queueOptionalAdditionalEffect(game, player, sourceCard, "自分の手札が3枚以下です。追加で手札1枚をチャージに置きますか？", () => {
          chooseFromHandToCharge(game, player, () => true, {
            title: "手札をチャージ",
            message: "手札からチャージに置くカードを選んでください。",
          });
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
        message: "ロストゾーンから手札に戻すユニットを選んでください。",
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
  log(game, `${cards[id].name}をロストゾーンから戻した。`);
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
  log(game, `${cards[id].name}をロストゾーンに送った。`);
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
      message: "ゼロシフト装置でロストゾーンに送るカードを選んでください。",
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

function sourceUnitIndex(player, event = {}) {
  const sourceId = event.source?.id;
  const sourceIndex = Number(event.sourceIndex);
  if (
    Number.isInteger(sourceIndex) &&
    sourceIndex >= 0 &&
    sourceIndex < player.units.length &&
    player.units[sourceIndex] &&
    (!sourceId || player.units[sourceIndex].id === sourceId)
  ) return sourceIndex;
  if (!sourceId) return -1;
  return player.units.findIndex((unit) => unit?.id === sourceId);
}

function exhaustSourceUnitUntilOwnerTurnEnd(game, player, event = {}) {
  const index = sourceUnitIndex(player, event);
  if (index < 0) return false;
  const unit = player.units[index];
  unit.exhausted = true;
  unit.exhaustedUntilOwnerTurnEnd = true;
  unit.exhaustedUntilOwnerTurnEndReady = false;
  log(game, `${cards[unit.id].name}を次のターン終了まで行動済みにした。`);
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
  destroyUnit(player, target.index, game);
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

function destroyUnit(player, index, game = null) {
  const unit = player.units[index];
  if (!unit) return false;
  const id = unit.id;
  player.grave.push(id);
  player.units[index] = null;
  if (game) addSoundEvent(game, "destroy", player, { id });
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

function countThemeChargeTypes(player, theme) {
  const types = new Set();
  player.charge.forEach((entry) => {
    const card = cards[entry.id];
    if (!cardHasTheme(card, theme)) return;
    const type = baseDriveType(card.type) || card.type;
    if (type) types.add(type);
  });
  return types.size;
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

function hasThemeCore(player, theme) {
  return player.cores.some((id) => cardHasTheme(cards[id], theme));
}

function getUnitAtk(player, unit, game = null) {
  if (!unit) return 0;
  let atk = cards[unit.id].atk + (unit.atkMod || 0);
  if (player.cores.includes("black_tower") && cardHasTheme(cards[unit.id], "黒機")) atk += 200;
  if (cards[unit.id].id === "star_guard") atk += player.cores.filter(Boolean).length * 300;
  if (player.cores.includes("blade_scaffold") && cardHasTheme(cards[unit.id], "断刃")) atk += 200;
  if (player.cores.includes("cyber_network") && cardHasTheme(cards[unit.id], "電脳")) atk += 100;
  if (player.cores.includes("sosai_pop_stage") && cardHasTheme(cards[unit.id], "双彩") && hasSosaiPairMate(player, unit.id)) atk += 300;
  if (player.cores.includes("keikan_witness_ring") && cardHasTheme(cards[unit.id], "契環") && countThemeChargeTypes(player, "契環") >= 3) atk += 300;
  if (player.cores.includes("drive_star_core") && cardHasTheme(cards[unit.id], "星導")) atk += 300;
  if (player.cores.includes("drive_black_core") && cardHasTheme(cards[unit.id], "黒機")) atk += 300;
  if (player.cores.includes("drive_blade_core") && cardHasTheme(cards[unit.id], "断刃")) atk += 300;
  if (player.cores.includes("drive_cyber_core") && cardHasTheme(cards[unit.id], "電脳")) atk += 200;
  if (player.cores.includes("drive_sosai_core") && cardHasTheme(cards[unit.id], "双彩") && hasSosaiPairMate(player, unit.id)) atk += 500;
  if (player.cores.includes("drive_keikan_core") && cardHasTheme(cards[unit.id], "契環")) atk += 300;
  return atk;
}

function cardHasTheme(card, theme) {
  return Boolean(card && (card.theme === theme || card.name.includes(theme)));
}

function damage(game, player, amount) {
  const dealt = amount;
  player.lp = Math.max(0, player.lp - dealt);
  if (dealt > 0) addSoundEvent(game, "damage", player, { amount: dealt });
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

async function finishRankedRoomByDisconnect(room, winnerSeat) {
  if (!room?.ranked || !room.game || room.game.finished) return false;
  room.ranked.finishReason = "disconnect";
  room.game.finished = true;
  room.game.winner = winnerSeat;
  log(room.game, `${seatLabel(winnerSeat)}が切断勝利を確定しました。`);
  await finalizeRankedRoom(room);
  room.version += 1;
  return true;
}

async function finishRankedRoomByForfeit(room, forfeitingSeat) {
  if (!room?.ranked || !room.game || room.game.finished) return false;
  const winnerSeat = forfeitingSeat === "host" ? "guest" : "host";
  room.ranked.finishReason = "forfeit";
  room.game.finished = true;
  room.game.winner = winnerSeat;
  log(room.game, `${seatLabel(forfeitingSeat)}が復帰せず敗北しました。`);
  await finalizeRankedRoom(room);
  room.version += 1;
  return true;
}

async function finalizeRankedRoom(room) {
  const game = room.game;
  if (!room.ranked || room.ranked.reported || !game?.finished) return;

  const results = {};
  const beforeBySeat = {};
  const accountsBySeat = {};
  for (const seat of ["host", "guest"]) {
    const username = normalizeUsername(room.ranked.accounts?.[seat]);
    if (username) {
      const account = await loadAccount(username);
      if (account) {
        const clean = sanitizeAccountRecord(username, account);
        beforeBySeat[seat] = sanitizeRankedRecord(clean.ranked);
        accountsBySeat[seat] = clean;
        continue;
      }
    }
    const profile = room.ranked.profiles?.[seat] || {};
    beforeBySeat[seat] = sanitizeRankedRecord({ points: profile.points, updatedAt: new Date(room.createdAt || Date.now()).toISOString() });
  }

  for (const seat of ["host", "guest"]) {
    const before = beforeBySeat[seat];
    if (!before) continue;
    const opponentSeat = seat === "host" ? "guest" : "host";
    const opponentBefore = beforeBySeat[opponentSeat] || sanitizeRankedRecord();
    const after = rankedAfterResult(before, game.winner === seat, opponentBefore.points);
    const clean = accountsBySeat[seat];
    if (clean) {
      const username = normalizeUsername(room.ranked.accounts?.[seat]);
      clean.ranked = after;
      clean.updatedAt = after.updatedAt;
      await saveAccount(username, clean);
    }
    results[seat] = rankedResultPayload(before, after, game.winner === seat, opponentBefore);
  }

  for (const seat of ["host", "guest"]) {
    if (results[seat]) continue;
    const before = beforeBySeat[seat];
    if (!before) continue;
    const opponentSeat = seat === "host" ? "guest" : "host";
    const opponentBefore = beforeBySeat[opponentSeat] || sanitizeRankedRecord();
    const after = rankedAfterResult(before, game.winner === seat, opponentBefore.points);
    results[seat] = rankedResultPayload(before, after, game.winner === seat, opponentBefore);
  }

  room.ranked.results = results;
  room.ranked.reported = true;
  room.ranked.finishedAt = Date.now();
  room.version += 1;
}

function rankedAfterResult(current, won, opponentPoints = RANKED_INITIAL_POINTS) {
  const before = sanitizeRankedRecord(current);
  const delta = rankedDelta(before.points, opponentPoints, won);
  const points = Math.max(0, before.points + delta);
  const now = new Date().toISOString();
  return {
    points,
    wins: before.wins + (won ? 1 : 0),
    losses: before.losses + (won ? 0 : 1),
    streak: won ? before.streak + 1 : 0,
    bestPoints: Math.max(before.bestPoints, points),
    updatedAt: now,
  };
}

function rankedDelta(points, opponentPoints, won) {
  const diff = Math.max(-800, Math.min(800, rankedPointsValue(opponentPoints) - rankedPointsValue(points)));
  if (won) {
    return Math.max(12, Math.min(50, Math.round(RANKED_WIN_DELTA + diff / 40)));
  }
  return -Math.max(8, Math.min(32, Math.round(Math.abs(RANKED_LOSS_DELTA) - diff / 60)));
}

function rankedResultPayload(before, after, won, opponentBefore = {}) {
  return {
    won,
    pointsBefore: before.points,
    pointsAfter: after.points,
    points: after.points,
    delta: after.points - before.points,
    opponentPointsBefore: sanitizeRankedRecord(opponentBefore).points,
    wins: after.wins,
    losses: after.losses,
    streak: after.streak,
    bestPoints: after.bestPoints,
    rank: rankName(after.points),
    nextRankAt: nextRankAt(after.points),
    updatedAt: after.updatedAt,
  };
}

function rankName(points) {
  if (points >= 2600) return "マスター";
  if (points >= 2200) return "ダイヤ";
  if (points >= 1800) return "プラチナ";
  if (points >= 1500) return "ゴールド";
  if (points >= 1200) return "シルバー";
  return "ブロンズ";
}

function nextRankAt(points) {
  return [1200, 1500, 1800, 2200, 2600].find((threshold) => points < threshold) || null;
}

function seatLabel(seat) {
  return seat === "host" ? "ホスト" : "ゲスト";
}

function isRankedCpuSeat(room, seat) {
  return Boolean(room?.ranked?.cpuSeat && room.ranked.cpuSeat === seat);
}

function rankedOpponentSeat(seat) {
  return seat === "host" ? "guest" : "host";
}

function rankedDisconnectStatus(room, seat) {
  if (!room?.ranked || !room.game || room.game.finished) return null;
  const opponentSeat = rankedOpponentSeat(seat);
  if (isRankedCpuSeat(room, opponentSeat)) return null;
  const lastSeenAt = Number(room.ranked.lastSeenAt?.[opponentSeat] || room.createdAt || Date.now());
  const elapsedMs = Math.max(0, Date.now() - lastSeenAt);
  if (elapsedMs < 5000) return null;
  const secondsRemaining = Math.max(0, Math.ceil((RANKED_DISCONNECT_GRACE_MS - elapsedMs) / 1000));
  return {
    opponentMissing: true,
    secondsRemaining,
    canClaim: elapsedMs >= RANKED_DISCONNECT_GRACE_MS,
  };
}

function canClaimDisconnectWin(room, seat) {
  const status = rankedDisconnectStatus(room, seat);
  return Boolean(status?.canClaim);
}

function findRankedRoomForAccount(username) {
  const normalized = normalizeUsername(username);
  let best = null;
  for (const room of rooms.values()) {
    if (room.mode !== "ranked" || !room.ranked) continue;
    for (const seat of ["host", "guest"]) {
      if (normalizeUsername(room.ranked.accounts?.[seat]) !== normalized) continue;
      if (room.status === "waiting" && !room.game) continue;
      if (room.game?.finished && room.ranked.resultSeenAt?.[seat]) continue;
      if (!best || Number(room.createdAt || 0) > Number(best.room.createdAt || 0)) {
        best = { room, seat };
      }
    }
  }
  return best;
}

function rankedResumePayload(room, seat) {
  return {
    roomId: room.id,
    playerId: room.players[seat]?.id,
    seat,
    mode: "ranked",
    ranked: true,
    matched: room.status !== "waiting",
    finished: Boolean(room.game?.finished),
  };
}

function roomSnapshot(room, seat) {
  if (room.status === "waiting" || !room.game) {
    const elapsedMs = Date.now() - Number(room.createdAt || Date.now());
    const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    return {
      roomId: room.id,
      mode: room.mode || "room",
      ranked: Boolean(room.ranked),
      status: "waiting",
      version: room.version,
      seat,
      matchingSeconds: elapsedSeconds,
      cpuFallbackSeconds: room.mode === "ranked" ? Math.max(0, Math.ceil((RANKED_CPU_FALLBACK_MS - elapsedMs) / 1000)) : null,
      message: room.mode === "ranked" ? `マッチング中 ${elapsedSeconds}秒` : `ルーム ${room.id}: 相手の参加待ち`,
    };
  }
  const enemySeat = seat === "host" ? "guest" : "host";
  const game = room.game;
  const player = publicDuelist(game[seat], true);
  const enemy = publicDuelist(game[enemySeat], false);
  if (game.finished && room.ranked) {
    room.ranked.resultSeenAt = room.ranked.resultSeenAt || {};
    room.ranked.resultSeenAt[seat] = Date.now();
  }
  return {
    roomId: room.id,
    mode: room.mode || "room",
    ranked: Boolean(room.ranked),
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
    soundEvents: publicSoundEvents(game.soundEvents, seat),
    rankedResult: game.finished && room.ranked?.results ? room.ranked.results[seat] || null : null,
    disconnectStatus: rankedDisconnectStatus(room, seat),
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

function publicSoundEvents(events = [], seat) {
  return events.map((event) => ({
    eventId: event.eventId,
    type: event.type,
    id: event.cardId,
    amount: event.amount,
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
    abyss: (player.abyss || []).slice(),
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

function addSoundEvent(game, type, player, payload = {}) {
  if (!game || !type) return;
  game.soundEvents = game.soundEvents || [];
  game.soundEvents.push({
    eventId: makeId(8),
    type,
    seat: seatOf(game, player),
    cardId: payload.id,
    amount: payload.amount,
  });
  if (game.soundEvents.length > 40) game.soundEvents.shift();
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

function baseDriveType(type = "") {
  return String(type).replace("ドライブ", "");
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

async function listAccountRecords() {
  if (db?.listAccounts) return db.listAccounts();
  return Object.values(loadAccounts());
}

function createDefaultAccountRecord(username, displayName = "Player") {
  const now = new Date().toISOString();
  return {
    username,
    name: displayName,
    displayName,
    activeDeckId: "main",
    gems: 0,
    dust: 0,
    ranked: sanitizeRankedRecord({ updatedAt: now }),
    presents: [],
    lastLoginBonusDate: "",
    loginBonus: sanitizeLoginBonusRecord({ updatedAt: now }),
    collection: initialCollection(chrono.starterDeck || {}, chrono.starterDriveDeck || {}),
    collectionRoyal: {},
    updatedAt: now,
    decks: {
      main: {
        id: "main",
        name: "Main Deck",
        mainDeck: chrono.starterDeck || {},
        driveDeck: chrono.starterDriveDeck || {},
        mainDeckRoyal: {},
        driveDeckRoyal: {},
        updatedAt: now,
      },
    },
  };
}

function initialCollection(mainDeck = {}, driveDeck = {}) {
  const result = {};
  Object.entries(mainDeck || {}).forEach(([id, count]) => {
    if (cards[id] && !isDriveCard(cards[id]) && cards[id].type !== "環境") {
      result[id] = Math.max(result[id] || 0, Math.floor(Number(count) || 0));
    }
  });
  Object.entries(driveDeck || {}).forEach(([id, count]) => {
    if (isDriveCard(cards[id])) {
      result[id] = Math.max(result[id] || 0, Math.floor(Number(count) || 0));
    }
  });
  return result;
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
    async listAccounts() {
      await ready;
      const result = await pool.query("select account from chrono_accounts");
      return result.rows.map((row) => row.account).filter(Boolean);
    },
  };
}

function sanitizeAccountRecord(name, account = {}) {
  const username = normalizeUsername(account.username || name);
  const result = {
    name: normalizeAccountName(account.displayName || account.name || username),
    username,
    displayName: normalizeAccountName(account.displayName || account.name || username),
    activeDeckId: sanitizeId(account.activeDeckId || "main"),
    gems: Math.max(0, Math.floor(Number(account.gems) || 0)),
    dust: Math.max(0, Math.floor(Number(account.dust) || 0)),
    ranked: sanitizeRankedRecord(account.ranked),
    presents: sanitizePresents(account.presents),
    lastLoginBonusDate: String(account.lastLoginBonusDate || ""),
    loginBonus: sanitizeLoginBonusRecord(account.loginBonus),
    collection: sanitizeCollection(account.collection),
    collectionRoyal: sanitizeCounts(account.collectionRoyal),
    updatedAt: String(account.updatedAt || new Date().toISOString()),
    decks: sanitizeDecks(account.decks),
  };
  if (isStoredPasswordHash(account.passwordHash)) result.passwordHash = account.passwordHash;
  if (isStoredTokenHash(account.sessionTokenHash)) result.sessionTokenHash = account.sessionTokenHash;
  if (account.sessionIssuedAt) result.sessionIssuedAt = String(account.sessionIssuedAt);
  return result;
}

function mergeAccountRecord(name, current, incoming) {
  if (!current) return incoming;
  const newer = accountUpdatedAt(incoming) >= accountUpdatedAt(current) ? incoming : current;
  return sanitizeAccountRecord(name, {
    ...current,
    ...incoming,
    username: current.username || incoming.username || name,
    displayName: incoming.displayName || current.displayName || current.name || name,
    gems: newer.gems,
    dust: newer.dust,
    ranked: mergeRankedRecord(current.ranked, incoming.ranked),
    presents: newer.presents,
    lastLoginBonusDate: newer.lastLoginBonusDate,
    loginBonus: newer.loginBonus,
    collection: newer.collection,
    collectionRoyal: newer.collectionRoyal,
    updatedAt: newer.updatedAt,
    decks: { ...(current.decks || {}), ...(incoming.decks || {}) },
    activeDeckId: incoming.activeDeckId || current.activeDeckId,
    passwordHash: current.passwordHash || incoming.passwordHash,
    sessionTokenHash: current.sessionTokenHash || incoming.sessionTokenHash,
    sessionIssuedAt: current.sessionIssuedAt || incoming.sessionIssuedAt,
  });
}

function accountUpdatedAt(account = {}) {
  const time = Date.parse(account.updatedAt || "");
  return Number.isFinite(time) ? time : 0;
}

async function authenticateRequest(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const username = normalizeUsername(req.headers["x-account-username"]);
  if (!username) return null;
  const account = await loadAccount(username);
  if (!account?.sessionTokenHash || hashToken(token) !== account.sessionTokenHash) return null;
  return { username, account: sanitizeAccountRecord(username, account) };
}

function bearerToken(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function applySessionToken(account) {
  const token = crypto.randomBytes(32).toString("base64url");
  account.sessionTokenHash = hashToken(token);
  account.sessionIssuedAt = new Date().toISOString();
  return token;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const expected = Buffer.from(parts[2], "base64url");
  const actual = crypto.scryptSync(String(password), parts[1], expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function publicAccount(account = {}) {
  const clean = sanitizeAccountRecord(account.username || account.name, account);
  delete clean.passwordHash;
  delete clean.sessionTokenHash;
  delete clean.sessionIssuedAt;
  clean.isDeveloper = isDeveloperUsername(clean.username);
  return clean;
}

function isStoredPasswordHash(value) {
  return /^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/.test(String(value || ""));
}

function isStoredTokenHash(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ""));
}

function sanitizeRankedRecord(source = {}) {
  const record = source && typeof source === "object" ? source : {};
  const rawPoints = Number(record.points);
  const points = Math.max(0, Math.floor(Number.isFinite(rawPoints) ? rawPoints : RANKED_INITIAL_POINTS));
  const bestPoints = Math.max(points, Math.floor(Number(record.bestPoints) || points));
  return {
    points,
    wins: Math.max(0, Math.floor(Number(record.wins) || 0)),
    losses: Math.max(0, Math.floor(Number(record.losses) || 0)),
    streak: Math.max(0, Math.floor(Number(record.streak) || 0)),
    bestPoints,
    updatedAt: String(record.updatedAt || new Date().toISOString()),
  };
}

function mergeRankedRecord(current = {}, incoming = {}) {
  if (!hasRankedRecord(incoming)) return sanitizeRankedRecord(current);
  if (!hasRankedRecord(current)) return sanitizeRankedRecord(incoming);
  const currentRanked = sanitizeRankedRecord(current);
  const incomingRanked = sanitizeRankedRecord(incoming);
  return Date.parse(incomingRanked.updatedAt) >= Date.parse(currentRanked.updatedAt)
    ? incomingRanked
    : currentRanked;
}

function hasRankedRecord(source) {
  return Boolean(source && typeof source === "object" && (
    source.points !== undefined ||
    source.wins !== undefined ||
    source.losses !== undefined ||
    source.updatedAt !== undefined
  ));
}

function applyDailyLoginBonus(account) {
  const today = todayKeyJst();
  if (account.lastLoginBonusDate === today) return null;
  account.loginBonus = sanitizeLoginBonusRecord(account.loginBonus);
  const cycleDay = (account.loginBonus.cycleDay % LOGIN_BONUS_CYCLE_DAYS) + 1;
  const presentId = `login_${today}_${makeId(6)}`;
  account.presents = sanitizePresents(account.presents);
  account.presents.push({
    id: presentId,
    type: "gems",
    amount: DAILY_LOGIN_BONUS_GEMS,
    title: "ログインボーナス",
    message: "本日の初回ログインボーナスです。",
    createdAt: new Date().toISOString(),
  });
  account.loginBonus = {
    cycleDay,
    totalClaims: account.loginBonus.totalClaims + 1,
    updatedAt: new Date().toISOString(),
  };
  account.lastLoginBonusDate = today;
  account.updatedAt = new Date().toISOString();
  return {
    id: presentId,
    type: "gems",
    amount: DAILY_LOGIN_BONUS_GEMS,
    date: today,
    cycleDay,
    cycleDays: LOGIN_BONUS_CYCLE_DAYS,
    resetHour: 0,
    timeZone: "Asia/Tokyo",
  };
}

function sanitizeLoginBonusRecord(source = {}) {
  const record = source && typeof source === "object" ? source : {};
  return {
    cycleDay: Math.max(0, Math.min(LOGIN_BONUS_CYCLE_DAYS, Math.floor(Number(record.cycleDay) || 0))),
    totalClaims: Math.max(0, Math.floor(Number(record.totalClaims) || 0)),
    updatedAt: String(record.updatedAt || ""),
  };
}

function sanitizePresents(source = []) {
  if (!Array.isArray(source)) return [];
  return source
    .map((entry) => {
      const type = entry?.type === "gems" ? "gems" : "";
      const amount = Math.max(0, Math.floor(Number(entry?.amount) || 0));
      if (!type || amount <= 0) return null;
      return {
        id: sanitizePresentId(entry.id) || `present_${makeId(8)}`,
        type,
        amount,
        title: String(entry.title || "プレゼント").trim().slice(0, 32) || "プレゼント",
        message: String(entry.message || "").trim().slice(0, 120),
        createdAt: String(entry.createdAt || new Date().toISOString()),
      };
    })
    .filter(Boolean)
    .slice(-100);
}

function sanitizePresentId(id) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
}

function todayKeyJst(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
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

function sanitizeCollection(source = {}) {
  const result = sanitizeCounts(source);
  Object.entries(initialCollection(chrono.starterDeck || {}, chrono.starterDriveDeck || {})).forEach(([id, count]) => {
    result[id] = Math.max(result[id] || 0, Number(count) || 0);
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

function normalizeUsername(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24);
}

function isDeveloperUsername(username) {
  return normalizeUsername(username) === DEVELOPER_USERNAME;
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
  if ([".html", ".css", ".js", ".webmanifest"].includes(ext)) return "no-store";
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
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json; charset=utf-8",
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
