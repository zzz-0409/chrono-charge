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
    CardZoom,
  } = window.Chrono;

  class DeckBuilderView {
    constructor(options) {
      this.store = options.store;
      this.els = options.els;
      this.toast = options.toast;
      this.onStartDuel = options.onStartDuel;
      this.selectedCardId = "star_scout";
      this.deckMode = "main";
      this.environmentLevel = 1;
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
        this.selectedCardId = Object.keys(this.store.counts)[0] || "star_scout";
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
        this.selectedCardId = Object.keys(this.store.counts)[0] || "star_scout";
        this.render();
        this.toast("プリセットを削除しました。");
      });
      this.els.changeAccountButton.addEventListener("click", () => {
        const account = this.store.switchAccount(this.els.accountNameInput.value);
        this.selectedCardId = Object.keys(this.store.counts)[0] || "star_scout";
        this.render();
        this.toast(`${account.name}に変更しました。`);
      });
      this.els.deckPresetSelect.addEventListener("change", () => this.renderProfilePanel());
      this.els.autoBuildButton.addEventListener("click", () => {
        const label = this.store.autoBuild(this.els.autoBuildMode.value);
        this.selectedCardId = Object.keys(this.store.counts)[0] || "star_scout";
        this.els.deckPresetSelect.value = this.store.activeDeckId;
        this.render();
        this.toast(`${label}を作成しました。保存するとプリセットに反映されます。`);
      });
      this.els.newDuelButton.addEventListener("click", () => this.onStartDuel());
      this.els.searchInput.addEventListener("input", () => this.render());
      this.els.typeFilter.addEventListener("change", () => this.render());
      this.els.attrFilter.addEventListener("change", () => this.render());
      this.els.mainDeckModeButton.addEventListener("click", () => this.setDeckMode("main"));
      this.els.environmentDeckModeButton.addEventListener("click", () => this.setDeckMode("environment"));
      this.els.environmentLevel1Button.addEventListener("click", () => this.setEnvironmentLevel(1));
      this.els.environmentLevel2Button.addEventListener("click", () => this.setEnvironmentLevel(2));
      this.els.environmentLevel3Button.addEventListener("click", () => this.setEnvironmentLevel(3));
      this.els.cardPreview.addEventListener("click", (event) => CardZoom.openFromEvent(event));
    }

    setDeckMode(mode) {
      if (this.deckMode === mode) return;
      this.deckMode = mode;
      this.els.typeFilter.value = "all";
      this.els.attrFilter.value = "all";
      this.selectedCardId = mode === "environment"
        ? Object.keys(this.store.environmentCounts)[0] || environmentPool[0]?.id
        : Object.keys(this.store.counts)[0] || "star_scout";
      this.render();
    }

    setEnvironmentLevel(level) {
      if (!this.canEditEnvironmentLevel(level)) return;
      this.environmentLevel = level;
      this.selectedCardId = this.environmentCardIdsForLevel(level)[0] || environmentPool.find((card) => card.level === level)?.id || this.selectedCardId;
      this.render({ preserveLibraryScroll: false });
    }

    render(options = {}) {
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
      this.ensureEnvironmentLevelIsEditable();
      this.renderEnvironmentLevelTabs();
      const sourcePool = this.deckMode === "environment" ? this.environmentPoolForActiveLevel() : cardPool;
      const filtered = sourcePool.filter((card) => {
        const matchesQuery = card.name.toLowerCase().includes(query);
        const matchesType = this.deckMode === "environment" || type === "all" || card.type === type;
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

      const editingEnvironment = this.deckMode === "environment";
      const count = card.type === "環境" ? this.store.environmentCounts[this.selectedCardId] || 0 : this.store.counts[this.selectedCardId] || 0;
      const limit = card.type === "環境" ? 1 : MAX_COPIES;
      const canUseInMode = editingEnvironment ? card.type === "環境" : card.type !== "環境";
      const canAdd = canUseInMode && this.canAddSelectedCard(card, count);
      const canRemove = canUseInMode && count > 0;
      const meta = card.type === "環境" ? `Lv${card.level} / ${card.family}系統` : `${card.type} / ${card.attr}`;

      target.innerHTML = `
        <div class="preview-control-copy">
          <span>投入枚数</span>
          <strong>${count} / ${limit}</strong>
          <small>${meta}</small>
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

    canAddSelectedCard(card, count) {
      if (card.type === "環境") {
        return count < 1 && this.canEditEnvironmentLevel(card.level) && card.level === this.environmentLevel;
      }
      return count < MAX_COPIES && this.store.total < DECK_SIZE;
    }

    addCardToDeck(id) {
      const card = cards[id];
      if (!card) return;
      const result = card?.type === "環境" ? this.store.addEnvironment(id) : this.store.add(id);
      this.toastDeckResult(result, card);
      this.selectedCardId = id;
      this.render({ preserveLibraryScroll: true });
    }

    removeCardFromDeck(id) {
      const card = cards[id];
      if (!card) return;
      if (card.type === "環境") this.store.removeEnvironment(id);
      else this.store.remove(id);
      this.selectedCardId = id;
      this.render({ preserveLibraryScroll: true });
    }

    toastDeckResult(result, card) {
      if (result.ok) return;
      if (result.reason === "full") this.toast("デッキは40枚までです。");
      if (result.reason === "copies") this.toast(card?.type === "環境" ? "同じ環境カードは1枚までです。" : "同名カードは3枚までです。");
      if (result.reason === "levelFull") this.toast(`環境Lv${card.level}は${ENVIRONMENT_DECK_PER_LEVEL}枚までです。`);
      if (result.reason === "levelLocked") this.toast("前のLvを3枚選ぶと追加できます。");
      if (result.reason === "familyLocked") this.toast("Lv1で選んだ系統だけ追加できます。");
      if (result.reason === "familyLevelUsed") this.toast(`Lv${card.level}の${card.family}系統は1枚までです。`);
    }

    renderDeckPanel() {
      const stats = this.store.stats;
      this.els.themeRate.textContent = `${stats.themeRate}%`;
      this.els.avgCost.textContent = stats.avgCost.toFixed(1);
      this.els.reactionCount.textContent = stats.reactions;
      this.renderEnvironmentDeckPanel();
      this.renderDeckModeState();

      this.els.deckList.replaceChildren();
      Object.entries(this.store.counts)
        .sort((a, b) => cards[a[0]].cost - cards[b[0]].cost || cards[a[0]].name.localeCompare(cards[b[0]].name, "ja"))
        .forEach(([id, count]) => this.els.deckList.append(this.createDeckRow(id, count)));
    }

    renderDeckModeState() {
      const environmentTotal = this.store.environmentStats.reduce((sum, entry) => sum + entry.total, 0);
      const editingEnvironment = this.deckMode === "environment";
      this.els.deckPanelEyebrow.textContent = editingEnvironment ? "Environment" : "Main Deck";
      this.els.deckPanelTitle.textContent = editingEnvironment ? "環境デッキ" : "構築デッキ";
      this.els.deckCount.textContent = editingEnvironment ? `${environmentTotal} / ${ENVIRONMENT_DECK_PER_LEVEL * 3}` : `${this.store.total} / ${DECK_SIZE}`;
      this.els.deckCount.style.color = editingEnvironment
        ? (this.store.environmentReady ? "var(--gold)" : "var(--red)")
        : (this.store.total === DECK_SIZE ? "var(--gold)" : "var(--red)");
      this.els.deckList.hidden = editingEnvironment;
      this.els.deckStats.hidden = editingEnvironment;
      this.els.environmentDeckList.closest(".environment-deck-panel").hidden = !editingEnvironment;
      this.els.deckList.closest(".deck-panel").classList.toggle("is-editing-environment", editingEnvironment);
      this.els.mainDeckModeButton.classList.toggle("active", !editingEnvironment);
      this.els.environmentDeckModeButton.classList.toggle("active", editingEnvironment);
    }

    renderEnvironmentLevelTabs() {
      const editingEnvironment = this.deckMode === "environment";
      this.els.environmentLevelTabs.hidden = !editingEnvironment;
      [1, 2, 3].forEach((level) => {
        const button = this.els[`environmentLevel${level}Button`];
        const total = this.store.environmentLevelTotal(this.store.environmentCounts, level);
        button.textContent = `Lv${level} ${total}/${ENVIRONMENT_DECK_PER_LEVEL}`;
        button.disabled = editingEnvironment ? !this.canEditEnvironmentLevel(level) : true;
        button.classList.toggle("active", editingEnvironment && this.environmentLevel === level);
      });
    }

    ensureEnvironmentLevelIsEditable() {
      if (this.deckMode !== "environment" || this.canEditEnvironmentLevel(this.environmentLevel)) return;
      this.environmentLevel = this.canEditEnvironmentLevel(3) ? 3 : this.canEditEnvironmentLevel(2) ? 2 : 1;
    }

    canEditEnvironmentLevel(level) {
      if (level === 1) return true;
      if (level === 2) return this.store.environmentLevelTotal(this.store.environmentCounts, 1) >= ENVIRONMENT_DECK_PER_LEVEL;
      if (level === 3) return this.store.environmentLevelTotal(this.store.environmentCounts, 2) >= ENVIRONMENT_DECK_PER_LEVEL;
      return false;
    }

    environmentPoolForActiveLevel() {
      const levelOneFamilies = new Set(this.store.environmentFamiliesAtLevel(1));
      return environmentPool.filter((card) => {
        if (card.level !== this.environmentLevel) return false;
        if (card.level === 1) return true;
        return levelOneFamilies.has(card.family);
      });
    }

    environmentCardIdsForLevel(level) {
      const levelOneFamilies = new Set(this.store.environmentFamiliesAtLevel(1));
      return environmentPool
        .filter((card) => card.level === level && (level === 1 || levelOneFamilies.has(card.family)))
        .map((card) => card.id);
    }

    createDeckRow(id, count) {
      const card = cards[id];
      const row = document.createElement("div");
      row.className = `deck-row main-deck-row${this.selectedCardId === id ? " selected" : ""}`;
      row.innerHTML = `
        <div>
          <div class="deck-row-main">
            <span class="card-name">${card.name}</span>
          </div>
          <div class="deck-row-sub">${card.type} / ${card.attr} / ${count}枚</div>
        </div>
        <div class="deck-row-controls">
          <span class="cost-chip">${card.cost}</span>
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
      row.className = `deck-row environment-row${this.selectedCardId === id ? " selected" : ""}`;
      row.innerHTML = `
        <div>
          <div class="deck-row-main">
            <span class="card-name">${card.name}</span>
            <span class="level-chip">Lv${card.level}</span>
          </div>
          <div class="deck-row-sub">${card.family}系統 / 環境</div>
        </div>
        <div class="deck-row-controls">
          <button class="mini-button" type="button" data-action="remove">-</button>
        </div>
      `;
      this.bindDeckRowSelection(row, id);
      row.querySelector('[data-action="remove"]').addEventListener("click", () => {
        this.removeCardFromDeck(id);
      });
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
  }

  window.Chrono.DeckBuilderView = DeckBuilderView;
})();
