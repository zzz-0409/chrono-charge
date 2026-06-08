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
  rankedModeButton: null,
  createRoomButton: null,
  joinRoomButton: null,
  roomCodeInput: null,
  roomPanel: null,
  gridAccountName: null,
  gridRankStatus: null,
  gridLoginOpenButton: null,
  gridLogoutButton: null,
  deckPresetScreen: null,
  deckPresetGrid: null,
  deckPresetBackButton: null,
  deckPresetCreateButton: null,
  gridAuthLayer: null,
  gridAuthTitle: null,
  gridAuthUsername: null,
  gridAuthPassword: null,
  gridAuthError: null,
  gridAuthSwitchButton: null,
  gridAuthCancelButton: null,
  gridAuthSubmitButton: null,
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
let authState = null;
let gridProfile = null;
let authMode = "login";
let onlineSession = null;
let onlinePollTimer = 0;
let onlineFetchInFlight = false;
let onlineSyncInFlight = false;
let lastOnlineVersion = 0;
let pendingRankedResult = null;
const bootParams = new URLSearchParams(location.search);
const EMBEDDED_MODE = bootParams.get("embedded") === "1";
const ENTRY_MODE = bootParams.get("entry") || (location.hash === "#deck" ? "deck" : "menu");
const AUTH_STORAGE_KEY = "chronoGridAuthV1";
const PROFILE_STORAGE_KEY = "chronoGridProfileV1";
const ONLINE_SESSION_KEY = "chronoGridOnlineSessionV1";
const ONLINE_POLL_MS = 900;
const RANKED_TIERS = [
  { label: "マスター", min: 2600 },
  { label: "ダイヤ", min: 2200 },
  { label: "プラチナ", min: 1800 },
  { label: "ゴールド", min: 1500 },
  { label: "シルバー", min: 1200 },
  { label: "ブロンズ", min: 0 }
];
authState = loadAuthState();
gridProfile = loadGridProfile();
const EFFECT_KEYWORD_HELP = {
  発動: "プレイしたときに発動する。",
  召喚: "場に出したときに発動する。",
  変動: "攻撃範囲がユニットの現在位置を基準に動く。ユニットを移動すると攻撃範囲も移動する。",
  固定: "攻撃範囲がユニットの現在位置に依存しない。ユニットを移動しても攻撃範囲は移動しない。",
  起動: "自分のターン中、任意のタイミングで発動できる。",
  高速: "召喚、移動したターンに攻撃できる。",
  消滅: "消滅したときに発動する。"
};

if (EMBEDDED_MODE) {
  document.documentElement.classList.add("embedded-mode");
}

