(function () {
  "use strict";

  const {
    DECK_SIZE,
    DRIVE_DECK_SIZE,
    MAX_LP,
    MAX_DRIVE,
    cards,
    attrClass,
    typeClass,
    cpuDeck,
    cpuDecks,
    cpuDriveDeck,
    createCpuDeckVariant,
    DuelGame,
    CardRenderer,
    SoundEffects,
    CardZoom,
  } = window.Chrono;

  const CPU_RANK_LEVELS = [
    { value: "1", aiLevel: 1, label: "ブロンズ" },
    { value: "2", aiLevel: 2, label: "シルバー" },
    { value: "3", aiLevel: 3, label: "ゴールド" },
    { value: "4", aiLevel: 4, label: "ダイヤ" },
    { value: "5", aiLevel: 5, label: "マスター" },
  ];

  class DuelView {
    constructor(options) {
      this.els = options.els;
      this.toast = options.toast;
      this.setView = options.setView;
      this.onCpuResult = options.onCpuResult || (() => 0);
      this.onOnlineResult = options.onOnlineResult || (() => 0);
      this.onDuelSnapshot = options.onDuelSnapshot || (() => {});
      this.onDuelFinished = options.onDuelFinished || (() => {});
      this.sounds = options.sounds || SoundEffects;
      this.game = null;
      this.restart = null;
      this.selectedCardId = "";
      this.selectedContext = null;
      this.royalBattleIds = new Set();
      this.renderFrame = 0;
      this.lastPlaceSoundAt = 0;
      this.lastDrawSoundAt = 0;
      this.lastDamageSoundAt = 0;
      this.lastDestroySoundAt = 0;
      this.lastActivationSoundAt = 0;
      this.bindEvents();
    }

    bindEvents() {
      this.els.endTurnButton?.addEventListener("click", () => this.game?.endPlayerTurn());
      this.els.restartDuelButton?.addEventListener("click", () => this.restart?.());
      this.els.playerGravePile?.addEventListener("click", () => this.openGraveList("player"));
      this.els.enemyGravePile?.addEventListener("click", () => this.openGraveList("enemy"));
      this.els.playerAbyssPile?.addEventListener("click", () => this.openAbyssList("player"));
      this.els.enemyAbyssPile?.addEventListener("click", () => this.openAbyssList("enemy"));
      this.els.playerDrivePile?.addEventListener("click", () => this.openDriveDeck({ showAll: true }));
      this.els.playerDrivePile?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        this.openDriveDeck({ showAll: true });
      });
      this.els.selectedCardPanel?.addEventListener("click", (event) => CardZoom.openFromEvent(event));
    }

    start(deckList, driveDeckList = [], finishInfo = {}) {
      if (deckList.length !== DECK_SIZE) {
        this.toast("40枚デッキにすると対戦できます。");
        this.setView("builder");
        return;
      }
      if (driveDeckList.length !== DRIVE_DECK_SIZE) {
        this.toast("ドライブデッキを10枚にすると対戦できます。");
        this.setView("builder");
        return;
      }

      this.game?.dispose?.();
      this.royalBattleIds = new Set([...(finishInfo.mainRoyalIds || []), ...(finishInfo.driveRoyalIds || [])]);
      this.restart = () => this.start(deckList, driveDeckList, finishInfo);
      this.selectedContext = null;
      this.selectedCardId = "";
      const cpuRank = this.resolveCpuRank(finishInfo.cpuLevel || "3");
      const cpuChoice = this.chooseCpuDeck(finishInfo.cpuTheme || "random", cpuRank.aiLevel);
      this.game = new DuelGame({
        playerDeck: deckList,
        playerDriveDeck: driveDeckList,
        cpuName: `${cpuRank.label}級 ${this.cpuDisplayName(cpuChoice.name)}`,
        cpuDeck: expandDeck(cpuChoice.deck),
        cpuDriveDeck: expandDeck(cpuChoice.driveDeck),
        cpuAiLevel: cpuRank.aiLevel,
        firstActive: finishInfo.firstActive || "random",
        onChange: () => this.scheduleRender(),
        onResult: (won) => this.showResult(won),
        requestCardChoice: (choice) => this.requestCardChoice(choice),
        showActivation: (activation) => this.showActivation(activation),
        onSoundEvent: (event) => this.handleSoundEvent(event),
      });
      this.game.start();
      this.setView("duel");
    }

    startOnline(game) {
      this.game?.dispose?.();
      this.restart = null;
      this.selectedContext = null;
      this.selectedCardId = "";
      this.royalBattleIds = new Set();
      this.game = game;
      this.game.onChange = () => this.scheduleRender();
      this.game.onResult = (won) => this.showResult(won);
      this.game.requestCardChoice = (choice) => this.requestCardChoice(choice);
      this.game.showActivation = (activation) => this.showActivation(activation);
      this.game.onSoundEvent = (event) => this.handleSoundEvent(event);
      this.game.start?.();
      this.setView("duel");
    }

    resumeLocal(game, finishInfo = {}) {
      if (!game) return false;
      this.game?.dispose?.();
      this.restart = null;
      this.selectedContext = null;
      this.selectedCardId = "";
      this.royalBattleIds = new Set([...(finishInfo.mainRoyalIds || []), ...(finishInfo.driveRoyalIds || [])]);
      this.game = game;
      this.game.options.onChange = () => this.scheduleRender();
      this.game.options.onResult = (won) => this.showResult(won);
      this.game.options.requestCardChoice = (choice) => this.requestCardChoice(choice);
      this.game.options.showActivation = (activation) => this.showActivation(activation);
      this.game.options.onSoundEvent = (event) => this.handleSoundEvent(event);
      this.game.notify?.();
      this.setView("duel");
      return true;
    }

    chooseCpuDeck(mode = "random", aiLevel = 3) {
      const options = Array.isArray(cpuDecks) && cpuDecks.length
        ? cpuDecks
        : [{ name: "CPU: フォートレス", classKey: "fortress", deck: cpuDeck, driveDeck: cpuDriveDeck }];
      const requested = String(mode || "random");
      if (requested !== "random") {
        const themed = options.find((entry) => entry.classKey === requested || entry.name?.includes(requested));
        if (themed) return createCpuDeckVariant ? createCpuDeckVariant(themed, { aiLevel }) : themed;
      }
      const chosen = options[Math.floor(Math.random() * options.length)] || options[0];
      return createCpuDeckVariant ? createCpuDeckVariant(chosen, { aiLevel }) : chosen;
    }

    resolveCpuRank(value = "3") {
      const requested = String(value || "3");
      if (requested === "random") return CPU_RANK_LEVELS[Math.floor(Math.random() * CPU_RANK_LEVELS.length)] || CPU_RANK_LEVELS[2];
      return CPU_RANK_LEVELS.find((rank) => rank.value === requested) || CPU_RANK_LEVELS[2];
    }

    cpuDisplayName(name) {
      return String(name || "CPU").replace(/^CPU:\s*/, "") || "CPU";
    }

    scheduleRender() {
      if (this.game) this.onDuelSnapshot(this.game);
      if (this.renderFrame) return;
      this.renderFrame = window.requestAnimationFrame?.(() => {
        this.renderFrame = 0;
        this.render();
      }) || window.setTimeout(() => {
        this.renderFrame = 0;
        this.render();
      }, 16);
    }

    render() {
      if (!this.game) return;
      this.renderLp();
      this.renderDuelistNames();
      this.renderZones();
      this.renderPiles();
      this.renderHand();
      this.renderSelection();
      this.renderLog();
      this.els.turnBadge.textContent = `Turn ${this.game.turn}`;
      this.els.phaseBadge.textContent = this.phaseLabel();
      this.els.phaseBadge.classList.toggle("is-waiting", Boolean(this.game.cpuThinking));
      this.els.endTurnButton.disabled = !this.game.canPlayerAct();
      this.els.restartDuelButton.disabled = Boolean(this.game.isOnline);
      this.els.playerDeckInfo.textContent = `山札 ${this.game.player.deck.length} / ロスト ${this.game.player.grave.length} / ドライブ ${this.game.player.driveGauge || 0}/${MAX_DRIVE}`;
      this.els.enemyDeckInfo.textContent = `山札 ${this.game.enemy.deck.length} / ロスト ${this.game.enemy.grave.length} / ドライブ ${this.game.enemy.driveGauge || 0}/${MAX_DRIVE}`;
      this.els.handInfo.textContent = `${this.game.player.hand.length}枚`;
    }

    phaseLabel() {
      if (this.game.finished) return "決着";
      if (this.game.cpuThinking) return "相手思考中";
      return this.game.active === "player" ? "自分ターン" : "相手ターン";
    }

    renderLp() {
      this.els.playerLp.textContent = this.game.player.lp;
      this.els.enemyLp.textContent = this.game.enemy.lp;
      this.els.playerLpBar.style.width = `${Math.max(0, (this.game.player.lp / MAX_LP) * 100)}%`;
      this.els.enemyLpBar.style.width = `${Math.max(0, (this.game.enemy.lp / MAX_LP) * 100)}%`;
    }

    renderDuelistNames() {
      this.els.playerNameplate.textContent = this.game.player?.name || "Player";
      this.els.enemyNameplate.textContent = this.game.enemy?.name || "Opponent";
    }

    renderZones() {
      this.renderCharge(this.game.enemy, this.els.enemyCharge, false);
      this.renderCharge(this.game.player, this.els.playerCharge, false);
      this.els.enemyCoreZones?.replaceChildren();
      this.els.playerCoreZones?.replaceChildren();
      this.els.enemyReactionZones?.replaceChildren();
      this.els.playerReactionZones?.replaceChildren();
      this.renderField(this.game.enemy, this.els.enemyUnitZones, "enemy");
      this.renderField(this.game.player, this.els.playerUnitZones, "player");
    }

    renderField(player, element, owner) {
      element.replaceChildren();
      player.units.forEach((entry, index) => {
        const slot = document.createElement("div");
        slot.className = "zone-slot";
        slot.dataset.zone = owner === "player" ? "playerUnit" : "enemyUnit";
        slot.dataset.slotIndex = String(index);
        if (!entry) {
          const empty = document.createElement("div");
          empty.className = "empty-zone";
          empty.setAttribute("aria-hidden", "true");
          slot.append(empty);
          element.append(slot);
          return;
        }
        const card = cards[entry.id];
        if (!card) return;
        const button = CardRenderer.tcgCard(card.id, {
          small: true,
          interactive: true,
          selected: this.isSelected(owner === "player" ? "playerUnit" : "enemyUnit", index, owner),
          finish: this.finishFor(card.id),
        });
        this.tagSelectableCard(button, owner === "player" ? "playerUnit" : "enemyUnit", index, owner);
        button.addEventListener("click", () => this.selectCard(card.id, { zone: owner === "player" ? "playerUnit" : "enemyUnit", index, owner }));
        slot.append(button);
        const badge = document.createElement("div");
        badge.className = `field-atk-badge ${owner === "enemy" ? "is-enemy" : "is-player"}`;
        badge.textContent = card.type === "コア" ? `耐${entry.durability}` : `${entry.remainingAttacks}/${card.attack}`;
        slot.append(badge);
        element.append(slot);
      });
    }

    fieldStateTag(entry, card, player) {
      const parts = [];
      if (card.type === "コア") parts.push(`耐${entry.durability}`);
      else parts.push(`残${entry.remainingAttacks}`);
      if (card.defense) {
        const rest = Math.max(0, Number(card.defense || 0) - Number(entry.defenseTaken || 0));
        parts.push(`防${rest}`);
      }
      if (card.activate && entry.activatedThisTurn) parts.push("起動済");
      if (this.game.remainingDefense(player) > 0 && card.defense) parts.push("防衛中");
      return parts.join(" / ");
    }

    renderCharge(player, element, hiddenNames) {
      element.replaceChildren();
      const activeCount = player.charge.filter((charge) => !charge.tapped).length;
      const countLabel = document.createElement("span");
      countLabel.className = "charge-count-badge";
      countLabel.textContent = `${activeCount} / ${player.charge.length}`;
      element.append(countLabel);
      player.charge.slice(-8).forEach((charge, offset) => {
        const index = Math.max(0, player.charge.length - 8) + offset;
        const id = typeof charge === "string" ? charge : charge?.id;
        const card = cards[id];
        if (!card) return;
        const owner = player === this.game.player ? "player" : "enemy";
        const button = CardRenderer.tcgCard(id, {
          small: true,
          interactive: true,
          facedown: hiddenNames,
          selected: this.isSelected("charge", index, owner),
          finish: this.finishFor(id),
        });
        button.classList.add("charge-card", typeClass[card.type] || "", attrClass[card.attr] || "");
        button.classList.toggle("tapped", Boolean(charge.tapped));
        button.style.setProperty("--charge-offset", Math.min(offset, 4));
        button.addEventListener("click", () => this.openChargeList(owner));
        element.append(button);
      });
    }

    renderPiles() {
      this.updateDeckPile(this.els.playerDeckPile, this.game.player.deck.length, "自分の山札");
      this.updateDeckPile(this.els.enemyDeckPile, this.game.enemy.deck.length, "相手の山札");
      this.updateGravePile(this.els.playerGravePile, this.game.player.grave, "自分のロストゾーン");
      this.updateGravePile(this.els.enemyGravePile, this.game.enemy.grave, "相手のロストゾーン");
      this.updateGravePile(this.els.playerAbyssPile, this.game.player.abyss || [], "自分のアビスゾーン");
      this.updateGravePile(this.els.enemyAbyssPile, this.game.enemy.abyss || [], "相手のアビスゾーン");
      this.updateDrivePile(this.els.playerDrivePile, this.game.player, "自分のドライブデッキ", true);
      this.updateDrivePile(this.els.enemyDrivePile, this.game.enemy, "相手のドライブデッキ", false);
    }

    updateDeckPile(element, count, label) {
      if (!element) return;
      element.replaceChildren();
      element.classList.toggle("has-cards", count > 0);
      element.classList.toggle("is-empty", count === 0);
      element.setAttribute("aria-label", `${label} ${count}枚`);
      const countLabel = document.createElement("span");
      countLabel.className = "deck-pile-count";
      countLabel.textContent = `${count}`;
      element.append(countLabel);
    }

    updateGravePile(element, grave, label) {
      if (!element) return;
      element.replaceChildren();
      const count = grave.length;
      element.classList.toggle("has-cards", count > 0);
      element.classList.toggle("is-empty", count === 0);
      element.setAttribute("aria-label", `${label} ${count}枚`);
      if (count === 0) return;
      const topCardId = grave[count - 1];
      const topCard = CardRenderer.tcgCard(topCardId, { small: true, finish: this.finishFor(topCardId) });
      topCard.classList.add("pile-top-card");
      topCard.setAttribute("aria-hidden", "true");
      element.append(topCard);
    }

    updateDrivePile(element, player, label, inspectable) {
      if (!element) return;
      element.replaceChildren();
      const count = Array.isArray(player.driveDeck) ? player.driveDeck.length : 0;
      const usable = player === this.game.player && this.game.canPlayerAct() ? this.usableNormalDriveIds() : [];
      element.classList.toggle("has-cards", count > 0);
      element.classList.toggle("is-empty", count === 0);
      element.classList.toggle("is-inspectable", Boolean(inspectable));
      element.classList.toggle("has-usable-drive", usable.length > 0);
      element.setAttribute("aria-label", `${label} ${count}枚`);
      const countLabel = document.createElement("span");
      countLabel.className = "drive-pile-count";
      countLabel.textContent = `D ${player.driveGauge || 0}/${MAX_DRIVE}`;
      element.append(countLabel);
      const rest = document.createElement("small");
      rest.textContent = `${count}枚`;
      element.append(rest);
    }

    renderHand() {
      this.els.handZone.replaceChildren();
      this.els.enemyHandZone.replaceChildren();
      this.game.enemy.hand.forEach((_, index) => {
        const back = document.createElement("div");
        back.className = "enemy-hand-card card-back";
        back.style.setProperty("--hand-offset", index);
        this.els.enemyHandZone.append(back);
      });
      const handCount = this.game.player.hand.length;
      const handStep = handCount > 1 ? Math.min(70, 560 / (handCount - 1)) : 0;
      this.game.player.hand.forEach((id, index) => {
        const handOffset = index - ((handCount - 1) / 2);
        const cardData = cards[id];
        const unavailable = !cardData || !this.game.canPlayerAct() || !this.game.canPay(this.game.player, cardData.cost || 0) || !this.game.canPlayCard(this.game.player, cardData);
        const card = CardRenderer.tcgCard(id, {
          interactive: true,
          selected: this.isSelected("hand", index, "player"),
          finish: this.finishFor(id),
        });
        card.style.setProperty("--hand-offset-x", `${Math.round(handOffset * handStep)}px`);
        card.style.setProperty("--hand-rotate", `${Math.round(handOffset * 4)}deg`);
        card.style.setProperty("--hand-lift", `${Math.round(Math.abs(handOffset) * -4)}px`);
        card.style.setProperty("--hand-z", String(20 + index));
        this.tagSelectableCard(card, "hand", index, "player");
        card.classList.toggle("cost-unavailable-card", Boolean(unavailable));
        card.addEventListener("click", () => this.selectCard(id, { zone: "hand", index, owner: "player" }));
        this.els.handZone.append(card);
      });
    }

    renderSelection() {
      if (!this.selectedCardId) this.selectedCardId = this.game?.player.hand[0] || this.firstFieldCardId() || "";
      CardRenderer.focus(this.selectedCardId, this.els.selectedCardPanel, { finish: this.finishFor(this.selectedCardId) });
      this.els.contextActions.replaceChildren();
      if (!this.game || this.game.finished || !this.game.canPlayerAct() || !this.selectedContext || this.selectedContext.owner !== "player") return;

      if (this.selectedContext.zone === "hand") {
        const card = cards[this.selectedCardId];
        const enabled = this.game.canPay(this.game.player, card?.cost || 0) && this.game.canPlayCard(this.game.player, card);
        this.addAction(card?.type === "ユニット" || card?.type === "コア" ? "場に出す" : "発動", async () => {
          const index = this.selectedContext.index;
          this.selectedContext = null;
          if (await this.game.playFromHand(index) !== false) this.playPlaceSound();
        }, enabled);
      }

      if (this.selectedContext.zone === "playerUnit") {
        const index = this.selectedContext.index;
        const entry = this.game.player.units[index];
        const card = cards[entry?.id];
        if (!entry || !card) return;
        if (card.activate) {
          this.addAction("起動", async () => {
            if (await this.game.activateFieldCard(this.game.player, index) !== false) this.playActivationSound();
          }, this.game.canActivateFieldCard(this.game.player, index));
        }
        const remaining = Math.max(0, Number(entry.remainingAttacks || 0));
        if (!CardRenderer.hasAtk(card) || remaining <= 0) return;
        for (let amount = 1; amount <= remaining; amount += 1) {
          if (this.game.canAttackAllocation(this.game.player, index, null, amount)) {
            this.addAction(`直接 ${amount}`, () => this.game.attackWithUnit(index, null, amount), true);
          }
          this.game.enemy.units.forEach((target, targetIndex) => {
            if (!target || !this.game.canAttackAllocation(this.game.player, index, targetIndex, amount)) return;
            const targetCard = cards[target.id];
            this.addAction(`${targetCard?.name || `敵${targetIndex + 1}`}へ ${amount}`, () => this.game.attackWithUnit(index, targetIndex, amount), true);
          });
        }
      }
    }

    firstFieldCardId() {
      return this.game?.player.units.find(Boolean)?.id || this.game?.enemy.units.find(Boolean)?.id || "";
    }

    selectCard(id, context) {
      this.selectedCardId = id;
      this.selectedContext = context;
      this.renderSelection();
    }

    isSelected(zone, index, owner = null) {
      return this.selectedContext?.zone === zone && this.selectedContext.index === index && (!owner || this.selectedContext.owner === owner);
    }

    tagSelectableCard(element, zone, index, owner) {
      element.dataset.zone = zone;
      element.dataset.slotIndex = String(index);
      element.dataset.owner = owner || "";
    }

    usableNormalDriveIds() {
      if (!this.game || typeof this.game.usableDriveCards !== "function") return [];
      return this.game.usableDriveCards(this.game.player);
    }

    openDriveDeck(options = {}) {
      if (!this.game) return;
      const showAll = Boolean(options.showAll);
      const usableIds = new Set(this.usableNormalDriveIds());
      const sourceIds = showAll ? this.game.player.driveDeck : [...usableIds];
      const candidates = sourceIds.map((id, index) => ({
        id,
        index: `${id}:${index}`,
        playable: usableIds.has(id),
      }));
      let selected = candidates.find((entry) => entry.playable) || candidates[0] || null;
      const modal = document.createElement("div");
      modal.className = "modal-dialog choice-dialog drive-deck-dialog";
      modal.innerHTML = `
        <div class="grave-dialog-head">
          <div>
            <h2>ドライブデッキ</h2>
            <p class="small-note">ゲージを消費してドライブユニットを呼び出します。1ターンに1枚まで。</p>
          </div>
          <button class="ghost-button" type="button" data-cancel-sound="true">閉じる</button>
        </div>
        <div class="choice-body drive-deck-body">
          <div class="grave-list choice-list drive-deck-list"></div>
          <div class="choice-focus drive-focus"></div>
        </div>
        <div class="choice-actions drive-focus-actions">
          <button class="primary-button" type="button">ドライブ</button>
        </div>
      `;
      modal.querySelector(".ghost-button").addEventListener("click", () => this.closeModal());
      const list = modal.querySelector(".drive-deck-list");
      const focus = modal.querySelector(".drive-focus");
      const driveButton = modal.querySelector(".drive-focus-actions .primary-button");
      focus.addEventListener("click", (event) => CardZoom.openFromEvent(event));
      const rendered = [];
      const updateSelection = () => {
        rendered.forEach(({ entry, card }) => card.classList.toggle("selected", selected?.index === entry.index));
        CardRenderer.focus(selected?.id, focus, { finish: this.finishFor(selected?.id) });
        driveButton.disabled = !selected?.playable;
        driveButton.textContent = selected?.playable ? "ドライブ" : "条件未達";
      };
      driveButton.addEventListener("click", async () => {
        if (!selected?.playable) return;
        const id = selected.id;
        this.closeModal();
        if (await this.game.playDriveCard(id) !== false) this.playPlaceSound();
      });
      if (candidates.length === 0) {
        list.innerHTML = `<div class="small-note">ドライブデッキにカードが残っていません。</div>`;
      } else {
        candidates.forEach((entry) => {
          const card = CardRenderer.tcgCard(entry.id, { interactive: true, finish: this.finishFor(entry.id) });
          card.classList.add("grave-list-card");
          card.classList.toggle("drive-card-unusable", !entry.playable);
          card.addEventListener("click", () => {
            selected = entry;
            updateSelection();
          });
          rendered.push({ entry, card });
          list.append(card);
        });
      }
      updateSelection();
      this.openModal(modal, { menuSound: true });
    }

    openGraveList(owner) {
      const player = owner === "player" ? this.game.player : this.game.enemy;
      this.openCardList(owner === "player" ? "自分のロストゾーン" : "相手のロストゾーン", player.grave, owner, "grave");
    }

    openAbyssList(owner) {
      const player = owner === "player" ? this.game.player : this.game.enemy;
      this.openCardList(owner === "player" ? "自分のアビスゾーン" : "相手のアビスゾーン", player.abyss || [], owner, "abyss");
    }

    openChargeList(owner) {
      const player = owner === "player" ? this.game.player : this.game.enemy;
      this.openCardList(owner === "player" ? "自分のチャージ" : "相手のチャージ", player.charge.map((entry) => entry.id || entry), owner, "charge");
    }

    openCardList(title, ids, owner, zone) {
      const modal = document.createElement("div");
      modal.className = "modal-dialog choice-dialog grave-dialog";
      modal.innerHTML = `
        <div class="grave-dialog-head">
          <h2>${escapeHtml(title)}</h2>
          <button class="ghost-button" type="button" data-cancel-sound="true">閉じる</button>
        </div>
        <div class="choice-body">
          <div class="grave-list choice-list"></div>
          <div class="grave-focus choice-focus"></div>
        </div>
      `;
      modal.querySelector(".ghost-button").addEventListener("click", () => this.closeModal());
      const list = modal.querySelector(".grave-list");
      const focus = modal.querySelector(".grave-focus");
      focus.addEventListener("click", (event) => CardZoom.openFromEvent(event));
      if (!ids.length) {
        list.innerHTML = `<div class="small-note">カードはありません。</div>`;
      } else {
        ids.slice().reverse().forEach((id, displayIndex) => {
          const originalIndex = ids.length - 1 - displayIndex;
          const card = CardRenderer.tcgCard(id, { interactive: true, finish: this.finishFor(id) });
          card.classList.add("grave-list-card");
          card.addEventListener("click", () => {
            CardRenderer.focus(id, focus, { finish: this.finishFor(id) });
            this.selectCard(id, { zone, index: originalIndex, owner });
          });
          list.append(card);
        });
        CardRenderer.focus(ids[ids.length - 1], focus, { finish: this.finishFor(ids[ids.length - 1]) });
      }
      this.openModal(modal, { menuSound: true });
    }

    requestCardChoice(choice) {
      return new Promise((resolve) => {
        const candidates = choice.candidates || [];
        let selected = candidates[0] || null;
        const modal = document.createElement("div");
        modal.className = "modal-dialog choice-dialog";
        modal.innerHTML = `
          <div class="grave-dialog-head">
            <div>
              <h2>${escapeHtml(choice.title || "カードを選択")}</h2>
              <p class="small-note">${escapeHtml(choice.message || "")}</p>
            </div>
          </div>
          <div class="choice-body">
            <div class="grave-list choice-list"></div>
            <div class="choice-focus"></div>
          </div>
          <div class="choice-actions">
            ${choice.allowPass ? `<button class="ghost-button" type="button" data-pass="true">${escapeHtml(choice.passLabel || "選ばない")}</button>` : ""}
            <button class="primary-button" type="button">決定</button>
          </div>
        `;
        const list = modal.querySelector(".choice-list");
        const focus = modal.querySelector(".choice-focus");
        const decide = modal.querySelector(".primary-button");
        const update = () => {
          decide.disabled = !selected;
          CardRenderer.focus(selected?.id, focus, { finish: this.finishFor(selected?.id) });
        };
        candidates.forEach((entry) => {
          const card = CardRenderer.tcgCard(entry.id, { interactive: true, finish: this.finishFor(entry.id) });
          card.classList.add("grave-list-card");
          card.addEventListener("click", () => {
            selected = entry;
            update();
          });
          list.append(card);
        });
        modal.querySelector("[data-pass]")?.addEventListener("click", () => {
          this.closeModal();
          resolve("pass");
        });
        decide.addEventListener("click", () => {
          this.closeModal();
          resolve(selected?.index ?? null);
        });
        update();
        this.openModal(modal, { menuSound: true });
      });
    }

    addAction(label, handler, enabled = true) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = label.includes("直接") || label === "場に出す" || label === "発動" ? "primary-button" : "ghost-button";
      button.textContent = label;
      button.disabled = !enabled;
      button.addEventListener("click", handler);
      this.els.contextActions.append(button);
    }

    renderLog() {
      this.els.battleLog.replaceChildren();
      this.game.logItems.slice(-12).forEach((message) => {
        const item = document.createElement("li");
        item.textContent = message;
        this.els.battleLog.append(item);
      });
    }

    openModal(content, options = {}) {
      const root = this.els.modalRoot;
      if (!root) return;
      root.replaceChildren(content);
      root.hidden = false;
      if (options.menuSound) this.playMenuSound();
    }

    closeModal() {
      const root = this.els.modalRoot;
      if (!root) return;
      root.hidden = true;
      root.replaceChildren();
    }

    showActivation(activation) {
      if (activation?.id) this.selectedCardId = activation.id;
      this.playActivationSound();
    }

    showResult(won) {
      if (!this.game?.isOnline) this.onCpuResult(won);
      else this.onOnlineResult(won);
      this.onDuelFinished(won, this.game);
      this.toast(won ? "勝利しました！" : "敗北しました。");
    }

    handleSoundEvent(event = {}) {
      if (event.type === "damage") this.playDamageSound();
      if (event.type === "destroy") this.playDestroySound();
    }

    playPlaceSound() {
      const now = performance.now();
      if (now - this.lastPlaceSoundAt < 90) return;
      this.lastPlaceSoundAt = now;
      this.sounds?.play("place", { volume: 0.72 });
    }

    playDamageSound() {
      const now = performance.now();
      if (now - this.lastDamageSoundAt < 90) return;
      this.lastDamageSoundAt = now;
      this.sounds?.play("damage", { volume: 0.78 });
    }

    playDestroySound() {
      const now = performance.now();
      if (now - this.lastDestroySoundAt < 90) return;
      this.lastDestroySoundAt = now;
      this.sounds?.play("destroy", { volume: 0.74 });
    }

    playActivationSound() {
      const now = performance.now();
      if (now - this.lastActivationSoundAt < 90) return;
      this.lastActivationSoundAt = now;
      this.sounds?.play("activation", { volume: 0.7 });
    }

    playMenuSound() {
      this.sounds?.play("menu", { volume: 0.52 });
    }

    finishFor(id) {
      return this.royalBattleIds?.has(id) ? "royal" : "normal";
    }
  }

  function expandDeck(counts = {}) {
    return Object.entries(counts || {}).flatMap(([id, count]) => Array(Math.max(0, Number(count) || 0)).fill(id));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    })[char]);
  }

  window.Chrono.DuelView = DuelView;
})();
