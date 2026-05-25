(function () {
  "use strict";

  const {
    DECK_SIZE,
    DRIVE_DECK_SIZE,
    MAX_COPIES,
    MAX_DRIVE_COPIES,
    STORAGE_KEY,
    cards,
    cardPool,
    drivePool,
    starterDeck,
    starterDriveDeck,
  } = window.Chrono;

  const STORE_VERSION = 6;
  const DEFAULT_ACCOUNT = "Player";
  const DEFAULT_DECK_ID = "main";
  const MAIN_THEME_THRESHOLD = 10;
  const AUTHOR_ACCOUNT = "zzz0409";
  const PACK_SIZE = 5;
  const PACK_COST = 100;
  const CPU_WIN_GEMS = 200;
  const CPU_LOSS_GEMS = 100;
  const DUST_PER_DISMANTLE = 10;
  const ROYAL_DUST_PER_DISMANTLE = 100;
  const CRAFT_COST = 100;
  const ROYAL_FINISH = "royal";
  const ROYAL_RATE = 0.01;
  const ROYAL_PACK_RATE = 0.001;
  const PACK_COVERS = {
    "星導": { image: "assets/packs/star-pack.png", ace: "star_dragon" },
    "黒機": { image: "assets/packs/black-pack.png", ace: "black_anchor" },
    "断刃": { image: "assets/packs/blade-pack.png", ace: "blade_arbiter" },
    "電脳": { image: "assets/packs/cyber-pack.png", ace: "cyber_akari" },
    "双彩": { image: "assets/packs/sosai-pack.png", ace: "sosai_hikari" },
  };

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
        cyber_backchannel: 3,
        cyber_shield: 3,
        cyber_counterhack: 3,
        generic_probe_drone: 3,
        generic_code: 2,
        generic_wall: 2,
        generic_zero: 1,
        generic_bind: 1,
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
        star_guard: 1,
        star_dragon: 1,
        star_navigator: 1,
        star_invite: 2,
        star_link: 2,
        star_chart: 1,
        star_orbit: 2,
        star_wall: 2,
        star_interference: 1,
        black_grinder: 2,
        black_gear: 2,
        black_anchor: 2,
        black_tower: 2,
        black_raid: 2,
        black_claw: 1,
        generic_code: 2,
        generic_wall: 2,
        generic_transfer: 2,
        generic_bind: 2,
        generic_field_notes: 1,
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
      this.royalCounts = loaded.royalCounts;
      this.driveCounts = loaded.driveCounts;
      this.driveRoyalCounts = loaded.driveRoyalCounts;
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
        royalCounts: this.normalizeMain(activeDeck.mainDeckRoyal),
        driveCounts: this.normalizeDrive(activeDeck.driveDeck),
        driveRoyalCounts: this.normalizeDrive(activeDeck.driveDeckRoyal || {}),
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
        gems: Math.max(0, Math.floor(Number(account.gems) || 0)),
        dust: Math.max(0, Math.floor(Number(account.dust) || 0)),
        collection: this.normalizeCollection(account.collection, decks),
        collectionRoyal: this.normalizeCollection(account.collectionRoyal, decks, ROYAL_FINISH),
        decks,
      };
    }

    normalizeDeck(id, deck = {}) {
      return this.createDeck(
        id,
        deck.name || "メインデッキ",
        deck.mainDeck || deck.counts || {},
        deck.driveDeck || deck.driveCounts || starterDriveDeck,
        deck.mainDeckRoyal || deck.royalCounts || {},
        deck.driveDeckRoyal || deck.driveRoyalCounts || {},
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
        royalCounts: {},
        driveCounts: this.normalizeDrive(driveDeck),
        driveRoyalCounts: {},
      };
    }

    defaultAccount(mainDeck, driveDeck) {
      return {
        name: DEFAULT_ACCOUNT,
        activeDeckId: DEFAULT_DECK_ID,
        gems: 0,
        dust: 0,
        collection: this.initialCollection(mainDeck, driveDeck),
        collectionRoyal: {},
        decks: {
          [DEFAULT_DECK_ID]: this.createDeck(DEFAULT_DECK_ID, "メインデッキ", mainDeck, driveDeck, {}, {}),
        },
      };
    }

    createDeck(id, name, mainDeck, driveDeck, mainDeckRoyal = {}, driveDeckRoyal = {}, updatedAt = new Date().toISOString()) {
      return {
        id,
        name: normalizeDeckName(name),
        mainDeck: this.normalizeMain(mainDeck),
        driveDeck: this.normalizeDrive(driveDeck),
        mainDeckRoyal: this.normalizeMain(mainDeckRoyal),
        driveDeckRoyal: this.normalizeDrive(driveDeckRoyal || {}),
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
      const deck = this.createDeck(this.activeDeckId, name, this.counts, this.driveCounts, this.royalCounts, this.driveRoyalCounts);
      account.decks[this.activeDeckId] = deck;
      account.activeDeckId = this.activeDeckId;
      return deck;
    }

    saveAs(name) {
      const account = this.activeAccountData;
      const id = uniqueDeckId(account.decks);
      this.activeDeckId = id;
      account.activeDeckId = id;
      const deck = this.createDeck(id, name || this.nextDeckName(), this.counts, this.driveCounts, this.royalCounts, this.driveRoyalCounts);
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
      this.royalCounts = this.normalizeMain(deck.mainDeckRoyal);
      this.driveCounts = this.normalizeDrive(deck.driveDeck);
      this.driveRoyalCounts = this.normalizeDrive(deck.driveDeckRoyal || {});
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
      this.royalCounts = this.normalizeMain(deck.mainDeckRoyal);
      this.driveCounts = this.normalizeDrive(deck.driveDeck);
      this.driveRoyalCounts = this.normalizeDrive(deck.driveDeckRoyal || {});
      this.persist();
      return account;
    }

    autoBuild(mode = "star") {
      const template = autoDeckTemplates[mode] || autoDeckTemplates.star;
      const mainDeck = this.preferRoyalCopies(this.completeMainDeck(template.main), false);
      const driveDeck = this.preferRoyalCopies(this.completeDriveDeck(template.drive), true);
      this.counts = mainDeck.normal;
      this.royalCounts = mainDeck.royal;
      this.driveCounts = driveDeck.normal;
      this.driveRoyalCounts = driveDeck.royal;
      return template.label;
    }

    completeMainDeck(source) {
      const result = this.normalizeMainForOwned(source);
      const candidates = Object.values(cards)
        .filter((card) => !isDriveCard(card) && card.type !== "環境")
        .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ja"));

      for (const card of candidates) {
        const limit = this.deckLimit(card.id, false);
        while ((result[card.id] || 0) < limit && deckTotal(result) < DECK_SIZE) {
          result[card.id] = (result[card.id] || 0) + 1;
        }
        if (deckTotal(result) >= DECK_SIZE) break;
      }

      return result;
    }

    completeDriveDeck(source) {
      const result = this.normalizeDriveForOwned(source);
      for (const card of drivePool) {
        if (deckTotal(result) >= DRIVE_DECK_SIZE) break;
        if (result[card.id] || this.deckLimit(card.id, true) <= 0) continue;
        result[card.id] = 1;
      }
      return result;
    }

    preferRoyalCopies(source = {}, drive = false) {
      const normal = {};
      const royal = {};
      Object.entries(source).forEach(([id, rawCount]) => {
        const count = Math.max(0, Math.floor(Number(rawCount) || 0));
        if (count <= 0) return;
        const royalCount = Math.min(count, this.ownedCount(id, ROYAL_FINISH));
        const normalCount = count - royalCount;
        if (normalCount > 0) normal[id] = normalCount;
        if (royalCount > 0) royal[id] = royalCount;
      });
      return {
        normal: drive ? this.normalizeDrive(normal) : this.normalizeMain(normal),
        royal: drive ? this.normalizeDrive(royal) : this.normalizeMain(royal),
      };
    }

    normalizeMainForOwned(source = {}) {
      const result = {};
      Object.entries(source).forEach(([id, count]) => {
        if (!cards[id] || cards[id].driveKind || cards[id].type === "環境") return;
        const limit = this.deckLimit(id, false);
        const safeCount = Math.max(0, Math.min(limit, Number(count) || 0));
        if (safeCount > 0) result[id] = safeCount;
      });
      return trimDeck(result, DECK_SIZE);
    }

    normalizeDriveForOwned(source = starterDriveDeck) {
      const result = {};
      const entries = Array.isArray(source) ? Object.entries(countIds(source)) : Object.entries(source || {});
      entries.forEach(([id, count]) => {
        if (!isDriveCard(cards[id])) return;
        const limit = this.deckLimit(id, true);
        const safeCount = Math.max(0, Math.min(limit, Number(count) || 0));
        if (safeCount > 0) result[id] = safeCount;
      });
      return trimDeck(result, DRIVE_DECK_SIZE);
    }

    persist() {
      this.data.activeAccount = this.activeAccount;
      this.storage.setItem(STORAGE_KEY, JSON.stringify({
        version: STORE_VERSION,
        activeAccount: this.activeAccount,
        accounts: this.data.accounts,
      }));
      this.saveRemoteAccount();
    }

    reset() {
      this.counts = { ...starterDeck };
      this.royalCounts = {};
      this.driveCounts = { ...starterDriveDeck };
      this.driveRoyalCounts = {};
    }

    clear() {
      this.counts = {};
      this.royalCounts = {};
      this.driveCounts = {};
      this.driveRoyalCounts = {};
    }

    add(id, finish = "normal") {
      if (!cards[id] || isDriveCard(cards[id]) || cards[id].type === "環境") return { ok: false, reason: "unknown" };
      if (this.total >= DECK_SIZE) return { ok: false, reason: "full" };
      const limit = this.deckLimit(id, false);
      if (this.deckCount(id, false) >= limit) return { ok: false, reason: limit >= MAX_COPIES ? "copies" : "owned" };
      if (finish === ROYAL_FINISH) {
        if ((this.royalCounts[id] || 0) >= this.ownedCount(id, ROYAL_FINISH)) return { ok: false, reason: "owned" };
        this.royalCounts[id] = (this.royalCounts[id] || 0) + 1;
      } else {
        if ((this.counts[id] || 0) >= this.ownedCount(id)) return { ok: false, reason: "owned" };
        this.counts[id] = (this.counts[id] || 0) + 1;
      }
      return { ok: true };
    }

    remove(id, finish = "normal") {
      const counts = finish === ROYAL_FINISH ? this.royalCounts : this.counts;
      if (!counts[id]) return;
      counts[id] -= 1;
      if (counts[id] <= 0) delete counts[id];
    }

    addDrive(id, finish = "normal") {
      if (!isDriveCard(cards[id])) return { ok: false, reason: "unknown" };
      if (this.driveTotal >= DRIVE_DECK_SIZE) return { ok: false, reason: "full" };
      const limit = this.deckLimit(id, true);
      if (this.deckCount(id, true) >= limit) return { ok: false, reason: limit >= MAX_DRIVE_COPIES ? "copies" : "owned" };
      if (finish === ROYAL_FINISH) {
        if ((this.driveRoyalCounts[id] || 0) >= this.ownedCount(id, ROYAL_FINISH)) return { ok: false, reason: "owned" };
        this.driveRoyalCounts[id] = (this.driveRoyalCounts[id] || 0) + 1;
      } else {
        if ((this.driveCounts[id] || 0) >= this.ownedCount(id)) return { ok: false, reason: "owned" };
        this.driveCounts[id] = (this.driveCounts[id] || 0) + 1;
      }
      return { ok: true };
    }

    removeDrive(id, finish = "normal") {
      const counts = finish === ROYAL_FINISH ? this.driveRoyalCounts : this.driveCounts;
      if (!counts[id]) return;
      counts[id] -= 1;
      if (counts[id] <= 0) delete counts[id];
    }

    openPack(packId) {
      const pack = this.packDefinitions.find((entry) => entry.id === packId) || this.packDefinitions[0];
      if (!pack) return { ok: false, reason: "empty", results: [] };
      if (!this.isAuthorAccount && this.gems < PACK_COST) {
        return { ok: false, reason: "gems", results: [], gems: this.gems };
      }
      if (!this.isAuthorAccount) this.activeAccountData.gems = Math.max(0, this.gems - PACK_COST);
      const allPool = packPool(allPackCards());
      const themePool = packPool(pack.cards);
      const results = [];
      const royalPack = Math.random() < ROYAL_PACK_RATE;
      for (let i = 0; i < PACK_SIZE - 1; i += 1) {
        const card = pickWeighted(allPool);
        if (!card) continue;
        results.push(this.addPackResult(card, false, royalPack));
      }
      const guaranteed = pickWeighted(themePool);
      if (guaranteed) results.push(this.addPackResult(guaranteed, true, royalPack));
      this.persist();
      return { ok: true, pack, results, royalPack, gems: this.gems, cost: this.isAuthorAccount ? 0 : PACK_COST };
    }

    addPackResult(card, guaranteed = false, forceRoyal = false) {
      const finish = forceRoyal || Math.random() < ROYAL_RATE ? ROYAL_FINISH : "normal";
      const before = this.ownedCount(card.id, finish);
      this.addOwned(card.id, 1, finish);
      return {
        id: card.id,
        finish,
        royalPack: forceRoyal,
        before,
        after: this.ownedCount(card.id, finish),
        isNew: before === 0,
        guaranteed,
      };
    }

    addOwned(id, count = 1, finish = "normal") {
      if (!cards[id]) return 0;
      const account = this.activeAccountData;
      const collection = finish === ROYAL_FINISH ? (account.collectionRoyal ||= {}) : account.collection;
      collection[id] = Math.max(0, Number(collection[id] || 0) + count);
      return collection[id];
    }

    ownedCount(id, finish = "normal") {
      if (!cards[id]) return 0;
      if (this.isAuthorAccount) return isDriveCard(cards[id]) ? MAX_DRIVE_COPIES : MAX_COPIES;
      const collection = finish === ROYAL_FINISH ? this.activeAccountData.collectionRoyal : this.activeAccountData.collection;
      return Math.max(0, Number(collection?.[id] || 0));
    }

    totalOwnedCount(id) {
      return this.ownedCount(id) + this.ownedCount(id, ROYAL_FINISH);
    }

    deckCount(id, drive = false) {
      return (drive ? this.driveCounts[id] || 0 : this.counts[id] || 0)
        + (drive ? this.driveRoyalCounts[id] || 0 : this.royalCounts[id] || 0);
    }

    deckLimit(id, drive = false) {
      const copyLimit = drive ? MAX_DRIVE_COPIES : MAX_COPIES;
      if (!cards[id]) return 0;
      if (this.isAuthorAccount) return copyLimit;
      return Math.min(copyLimit, this.totalOwnedCount(id));
    }

    validateActiveDeckOwnership() {
      const missing = [
        ...this.deckOwnershipIssues(this.counts, false),
        ...this.deckOwnershipIssues(this.royalCounts, false, ROYAL_FINISH),
        ...this.deckOwnershipIssues(this.driveCounts, true),
        ...this.deckOwnershipIssues(this.driveRoyalCounts, true, ROYAL_FINISH),
      ];
      return {
        ok: missing.length === 0,
        missing,
      };
    }

    deckOwnershipIssues(source, drive = false, finish = "normal") {
      return Object.entries(source || {})
        .map(([id, count]) => {
          const owned = this.ownedCount(id, finish);
          const copyLimit = drive ? MAX_DRIVE_COPIES : MAX_COPIES;
          const limit = this.isAuthorAccount ? copyLimit : Math.min(copyLimit, owned);
          return {
            id,
            name: cards[id]?.name || id,
            count: Number(count) || 0,
            owned,
            drive,
            finish,
            limit,
          };
        })
        .filter((entry) => entry.count > entry.limit);
    }

    addGems(amount) {
      const gained = Math.max(0, Math.floor(Number(amount) || 0));
      if (gained <= 0) return this.gems;
      this.activeAccountData.gems = this.gems + gained;
      this.persist();
      return this.gems;
    }

    dismantleCard(id, finish = "normal") {
      if (!cards[id]) return { ok: false, reason: "unknown" };
      if (this.isAuthorAccount) return { ok: false, reason: "author" };
      const owned = this.ownedCount(id, finish);
      if (owned < 1) return { ok: false, reason: "owned" };
      const collection = finish === ROYAL_FINISH ? this.activeAccountData.collectionRoyal : this.activeAccountData.collection;
      const gained = finish === ROYAL_FINISH ? ROYAL_DUST_PER_DISMANTLE : DUST_PER_DISMANTLE;
      collection[id] = owned - 1;
      this.activeAccountData.dust = this.dust + gained;
      this.persist();
      return {
        ok: true,
        id,
        finish,
        ownedBefore: owned,
        ownedAfter: this.ownedCount(id, finish),
        gained,
        dust: this.dust,
      };
    }

    bulkDismantleExtras() {
      if (this.isAuthorAccount) return { ok: false, reason: "author", dismantled: 0, gained: 0 };
      let dismantled = 0;
      let gained = 0;
      const collection = this.activeAccountData.collection;
      Object.entries(collection || {}).forEach(([id, count]) => {
        if (!cards[id]) return;
        const extra = Math.max(0, Math.floor(Number(count) || 0) - 3);
        if (extra <= 0) return;
        collection[id] = count - extra;
        dismantled += extra;
        gained += extra * DUST_PER_DISMANTLE;
      });
      if (dismantled <= 0) return { ok: false, reason: "empty", dismantled: 0, gained: 0 };
      this.activeAccountData.dust = this.dust + gained;
      this.persist();
      return { ok: true, dismantled, gained, dust: this.dust };
    }

    craftCard(id) {
      if (!cards[id]) return { ok: false, reason: "unknown" };
      if (this.isAuthorAccount) return { ok: false, reason: "author" };
      if (this.dust < CRAFT_COST) return { ok: false, reason: "dust" };
      this.activeAccountData.dust = this.dust - CRAFT_COST;
      this.addOwned(id, 1);
      this.persist();
      return {
        ok: true,
        id,
        cost: CRAFT_COST,
        owned: this.ownedCount(id),
        dust: this.dust,
      };
    }

    rewardCpuResult(won) {
      const gained = won ? CPU_WIN_GEMS : CPU_LOSS_GEMS;
      this.addGems(gained);
      return gained;
    }

    get total() {
      return deckTotal(this.counts) + deckTotal(this.royalCounts);
    }

    get driveTotal() {
      return deckTotal(this.driveCounts) + deckTotal(this.driveRoyalCounts);
    }

    get list() {
      return [
        ...Object.entries(this.counts).flatMap(([id, count]) => Array(count).fill(id)),
        ...Object.entries(this.royalCounts).flatMap(([id, count]) => Array(count).fill(id)),
      ];
    }

    get driveList() {
      return [
        ...Object.entries(this.driveCounts).flatMap(([id, count]) => Array(count).fill(id)),
        ...Object.entries(this.driveRoyalCounts).flatMap(([id, count]) => Array(count).fill(id)),
      ];
    }

    get royalBattleIds() {
      return Object.keys(this.royalCounts).filter((id) => this.royalCounts[id] > 0);
    }

    get driveRoyalBattleIds() {
      return Object.keys(this.driveRoyalCounts).filter((id) => this.driveRoyalCounts[id] > 0);
    }

    get driveReady() {
      return this.driveTotal === DRIVE_DECK_SIZE;
    }

    get isAuthorAccount() {
      return String(this.activeAccount || "").trim().toLowerCase() === AUTHOR_ACCOUNT;
    }

    get gems() {
      return Math.max(0, Math.floor(Number(this.activeAccountData.gems) || 0));
    }

    get dust() {
      return Math.max(0, Math.floor(Number(this.activeAccountData.dust) || 0));
    }

    get dustPerDismantle() {
      return DUST_PER_DISMANTLE;
    }

    get royalDustPerDismantle() {
      return ROYAL_DUST_PER_DISMANTLE;
    }

    get craftCost() {
      return CRAFT_COST;
    }

    get packCost() {
      return this.isAuthorAccount ? 0 : PACK_COST;
    }

    get packDefinitions() {
      return themePacks();
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

    initialCollection(mainDeck, driveDeck) {
      return this.normalizeCollection(undefined, {
        starter: this.createDeck("starter", "starter", mainDeck, driveDeck),
      });
    }

    normalizeCollection(collection = {}, decks = {}, finish = "normal") {
      const result = {};
      Object.entries(collection || {}).forEach(([id, count]) => {
        if (!cards[id]) return;
        const safeCount = Math.max(0, Math.floor(Number(count) || 0));
        if (safeCount > 0) result[id] = safeCount;
      });

      Object.values(decks || {}).forEach((deck) => {
        const mainSource = finish === ROYAL_FINISH ? deck.mainDeckRoyal : deck.mainDeck;
        const driveSource = finish === ROYAL_FINISH ? deck.driveDeckRoyal : deck.driveDeck;
        Object.entries(mainSource || {}).forEach(([id, count]) => {
          if (cards[id]) result[id] = Math.max(result[id] || 0, Number(count) || 0);
        });
        Object.entries(driveSource || {}).forEach(([id, count]) => {
          if (cards[id]) result[id] = Math.max(result[id] || 0, Number(count) || 0);
        });
      });

      return result;
    }

    async syncActiveAccount() {
      if (!canUseRemoteSync()) return this.activeAccountData;
      try {
        const response = await fetch(`/api/accounts?name=${encodeURIComponent(this.activeAccount)}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("account sync failed");
        const remote = await response.json();
        if (remote?.account) {
          this.mergeRemoteAccount(remote.account);
          this.persistLocalOnly();
        } else {
          this.saveRemoteAccount();
        }
      } catch {
        return this.activeAccountData;
      }
      return this.activeAccountData;
    }

    mergeRemoteAccount(remote) {
      const accountName = normalizeAccountName(remote.name || this.activeAccount);
      const local = this.data.accounts[accountName] || this.defaultAccount(starterDeck, starterDriveDeck);
      const merged = this.normalizeAccount(accountName, {
        ...local,
        ...remote,
        gems: Math.max(Number(local.gems) || 0, Number(remote.gems) || 0),
        dust: Math.max(Number(local.dust) || 0, Number(remote.dust) || 0),
        collection: mergeMaxCounts(local.collection, remote.collection),
        collectionRoyal: mergeMaxCounts(local.collectionRoyal, remote.collectionRoyal),
        decks: mergeDecksByUpdated(local.decks, remote.decks),
        activeDeckId: local.activeDeckId || remote.activeDeckId,
      });
      this.data.accounts[accountName] = merged;
      this.activeAccount = accountName;
      this.data.activeAccount = accountName;
      this.activeDeckId = merged.activeDeckId;
      const deck = merged.decks[this.activeDeckId];
      this.counts = this.normalizeMain(deck.mainDeck);
      this.royalCounts = this.normalizeMain(deck.mainDeckRoyal);
      this.driveCounts = this.normalizeDrive(deck.driveDeck);
      this.driveRoyalCounts = this.normalizeDrive(deck.driveDeckRoyal || {});
    }

    persistLocalOnly() {
      this.data.activeAccount = this.activeAccount;
      this.storage.setItem(STORAGE_KEY, JSON.stringify({
        version: STORE_VERSION,
        activeAccount: this.activeAccount,
        accounts: this.data.accounts,
      }));
    }

    saveRemoteAccount() {
      if (!canUseRemoteSync()) return;
      const account = this.activeAccountData;
      window.clearTimeout(this.remoteSaveTimer);
      this.remoteSaveTimer = window.setTimeout(() => {
        fetch(`/api/accounts?name=${encodeURIComponent(this.activeAccount)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account }),
        }).catch(() => {});
      }, 80);
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

  function allPackCards() {
    return [...cardPool.filter((card) => card.type !== "環境"), ...drivePool];
  }

  function themePacks() {
    const themes = [...new Set(allPackCards().map((card) => card.theme).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "ja"));
    return themes.map((theme) => {
      const themeCards = allPackCards().filter((card) => card.theme === theme);
      const ace = PACK_COVERS[theme]?.ace || themeAceCard(themeCards)?.id || themeCards[0]?.id || "";
      return {
        id: themePackId(theme),
        theme,
        name: `${theme}パック`,
        description: `5枚目は${theme}カード確定`,
        cover: PACK_COVERS[theme]?.image || cards[ace]?.art || "",
        ace,
        cards: themeCards,
        count: themeCards.length,
      };
    });
  }

  function themePackId(theme) {
    return `theme_${Array.from(theme).map((char) => char.charCodeAt(0).toString(16)).join("_")}`;
  }

  function themeAceCard(themeCards) {
    return themeCards
      .filter((card) => card.type?.includes("ユニット"))
      .sort((a, b) => (Number(b.cost) || 0) - (Number(a.cost) || 0) || (Number(b.atk) || 0) - (Number(a.atk) || 0))[0];
  }

  function packPool(source) {
    return source.map((card) => ({
      card,
      weight: packWeight(card),
    }));
  }

  function packWeight(card) {
    if (!card) return 0;
    if (isDriveCard(card)) return 8;
    const cost = Number(card.cost) || 0;
    if (cost >= 4) return 4;
    if (cost >= 3) return 8;
    if (cost >= 2) return 14;
    return 22;
  }

  function pickWeighted(entries) {
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    if (total <= 0) return null;
    let roll = Math.random() * total;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll <= 0) return entry.card;
    }
    return entries[entries.length - 1]?.card;
  }

  function countIds(list) {
    return list.reduce((result, id) => {
      const key = cardIdOf(id);
      result[key] = (result[key] || 0) + 1;
      return result;
    }, {});
  }

  function cardIdOf(entry) {
    return typeof entry === "string" ? entry : entry?.id;
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

  function mergeMaxCounts(a = {}, b = {}) {
    const result = {};
    [...Object.keys(a || {}), ...Object.keys(b || {})].forEach((id) => {
      if (!cards[id]) return;
      const count = Math.max(Number(a[id]) || 0, Number(b[id]) || 0);
      if (count > 0) result[id] = count;
    });
    return result;
  }

  function mergeDecksByUpdated(local = {}, remote = {}) {
    const result = { ...(remote || {}) };
    Object.entries(local || {}).forEach(([id, deck]) => {
      const existing = result[id];
      if (!existing || String(deck.updatedAt || "") >= String(existing.updatedAt || "")) result[id] = deck;
    });
    return result;
  }

  function canUseRemoteSync() {
    return window.location.protocol !== "file:" && typeof fetch === "function";
  }

  window.Chrono.DeckStore = DeckStore;
})();