function setupMigrationUi() {
  const panel = document.querySelector(".mode-panel");
  if (!panel) return;
  panel.querySelector("h1").textContent = "対戦モード選択";
  el.cpuModeButton.querySelector("strong").textContent = "CPU対戦";
  el.cpuModeButton.querySelector("span").textContent = "CPUが召喚・移動・強化を行います。";
  el.onlineModeButton.querySelector("strong").textContent = "ルーム戦";
  el.onlineModeButton.querySelector("span").textContent = "ルームを作成、またはIDを入力して参加します。";
  el.deckModeButton.querySelector("strong").textContent = "デッキプリセット";
  el.deckModeButton.querySelector("span").textContent = "カードと大将特性をプリセットごとに編集します。";
  if (el.deckEditButton) el.deckEditButton.textContent = "デッキ";

  const accountPanel = document.createElement("section");
  accountPanel.className = "grid-account-panel";
  accountPanel.innerHTML = `
    <div>
      <strong id="gridAccountName">ゲスト</strong>
      <span id="gridRankStatus">ブロンズ 1000 RP</span>
    </div>
    <div class="grid-account-actions">
      <button class="mini-action" id="gridLoginOpenButton" type="button">ログイン</button>
      <button class="mini-action" id="gridLogoutButton" type="button" hidden>ログアウト</button>
    </div>
  `;
  panel.insertBefore(accountPanel, panel.querySelector(".mode-actions"));

  const rankedButton = document.createElement("button");
  rankedButton.className = "mode-button";
  rankedButton.id = "rankedModeButton";
  rankedButton.type = "button";
  rankedButton.innerHTML = `
    <strong>ランク戦</strong>
    <span>ログインしてRPを競います。待機後はCPU戦に切り替わります。</span>
  `;
  panel.querySelector(".mode-actions").insertBefore(rankedButton, el.onlineModeButton);

  const roomPanel = document.createElement("section");
  roomPanel.className = "room-panel";
  roomPanel.id = "roomPanel";
  roomPanel.hidden = true;
  roomPanel.innerHTML = `
    <div class="room-actions">
      <button class="mini-action primary" id="createRoomButton" type="button">ルーム作成</button>
      <label class="room-code-field">
        <span>ROOM ID</span>
        <input id="roomCodeInput" autocomplete="off" maxlength="8" inputmode="latin" placeholder="ABCDE">
      </label>
      <button class="mini-action" id="joinRoomButton" type="button">参加</button>
    </div>
  `;
  panel.insertBefore(roomPanel, el.modeNotice);

  const presetScreen = document.createElement("section");
  presetScreen.className = "deck-preset-screen";
  presetScreen.id = "deckPresetScreen";
  presetScreen.setAttribute("aria-hidden", "true");
  presetScreen.innerHTML = `
    <button class="grid-back-button deck-preset-back" id="deckPresetBackButton" type="button" aria-label="戻る">
      <span class="grid-back-icon"></span>
    </button>
    <div class="deck-preset-shell plate">
      <header class="deck-preset-head">
        <div>
          <p class="mode-kicker">Deck Presets</p>
          <h2>デッキプリセット</h2>
        </div>
        <button class="deck-action primary" id="deckPresetCreateButton" type="button">新規作成</button>
      </header>
      <div class="deck-preset-grid" id="deckPresetGrid"></div>
    </div>
  `;
  el.stage.append(presetScreen);

  const authLayer = document.createElement("section");
  authLayer.className = "grid-auth-layer";
  authLayer.id = "gridAuthLayer";
  authLayer.hidden = true;
  authLayer.innerHTML = `
    <div class="grid-auth-dialog plate">
      <h2 id="gridAuthTitle">ログイン</h2>
      <label>ユーザー名<input id="gridAuthUsername" autocomplete="username"></label>
      <label>パスワード<input id="gridAuthPassword" type="password" autocomplete="current-password"></label>
      <p class="grid-auth-error" id="gridAuthError"></p>
      <div class="grid-auth-actions">
        <button class="mini-action" id="gridAuthSwitchButton" type="button">新規登録へ</button>
        <button class="mini-action" id="gridAuthCancelButton" type="button">閉じる</button>
        <button class="mini-action primary" id="gridAuthSubmitButton" type="button">ログイン</button>
      </div>
    </div>
  `;
  el.stage.append(authLayer);

  Object.assign(el, {
    rankedModeButton: rankedButton,
    roomPanel,
    createRoomButton: document.querySelector("#createRoomButton"),
    joinRoomButton: document.querySelector("#joinRoomButton"),
    roomCodeInput: document.querySelector("#roomCodeInput"),
    gridAccountName: document.querySelector("#gridAccountName"),
    gridRankStatus: document.querySelector("#gridRankStatus"),
    gridLoginOpenButton: document.querySelector("#gridLoginOpenButton"),
    gridLogoutButton: document.querySelector("#gridLogoutButton"),
    deckPresetScreen: presetScreen,
    deckPresetGrid: document.querySelector("#deckPresetGrid"),
    deckPresetBackButton: document.querySelector("#deckPresetBackButton"),
    deckPresetCreateButton: document.querySelector("#deckPresetCreateButton"),
    gridAuthLayer: authLayer,
    gridAuthTitle: document.querySelector("#gridAuthTitle"),
    gridAuthUsername: document.querySelector("#gridAuthUsername"),
    gridAuthPassword: document.querySelector("#gridAuthPassword"),
    gridAuthError: document.querySelector("#gridAuthError"),
    gridAuthSwitchButton: document.querySelector("#gridAuthSwitchButton"),
    gridAuthCancelButton: document.querySelector("#gridAuthCancelButton"),
    gridAuthSubmitButton: document.querySelector("#gridAuthSubmitButton")
  });
}

function loadAuthState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
    return parsed?.token && parsed?.username ? parsed : null;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function saveAuthState(auth) {
  authState = auth?.token && auth?.username ? auth : null;
  if (authState) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
  else localStorage.removeItem(AUTH_STORAGE_KEY);
}

function defaultGridProfile() {
  return {
    activePresetId: "main",
    presets: {
      main: {
        id: "main",
        name: "メインデッキ",
        deck: [...DECK],
        leaderTraitId: "bulwark",
        updatedAt: new Date().toISOString()
      }
    }
  };
}

