(function () {
  "use strict";

  const {
    DECK_SIZE,
    MAX_COPIES,
    ENVIRONMENT_DECK_PER_LEVEL,
    STORAGE_KEY,
    cards,
    environmentPool,
    starterDeck,
    starterEnvironmentDeck,
  } = window.Chrono;

  const STORE_VERSION = 2;
  const DEFAULT_ACCOUNT = "Player";
  const DEFAULT_DECK_ID = "main";

  const autoDeckTemplates = {
    star: {
      label: "星導おまかせ",
      main: starterDeck,
      environment: starterEnvironmentDeck,
    },
    black: {
      label: "黒機おまかせ",
      main: {
        black_grinder: 3,
        black_gear: 3,
        black_anchor: 3,
        black_tower: 3,
        black_raid: 3,
        black_claw: 3,
        generic_code: 3,
        generic_wall: 3,
        generic_transfer: 3,
        generic_bind: 3,
        generic_recall: 2,
        generic_zero: 2,
        generic_vanguard: 2,
        generic_lancer: 2,
        generic_crusher: 2,
      },
      environment: {
        env_wind_l1: 1,
        env_snow_l1: 1,
        env_star_l1: 1,
        env_wind_cross_l2: 1,
        env_snow_blizzard_l2: 1,
        env_star_meteor_l2: 1,
        env_wind_tornado_l3: 1,
        env_snow_glacier_l3: 1,
        env_star_shower_l3: 1,
      },
    },
    blade: {
      label: "断刃おまかせ",
      main: {
        blade_tracker: 3,
        blade_marksmith: 3,
        blade_edgeguard: 3,
        blade_executioner: 3,
        blade_arbiter: 2,
        blade_mark: 3,
        blade_cleave: 3,
        blade_warrant: 3,
        blade_scaffold: 3,
        blade_counter: 3,
        black_anchor: 2,
        black_raid: 2,
        generic_code: 2,
        generic_wall: 2,
        generic_transfer: 1,
        generic_zero: 2,
      },
      environment: {
        env_wind_l1: 1,
        env_snow_l1: 1,
        env_star_l1: 1,
        env_wind_cross_l2: 1,
        env_snow_blizzard_l2: 1,
        env_star_meteor_l2: 1,
        env_wind_tornado_l3: 1,
        env_snow_glacier_l3: 1,
        env_star_shower_l3: 1,
      },
    },
    cyber: {
      label: "電脳おまかせ",
      main: {
        cyber_mio: 3,
        cyber_rei: 3,
        cyber_shion: 3,
        cyber_yuna: 3,
        cyber_akari: 2,
        cyber_preview: 3,
        cyber_intrusion: 3,
        cyber_network: 3,
        cyber_shield: 3,
        cyber_counterhack: 3,
        generic_transfer: 3,
        generic_code: 2,
        generic_wall: 2,
        generic_zero: 2,
        generic_bind: 2,
      },
      environment: {
        env_sun_l1: 1,
        env_wind_l1: 1,
        env_star_l1: 1,
        env_sun_clear_l2: 1,
        env_wind_gust_l2: 1,
        env_star_aurora_l2: 1,
        env_sun_scorch_l3: 1,
        env_wind_storm_l3: 1,
        env_star_revelation_l3: 1,
      },
    },
    sosai: {
      label: "双彩おまかせ",
      main: {
        sosai_hikari: 3,
        sosai_mint: 3,
        sosai_nene: 3,
        sosai_ruri: 3,
        sosai_coco: 3,
        sosai_luna: 2,
        sosai_live_start: 3,
        sosai_heart_sync: 3,
        sosai_pop_stage: 3,
        sosai_stream_cancel: 3,
        generic_transfer: 3,
        generic_code: 2,
        generic_wall: 2,
        generic_zero: 2,
        generic_bind: 2,
      },
      environment: {
        env_sun_l1: 1,
        env_star_l1: 1,
        env_wind_l1: 1,
        env_sun_clear_l2: 1,
        env_star_aurora_l2: 1,
        env_wind_gust_l2: 1,
        env_sun_gold_l3: 1,
        env_star_revelation_l3: 1,
        env_wind_storm_l3: 1,
      },
    },
    balance: {
      label: "バランスおまかせ",
      main: {
        star_scout: 2,
        star_lux: 2,
        star_mira: 2,
        star_guard: 2,
        star_dragon: 1,
        star_invite: 2,
        star_link: 2,
        star_orbit: 2,
        star_wall: 2,
        star_interference: 1,
        black_grinder: 2,
        black_gear: 2,
        black_anchor: 2,
        black_tower: 2,
        black_raid: 2,
        black_claw: 2,
        generic_code: 2,
        generic_wall: 2,
        generic_transfer: 2,
        generic_bind: 2,
        generic_recall: 1,
        generic_zero: 1,
      },
      environment: starterEnvironmentDeck,
    },
  };

  class DeckStore {
    constructor(storage = window.localStorage) {
      this.storage = storage;
      const loaded = this.load();
      this.data = loaded.data;
      this.activeAccount = loaded.activeAccount;
      this.activeDeckId = loaded.activeDeckId;
      this.counts = loaded.counts;
      this.environmentCounts = loaded.environmentCounts;
    }

    load() {
      try {
        const saved = JSON.parse(this.storage.getItem(STORAGE_KEY));
        if (saved && typeof saved === "object") {
          if (saved.version === STORE_VERSION && saved.accounts) {
            return this.normalizeState(saved);
          }
          if (saved.mainDeck || saved.environmentDeck) {
            return this.stateFromDeck(saved.mainDeck || saved.counts || {}, saved.environmentDeck || {});
          }
          return this.stateFromDeck(saved, starterEnvironmentDeck);
        }
      } catch {
        this.storage.removeItem(STORAGE_KEY);
      }
      return this.stateFromDeck(starterDeck, starterEnvironmentDeck);
    }

    normalizeState(saved) {
      const data = {
        version: STORE_VERSION,
        activeAccount: normalizeAccountName(saved.activeAccount),
        accounts: {},
      };

      Object.entries(saved.accounts || {}).forEach(([rawName, account]) => {
        const accountName = normalizeAccountName(rawName);
        data.accounts[accountName] = this.normalizeAccount(accountName, account);
      });

      if (Object.keys(data.accounts).length === 0) {
        data.accounts[DEFAULT_ACCOUNT] = this.defaultAccount(starterDeck, starterEnvironmentDeck);
      }
      if (!data.accounts[data.activeAccount]) data.activeAccount = Object.keys(data.accounts)[0];

      const activeAccount = data.accounts[data.activeAccount];
      if (!activeAccount.decks[activeAccount.activeDeckId]) activeAccount.activeDeckId = Object.keys(activeAccount.decks)[0];
      const activeDeck = activeAccount.decks[activeAccount.activeDeckId];

      return {
        data,
        activeAccount: data.activeAccount,
        activeDeckId: activeAccount.activeDeckId,
        counts: this.normalizeMain(activeDeck.mainDeck),
        environmentCounts: this.normalizeEnvironment(activeDeck.environmentDeck),
      };
    }

    normalizeAccount(accountName, account = {}) {
      const decks = {};
      Object.entries(account.decks || {}).forEach(([rawId, deck]) => {
        const id = sanitizeId(rawId);
        decks[id] = this.normalizeDeck(id, deck);
      });

      if (Object.keys(decks).length === 0) {
        decks[DEFAULT_DECK_ID] = this.createDeck(DEFAULT_DECK_ID, "メインデッキ", starterDeck, starterEnvironmentDeck);
      }

      const activeDeckId = sanitizeId(account.activeDeckId);
      return {
        name: accountName,
        activeDeckId: decks[activeDeckId] ? activeDeckId : Object.keys(decks)[0],
        decks,
      };
    }

    normalizeDeck(id, deck = {}) {
      return this.createDeck(
        id,
        deck.name || "メインデッキ",
        deck.mainDeck || deck.counts || {},
        deck.environmentDeck || deck.environmentCounts || {},
        deck.updatedAt
      );
    }

    stateFromDeck(mainDeck, environmentDeck) {
      const data = {
        version: STORE_VERSION,
        activeAccount: DEFAULT_ACCOUNT,
        accounts: {
          [DEFAULT_ACCOUNT]: this.defaultAccount(mainDeck, environmentDeck),
        },
      };

      return {
        data,
        activeAccount: DEFAULT_ACCOUNT,
        activeDeckId: DEFAULT_DECK_ID,
        counts: this.normalizeMain(mainDeck),
        environmentCounts: this.normalizeEnvironment(environmentDeck),
      };
    }

    defaultAccount(mainDeck, environmentDeck) {
      return {
        name: DEFAULT_ACCOUNT,
        activeDeckId: DEFAULT_DECK_ID,
        decks: {
          [DEFAULT_DECK_ID]: this.createDeck(DEFAULT_DECK_ID, "メインデッキ", mainDeck, environmentDeck),
        },
      };
    }

    createDeck(id, name, mainDeck, environmentDeck, updatedAt = new Date().toISOString()) {
      return {
        id,
        name: normalizeDeckName(name),
        mainDeck: this.normalizeMain(mainDeck),
        environmentDeck: this.normalizeEnvironment(environmentDeck),
        updatedAt,
      };
    }

    normalizeMain(source = {}) {
      const result = {};
      Object.entries(source).forEach(([id, count]) => {
        if (!cards[id] || cards[id].type === "環境") return;
        const safeCount = Math.max(0, Math.min(MAX_COPIES, Number(count) || 0));
        if (safeCount > 0) result[id] = safeCount;
      });
      return trimDeck(result);
    }

    normalizeEnvironment(source = {}) {
      const result = {};
      const entries = (Array.isArray(source) ? source.map((id) => [id, 1]) : Object.entries(source))
        .sort((a, b) => (cards[a[0]]?.level || 0) - (cards[b[0]]?.level || 0));
      entries.forEach(([id, count]) => {
        const card = cards[id];
        if (!card || card.type !== "環境") return;
        const safeCount = Math.max(0, Math.min(1, Number(count) || 0));
        if (safeCount > 0 && this.canIncludeEnvironment(result, card)) {
          result[id] = safeCount;
        }
      });
      return this.fillEnvironmentDefaults(result);
    }

    fillEnvironmentDefaults(result) {
      const next = { ...result };
      [1, 2, 3].forEach((level) => {
        this.environmentFillCandidates(level).forEach((id) => {
          const card = cards[id];
          if (!card || next[id] || !this.canIncludeEnvironment(next, card)) return;
          next[id] = 1;
        });
      });
      return next;
    }

    environmentFillCandidates(level) {
      const starterIds = Object.keys(starterEnvironmentDeck).filter((id) => cards[id]?.level === level);
      const poolIds = environmentPool.filter((card) => card.level === level).map((card) => card.id);
      return [...starterIds, ...poolIds.filter((id) => !starterIds.includes(id))];
    }

    canIncludeEnvironment(source, card) {
      if (!card || card.type !== "環境") return false;
      if (this.environmentLevelTotal(source, card.level) >= ENVIRONMENT_DECK_PER_LEVEL) return false;
      if (this.environmentLevelHasFamily(source, card.level, card.family)) return false;
      if (card.level > 1 && !this.environmentLevelHasFamily(source, 1, card.family)) return false;
      if (card.level === 2 && this.environmentLevelTotal(source, 1) < ENVIRONMENT_DECK_PER_LEVEL) return false;
      if (card.level === 3 && this.environmentLevelTotal(source, 2) < ENVIRONMENT_DECK_PER_LEVEL) return false;
      return true;
    }

    save(name = this.activeDeck?.name) {
      const deck = this.saveActiveDeck(name);
      this.persist();
      return deck;
    }

    saveActiveDeck(name = this.activeDeck?.name) {
      const account = this.activeAccountData;
      const deck = this.createDeck(this.activeDeckId, name, this.counts, this.environmentCounts);
      account.decks[this.activeDeckId] = deck;
      account.activeDeckId = this.activeDeckId;
      return deck;
    }

    saveAs(name) {
      const account = this.activeAccountData;
      const id = uniqueDeckId(account.decks);
      this.activeDeckId = id;
      account.activeDeckId = id;
      const deck = this.createDeck(id, name || this.nextDeckName(), this.counts, this.environmentCounts);
      account.decks[id] = deck;
      this.persist();
      return deck;
    }

    loadPreset(id) {
      const account = this.activeAccountData;
      const deck = account.decks[id];
      if (!deck) return false;
      this.activeDeckId = id;
      account.activeDeckId = id;
      this.counts = this.normalizeMain(deck.mainDeck);
      this.environmentCounts = this.normalizeEnvironment(deck.environmentDeck);
      this.persist();
      return true;
    }

    deletePreset(id) {
      const account = this.activeAccountData;
      if (!account.decks[id] || Object.keys(account.decks).length <= 1) return false;
      delete account.decks[id];
      if (this.activeDeckId === id) {
        this.activeDeckId = Object.keys(account.decks)[0];
        account.activeDeckId = this.activeDeckId;
        this.loadPreset(this.activeDeckId);
        return true;
      }
      this.persist();
      return true;
    }

    switchAccount(name) {
      const accountName = normalizeAccountName(name);
      if (!this.data.accounts[accountName]) {
        this.data.accounts[accountName] = this.defaultAccount(starterDeck, starterEnvironmentDeck);
        this.data.accounts[accountName].name = accountName;
      }
      this.activeAccount = accountName;
      this.data.activeAccount = accountName;

      const account = this.activeAccountData;
      this.activeDeckId = account.activeDeckId;
      const deck = account.decks[this.activeDeckId];
      this.counts = this.normalizeMain(deck.mainDeck);
      this.environmentCounts = this.normalizeEnvironment(deck.environmentDeck);
      this.persist();
      return account;
    }

    autoBuild(mode = "star") {
      const template = autoDeckTemplates[mode] || autoDeckTemplates.star;
      this.counts = this.completeMainDeck(template.main);
      this.environmentCounts = this.normalizeEnvironment(template.environment);
      return template.label;
    }

    completeMainDeck(source) {
      const result = this.normalizeMain(source);
      const candidates = Object.values(cards)
        .filter((card) => card.type !== "環境")
        .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ja"));

      for (const card of candidates) {
        while ((result[card.id] || 0) < MAX_COPIES && deckTotal(result) < DECK_SIZE) {
          result[card.id] = (result[card.id] || 0) + 1;
        }
        if (deckTotal(result) >= DECK_SIZE) break;
      }

      return result;
    }

    persist() {
      this.data.activeAccount = this.activeAccount;
      this.storage.setItem(STORAGE_KEY, JSON.stringify({
        version: STORE_VERSION,
        activeAccount: this.activeAccount,
        accounts: this.data.accounts,
      }));
    }

    reset() {
      this.counts = { ...starterDeck };
      this.environmentCounts = { ...starterEnvironmentDeck };
    }

    clear() {
      this.counts = {};
      this.environmentCounts = {};
    }

    add(id) {
      if (!cards[id] || cards[id].type === "環境") return { ok: false, reason: "unknown" };
      if (this.total >= DECK_SIZE) return { ok: false, reason: "full" };
      if ((this.counts[id] || 0) >= MAX_COPIES) return { ok: false, reason: "copies" };
      this.counts[id] = (this.counts[id] || 0) + 1;
      return { ok: true };
    }

    remove(id) {
      if (!this.counts[id]) return;
      this.counts[id] -= 1;
      if (this.counts[id] <= 0) delete this.counts[id];
    }

    addEnvironment(id) {
      const card = cards[id];
      if (!card || card.type !== "環境") return { ok: false, reason: "unknown" };
      if (this.environmentCounts[id]) return { ok: false, reason: "copies" };
      if (card.level === 2 && this.environmentLevelTotal(this.environmentCounts, 1) < ENVIRONMENT_DECK_PER_LEVEL) {
        return { ok: false, reason: "levelLocked" };
      }
      if (card.level === 3 && this.environmentLevelTotal(this.environmentCounts, 2) < ENVIRONMENT_DECK_PER_LEVEL) {
        return { ok: false, reason: "levelLocked" };
      }
      if (card.level > 1 && !this.environmentLevelHasFamily(this.environmentCounts, 1, card.family)) {
        return { ok: false, reason: "familyLocked" };
      }
      if (this.environmentLevelHasFamily(this.environmentCounts, card.level, card.family)) {
        return { ok: false, reason: "familyLevelUsed" };
      }
      if (this.environmentLevelTotal(this.environmentCounts, card.level) >= ENVIRONMENT_DECK_PER_LEVEL) {
        return { ok: false, reason: "levelFull" };
      }
      this.environmentCounts[id] = 1;
      return { ok: true };
    }

    removeEnvironment(id) {
      if (!this.environmentCounts[id]) return;
      const removedCard = cards[id];
      delete this.environmentCounts[id];
      if (!removedCard || removedCard.type !== "環境") return;
      Object.keys(this.environmentCounts).forEach((otherId) => {
        const card = cards[otherId];
        if (card?.type === "環境" && card.family === removedCard.family && card.level > removedCard.level) {
          delete this.environmentCounts[otherId];
        }
      });
    }

    get total() {
      return deckTotal(this.counts);
    }

    get list() {
      return Object.entries(this.counts).flatMap(([id, count]) => Array(count).fill(id));
    }

    get environmentList() {
      return Object.keys(this.environmentCounts);
    }

    get environmentReady() {
      return [1, 2, 3].every((level) => this.environmentLevelTotal(this.environmentCounts, level) === ENVIRONMENT_DECK_PER_LEVEL);
    }

    environmentLevelTotal(source, level) {
      return Object.entries(source).reduce((sum, [id, count]) => {
        const card = cards[id];
        return sum + (card?.type === "環境" && card.level === level ? count : 0);
      }, 0);
    }

    environmentLevelHasFamily(source, level, family) {
      return Object.keys(source).some((id) => {
        const card = cards[id];
        return card?.type === "環境" && card.level === level && card.family === family;
      });
    }

    environmentFamiliesAtLevel(level) {
      return Object.keys(this.environmentCounts)
        .map((id) => cards[id])
        .filter((card) => card?.type === "環境" && card.level === level)
        .map((card) => card.family);
    }

    get activeAccountData() {
      return this.data.accounts[this.activeAccount];
    }

    get activeDeck() {
      return this.activeAccountData.decks[this.activeDeckId];
    }

    get accountNames() {
      return Object.keys(this.data.accounts);
    }

    get deckPresets() {
      return Object.values(this.activeAccountData.decks)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }

    nextDeckName() {
      return `デッキ ${this.deckPresets.length + 1}`;
    }

    get stats() {
      const deckCards = this.list.map((id) => cards[id]);
      const themed = deckCards.filter((card) => card.theme).length;
      const reactions = deckCards.filter((card) => card.type === "リアクション").length;
      const avgCost = deckCards.length
        ? deckCards.reduce((sum, card) => sum + card.cost, 0) / deckCards.length
        : 0;

      return {
        total: deckCards.length,
        themeRate: deckCards.length ? Math.round((themed / deckCards.length) * 100) : 0,
        avgCost,
        reactions,
      };
    }

    get environmentStats() {
      return [1, 2, 3].map((level) => ({
        level,
        total: this.environmentLevelTotal(this.environmentCounts, level),
      }));
    }
  }

  function trimDeck(source) {
    const result = {};
    Object.entries(source).some(([id, count]) => {
      const room = DECK_SIZE - deckTotal(result);
      if (room <= 0) return true;
      result[id] = Math.min(count, room);
      return false;
    });
    return result;
  }

  function deckTotal(source) {
    return Object.values(source).reduce((sum, count) => sum + count, 0);
  }

  function normalizeAccountName(name) {
    const text = String(name || "").trim().replace(/\s+/g, " ");
    return text.slice(0, 24) || DEFAULT_ACCOUNT;
  }

  function normalizeDeckName(name) {
    const text = String(name || "").trim().replace(/\s+/g, " ");
    return text.slice(0, 32) || "メインデッキ";
  }

  function sanitizeId(id) {
    return String(id || DEFAULT_DECK_ID).replace(/[^a-zA-Z0-9_-]/g, "_") || DEFAULT_DECK_ID;
  }

  function uniqueDeckId(decks) {
    let id = `deck_${Date.now().toString(36)}`;
    while (decks[id]) id = `deck_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
    return id;
  }

  window.Chrono.DeckStore = DeckStore;
})();
