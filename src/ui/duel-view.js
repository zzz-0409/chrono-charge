(function () {
  "use strict";

  const {
    DECK_SIZE,
    ENVIRONMENT_DECK_PER_LEVEL,
    MAX_LP,
    cards,
    attrClass,
    typeClass,
    cpuDeck,
    cpuEnvironmentDeck,
    DuelGame,
    CardRenderer,
  } = window.Chrono;

  class DuelView {
    constructor(options) {
      this.els = options.els;
      this.toast = options.toast;
      this.setView = options.setView;
      this.game = null;
      this.selectedCardId = "star_scout";
      this.selectedContext = null;
      this.handSnapshot = null;
      this.bindEvents();
    }

    bindEvents() {
      this.els.endTurnButton.addEventListener("click", () => this.game?.endPlayerTurn());
      this.els.restartDuelButton.addEventListener("click", () => this.restart?.());
      this.els.playerGravePile.addEventListener("click", () => this.openGraveList("player"));
      this.els.enemyGravePile.addEventListener("click", () => this.openGraveList("enemy"));
    }

    start(deckList, environmentDeck) {
      if (deckList.length !== DECK_SIZE) {
        this.toast("40枚デッキにすると対戦できます。");
        this.setView("builder");
        return;
      }
      if (!environmentDeck || environmentDeck.length !== ENVIRONMENT_DECK_PER_LEVEL * 3) {
        this.toast("環境カードをLv1/Lv2/Lv3それぞれ3枚にしてください。");
        this.setView("builder");
        return;
      }

      this.game?.dispose?.();
      this.restart = () => this.start(deckList, environmentDeck);
      this.selectedContext = null;
      this.handSnapshot = null;
      this.game = new DuelGame({
        playerDeck: deckList,
        cpuDeck: expandDeck(cpuDeck),
        playerEnvironmentDeck: environmentDeck,
        cpuEnvironmentDeck: expandDeck(cpuEnvironmentDeck),
        onChange: () => this.render(),
        onResult: (won) => this.showResult(won),
        requestReaction: (options, event) => this.requestReaction(options, event),
        requestCardChoice: (choice) => this.requestCardChoice(choice),
      });
      this.game.start();
      this.setView("duel");
    }

    startOnline(game) {
      this.game?.dispose?.();
      this.restart = null;
      this.selectedContext = null;
      this.handSnapshot = null;
      this.game = game;
      this.game.onChange = () => this.render();
      this.game.onResult = (won) => this.showResult(won);
      this.game.requestCardChoice = (choice) => this.requestCardChoice(choice);
      this.game.start();
      this.setView("duel");
    }

    render() {
      if (!this.game) return;
      this.renderLp();
      this.renderZones();
      this.renderPiles();
      this.renderHand();
      this.renderSelection();
      this.renderLog();
      this.els.turnBadge.textContent = `Turn ${this.game.turn}`;
      this.els.phaseBadge.textContent = this.phaseLabel();
      this.els.phaseBadge.classList.toggle("is-waiting", Boolean(this.game.pendingChoice || this.game.waitingChoice));
      this.els.endTurnButton.disabled = !this.game.canPlayerAct();
      this.els.restartDuelButton.disabled = Boolean(this.game.isOnline);
      this.els.playerDeckInfo.textContent = `山札 ${this.game.player.deck.length} / 墓地 ${this.game.player.grave.length}`;
      this.els.enemyDeckInfo.textContent = `山札 ${this.game.enemy.deck.length} / 墓地 ${this.game.enemy.grave.length}`;
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

    renderZones() {
      this.renderEnvironment();
      this.renderCharge(this.game.player, this.els.playerCharge, false);
      this.renderCharge(this.game.enemy, this.els.enemyCharge, false);
      this.renderCardZones(this.game.player.cores, this.els.playerCoreZones, "コア", "playerCore");
      this.renderCardZones(this.game.enemy.cores, this.els.enemyCoreZones, "コア", "enemyCore", true);
      this.renderCardZones(this.game.player.units, this.els.playerUnitZones, "ユニット", "playerUnit");
      this.renderCardZones(this.game.enemy.units, this.els.enemyUnitZones, "ユニット", "enemyUnit");
      this.renderCardZones(this.game.player.reactions, this.els.playerReactionZones, "リアクション", "playerReaction", false, true);
      this.renderCardZones(this.game.enemy.reactions, this.els.enemyReactionZones, "リアクション", "enemyReaction", true, true);
    }

    renderEnvironment() {
      if (!this.els.environmentZone) return;
      this.els.environmentZone.replaceChildren();
      const id = this.game.currentEnvironment;
      const card = cards[id];
      if (!card) {
        const empty = document.createElement("div");
        empty.className = "environment-empty";
        empty.textContent = "環境なし";
        this.els.environmentZone.append(empty);
        return;
      }
      const button = CardRenderer.tcgCard(id, {
        small: true,
        interactive: true,
        selected: this.isSelected("environment", 0),
      });
      button.classList.add("environment-card");
      button.addEventListener("click", () => this.selectCard(id, { zone: "environment", index: 0, owner: "shared" }));
      this.els.environmentZone.append(button);
    }

    renderPiles() {
      this.updateDeckPile(this.els.playerDeckPile, this.game.player.deck.length, "自分の山札");
      this.updateDeckPile(this.els.enemyDeckPile, this.game.enemy.deck.length, "相手の山札");
      this.updateGravePile(this.els.playerGravePile, this.game.player.grave, "自分の捨て札");
      this.updateGravePile(this.els.enemyGravePile, this.game.enemy.grave, "相手の捨て札");
    }

    updateDeckPile(element, count, label) {
      if (!element) return;
      element.classList.toggle("has-cards", count > 0);
      element.classList.toggle("is-empty", count === 0);
      element.style.setProperty("--pile-fill", `${Math.min(100, count * 2.5)}%`);
      element.setAttribute("aria-label", `${label} ${count}枚`);
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
      const topCard = CardRenderer.tcgCard(topCardId, { small: true });
      topCard.classList.add("pile-top-card");
      topCard.setAttribute("aria-hidden", "true");
      element.append(topCard);
    }

    renderCharge(player, element, hiddenNames) {
      element.replaceChildren();
      player.charge.forEach((charge, index) => {
        const cardId = typeof charge === "string" ? charge : charge?.id;
        const card = cards[cardId];
        if (!card) return;
        const button = CardRenderer.tcgCard(cardId, {
          small: true,
          interactive: true,
          facedown: hiddenNames,
          selected: this.isSelected("charge", index),
        });
        button.classList.add("charge-card", typeClass[card.type], attrClass[card.attr]);
        button.classList.toggle("tapped", charge.tapped);
        button.style.setProperty("--charge-offset", Math.min(index, 4));
        button.style.zIndex = String(index + 1);
        button.addEventListener("click", () => this.selectCard(cardId, {
          zone: "charge",
          index,
          owner: player === this.game.player ? "player" : "enemy",
        }));
        element.append(button);
      });
    }

    renderCardZones(zone, element, label, contextZone, hideFace = false, facedown = false) {
      element.replaceChildren();
      for (let i = 0; i < zone.length; i += 1) {
        const slot = document.createElement("div");
        slot.className = "zone-slot";
        const value = zone[i];
        if (value) {
          const owner = contextZone.startsWith("player") ? "player" : "enemy";
          const player = owner === "player" ? this.game.player : this.game.enemy;
          const cardId = typeof value === "string" ? value : value.id;
          const isHiddenReaction = value?.facedown || (facedown && owner === "enemy" && !value.revealed);
          const isFacedown = isHiddenReaction;
          if (isFacedown) {
            const cardButton = CardRenderer.tcgCard(cardId, {
              small: true,
              interactive: true,
              selected: this.isSelected(contextZone, i),
              facedown: true,
            });
            cardButton.setAttribute("aria-label", `${label}のセットカード ${i + 1}`);
            cardButton.addEventListener("click", () => this.selectFacedownCard({ zone: contextZone, index: i, owner }));
            slot.append(cardButton);
            element.append(slot);
            continue;
          }
          const card = cards[cardId];
          if (!card) {
            const empty = document.createElement("div");
            empty.className = "empty-zone";
            empty.setAttribute("aria-hidden", "true");
            slot.append(empty);
            element.append(slot);
            continue;
          }
          const atkMod = value.id && card.type === "ユニット" ? this.game.getUnitAtk(player, value) - card.atk : 0;
          const cardButton = CardRenderer.tcgCard(cardId, {
            small: true,
            interactive: true,
            selected: this.isSelected(contextZone, i),
            stateTag: value.exhausted ? "行動済み" : "",
            atkMod,
          });
          cardButton.addEventListener("click", () => this.selectCard(cardId, { zone: contextZone, index: i, owner }));
          slot.append(cardButton);
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
        const card = CardRenderer.tcgCard(id, {
          interactive: true,
          selected: this.isSelected("hand", index),
        });
        if (index >= playerHandCount - playerDrawn) this.applyDrawAnimation(card, index - (playerHandCount - playerDrawn), "player");
        card.addEventListener("click", () => this.selectCard(id, { zone: "hand", index, owner: "player" }));
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

    selectCard(id, context) {
      this.selectedCardId = id;
      this.selectedContext = context;
      this.render();
    }

    selectFacedownCard(context) {
      this.selectedCardId = null;
      this.selectedContext = { ...context, hidden: true };
      this.render();
    }

    isSelected(zone, index) {
      return this.selectedContext?.zone === zone && this.selectedContext.index === index;
    }

    renderSelection() {
      if (this.selectedContext?.hidden) {
        CardRenderer.facedownFocus(this.els.selectedCardPanel);
      } else {
        CardRenderer.focus(this.selectedCardId, this.els.selectedCardPanel, this.selectedFocusStats());
      }
      this.els.contextActions.replaceChildren();
      if (this.game?.waitingChoice) {
        this.renderWaitingActionNotice();
        return;
      }
      if (!this.game || !this.selectedContext || this.game.finished) return;
      if (this.selectedContext.owner !== "player" || !this.game.canPlayerAct()) return;

      if (this.selectedContext.zone === "hand") {
        const card = cards[this.selectedCardId];
        if (card.type === "リアクション") {
          this.addAction("セット", async () => {
            const index = this.selectedContext.index;
            this.selectedContext = null;
            await this.game.setReaction(index);
          }, this.game.canSetReaction(this.game.player));
        } else {
          const label = card.type === "ユニット" ? "召喚" : "発動";
          this.addAction(label, async () => {
            const index = this.selectedContext.index;
            this.selectedContext = null;
            await this.game.playFromHand(index);
          }, this.game.canPay(this.game.player, card.cost) && this.game.canPlayCard(this.game.player, card));
        }
        const chargeLabel = this.game.player.chargedThisTurn ? "チャージ済み" : "チャージ";
        this.addAction(chargeLabel, async () => {
          const index = this.selectedContext.index;
          this.selectedContext = null;
          await this.game.chargeFromHand(index);
        }, !this.game.player.chargedThisTurn);
      }

      if (this.selectedContext.zone === "playerUnit") {
        const unit = this.game.player.units[this.selectedContext.index];
        if (!unit) return;
        const targets = this.game.enemy.units
          .map((target, index) => ({ target, index }))
          .filter((entry) => entry.target);
        if (targets.length === 0) {
          this.addAction("直接攻撃", () => this.game.attackWithUnit(this.selectedContext.index, null), !unit.exhausted);
        } else {
          targets.forEach((entry) => {
            this.addAction(`敵${entry.index + 1}へ攻撃`, () => this.game.attackWithUnit(this.selectedContext.index, entry.index), !unit.exhausted);
          });
        }
      }
    }

    renderWaitingActionNotice() {
      const notice = document.createElement("div");
      notice.className = "context-waiting";
      notice.textContent = this.waitingChoiceMessage();
      this.els.contextActions.append(notice);
    }

    selectedFocusStats() {
      const context = this.selectedContext;
      if (!context || !["playerUnit", "enemyUnit"].includes(context.zone)) return {};
      const player = context.owner === "player" ? this.game.player : this.game.enemy;
      const unit = player.units[context.index];
      const card = cards[unit?.id];
      if (!unit || !card || card.type !== "ユニット") return {};
      return { atkMod: this.game.getUnitAtk(player, unit) - card.atk };
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
      const title = owner === "player" ? "自分の捨て札" : "相手の捨て札";
      const modal = document.createElement("div");
      modal.className = "modal-dialog grave-dialog";
      modal.innerHTML = `
        <div class="grave-dialog-head">
          <h2>${title}</h2>
          <button class="ghost-button" type="button">閉じる</button>
        </div>
        <div class="grave-list"></div>
      `;
      modal.querySelector(".ghost-button").addEventListener("click", () => this.closeModal());
      const list = modal.querySelector(".grave-list");
      if (player.grave.length === 0) {
        list.innerHTML = `<div class="small-note">捨て札はありません</div>`;
      } else {
        player.grave.slice().reverse().forEach((id, displayIndex) => {
          const originalIndex = player.grave.length - 1 - displayIndex;
          const card = CardRenderer.tcgCard(id, { interactive: true });
          card.classList.add("grave-list-card");
          card.addEventListener("click", () => {
            this.selectCard(id, { zone: "grave", index: originalIndex, owner });
            this.closeModal();
          });
          list.append(card);
        });
      }
      this.openModal(modal);
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
            <button class="primary-button" type="button">決定</button>
          </div>
        `;
        const list = modal.querySelector(".choice-list");
        const focus = modal.querySelector(".choice-focus");
        const decide = modal.querySelector(".primary-button");
        const buttons = [];
        const updateSelection = () => {
          buttons.forEach(({ entry, card }) => {
            card.classList.toggle("selected", selected?.index === entry.index);
          });
          decide.disabled = !selected;
          CardRenderer.focus(selected?.id, focus);
        };

        candidates.forEach((entry) => {
          const card = CardRenderer.tcgCard(entry.id, { interactive: true });
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

    showResult(won) {
      const online = Boolean(this.game?.isOnline);
      const modal = document.createElement("div");
      modal.className = "modal-dialog";
      modal.innerHTML = `
        <p class="eyebrow">${won ? "Victory" : "Defeat"}</p>
        <h2>${won ? "勝利" : "敗北"}</h2>
        <p>${resultMessage(won, online)}</p>
        <div class="modal-actions">
          ${online ? "" : `<button id="resultRestart" class="primary-button" type="button">再戦</button>`}
          <button id="resultBuilder" class="ghost-button" type="button">デッキ編集</button>
        </div>
      `;
      modal.querySelector("#resultRestart")?.addEventListener("click", () => {
        this.closeModal();
        this.restart?.();
      });
      modal.querySelector("#resultBuilder").addEventListener("click", () => {
        this.closeModal();
        this.setView("builder");
      });
      this.openModal(modal);
    }

    openModal(content) {
      this.els.modalRoot.replaceChildren(content);
      this.els.modalRoot.hidden = false;
    }

    closeModal() {
      this.els.modalRoot.hidden = true;
      this.els.modalRoot.replaceChildren();
    }
  }

  function expandDeck(counts) {
    return Object.entries(counts).flatMap(([id, count]) => Array(count).fill(id));
  }

  function resultMessage(won, online) {
    if (online) return won ? "友達との対戦に勝利しました。" : "友達との対戦に敗北しました。";
    return won ? "構築したルートが相手の盤面を突破しました。" : "黒機の展開を止めきれませんでした。";
  }

  window.Chrono.DuelView = DuelView;
})();