function loadGridProfile() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "null");
    return normalizeGridProfile(parsed);
  } catch {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    return defaultGridProfile();
  }
}

function saveGridProfile(options = {}) {
  gridProfile = normalizeGridProfile(gridProfile);
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(gridProfile));
  if (options.remote !== false) syncGridProfile();
}

function normalizeGridProfile(source) {
  const base = defaultGridProfile();
  const profile = source && typeof source === "object" ? source : base;
  const presets = {};
  Object.entries(profile.presets || {}).forEach(([rawId, preset]) => {
    const id = sanitizePresetId(rawId);
    const deck = sanitizeDeckIds(Array.isArray(preset.deck) ? preset.deck : []);
    if (deck.length !== DECK_TARGET_SIZE) return;
    presets[id] = {
      id,
      name: normalizePresetName(preset.name || "デッキ"),
      deck,
      leaderTraitId: LEADER_TRAITS[preset.leaderTraitId] ? preset.leaderTraitId : "bulwark",
      updatedAt: preset.updatedAt || new Date().toISOString()
    };
  });
  if (!Object.keys(presets).length) return base;
  const activePresetId = presets[profile.activePresetId] ? profile.activePresetId : Object.keys(presets)[0];
  return { activePresetId, presets };
}

function activePreset() {
  gridProfile = normalizeGridProfile(gridProfile);
  return gridProfile.presets[gridProfile.activePresetId] || Object.values(gridProfile.presets)[0];
}

function applyActivePresetToStorage() {
  const preset = activePreset();
  saveDeckIds(preset.deck);
  saveLeaderTraitId(preset.leaderTraitId);
}

function updateActivePresetFromEditor() {
  const preset = activePreset();
  preset.deck = sanitizeDeckIds(deckEditorIds);
  preset.leaderTraitId = LEADER_TRAITS[deckEditorLeaderTraitId] ? deckEditorLeaderTraitId : "bulwark";
  preset.updatedAt = new Date().toISOString();
  saveGridProfile();
}

function sanitizePresetId(id) {
  return String(id || "main").replace(/[^a-zA-Z0-9_-]/g, "_") || "main";
}

function normalizePresetName(name) {
  return String(name || "デッキ").trim().replace(/\s+/g, " ").slice(0, 32) || "デッキ";
}

function authHeaders() {
  return {
    Authorization: `Bearer ${authState?.token || ""}`,
    "X-Account-Username": authState?.username || ""
  };
}

function rankLabel(points) {
  const value = Math.max(0, Math.floor(Number(points) || 1000));
  const tier = RANKED_TIERS.find((entry) => value >= entry.min) || RANKED_TIERS[RANKED_TIERS.length - 1];
  return `${tier.label} ${value} RP`;
}

function renderAccountPanel(account = authState?.account) {
  if (!el.gridAccountName) return;
  const loggedIn = Boolean(authState?.token);
  el.gridAccountName.textContent = loggedIn ? (account?.displayName || authState.username) : "ゲスト";
  el.gridRankStatus.textContent = rankLabel(account?.ranked?.points || authState?.account?.ranked?.points || 1000);
  el.gridLoginOpenButton.hidden = loggedIn;
  el.gridLogoutButton.hidden = !loggedIn;
}

async function syncGridProfile() {
  if (!authState?.token || location.protocol === "file:") return;
  try {
    const response = await fetch("/api/account", {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ account: { grid: gridProfile, updatedAt: new Date().toISOString() } })
    });
    if (!response.ok) return;
    const data = await response.json();
    if (data.account) {
      authState.account = data.account;
      saveAuthState(authState);
      renderAccountPanel(data.account);
    }
  } catch {
    // Remote profile sync is best-effort.
  }
}

