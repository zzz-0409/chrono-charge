(function () {
  "use strict";

  const {
    DECK_SIZE,
    DRIVE_DECK_SIZE,
    MAX_COPIES,
    MAX_DRIVE_COPIES,
    cardPool,
    drivePool,
    cards,
    CardRenderer,
    CardZoom,
  } = window.Chrono;

  class DeckBuilderView {
    constructor(options) {
      this.store = options.store;
      this.els = options.els;
      this.toast = options.toast;
      this.onStartDuel = options.onStartDuel;
      this.deckMode = "main";
      this.selectedCardId = "star_scout";
      this.bindEvents();
      this.render();
    }

    bindEvents() {
      this.els.saveDeckButton.addEventListener("click", () => this.saveActiveDeck());
      this.els.savePresetButton.addEventListener("click", () => this.saveActiveDeck());
      this.els.saveAsPresetButton.addEventListener("click", () => {
        const deck = this.store.saveAs(this.els.deckNameInput.value || this.store.nextDeckName());
        this.els.deckPresetSelect.value = this.store.activeDeckId;
        this.render();
        this.toast(`${deck.name}を新規保存しました。`);
      });
      this.els.loadDeckButton.addEventListener("click", () => {
        if (!this.store.loadPreset(this.els.deckPresetSelect.value)) return;
        this.selectedCardId = this.firstSelectedId();
        this.render();
        this.toast(`${this.store.activeDeck.name}を読み込みました。`);
      });
      this.els.deletePresetButton.addEventListener("click", () => {
        const deck = this.store.activeAccountData.decks[this.els.deckPresetSelect.value];
        if (!deck) return;
        if (!window.confirm(`${deck.name}を削除しますか？`)) return;
        if (!this.store.deletePreset(deck.id)) {
          this.toast("最後のプリセットは削除できません。");
          return;
        }
        this.selectedCardId = this.firstSelectedId();
        this.render();
        this.toast("プリセットを削除しました。");
      });
      this.els.changeAccountButton.addEventListener("click", () => {
        const account = this.store.switchAccount(this.els.accountNameInput.value);
        this.selectedCardId = this.firstSelectedId();
        this.render();
        this.toast(`${account.name}に変更しました。`);
      });
      this.els.deckPresetSelect.addEventListener("change", () => this.renderProfilePanel());
      this.els.autoBuildButton.addEventListener("click", () => {
        const label = this.store.autoBuild(this.els.autoBuildMode.value);
        this.selectedCardId = this.firstSelectedId();
        this.els.deckPresetSelect.value = this.store.activeDeckId;
        this.render();
        this.toast(`${label}を作成しました。保存するとプリセットに反映されます。`);
      });
      this.els.newDuelButton.addEventListener("click", () => this.onStartDuel());
      this.els.searchInput.addEventListener("input", () => this.render());
      this.els.typeFilter.addEventListener("change", () => this.render());
      this.els.attrFilter.addEventListener("change", () => this.render());
      this.els.cardPreview.addEventListener("click", (event) => CardZoom.openFromEvent(event));
      this.els.mainDeckModeButton?.addEventListener("click", () => this.setDeckMode("main"));
      this.els.driveDeckModeButton?.addEventListener("click", () => this.setDeckMode("drive"));
    }

    setDeckMode(mode) {
      if (this.deckMode === mode) return;
      this.deckMode = mode;
      this.els.typeFilter.value = "all";
      this.selectedCardId = this.firstSelectedId();
      this.render();
    }

    render(options = {}) {
      this.ensureSelectedCard();
      this.renderProfilePanel();
      this.renderLibrary({ preserveScroll: Boolean(options.preserveLibraryScroll) });
      this.renderDeckPanel();
      CardRenderer.preview(this.selectedCardId, this.els.cardPreview);
      this.renderPreviewDeckControls();
    }

    saveActiveDeck() {
      const deck = this.store.save(this.els.deckNameInput.value);
      this.els.deckPresetSelect.value = this.store.activeDeckId;
      this.render({ preserveLibraryScroll: true });
      this.toast(`${deck.name}を保存しました。`);
    }

    renderProfilePanel() {
      const activeDeck = this.store.activeDeck;
      const selectedId = this.els.deckPresetSelect.value || this.store.activeDeckId;
      if (document.activeElement !== this.els.accountNameInput) {
        this.els.accountNameInput.value = this.store.activeAccount;
      }
      this.els.accountNameList.replaceChildren();
      this.store.accountNames.forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        this.els.accountNameList.append(option);
      });

      this.els.deckPresetSelect.replaceChildren();
      this.store.deckPresets.forEach((deck) => {
        const option = document.createElement("option");
        option.value = deck.id;
        option.textContent = deck.name;
        option.selected = deck.id === (this.store.activeAccountData.decks[selectedId] ? selectedId : this.store.activeDeckId);
        this.els.deckPresetSelect.append(option);
      });

      if (document.activeElement !== this.els.deckNameInput) {
        this.els.deckNameInput.value = activeDeck.name;
      }
      this.els.deletePresetButton.disabled = this.store.deckPresets.length <= 1;
    }

    renderLibrary(options = {}) {
      const scrollTop = options.preserveScroll ? this.els.collectionGrid.scrollTop : 0;
      const query = this.els.searchInput.value.trim().toLowerCase();
      const type = this.els.typeFilter.value;
      const attr = this.els.attrFilter.value;
      const filtered = this.activePool().filter((card) => {
        const matchesQuery = card.name.toLowerCase().includes(query);
        const matchesType = type === "all" || card.type === type;
        const matchesAttr = attr === "all" || card.attr === attr;
        return matchesQuery && matchesType && matchesAttr;
      });

      this.els.poolCount.textContent = `${filtered.length}種`;
      this.els.mainDeckModeButton?.classList.toggle("active", this.deckMode === "main");
      this.els.driveDeckModeButton?.classList.toggle("active", this.deckMode === "drive");
      this.els.collectionGrid.replaceChildren();
      filtered.forEach((card) => {
        const count = this.activeCounts()[card.id] || 0;
        const button = CardRenderer.libraryCard(card, count, this.selectedCardId === card.id);
        button.addEventListener("click", () => this.handleCardClick(card.id));
        this.els.collectionGrid.append(button);
      });
      if (options.preserveScroll) this.els.collectionGrid.scrollTop = scrollTop;
    }

    handleCardClick(id) {
      this.selectedCardId = id;
      this.render({ preserveLibraryScroll: true });
    }

    renderPreviewDeckControls() {
      const target = this.els.previewDeckControls;
      if (!target) return;
      const card = cards[this.selectedCardId];
      if (!card) {
        target.innerHTML = `<div class="preview-control-empty">カード未選択</div>`;
        return;
      }

      const counts = this.activeCounts();
      const limit = this.deckMode === "drive" ? MAX_DRIVE_COPIES : MAX_COPIES;
      const total = this.deckMode === "drive" ? this.store.driveTotal : this.store.total;
      const size = this.deckMode === "drive" ? DRIVE_DECK_SIZE : DECK_SIZE;
      const count = counts[this.selectedCardId] || 0;
      const canAdd = count < limit && total < size;
      const canRemove = count > 0;

      target.innerHTML = `
        <div class="preview-control-copy">
          <span>投入枚数</span>
          <strong>${count} / ${limit}</strong>
          <small>${card.type} / ${card.attr}</small>
        </div>
        <div class="preview-count-stepper">
          <button class="mini-button" type="button" data-action="preview-remove">-</button>
          <strong>${count}</strong>
          <button class="mini-button" type="button" data-action="preview-add">+</button>
        </div>
      `;

      const removeButton = target.querySelector('[data-action="preview-remove"]');
      const addButton = target.querySelector('[data-action="preview-add"]');
      removeButton.disabled = !canRemove;
      addButton.disabled = !canAdd;
      removeButton.addEventListener("click", () => this.removeCardFromDeck(this.selectedCardId));
      addButton.addEventListener("click", () => this.addCardToDeck(this.selectedCardId));
    }

    addCardToDeck(id) {
      const card = cards[id];
      if (!card) return;
      const result = this.deckMode === "drive" ? this.store.addDrive(id) : this.store.add(id);
      this.toastDeckResult(result);
      this.selectedCardId = id;
      this.render({ preserveLibraryScroll: true });
    }

    removeCardFromDeck(id) {
      if (!cards[id]) return;
      if (this.deckMode === "drive") this.store.removeDrive(id);
      else this.store.remove(id);
      this.selectedCardId = id;
      this.render({ preserveLibraryScroll: true });
    }

    toastDeckResult(result) {
      if (result.ok) return;
      if (this.deckMode === "drive") {
        if (result.reason === "full") this.toast("ドライブデッキは10枚までです。");
        if (result.reason === "copies") this.toast(`ドライブカードは各${MAX_DRIVE_COPIES}枚までです。`);
        return;
      }
      if (result.reason === "full") this.toast("デッキは40枚までです。");
      if (result.reason === "copies") this.toast("同名カードは3枚までです。");
    }

    renderDeckPanel() {
      const driveMode = this.deckMode === "drive";
      const labels = this.els.deckStats.querySelectorAll("span");
      if (driveMode) {
        const stats = this.store.driveStats;
        this.els.deckPanelEyebrow.textContent = "Drive Deck";
        this.els.deckPanelTitle.textContent = "ドライブデッキ";
        this.els.deckCount.textContent = `${this.store.driveTotal} / ${DRIVE_DECK_SIZE}`;
        this.els.deckCount.style.color = this.store.driveReady ? "var(--gold)" : "var(--red)";
        if (labels[0]) labels[0].textContent = "テーマ純度";
        if (labels[1]) labels[1].textContent = "平均コスト";
        if (labels[2]) labels[2].textContent = "メインテーマ";
        this.els.themeRate.textContent = `${stats.themeRate}%`;
        this.els.avgCost.textContent = stats.avgCost.toFixed(1);
        this.els.reactionCount.textContent = stats.mainTheme;
        this.renderDeckRows(this.store.driveCounts);
        return;
      }

      const stats = this.store.stats;
      this.els.deckPanelEyebrow.textContent = "Main Deck";
      this.els.deckPanelTitle.textContent = "構築デッキ";
      this.els.deckCount.textContent = `${this.store.total} / ${DECK_SIZE}`;
      this.els.deckCount.style.color = this.store.total === DECK_SIZE ? "var(--gold)" : "var(--red)";
      if (labels[0]) labels[0].textContent = "テーマ純度";
      if (labels[1]) labels[1].textContent = "平均コスト";
      if (labels[2]) labels[2].textContent = "メインテーマ";
      this.els.themeRate.textContent = `${stats.themeRate}%`;
      this.els.avgCost.textContent = stats.avgCost.toFixed(1);
      this.els.reactionCount.textContent = stats.mainTheme;
      this.renderDeckRows(this.store.counts);
    }

    renderDeckRows(counts) {
      this.els.deckList.replaceChildren();
      Object.entries(counts)
        .sort((a, b) => sortCardRows(cards[a[0]], cards[b[0]]))
        .forEach(([id, count]) => this.els.deckList.append(this.createDeckRow(id, count)));
    }

    createDeckRow(id, count) {
      const card = cards[id];
      const driveMode = this.deckMode === "drive";
      const limit = driveMode ? MAX_DRIVE_COPIES : MAX_COPIES;
      const total = driveMode ? this.store.driveTotal : this.store.total;
      const size = driveMode ? DRIVE_DECK_SIZE : DECK_SIZE;
      const chip = card.cost;
      const typeLabel = driveMode ? CardRenderer.shortDriveType(card.type) : card.type;
      const row = document.createElement("div");
      row.className = `deck-row main-deck-row${this.selectedCardId === id ? " selected" : ""}`;
      row.innerHTML = `
        <div>
          <div class="deck-row-main">
            <span class="card-name">${CardRenderer.rubyText(card.name)}</span>
          </div>
          <div class="deck-row-sub">${CardRenderer.rubyText(`${typeLabel} / ${card.attr} / ${count}枚`)}</div>
        </div>
        <div class="deck-row-controls">
          <span class="cost-chip">${chip}</span>
          <button class="mini-button" type="button" data-action="remove">-</button>
          <strong>${count}</strong>
          <button class="mini-button" type="button" data-action="add">+</button>
        </div>
      `;
      this.bindDeckRowSelection(row, id);
      row.querySelector('[data-action="remove"]').addEventListener("click", () => {
        this.removeCardFromDeck(id);
      });
      row.querySelector('[data-action="add"]').addEventListener("click", () => {
        this.addCardToDeck(id);
      });
      row.querySelector('[data-action="add"]').disabled = count >= limit || total >= size;
      return row;
    }

    bindDeckRowSelection(row, id) {
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.setAttribute("aria-label", `${cards[id].name}をフォーカス`);
      row.addEventListener("click", (event) => {
        if (event.target.closest("[data-action]")) return;
        this.selectedCardId = id;
        this.render({ preserveLibraryScroll: true });
      });
      row.addEventListener("keydown", (event) => {
        if (event.target.closest("[data-action]")) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        this.selectedCardId = id;
        this.render({ preserveLibraryScroll: true });
      });
    }

    activePool() {
      return this.deckMode === "drive" ? drivePool : cardPool.filter((card) => card.type !== "環境");
    }

    activeCounts() {
      return this.deckMode === "drive" ? this.store.driveCounts : this.store.counts;
    }

    firstSelectedId() {
      const counts = this.activeCounts();
      return Object.keys(counts)[0] || this.activePool()[0]?.id || "star_scout";
    }

    ensureSelectedCard() {
      if (this.activePool().some((card) => card.id === this.selectedCardId)) return;
      this.selectedCardId = this.firstSelectedId();
    }
  }

  function sortCardRows(a, b) {
    if (!a || !b) return 0;
    const costA = Number.isFinite(a.cost) ? a.cost : 0;
    const costB = Number.isFinite(b.cost) ? b.cost : 0;
    if (costA !== costB) return costA - costB;
    if (a.type !== b.type) return a.type.localeCompare(b.type, "ja");
    return a.name.localeCompare(b.name, "ja");
  }

  window.Chrono.DeckBuilderView = DeckBuilderView;
})();
