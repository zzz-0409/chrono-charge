(function () {
  "use strict";

  const {
    MAX_LP,
    UNIT_ZONES,
    CORE_ZONES,
    REACTION_ZONES,
    cards,
  } = window.Chrono;

  const POLL_MS = 900;
  const SESSION_KEY = "chrono-charge-online-session";
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

  class OnlineClient {
    constructor(session) {
      this.roomId = session.roomId;
      this.playerId = session.playerId;
      this.seat = session.seat;
    }

    static async createRoom(deck, driveDeck) {
      const session = await requestJson("/api/rooms", {
        method: "POST",
        body: { deck, driveDeck },
      });
      this.saveSession(session);
      return new OnlineClient(session);
    }

    static async joinRoom(roomId, deck, driveDeck) {
      const session = await requestJson(`/api/rooms/${normalizeRoomId(roomId)}/join`, {
        method: "POST",
        body: { deck, driveDeck },
      });
      this.saveSession(session);
      return new OnlineClient(session);
    }

    static saveSession(session) {
      try {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } catch {
        // localStorage is only a convenience for reload recovery.
      }
    }

    async state() {
      const query = new URLSearchParams({ playerId: this.playerId });
      return requestJson(`/api/rooms/${this.roomId}/state?${query}`);
    }

    async action(action) {
      return requestJson(`/api/rooms/${this.roomId}/action`, {
        method: "POST",
        body: {
          playerId: this.playerId,
          action,
        },
      });
    }
  }

  class OnlineGameProxy {
    constructor(options) {
      this.client = options.client;
      this.toast = options.toast || (() => {});
      this.onChange = options.onChange || (() => {});
      this.onResult = options.onResult || (() => {});
      this.requestCardChoice = options.requestCardChoice || (async () => null);
      this.showActivation = options.showActivation || (async () => {});
      this.isOnline = true;
      this.status = "waiting";
      this.turn = 1;
      this.firstActive = "enemy";
      this.completedTurns = 0;
      this.active = "enemy";
      this.finished = false;
      this.won = false;
      this.busy = false;
      this.logItems = [];
      this.pendingChoice = null;
      this.waitingChoice = null;
      this.player = emptyDuelist("Player");
      this.enemy = emptyDuelist("Opponent");
      this.pollTimer = 0;
      this.fetching = false;
      this.reportedResult = false;
      this.seenActivationEvents = new Set();
      this.activationQueue = Promise.resolve();
    }

    start() {
      this.fetchState();
      this.pollTimer = window.setInterval(() => this.fetchState(true), POLL_MS);
    }

    dispose() {
      window.clearInterval(this.pollTimer);
      this.pollTimer = 0;
    }

    canPlayerAct() {
      return this.status === "playing" && this.active === "player" && !this.pendingChoice && !this.waitingChoice && !this.busy && !this.finished;
    }

    canAttack() {
      if (!this.canPlayerAct()) return false;
      return !(this.turn === 1 && this.firstActive === "player" && this.completedTurns === 0);
    }

    async playFromHand(index, slotIndex = null) {
      return this.sendAction({ type: "playFromHand", index, slotIndex });
    }

    async chargeFromHand(index) {
      return this.sendAction({ type: "charge", index });
    }

    async setReaction(index, slotIndex = null) {
      return this.sendAction({ type: "setReaction", index, slotIndex });
    }

    async attackWithUnit(attackerIndex, targetIndex) {
      if (!this.canAttack()) return false;
      return this.sendAction({ type: "attack", attackerIndex, targetIndex });
    }

    async endPlayerTurn() {
      return this.sendAction({ type: "endTurn" });
    }

    async sendAction(action) {
      if (!this.canPlayerAct()) return false;
      this.busy = true;
      this.onChange(this);
      try {
        const snapshot = await this.client.action(action);
        this.busy = false;
        this.applySnapshot(snapshot);
        return true;
      } catch (error) {
        this.busy = false;
        this.toast(error.message || "オンライン通信に失敗しました。");
        this.onChange(this);
        return false;
      }
    }

    async fetchState(silent = false) {
      if (this.fetching) return;
      this.fetching = true;
      try {
        const snapshot = await this.client.state();
        this.applySnapshot(snapshot);
      } catch (error) {
        if (!silent) this.toast(error.message || "ルーム状態を取得できません。");
      } finally {
        this.fetching = false;
      }
    }

    applySnapshot(snapshot) {
      this.status = snapshot.status;
      this.turn = snapshot.turn || 1;
      this.firstActive = snapshot.firstActive || "enemy";
      this.completedTurns = Number(snapshot.completedTurns || 0);
      this.active = snapshot.active || "enemy";
      this.finished = Boolean(snapshot.finished);
      this.won = Boolean(snapshot.won);
      this.pendingChoice = snapshot.pendingChoice || null;
      this.waitingChoice = snapshot.waitingChoice || null;

      if (snapshot.status === "waiting") {
        this.player = emptyDuelist("Player");
        this.enemy = emptyDuelist("Opponent");
        this.logItems = [snapshot.message || `ルーム ${snapshot.roomId}: 相手の参加待ち`];
      } else {
        this.player = normalizeDuelist(snapshot.player, "Player");
        this.enemy = normalizeDuelist(snapshot.enemy, "Opponent");
        this.logItems = snapshot.logItems || [];
      }

      const animationReady = this.queueActivationEvents(snapshot.activationEvents || []);
      this.onChange(this);
      if (this.pendingChoice) {
        const pending = this.pendingChoice;
        animationReady.then(() => {
          if (this.pendingChoice?.id === pending.id) this.handlePendingChoice(pending);
        });
      }
      if (this.finished && !this.reportedResult) {
        this.reportedResult = true;
        this.onResult(this.won, this);
      }
    }

    queueActivationEvents(events) {
      const freshEvents = events.filter((event) => {
        if (!event?.eventId || this.seenActivationEvents.has(event.eventId)) return false;
        this.seenActivationEvents.add(event.eventId);
        return true;
      });
      if (freshEvents.length === 0) return this.activationQueue;

      this.activationQueue = this.activationQueue.then(async () => {
        for (const event of freshEvents) {
          await this.showActivation({ id: event.id, owner: event.owner, kind: event.kind });
        }
      });
      return this.activationQueue;
    }

    async handlePendingChoice(choice) {
      if (this.choiceInFlight === choice.id) return;
      this.choiceInFlight = choice.id;
      try {
        if (choice.delayBeforeOpenMs) await pause(choice.delayBeforeOpenMs);
        const index = await this.requestCardChoice(choice);
        await this.client.action({
          type: "choice",
          choiceId: choice.id,
          index,
        });
        this.choiceInFlight = null;
        await this.fetchState();
      } catch (error) {
        this.choiceInFlight = null;
        this.toast(error.message || "カード選択に失敗しました。");
      }
    }

    canPlayCard(player, card) {
      if (card.type === "ユニット") return player.units.some((unit) => !unit);
      if (card.type === "コア") return player.cores.some((core) => !core);
      return card.type === "スペル";
    }

    canSetReaction(player) {
      return player.reactions.some((card) => !card);
    }

    canPay(player, cost) {
      return player.charge.filter((charge) => !charge.tapped).length >= cost;
    }

    controlsCard(player, id) {
      return player.units.some((unit) => unit?.id === id);
    }

    hasSosaiPairMate(player, id) {
      if (SOSAI_DRIVE_PAIR_IDS.includes(id)) return true;
      return SOSAI_PAIRS.some(([first, second]) => (
        (id === first && this.controlsCard(player, second)) ||
        (id === second && this.controlsCard(player, first))
      ));
    }

    getUnitAtk(player, unit) {
      if (!unit || !cards[unit.id]) return 0;
      const card = cards[unit.id];
      let atk = card.atk + (unit.atkMod || 0);
      if (card.name.includes("星導の衛士カイ")) atk += player.cores.filter(Boolean).length * 300;
      if (cardHasTheme(card, "黒機") && player.cores.includes("black_tower")) atk += 200;
      if (cardHasTheme(card, "断刃") && player.cores.includes("blade_scaffold")) atk += 200;
      if (cardHasTheme(card, "電脳") && player.cores.includes("cyber_network")) atk += 100;
      if (cardHasTheme(card, "双彩") && player.cores.includes("sosai_pop_stage") && this.hasSosaiPairMate(player, unit.id)) atk += 300;
      if (cardHasTheme(card, "星導") && player.cores.includes("drive_star_core")) atk += 300;
      if (cardHasTheme(card, "黒機") && player.cores.includes("drive_black_core")) atk += 300;
      if (cardHasTheme(card, "断刃") && player.cores.includes("drive_blade_core")) atk += 300;
      if (cardHasTheme(card, "電脳") && player.cores.includes("drive_cyber_core")) atk += 200;
      if (cardHasTheme(card, "双彩") && player.cores.includes("drive_sosai_core") && this.hasSosaiPairMate(player, unit.id)) atk += 500;
      return atk;
    }
  }

  function cardHasTheme(card, theme) {
    return Boolean(card && (card.theme === theme || card.name.includes(theme)));
  }

  function emptyDuelist(name) {
    return {
      name,
      lp: MAX_LP,
      deck: [],
      driveDeck: [],
      driveUsed: [],
      hand: [],
      grave: [],
      charge: [],
      units: Array(UNIT_ZONES).fill(null),
      cores: Array(CORE_ZONES).fill(null),
      reactions: Array(REACTION_ZONES).fill(null),
      chargedThisTurn: false,
    };
  }

  function normalizeDuelist(source, fallbackName) {
    const player = emptyDuelist(source?.name || fallbackName);
    if (!source) return player;
    return {
      ...player,
      ...source,
      deck: source.deck || [],
      driveDeck: source.driveDeck || [],
      driveUsed: source.driveUsed || [],
      hand: source.hand || [],
      grave: source.grave || [],
      charge: source.charge || [],
      units: padArray(source.units, UNIT_ZONES),
      cores: padArray(source.cores, CORE_ZONES),
      reactions: padArray(source.reactions, REACTION_ZONES),
      chargedThisTurn: Boolean(source.chargedThisTurn),
    };
  }

  function padArray(source, size) {
    const result = Array.isArray(source) ? source.slice(0, size) : [];
    while (result.length < size) result.push(null);
    return result;
  }

  function normalizeRoomId(roomId) {
    return String(roomId || "").trim().toUpperCase();
  }

  function pause(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function requestJson(url, options = {}) {
    const response = await window.fetch(url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
  }

  Object.assign(window.Chrono, {
    OnlineClient,
    OnlineGameProxy,
  });
})();
