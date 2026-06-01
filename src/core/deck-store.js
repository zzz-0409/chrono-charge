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
    classDecks,
    classDriveDecks,
    CLASSES,
  } = window.Chrono;

  const STORE_VERSION = 7;
  const AUTH_TOKEN_KEY = `${STORAGE_KEY}-auth`;
  const DEFAULT_ACCOUNT = "Player";
  const DEFAULT_DECK_ID = "blader";
  const PACK_SIZE = 5;
  const PACK_COST = 100;
  const CPU_WIN_GEMS = 200;
  const CPU_LOSS_GEMS = 100;
  const ONLINE_WIN_GEMS = 200;
  const ONLINE_LOSS_GEMS = 100;
  const DUST_PER_DISMANTLE = 10;
  const ROYAL_DUST_PER_DISMANTLE = 100;
  const CRAFT_COST = 100;
  const ROYAL_FINISH = "royal";

  const classEntries = Object.values(CLASSES || {});
  const classLabels = Object.fromEntries(classEntries.map((entry) => [entry.id, entry.name]));

  class DeckStore {
    constructor(storage = window.localStorage) {
      this.storage = storage;
      this.auth = this.loadAuth();
      const loaded = this.load();
      this.data = loaded.data;
      this.activeAccount = loaded.activeAccount;
      this.activeDeckId = loaded.activeDeckId;
      this.counts = loaded.counts;
      this.royalCounts = loaded.royalCounts;
      this.driveCounts = loaded.driveCounts;
      this.driveRoyalCounts = loaded.driveRoyalCounts;
      this.currentClassKey = this.activeDeck?.classKey || inferClassKey(this.counts) || "blader";
      this.pendingLoginBonus = null;
    }

    load() {
      try {
        const saved = JSON.parse(this.storage.getItem(STORAGE_KEY));
        if (saved && typeof saved === "object" && saved.accounts) return this.normalizeState(saved);
      } catch {
        this.storage.removeItem(STORAGE_KEY);
      }
      return this.stateFromDeck(starterDeck, starterDriveDeck, "blader");
    }

    guestState() {
      return this.stateFromDeck(starterDeck, starterDriveDeck, "blader");
    }

    loadAuth() {
      try {
        const auth = JSON.parse(this.storage.getItem(AUTH_TOKEN_KEY));
        if (auth?.token && auth?.username) return auth;
      } catch {
        this.storage.removeItem(AUTH_TOKEN_KEY);
      }
      return null;
    }

    saveAuth(auth) {
      this.auth = auth;
      if (auth?.token && auth?.username) this.storage.setItem(AUTH_TOKEN_KEY, JSON.stringify(auth));
      else this.storage.removeItem(AUTH_TOKEN_KEY);
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
      if (Object.keys(data.accounts).length === 0) data.accounts[DEFAULT_ACCOUNT] = this.defaultAccount();
      if (!data.accounts[data.activeAccount]) data.activeAccount = Object.keys(data.accounts)[0];
      const account = data.accounts[data.activeAccount];
      if (!account.decks[account.activeDeckId]) account.activeDeckId = Object.keys(account.decks)[0];
      const deck = account.decks[account.activeDeckId];
      return {
        data,
        activeAccount: data.activeAccount,
        activeDeckId: account.activeDeckId,
        counts: this.normalizeMain(deck.mainDeck),
        royalCounts: this.normalizeMain(deck.mainDeckRoyal),
        driveCounts: this.normalizeDrive(deck.driveDeck),
        driveRoyalCounts: this.normalizeDrive(deck.driveDeckRoyal || {}),
      };
    }

    normalizeAccount(accountName, account = {}) {
      const decks = {};
      Object.entries(account.decks || {}).forEach(([rawId, deck]) => {
        const id = sanitizeId(rawId);
        decks[id] = this.normalizeDeck(id, deck);
      });
      if (Object.keys(decks).length === 0) {
        Object.assign(decks, this.defaultDecks());
      }
      const activeDeckId = sanitizeId(account.activeDeckId);
      return {
        name: accountName,
        username: String(account.username || accountName),
        displayName: String(account.displayName || account.name || accountName).trim().slice(0, 24) || accountName,
        isDeveloper: Boolean(account.isDeveloper),
        activeDeckId: decks[activeDeckId] ? activeDeckId : Object.keys(decks)[0],
        gems: Math.max(0, Math.floor(Number(account.gems) || 2000)),
        dust: Math.max(0, Math.floor(Number(account.dust) || 0)),
        ranked: normalizeRankedRecord(account.ranked),
        presents: normalizePresents(account.presents),
        lastLoginBonusDate: String(account.lastLoginBonusDate || ""),
        loginBonus: normalizeLoginBonusRecord(account.loginBonus),
        collection: this.normalizeCollection(account.collection),
        collectionRoyal: this.normalizeCollection(account.collectionRoyal, ROYAL_FINISH),
        updatedAt: String(account.updatedAt || new Date().toISOString()),
        decks,
      };
    }

    normalizeDeck(id, deck = {}) {
      const classKey = sanitizeClassKey(deck.classKey || inferClassKey(deck.mainDeck || deck.counts || {}) || "blader");
      return this.createDeck(
        id,
        deck.name || `${classLabels[classKey] || "クラス"}デッキ`,
        deck.mainDeck || deck.counts || classDecks[classKey] || starterDeck,
        deck.driveDeck || deck.driveCounts || classDriveDecks[classKey] || starterDriveDeck,
        deck.mainDeckRoyal || deck.royalCounts || {},
        deck.driveDeckRoyal || deck.driveRoyalCounts || {},
        {
          classKey,
          favoriteCardId: deck.favoriteCardId,
          updatedAt: deck.updatedAt,
        }
      );
    }

    stateFromDeck(mainDeck, driveDeck = starterDriveDeck, classKey = "blader") {
      const data = {
        version: STORE_VERSION,
        activeAccount: DEFAULT_ACCOUNT,
        accounts: {
          [DEFAULT_ACCOUNT]: this.defaultAccount(mainDeck, driveDeck, classKey),
        },
      };
      return {
        data,
        activeAccount: DEFAULT_ACCOUNT,
        activeDeckId: classKey || DEFAULT_DECK_ID,
        counts: this.normalizeMain(mainDeck),
        royalCounts: {},
        driveCounts: this.normalizeDrive(driveDeck),
        driveRoyalCounts: {},
      };
    }

    defaultAccount(mainDeck = starterDeck, driveDeck = starterDriveDeck, classKey = "blader") {
      const decks = this.defaultDecks();
      decks[classKey] = this.createDeck(classKey, `${classLabels[classKey] || "ブレイダー"}デッキ`, mainDeck, driveDeck, {}, {}, { classKey });
      return {
        name: DEFAULT_ACCOUNT,
        username: "Guest",
        displayName: DEFAULT_ACCOUNT,
        isDeveloper: false,
        activeDeckId: classKey,
        gems: 2000,
        dust: 0,
        ranked: normalizeRankedRecord(),
        presents: [],
        lastLoginBonusDate: "",
        loginBonus: normalizeLoginBonusRecord(),
        collection: this.initialCollection(),
        collectionRoyal: {},
        updatedAt: new Date().toISOString(),
        decks,
      };
    }

    defaultDecks() {
      return Object.fromEntries(classEntries.map((entry) => [
        entry.id,
        this.createDeck(entry.id, `${entry.name}デッキ`, classDecks[entry.id], classDriveDecks[entry.id], {}, {}, { classKey: entry.id }),
      ]));
    }

    createDeck(id, name, mainDeck, driveDeck, mainDeckRoyal = {}, driveDeckRoyal = {}, meta = {}) {
      const deckMeta = typeof meta === "string" ? { updatedAt: meta } : meta || {};
      const classKey = sanitizeClassKey(deckMeta.classKey || inferClassKey(mainDeck) || this.currentClassKey || "blader");
      const normalizedMain = this.normalizeMain(mainDeck);
      const normalizedDrive = this.normalizeDrive(driveDeck);
      const normalizedMainRoyal = this.normalizeMain(mainDeckRoyal);
      const normalizedDriveRoyal = this.normalizeDrive(driveDeckRoyal || {});
      return {
        id,
        name: normalizeDeckName(name),
        classKey,
        mainDeck: normalizedMain,
        driveDeck: normalizedDrive,
        mainDeckRoyal: normalizedMainRoyal,
        driveDeckRoyal: normalizedDriveRoyal,
        favoriteCardId: this.normalizeDeckFavorite(deckMeta.favoriteCardId, normalizedMain, normalizedMainRoyal, normalizedDrive, normalizedDriveRoyal),
        updatedAt: deckMeta.updatedAt || new Date().toISOString(),
      };
    }

    normalizeDeckFavorite(favoriteCardId, mainDeck = {}, mainDeckRoyal = {}, driveDeck = {}, driveDeckRoyal = {}) {
      const id = String(favoriteCardId || "");
      if (!cards[id]) return "";
      return [mainDeck, mainDeckRoyal, driveDeck, driveDeckRoyal].some((source) => (Number(source?.[id]) || 0) > 0) ? id : "";
    }

    normalizeMain(source = {}) {
      const result = {};
      const entries = Array.isArray(source) ? Object.entries(countIds(source)) : Object.entries(source || {});
      entries.forEach(([id, count]) => {
        const card = cards[id];
        if (!card || isDriveCard(card)) return;
        const safeCount = Math.max(0, Math.min(MAX_COPIES, Math.floor(Number(count) || 0)));
        if (safeCount > 0) result[id] = safeCount;
      });
      return trimDeck(result, DECK_SIZE);
    }

    normalizeDrive(source = starterDriveDeck) {
      const result = {};
      const entries = Array.isArray(source) ? Object.entries(countIds(source)) : Object.entries(source || {});
      entries.forEach(([id, count]) => {
        const card = cards[id];
        if (!isDriveCard(card)) return;
        const safeCount = Math.max(0, Math.min(MAX_DRIVE_COPIES, Math.floor(Number(count) || 0)));
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
      const deck = this.createDeck(this.activeDeckId, name, this.counts, this.driveCounts, this.royalCounts, this.driveRoyalCounts, {
        classKey: this.currentClassKey,
        favoriteCardId: this.activeDeck?.favoriteCardId,
      });
      account.decks[this.activeDeckId] = deck;
      account.activeDeckId = this.activeDeckId;
      this.currentClassKey = deck.classKey;
      return deck;
    }

    saveAs(name) {
      const account = this.activeAccountData;
      const id = uniqueDeckId(account.decks);
      const favoriteCardId = this.activeDeck?.favoriteCardId;
      this.activeDeckId = id;
      account.activeDeckId = id;
      const deck = this.createDeck(id, name || this.nextDeckName(), this.counts, this.driveCounts, this.royalCounts, this.driveRoyalCounts, {
        classKey: this.currentClassKey,
        favoriteCardId,
      });
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
      this.currentClassKey = sanitizeClassKey(deck.classKey || inferClassKey(deck.mainDeck) || "blader");
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

    renamePreset(id, name) {
      const deck = this.activeAccountData.decks[id];
      if (!deck) return null;
      deck.name = normalizeDeckName(name);
      deck.updatedAt = new Date().toISOString();
      this.persist();
      return deck;
    }

    setDeckFavoriteCard(id, cardId) {
      const deck = this.activeAccountData.decks[id];
      if (!deck) return false;
      const favoriteCardId = this.normalizeDeckFavorite(cardId, deck.mainDeck, deck.mainDeckRoyal, deck.driveDeck, deck.driveDeckRoyal);
      if (!favoriteCardId) return false;
      deck.favoriteCardId = favoriteCardId;
      deck.updatedAt = new Date().toISOString();
      this.persist();
      return true;
    }

    autoBuild(mode = "blader", options = {}) {
      const classKey = sanitizeClassKey(mode === "balance" ? this.currentClassKey : mode);
      this.currentClassKey = classKey;
      const main = this.completeMainDeck(classDecks[classKey] || starterDeck, { classKey, ownedOnly: Boolean(options.ownedOnly) });
      const drive = this.completeDriveDeck(classDriveDecks[classKey] || starterDriveDeck, { classKey, ownedOnly: Boolean(options.ownedOnly) });
      const mainDeck = this.preferRoyalCopies(main, false);
      const driveDeck = this.preferRoyalCopies(drive, true);
      this.counts = mainDeck.normal;
      this.royalCounts = mainDeck.royal;
      this.driveCounts = driveDeck.normal;
      this.driveRoyalCounts = driveDeck.royal;
      return `${classLabels[classKey]}おまかせ`;
    }

    completeMainDeck(source, options = {}) {
      const classKey = sanitizeClassKey(options.classKey || this.currentClassKey || "blader");
      const result = this.normalizeMainForOwned(source, options);
      const candidates = cardPool
        .filter((card) => cardAllowedInClass(card, classKey))
        .sort((a, b) => sortAutoBuildCandidates(a, b, classKey));
      for (const card of candidates) {
        const limit = this.autoBuildLimit(card.id, false, options.ownedOnly);
        while ((result[card.id] || 0) < limit && deckTotal(result) < DECK_SIZE) {
          result[card.id] = (result[card.id] || 0) + 1;
        }
        if (deckTotal(result) >= DECK_SIZE) break;
      }
      return trimDeck(result, DECK_SIZE);
    }

    completeDriveDeck(source, options = {}) {
      const classKey = sanitizeClassKey(options.classKey || this.currentClassKey || "blader");
      const result = this.normalizeDriveForOwned(source, options);
      const candidates = drivePool.filter((card) => card.cardClass === classKey);
      for (const card of candidates) {
        const limit = this.autoBuildLimit(card.id, true, options.ownedOnly);
        while ((result[card.id] || 0) < limit && deckTotal(result) < DRIVE_DECK_SIZE) {
          result[card.id] = (result[card.id] || 0) + 1;
        }
        if (deckTotal(result) >= DRIVE_DECK_SIZE) break;
      }
      return trimDeck(result, DRIVE_DECK_SIZE);
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

    normalizeMainForOwned(source = {}, options = {}) {
      const classKey = sanitizeClassKey(options.classKey || this.currentClassKey || "blader");
      const result = {};
      Object.entries(source || {}).forEach(([id, count]) => {
        const card = cards[id];
        if (!card || isDriveCard(card) || !cardAllowedInClass(card, classKey)) return;
        const limit = this.autoBuildLimit(id, false, options.ownedOnly);
        const safeCount = Math.max(0, Math.min(limit, Math.floor(Number(count) || 0)));
        if (safeCount > 0) result[id] = safeCount;
      });
      return trimDeck(result, DECK_SIZE);
    }

    normalizeDriveForOwned(source = starterDriveDeck, options = {}) {
      const classKey = sanitizeClassKey(options.classKey || this.currentClassKey || "blader");
      const result = {};
      Object.entries(source || {}).forEach(([id, count]) => {
        const card = cards[id];
        if (!isDriveCard(card) || card.cardClass !== classKey) return;
        const limit = this.autoBuildLimit(id, true, options.ownedOnly);
        const safeCount = Math.max(0, Math.min(limit, Math.floor(Number(count) || 0)));
        if (safeCount > 0) result[id] = safeCount;
      });
      return trimDeck(result, DRIVE_DECK_SIZE);
    }

    autoBuildLimit(id, drive = false, ownedOnly = false) {
      const copyLimit = this.deckLimit(id, drive);
      if (!ownedOnly) return copyLimit;
      return Math.min(copyLimit, this.totalOwnedCount(id));
    }

    reset() {
      this.autoBuild(this.currentClassKey || "blader");
    }

    clear() {
      this.counts = {};
      this.royalCounts = {};
      this.driveCounts = {};
      this.driveRoyalCounts = {};
    }

    add(id, finish = "normal") {
      const card = cards[id];
      if (!card || isDriveCard(card)) return { ok: false, reason: "unknown" };
      if (!cardAllowedInClass(card, this.activeClass)) return { ok: false, reason: "class" };
      if (this.total >= DECK_SIZE) return { ok: false, reason: "full" };
      const limit = this.deckLimit(id, false);
      if (this.deckCount(id, false) >= limit) return { ok: false, reason: "copies" };
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
      const card = cards[id];
      if (!isDriveCard(card)) return { ok: false, reason: "unknown" };
      if (card.cardClass !== this.activeClass) return { ok: false, reason: "class" };
      if (this.driveTotal >= DRIVE_DECK_SIZE) return { ok: false, reason: "full" };
      const limit = this.deckLimit(id, true);
      if (this.deckCount(id, true) >= limit) return { ok: false, reason: "copies" };
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
      if (!this.isAuthorAccount && this.gems < PACK_COST) return { ok: false, reason: "gems", results: [], gems: this.gems };
      if (!this.isAuthorAccount) this.activeAccountData.gems = Math.max(0, this.gems - PACK_COST);
      const pool = pack.cards.length ? pack.cards : [...cardPool, ...drivePool];
      const results = [];
      for (let i = 0; i < PACK_SIZE; i += 1) {
        const card = pool[Math.floor(Math.random() * pool.length)];
        if (!card) continue;
        results.push(this.addPackResult(card, i === PACK_SIZE - 1));
      }
      this.persist();
      return { ok: true, pack, results, royalPack: false, gems: this.gems, cost: this.packCost };
    }

    addPackResult(card, guaranteed = false) {
      const before = this.ownedCount(card.id);
      this.addOwned(card.id, 1);
      return { id: card.id, finish: "normal", before, after: this.ownedCount(card.id), isNew: before === 0, guaranteed };
    }

    addOwned(id, count = 1, finish = "normal") {
      if (!cards[id]) return 0;
      const collection = finish === ROYAL_FINISH ? (this.activeAccountData.collectionRoyal ||= {}) : this.activeAccountData.collection;
      collection[id] = Math.max(0, Number(collection[id] || 0) + count);
      return collection[id];
    }

    ownedCount(id, finish = "normal") {
      if (!cards[id]) return 0;
      const collection = finish === ROYAL_FINISH ? this.activeAccountData.collectionRoyal : this.activeAccountData.collection;
      return Math.max(0, Number(collection?.[id] || 0));
    }

    totalOwnedCount(id) {
      return this.ownedCount(id) + this.ownedCount(id, ROYAL_FINISH);
    }

    minimumOwnedCount(id, finish = "normal") {
      if (finish === ROYAL_FINISH || !cards[id]) return 0;
      return Math.max(0, Number(this.initialCollection()[id] || 0));
    }

    dismantlableCount(id, finish = "normal") {
      if (!cards[id] || this.isAuthorAccount) return 0;
      return Math.max(0, this.ownedCount(id, finish) - this.minimumOwnedCount(id, finish));
    }

    deckCount(id, drive = false) {
      return (drive ? this.driveCounts[id] || 0 : this.counts[id] || 0)
        + (drive ? this.driveRoyalCounts[id] || 0 : this.royalCounts[id] || 0);
    }

    deckLimit(id, drive = false) {
      if (!cards[id]) return 0;
      return drive ? MAX_DRIVE_COPIES : MAX_COPIES;
    }

    validateActiveDeckOwnership() {
      const missing = [
        ...this.deckOwnershipIssues(this.counts, false),
        ...this.deckOwnershipIssues(this.royalCounts, false, ROYAL_FINISH),
        ...this.deckOwnershipIssues(this.driveCounts, true),
        ...this.deckOwnershipIssues(this.driveRoyalCounts, true, ROYAL_FINISH),
      ];
      return { ok: missing.length === 0, missing };
    }

    validateActiveDeckSize() {
      const mainTotal = this.total;
      const driveTotal = this.driveTotal;
      return {
        ok: mainTotal <= DECK_SIZE && driveTotal <= DRIVE_DECK_SIZE,
        mainTotal,
        driveTotal,
        mainLimit: DECK_SIZE,
        driveLimit: DRIVE_DECK_SIZE,
        mainOver: mainTotal > DECK_SIZE,
        driveOver: driveTotal > DRIVE_DECK_SIZE,
      };
    }

    deckOwnershipIssues(source, drive = false, finish = "normal") {
      return Object.entries(source || {}).map(([id, count]) => {
        const owned = this.ownedCount(id, finish);
        const limit = Math.min(this.deckLimit(id, drive), owned);
        return { id, name: cards[id]?.name || id, count: Number(count) || 0, owned, drive, finish, limit };
      }).filter((entry) => entry.count > entry.limit);
    }

    addGems(amount) {
      const gained = Math.max(0, Math.floor(Number(amount) || 0));
      this.activeAccountData.gems = this.gems + gained;
      this.persist();
      return this.gems;
    }

    dismantleCard(id, finish = "normal") {
      if (!cards[id]) return { ok: false, reason: "unknown" };
      if (this.dismantlableCount(id, finish) < 1) return { ok: false, reason: "minimum" };
      const collection = finish === ROYAL_FINISH ? this.activeAccountData.collectionRoyal : this.activeAccountData.collection;
      const gained = finish === ROYAL_FINISH ? ROYAL_DUST_PER_DISMANTLE : DUST_PER_DISMANTLE;
      collection[id] = this.ownedCount(id, finish) - 1;
      this.activeAccountData.dust = this.dust + gained;
      this.persist();
      return { ok: true, id, finish, gained, dust: this.dust };
    }

    bulkDismantleExtras() {
      let dismantled = 0;
      let gained = 0;
      Object.entries(this.activeAccountData.collection || {}).forEach(([id, count]) => {
        const keep = Math.max(this.deckLimit(id, isDriveCard(cards[id])), this.minimumOwnedCount(id));
        const extra = Math.max(0, Math.floor(Number(count) || 0) - keep);
        if (extra <= 0) return;
        this.activeAccountData.collection[id] = count - extra;
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
      if (this.dust < CRAFT_COST) return { ok: false, reason: "dust" };
      this.activeAccountData.dust = this.dust - CRAFT_COST;
      this.addOwned(id, 1);
      this.persist();
      return { ok: true, id, cost: CRAFT_COST, owned: this.ownedCount(id), dust: this.dust };
    }

    rewardCpuResult(won) {
      const gained = won ? CPU_WIN_GEMS : CPU_LOSS_GEMS;
      this.addGems(gained);
      return gained;
    }

    rewardOnlineResult(won) {
      const gained = won ? ONLINE_WIN_GEMS : ONLINE_LOSS_GEMS;
      this.addGems(gained);
      return gained;
    }

    claimAllPresents() {
      const count = this.presents.length;
      this.activeAccountData.presents = [];
      this.persist();
      return { ok: count > 0, gems: 0, count };
    }

    applyRankedSnapshot(snapshot) {
      this.activeAccountData.ranked = normalizeRankedRecord(snapshot);
      this.persist();
      return this.ranked;
    }

    switchAccount(name) {
      const accountName = normalizeAccountName(name);
      if (!this.data.accounts[accountName]) this.data.accounts[accountName] = this.defaultAccount();
      this.activeAccount = accountName;
      this.data.activeAccount = accountName;
      const account = this.activeAccountData;
      this.loadPreset(account.activeDeckId);
      return account;
    }

    async register() {
      throw new Error("新ルール移行中のため、ローカルゲストで利用してください。");
    }

    async login() {
      throw new Error("新ルール移行中のため、ローカルゲストで利用してください。");
    }

    async logout() {
      this.saveAuth(null);
      this.applyLoadedState(this.guestState());
    }

    updateDisplayName(displayName) {
      const name = String(displayName || this.activeAccountData.displayName || this.activeAccount).trim().slice(0, 24);
      this.activeAccountData.displayName = name || this.activeAccount;
      this.activeAccountData.name = this.activeAccountData.displayName;
      this.persist();
      return this.activeAccountData.displayName;
    }

    applyAuthenticatedAccount(account) {
      const accountName = normalizeAccountName(account.username || account.name || DEFAULT_ACCOUNT);
      this.data.accounts[accountName] = this.normalizeAccount(accountName, account);
      this.switchAccount(accountName);
    }

    applyLoadedState(loaded) {
      this.data = loaded.data;
      this.activeAccount = loaded.activeAccount;
      this.activeDeckId = loaded.activeDeckId;
      this.counts = loaded.counts;
      this.royalCounts = loaded.royalCounts;
      this.driveCounts = loaded.driveCounts;
      this.driveRoyalCounts = loaded.driveRoyalCounts;
      this.currentClassKey = this.activeDeck?.classKey || inferClassKey(this.counts) || "blader";
      this.persist();
    }

    setPendingLoginBonus(reward) {
      this.pendingLoginBonus = normalizeLoginBonusReward(reward);
    }

    takeLoginBonusReward() {
      const reward = this.pendingLoginBonus;
      this.pendingLoginBonus = null;
      return reward;
    }

    persist() {
      this.data.activeAccount = this.activeAccount;
      this.activeAccountData.updatedAt = new Date().toISOString();
      this.storage.setItem(STORAGE_KEY, JSON.stringify({
        version: STORE_VERSION,
        activeAccount: this.activeAccount,
        accounts: this.data.accounts,
      }));
    }

    persistLocalOnly() {
      this.persist();
    }

    async syncActiveAccount() {
      return this.activeAccountData;
    }

    saveRemoteAccount() {}

    authHeaders() {
      return { Authorization: `Bearer ${this.auth?.token || ""}`, "X-Account-Username": this.auth?.username || this.activeAccount || "" };
    }

    get total() {
      return deckTotal(this.counts) + deckTotal(this.royalCounts);
    }

    get driveTotal() {
      return deckTotal(this.driveCounts) + deckTotal(this.driveRoyalCounts);
    }

    get list() {
      return [...countsToList(this.counts), ...countsToList(this.royalCounts)];
    }

    get driveList() {
      return [...countsToList(this.driveCounts), ...countsToList(this.driveRoyalCounts)];
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

    get activeClass() {
      return sanitizeClassKey(this.currentClassKey || this.activeDeck?.classKey || "blader");
    }

    get isAuthorAccount() {
      return this.isAuthenticated && Boolean(this.activeAccountData?.isDeveloper);
    }

    get gems() {
      return Math.max(0, Math.floor(Number(this.activeAccountData.gems) || 0));
    }

    get dust() {
      return Math.max(0, Math.floor(Number(this.activeAccountData.dust) || 0));
    }

    get ranked() {
      return normalizeRankedRecord(this.activeAccountData.ranked);
    }

    get rankedLabel() {
      return `ブロンズ ${this.ranked.points} RP`;
    }

    get presents() {
      return normalizePresents(this.activeAccountData.presents);
    }

    get presentCount() {
      return this.presents.length;
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
      return [
        {
          id: "standard",
          name: "クロノドライブ基本パック",
          theme: "汎用",
          description: "新ルール用カード全体から入手できます。",
          count: cardPool.length + drivePool.length,
          cover: "",
          cards: [...cardPool, ...drivePool],
        },
        ...classEntries.map((entry) => {
          const packCards = [...cardPool, ...drivePool].filter((card) => card.cardClass === entry.id || card.cardClass === "generic");
          return {
            id: entry.id,
            name: `${entry.name}パック`,
            theme: entry.name,
            description: entry.description,
            count: packCards.length,
            cover: "",
            cards: packCards,
          };
        }),
      ];
    }

    get activeAccountData() {
      return this.data.accounts[this.activeAccount];
    }

    get isAuthenticated() {
      return Boolean(this.auth?.token);
    }

    get username() {
      return this.activeAccountData?.username || this.activeAccount;
    }

    get displayName() {
      return this.activeAccountData?.displayName || this.activeAccountData?.name || this.username;
    }

    get activeDeck() {
      return this.activeAccountData.decks[this.activeDeckId];
    }

    get accountNames() {
      return Object.keys(this.data.accounts);
    }

    get deckPresets() {
      return Object.values(this.activeAccountData.decks).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }

    nextDeckName() {
      return `デッキ ${this.deckPresets.length + 1}`;
    }

    initialCollection() {
      const result = {};
      cardPool.forEach((card) => {
        result[card.id] = MAX_COPIES;
      });
      drivePool.forEach((card) => {
        result[card.id] = MAX_DRIVE_COPIES;
      });
      return result;
    }

    normalizeCollection(collection = {}, finish = "normal") {
      const result = {};
      Object.entries(collection || {}).forEach(([id, count]) => {
        if (!cards[id]) return;
        const safeCount = Math.max(0, Math.floor(Number(count) || 0));
        if (safeCount > 0) result[id] = safeCount;
      });
      if (finish !== ROYAL_FINISH) {
        Object.entries(this.initialCollection()).forEach(([id, count]) => {
          result[id] = Math.max(result[id] || 0, Number(count) || 0);
        });
      }
      return result;
    }

    get stats() {
      return this.combinedStats;
    }

    get driveStats() {
      return this.combinedStats;
    }

    get combinedStats() {
      const deckCards = [...this.list, ...this.driveList].map((id) => cards[id]).filter(Boolean);
      const classKey = this.activeClass;
      const themed = deckCards.filter((card) => card.cardClass === classKey).length;
      const avgCost = deckCards.length ? deckCards.reduce((sum, card) => sum + Number(card.cost || 0), 0) / deckCards.length : 0;
      return {
        total: deckCards.length,
        themeRate: deckCards.length ? Math.round((themed / deckCards.length) * 100) : 0,
        avgCost,
        mainTheme: classLabels[classKey] || "なし",
      };
    }

    get mainThemeInfo() {
      return { theme: classLabels[this.activeClass] || "なし", count: this.total };
    }
  }

  function cardAllowedInClass(card, classKey) {
    return card?.cardClass === "generic" || card?.cardClass === classKey;
  }

  function sortAutoBuildCandidates(a, b, classKey) {
    const aRank = a.cardClass === classKey ? 0 : 1;
    const bRank = b.cardClass === classKey ? 0 : 1;
    return aRank - bRank || Number(a.cost || 0) - Number(b.cost || 0) || a.name.localeCompare(b.name, "ja");
  }

  function isDriveCard(card) {
    return Boolean(card?.driveKind || card?.type === "ドライブユニット");
  }

  function trimDeck(source, size) {
    const result = {};
    let total = 0;
    Object.entries(source || {}).forEach(([id, count]) => {
      if (!cards[id]) return;
      const safeCount = Math.max(0, Math.floor(Number(count) || 0));
      const room = Math.max(0, size - total);
      const keep = Math.min(safeCount, room);
      if (keep > 0) {
        result[id] = keep;
        total += keep;
      }
    });
    return result;
  }

  function deckTotal(source) {
    return Object.values(source || {}).reduce((sum, count) => sum + Math.max(0, Math.floor(Number(count) || 0)), 0);
  }

  function countsToList(counts = {}) {
    return Object.entries(counts).flatMap(([id, count]) => Array(Math.max(0, Math.floor(Number(count) || 0))).fill(id));
  }

  function countIds(list) {
    return list.reduce((map, id) => {
      map[id] = (map[id] || 0) + 1;
      return map;
    }, {});
  }

  function normalizeAccountName(name) {
    return String(name || DEFAULT_ACCOUNT).trim().slice(0, 24) || DEFAULT_ACCOUNT;
  }

  function normalizeDeckName(name) {
    return String(name || "デッキ").trim().slice(0, 32) || "デッキ";
  }

  function sanitizeId(id) {
    return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || uniqueId();
  }

  function uniqueDeckId(decks) {
    let index = Object.keys(decks || {}).length + 1;
    let id = `deck_${index}`;
    while (decks[id]) {
      index += 1;
      id = `deck_${index}`;
    }
    return id;
  }

  function uniqueId() {
    return `deck_${Date.now().toString(36)}`;
  }

  function sanitizeClassKey(value) {
    const key = String(value || "blader");
    return CLASSES?.[key] ? key : "blader";
  }

  function inferClassKey(counts = {}) {
    const tally = {};
    Object.entries(counts || {}).forEach(([id, count]) => {
      const card = cards[id];
      if (!card || card.cardClass === "generic") return;
      tally[card.cardClass] = (tally[card.cardClass] || 0) + Number(count || 0);
    });
    return Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  }

  function normalizeRankedRecord(source = {}) {
    return {
      points: Math.max(0, Math.floor(Number(source.points) || 1000)),
      wins: Math.max(0, Math.floor(Number(source.wins) || 0)),
      losses: Math.max(0, Math.floor(Number(source.losses) || 0)),
      streak: Math.max(0, Math.floor(Number(source.streak) || 0)),
      updatedAt: String(source.updatedAt || new Date().toISOString()),
    };
  }

  function normalizePresents(source = []) {
    return Array.isArray(source) ? source.filter(Boolean) : [];
  }

  function normalizeLoginBonusRecord(source = {}) {
    return { claimedDates: Array.isArray(source.claimedDates) ? source.claimedDates : [] };
  }

  function normalizeLoginBonusReward(source = {}) {
    return source && typeof source === "object" ? source : null;
  }

  window.Chrono.DeckStore = DeckStore;
})();
