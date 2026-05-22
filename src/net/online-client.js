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

  class OnlineClient {
    constructor(session) {
      this.roomId = session.roomId;
      this.playerId = session.playerId;
      this.seat = session.seat;
    }

    static async createRoom(deck, environmentDeck) {
      const session = await requestJson("/api/rooms", {
        method: "POST",
        body: { deck, environmentDeck },
      });
      this.saveSession(session);
      return new OnlineClient(session);
    }

    static async joinRoom(roomId, deck, environmentDeck) {
      const session = await requestJson(`/api/rooms/${normalizeRoomId(roomId)}/join`, {
        method: "POST",
        body: { deck, environmentDeck },
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
      this.isOnline = true;
      this.status = "waiting";
      this.turn = 1;
      this.active = "enemy";
      this.finished = false;
      this.won = false;
      this.busy = false;
      this.currentEnvironment = null;
      this.naturalEnvironmentLevel = 1;
      this.environmentCycle = 0;
      this.logItems = [];
      this.pendingChoice = null;
      this.player = emptyDuelist("Player");
      this.enemy = emptyDuelist("Opponent");
      this.pollTimer = 0;
      this.fetching = false;
      this.reportedResult = false;
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
      return this.status === "playing" && this.active === "player" && !this.pendingChoice && !this.busy && !this.finished;
    }

    async playFromHand(index) {
      return this.sendAction({ type: "playFromHand", index });
    }

    async chargeFromHand(index) {
      return this.sendAction({ type: "charge", index });
    }

    async setReaction(index) {
      return this.sendAction({ type: "setReaction", index });
    }

    async attackWithUnit(attackerIndex, targetIndex) {
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
      this.active = snapshot.active || "enemy";
      this.finished = Boolean(snapshot.finished);
      this.won = Boolean(snapshot.won);
      this.pendingChoice = snapshot.pendingChoice || null;
      this.currentEnvironment = snapshot.currentEnvironment || null;
      this.naturalEnvironmentLevel = snapshot.naturalEnvironmentLevel || 1;
      this.environmentCycle = snapshot.environmentCycle || 0;

      if (snapshot.status === "waiting") {
        this.player = emptyDuelist("Player");
        this.enemy = emptyDuelist("Opponent");
        this.logItems = [snapshot.message || `ルーム ${snapshot.roomId}: 相手の参加待ち`];
      } else {
        this.player = normalizeDuelist(snapshot.player, "Player");
        this.enemy = normalizeDuelist(snapshot.enemy, "Opponent");
        this.logItems = snapshot.logItems || [];
      }

      this.onChange(this);
      if (this.pendingChoice) this.handlePendingChoice(this.pendingChoice);
      if (this.finished && !this.reportedResult) {
        this.reportedResult = true;
        this.onResult(this.won, this);
      }
    }

    async handlePendingChoice(choice) {
      if (this.choiceInFlight === choice.id) return;
      this.choiceInFlight = choice.id;
      try {
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

    getUnitAtk(player, unit) {
      if (!unit || !cards[unit.id]) return 0;
      const card = cards[unit.id];
      let atk = card.atk + (unit.atkMod || 0);
      if (card.name.includes("星導の衛士カイ")) atk += player.cores.filter(Boolean).length * 300;
      if (card.name.includes("黒機") && player.cores.includes("black_tower")) atk += 200;
      atk += this.getEnvironmentAtkMod();
      return atk;
    }

    getEnvironmentAtkMod() {
      const environment = cards[this.currentEnvironment];
      if (!environment || environment.type !== "環境") return 0;
      if (environment.family === "晴れ") return environment.level * 100;
      if (environment.family === "雪") return environment.level * -100;
      return 0;
    }
  }

  function emptyDuelist(name) {
    return {
      name,
      lp: MAX_LP,
      deck: [],
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
