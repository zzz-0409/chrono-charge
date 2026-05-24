(function () {
  "use strict";

  const {
    DECK_SIZE,
    DRIVE_DECK_SIZE,
    MAX_COPIES,
    MAX_DRIVE_COPIES,
    STORAGE_KEY,
    cards,
    drivePool,
    starterDeck,
    starterDriveDeck,
  } = window.Chrono;

  const STORE_VERSION = 4;
  const DEFAULT_ACCOUNT = "Player";
  const DEFAULT_DECK_ID = "main";
  const MAIN_THEME_THRESHOLD = 10;

  const driveDecks = {
    star: themedDriveDeck("星導"),
    black: themedDriveDeck("黒機"),
    blade: themedDriveDeck("断刃"),
    cyber: themedDriveDeck("電脳"),
    sosai: themedDriveDeck("双彩"),
    balance: starterDriveDeck,
  };

  const autoDeckTemplates = {
    star: {
      label: "星導おまかせ",
      main: starterDeck,
      drive: driveDecks.star,
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
      drive: driveDecks.black,
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
      drive: driveDecks.blade,
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
      drive: driveDecks.cyber,
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
      drive: driveDecks.sosai,
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
      drive: driveDecks.balance,
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
      this.driveCounts = loaded.driveCounts;
    }

    load() {
      try {
        const saved = JSON.parse(this.storage.getItem(STORAGE_KEY));
        if (saved && typeof saved === "object") {
          if (saved.accounts) return this.normalizeState(saved);
          if (saved.mainDeck || saved.counts || saved.driveDeck) {
            return this.stateFromDeck(saved.mainDeck || saved.counts || {}, saved.driveDeck || saved.driveCounts || starterDriveDeck);
          }
          return this.stateFromDeck(saved, starterDriveDeck);
        }
      } catch {
        this.storage.removeItem(STORAGE_KEY);
      }
      return this.stateFromDeck(starterDeck, starterDriveDeck);
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
        data.accounts[DEFAULT_ACCOUNT] = this.defaultAccount(starterDeck, starterDriveDeck);
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
        driveCounts: this.normalizeDrive(activeDeck.driveDeck),
      };
    }

    normalizeAccount(accountName, account = {}) {
      const decks = {};
      Object.entries(account.decks || {}).forEach(([rawId, deck]) => {
        const id = sanitizeId(rawId);
        decks[id] = this.normalizeDeck(id, deck);
      });

      if (Object.keys(decks).length === 0) {
        decks[DEFAULT_DECK_ID] = this.createDeck(DEFAULT_DECK_ID, "メインデッキ", starterDeck, starterDriveDeck);
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
        deck.driveDeck || deck.driveCounts || starterDriveDeck,
        deck.updatedAt
      );
    }

    stateFromDeck(mainDeck, driveDeck = starterDriveDeck) {
      const data = {
        version: STORE_VERSION,
        activeAccount: DEFAULT_ACCOUNT,
        accounts: {
          [DEFAULT_ACCOUNT]: this.defaultAccount(mainDeck, driveDeck),
        },
      };

      return {
        data,
        activeAccount: DEFAULT_ACCOUNT,
        activeDeckId: DEFAULT_DECK_ID,
        counts: this.normalizeMain(mainDeck),
        driveCounts: this.normalizeDrive(driveDeck),
      };
    }

    defaultAccount(mainDeck, driveDeck) {
      return {
        name: DEFAULT_ACCOUNT,
        activeDeckId: DEFAULT_DECK_ID,
        decks: {
          [DEFAULT_DECK_ID]: this.createDeck(DEFAULT_DECK_ID, "メインデッキ", mainDeck, driveDeck),
        },
      };
    }

    createDeck(id, name, mainDeck, driveDeck, updatedAt = new Date().toISOString()) {
      return {
        id,
        name: normalizeDeckName(name),
        mainDeck: this.normalizeMain(mainDeck),
        driveDeck: this.normalizeDrive(driveDeck),
        updatedAt,
      };
    }

    normalizeMain(source = {}) {
      const result = {};
      Object.entries(source).forEach(([id, count]) => {
        if (!cards[id] || cards[id].driveKind || cards[id].type === "環境") return;
        const safeCount = Math.max(0, Math.min(MAX_COPIES, Number(count) || 0));
        if (safeCount > 0) result[id] = safeCount;
      });
      return trimDeck(result, DECK_SIZE);
    }

    normalizeDrive(source = starterDriveDeck) {
      const result = {};
      const entries = Array.isArray(source) ? Object.entries(countIds(source)) : Object.entries(source || {});
      entries.forEach(([id, count]) => {
        if (!isDriveCard(cards[id])) return;
        const safeCount = Math.max(0, Math.min(MAX_DRIVE_COPIES, Number(count) || 0));
        if (safeCount > 0) result[id] = safeCount;
      });
      return trimDeck(result, DRIVE_DECK_SIZE);
    }

    save(name = this.activeDeck?.name) {
      const deck = this.saveActiveDeck(name);
      this.persist();
      return deck;
    }

    saveActiveDeck(name = this.activeDeck?.name) {
      const account = this.activeAccountData;
      const deck = this.createDeck(this.activeDeckId, name, this.counts, this.driveCounts);
      account.decks[this.activeDeckId] = deck;
      account.activeDeckId = this.activeDeckId;
      return deck;
    }

    saveAs(name) {
      const account = this.activeAccountData;
      const id = uniqueDeckId(account.decks);
      this.activeDeckId = id;
      account.activeDeckId = id;
      const deck = this.createDeck(id, name || this.nextDeckName(), this.counts, this.driveCounts);
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
      this.driveCounts = this.normalizeDrive(deck.driveDeck);
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
        this.data.accounts[accountName] = this.defaultAccount(starterDeck, starterDriveDeck);
        this.data.accounts[accountName].name = accountName;
      }
      this.activeAccount = accountName;
      this.data.activeAccount = accountName;

      const account = this.activeAccountData;
      this.activeDeckId = account.activeDeckId;
      const deck = account.decks[this.activeDeckId];
      this.counts = this.normalizeMain(deck.mainDeck);
      this.driveCounts = this.normalizeDrive(deck.driveDeck);
      this.persist();
      return account;
    }

    autoBuild(mode = "star") {
      const template = autoDeckTemplates[mode] || autoDeckTemplates.star;
      this.counts = this.completeMainDeck(template.main);
      this.driveCounts = this.completeDriveDeck(template.drive);
      return template.label;
    }

    completeMainDeck(source) {
      const result = this.normalizeMain(source);
      const candidates = Object.values(cards)
        .filter((card) => !isDriveCard(card) && card.type !== "環境")
        .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ja"));

      for (const card of candidates) {
        while ((result[card.id] || 0) < MAX_COPIES && deckTotal(result) < DECK_SIZE) {
          result[card.id] = (result[card.id] || 0) + 1;
        }
        if (deckTotal(result) >= DECK_SIZE) break;
      }

      return result;
    }

    completeDriveDeck(source) {
      const result = this.normalizeDrive(source);
      for (const card of drivePool) {
        if (deckTotal(result) >= DRIVE_DECK_SIZE) break;
        if (result[card.id]) continue;
        result[card.id] = 1;
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
      this.driveCounts = { ...starterDriveDeck };
    }

    clear() {
      this.counts = {};
      this.driveCounts = {};
    }

    add(id) {
      if (!cards[id] || isDriveCard(cards[id]) || cards[id].type === "環境") return { ok: false, reason: "unknown" };
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

    addDrive(id) {
      if (!isDriveCard(cards[id])) return { ok: false, reason: "unknown" };
      if (this.driveTotal >= DRIVE_DECK_SIZE) return { ok: false, reason: "full" };
      if ((this.driveCounts[id] || 0) >= MAX_DRIVE_COPIES) return { ok: false, reason: "copies" };
      this.driveCounts[id] = (this.driveCounts[id] || 0) + 1;
      return { ok: true };
    }

    removeDrive(id) {
      if (!this.driveCounts[id]) return;
      this.driveCounts[id] -= 1;
      if (this.driveCounts[id] <= 0) delete this.driveCounts[id];
    }

    get total() {
      return deckTotal(this.counts);
    }

    get driveTotal() {
      return deckTotal(this.driveCounts);
    }

    get list() {
      return Object.entries(this.counts).flatMap(([id, count]) => Array(count).fill(id));
    }

    get driveList() {
      return Object.entries(this.driveCounts).flatMap(([id, count]) => Array(count).fill(id));
    }

    get driveReady() {
      return this.driveTotal === DRIVE_DECK_SIZE;
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
      return {
        ...this.combinedStats,
        reactions: this.list.map((id) => cards[id]).filter((card) => card.type === "リアクション").length,
      };
    }

    get driveStats() {
      const driveCards = this.driveList.map((id) => cards[id]);
      return {
        ...this.combinedStats,
        units: driveCards.filter((card) => card.type === "ユニットドライブ").length,
        reactions: driveCards.filter((card) => card.type === "リアクションドライブ").length,
        spells: driveCards.filter((card) => card.type === "スペルドライブ").length,
        cores: driveCards.filter((card) => card.type === "コアドライブ").length,
      };
    }

    get combinedStats() {
      const deckCards = [...this.list, ...this.driveList].map((id) => cards[id]);
      const mainThemeInfo = this.mainThemeInfo;
      const mainTheme = mainThemeInfo.theme;
      const themed = mainTheme === "なし" ? 0 : mainThemeInfo.count;
      const avgCost = deckCards.length
        ? deckCards.reduce((sum, card) => sum + card.cost, 0) / deckCards.length
        : 0;

      return {
        total: deckCards.length,
        themeRate: deckCards.length ? Math.round((themed / deckCards.length) * 100) : 0,
        avgCost,
        mainTheme,
      };
    }

    get mainThemeInfo() {
      const themeCounts = new Map();
      [...this.list, ...this.driveList].forEach((id) => {
        const theme = cards[id]?.theme;
        if (!theme) return;
        themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
      });

      let theme = "なし";
      let count = 0;
      themeCounts.forEach((currentCount, currentTheme) => {
        if (currentCount > count) {
          theme = currentTheme;
          count = currentCount;
        }
      });

      return {
        theme: count > MAIN_THEME_THRESHOLD ? theme : "なし",
        count,
      };
    }
  }

  function themedDriveDeck(theme) {
    const result = {};
    drivePool
      .filter((card) => card.theme === theme || !card.theme)
      .slice(0, DRIVE_DECK_SIZE)
      .forEach((card) => {
        result[card.id] = 1;
      });
    return result;
  }

  function isDriveCard(card) {
    return Boolean(card?.driveKind || card?.type?.includes("ドライブ"));
  }

  function trimDeck(source, size) {
    const result = {};
    Object.entries(source).some(([id, count]) => {
      const room = size - deckTotal(result);
      if (room <= 0) return true;
      result[id] = Math.min(count, room);
      return false;
    });
    return result;
  }

  function deckTotal(source) {
    return Object.values(source).reduce((sum, count) => sum + count, 0);
  }

  function countIds(list) {
    return list.reduce((result, id) => {
      result[id] = (result[id] || 0) + 1;
      return result;
    }, {});
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