async function syncAccountFromServer() {
  if (!authState?.token || location.protocol === "file:") {
    renderAccountPanel();
    return;
  }
  try {
    const response = await fetch("/api/account", { headers: authHeaders(), cache: "no-store" });
    if (response.status === 401) {
      saveAuthState(null);
      renderAccountPanel();
      return;
    }
    if (!response.ok) return;
    const data = await response.json();
    if (data.account) {
      authState.account = data.account;
      saveAuthState(authState);
      if (data.account.grid) {
        gridProfile = normalizeGridProfile(data.account.grid);
        saveGridProfile({ remote: false });
      }
      renderAccountPanel(data.account);
    }
  } catch {
    renderAccountPanel();
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function openAuthDialog(mode = "login") {
  authMode = mode;
  renderAuthDialog();
  el.gridAuthLayer.hidden = false;
  el.gridAuthUsername.focus();
}

function closeAuthDialog() {
  el.gridAuthLayer.hidden = true;
  el.gridAuthError.textContent = "";
  el.gridAuthPassword.value = "";
}

function renderAuthDialog() {
  const register = authMode === "register";
  el.gridAuthTitle.textContent = register ? "新規登録" : "ログイン";
  el.gridAuthSubmitButton.textContent = register ? "登録" : "ログイン";
  el.gridAuthSwitchButton.textContent = register ? "ログインへ" : "新規登録へ";
  el.gridAuthPassword.autocomplete = register ? "new-password" : "current-password";
}

async function submitAuthDialog() {
  const username = el.gridAuthUsername.value.trim();
  const password = el.gridAuthPassword.value;
  el.gridAuthError.textContent = "";
  if (!username || password.length < 4) {
    el.gridAuthError.textContent = "ユーザー名と4文字以上のパスワードを入力してください。";
    return;
  }
  try {
    const data = await requestJson(authMode === "register" ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      body: { username, password, displayName: username }
    });
    saveAuthState({ username: data.account.username, token: data.token, account: data.account });
    if (data.account.grid) {
      gridProfile = normalizeGridProfile(data.account.grid);
      saveGridProfile({ remote: false });
      applyActivePresetToStorage();
    } else {
      await syncGridProfile();
    }
    renderAccountPanel(data.account);
    renderDeckPresetScreen();
    closeAuthDialog();
    el.modeNotice.textContent = `${data.account.displayName || username}でログインしました。`;
  } catch (error) {
    el.gridAuthError.textContent = authMode === "register"
      ? "登録できませんでした。別のユーザー名を試してください。"
      : "ログインできませんでした。";
  }
}

async function logoutAccount() {
  try {
    if (authState?.token) await requestJson("/api/auth/logout", { method: "POST", headers: authHeaders() });
  } catch {
    // Logout is local even when the server cannot be reached.
  }
  saveAuthState(null);
  renderAccountPanel();
  el.modeNotice.textContent = "ログアウトしました。";
}

function requireOnline() {
  if (location.protocol !== "file:") return true;
  el.modeNotice.textContent = "オンライン対戦は node server.js で起動してから使用できます。";
  return false;
}

function currentOnlinePayload() {
  const deck = loadPlayerDeckIds();
  if (deck.length !== DECK_TARGET_SIZE) {
    el.modeNotice.textContent = `デッキを${DECK_TARGET_SIZE}枚にしてください。`;
    openDeckPresetScreen();
    return null;
  }
  return {
    deck,
    leaderTraitId: loadLeaderTraitId(),
    playerName: authState?.account?.displayName || authState?.username || "Player"
  };
}

function saveOnlineSession(session) {
  onlineSession = session || null;
  if (onlineSession) localStorage.setItem(ONLINE_SESSION_KEY, JSON.stringify(onlineSession));
  else localStorage.removeItem(ONLINE_SESSION_KEY);
}

async function createRoomOnline() {
  if (!requireOnline()) return;
  const payload = currentOnlinePayload();
  if (!payload) return;
  try {
    const session = await requestJson("/api/grid/rooms", { method: "POST", body: payload });
    saveOnlineSession(session);
    startOnlinePolling();
    hideModeSelect();
    el.modeNotice.textContent = `ルーム ${session.roomId} を作成しました。`;
  } catch (error) {
    el.modeNotice.textContent = error.message || "ルーム作成に失敗しました。";
  }
}

async function joinRoomOnline() {
  if (!requireOnline()) return;
  const payload = currentOnlinePayload();
  const roomId = el.roomCodeInput.value.trim().toUpperCase();
  if (!payload || !roomId) {
    el.modeNotice.textContent = "参加するルームIDを入力してください。";
    return;
  }
  try {
    const session = await requestJson(`/api/grid/rooms/${roomId}/join`, { method: "POST", body: payload });
    saveOnlineSession(session);
    startOnlinePolling();
    hideModeSelect();
  } catch (error) {
    el.modeNotice.textContent = error.message || "ルーム参加に失敗しました。";
  }
}

async function startRankedOnline() {
  if (!requireOnline()) return;
  if (!authState?.token) {
    el.modeNotice.textContent = "ランク戦にはログインが必要です。";
    openAuthDialog("login");
    return;
  }
  const payload = currentOnlinePayload();
  if (!payload) return;
  try {
    const session = await requestJson("/api/grid/ranked/queue", {
      method: "POST",
      headers: authHeaders(),
      body: payload
    });
    saveOnlineSession(session);
    startOnlinePolling();
    hideModeSelect();
  } catch (error) {
    el.modeNotice.textContent = error.message || "ランク戦の開始に失敗しました。";
  }
}

function startOnlinePolling() {
  stopOnlinePolling();
  lastOnlineVersion = 0;
  fetchOnlineState();
  onlinePollTimer = setInterval(fetchOnlineState, ONLINE_POLL_MS);
}

function stopOnlinePolling() {
  clearInterval(onlinePollTimer);
  onlinePollTimer = 0;
  onlineFetchInFlight = false;
}

async function fetchOnlineState() {
  if (!onlineSession || onlineFetchInFlight) return;
  onlineFetchInFlight = true;
  try {
    const query = new URLSearchParams({ playerId: onlineSession.playerId });
    const snapshot = await requestJson(`/api/grid/rooms/${onlineSession.roomId}/state?${query}`);
    if (snapshot.status === "waiting") {
      el.modeNotice.textContent = snapshot.cpuFallbackSeconds !== null
        ? `${snapshot.message} / CPU切替まで ${snapshot.cpuFallbackSeconds}秒`
        : snapshot.message;
      return;
    }
    if (snapshot.version !== lastOnlineVersion || snapshot.status === "finished") {
      applyOnlineSnapshot(snapshot);
    }
    if (snapshot.opponentCpu && snapshot.activeSeat === snapshot.cpuSeat && !state.animating && !state.winner) {
      runOnlineCpuTurn();
    }
  } catch (error) {
    el.modeNotice.textContent = error.message || "オンライン状態を取得できません。";
  } finally {
    onlineFetchInFlight = false;
  }
}

function applyOnlineSnapshot(snapshot) {
  if (!snapshot?.state) return;
  lastOnlineVersion = snapshot.version || lastOnlineVersion;
  currentMode = "online";
  state = snapshot.state;
  state.mode = "online";
  state.selected = null;
  state.drag = null;
  state.cardDrag = null;
  state.animating = false;
  state.logOpen = Boolean(state.logOpen);
  nextId = Math.max(Number(state.nextId) || nextId || 1, nextId || 1);
  pendingRankedResult = snapshot.rankedResult || pendingRankedResult;
  hideModeSelect();
  render();
  if (state.winner && pendingRankedResult) {
    renderAccountPanel({ ...(authState?.account || {}), ranked: { points: pendingRankedResult.pointsAfter } });
  }
}

let onlineSyncTimer = 0;
function markOnlineChanged(force = false) {
  if (state?.mode !== "online" || !onlineSession) return;
  clearTimeout(onlineSyncTimer);
  if (force) {
    syncOnlineState();
    return;
  }
  onlineSyncTimer = setTimeout(syncOnlineState, 80);
}

async function syncOnlineState() {
  if (!onlineSession || onlineSyncInFlight || !state) return;
  onlineSyncInFlight = true;
  try {
    state.nextId = nextId;
    state.finished = Boolean(state.winner);
    const snapshot = await requestJson(`/api/grid/rooms/${onlineSession.roomId}/action`, {
      method: "POST",
      body: {
        playerId: onlineSession.playerId,
        state
      }
    });
    lastOnlineVersion = snapshot.version || lastOnlineVersion;
    pendingRankedResult = snapshot.rankedResult || pendingRankedResult;
  } catch (error) {
    el.modeNotice.textContent = error.message || "対戦状態を送信できません。";
  } finally {
    onlineSyncInFlight = false;
  }
}

async function runOnlineCpuTurn() {
  if (!onlineSession || state?.mode !== "online" || state.active !== "enemy" || state.winner) return;
  state.animating = true;
  render();
  await enemyAction();
  if (!state.winner) await startTurn("player");
  state.animating = false;
  render();
  markOnlineChanged(true);
}

function createGame(mode = currentMode) {
  currentMode = mode;
  if (mode !== "online") {
    stopOnlinePolling();
    saveOnlineSession(null);
  }
  applyActivePresetToStorage();
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
  const preset = activePreset();
  const deck = sanitizeDeckIds(preset?.deck || []);
  if (deck.length === DECK_TARGET_SIZE) return deck;
  const saved = readSavedDeckIds();
  return saved.length ? saved : [...DECK];
}

function loadLeaderTraitId() {
  const preset = activePreset();
  if (LEADER_TRAITS[preset?.leaderTraitId]) return preset.leaderTraitId;
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
  markOnlineChanged();
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
    sourceName: card.name,
    selectedIndex: 0,
    peeking: false
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
  markOnlineChanged();
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
  markOnlineChanged();
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
  if (state.mode === "online") {
    state.animating = false;
    render();
    markOnlineChanged(true);
    return;
  }
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
  updateActivePresetFromEditor();
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
  updateActivePresetFromEditor();
  renderDeckEditor();
}

function addDeckCard(id) {
  deckEditorFocusId = id;
  const counts = deckCounts();
  if (deckEditorIds.length >= DECK_TARGET_SIZE) return;
  if (!CARDS[id] || (counts[id] || 0) >= MAX_CARD_COPIES) return;
  deckEditorIds.push(id);
  saveDeckIds(deckEditorIds);
  updateActivePresetFromEditor();
  renderDeckEditor();
}

function removeDeckCard(id) {
  deckEditorFocusId = id;
  const index = deckEditorIds.indexOf(id);
  if (index < 0) return;
  deckEditorIds.splice(index, 1);
  saveDeckIds(deckEditorIds);
  updateActivePresetFromEditor();
  renderDeckEditor();
}

function openDeckPresetScreen() {
  hideModeSelect();
  el.deckEditor?.classList.remove("open");
  el.deckEditor?.setAttribute("aria-hidden", "true");
  el.deckPresetScreen?.classList.add("open");
  el.deckPresetScreen?.setAttribute("aria-hidden", "false");
  renderDeckPresetScreen();
}

function closeDeckPresetScreen() {
  el.deckPresetScreen?.classList.remove("open");
  el.deckPresetScreen?.setAttribute("aria-hidden", "true");
  if (!EMBEDDED_MODE) showModeSelect();
}

function renderDeckPresetScreen() {
  if (!el.deckPresetGrid) return;
  gridProfile = normalizeGridProfile(gridProfile);
  el.deckPresetGrid.innerHTML = "";
  Object.values(gridProfile.presets)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .forEach((preset) => {
      const counts = deckCounts(preset.deck);
      const aceId = preset.deck.find((id) => CARDS[id]?.kind === "unit") || preset.deck[0];
      const card = CARDS[aceId] || Object.values(CARDS)[0];
      const node = document.createElement("article");
      node.className = "deck-preset-card";
      node.classList.toggle("selected", preset.id === gridProfile.activePresetId);
      node.innerHTML = `
        <div class="deck-preset-art" style="background-image: url('${card.art}')"></div>
        <div class="deck-preset-info">
          <strong>${escapeHtml(preset.name)}</strong>
          <span>${preset.deck.length}枚 / ${escapeHtml(LEADER_TRAITS[preset.leaderTraitId]?.name || "")}</span>
          <small>${Object.keys(counts).length}種 / ${escapeHtml(card.name)}</small>
        </div>
        <div class="deck-preset-actions">
          <button class="mini-action primary" type="button" data-action="use">使用</button>
          <button class="mini-action" type="button" data-action="edit">編集</button>
          <button class="mini-action" type="button" data-action="copy">複製</button>
          <button class="mini-action danger" type="button" data-action="delete">削除</button>
        </div>
      `;
      node.querySelector("[data-action='use']").addEventListener("click", () => useDeckPreset(preset.id));
      node.querySelector("[data-action='edit']").addEventListener("click", () => editDeckPreset(preset.id));
      node.querySelector("[data-action='copy']").addEventListener("click", () => copyDeckPreset(preset.id));
      node.querySelector("[data-action='delete']").addEventListener("click", () => deleteDeckPreset(preset.id));
      el.deckPresetGrid.append(node);
    });
}

function useDeckPreset(id) {
  if (!gridProfile.presets[id]) return;
  gridProfile.activePresetId = id;
  saveGridProfile();
  applyActivePresetToStorage();
  renderDeckPresetScreen();
  el.modeNotice.textContent = `${gridProfile.presets[id].name}を使用デッキにしました。`;
}

function editDeckPreset(id) {
  if (!gridProfile.presets[id]) return;
  gridProfile.activePresetId = id;
  saveGridProfile();
  applyActivePresetToStorage();
  el.deckPresetScreen?.classList.remove("open");
  el.deckPresetScreen?.setAttribute("aria-hidden", "true");
  openDeckEditor();
}

function createDeckPreset() {
  const id = `deck_${Date.now().toString(36)}`;
  gridProfile.presets[id] = {
    id,
    name: `デッキ ${Object.keys(gridProfile.presets).length + 1}`,
    deck: [...DECK],
    leaderTraitId: "bulwark",
    updatedAt: new Date().toISOString()
  };
  gridProfile.activePresetId = id;
  saveGridProfile();
  editDeckPreset(id);
}

function copyDeckPreset(id) {
  const source = gridProfile.presets[id];
  if (!source) return;
  const copyId = `deck_${Date.now().toString(36)}`;
  gridProfile.presets[copyId] = {
    ...source,
    id: copyId,
    name: `${source.name} コピー`.slice(0, 32),
    deck: [...source.deck],
    updatedAt: new Date().toISOString()
  };
  gridProfile.activePresetId = copyId;
  saveGridProfile();
  renderDeckPresetScreen();
}

function deleteDeckPreset(id) {
  if (!gridProfile.presets[id] || Object.keys(gridProfile.presets).length <= 1) {
    el.modeNotice.textContent = "最後のプリセットは削除できません。";
    return;
  }
  delete gridProfile.presets[id];
  if (gridProfile.activePresetId === id) gridProfile.activePresetId = Object.keys(gridProfile.presets)[0];
  saveGridProfile();
  applyActivePresetToStorage();
  renderDeckPresetScreen();
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
      updateActivePresetFromEditor();
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
    markOnlineChanged();
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
  document.querySelector(".choice-peek-return")?.remove();
  if (!state.choice) return;
  const choice = state.choice;
  if (choice.type !== "returnDraw") return;
  if (choice.peeking) {
    const returnButton = document.createElement("button");
    returnButton.className = "choice-peek-return";
    returnButton.type = "button";
    returnButton.textContent = "選択に戻る";
    returnButton.addEventListener("click", () => {
      choice.peeking = false;
      renderChoiceModal();
    });
    el.stage.append(returnButton);
    return;
  }
  const owner = side(choice.sideName);
  const selectedIndex = normalizeChoiceSelectedIndex(choice, owner.hand);
  const selectedCard = owner.hand[selectedIndex] || null;
  const layer = document.createElement("section");
  layer.className = "choice-layer";
  layer.innerHTML = `
    <div class="choice-dialog" role="dialog" aria-modal="true" aria-labelledby="choiceTitle">
      <div class="choice-copy">
        <strong id="choiceTitle">${escapeHtml(choice.sourceName)}</strong>
        <p>デッキに戻す手札を1枚選んでください。</p>
      </div>
      <div class="choice-body">
        <div class="choice-card-grid" aria-label="候補カード"></div>
        <section class="choice-focus-panel" aria-label="フォーカス">
          <div class="choice-focus-card"></div>
          <div class="choice-focus-copy"></div>
        </section>
      </div>
      <div class="choice-actions">
        <button class="choice-action-button" type="button" data-choice-action="peek">盤面を見る</button>
        <button class="choice-action-button primary" type="button" data-choice-action="confirm">選択する</button>
      </div>
    </div>
  `;
  const grid = layer.querySelector(".choice-card-grid");
  const focusCard = layer.querySelector(".choice-focus-card");
  const focusCopy = layer.querySelector(".choice-focus-copy");
  const confirmButton = layer.querySelector("[data-choice-action='confirm']");
  owner.hand.forEach((card, index) => {
    const button = document.createElement("div");
    button.className = "choice-card";
    button.classList.toggle("selected", index === selectedIndex);
    button.tabIndex = 0;
    button.setAttribute("role", "button");
    button.setAttribute("aria-label", `${card.name}を確認`);
    button.setAttribute("aria-pressed", String(index === selectedIndex));
    const cardNode = makeCardNode(card);
    cardNode.tabIndex = -1;
    cardNode.setAttribute("aria-hidden", "true");
    const preview = document.createElement("span");
    preview.className = "choice-card-preview";
    preview.append(cardNode);
    button.append(preview);
    const name = document.createElement("span");
    name.textContent = card.name;
    button.append(name);
    button.addEventListener("click", () => {
      choice.selectedIndex = index;
      renderChoiceModal();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      choice.selectedIndex = index;
      renderChoiceModal();
    });
    grid.append(button);
  });
  if (selectedCard) {
    const focusNode = makeCardNode(selectedCard);
    focusNode.addEventListener("click", () => showCardZoom(selectedCard, { className: "manual-zoom", closeOnClick: true }));
    focusCard.append(focusNode);
    focusCopy.innerHTML = `
      <strong>${escapeHtml(selectedCard.name)}</strong>
      <span>${escapeHtml(kindLabel(selectedCard.kind))} / コスト ${selectedCard.cost}</span>
      <small>${renderEffectText(selectedCard.text)}</small>
    `;
  }
  confirmButton.disabled = selectedIndex < 0;
  confirmButton.addEventListener("click", () => {
    if (selectedIndex < 0) return;
    completeReturnDrawChoice(choice.sideName, selectedIndex, choice.sourceName);
  });
  layer.querySelector("[data-choice-action='peek']").addEventListener("click", () => {
    choice.peeking = true;
    renderChoiceModal();
  });
  layer.addEventListener("click", handleEffectTagClick);
  el.stage.append(layer);
}

function normalizeChoiceSelectedIndex(choice, cards) {
  if (!cards.length) return -1;
  if (!Number.isInteger(choice.selectedIndex) || choice.selectedIndex < 0 || choice.selectedIndex >= cards.length) {
    choice.selectedIndex = 0;
  }
  return choice.selectedIndex;
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
  markOnlineChanged();
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

function normalizeKeywordDigits(keyword) {
  return String(keyword || "")
    .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
    .replace(/＿/g, "_");
}

function keywordHelpText(keyword) {
  const normalized = normalizeKeywordDigits(keyword);
  const guard = normalized.match(/^守護_(\d+)$/);
  if (guard) return `1つ後ろにいるユニットが受けるダメージを${guard[1]}軽減する。`;
  return EFFECT_KEYWORD_HELP[keyword] || EFFECT_KEYWORD_HELP[normalized] || "このキーワードの説明は準備中です。";
}

function showKeywordHelp(keyword) {
  const title = keyword || "";
  const text = keywordHelpText(title);
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
  markOnlineChanged(true);
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
  updateActivePresetFromEditor();
  if (EMBEDDED_MODE) {
    navigateHost("home");
    return;
  }
  closeDeckEditor();
}

setupMigrationUi();

el.endTurn.addEventListener("click", endTurn);
el.cpuModeButton.addEventListener("click", startCpuMode);
el.onlineModeButton.addEventListener("click", () => {
  el.roomPanel.hidden = !el.roomPanel.hidden;
  el.modeNotice.textContent = el.roomPanel.hidden ? "" : "ルームを作るか、IDを入力して参加してください。";
});
el.rankedModeButton?.addEventListener("click", startRankedOnline);
el.createRoomButton?.addEventListener("click", createRoomOnline);
el.joinRoomButton?.addEventListener("click", joinRoomOnline);
el.gridLoginOpenButton?.addEventListener("click", () => openAuthDialog("login"));
el.gridLogoutButton?.addEventListener("click", logoutAccount);
el.gridAuthCancelButton?.addEventListener("click", closeAuthDialog);
el.gridAuthSwitchButton?.addEventListener("click", () => {
  authMode = authMode === "login" ? "register" : "login";
  renderAuthDialog();
});
el.gridAuthSubmitButton?.addEventListener("click", submitAuthDialog);
el.gridAuthPassword?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitAuthDialog();
});
el.deckModeButton.addEventListener("click", openDeckPresetScreen);
el.deckEditButton.addEventListener("click", openDeckPresetScreen);
el.deckPresetBackButton?.addEventListener("click", closeDeckPresetScreen);
el.deckPresetCreateButton?.addEventListener("click", createDeckPreset);
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
  if (event.key === "Escape" && state.choice?.peeking) {
    state.choice.peeking = false;
    renderChoiceModal();
  }
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
renderAccountPanel();
syncAccountFromServer().finally(() => {
  renderDeckPresetScreen();
});
if (EMBEDDED_MODE) {
  if (ENTRY_MODE === "deck") {
    hideModeSelect();
    openDeckPresetScreen();
  } else if (ENTRY_MODE === "menu") {
    showModeSelect();
  } else {
    hideModeSelect();
  }
} else if (location.hash !== "#deck") {
  showModeSelect();
}
