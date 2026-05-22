(function () {
  "use strict";

  const {
    DECK_SIZE,
    MAX_COPIES,
    ENVIRONMENT_DECK_PER_LEVEL,
    STORAGE_KEY,
    cards,
    starterDeck,
    starterEnvironmentDeck,
  } = window.Chrono;

  class DeckStore {
    constructor(storage = window.localStorage) {
      this.storage = storage;
      const loaded = this.load();
      this.counts = loaded.counts;
      this.environmentCounts = loaded.environmentCounts;
    }

    load() {
      try {
        const saved = JSON.parse(this.storage.getItem(STORAGE_KEY));
        if (saved && typeof saved === "object") {
          if (saved.mainDeck || saved.environmentDeck) {
            return {
              counts: this.normalizeMain(saved.mainDeck || saved.counts || {}),
              environmentCounts: this.normalizeEnvironment(saved.environmentDeck || {}),
            };
          }
          return {
            counts: this.normalizeMain(saved),
            environmentCounts: { ...starterEnvironmentDeck },
          };
        }
      } catch {
        this.storage.removeItem(STORAGE_KEY);
      }
      return {
        counts: { ...starterDeck },
        environmentCounts: { ...starterEnvironmentDeck },
      };
    }

    normalizeMain(source) {
      const result = {};
      Object.entries(source).forEach(([id, count]) => {
        if (!cards[id] || cards[id].type === "環境") return;
        const safeCount = Math.max(0, Math.min(MAX_COPIES, Number(count) || 0));
        if (safeCount > 0) result[id] = safeCount;
      });
      return result;
    }

    normalizeEnvironment(source) {
      const result = {};
      const entries = Array.isArray(source) ? source.map((id) => [id, 1]) : Object.entries(source);
      entries.forEach(([id, count]) => {
        const card = cards[id];
        if (!card || card.type !== "環境") return;
        const safeCount = Math.max(0, Math.min(1, Number(count) || 0));
        if (safeCount > 0 && this.environmentLevelTotal(result, card.level) < ENVIRONMENT_DECK_PER_LEVEL) {
          result[id] = safeCount;
        }
      });
      return this.fillEnvironmentDefaults(result);
    }

    fillEnvironmentDefaults(result) {
      const next = { ...result };
      Object.keys(starterEnvironmentDeck).forEach((id) => {
        const card = cards[id];
        if (!card || next[id] || this.environmentLevelTotal(next, card.level) >= ENVIRONMENT_DECK_PER_LEVEL) return;
        next[id] = 1;
      });
      return next;
    }

    save() {
      this.storage.setItem(STORAGE_KEY, JSON.stringify({
        mainDeck: this.counts,
        environmentDeck: this.environmentCounts,
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
      if (this.environmentLevelTotal(this.environmentCounts, card.level) >= ENVIRONMENT_DECK_PER_LEVEL) {
        return { ok: false, reason: "levelFull" };
      }
      this.environmentCounts[id] = 1;
      return { ok: true };
    }

    removeEnvironment(id) {
      if (!this.environmentCounts[id]) return;
      delete this.environmentCounts[id];
    }

    get total() {
      return Object.values(this.counts).reduce((sum, count) => sum + count, 0);
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

  window.Chrono.DeckStore = DeckStore;
})();
