(function () {
  "use strict";

  const {
    DECK_SIZE,
    ENVIRONMENT_DECK_PER_LEVEL,
    MAX_COPIES,
    cardPool,
    environmentPool,
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

    render(options = {}) {
      this.renderLibrary({ preserveScroll: Boolean(options.preserveLibraryScroll) });
      this.renderDeckPanel();
      CardRenderer.preview(this.selectedCardId, this.els.cardPreview);
    }

    renderLibrary(options = {}) {
      const scrollTop = options.preserveScroll ? this.els.collectionGrid.scrollTop : 0;
      const query = this.els.searchInput.value.trim().toLowerCase();
      const type = this.els.typeFilter.value;
      const attr = this.els.attrFilter.value;
      const sourcePool = [...cardPool, ...environmentPool];
      const filtered = sourcePool.filter((card) => {
        const matchesQuery = card.name.toLowerCase().includes(query);
        const matchesType = type === "all" || card.type === type;
        const matchesAttr = attr === "all" || card.attr === attr;
        return matchesQuery && matchesType && matchesAttr;
      });

      this.els.poolCount.textContent = `${filtered.length}種`;
      this.els.collectionGrid.replaceChildren();
      filtered.forEach((card) => {
        const count = card.type === "環境" ? this.store.environmentCounts[card.id] || 0 : this.store.counts[card.id] || 0;
        const button = CardRenderer.libraryCard(card, count, this.selectedCardId === card.id);
        button.addEventListener("click", () => this.handleCardClick(card.id));
        this.els.collectionGrid.append(button);
      });
      if (options.preserveScroll) this.els.collectionGrid.scrollTop = scrollTop;
    }

    handleCardClick(id) {
      this.selectedCardId = id;
      const card = cards[id];
      const result = card?.type === "環境" ? this.store.addEnvironment(id) : this.store.add(id);
      if (!result.ok && result.reason === "full") this.toast("デッキは40枚までです。");
      if (!result.ok && result.reason === "copies") this.toast(card?.type === "環境" ? "同じ環境カードは1枚までです。" : "同名カードは3枚までです。");
      if (!result.ok && result.reason === "levelFull") this.toast(`環境Lv${card.level}は${ENVIRONMENT_DECK_PER_LEVEL}枚までです。`);
      this.render({ preserveLibraryScroll: true });
    }

    renderDeckPanel() {
      const stats = this.store.stats;
      this.els.deckCount.textContent = `${stats.total} / ${DECK_SIZE}`;
      this.els.deckCount.style.color = stats.total === DECK_SIZE ? "var(--gold)" : "var(--red)";
      this.els.themeRate.textContent = `${stats.themeRate}%`;
      this.els.avgCost.textContent = stats.avgCost.toFixed(1);
      this.els.reactionCount.textContent = stats.reactions;
      this.renderEnvironmentDeckPanel();

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
        this.render({ preserveLibraryScroll: true });
      });
      row.querySelector('[data-action="remove"]').addEventListener("click", () => {
        this.store.remove(id);
        this.selectedCardId = id;
        this.render({ preserveLibraryScroll: true });
      });
      row.querySelector('[data-action="add"]').addEventListener("click", () => {
        const result = this.store.add(id);
        if (!result.ok && result.reason === "full") this.toast("デッキは40枚までです。");
        if (!result.ok && result.reason === "copies") this.toast("同名カードは3枚までです。");
        this.selectedCardId = id;
        this.render({ preserveLibraryScroll: true });
      });
      row.querySelector('[data-action="add"]').disabled = count >= MAX_COPIES || this.store.total >= DECK_SIZE;
      return row;
    }

    renderEnvironmentDeckPanel() {
      if (!this.els.environmentDeckCount || !this.els.environmentDeckList) return;
      const stats = this.store.environmentStats;
      const total = stats.reduce((sum, entry) => sum + entry.total, 0);
      this.els.environmentDeckCount.textContent = `${total} / ${ENVIRONMENT_DECK_PER_LEVEL * 3}`;
      this.els.environmentDeckCount.style.color = this.store.environmentReady ? "var(--gold)" : "var(--red)";
      stats.forEach(({ level, total }) => {
        const element = this.els[`environmentLevel${level}Count`];
        if (element) element.textContent = `${total} / ${ENVIRONMENT_DECK_PER_LEVEL}`;
      });

      this.els.environmentDeckList.replaceChildren();
      Object.entries(this.store.environmentCounts)
        .sort((a, b) => cards[a[0]].level - cards[b[0]].level || cards[a[0]].family.localeCompare(cards[b[0]].family, "ja") || cards[a[0]].name.localeCompare(cards[b[0]].name, "ja"))
        .forEach(([id]) => this.els.environmentDeckList.append(this.createEnvironmentRow(id)));
    }

    createEnvironmentRow(id) {
      const card = cards[id];
      const row = document.createElement("div");
      row.className = "deck-row environment-row";
      row.innerHTML = `
        <div>
          <div class="deck-row-main">
            <button class="linklike card-name" type="button">${card.name}</button>
            <span class="level-chip">Lv${card.level}</span>
          </div>
          <div class="deck-row-sub">${card.family}系統 / 環境</div>
        </div>
        <div class="deck-row-controls">
          <button class="mini-button" type="button" data-action="remove">-</button>
        </div>
      `;
      row.querySelector(".linklike").addEventListener("click", () => {
        this.selectedCardId = id;
        this.render({ preserveLibraryScroll: true });
      });
      row.querySelector('[data-action="remove"]').addEventListener("click", () => {
        this.store.removeEnvironment(id);
        this.selectedCardId = id;
        this.render({ preserveLibraryScroll: true });
      });
      return row;
    }
  }

  window.Chrono.DeckBuilderView = DeckBuilderView;
})();
