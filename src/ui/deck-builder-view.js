(function () {
  "use strict";

  const {
    DECK_SIZE,
    MAX_COPIES,
    cardPool,
    cards,
    CardRenderer,
  } = window.Chrono;

  class DeckBuilderView {
    constructor(options) {
      this.store = options.store;
      this.els = options.els;
      this.toast = options.toast;
      this.onStartDuel = options.onStartDuel;
      this.selectedCardId = "star_scout";
      this.bindEvents();
      this.render();
    }

    bindEvents() {
      this.els.saveDeckButton.addEventListener("click", () => {
        this.store.save();
        this.toast("デッキを保存しました。");
      });
      this.els.newDuelButton.addEventListener("click", () => this.onStartDuel());
      this.els.resetDeckButton.addEventListener("click", () => {
        this.store.reset();
        this.render();
        this.toast("初期デッキに戻しました。");
      });
      this.els.clearDeckButton.addEventListener("click", () => {
        this.store.clear();
        this.render();
      });
      this.els.searchInput.addEventListener("input", () => this.render());
      this.els.typeFilter.addEventListener("change", () => this.render());
      this.els.attrFilter.addEventListener("change", () => this.render());
    }

    render() {
      this.renderLibrary();
      this.renderDeckPanel();
      CardRenderer.preview(this.selectedCardId, this.els.cardPreview);
    }

    renderLibrary() {
      const query = this.els.searchInput.value.trim().toLowerCase();
      const type = this.els.typeFilter.value;
      const attr = this.els.attrFilter.value;
      const filtered = cardPool.filter((card) => {
        const matchesQuery = card.name.toLowerCase().includes(query);
        const matchesType = type === "all" || card.type === type;
        const matchesAttr = attr === "all" || card.attr === attr;
        return matchesQuery && matchesType && matchesAttr;
      });

      this.els.poolCount.textContent = `${filtered.length}種`;
      this.els.collectionGrid.replaceChildren();
      filtered.forEach((card) => {
        const count = this.store.counts[card.id] || 0;
        const button = CardRenderer.libraryCard(card, count, this.selectedCardId === card.id);
        button.addEventListener("click", () => this.handleCardClick(card.id));
        this.els.collectionGrid.append(button);
      });
    }

    handleCardClick(id) {
      this.selectedCardId = id;
      const result = this.store.add(id);
      if (!result.ok && result.reason === "full") this.toast("デッキは40枚までです。");
      if (!result.ok && result.reason === "copies") this.toast("同名カードは3枚までです。");
      this.render();
    }

    renderDeckPanel() {
      const stats = this.store.stats;
      this.els.deckCount.textContent = `${stats.total} / ${DECK_SIZE}`;
      this.els.deckCount.style.color = stats.total === DECK_SIZE ? "var(--gold)" : "var(--red)";
      this.els.themeRate.textContent = `${stats.themeRate}%`;
      this.els.avgCost.textContent = stats.avgCost.toFixed(1);
      this.els.reactionCount.textContent = stats.reactions;

      this.els.deckList.replaceChildren();
      Object.entries(this.store.counts)
        .sort((a, b) => cards[a[0]].cost - cards[b[0]].cost || cards[a[0]].name.localeCompare(cards[b[0]].name, "ja"))
        .forEach(([id, count]) => this.els.deckList.append(this.createDeckRow(id, count)));
    }

    createDeckRow(id, count) {
      const card = cards[id];
      const row = document.createElement("div");
      row.className = "deck-row";
      row.innerHTML = `
        <div>
          <div class="deck-row-main">
            <button class="linklike card-name" type="button">${card.name}</button>
            <span class="cost-chip">${card.cost}</span>
          </div>
          <div class="deck-row-sub">${card.type} / ${card.attr} / ${count}枚</div>
        </div>
        <div class="deck-row-controls">
          <button class="mini-button" type="button" data-action="remove">-</button>
          <strong>${count}</strong>
          <button class="mini-button" type="button" data-action="add">+</button>
        </div>
      `;
      row.querySelector(".linklike").addEventListener("click", () => {
        this.selectedCardId = id;
        this.render();
      });
      row.querySelector('[data-action="remove"]').addEventListener("click", () => {
        this.store.remove(id);
        this.selectedCardId = id;
        this.render();
      });
      row.querySelector('[data-action="add"]').addEventListener("click", () => {
        const result = this.store.add(id);
        if (!result.ok && result.reason === "full") this.toast("デッキは40枚までです。");
        if (!result.ok && result.reason === "copies") this.toast("同名カードは3枚までです。");
        this.selectedCardId = id;
        this.render();
      });
      row.querySelector('[data-action="add"]').disabled = count >= MAX_COPIES || this.store.total >= DECK_SIZE;
      return row;
    }
  }

  window.Chrono.DeckBuilderView = DeckBuilderView;
})();
