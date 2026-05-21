(function () {
  "use strict";

  const {
    DECK_SIZE,
    MAX_COPIES,
    STORAGE_KEY,
    cards,
    starterDeck,
  } = window.Chrono;

  class DeckStore {
    constructor(storage = window.localStorage) {
      this.storage = storage;
      this.counts = this.load();
    }

    load() {
      try {
        const saved = JSON.parse(this.storage.getItem(STORAGE_KEY));
        if (saved && typeof saved === "object") {
          return this.normalize(saved);
        }
      } catch {
        this.storage.removeItem(STORAGE_KEY);
      }
      return { ...starterDeck };
    }

    normalize(source) {
      const result = {};
      Object.entries(source).forEach(([id, count]) => {
        if (!cards[id]) return;
        const safeCount = Math.max(0, Math.min(MAX_COPIES, Number(count) || 0));
        if (safeCount > 0) result[id] = safeCount;
      });
      return result;
    }

    save() {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.counts));
    }

    reset() {
      this.counts = { ...starterDeck };
    }

    clear() {
      this.counts = {};
    }

    add(id) {
      if (!cards[id]) return { ok: false, reason: "unknown" };
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

    get total() {
      return Object.values(this.counts).reduce((sum, count) => sum + count, 0);
    }

    get list() {
      return Object.entries(this.counts).flatMap(([id, count]) => Array(count).fill(id));
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
  }

  window.Chrono.DeckStore = DeckStore;
})();
