(function () {
  "use strict";

  const {
    DECK_SIZE,
    DRIVE_DECK_SIZE,
    MAX_LP,
    cards,
    attrClass,
    typeClass,
    cpuDeck,
    cpuDecks,
    cpuDriveDeck,
    DuelGame,
    CardRenderer,
    SoundEffects,
    CardZoom,
  } = window.Chrono;

  class DuelView {
    constructor(options) {
      this.els = options.els;
      this.toast = options.toast;
      this.setView = options.setView;
      this.onCpuResult = options.onCpuResult || (() => 0);
      this.onOnlineResult = options.onOnlineResult || (() => 0);
      this.sounds = options.sounds || SoundEffects;
      this.game = null;
      this.selectedCardId = "star_scout";
      this.selectedContext = null;
      this.selectionRenderKey = "";
      this.handSnapshot = null;
      this.handDrag = null;
      this.pointerHandDrag = null;
      this.suppressNextHandClick = false;
      this.boardSoundSnapshot = null;
      this.activationOverlay = null;
      this.modalPeekButton = null;
      this.peekedModalContent = null;
      this.lastPlaceSoundAt = 0;
      this.lastDrawSoundAt = 0;
      this.lastDamageSoundAt = 0;
      this.lastDestroySoundAt = 0;
      this.lastActivationSoundAt = 0;
      this.handleHandPointerMove = (event) => this.moveHandPointerDrag(event);
      this.handleHandPointerUp = (event) => this.finishHandPointerDrag(event);
      this.handleHandPointerCancel = () => this.cancelHandPointerDrag();
      this.bindEvents();
    }

    bindEvents() {
      this.els.endTurnButton.addEventListener("click", () => this.game?.endPlayerTurn());
      this.els.restartDuelButton.addEventListener("click", () => this.restart?.());
      this.els.playerGravePile.addEventListener("click", () => this.openGraveList("player"));
      this.els.enemyGravePile.addEventListener("click", () => this.openGraveList("enemy"));
      this.els.playerAbyssPile?.addEventListener("click", () => this.openAbyssList("player"));
      this.els.enemyAbyssPile?.addEventListener("click", () => this.openAbyssList("enemy"));
      this.els.playerDrivePile?.addEventListener("click", () => this.openDriveDeck({ showAll: true }));
      this.els.playerDrivePile?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        this.openDriveDeck({ showAll: true });
      });
      this.els.selectedCardPanel.addEventListener("click", (event) => CardZoom.openFromEvent(event));
      this.bindHandDropTargets();
    }

    bindHandDropTargets() {
      this.bindDropTarget(this.els.playerUnitZones, "playerUnit");
      this.bindDropTarget(this.els.playerCoreZones, "playerCore");
      this.bindDropTarget(this.els.playerReactionZones, "playerReaction");
      this.bindDropTarget(this.els.playerCharge, "charge");
      const playerSide = this.els.playerUnitZones?.closest(".player-side");
      if (playerSide) this.bindDropTarget(playerSide, "spell");
    }

    bindDropTarget(target, dropZone) {
      if (!target) return;
      target.addEventListener("dragover", (event) => this.handleHandDragOver(event, dropZone));
      target.addEventListener("dragleave", (event) => this.handleHandDragLeave(event, dropZone));
      target.addEventListener("drop", (event) => this.handleHandDrop(event, dropZone));
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

      this.cancelHandPointerDrag();
      this.game?.dispose?.();
      this.royalBattleIds = new Set([...(finishInfo.mainRoyalIds || []), ...(finishInfo.driveRoyalIds || [])]);
      this.restart = () => this.start(deckList, driveDeckList, finishInfo);
      this.selectedContext = null;
      this.selectionRenderKey = "";
      this.handSnapshot = null;
      this.handDrag = null;
      this.pointerHandDrag = null;
      this.boardSoundSnapshot = null;
      const cpuChoice = this.chooseCpuDeck(deckList, finishInfo.cpuTheme || "random");
      this.game = new DuelGame({
        playerDeck: deckList,
        playerDriveDeck: driveDeckList,
        cpuName: this.cpuDisplayName(cpuChoice.name),
        cpuDeck: expandDeck(cpuChoice.deck),
        cpuDriveDeck: expandDeck(cpuChoice.driveDeck),
        firstActive: finishInfo.firstActive || "random",
        onChange: () => this.render(),
        onResult: (won) => this.showResult(won),
        requestReaction: (options, event) => this.requestReactionChoice(options, event),
        requestCardChoice: (choice) => this.requestCardChoice(choice),
        showActivation: (activation) => this.showActivation(activation),
        onSoundEvent: (event) => this.handleSoundEvent(event),
      });
      this.game.start();
      this.setView("duel");
    }

    chooseCpuDeck(playerDeckList = [], mode = "random") {
      const options = Array.isArray(cpuDecks) && cpuDecks.length
        ? cpuDecks
        : [{ name: "CPU: 黒機", deck: cpuDeck, driveDeck: cpuDriveDeck }];
      const requested = String(mode || "random");
      if (requested === "mirror") {
        const playerTheme = dominantTheme(playerDeckList);
        const mirrored = options.find((entry) => dominantTheme(expandDeck(entry.deck)) === playerTheme);
        if (mirrored) return mirrored;
      } else if (requested !== "random") {
        const themed = options.find((entry) => dominantTheme(expandDeck(entry.deck)) === requested);
        if (themed) return themed;
      }
      return options[Math.floor(Math.random() * options.length)] || options[0];
    }

    cpuDisplayName(name) {
      return String(name || "CPU").replace(/^CPU:\s*/, "") || "CPU";
    }

    startOnline(game) {
      this.cancelHandPointerDrag();
      this.game?.dispose?.();
      this.restart = null;
      this.selectedContext = null;
      this.selectionRenderKey = "";
      this.handSnapshot = null;
      this.handDrag = null;
      this.pointerHandDrag = null;
      this.boardSoundSnapshot = null;
      this.game = game;
      this.royalBattleIds = new Set();
      this.game.onChange = () => this.render();
      this.game.onResult = (won) => this.showResult(won);
      this.game.requestCardChoice = (choice) => this.requestCardChoice(choice);
      this.game.showActivation = (activation) => this.showActivation(activation);
      this.game.onSoundEvent = (event) => this.handleSoundEvent(event);
      this.game.start();
      this.setView("duel");
    }

    finishFor(id) {
      return this.royalBattleIds?.has(id) ? "royal" : "normal";
    }

    render() {
      if (!this.game) return;
      this.renderLp();
      this.renderDuelistNames();
      this.renderZones();
      this.playPlacementSoundForBoardIncrease();
      this.renderPiles();
      this.renderHand();
      this.renderSelection();
      this.renderLog();
      this.els.turnBadge.textContent = `Turn ${this.game.turn}`;
      this.els.phaseBadge.textContent = this.phaseLabel();
      this.els.phaseBadge.classList.toggle("is-waiting", Boolean(this.game.pendingChoice || this.game.waitingChoice));
      this.els.endTurnButton.disabled = !this.game.canPlayerAct();
      this.els.restartDuelButton.disabled = Boolean(this.game.isOnline);
      const playerAbyss = this.game.player.abyss || [];
      const enemyAbyss = this.game.enemy.abyss || [];
      this.els.playerDeckInfo.textContent = `山札 ${this.game.player.deck.length} / ロスト ${this.game.player.grave.length} / アビス ${playerAbyss.length}`;
      this.els.enemyDeckInfo.textContent = `山札 ${this.game.enemy.deck.length} / ロスト ${this.game.enemy.grave.length} / アビス ${enemyAbyss.length}`;
      this.els.handInfo.textContent = `${this.game.player.hand.length}枚`;
    }

    phaseLabel() {
      if (this.game.status === "waiting") return "相手待ち";
      if (this.game.finished) return "決着";
      if (this.game.waitingChoice) return this.choiceStatusLabel(this.game.waitingChoice, "opponent");
      if (this.game.pendingChoice) return this.choiceStatusLabel(this.game.pendingChoice, "player");
      return this.game.active === "player" ? "自分ターン" : "相手ターン";
    }

    choiceStatusLabel(choice, owner) {
      if (choice?.zone === "reaction") {
        return owner === "opponent" ? "相手がリアクション確認中" : "リアクション選択中";
      }
      return owner === "opponent" ? "相手が選択中" : "選択中";
    }

    waitingChoiceMessage() {
      if (this.game?.waitingChoice?.zone === "reaction") {
        return "相手がリアクションカードを使うか考えています。";
      }
      return "相手がカードを選択中です。";
    }

    renderLp() {
      this.els.playerLp.textContent = this.game.player.lp;
      this.els.enemyLp.textContent = this.game.enemy.lp;
      this.els.playerLpBar.style.width = `${Math.max(0, (this.game.player.lp / MAX_LP) * 100)}%`;
      this.els.enemyLpBar.style.width = `${Math.max(0, (this.game.enemy.lp / MAX_LP) * 100)}%`;
    }

    renderDuelistNames() {
      if (this.els.playerNameplate) this.els.playerNameplate.textContent = this.game.player?.name || "Player";
      if (this.els.enemyNameplate) this.els.enemyNameplate.textContent = this.game.enemy?.name || "Opponent";
    }

    renderZones() {
      this.renderCharge(this.game.player, this.els.playerCharge, false);
      this.renderCharge(this.game.enemy, this.els.enemyCharge, false);
      this.renderCardZones(this.game.player.cores, this.els.playerCoreZones, "コア", "playerCore");
      this.renderCardZones(this.game.enemy.cores, this.els.enemyCoreZones, "コア", "enemyCore", true);
      this.renderCardZones(this.game.player.units, this.els.playerUnitZones, "ユニット", "playerUnit");
      this.renderCardZones(this.game.enemy.units, this.els.enemyUnitZones, "ユニット", "enemyUnit");
      this.renderCardZones(this.game.player.reactions, this.els.playerReactionZones, "リアクション", "playerReaction", false, true);
      this.renderCardZones(this.game.enemy.reactions, this.els.enemyReactionZones, "リアクション", "enemyReaction", true, true);
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
      element.style.setProperty("--pile-fill", `${Math.min(100, count * 2.5)}%`);
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
      element.style.setProperty("--pile-fill", `${Math.min(100, count * 2.5)}%`);
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
      const usable = player === this.game.player && this.game.canPlayerAct()
        ? this.usableNormalDriveIds()
        : [];
      element.classList.toggle("has-cards", count > 0);
      element.classList.toggle("is-empty", count === 0);
      element.classList.toggle("is-inspectable", Boolean(inspectable));
      element.classList.toggle("has-usable-drive", usable.length > 0);
      element.setAttribute("aria-label", `${label} ${count}枚`);
      element.setAttribute("aria-disabled", inspectable ? "false" : "true");

      const countLabel = document.createElement("span");
      countLabel.className = "drive-pile-count";
      countLabel.textContent = `D ${count}`;
      element.append(countLabel);
    }

    renderCharge(player, element, hiddenNames) {
      element.replaceChildren();
      const activeCount = player.charge.filter((charge) => !charge.tapped).length;
      const totalCount = player.charge.length;
      const countLabel = document.createElement("span");
      countLabel.className = "charge-count-badge";
      countLabel.textContent = `${activeCount} / ${totalCount}`;
      countLabel.setAttribute("aria-hidden", "true");
      element.append(countLabel);
      element.setAttribute("aria-label", `チャージ ${activeCount} / ${totalCount}`);
      player.charge.forEach((charge, index) => {
        const cardId = typeof charge === "string" ? charge : charge?.id;
        const card = cards[cardId];
        if (!card) return;
        const owner = player === this.game.player ? "player" : "enemy";
        const button = CardRenderer.tcgCard(cardId, {
          small: true,
          interactive: true,
          facedown: hiddenNames,
          selected: this.isSelected("charge", index, owner),
          finish: this.finishFor(cardId),
        });
        this.tagSelectableCard(button, "charge", index, owner);
        button.classList.add("charge-card", typeClass[card.type], attrClass[card.attr]);
        button.classList.toggle("tapped", charge.tapped);
        button.style.setProperty("--charge-offset", Math.min(index, 4));
        button.style.zIndex = String(index + 1);
        button.addEventListener("click", () => this.openChargeList(owner));
        element.append(button);
      });
    }

    renderCardZones(zone, element, label, contextZone, hideFace = false, facedown = false) {
      element.replaceChildren();
      for (let i = 0; i < zone.length; i += 1) {
        const slot = document.createElement("div");
        slot.className = "zone-slot";
        slot.dataset.zone = contextZone;
        slot.dataset.slotIndex = String(i);
        const value = zone[i];
        if (value) {
          const owner = contextZone.startsWith("player") ? "player" : "enemy";
          const player = owner === "player" ? this.game.player : this.game.enemy;
          const cardId = typeof value === "string" ? value : value.id;
          const card = cards[cardId];
          const isHiddenReaction = value?.facedown || (facedown && owner === "enemy" && !value.revealed);
          const isOwnSetReaction = facedown && owner === "player" && contextZone.includes("Reaction");
          const isFacedown = isHiddenReaction || isOwnSetReaction;
          if (isFacedown) {
            const cardButton = CardRenderer.tcgCard(cardId, {
              small: true,
              interactive: true,
              selected: this.isSelected(contextZone, i),
              facedown: true,
              finish: this.finishFor(cardId),
            });
            this.tagSelectableCard(cardButton, contextZone, i, owner);
            if (isOwnSetReaction && card && this.game.canPay(player, card.cost)) {
              cardButton.classList.add("reaction-ready-card");
            }
            cardButton.setAttribute("aria-label", `${label}のセットカード ${i + 1}`);
            cardButton.addEventListener("click", () => {
              if (isOwnSetReaction && !isHiddenReaction) {
                this.selectCard(cardId, { zone: contextZone, index: i, owner });
              } else {
                this.selectFacedownCard({ zone: contextZone, index: i, owner });
              }
            });
            slot.append(cardButton);
            element.append(slot);
            continue;
          }
          if (!card) {
            const empty = document.createElement("div");
            empty.className = "empty-zone";
            empty.setAttribute("aria-hidden", "true");
            slot.append(empty);
            element.append(slot);
            continue;
          }
          const atkMod = value.id && CardRenderer.hasAtk(card) ? this.game.getUnitAtk(player, value) - card.atk : 0;
          const cardButton = CardRenderer.tcgCard(cardId, {
            small: true,
            interactive: true,
            selected: this.isSelected(contextZone, i),
            stateTag: value.exhausted ? "行動済み" : "",
            atkMod,
            finish: this.finishFor(cardId),
          });
          this.tagSelectableCard(cardButton, contextZone, i, owner);
          const isReadyDriveCore =
            owner === "player" &&
            contextZone === "playerCore" &&
            typeof this.game.canActivateDriveCore === "function" &&
            this.game.canActivateDriveCore(this.game.player, i);
          if (isReadyDriveCore) {
            cardButton.classList.add("core-ready-card");
          }
          cardButton.addEventListener("click", async () => {
            this.selectCard(cardId, { zone: contextZone, index: i, owner });
            if (isReadyDriveCore && await this.game.activateDriveCore(i) !== false) this.playPlaceSound();
          });
          slot.append(cardButton);
          if (contextZone.includes("Unit") && CardRenderer.hasAtk(card)) {
            const atkBadge = document.createElement("div");
            atkBadge.className = `field-atk-badge ${owner === "enemy" ? "is-enemy" : "is-player"}`;
            atkBadge.textContent = String(this.game.getUnitAtk(player, value));
            slot.append(atkBadge);
            if (value.exhausted) {
              const exhaustedBadge = document.createElement("div");
              exhaustedBadge.className = `field-state-badge ${owner === "enemy" ? "is-enemy" : "is-player"}`;
              exhaustedBadge.textContent = "行動済み";
              slot.append(exhaustedBadge);
            }
          }
        } else {
          const empty = document.createElement("div");
          empty.className = "empty-zone";
          empty.setAttribute("aria-hidden", "true");
          slot.append(empty);
        }
        element.append(slot);
      }
    }

    renderHand() {
      const previous = this.handSnapshot;
      const playerHandCount = this.game.player.hand.length;
      const enemyHandCount = this.game.enemy.hand.length;
      const playerDrawn = previous ? Math.max(0, playerHandCount - previous.player) : 0;
      const enemyDrawn = previous ? Math.max(0, enemyHandCount - previous.enemy) : 0;
      if (previous && (playerDrawn > 0 || enemyDrawn > 0)) this.playDrawSound();

      this.els.handZone.replaceChildren();
      this.els.enemyHandZone.replaceChildren();
      this.game.enemy.hand.forEach((_, index) => {
        const back = document.createElement("div");
        back.className = "enemy-hand-card card-back";
        back.style.setProperty("--hand-offset", index);
        back.setAttribute("aria-label", `相手の手札 ${index + 1}`);
        if (index >= enemyHandCount - enemyDrawn) this.applyDrawAnimation(back, index - (enemyHandCount - enemyDrawn), "enemy");
        this.els.enemyHandZone.append(back);
      });
      this.game.player.hand.forEach((id, index) => {
        const handCard = cards[id];
        const lacksCost = handCard && !this.game.canPay(this.game.player, handCard.cost || 0);
        const canStillCharge = this.game.canPlayerAct() && !this.game.player.chargedThisTurn;
        const canSetReaction = handCard?.type === "リアクション" && this.game.canPlayerAct() && this.game.canSetReaction(this.game.player);
        const unavailable = lacksCost && !canStillCharge && !canSetReaction;
        const card = CardRenderer.tcgCard(id, {
          interactive: true,
          selected: this.isSelected("hand", index),
          finish: this.finishFor(id),
        });
        this.tagSelectableCard(card, "hand", index, "player");
        card.classList.toggle("cost-unavailable-card", Boolean(unavailable));
        if (unavailable) card.setAttribute("aria-disabled", "true");
        if (index >= playerHandCount - playerDrawn) this.applyDrawAnimation(card, index - (playerHandCount - playerDrawn), "player");
        if (this.canDragHandCard(index)) {
          card.classList.add("draggable-hand-card");
          card.draggable = false;
          card.addEventListener("dragstart", (event) => event.preventDefault());
          card.addEventListener("pointerdown", (event) => this.handleHandPointerDown(event, index, id));
        }
        card.addEventListener("click", (event) => {
          if (this.consumeSuppressedHandClick(event)) return;
          this.selectCard(id, { zone: "hand", index, owner: "player" });
        });
        this.els.handZone.append(card);
      });
      this.handSnapshot = {
        player: playerHandCount,
        enemy: enemyHandCount,
      };
    }

    applyDrawAnimation(element, drawIndex, owner) {
      element.classList.add("draw-card", owner === "enemy" ? "draw-card-enemy" : "draw-card-player");
      element.style.setProperty("--draw-delay", `${Math.min(drawIndex, 4) * 72}ms`);
      element.addEventListener("animationend", () => {
        element.classList.remove("draw-card", "draw-card-enemy", "draw-card-player");
        element.style.removeProperty("--draw-delay");
      }, { once: true });
    }

    canDragHandCard(index) {
      if (!this.game?.canPlayerAct()) return false;
      return Boolean(this.game.player.hand[index]);
    }

    handleHandDragStart(event, index, id) {
      if (!this.canDragHandCard(index)) {
        event.preventDefault();
        return;
      }
      this.handDrag = { index, id };
      event.currentTarget.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-chrono-hand-card", JSON.stringify(this.handDrag));
      event.dataTransfer.setData("text/plain", id);
      this.markHandDropTargets(this.handDrag);
    }

    handleHandPointerDown(event, index, id) {
      if ((event.pointerType === "mouse" && event.button !== 0) || !this.canDragHandCard(index)) return;
      event.preventDefault();
      this.cancelHandPointerDrag();
      this.pointerHandDrag = {
        payload: { index, id },
        source: event.currentTarget,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        started: false,
        ghost: null,
        drop: null,
        dropFrame: 0,
        lastDropCheckAt: 0,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      document.addEventListener("pointerrawupdate", this.handleHandPointerMove, { passive: false });
      document.addEventListener("pointermove", this.handleHandPointerMove, { passive: false });
      document.addEventListener("pointerup", this.handleHandPointerUp, { passive: false });
      document.addEventListener("pointercancel", this.handleHandPointerCancel);
    }

    moveHandPointerDrag(event) {
      const drag = this.pointerHandDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const point = this.latestPointerPoint(event);
      const distance = Math.hypot(point.clientX - drag.startX, point.clientY - drag.startY);
      if (!drag.started && distance < 1) return;
      event.preventDefault();
      drag.lastX = point.clientX;
      drag.lastY = point.clientY;
      if (!drag.started) this.beginHandPointerDrag(point);
      this.positionHandDragGhost(point.clientX, point.clientY);
      this.scheduleHandDropTargetUpdate(point.clientX, point.clientY);
    }

    latestPointerPoint(event) {
      const coalesced = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : null;
      const latest = coalesced?.length ? coalesced[coalesced.length - 1] : event;
      return { clientX: latest.clientX, clientY: latest.clientY };
    }

    beginHandPointerDrag(point) {
      const drag = this.pointerHandDrag;
      if (!drag) return;
      drag.started = true;
      this.handDrag = drag.payload;
      drag.source.classList.add("is-dragging");
      drag.source.setAttribute("aria-grabbed", "true");
      this.markHandDropTargets(drag.payload);
      drag.ghost = this.createHandDragGhost(drag.source, drag.payload.id);
      document.body.append(drag.ghost);
      this.positionHandDragGhost(point.clientX, point.clientY);
    }

    createHandDragGhost(source, id) {
      const rect = source.getBoundingClientRect();
      const card = cards[id];
      const ghost = document.createElement("div");
      ghost.className = `hand-drag-ghost ${card ? `${typeClass[card.type]} ${attrClass[card.attr]}` : ""}`;
      ghost.setAttribute("aria-hidden", "true");
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      if (!card) return ghost;

      const top = document.createElement("div");
      top.className = "hand-drag-ghost-top";
      const name = document.createElement("div");
      name.className = "hand-drag-ghost-name";
      name.innerHTML = CardRenderer.rubyText(card.name);
      const cost = document.createElement("div");
      cost.className = "hand-drag-ghost-cost";
      cost.textContent = card.level ? `Lv${card.level}` : card.cost;
      top.append(name, cost);
      ghost.append(top);

      if (card?.art) {
        const img = document.createElement("img");
        img.className = "hand-drag-ghost-art";
        img.src = CardRenderer.artSource(card);
        img.alt = "";
        img.decoding = "async";
        img.draggable = false;
        ghost.append(img);
      }

      const rules = document.createElement("div");
      rules.className = "hand-drag-ghost-rules";
      const type = document.createElement("div");
      type.className = "hand-drag-ghost-type";
      type.innerHTML = CardRenderer.rubyText(CardRenderer.metaLine(card));
      const effect = document.createElement("div");
      effect.className = `hand-drag-ghost-effect ${CardRenderer.effectSizeClass(card.text)}`;
      effect.innerHTML = CardRenderer.rubyText(card.text);
      rules.append(type, effect);
      ghost.append(rules);

      if (Number.isFinite(card.atk)) {
        const stats = document.createElement("div");
        stats.className = "hand-drag-ghost-stats";
        stats.textContent = `ATK ${card.atk}`;
        ghost.append(stats);
      }
      return ghost;
    }

    positionHandDragGhost(clientX, clientY) {
      const ghost = this.pointerHandDrag?.ghost;
      if (!ghost) return;
      ghost.style.transform = `translate3d(${clientX}px, ${clientY}px, 0) translate(-50%, -50%)`;
    }

    scheduleHandDropTargetUpdate(clientX, clientY) {
      const drag = this.pointerHandDrag;
      if (!drag) return;
      drag.lastX = clientX;
      drag.lastY = clientY;
      if (drag.dropFrame) return;
      const now = performance.now();
      const wait = Math.max(0, 70 - (now - drag.lastDropCheckAt));
      drag.dropFrame = window.setTimeout(() => {
        const current = this.pointerHandDrag;
        if (!current) return;
        current.dropFrame = 0;
        current.lastDropCheckAt = performance.now();
        this.updateHandPointerDropTarget(current.lastX, current.lastY);
      }, wait);
    }

    updateHandPointerDropTarget(clientX, clientY) {
      const drag = this.pointerHandDrag;
      if (!drag) return;
      this.clearActiveDropTargetClasses();
      drag.drop = null;
      const target = this.findHandDropTarget(clientX, clientY);
      if (!target) return;
      const result = this.dropCheck(drag.payload, target.dropZone, target.slotIndex);
      drag.drop = { ...target, result };
      if (result.ok) {
        target.target.classList.add("is-drop-target");
        return;
      }
      if (this.isRelevantDropZone(target.dropZone, drag.payload)) {
        target.target.classList.add("drop-blocked");
      }
    }

    async finishHandPointerDrag(event) {
      const drag = this.pointerHandDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      this.removeHandPointerListeners();
      if (!drag.started) {
        this.pointerHandDrag = null;
        return;
      }

      event.preventDefault();
      const point = this.latestPointerPoint(event);
      this.positionHandDragGhost(point.clientX, point.clientY);
      this.updateHandPointerDropTarget(point.clientX, point.clientY);
      this.suppressNextHandClick = true;
      window.setTimeout(() => {
        this.suppressNextHandClick = false;
      }, 220);

      const drop = drag.drop;
      this.cleanupHandPointerDrag(false);
      if (drop?.result?.ok) {
        await this.performHandDrop(drag.payload, drop.dropZone, drop.slotIndex);
      } else if (drop?.result && this.isRelevantDropZone(drop.dropZone, drag.payload)) {
        this.toast(drop.result.message || "ここには置けません。");
      }
      this.clearHandDragState();
    }

    cancelHandPointerDrag() {
      this.cleanupHandPointerDrag(true);
    }

    cleanupHandPointerDrag(clearState) {
      const drag = this.pointerHandDrag;
      this.removeHandPointerListeners();
      if (drag?.dropFrame) window.clearTimeout(drag.dropFrame);
      drag?.ghost?.remove();
      drag?.source?.classList.remove("is-dragging");
      drag?.source?.removeAttribute("aria-grabbed");
      if (drag?.source?.hasPointerCapture?.(drag.pointerId)) {
        drag.source.releasePointerCapture(drag.pointerId);
      }
      this.pointerHandDrag = null;
      if (clearState) this.clearHandDragState();
    }

    removeHandPointerListeners() {
      document.removeEventListener("pointerrawupdate", this.handleHandPointerMove);
      document.removeEventListener("pointermove", this.handleHandPointerMove);
      document.removeEventListener("pointerup", this.handleHandPointerUp);
      document.removeEventListener("pointercancel", this.handleHandPointerCancel);
    }

    consumeSuppressedHandClick(event) {
      if (!this.suppressNextHandClick) return false;
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    clearHandDragState() {
      this.handDrag = null;
      this.els.handZone.querySelectorAll(".is-dragging").forEach((element) => element.classList.remove("is-dragging"));
      this.clearDropTargetClasses();
    }

    clearDropTargetClasses() {
      const root = this.els.duelView || document;
      root.querySelectorAll(".can-drop, .is-drop-target, .drop-blocked").forEach((element) => {
        element.classList.remove("can-drop", "is-drop-target", "drop-blocked");
      });
    }

    clearActiveDropTargetClasses() {
      const root = this.els.duelView || document;
      root.querySelectorAll(".is-drop-target, .drop-blocked").forEach((element) => {
        element.classList.remove("is-drop-target", "drop-blocked");
      });
    }

    markHandDropTargets(payload) {
      this.clearDropTargetClasses();
      this.markSlotDropTargets(this.els.playerUnitZones, "playerUnit", payload);
      this.markSlotDropTargets(this.els.playerCoreZones, "playerCore", payload);
      this.markSlotDropTargets(this.els.playerReactionZones, "playerReaction", payload);
      if (this.dropCheck(payload, "charge").ok) this.els.playerCharge.classList.add("can-drop");
      const playerSide = this.els.playerUnitZones?.closest(".player-side");
      if (playerSide && this.dropCheck(payload, "spell").ok) playerSide.classList.add("can-drop");
    }

    markSlotDropTargets(container, dropZone, payload) {
      container?.querySelectorAll(".zone-slot").forEach((slot) => {
        const slotIndex = Number(slot.dataset.slotIndex);
        if (this.dropCheck(payload, dropZone, slotIndex).ok) slot.classList.add("can-drop");
      });
    }

    handleHandDragOver(event, dropZone) {
      const payload = this.currentHandDragPayload(event);
      if (!payload) return;
      const slotIndex = this.dropSlotIndex(event, dropZone);
      const target = this.dropVisualTarget(event, dropZone);
      if (!target) return;
      const result = this.dropCheck(payload, dropZone, slotIndex);
      if (result.ok) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        target.classList.add("is-drop-target");
        target.classList.remove("drop-blocked");
        return;
      }
      if (this.isRelevantDropZone(dropZone, payload)) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "none";
        target.classList.add("drop-blocked");
        target.classList.remove("is-drop-target");
      }
    }

    handleHandDragLeave(event, dropZone) {
      const target = this.dropVisualTarget(event, dropZone);
      if (!target || target.contains(event.relatedTarget)) return;
      target.classList.remove("is-drop-target", "drop-blocked");
    }

    async handleHandDrop(event, dropZone) {
      const payload = this.currentHandDragPayload(event);
      if (!payload) return;
      const slotIndex = this.dropSlotIndex(event, dropZone);
      const result = this.dropCheck(payload, dropZone, slotIndex);
      if (!result.ok) {
        if (this.isRelevantDropZone(dropZone, payload)) {
          event.preventDefault();
          event.stopPropagation();
          this.toast(result.message || "ここには置けません。");
          this.clearHandDragState();
        }
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      await this.performHandDrop(payload, dropZone, slotIndex);
      this.clearHandDragState();
    }

    async performHandDrop(payload, dropZone, slotIndex) {
      this.selectedContext = null;
      this.clearDropTargetClasses();
      let placed = false;
      if (dropZone === "playerReaction") placed = await this.game.setReaction(payload.index, slotIndex);
      else if (dropZone === "charge") placed = await this.game.chargeFromHand(payload.index);
      else placed = await this.game.playFromHand(payload.index, slotIndex);
      if (placed !== false) this.playPlaceSound();
      return placed;
    }

    currentHandDragPayload(event) {
      if (this.handDrag) return this.handDrag;
      const text = event.dataTransfer?.getData("application/x-chrono-hand-card");
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }

    dropSlotIndex(event, dropZone) {
      if (dropZone === "charge" || dropZone === "spell") return null;
      const eventTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
      const slot = eventTarget?.closest(".zone-slot");
      if (!slot || !event.currentTarget.contains(slot)) return null;
      return Number(slot.dataset.slotIndex);
    }

    dropVisualTarget(event, dropZone) {
      if (dropZone === "charge") return this.els.playerCharge;
      if (dropZone === "spell") return event.currentTarget;
      const eventTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
      const slot = eventTarget?.closest(".zone-slot");
      if (!slot || !event.currentTarget.contains(slot)) return null;
      return slot;
    }

    findHandDropTarget(clientX, clientY) {
      const element = document.elementFromPoint(clientX, clientY);
      if (!(element instanceof Element)) return null;
      const slot = element.closest(".zone-slot");
      if (slot) {
        const slotIndex = Number(slot.dataset.slotIndex);
        if (this.els.playerUnitZones?.contains(slot)) return { dropZone: "playerUnit", slotIndex, target: slot };
        if (this.els.playerCoreZones?.contains(slot)) return { dropZone: "playerCore", slotIndex, target: slot };
        if (this.els.playerReactionZones?.contains(slot)) return { dropZone: "playerReaction", slotIndex, target: slot };
      }
      const charge = element.closest("#playerCharge");
      if (charge && this.els.playerCharge?.contains(charge)) return { dropZone: "charge", slotIndex: null, target: this.els.playerCharge };
      const playerSide = this.els.playerUnitZones?.closest(".player-side");
      if (playerSide?.contains(element)) return { dropZone: "spell", slotIndex: null, target: playerSide };
      return null;
    }

    isRelevantDropZone(dropZone, payload) {
      const card = cards[payload?.id];
      if (!card) return false;
      if (dropZone === "playerUnit") return card.type === "ユニット";
      if (dropZone === "playerCore") return card.type === "コア";
      if (dropZone === "playerReaction") return card.type === "リアクション";
      if (dropZone === "spell") return card.type === "スペル";
      return dropZone === "charge";
    }

    dropCheck(payload, dropZone, slotIndex = null) {
      if (!this.game?.canPlayerAct()) return { ok: false, message: "自分のターンに操作できます。" };
      if (!payload || this.game.player.hand[payload.index] !== payload.id) return { ok: false, message: "手札の状態が変わりました。" };
      const card = cards[payload.id];
      if (!card) return { ok: false, message: "カードを確認できません。" };

      if (dropZone === "charge") {
        return this.game.player.chargedThisTurn
          ? { ok: false, message: "チャージは1ターンに1回までです。" }
          : { ok: true };
      }

      if (dropZone === "spell") {
        if (card.type !== "スペル") return { ok: false, message: "スペルだけここで発動できます。" };
        if (!this.game.canPay(this.game.player, card.cost)) return { ok: false, message: "コストが足りません。" };
        if (!this.game.canPlayCard(this.game.player, card)) return { ok: false, message: "今はそのカードを発動できません。" };
        return { ok: true };
      }

      if (slotIndex === null || Number.isNaN(slotIndex)) return { ok: false, message: "置く枠を選んでください。" };
      if (dropZone === "playerUnit") return this.checkFieldDrop(card, "ユニット", this.game.player.units, slotIndex);
      if (dropZone === "playerCore") return this.checkFieldDrop(card, "コア", this.game.player.cores, slotIndex);
      if (dropZone === "playerReaction") return this.checkFieldDrop(card, "リアクション", this.game.player.reactions, slotIndex, false);
      return { ok: false, message: "ここには置けません。" };
    }

    checkFieldDrop(card, requiredType, zone, slotIndex, needsCost = true) {
      if (card.type !== requiredType) return { ok: false, message: `${requiredType}枠には${requiredType}カードを置けます。` };
      if (slotIndex < 0 || slotIndex >= zone.length) return { ok: false, message: "置く枠を選んでください。" };
      if (zone[slotIndex]) return { ok: false, message: "その枠は空いていません。" };
      if (needsCost && !this.game.canPay(this.game.player, card.cost)) return { ok: false, message: "コストが足りません。" };
      if (requiredType === "リアクション" && !this.game.canSetReaction(this.game.player)) return { ok: false, message: "リアクション枠がいっぱいです。" };
      if (requiredType !== "リアクション" && !this.game.canPlayCard(this.game.player, card)) return { ok: false, message: "今はそのカードを出せません。" };
      return { ok: true };
    }

    playPlacementSoundForBoardIncrease() {
      if (!this.game || this.game.status === "waiting") return;
      const current = this.boardSoundCount();
      if (this.boardSoundSnapshot !== null && current > this.boardSoundSnapshot) {
        this.playPlaceSound();
      }
      this.boardSoundSnapshot = current;
    }

    boardSoundCount() {
      const countOccupied = (list) => list.reduce((sum, entry) => sum + (entry ? 1 : 0), 0);
      return [
        this.game.player.units,
        this.game.player.cores,
        this.game.player.reactions,
        this.game.player.charge,
        this.game.enemy.units,
        this.game.enemy.cores,
        this.game.enemy.reactions,
        this.game.enemy.charge,
      ].reduce((sum, list) => sum + countOccupied(list || []), 0);
    }

    playDrawSound() {
      const now = performance.now();
      if (now - this.lastDrawSoundAt < 90) return;
      this.lastDrawSoundAt = now;
      this.sounds?.play("draw", { volume: 0.68 });
    }

    playPlaceSound() {
      const now = performance.now();
      if (now - this.lastPlaceSoundAt < 90) return;
      this.lastPlaceSoundAt = now;
      this.sounds?.play("place", { volume: 0.72 });
    }

    handleSoundEvent(event = {}) {
      if (event.type === "damage") this.playDamageSound();
      if (event.type === "destroy") this.playDestroySound();
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

    selectCard(id, context) {
      this.selectedCardId = id;
      this.selectedContext = context;
      this.syncSelectedCardMarkers();
      this.renderSelection();
    }

    selectFacedownCard(context) {
      this.selectedCardId = null;
      this.selectedContext = { ...context, hidden: true };
      this.syncSelectedCardMarkers();
      this.renderSelection();
    }

    isSelected(zone, index, owner = null) {
      return this.selectedContext?.zone === zone
        && this.selectedContext.index === index
        && (!owner || this.selectedContext.owner === owner);
    }

    tagSelectableCard(element, zone, index, owner) {
      element.dataset.zone = zone;
      element.dataset.slotIndex = String(index);
      element.dataset.owner = owner || "";
    }

    syncSelectedCardMarkers() {
      const root = this.els.duelView || document;
      root.querySelectorAll(".tcg-card.selected").forEach((element) => element.classList.remove("selected"));
      const context = this.selectedContext;
      if (!context) return;
      const match = Array.from(root.querySelectorAll(".tcg-card[data-zone][data-slot-index]")).find((element) => (
        element.dataset.zone === context.zone
        && element.dataset.slotIndex === String(context.index)
        && (!context.owner || element.dataset.owner === context.owner)
      ));
      match?.classList.add("selected");
    }

    renderSelection() {
      const isHidden = Boolean(this.selectedContext?.hidden);
      const focusStats = isHidden ? {} : this.selectedFocusStats();
      const finish = isHidden ? "facedown" : this.finishFor(this.selectedCardId);
      const selectionRenderKey = isHidden
        ? `hidden:${this.selectedContext?.owner || ""}:${this.selectedContext?.zone || ""}:${this.selectedContext?.index ?? ""}`
        : `card:${this.selectedCardId || ""}:${finish}:${focusStats.atkMod || 0}`;
      if (this.selectionRenderKey !== selectionRenderKey) {
        if (isHidden) {
          CardRenderer.facedownFocus(this.els.selectedCardPanel);
        } else {
          CardRenderer.focus(this.selectedCardId, this.els.selectedCardPanel, { ...focusStats, finish });
        }
        this.selectionRenderKey = selectionRenderKey;
      }
      this.els.contextActions.replaceChildren();
      if (this.game?.disconnectStatus?.opponentMissing && !this.game.finished) {
        this.renderDisconnectNotice();
        return;
      }
      if (this.game?.waitingChoice) {
        this.renderWaitingActionNotice();
        return;
      }
      if (!this.game || this.game.finished) return;
      if (!this.selectedContext) return;
      if (this.selectedContext.owner !== "player" || !this.game.canPlayerAct()) return;

      if (this.selectedContext.zone === "hand") {
        const card = cards[this.selectedCardId];
        if (card.type === "リアクション") {
          this.addAction("セット", async () => {
            const index = this.selectedContext.index;
            this.selectedContext = null;
            if (await this.game.setReaction(index) !== false) this.playPlaceSound();
          }, this.game.canSetReaction(this.game.player));
        } else {
          const label = card.type === "ユニット" ? "召喚" : "発動";
          this.addAction(label, async () => {
            const index = this.selectedContext.index;
            this.selectedContext = null;
            if (await this.game.playFromHand(index) !== false) this.playPlaceSound();
          }, this.game.canPay(this.game.player, card.cost) && this.game.canPlayCard(this.game.player, card));
        }
        const chargeLabel = this.game.player.chargedThisTurn ? "チャージ済み" : "チャージ";
        this.addAction(chargeLabel, async () => {
          const index = this.selectedContext.index;
          this.selectedContext = null;
          if (await this.game.chargeFromHand(index) !== false) this.playPlaceSound();
        }, !this.game.player.chargedThisTurn);
      }

      if (this.selectedContext.zone === "playerUnit") {
        const unit = this.game.player.units[this.selectedContext.index];
        if (!unit) return;
        const targets = this.game.enemy.units
          .map((target, index) => ({ target, index }))
          .filter((entry) => entry.target);
        const canAttack = this.game.canAttack?.(this.game.player) && !unit.exhausted;
        if (targets.length === 0) {
          this.addAction("直接攻撃", () => this.game.attackWithUnit(this.selectedContext.index, null), canAttack);
        } else {
          targets.forEach((entry) => {
            this.addAction(`敵${entry.index + 1}へ攻撃`, () => this.game.attackWithUnit(this.selectedContext.index, entry.index), canAttack);
          });
        }
      }

      if (this.selectedContext.zone === "playerCore") {
        const coreIndex = this.selectedContext.index;
        const canActivate = typeof this.game.canActivateDriveCore === "function" &&
          this.game.canActivateDriveCore(this.game.player, coreIndex);
        this.addAction("効果発動", async () => {
          this.selectedContext = null;
          if (await this.game.activateDriveCore(coreIndex) !== false) this.playPlaceSound();
        }, canActivate);
      }

      if (this.selectedContext.zone === "grave") {
        const card = cards[this.selectedCardId];
        if (card?.driveKind !== "spell") return;
        const graveIndex = this.selectedContext.index;
        const canActivate = typeof this.game.canActivateSpellDriveGraveEffect === "function" &&
          this.game.canActivateSpellDriveGraveEffect(this.game.player, graveIndex);
        this.addAction("ロスト効果", async () => {
          this.selectedContext = null;
          if (await this.game.activateSpellDriveGraveEffect(graveIndex) !== false) this.playPlaceSound();
        }, canActivate);
      }
    }

    renderWaitingActionNotice() {
      const notice = document.createElement("div");
      notice.className = "context-waiting";
      notice.textContent = this.waitingChoiceMessage();
      this.els.contextActions.append(notice);
    }

    renderDisconnectNotice() {
      const status = this.game.disconnectStatus;
      const wrap = document.createElement("div");
      wrap.className = "context-waiting disconnect-claim";
      const message = document.createElement("span");
      message.textContent = status.canClaim
        ? "相手の通信が切れています。勝利を確定できます。"
        : `相手の通信が切れています。あと${status.secondsRemaining}秒待機します。`;
      wrap.append(message);
      if (status.canClaim && typeof this.game.claimDisconnectWin === "function") {
        const button = document.createElement("button");
        button.className = "primary-button";
        button.type = "button";
        button.textContent = "勝利を確定";
        button.addEventListener("click", () => this.game.claimDisconnectWin());
        wrap.append(button);
      }
      this.els.contextActions.append(wrap);
    }

    selectedFocusStats() {
      const context = this.selectedContext;
      if (!context || !["playerUnit", "enemyUnit"].includes(context.zone)) return {};
      const player = context.owner === "player" ? this.game.player : this.game.enemy;
      const unit = player.units[context.index];
      const card = cards[unit?.id];
      if (!unit || !card || !CardRenderer.hasAtk(card)) return {};
      return { atkMod: this.game.getUnitAtk(player, unit) - card.atk };
    }

    usableNormalDriveIds() {
      if (!this.game || typeof this.game.usableDriveCards !== "function") return [];
      return this.game.usableDriveCards(this.game.player)
        .filter((id) => cards[id]?.driveKind !== "reaction");
    }

    openDriveDeck(options = {}) {
      if (!this.game) return;
      const showAll = Boolean(options.showAll);
      const supportsDriveCheck = typeof this.game.usableDriveCards === "function";
      const supportsDrivePlay = supportsDriveCheck && typeof this.game.playDriveCard === "function";
      const usableIds = new Set(supportsDriveCheck ? this.usableNormalDriveIds() : []);
      const sourceIds = showAll ? this.game.player.driveDeck : [...usableIds];
      const candidates = sourceIds.map((id, index) => ({
        id,
        index: showAll ? `${id}:${index}` : id,
        playable: supportsDrivePlay && usableIds.has(id) && cards[id]?.driveKind !== "reaction",
      }));
      let selected = candidates.find((entry) => entry.playable) || candidates[0] || null;
      const modal = document.createElement("div");
      modal.className = "modal-dialog choice-dialog drive-deck-dialog";
      modal.innerHTML = `
        <div class="grave-dialog-head">
          <div>
            <h2>ドライブデッキ</h2>
            <p class="small-note">残りドライブカード一覧です。リアクションドライブは発動タイミングで選択します。</p>
          </div>
          <button class="ghost-button" type="button">閉じる</button>
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
        rendered.forEach(({ entry, card }) => {
          card.classList.toggle("selected", selected?.index === entry.index);
        });
        CardRenderer.focus(selected?.id, focus, { finish: this.finishFor(selected?.id) });
        driveButton.disabled = !selected?.playable;
        driveButton.textContent = selected?.playable ? "ドライブ" : supportsDrivePlay ? "条件未達成" : "表示のみ";
      };
      driveButton.addEventListener("click", async () => {
        if (!selected?.playable) return;
        const id = selected.id;
        this.closeModal();
        if (await this.game.playDriveCard(id) !== false) this.playPlaceSound();
      });
      if (candidates.length === 0) {
        list.innerHTML = `<div class="small-note">${showAll ? "ドライブデッキにカードは残っていません。" : "今使えるドライブカードはありません。"}</div>`;
        driveButton.disabled = true;
        driveButton.textContent = supportsDrivePlay ? "ドライブ" : "表示のみ";
      } else {
        candidates.forEach((entry) => {
          const card = CardRenderer.tcgCard(entry.id, { interactive: true, finish: this.finishFor(entry.id) });
          card.classList.add("grave-list-card");
          card.classList.toggle("drive-card-unusable", !entry.playable);
          if (!entry.playable) card.setAttribute("aria-disabled", "true");
          card.addEventListener("click", () => {
            selected = entry;
            updateSelection();
          });
          rendered.push({ entry, card });
          list.append(card);
        });
        updateSelection();
      }
      this.openModal(modal);
    }

    addAction(label, handler, enabled = true) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = label.includes("攻撃") || label === "発動" || label === "召喚" ? "primary-button" : "ghost-button";
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

    openGraveList(owner) {
      if (!this.game) return;
      const player = owner === "player" ? this.game.player : this.game.enemy;
      const title = owner === "player" ? "自分のロストゾーン" : "相手のロストゾーン";
      const modal = document.createElement("div");
      modal.className = "modal-dialog choice-dialog grave-dialog";
      modal.innerHTML = `
        <div class="grave-dialog-head">
          <h2>${title}</h2>
          <button class="ghost-button" type="button">閉じる</button>
        </div>
        <div class="choice-body">
          <div class="grave-list choice-list"></div>
          <div class="grave-focus choice-focus"></div>
        </div>
        <div class="choice-actions grave-focus-actions">
          <button class="primary-button" type="button">ロスト効果</button>
        </div>
      `;
      modal.querySelector(".ghost-button").addEventListener("click", () => this.closeModal());
      const focus = modal.querySelector(".grave-focus");
      focus.addEventListener("click", (event) => CardZoom.openFromEvent(event));
      const list = modal.querySelector(".grave-list");
      const graveActionButton = modal.querySelector(".grave-focus-actions .primary-button");
      let selectedGraveIndex = -1;
      const updateGraveAction = () => {
        const selectedCard = cards[player.grave[selectedGraveIndex]];
        const canActivate = owner === "player" &&
          typeof this.game.canActivateSpellDriveGraveEffect === "function" &&
          this.game.canActivateSpellDriveGraveEffect(this.game.player, selectedGraveIndex);
        graveActionButton.hidden = owner !== "player" || selectedCard?.driveKind !== "spell";
        graveActionButton.disabled = !canActivate;
      };
      graveActionButton.addEventListener("click", async () => {
        if (owner !== "player" || !this.game.canActivateSpellDriveGraveEffect?.(this.game.player, selectedGraveIndex)) return;
        const index = selectedGraveIndex;
        this.closeModal();
        this.selectedContext = null;
        if (await this.game.activateSpellDriveGraveEffect(index) !== false) this.playPlaceSound();
      });
      const markSelectedListCard = (selectedIndex) => {
        list.querySelectorAll(".grave-list-card").forEach((card) => {
          card.classList.toggle("selected", card.dataset.listIndex === String(selectedIndex));
        });
      };
      const showGraveFocus = (id, originalIndex) => {
        selectedGraveIndex = originalIndex;
        CardRenderer.focus(id, focus, { finish: this.finishFor(id) });
        this.selectCard(id, { zone: "grave", index: originalIndex, owner });
        markSelectedListCard(originalIndex);
        updateGraveAction();
      };
      if (player.grave.length === 0) {
        list.innerHTML = `<div class="small-note">ロストゾーンにカードはありません</div>`;
        updateGraveAction();
      } else {
        player.grave.slice().reverse().forEach((id, displayIndex) => {
          const originalIndex = player.grave.length - 1 - displayIndex;
          const card = CardRenderer.tcgCard(id, { interactive: true, finish: this.finishFor(id) });
          card.classList.add("grave-list-card");
          card.dataset.listIndex = String(originalIndex);
          card.addEventListener("click", () => {
            showGraveFocus(id, originalIndex);
          });
          list.append(card);
        });
        showGraveFocus(player.grave[player.grave.length - 1], player.grave.length - 1);
      }
      this.openModal(modal);
    }

    openAbyssList(owner) {
      if (!this.game) return;
      const player = owner === "player" ? this.game.player : this.game.enemy;
      const abyss = player.abyss || [];
      const title = owner === "player" ? "自分のアビスゾーン" : "相手のアビスゾーン";
      const modal = document.createElement("div");
      modal.className = "modal-dialog choice-dialog grave-dialog abyss-dialog";
      modal.innerHTML = `
        <div class="grave-dialog-head">
          <h2>${title}</h2>
          <button class="ghost-button" type="button">閉じる</button>
        </div>
        <div class="choice-body">
          <div class="grave-list choice-list abyss-list"></div>
          <div class="grave-focus choice-focus"></div>
        </div>
      `;
      modal.querySelector(".ghost-button").addEventListener("click", () => this.closeModal());
      const focus = modal.querySelector(".grave-focus");
      focus.addEventListener("click", (event) => CardZoom.openFromEvent(event));
      const list = modal.querySelector(".abyss-list");
      const markSelectedListCard = (selectedIndex) => {
        list.querySelectorAll(".grave-list-card").forEach((card) => {
          card.classList.toggle("selected", card.dataset.listIndex === String(selectedIndex));
        });
      };
      const showAbyssFocus = (id, originalIndex) => {
        CardRenderer.focus(id, focus, { finish: this.finishFor(id) });
        this.selectCard(id, { zone: "abyss", index: originalIndex, owner });
        markSelectedListCard(originalIndex);
      };
      if (abyss.length === 0) {
        list.innerHTML = `<div class="small-note">アビスゾーンにカードはありません</div>`;
      } else {
        abyss.slice().reverse().forEach((id, displayIndex) => {
          const originalIndex = abyss.length - 1 - displayIndex;
          const card = CardRenderer.tcgCard(id, { interactive: true, finish: this.finishFor(id) });
          card.classList.add("grave-list-card", "abyss-list-card");
          card.dataset.listIndex = String(originalIndex);
          card.addEventListener("click", () => {
            showAbyssFocus(id, originalIndex);
          });
          list.append(card);
        });
        showAbyssFocus(abyss[abyss.length - 1], abyss.length - 1);
      }
      this.openModal(modal);
    }

    openChargeList(owner) {
      if (!this.game) return;
      const player = owner === "player" ? this.game.player : this.game.enemy;
      const title = owner === "player" ? "自分のチャージ" : "相手のチャージ";
      const activeCount = player.charge.filter((entry) => !entry.tapped).length;
      const totalCount = player.charge.length;
      const modal = document.createElement("div");
      modal.className = "modal-dialog choice-dialog grave-dialog charge-dialog";
      modal.innerHTML = `
        <div class="grave-dialog-head">
          <div>
            <h2>${title}</h2>
            <span class="charge-dialog-count">${activeCount} / ${totalCount}</span>
          </div>
          <button class="ghost-button" type="button">閉じる</button>
        </div>
        <div class="choice-body">
          <div class="grave-list choice-list charge-list"></div>
          <div class="grave-focus choice-focus"></div>
        </div>
      `;
      modal.querySelector(".ghost-button").addEventListener("click", () => this.closeModal());
      const focus = modal.querySelector(".grave-focus");
      focus.addEventListener("click", (event) => CardZoom.openFromEvent(event));
      const list = modal.querySelector(".charge-list");
      const markSelectedListCard = (selectedIndex) => {
        list.querySelectorAll(".grave-list-card").forEach((card) => {
          card.classList.toggle("selected", card.dataset.listIndex === String(selectedIndex));
        });
      };
      const showChargeFocus = (entry, originalIndex) => {
        const id = typeof entry === "string" ? entry : entry?.id;
        if (!id) return;
        CardRenderer.focus(id, focus, { finish: this.finishFor(id) });
        this.selectCard(id, { zone: "charge", index: originalIndex, owner });
        markSelectedListCard(originalIndex);
      };
      if (player.charge.length === 0) {
        list.innerHTML = `<div class="small-note">チャージはありません</div>`;
      } else {
        player.charge.slice().reverse().forEach((entry, displayIndex) => {
          const originalIndex = player.charge.length - 1 - displayIndex;
          const id = typeof entry === "string" ? entry : entry?.id;
          if (!id) return;
          const card = CardRenderer.tcgCard(id, { interactive: true, finish: this.finishFor(id) });
          card.classList.add("grave-list-card", "charge-list-card");
          card.dataset.listIndex = String(originalIndex);
          card.classList.toggle("tapped", Boolean(entry?.tapped));
          card.setAttribute("aria-label", `${cards[id]?.name || "カード"} ${entry?.tapped ? "非アクティブ" : "アクティブ"}`);
          card.addEventListener("click", () => {
            showChargeFocus(entry, originalIndex);
          });
          list.append(card);
        });
        showChargeFocus(player.charge[player.charge.length - 1], player.charge.length - 1);
      }
      this.openModal(modal);
    }

    requestReactionChoice(options, event) {
      return this.requestCardChoice({
        title: "リアクション",
        message: `${event.source?.name || "相手の行動"}に対応できます。使うリアクションカードまたはリアクションドライブを選んでください。`,
        candidates: options,
        allowPass: true,
        confirmLabel: "発動",
        passLabel: "発動しない",
      });
    }

    requestReaction(options, event) {
      return new Promise((resolve) => {
        const modal = document.createElement("div");
        modal.className = "modal-dialog";
        modal.innerHTML = `
          <h2>リアクション</h2>
          <p>${event.source.name}に対応できます。</p>
          <div class="modal-actions"></div>
        `;
        const actions = modal.querySelector(".modal-actions");
        options.forEach((option) => {
          const card = cards[option.id];
          const button = document.createElement("button");
          button.type = "button";
          button.className = "primary-button";
          button.textContent = `${card.name}を発動`;
          button.addEventListener("click", () => {
            this.closeModal();
            resolve(option.index);
          });
          actions.append(button);
        });
        const pass = document.createElement("button");
        pass.type = "button";
        pass.className = "ghost-button";
        pass.textContent = "発動しない";
        pass.addEventListener("click", () => {
          this.closeModal();
          resolve(null);
        });
        actions.append(pass);
        this.openModal(modal);
      });
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
              <h2>${choice.title || "カードを選択"}</h2>
              <p class="small-note">${choice.message || "効果で選ぶカードを指定してください。"}</p>
            </div>
          </div>
          <div class="choice-body">
            <div class="grave-list choice-list"></div>
            <div class="choice-focus"></div>
          </div>
          <div class="choice-actions">
            <button class="ghost-button peek-board-button" type="button">盤面を見る</button>
            <button class="primary-button" type="button">決定</button>
          </div>
        `;
        const list = modal.querySelector(".choice-list");
        const focus = modal.querySelector(".choice-focus");
        const decide = modal.querySelector(".primary-button");
        const peekBoard = modal.querySelector(".peek-board-button");
        decide.textContent = choice.confirmLabel || decide.textContent;
        peekBoard.addEventListener("click", () => this.peekModal());
        focus.addEventListener("click", (event) => CardZoom.openFromEvent(event));
        const buttons = [];
        const updateSelection = () => {
          buttons.forEach(({ entry, card }) => {
            card.classList.toggle("selected", selected?.index === entry.index);
          });
          decide.disabled = !selected;
          CardRenderer.focus(selected?.id, focus, { finish: this.finishFor(selected?.id) });
        };

        candidates.forEach((entry) => {
          const card = CardRenderer.tcgCard(entry.id, { interactive: true, finish: this.finishFor(entry.id) });
          card.classList.add("grave-list-card");
          card.addEventListener("click", () => {
            selected = entry;
            updateSelection();
          });
          buttons.push({ entry, card });
          list.append(card);
        });
        decide.addEventListener("click", () => {
          if (!selected) return;
          this.closeModal();
          resolve(selected.index);
        });
        if (choice.allowPass) {
          const pass = document.createElement("button");
          pass.type = "button";
          pass.className = "ghost-button";
          pass.textContent = "発動しない";
          if (choice.passLabel) pass.textContent = choice.passLabel;
          pass.addEventListener("click", () => {
            this.closeModal();
            resolve(null);
          });
          modal.querySelector(".choice-actions").append(pass);
        }
        updateSelection();
        this.openModal(modal);
      });
    }

    showActivation(activation = {}) {
      const id = activation.id;
      if (!id || !cards[id]) return Promise.resolve();
      this.playActivationSound();

      return new Promise((resolve) => {
        this.activationOverlay?.remove();

        const overlay = document.createElement("div");
        overlay.className = "activation-overlay";
        overlay.setAttribute("aria-hidden", "true");

        const burst = document.createElement("div");
        burst.className = `activation-burst ${activation.kind === "reaction" ? "is-reaction" : "is-effect"}`;

        const label = document.createElement("div");
        label.className = "activation-label";
        label.textContent = activation.kind === "reaction" ? "リアクション発動" : "効果発動";

        const cardSlot = document.createElement("div");
        cardSlot.className = "activation-card-slot";
        CardRenderer.preview(id, cardSlot, { finish: this.finishFor(id) });

        burst.append(label, cardSlot);
        overlay.append(burst);

        const host = this.els.appShell || this.els.duelView || document.body;
        host.append(overlay);
        this.activationOverlay = overlay;

        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (this.activationOverlay === overlay) this.activationOverlay = null;
          overlay.remove();
          resolve();
        };
        window.setTimeout(finish, 1500);
      });
    }

    showResult(won) {
      const online = Boolean(this.game?.isOnline);
      const ranked = Boolean(this.game?.isRanked);
      const rankedResult = this.game?.rankedResult || null;
      const reward = online ? this.onOnlineResult(won) : this.onCpuResult(won);
      const rankedDelta = rankedResult?.delta > 0 ? `+${rankedResult.delta}` : String(rankedResult?.delta || 0);
      const opponentRank = rankedResult?.opponentPointsBefore !== undefined ? ` / 相手 ${rankedResult.opponentPointsBefore} RP` : "";
      const rankedDetail = rankedResult
        ? `<p class="result-rank">${rankedResult.rank} ${rankedResult.pointsBefore} → ${rankedResult.pointsAfter} RP (${rankedDelta})${opponentRank}</p>`
        : "";
      this.sounds?.play(won ? "victory" : "defeat", { volume: won ? 0.82 : 0.78 });
      const modal = document.createElement("div");
      modal.className = "modal-dialog";
      modal.innerHTML = `
        <p class="eyebrow">${won ? "Victory" : "Defeat"}</p>
        <h2>${won ? "勝利" : "敗北"}</h2>
        <p>${resultMessage(won, online, ranked)}</p>
        ${rankedDetail}
        <p class="result-reward"><img class="item-icon" src="assets/ui/gacha-stone.png" alt=""> +${reward}</p>
        <div class="modal-actions">
          <button id="resultRestart" class="primary-button" type="button"${this.restart ? "" : " disabled"}>再戦</button>
          <button id="resultHome" class="ghost-button" type="button">ホームに戻る</button>
        </div>
      `;
      modal.querySelector("#resultRestart").addEventListener("click", () => {
        if (!this.restart) return;
        this.closeModal();
        this.restart?.();
      });
      modal.querySelector("#resultHome").addEventListener("click", () => {
        this.closeModal();
        this.setView("home");
      });
      this.openModal(modal);
    }

    openModal(content) {
      if (this.modalPeekButton && this.els.modalRoot.hidden && this.els.modalRoot.childNodes.length > 0) {
        const fragment = document.createDocumentFragment();
        fragment.append(...this.els.modalRoot.childNodes);
        this.peekedModalContent = fragment;
        this.removeModalPeekButton();
      } else {
        this.removeModalPeekButton();
        this.peekedModalContent = null;
      }
      this.els.modalRoot.replaceChildren(content);
      this.els.modalRoot.hidden = false;
    }

    closeModal() {
      if (this.peekedModalContent) {
        this.els.modalRoot.replaceChildren(this.peekedModalContent);
        this.peekedModalContent = null;
        this.els.modalRoot.hidden = true;
        this.showModalPeekButton();
        return;
      }
      this.removeModalPeekButton();
      this.els.modalRoot.hidden = true;
      this.els.modalRoot.replaceChildren();
    }

    peekModal() {
      if (this.els.modalRoot.hidden) return;
      this.render();
      this.els.modalRoot.hidden = true;
      this.showModalPeekButton();
    }

    showModalPeekButton() {
      this.removeModalPeekButton();

      const button = document.createElement("button");
      button.type = "button";
      button.className = "primary-button modal-peek-return";
      button.textContent = "選択に戻る";
      button.addEventListener("click", () => {
        this.removeModalPeekButton();
        this.els.modalRoot.hidden = false;
      });

      const host = this.els.appShell || document.body;
      host.append(button);
      this.modalPeekButton = button;
    }

    removeModalPeekButton() {
      this.modalPeekButton?.remove();
      this.modalPeekButton = null;
    }
  }

  function expandDeck(counts) {
    return Object.entries(counts).flatMap(([id, count]) => Array(count).fill(id));
  }

  function dominantTheme(deckList = []) {
    const counts = new Map();
    deckList.forEach((id) => {
      const theme = cards[id]?.theme;
      if (!theme) return;
      counts.set(theme, (counts.get(theme) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  }

  function resultMessage(won, online, ranked = false) {
    if (ranked) return won ? "ランク戦に勝利しました。" : "ランク戦に敗北しました。";
    if (online) return won ? "友達との対戦に勝利しました。" : "友達との対戦に敗北しました。";
    return won ? "構築したルートが相手の盤面を突破しました。" : "黒機の展開を止めきれませんでした。";
  }

  window.Chrono.DuelView = DuelView;
})();
