(function () {
  "use strict";

  const {
    MAX_LP,
    UNIT_ZONES,
    CORE_ZONES,
    REACTION_ZONES,
    cards,
    EffectResolver,
    CpuController,
  } = window.Chrono;

  const SOSAI_PAIRS = [
    ["sosai_hikari", "sosai_mint"],
    ["sosai_nene", "sosai_ruri"],
    ["sosai_coco", "sosai_luna"],
  ];

  const SOSAI_DRIVE_PAIR_IDS = [
    "drive_sosai_unit",
    "drive_sosai_nene_ruri_unit",
    "drive_sosai_coco_luna_unit",
  ];

  class Duelist {
    constructor(name, deck, driveDeck = []) {
      this.name = name;
      this.lp = MAX_LP;
      this.deck = shuffle(deck);
      this.driveDeck = driveDeck.slice();
      this.driveUsed = [];
      this.hand = [];
      this.grave = [];
      this.charge = [];
      this.units = Array(UNIT_ZONES).fill(null);
      this.cores = Array(CORE_ZONES).fill(null);
      this.reactions = Array(REACTION_ZONES).fill(null);
      this.driveCoreActivations = {};
      this.chargedThisTurn = false;
      this.drewFromStarCore = false;
      this.shiftedThisTurn = false;
    }

    refreshTurn() {
      this.charge.forEach((charge) => {
        charge.tapped = false;
      });
      this.units.forEach((unit) => {
        if (!unit) return;
        if (unit.exhaustedUntilOwnerTurnEnd) {
          unit.exhausted = true;
          unit.exhaustedUntilOwnerTurnEndReady = true;
          return;
        }
        unit.exhausted = false;
      });
      this.driveCoreActivations = {};
      this.chargedThisTurn = false;
      this.drewFromStarCore = false;
      this.shiftedThisTurn = false;
    }
  }

  class DuelGame {
    constructor(options) {
      this.options = {
        onChange: () => {},
        onResult: () => {},
        requestReaction: async () => null,
        requestCardChoice: async () => null,
        showActivation: async () => {},
        delayMs: 360,
        ...options,
      };
      this.turn = 1;
      this.active = Math.random() < 0.5 ? "player" : "enemy";
      this.busy = false;
      this.finished = false;
      this.logItems = [];
      this.player = new Duelist("Player", this.options.playerDeck, this.options.playerDriveDeck || []);
      this.enemy = new Duelist(this.options.cpuName || "CPU: 黒機", this.options.cpuDeck, this.options.cpuDriveDeck || []);
      this.firstActive = this.active;
      this.completedTurns = 0;
      this.effects = new EffectResolver(this);
      this.cpu = new CpuController(this);
    }

    start() {
      this.drawCards(this.player, 5);
      this.drawCards(this.enemy, 5);
      const starter = this.active === "player" ? this.player : this.enemy;
      starter.refreshTurn();
      this.log("デュエル開始。");
      this.log(`先攻は${this.active === "player" ? "自分" : "相手"}です。`);
      this.notify();
      if (this.active === "enemy") this.runEnemyTurn({ opening: true });
    }

    notify() {
      this.options.onChange(this);
    }

    async afterEffectStep(delayMs = this.options.delayMs) {
      this.notify();
      await pause(delayMs);
    }

    log(message) {
      this.logItems.push(message);
      if (this.logItems.length > 80) this.logItems.shift();
    }

    canPlayerAct() {
      return this.active === "player" && !this.busy && !this.finished;
    }

    canAttack(player = this.player) {
      if (this.turn === 1 && this.active === this.firstActive && this.completedTurns === 0) return false;
      if (player === this.player) return this.canPlayerAct();
      return this.active === "enemy" && this.busy && !this.finished;
    }

    async playFromHand(index, preferredSlot = null) {
      if (!this.canPlayerAct()) return false;
      const id = this.player.hand[index];
      const card = cards[id];
      if (!card || !this.canPlayCard(this.player, card)) return false;
      if (!this.payCost(this.player, card.cost)) return false;

      this.busy = true;
      try {
        this.player.hand.splice(index, 1);
        this.notify();
        await this.resolvePlayedCard(this.player, this.enemy, card, "player", preferredSlot);
        this.checkGameEnd();
        return true;
      } finally {
        this.busy = false;
        this.notify();
      }
    }

    async chargeFromHand(index) {
      if (!this.canPlayerAct() || this.player.chargedThisTurn) return false;
      const id = this.player.hand[index];
      if (!id) return false;
      this.busy = true;
      try {
        this.player.hand.splice(index, 1);
        this.player.charge.push({ id, tapped: false });
        this.player.chargedThisTurn = true;
        this.log(`${cards[id].name}をチャージ。`);
        this.notify();
        await this.triggerChargeCore(this.player);
        return true;
      } finally {
        this.busy = false;
        this.notify();
      }
    }

    setReaction(index, preferredSlot = null) {
      if (!this.canPlayerAct() || !this.canSetReaction(this.player)) return false;
      const id = this.player.hand[index];
      const card = cards[id];
      if (!card || card.type !== "リアクション") return false;
      const slot = preferredOpenSlot(this.player.reactions, preferredSlot);
      if (slot === -1) return false;
      this.player.hand.splice(index, 1);
      this.player.reactions[slot] = { id, revealed: false };
      this.log(`${cards[id].name}をセット。`);
      this.notify();
      return true;
    }

    async playDriveCard(id, preferredSlot = null) {
      if (!this.canPlayerAct()) return false;
      const card = cards[id];
      if (!card || card.driveKind === "reaction" || !this.canUseDriveCard(this.player, card)) return false;

      this.busy = true;
      try {
        if (!await this.activateDriveCard(this.player, card)) return false;
        this.notify();
        await this.resolveDriveCardEffect(this.player, this.enemy, card, "player", preferredSlot);
        this.checkGameEnd();
        return true;
      } finally {
        this.busy = false;
        this.notify();
      }
    }

    driveCoreActivationKey(coreIndex, card) {
      return `${coreIndex}:${card?.id || ""}`;
    }

    driveCoreActivationCost(card) {
      switch (card?.driveEffect) {
        case "driveBlackCore":
        case "driveBladeCore":
        case "driveCyberCore":
          return 1;
        default:
          return 0;
      }
    }

    driveCoreAbilityAvailable(card, player, opponent) {
      switch (card?.driveEffect) {
        case "driveStarCore":
        case "driveBlackCore":
        case "driveSosaiCore":
        case "driveGenericCore":
          return true;
        case "driveKeikanCore":
          return player.grave.some((id) => cardHasTheme(cards[id], "契環"));
        case "driveBladeCore":
          return opponent.units.some((unit) => unit);
        case "driveCyberCore":
          return opponent.reactions.some((entry) => reactionId(entry));
        default:
          return card?.driveKind === "core";
      }
    }

    canActivateDriveCore(player, coreIndex) {
      if (!player || this.finished) return false;
      if (player === this.player && !this.canPlayerAct()) return false;
      if (player === this.enemy && (this.active !== "enemy" || !this.busy)) return false;
      const id = player.cores[coreIndex];
      const card = cards[id];
      if (!card || card.driveKind !== "core") return false;
      const key = this.driveCoreActivationKey(coreIndex, card);
      if (player.driveCoreActivations[key]) return false;
      const cost = this.driveCoreActivationCost(card);
      if (cost > 0 && !this.canPay(player, cost)) return false;
      return this.driveCoreAbilityAvailable(card, player, this.opponentOf(player));
    }

    async activateDriveCore(coreIndex, player = this.player) {
      if (!this.canActivateDriveCore(player, coreIndex)) return false;
      const card = cards[player.cores[coreIndex]];
      const opponent = this.opponentOf(player);
      const cost = this.driveCoreActivationCost(card);
      const wasBusy = this.busy;
      if (player === this.player) {
        const costText = cost > 0 ? `チャージ${cost}を支払って` : "";
        const activates = await this.confirmEffectActivation(player, card, {
          title: `${card.name}の起動効果`,
          message: `${costText}${card.name}の起動効果を発動しますか？`,
        });
        if (!activates) return false;
      }
      if (player === this.player) this.busy = true;
      try {
        if (cost > 0 && !this.payCost(player, cost)) return false;
        player.driveCoreActivations[this.driveCoreActivationKey(coreIndex, card)] = true;
        this.notify();
        await this.showActivation(card, player === this.enemy ? "enemy" : "player", "effect");
        const negated = await this.resolveReactionWindow({ trigger: "effect", source: card }, opponent, player);
        if (negated) {
          this.log(`${card.name}の起動効果は無効化された。`);
        } else {
          await this.applyDriveCoreAbility(card, player, opponent);
        }
        this.checkGameEnd();
        return true;
      } finally {
        if (player === this.player) this.busy = wasBusy;
        this.notify();
      }
    }

    canActivateSpellDriveGraveEffect(player, graveIndex) {
      if (!player || this.finished) return false;
      if (player === this.player && !this.canPlayerAct()) return false;
      if (player === this.enemy && (this.active !== "enemy" || !this.busy)) return false;
      const card = cards[player.grave[graveIndex]];
      if (!card || card.driveKind !== "spell") return false;
      return this.spellDriveGraveEffectAvailable(card, player, this.opponentOf(player));
    }

    async activateSpellDriveGraveEffect(graveIndex, player = this.player) {
      if (!this.canActivateSpellDriveGraveEffect(player, graveIndex)) return false;
      const card = cards[player.grave[graveIndex]];
      const opponent = this.opponentOf(player);
      const wasBusy = this.busy;
      if (player === this.player) {
        const activates = await this.confirmEffectActivation(player, card, {
          title: `${card.name}の墓地効果`,
          message: `${card.name}の墓地効果を発動しますか？`,
        });
        if (!activates) return false;
      }
      if (player === this.player) this.busy = true;
      try {
        const [removed] = player.grave.splice(graveIndex, 1);
        player.driveUsed.push(removed);
        this.log(`${card.name}の墓地効果を発動。`);
        this.notify();
        await this.showActivation(card, player === this.enemy ? "enemy" : "player", "effect");
        const negated = await this.resolveReactionWindow({ trigger: "effect", source: card }, opponent, player);
        if (negated) this.log(`${card.name}の墓地効果は無効化された。`);
        else await this.applySpellDriveGraveEffect(card, player, opponent);
        this.checkGameEnd();
        return true;
      } finally {
        if (player === this.player) this.busy = wasBusy;
        this.notify();
      }
    }

    async attackWithUnit(attackerIndex, targetIndex) {
      if (!this.canPlayerAct()) return;
      if (!this.canAttack(this.player)) return;
      const unit = this.player.units[attackerIndex];
      if (!unit || unit.exhausted) return;

      const negated = await this.resolveReactionWindow({ trigger: "attack", source: cards[unit.id], sourceIndex: attackerIndex }, this.enemy, this.player);
      if (negated) {
        unit.exhausted = true;
        this.notify();
        return;
      }

      this.resolveAttack(this.player, this.enemy, attackerIndex, targetIndex);
      this.checkGameEnd();
      this.notify();
    }

    endPlayerTurn() {
      if (!this.canPlayerAct()) return;
      this.completeTurn();
      this.active = "enemy";
      this.notify();
      this.runEnemyTurn();
    }

    async runEnemyTurn(options = {}) {
      if (this.finished) return;
      const openingTurn = Boolean(options.opening);
      this.busy = true;
      this.enemy.refreshTurn();
      if (!openingTurn) this.drawCards(this.enemy, 1);
      this.log("相手ターン。");
      this.notify();
      await pause(this.options.delayMs);
      if (this.checkGameEnd()) return;

      if (this.cpu.shouldCharge()) {
        const chargeIndex = this.cpu.chooseChargeIndex();
        const id = this.enemy.hand.splice(chargeIndex, 1)[0];
        this.enemy.charge.push({ id, tapped: false });
        this.enemy.chargedThisTurn = true;
        this.log(`相手は${cards[id].attr}カードをチャージ。`);
        await this.triggerChargeCore(this.enemy);
        this.notify();
        await pause(this.options.delayMs);
      }

      this.cpu.setReactions();
      this.notify();
      await pause(220);

      for (let i = 0; i < 7; i += 1) {
        const move = this.cpu.choosePlay();
        if (!move) break;
        await this.cpuPlayCard(move.index);
        if (this.finished) return;
        await pause(this.options.delayMs);
      }

      for (let i = 0; i < 3; i += 1) {
        const driveId = this.usableDriveCards(this.enemy)[0];
        if (!driveId) break;
        await this.cpuPlayDriveCard(driveId);
        if (this.finished) return;
        await pause(this.options.delayMs);
      }

      for (let i = 0; i < this.enemy.cores.length; i += 1) {
        if (!this.canActivateDriveCore(this.enemy, i)) continue;
        await this.activateDriveCore(i, this.enemy);
        if (this.finished) return;
        await pause(this.options.delayMs);
      }

      for (let i = this.enemy.grave.length - 1; i >= 0; i -= 1) {
        if (!this.canActivateSpellDriveGraveEffect(this.enemy, i)) continue;
        await this.activateSpellDriveGraveEffect(i, this.enemy);
        if (this.finished) return;
        await pause(this.options.delayMs);
      }

      for (let i = 0; i < this.enemy.units.length; i += 1) {
        if (!this.canAttack(this.enemy)) break;
        const unit = this.enemy.units[i];
        if (!unit || unit.exhausted || this.finished) continue;
        const target = this.cpu.chooseAttackTarget(unit, this.player);
        if (target === undefined) continue;
        const negated = await this.resolveReactionWindow({ trigger: "attack", source: cards[unit.id], sourceIndex: i }, this.player, this.enemy);
        if (negated) {
          unit.exhausted = true;
          this.notify();
          await pause(this.options.delayMs);
          continue;
        }
        this.resolveAttack(this.enemy, this.player, i, target);
        this.checkGameEnd();
        this.notify();
        await pause(this.options.delayMs + 120);
      }

      if (this.finished) return;
      this.completeTurn();
      this.active = "player";
      if (!openingTurn) this.turn += 1;
      this.busy = false;
      this.player.refreshTurn();
      this.drawCards(this.player, 1);
      this.log("自分ターン。");
      this.checkGameEnd();
      this.notify();
    }

    async cpuPlayCard(index) {
      const id = this.enemy.hand[index];
      const card = cards[id];
      if (!card || !this.canPlayCard(this.enemy, card) || !this.payCost(this.enemy, card.cost)) return;
      this.enemy.hand.splice(index, 1);

      this.notify();
      await this.resolvePlayedCard(this.enemy, this.player, card, "enemy");
      this.checkGameEnd();
      this.notify();
    }

    async cpuPlayDriveCard(id) {
      const card = cards[id];
      if (!card || card.driveKind === "reaction" || !this.canUseDriveCard(this.enemy, card)) return;
      if (!await this.activateDriveCard(this.enemy, card)) return;

      this.notify();
      await this.resolveDriveCardEffect(this.enemy, this.player, card, "enemy");
      this.checkGameEnd();
      this.notify();
    }

    async showActivation(card, owner, kind) {
      if (!card) return;
      await this.options.showActivation?.({ id: card.id, owner, kind, card });
    }

    async confirmEffectActivation(player, card, choice = {}) {
      if (!card) return false;
      if (player !== this.player) return true;
      const selected = await this.options.requestCardChoice({
        zone: "effectActivation",
        title: choice.title || `${card.name}の効果`,
        message: choice.message || `${card.name}の効果を発動しますか？`,
        candidates: [{ id: card.id, index: 0 }],
        allowPass: true,
        confirmLabel: choice.confirmLabel || "発動する",
        passLabel: choice.passLabel || "発動しない",
      }, this);
      return selected === 0;
    }

    effectSectionText(card, triggerLabel) {
      const text = card?.text || "";
      const marker = `${triggerLabel}：`;
      const start = text.indexOf(marker);
      if (start === -1) return text;
      const rest = text.slice(start + marker.length);
      const next = rest.search(/(?:通常召喚時|追加召喚時|召喚時|発動時|効果)：/);
      return next === -1 ? rest : rest.slice(0, next);
    }

    triggeredEffectIsOptional(card, triggerLabel) {
      const section = this.effectSectionText(card, triggerLabel);
      if (section.includes("発動できる")) return true;
      if (section.includes("発動する")) return false;
      return card?.type === "ユニット" || card?.driveKind === "unit" || triggerLabel.includes("召喚");
    }

    async shouldActivateTriggeredEffect(player, card, triggerLabel) {
      if (!this.triggeredEffectIsOptional(card, triggerLabel)) return true;
      return this.confirmEffectActivation(player, card, {
        title: `${card.name}の${triggerLabel}効果`,
        message: `${triggerLabel}効果を発動しますか？`,
      });
    }

    async resolveEffectActivation(player, opponent, card, effect, negatedMessage) {
      await this.showActivation(card, player === this.enemy ? "enemy" : "player", "effect");
      const negated = await this.resolveReactionWindow({ trigger: "effect", source: card }, opponent, player);
      if (negated) {
        this.log(negatedMessage || `${card.name}の効果は無効化された。`);
        return false;
      }
      await this.effects.resolve(effect, player, opponent, card);
      return true;
    }

    async resolvePlayedCard(player, opponent, card, side, preferredSlot = null) {
      const prefix = side === "enemy" ? "相手は" : "";
      if (card.type === "ユニット") {
        this.summonUnit(player, card.id, preferredSlot);
        this.log(`${prefix}${card.name}を召喚。`);
        this.notify();
        if (card.effect) {
          const activates = await this.shouldActivateTriggeredEffect(player, card, "通常召喚時");
          if (!activates) {
            this.log(`${card.name}の通常召喚時効果は発動しなかった。`);
            this.afterSummon(player, card.id);
            return;
          }
          await this.resolveEffectActivation(player, opponent, card, card.effect, `${card.name}の通常召喚時効果は無効化された。`);
          this.afterSummon(player, card.id);
        } else {
          this.afterSummon(player, card.id);
        }
        return;
      }

      if (card.type === "コア") {
        this.placeCore(player, card.id, preferredSlot);
        this.log(`${prefix}${card.name}を発動。`);
        if (card.effect) await this.resolveEffectActivation(player, opponent, card, card.effect, `${card.name}の効果は無効化された。`);
        return;
      }

      if (card.type === "スペル") {
        this.log(`${prefix}${card.name}を発動。`);
        if (card.effect) await this.resolveEffectActivation(player, opponent, card, card.effect, `${card.name}は無効化された。`);
        player.grave.push(card.id);
      }
    }

    async resolveDriveCardEffect(player, opponent, card, side, preferredSlot = null) {
      const prefix = side === "enemy" ? "相手は" : "";
      if (card.driveKind === "unit") {
        this.summonUnit(player, card.id, preferredSlot);
        this.log(`${prefix}${card.name}をドライブ召喚。`);
        this.notify();
        const activates = await this.shouldActivateTriggeredEffect(player, card, "召喚時");
        if (!activates) {
          this.log(`${card.name}の召喚時効果は発動しなかった。`);
          this.afterSummon(player, card.id);
          return;
        }
        await this.showActivation(card, player === this.enemy ? "enemy" : "player", "effect");
        const negated = await this.resolveReactionWindow({ trigger: "effect", source: card }, opponent, player);
        if (!negated) await this.applyDriveEffect(card, player, opponent);
        else this.log(`${card.name}の効果は無効化された。`);
        this.afterSummon(player, card.id);
        return;
      }

      if (card.driveKind === "core") {
        this.placeCore(player, card.id, preferredSlot);
        this.log(`${prefix}${card.name}をドライブ発動。`);
        await this.showActivation(card, player === this.enemy ? "enemy" : "player", "effect");
        const negated = await this.resolveReactionWindow({ trigger: "effect", source: card }, opponent, player);
        if (!negated) await this.applyDriveEffect(card, player, opponent);
        else this.log(`${card.name}の効果は無効化された。`);
        return;
      }

      this.log(`${prefix}${card.name}をドライブ発動。`);
      await this.showActivation(card, player === this.enemy ? "enemy" : "player", "effect");
      const negated = await this.resolveReactionWindow({ trigger: "effect", source: card }, opponent, player);
      if (!negated) await this.applyDriveEffect(card, player, opponent);
      else this.log(`${card.name}は無効化された。`);
      this.sendToGrave(player, card.id);
    }

    async resolveReactionWindow(initialEvent, firstResponder, otherPlayer) {
      const chain = [];
      let responder = firstResponder;
      let opponent = otherPlayer;
      let event = initialEvent;

      while (!this.finished) {
        const link = await this.chooseReactionLink(responder, opponent, event);
        if (!link) break;
        chain.push(link);
        event = { trigger: "effect", source: link.card, chainLink: link };
        [responder, opponent] = [opponent, responder];
      }

      if (chain.length === 0) return false;
      return await this.resolveReactionChain(chain);
    }

    async chooseReactionLink(player, opponent, event) {
      const options = this.getUsableReactions(player, event.trigger);
      if (options.length === 0) return false;
      const choiceIndex = player === this.player
        ? await this.options.requestReaction(options, event, this)
        : options[0].index;
      if (choiceIndex === null || choiceIndex === undefined) return null;

      const option = options.find((entry) => entry.index === choiceIndex);
      if (!option) return null;
      const card = cards[option.id];
      if (option.drive) {
        if (!await this.activateDriveCard(player, card, event.trigger)) return null;
        this.log(`${player === this.enemy ? "相手は" : ""}${card.name}をドライブ発動。`);
        this.notify();
        await this.showActivation(card, player === this.enemy ? "enemy" : "player", "reaction");
        return { card, player, opponent, event, negated: false, drive: true };
      }
      if (!this.payCost(player, card.cost)) return null;
      player.reactions[option.index] = null;
      player.grave.push(option.id);
      this.log(`${player === this.enemy ? "相手は" : ""}${card.name}を発動。`);
      this.notify();
      await this.showActivation(card, player === this.enemy ? "enemy" : "player", "reaction");
      return { card, player, opponent, event, negated: false };
    }

    async resolveReactionChain(chain) {
      let baseNegated = false;
      this.log("チェーンを解決。");
      for (let i = chain.length - 1; i >= 0; i -= 1) {
        const link = chain[i];
        if (link.negated) {
          this.log(`${link.card.name}は無効化された。`);
          if (link.drive) this.sendToGrave(link.player, link.card.id);
          continue;
        }
        const result = link.drive
          ? await this.applyDriveReactionEffect(link.card, link.player, link.opponent, link.event)
          : await this.applyReactionEffect(link.card, link.player, link.opponent, link.event);
        if (result?.negates) {
          if (i === 0) baseNegated = true;
          else if (chain[i - 1].drive) this.log(`${chain[i - 1].card.name}の効果は無効化されない。`);
          else chain[i - 1].negated = true;
        }
        this.notify();
        if (i > 0) await this.afterEffectStep();
      }
      return baseNegated;
    }

    getUsableReactions(player, trigger) {
      const normalReactions = player.reactions
        .map((entry, index) => ({ id: reactionId(entry), index }))
        .filter((entry) => {
          if (!entry.id) return false;
          const card = cards[entry.id];
          return card.trigger === trigger && this.canPay(player, card.cost);
        });
      const driveReactions = this.usableDriveCards(player, trigger)
        .map((id) => ({ id, index: `drive:${id}`, drive: true }));
      return [...normalReactions, ...driveReactions];
    }

    async applyReactionEffect(card, player, opponent, event = {}) {
      if (card.effect === "negateAttackDamage") {
        const dealt = this.damage(opponent, 500, { log: false });
        this.log(`${card.name}で攻撃を止め、${dealt}ダメージ。`);
        return { negates: true };
      }
      if (card.effect === "negateAttackUntap") {
        this.untapOneCharge(player);
        this.log(`${card.name}で攻撃を止めた。`);
        return { negates: true };
      }
      if (card.effect === "negateEffectDraw") {
        if (
          this.countThemeInCharge(player, "星導") >= 3 &&
          await this.confirmEffectActivation(player, card, {
            title: `${card.name}の追加効果`,
            message: "チャージに「星導」が3枚以上あります。追加で1枚ドローしますか？",
            confirmLabel: "追加で発動する",
          })
        ) this.drawCards(player, 1);
        this.log(`${card.name}で効果を止めた。`);
        return { negates: true };
      }
      if (card.effect === "bladeCounter") {
        const sourceIndex = Number(event.sourceIndex);
        const targetIndex = Number.isInteger(sourceIndex) && opponent.units[sourceIndex]
          ? sourceIndex
          : opponent.units.findIndex((unit) => unit && unit.id === event.source?.id);
        if (targetIndex !== -1) {
          const targetName = cards[opponent.units[targetIndex].id].name;
          if (
            this.countThemeInCharge(player, "断刃") >= 3 &&
            await this.confirmEffectActivation(player, card, {
              title: `${card.name}の追加効果`,
              message: "チャージに「断刃」が3枚以上あります。追加でそのユニットを破壊しますか？",
              confirmLabel: "追加で発動する",
            })
          ) {
            this.destroyUnit(opponent, targetIndex);
            this.log(`${card.name}で${targetName}を破壊。`);
          } else {
            this.log(`${card.name}で攻撃を止めた。`);
          }
          return { negates: true };
        }
        this.log(`${card.name}で攻撃を止めた。`);
        return { negates: true };
      }
      if (card.effect === "cyberShield") {
        if (
          this.countThemeUnits(player, "電脳") >= 2 &&
          await this.confirmEffectActivation(player, card, {
            title: `${card.name}の追加効果`,
            message: "自分フィールドに「電脳」ユニットが2体以上います。追加で1枚ドローしますか？",
            confirmLabel: "追加で発動する",
          })
        ) this.drawCards(player, 1);
        this.log(`${card.name}で攻撃を止めた。`);
        return { negates: true };
      }
      if (card.effect === "cyberCounterhack") {
        if (
          this.countThemeUnits(player, "電脳") >= 2 &&
          await this.confirmEffectActivation(player, card, {
            title: `${card.name}の追加効果`,
            message: "自分フィールドに「電脳」ユニットが2体以上います。追加で相手リアクションを公開しますか？",
            confirmLabel: "追加で発動する",
          })
        ) await this.revealReactions(opponent, 1);
        this.log(`${card.name}で効果を止めた。`);
        return { negates: true };
      }
      if (card.effect === "sosaiStreamCancel") {
        if (
          this.hasSosaiPair(player) &&
          await this.confirmEffectActivation(player, card, {
            title: `${card.name}の追加効果`,
            message: "自分フィールドに「双彩」のペアがそろっています。追加で1枚ドローしますか？",
            confirmLabel: "追加で発動する",
          })
        ) this.drawCards(player, 1);
        this.log(`${card.name}で効果を止めた。`);
        return { negates: true };
      }
      if (card.effect === "keikanBindingClause") {
        if (
          this.countThemeChargeTypes(player, "契環") >= 3 &&
          await this.confirmEffectActivation(player, card, {
            title: `${card.name}の追加効果`,
            message: "チャージに「契環」のカード種類が3種類以上あります。追加でそのユニットを行動済みにしますか？",
            confirmLabel: "追加で発動する",
          })
        ) this.exhaustSourceUnit(opponent, event);
        this.log(`${card.name}で攻撃を止めた。`);
        return { negates: true };
      }
      if (card.effect === "keikanNullClause") {
        if (
          this.countThemeChargeTypes(player, "契環") >= 3 &&
          await this.confirmEffectActivation(player, card, {
            title: `${card.name}の追加効果`,
            message: "チャージに「契環」のカード種類が3種類以上あります。追加で1枚ドローしますか？",
            confirmLabel: "追加で発動する",
          })
        ) this.drawCards(player, 1);
        this.log(`${card.name}で効果を止めた。`);
        return { negates: true };
      }
      if (card.effect === "watchSignal") {
        this.drawCards(player, 1);
        this.log(`${card.name}で1枚ドロー。攻撃は継続する。`);
        return { negates: false };
      }
      if (card.effect === "noisePing") {
        const revealed = await this.revealReactions(opponent, 1);
        this.log(revealed > 0
          ? `${card.name}で相手のリアクション1枚を表向きにした。`
          : `${card.name}を発動。表向きにできるリアクションはなかった。`);
        return { negates: false };
      }
      this.log(`${card.name}で止めた。`);
      return { negates: true };
    }

    async applyDriveReactionEffect(card, player, opponent, event = {}) {
      await this.applyDriveEffect(card, player, opponent, event);
      this.log(`${card.name}で${event.trigger === "attack" ? "攻撃" : "効果"}を止めた。`);
      this.sendToGrave(player, card.id);
      return { negates: true };
    }

    async applyDriveEffect(card, player, opponent, event = {}) {
      switch (card.driveEffect) {
        case "driveStarUnit":
          await this.addFromDeck(player, (candidate) => candidate.theme === "星導", {
            title: "星導カードを手札に加える",
            message: "デッキから星導カードを1枚選んでください。",
          });
          await this.returnBestUnitToHand(opponent);
          this.drawCards(player, 2);
          return;
        case "driveStarCore":
          this.drawCards(player, 1);
          return;
        case "driveStarSpell":
          await this.addFromDeck(player, (candidate) => candidate.theme === "星導", {
            title: "星導カードを手札に加える",
            message: "デッキから星導カードを1枚選んでください。",
          });
          this.drawCards(player, 1);
          this.untapOneCharge(player);
          this.untapOneCharge(player);
          return;
        case "driveStarReactAttack":
          this.returnSourceUnitToHand(opponent, event);
          this.drawCards(player, 1);
          return;
        case "driveStarReactEffect":
          this.returnSourceFieldCardToHand(opponent, event);
          this.drawCards(player, 1);
          return;
        case "driveBlackUnit":
          this.damage(opponent, 2000);
          await this.destroyBestUnit(opponent);
          return;
        case "driveBlackCore":
          this.damage(opponent, 1000);
          return;
        case "driveBlackSpell":
          await this.destroyBestUnit(opponent);
          await this.destroyBestCore(opponent);
          this.damage(opponent, 1500);
          return;
        case "driveBlackReactAttack":
          this.destroySourceUnit(opponent, event);
          this.damage(opponent, 1500);
          return;
        case "driveBlackReactEffect":
          this.destroySourceFieldCard(opponent, event);
          this.damage(opponent, 1200);
          return;
        case "driveBladeUnit":
          this.exhaustAllUnitsUntilOwnerTurnEnd(opponent);
          return;
        case "driveBladeCore":
          await this.exhaustBestUnit(opponent);
          return;
        case "driveBladeSpell":
          await this.exhaustBestUnit(opponent);
          await this.destroyBestExhaustedUnit(opponent);
          return;
        case "driveBladeReactAttack": {
          const sourceIndex = Number(event.sourceIndex);
          if (Number.isInteger(sourceIndex) && opponent.units[sourceIndex]) {
            this.exhaustUnitUntilOwnerTurnEnd(opponent, sourceIndex);
          }
          if (!this.destroySourceUnit(opponent, event)) await this.destroyBestExhaustedUnit(opponent);
          return;
        }
        case "driveBladeReactEffect":
          if (!this.destroySourceFieldCard(opponent, event)) {
            if (!await this.destroyBestExhaustedUnit(opponent)) await this.exhaustBestUnit(opponent);
          }
          return;
        case "driveCyberUnit":
          await this.revealReactions(opponent, 2);
          await this.removeRevealedReaction(opponent);
          return;
        case "driveCyberCore":
          await this.revealReactions(opponent, 1);
          await this.specialSummonFromHand(player, (candidate) => candidate.type === "ユニット" && candidate.theme === "電脳" && candidate.cost <= 3, {
            title: "電脳ユニットを追加召喚",
            message: "手札からコスト3以下の電脳ユニットを選んでください。",
          }, opponent);
          return;
        case "driveCyberSpell":
          await this.revealReactions(opponent, 2);
          await this.removeRevealedReaction(opponent);
          await this.addFromDeck(player, (candidate) => candidate.theme === "電脳", {
            title: "電脳カードを手札に加える",
            message: "デッキから電脳カードを1枚選んでください。",
          });
          this.drawCards(player, 1);
          return;
        case "driveCyberReactAttack":
          await this.revealReactions(opponent, 1);
          await this.removeRevealedReaction(opponent);
          return;
        case "driveCyberReactEffect":
          await this.revealReactions(opponent, 2);
          await this.removeRevealedReaction(opponent);
          return;
        case "driveSosaiUnit":
          await this.addFromDeck(player, (candidate) => candidate.type === "ユニット" && candidate.theme === "双彩", {
            title: "双彩ユニットを手札に加える",
            message: "デッキから双彩ユニットを1枚選んでください。",
          });
          await this.returnBestUnitToHand(opponent);
          return;
        case "driveSosaiNeneRuriUnit":
          await this.returnBestUnitToHand(opponent);
          this.damage(opponent, 1000);
          this.drawCards(player, 1);
          return;
        case "driveSosaiCocoLunaUnit":
          this.untapOneCharge(player);
          this.untapOneCharge(player);
          await this.destroyBestUnit(opponent);
          return;
        case "driveSosaiCore":
          this.drawCards(player, 1);
          return;
        case "driveSosaiSpell":
          await this.addFromGrave(player, (candidate) => candidate.type === "ユニット" && candidate.theme === "双彩", {
            title: "双彩ユニットを回収",
            message: "墓地から双彩ユニットを1枚選んでください。",
          });
          if (await this.specialSummonFromHand(player, (candidate) => candidate.type === "ユニット" && candidate.theme === "双彩" && candidate.cost <= 3, {
            title: "双彩ユニットを追加召喚",
            message: "手札からコスト3以下の双彩ユニットを選んでください。",
          }, opponent)) this.untapOneCharge(player);
          this.drawCards(player, 1);
          return;
        case "driveSosaiReactAttack":
          this.drawCards(player, 1);
          if (this.hasSosaiPair(player)) this.returnSourceUnitToHand(opponent, event);
          return;
        case "driveSosaiReactEffect":
          this.drawCards(player, 1);
          if (this.hasSosaiPair(player)) this.returnSourceFieldCardToHand(opponent, event);
          return;
        case "driveKeikanUnit":
          await this.addFromDeck(player, (candidate) => candidate.theme === "契環", {
            title: "契環カードを手札に加える",
            message: "デッキから契環カードを1枚選んでください。",
          });
          this.drawCards(player, 1);
          this.buffThemeUnits(player, "契環", 300);
          return;
        case "driveKeikanCore":
          this.drawCards(player, 1);
          return;
        case "driveKeikanReactEffect":
          if (!this.returnSourceFieldCardToHand(opponent, event)) this.drawCards(player, 1);
          return;
        case "driveGenericUnit":
          await this.exhaustBestUnit(opponent);
          return;
        case "driveGenericCore":
          this.drawCards(player, 2);
          await this.discardFromHand(player, {
            title: "手札を1枚捨てる",
            message: "クロノ炉で墓地に送るカードを選んでください。",
          });
          return;
        case "driveGenericSpell":
          await this.exhaustBestUnit(opponent);
          await this.destroyBestExhaustedUnit(opponent);
          return;
        case "driveGenericReactAttack":
          this.exhaustSourceUnit(opponent, event);
          this.untapOneCharge(player);
          return;
        case "driveGenericReactEffect":
          if (!this.destroySourceFieldCard(opponent, event)) this.drawCards(player, 1);
          return;
        default:
          if (card.driveKind === "core") {
            this.drawCards(player, 1);
            return;
          }
          return;
      }
    }

    spellDriveGraveEffectAvailable(card, player, opponent) {
      return Boolean(card?.driveKind === "spell" && player && opponent);
    }

    async applySpellDriveGraveEffect(card, player, opponent) {
      switch (card.driveEffect) {
        case "driveStarSpell":
          if (!await this.moveGraveCardToCharge(player, (candidate) => cardHasTheme(candidate, "星導"), {
            title: "星導カードをチャージ",
            message: "墓地からチャージに置く星導カードを選んでください。",
          })) this.drawCards(player, 1);
          return;
        case "driveBlackSpell":
          this.damage(opponent, 600);
          return;
        case "driveBladeSpell":
          if (!await this.exhaustBestUnit(opponent)) this.damage(opponent, 500);
          return;
        case "driveCyberSpell":
          if (await this.revealReactions(opponent, 1) > 0) await this.removeRevealedReaction(opponent);
          else this.drawCards(player, 1);
          return;
        case "driveSosaiSpell":
          if (!await this.addFromGrave(player, (candidate) => candidate.type === "ユニット" && candidate.theme === "双彩", {
            title: "双彩ユニットを回収",
            message: "墓地から双彩ユニットを1枚選んでください。",
          })) this.drawCards(player, 1);
          return;
        case "driveGenericSpell":
          this.drawCards(player, 1);
          await this.discardFromHand(player, {
            title: "手札を1枚捨てる",
            message: "時空圧縮の墓地効果で墓地に送るカードを選んでください。",
          });
          return;
        default:
          this.drawCards(player, 1);
          return;
      }
    }

    async applyDriveCoreAbility(card, player, opponent) {
      switch (card.driveEffect) {
        case "driveStarCore":
          this.drawCards(player, 1);
          this.log(`${card.name}で1枚ドロー。`);
          return;
        case "driveBlackCore":
          this.damage(opponent, 800);
          return;
        case "driveBladeCore":
          if (!await this.destroyBestExhaustedUnit(opponent)) await this.exhaustBestUnit(opponent);
          return;
        case "driveCyberCore":
          await this.revealReactions(opponent, 1);
          await this.removeRevealedReaction(opponent);
          return;
        case "driveSosaiCore":
          this.drawCards(player, 1);
          if (this.hasSosaiPair(player)) this.untapOneCharge(player);
          this.log(`${card.name}が起動。`);
          return;
        case "driveKeikanCore":
          await this.moveGraveCardToCharge(player, (candidate) => candidate.theme === "契環", {
            title: "契環カードをチャージ",
            message: "墓地からチャージに置く「契環」カードを選んでください。",
          });
          this.log(`${card.name}が起動。`);
          return;
        case "driveGenericCore":
          this.drawCards(player, 1);
          await this.discardFromHand(player, {
            title: "手札を1枚捨てる",
            message: "クロノ炉の起動効果で墓地に送るカードを選んでください。",
          });
          this.log(`${card.name}が起動。`);
          return;
        default:
          if (card.driveKind === "core") {
            this.drawCards(player, 1);
            this.log(`${card.name}が起動。`);
            return;
          }
          return;
      }
    }

    sourceUnitIndex(player, event = {}) {
      const sourceId = event.source?.id;
      const sourceIndex = Number(event.sourceIndex);
      if (
        Number.isInteger(sourceIndex) &&
        sourceIndex >= 0 &&
        sourceIndex < player.units.length &&
        player.units[sourceIndex] &&
        (!sourceId || player.units[sourceIndex].id === sourceId)
      ) return sourceIndex;
      if (!sourceId) return -1;
      return player.units.findIndex((unit) => unit?.id === sourceId);
    }

    returnSourceUnitToHand(player, event = {}) {
      const index = this.sourceUnitIndex(player, event);
      if (index < 0) return false;
      const unit = player.units[index];
      this.returnCardToHandOrDriveDeck(player, unit.id);
      player.units[index] = null;
      return true;
    }

    exhaustSourceUnit(player, event = {}) {
      const index = this.sourceUnitIndex(player, event);
      if (index < 0) return false;
      this.exhaustUnitUntilOwnerTurnEnd(player, index);
      this.log(`${cards[player.units[index].id].name}を次の相手ターン終了まで行動済みにした。`);
      return true;
    }

    destroySourceUnit(player, event = {}) {
      const index = this.sourceUnitIndex(player, event);
      if (index < 0) return false;
      const targetName = cards[player.units[index].id].name;
      this.destroyUnit(player, index);
      this.log(`${targetName}を破壊した。`);
      return true;
    }

    returnSourceFieldCardToHand(player, event = {}) {
      const sourceId = event.source?.id;
      if (!sourceId) return false;
      if (this.returnSourceUnitToHand(player, event)) return true;
      const coreIndex = player.cores.findIndex((id) => id === sourceId);
      if (coreIndex !== -1) {
        player.cores[coreIndex] = null;
        this.returnCardToHandOrDriveDeck(player, sourceId);
        return true;
      }
      const reactionIndex = player.reactions.findIndex((entry) => reactionId(entry) === sourceId);
      if (reactionIndex !== -1) {
        player.reactions[reactionIndex] = null;
        this.returnCardToHandOrDriveDeck(player, sourceId);
        return true;
      }
      return false;
    }

    destroySourceFieldCard(player, event = {}) {
      const sourceId = event.source?.id;
      if (!sourceId) return false;
      if (this.destroySourceUnit(player, event)) return true;
      const coreIndex = player.cores.findIndex((id) => id === sourceId);
      if (coreIndex !== -1) {
        player.cores[coreIndex] = null;
        player.grave.push(sourceId);
        this.log(`${cards[sourceId].name}を破壊した。`);
        return true;
      }
      const reactionIndex = player.reactions.findIndex((entry) => reactionId(entry) === sourceId);
      if (reactionIndex !== -1) {
        player.reactions[reactionIndex] = null;
        player.grave.push(sourceId);
        this.log(`${cards[sourceId].name}を破壊した。`);
        return true;
      }
      return false;
    }

    exhaustAllUnitsUntilOwnerTurnEnd(player) {
      let exhausted = 0;
      player.units.forEach((unit, index) => {
        if (!unit) return;
        if (this.exhaustUnitUntilOwnerTurnEnd(player, index)) exhausted += 1;
      });
      if (exhausted > 0) this.log(`${player.name}のユニット${exhausted}体を行動済みにした。`);
      return exhausted;
    }

    afterSummon(player, id) {
      const card = cards[id];
      if (cardHasTheme(card, "星導") && this.hasCore(player, "star_orbit") && !player.drewFromStarCore) {
        player.drewFromStarCore = true;
        this.drawCards(player, 1);
        this.log("星導の軌道環で1枚ドロー。");
      }
    }

    async triggerChargeCore(player) {
      if (this.hasCore(player, "generic_zero") && !player.shiftedThisTurn) {
        player.shiftedThisTurn = true;
        this.drawCards(player, 1);
        await this.afterEffectStep(560);
        await this.discardFromHand(player, {
          title: "手札を1枚捨てる",
          message: "ゼロシフト装置で墓地に送るカードを選んでください。",
        });
        this.log("ゼロシフト装置が起動。");
      }
    }

    summonUnit(player, id, preferredSlot = null) {
      const slot = preferredOpenSlot(player.units, preferredSlot);
      if (slot === -1) return false;
      player.units[slot] = { id, exhausted: false, atkMod: 0 };
      return true;
    }

    opponentOf(player) {
      return player === this.player ? this.enemy : this.player;
    }

    async specialSummonFromHand(player, predicate, choice = {}, opponent = null) {
      const slot = player.units.findIndex((unit) => !unit);
      if (slot === -1) return false;
      const index = await this.chooseHandIndex(player, predicate, {
        title: choice.title || "追加召喚",
        message: choice.message || "手札から追加召喚するカードを選んでください。",
        allowPass: choice.allowPass ?? true,
        confirmLabel: choice.confirmLabel || "召喚する",
        passLabel: choice.passLabel || "召喚しない",
      });
      if (index === -1) return false;
      const id = player.hand.splice(index, 1)[0];
      player.units[slot] = { id, exhausted: false, atkMod: 0 };
      this.log(`${cards[id].name}を追加召喚。`);
      await this.resolveSpecialSummonEffect(player, opponent || this.opponentOf(player), id);
      this.afterSummon(player, id);
      return true;
    }

    async resolveSpecialSummonEffect(player, opponent, id) {
      const card = cards[id];
      if (!card?.specialEffect) return;
      const activates = await this.shouldActivateTriggeredEffect(player, card, "追加召喚時");
      if (!activates) {
        this.log(`${card.name}の追加召喚時効果は発動しなかった。`);
        return;
      }
      await this.resolveEffectActivation(player, opponent, card, card.specialEffect, `${card.name}の追加召喚時効果は無効化された。`);
    }

    placeCore(player, id, preferredSlot = null) {
      const slot = preferredOpenSlot(player.cores, preferredSlot);
      if (slot === -1) return false;
      player.cores[slot] = id;
      return true;
    }

    canPlayCard(player, card) {
      if (card.type === "ユニット") return player.units.some((unit) => !unit);
      if (card.type === "コア") return player.cores.some((core) => !core);
      return card.type === "スペル";
    }

    canSetReaction(player) {
      return player.reactions.some((card) => !card);
    }

    usableDriveCards(player, trigger = null) {
      return player.driveDeck
        .filter((id) => {
          const card = cards[id];
          if (!card?.driveKind) return false;
          if (trigger) return card.driveKind === "reaction" && card.trigger === trigger && this.canUseDriveCard(player, card, trigger);
          return card.driveKind !== "reaction" && this.canUseDriveCard(player, card);
        });
    }

    canUseDriveCard(player, card, trigger = null) {
      if (!card?.driveKind || !player.driveDeck.includes(card.id)) return false;
      if (card.driveKind === "reaction" && card.trigger !== trigger) return false;
      if (card.driveKind !== "reaction" && trigger) return false;
      return this.drivePaymentOptions(player, card).length > 0;
    }

    drivePaymentRule(card) {
      if (card?.driveKind === "unit" || card?.driveKind === "core") return "materialsAndCharge";
      return "materialsOrCharge";
    }

    availableSlotsAfterDriveCost(zone, player, driveCost, type) {
      const open = zone.filter((entry) => !entry).length;
      if (Array.isArray(driveCost?.materials)) {
        const freed = this.driveMaterialEntries(player)
          .filter((entry) => entry.source === "field")
          .filter((entry) => baseDriveType(cards[entry.id]?.type) === type)
          .filter((entry) => driveCost.materials.some((requirement) => this.matchesDriveRequirement(cards[entry.id], requirement, entry)))
          .length;
        return open + freed;
      }
      const freed = baseDriveType(driveCost?.type) === type ? Math.min(driveCost.field || 0, this.countFieldMaterials(player, driveCost)) : 0;
      return open + freed;
    }

    async activateDriveCard(player, card, trigger = null) {
      if (!this.canUseDriveCard(player, card, trigger)) return false;
      if (!await this.payDriveCost(player, card)) return false;
      const index = player.driveDeck.indexOf(card.id);
      if (index === -1) return false;
      player.driveDeck.splice(index, 1);
      return true;
    }

    drivePaymentOptions(player, card) {
      const requiredFreedType = this.requiredFreedTypeForDrive(player, card);
      if (this.drivePaymentRule(card) === "materialsAndCharge") {
        return this.canPayDriveCombinedCost(player, card, requiredFreedType) ? ["materialsAndCharge"] : [];
      }
      const options = [];
      if (this.canPayDriveMaterialCost(player, card, requiredFreedType)) options.push("materials");
      if (!requiredFreedType && this.canPayDriveChargeCost(player, card)) options.push("charge");
      return options;
    }

    canPayDriveCost(player, card) {
      return this.drivePaymentOptions(player, card).length > 0;
    }

    canPayDriveMaterialCost(player, card, requiredFreedType = this.requiredFreedTypeForDrive(player, card)) {
      const driveCost = card?.driveCost || {};
      if (Array.isArray(driveCost.materials)) {
        const selection = this.selectDriveMaterials(player, driveCost, 0, requiredFreedType);
        return Boolean(selection);
      }
      const field = driveCost.field || 0;
      const charge = driveCost.charge || 0;
      if (requiredFreedType && (baseDriveType(driveCost.type) !== requiredFreedType || field <= 0)) return false;
      return (
        this.countFieldMaterials(player, driveCost) >= field &&
        this.countChargeMaterials(player, driveCost) >= charge
      );
    }

    canPayDriveCombinedCost(player, card, requiredFreedType = this.requiredFreedTypeForDrive(player, card)) {
      const driveCost = card?.driveCost || {};
      if (Array.isArray(driveCost.materials)) {
        const selection = this.selectDriveMaterials(
          player,
          driveCost,
          Math.max(0, Number(card?.cost || 0)),
          requiredFreedType,
          card
        );
        return Boolean(selection);
      }
      const selection = this.selectLegacyDriveMaterialPlan(player, driveCost, requiredFreedType);
      return Boolean(selection && this.canPayDriveChargeCostAfterMaterials(player, card, selection));
    }

    canPayDriveChargeCost(player, card) {
      const cost = Math.max(0, Number(card?.cost || 0));
      if (cost === 0) return true;
      if (!this.canPay(player, cost)) return false;
      if (!card.theme) return this.countDriveChargeType(player, card) >= cost;
      return this.countThemeInCharge(player, card.theme) >= cost;
    }

    canPayDriveChargeCostAfterMaterials(player, card, selectedMaterials = []) {
      const cost = Math.max(0, Number(card?.cost || 0));
      if (cost === 0) return true;
      const selectedChargeIndexes = new Set(selectedMaterials
        .filter((entry) => entry.source === "charge" || entry.originalIndex !== undefined)
        .map((entry) => entry.originalIndex));
      const remainingCharge = player.charge.filter((_, index) => !selectedChargeIndexes.has(index));
      if (remainingCharge.filter((entry) => !entry.tapped).length < cost) return false;
      if (!card.theme) {
        const type = baseDriveType(card?.type);
        return remainingCharge.filter((entry) => baseDriveType(cards[entry.id]?.type) === type).length >= cost;
      }
      return remainingCharge.filter((entry) => cardHasTheme(cards[entry.id], card.theme)).length >= cost;
    }

    countDriveChargeType(player, card) {
      const type = baseDriveType(card?.type);
      if (!type) return 0;
      return player.charge.filter((entry) => baseDriveType(cards[entry.id]?.type) === type).length;
    }

    async payDriveCost(player, card) {
      if (!this.canPayDriveCost(player, card)) return false;
      const options = this.drivePaymentOptions(player, card);
      if (options.length === 0) return false;
      if (options.includes("materialsAndCharge")) {
        return player === this.player
          ? await this.payDriveCombinedCostWithChoices(player, card)
          : this.payDriveCombinedCostAutomatically(player, card);
      }
      if (player === this.player && options.length > 1) {
        const useCharge = await this.chooseDrivePaymentMode(player, card);
        return useCharge ? this.payDriveChargeCost(player, card) : await this.payDriveMaterialCostWithChoices(player, card);
      }
      if (options.includes("charge")) return this.payDriveChargeCost(player, card);
      if (player === this.player) return await this.payDriveCostWithChoices(player, card);
      return this.payDriveCostAutomatically(player, card);
    }

    async chooseDrivePaymentMode(player, card) {
      if (player !== this.player) return true;
      const selected = await this.options.requestCardChoice({
        zone: "drivePayment",
        title: `${card.name}のドライブ支払い`,
        message: card.theme
          ? `素材を墓地に送るか、チャージゾーンに「${card.theme}」が${card.cost}枚以上あるならチャージ${card.cost}を支払えます。`
          : `素材を墓地に送るか、チャージゾーンに${baseDriveType(card.type)}が${card.cost}枚以上あるならチャージ${card.cost}を支払えます。`,
        candidates: [{ id: card.id, index: "charge" }],
        allowPass: true,
        confirmLabel: "チャージで支払う",
        passLabel: "素材で支払う",
      }, this);
      return selected === "charge";
    }

    payDriveChargeCost(player, card) {
      if (!this.canPayDriveChargeCost(player, card)) return false;
      return this.payCost(player, Math.max(0, Number(card?.cost || 0)));
    }

    payDriveCombinedCostAutomatically(player, card) {
      const driveCost = card?.driveCost || {};
      const selection = Array.isArray(driveCost.materials)
        ? this.selectDriveMaterials(player, driveCost, Math.max(0, Number(card?.cost || 0)), this.requiredFreedTypeForDrive(player, card), card)
        : this.selectLegacyDriveMaterialPlan(player, driveCost, this.requiredFreedTypeForDrive(player, card));
      if (!selection || !this.canPayDriveChargeCostAfterMaterials(player, card, selection)) return false;
      this.removeDriveMaterialSelection(player, selection);
      return this.payDriveChargeCost(player, card);
    }

    async payDriveCombinedCostWithChoices(player, card) {
      const selectedMaterials = Array.isArray(card?.driveCost?.materials)
        ? await this.chooseDriveMaterialSelection(player, card)
        : await this.chooseLegacyDriveMaterialSelection(player, card);
      if (!selectedMaterials) return false;
      if (!this.canPayDriveChargeCostAfterMaterials(player, card, selectedMaterials)) return false;
      this.removeDriveMaterialSelection(player, selectedMaterials);
      return this.payDriveChargeCost(player, card);
    }

    payDriveCostAutomatically(player, card) {
      const driveCost = card?.driveCost || {};
      if (Array.isArray(driveCost.materials)) {
        const selection = this.selectDriveMaterials(player, driveCost, 0, this.requiredFreedTypeForDrive(player, card));
        if (!selection) return false;
        this.removeDriveMaterialSelection(player, selection);
        return true;
      }
      let fieldRemaining = driveCost.field || 0;
      let chargeRemaining = driveCost.charge || 0;

      if (fieldRemaining > 0) {
        for (const entry of this.fieldMaterialEntries(player, driveCost)) {
          if (fieldRemaining <= 0) break;
          player.grave.push(entry.id);
          entry.remove();
          fieldRemaining -= 1;
        }
      }

      if (chargeRemaining > 0) {
        const selected = this.driveChargeMaterialIndexes(player, driveCost)
          .slice(0, chargeRemaining)
          .map((entry) => ({ ...entry, originalIndex: entry.index, source: "charge", key: `charge:${entry.index}` }))
          .sort((a, b) => b.originalIndex - a.originalIndex);
        for (const { originalIndex } of selected) {
          const [removed] = player.charge.splice(originalIndex, 1);
          player.grave.push(removed.id);
          chargeRemaining -= 1;
        }
      }

      if (fieldRemaining !== 0 || chargeRemaining !== 0) return false;
      return true;
    }

    async payDriveCostWithChoices(player, card) {
      const driveCost = card?.driveCost || {};
      if (Array.isArray(driveCost.materials)) {
        return await this.payDriveMaterialCostWithChoices(player, card);
      }
      const fieldRequired = driveCost.field || 0;
      const chargeRequired = driveCost.charge || 0;
      const fieldMaterials = [];
      const chargeMaterials = [];

      for (let i = 0; i < fieldRequired; i += 1) {
        const material = await this.chooseDriveFieldMaterial(player, card, fieldMaterials, i + 1, fieldRequired);
        if (!material) return false;
        fieldMaterials.push(material);
      }

      for (let i = 0; i < chargeRequired; i += 1) {
        const material = await this.chooseDriveChargeMaterial(player, card, chargeMaterials, i + 1, chargeRequired);
        if (!material) return false;
        chargeMaterials.push({ ...material, source: "charge" });
      }

      fieldMaterials.forEach((entry) => {
        player.grave.push(entry.id);
        entry.remove();
      });

      chargeMaterials
        .slice()
        .sort((a, b) => b.originalIndex - a.originalIndex)
        .forEach((entry) => {
          const [removed] = player.charge.splice(entry.originalIndex, 1);
          if (removed) player.grave.push(removed.id);
        });

      return true;
    }

    async payDriveMaterialCostWithChoices(player, card) {
      const selectedMaterials = await this.chooseDriveMaterialSelection(player, card);
      if (!selectedMaterials) return false;
      this.removeDriveMaterialSelection(player, selectedMaterials);
      return true;
    }

    async chooseDriveMaterialSelection(player, card) {
      const selectedMaterials = [];
      const requirements = this.expandDriveRequirements(card.driveCost);

      for (let i = 0; i < requirements.length; i += 1) {
        const material = await this.chooseDriveMaterial(player, card, requirements[i], selectedMaterials, i + 1, requirements.length);
        if (!material) return false;
        selectedMaterials.push(material);
      }

      if (!this.driveSelectionFreesRequiredSlot(player, card, selectedMaterials)) return false;
      return selectedMaterials;
    }

    selectLegacyDriveMaterialPlan(player, driveCost = {}, requiredFreedType = null) {
      const field = driveCost.field || 0;
      const charge = driveCost.charge || 0;
      if (requiredFreedType && (baseDriveType(driveCost.type) !== requiredFreedType || field <= 0)) return null;
      const fieldMaterials = this.fieldMaterialEntries(player, driveCost)
        .slice(0, field)
        .map((entry) => ({ ...entry, source: "field" }));
      if (fieldMaterials.length < field) return null;
      const chargeMaterials = this.driveChargeMaterialIndexes(player, driveCost)
        .slice(0, charge)
        .map((entry) => ({
          id: entry.id,
          key: `charge:${entry.index}`,
          source: "charge",
          originalIndex: entry.index,
          tapped: Boolean(entry.tapped),
        }));
      if (chargeMaterials.length < charge) return null;
      const selected = [...fieldMaterials, ...chargeMaterials];
      if (!this.driveSelectionFreesRequiredSlot(player, { driveKind: null }, selected, requiredFreedType)) return null;
      return selected;
    }

    async chooseLegacyDriveMaterialSelection(player, card) {
      const driveCost = card?.driveCost || {};
      const fieldRequired = driveCost.field || 0;
      const chargeRequired = driveCost.charge || 0;
      const fieldMaterials = [];
      const chargeMaterials = [];

      for (let i = 0; i < fieldRequired; i += 1) {
        const material = await this.chooseDriveFieldMaterial(player, card, fieldMaterials, i + 1, fieldRequired);
        if (!material) return false;
        fieldMaterials.push({ ...material, source: "field" });
      }

      for (let i = 0; i < chargeRequired; i += 1) {
        const material = await this.chooseDriveChargeMaterial(player, card, chargeMaterials, i + 1, chargeRequired);
        if (!material) return false;
        chargeMaterials.push(material);
      }

      const selected = [...fieldMaterials, ...chargeMaterials];
      if (!this.driveSelectionFreesRequiredSlot(player, card, selected)) return false;
      return selected;
    }

    async chooseDriveMaterial(player, card, requirement, selectedMaterials, step, total) {
      const selectedKeys = new Set(selectedMaterials.map((entry) => entry.key));
      const candidates = this.driveMaterialEntries(player)
        .filter((entry) => !selectedKeys.has(entry.key))
        .filter((entry) => this.matchesDriveRequirement(cards[entry.id], requirement, entry))
        .map((entry) => ({ ...entry, index: entry.key }));
      if (candidates.length === 0) return null;
      const selected = await this.options.requestCardChoice({
        zone: "driveMaterial",
        title: `${card.name}の素材`,
        message: `${this.driveRequirementLabel(requirement)}を墓地に送ってください。${step}/${total}`,
        candidates,
        confirmLabel: "素材にする",
      }, this);
      return candidates.find((entry) => entry.key === selected) || null;
    }

    async chooseDriveFieldMaterial(player, card, selectedMaterials, step, total) {
      const selectedKeys = new Set(selectedMaterials.map((entry) => entry.index));
      const candidates = this.fieldMaterialEntries(player, card.driveCost)
        .map((entry) => ({
          ...entry,
          index: entry.key,
        }))
        .filter((entry) => !selectedKeys.has(entry.index));
      if (candidates.length === 0) return null;
      const selected = await this.options.requestCardChoice({
        zone: "driveMaterial",
        title: `${card.name}の場素材`,
        message: `墓地に送る場の素材を選んでください。${step}/${total}`,
        candidates,
        confirmLabel: "素材にする",
      }, this);
      return candidates.find((entry) => entry.index === selected) || null;
    }

    async chooseDriveChargeMaterial(player, card, selectedMaterials, step, total) {
      const selectedKeys = new Set(selectedMaterials.map((entry) => entry.index));
      const candidates = this.driveChargeMaterialIndexes(player, card.driveCost)
        .map((entry) => ({
          ...entry,
          source: "charge",
          originalIndex: entry.index,
          index: `charge:${entry.index}`,
        }))
        .filter((entry) => !selectedKeys.has(entry.index));
      if (candidates.length === 0) return null;
      const selected = await this.options.requestCardChoice({
        zone: "driveMaterial",
        title: `${card.name}のチャージ素材`,
        message: `墓地に送るチャージの素材を選んでください。${step}/${total}`,
        candidates,
        confirmLabel: "素材にする",
      }, this);
      return candidates.find((entry) => entry.index === selected) || null;
    }

    remainingUntappedAfterSelectedDriveMaterials(player, chargeMaterials) {
      const selectedIndexes = new Set(chargeMaterials
        .filter((entry) => entry.source === "charge" || entry.originalIndex !== undefined)
        .map((entry) => entry.originalIndex));
      return player.charge.filter((entry, index) => !entry.tapped && !selectedIndexes.has(index)).length;
    }

    expandDriveRequirements(driveCost = {}) {
      if (!Array.isArray(driveCost.materials)) return [];
      return driveCost.materials.flatMap((requirement) => {
        const count = Math.max(0, requirement.count || 0);
        return Array.from({ length: count }, () => requirement);
      });
    }

    selectDriveMaterials(player, driveCost = {}, cost = 0, requiredFreedType = null, chargeCostCard = null) {
      const requirements = this.expandDriveRequirements(driveCost);
      const entries = this.driveMaterialEntries(player);
      const search = (step, availableEntries, selected) => {
        if (step >= requirements.length) {
          if (!this.driveSelectionFreesRequiredSlot(player, { driveKind: null }, selected, requiredFreedType)) return null;
          if (this.remainingUntappedAfterSelectedDriveMaterials(player, selected) < cost) return null;
          if (chargeCostCard && !this.canPayDriveChargeCostAfterMaterials(player, chargeCostCard, selected)) return null;
          return selected;
        }

        const requirement = requirements[step];
        const candidates = availableEntries
          .filter((entry) => this.matchesDriveRequirement(cards[entry.id], requirement, entry))
          .sort((a, b) => this.driveMaterialPriority(a, b, requiredFreedType));
        for (const entry of candidates) {
          const result = search(
            step + 1,
            availableEntries.filter((candidate) => candidate.key !== entry.key),
            [...selected, entry]
          );
          if (result) return result;
        }
        return null;
      };
      return search(0, entries, []);
    }

    driveMaterialPriority(a, b, requiredFreedType = null) {
      const aFrees = requiredFreedType && a.source === "field" && baseDriveType(cards[a.id]?.type) === requiredFreedType;
      const bFrees = requiredFreedType && b.source === "field" && baseDriveType(cards[b.id]?.type) === requiredFreedType;
      if (aFrees !== bFrees) return aFrees ? -1 : 1;
      const rank = (entry) => {
        if (entry.source === "charge" && entry.tapped) return 0;
        if (entry.source === "field") return 1;
        return 2;
      };
      const aRank = rank(a);
      const bRank = rank(b);
      if (aRank !== bRank) return aRank - bRank;
      return String(a.key).localeCompare(String(b.key));
    }

    requiredFreedTypeForDrive(player, card) {
      if (card?.driveKind === "unit" && !player.units.some((unit) => !unit)) return "ユニット";
      if (card?.driveKind === "core" && !player.cores.some((core) => !core)) return "コア";
      return null;
    }

    driveSelectionFreesRequiredSlot(player, card, selectedMaterials, forcedType = null) {
      const requiredType = forcedType || this.requiredFreedTypeForDrive(player, card);
      if (!requiredType) return true;
      return selectedMaterials.some((entry) => entry.source === "field" && baseDriveType(cards[entry.id]?.type) === requiredType);
    }

    removeDriveMaterialSelection(player, selectedMaterials) {
      selectedMaterials
        .filter((entry) => entry.source === "field")
        .forEach((entry) => {
          player.grave.push(entry.id);
          entry.remove();
        });

      selectedMaterials
        .filter((entry) => entry.source === "charge")
        .slice()
        .sort((a, b) => b.originalIndex - a.originalIndex)
        .forEach((entry) => {
          const [removed] = player.charge.splice(entry.originalIndex, 1);
          if (removed) player.grave.push(removed.id);
        });
    }

    driveMaterialEntries(player) {
      const entries = [];
      player.units.forEach((unit, index) => {
        if (unit) entries.push({ id: unit.id, key: `unit:${index}`, source: "field", remove: () => { player.units[index] = null; } });
      });
      player.cores.forEach((id, index) => {
        if (id) entries.push({ id, key: `core:${index}`, source: "field", remove: () => { player.cores[index] = null; } });
      });
      player.reactions.forEach((entry, index) => {
        const id = reactionId(entry);
        if (id) entries.push({ id, key: `reaction:${index}`, source: "field", remove: () => { player.reactions[index] = null; } });
      });
      player.charge.forEach((entry, index) => {
        entries.push({
          id: entry.id,
          key: `charge:${index}`,
          source: "charge",
          originalIndex: index,
          tapped: Boolean(entry.tapped),
        });
      });
      return entries;
    }

    matchesDriveRequirement(card, requirement = {}, entry = null) {
      if (!card) return false;
      if (requirement.source && entry?.source !== requirement.source) return false;
      if (requirement.id && card.id !== requirement.id) return false;
      if (Array.isArray(requirement.ids) && !requirement.ids.includes(card.id)) return false;
      const type = baseDriveType(requirement.type);
      if (type && baseDriveType(card.type) !== type) return false;
      if (requirement.theme && card.theme !== requirement.theme && !card.name.includes(requirement.theme)) return false;
      return true;
    }

    driveRequirementLabel(requirement = {}) {
      const source = requirement.source === "field" ? "場の" : requirement.source === "charge" ? "チャージの" : "";
      if (requirement.id && cards[requirement.id]) return `${source}${cards[requirement.id].name}1枚`;
      const theme = requirement.theme ? `「${requirement.theme}」` : "";
      const type = baseDriveType(requirement.type) || "カード";
      if (theme && type !== "カード") return `${source}${theme}${type}1枚`;
      if (theme) return `${source}任意の${theme}カード1枚`;
      return `${source}${type}1枚`;
    }

    countFieldMaterials(player, driveCost = {}) {
      return this.fieldMaterialEntries(player, driveCost).length;
    }

    countChargeMaterials(player, driveCost = {}) {
      return player.charge.filter((entry) => this.matchesDriveMaterial(cards[entry.id], driveCost)).length;
    }

    remainingUntappedAfterDriveMaterials(player, driveCost = {}) {
      const untappedTotal = player.charge.filter((entry) => !entry.tapped).length;
      const chargeMaterials = driveCost.charge || 0;
      const selected = this.driveChargeMaterialIndexes(player, driveCost).slice(0, chargeMaterials);
      const untappedRemoved = selected.filter((entry) => !entry.tapped).length;
      return untappedTotal - untappedRemoved;
    }

    driveChargeMaterialIndexes(player, driveCost = {}) {
      return player.charge
        .map((entry, index) => ({ index, tapped: Boolean(entry.tapped), id: entry.id }))
        .filter((entry) => this.matchesDriveMaterial(cards[entry.id], driveCost))
        .sort((a, b) => Number(b.tapped) - Number(a.tapped) || b.index - a.index);
    }

    fieldMaterialEntries(player, driveCost = {}) {
      const entries = [];
      const type = baseDriveType(driveCost.type);
      if (type === "ユニット") {
        player.units.forEach((unit, index) => {
          if (unit && this.matchesDriveMaterial(cards[unit.id], driveCost)) {
            entries.push({ id: unit.id, key: `unit:${index}`, remove: () => { player.units[index] = null; } });
          }
        });
      }
      if (type === "コア") {
        player.cores.forEach((id, index) => {
          if (id && this.matchesDriveMaterial(cards[id], driveCost)) {
            entries.push({ id, key: `core:${index}`, remove: () => { player.cores[index] = null; } });
          }
        });
      }
      if (type === "リアクション") {
        player.reactions.forEach((entry, index) => {
          const id = reactionId(entry);
          if (id && this.matchesDriveMaterial(cards[id], driveCost)) {
            entries.push({ id, key: `reaction:${index}`, remove: () => { player.reactions[index] = null; } });
          }
        });
      }
      return entries;
    }

    matchesDriveMaterial(card, driveCost = {}) {
      if (!card) return false;
      const type = baseDriveType(driveCost.type);
      if (type && baseDriveType(card.type) !== type) return false;
      if (driveCost.theme && card.theme !== driveCost.theme && !card.name.includes(driveCost.theme)) return false;
      return true;
    }

    canPay(player, cost) {
      return player.charge.filter((charge) => !charge.tapped).length >= cost;
    }

    payCost(player, cost) {
      if (!this.canPay(player, cost)) return false;
      let remaining = cost;
      player.charge.forEach((charge) => {
        if (remaining > 0 && !charge.tapped) {
          charge.tapped = true;
          remaining -= 1;
        }
      });
      return true;
    }

    drawCards(player, amount) {
      for (let i = 0; i < amount; i += 1) {
        if (player.deck.length === 0) {
          player.lp = 0;
          this.log(`${player.name}は山札切れ。`);
          this.checkGameEnd();
          return;
        }
        player.hand.push(player.deck.pop());
      }
    }

    async addFromDeck(player, predicate, choice = {}) {
      const index = await this.chooseDeckIndex(player, predicate, {
        title: choice.title || "デッキからサーチ",
        message: choice.message || "手札に加えるカードを選んでください。",
      });
      if (index === -1) return false;
      const [id] = player.deck.splice(index, 1);
      player.hand.push(id);
      this.log(`${cards[id].name}を手札に加えた。`);
      player.deck = shuffle(player.deck);
      return true;
    }

    async addFromGrave(player, predicate, choice = {}) {
      const index = await this.chooseGraveIndex(player, predicate, {
        title: choice.title || "墓地から回収",
        message: choice.message || "手札に戻すカードを選んでください。",
      });
      if (index === -1) return false;
      const [id] = player.grave.splice(index, 1);
      this.returnCardToHandOrDriveDeck(player, id, "墓地から");
      return true;
    }

    async moveHandCardToCharge(player, predicate, choice = {}) {
      const index = await this.chooseHandIndex(player, predicate, {
        title: choice.title || "手札をチャージ",
        message: choice.message || "チャージに置くカードを選んでください。",
      });
      if (index === -1) return false;
      const [id] = player.hand.splice(index, 1);
      player.charge.push({ id, tapped: false });
      this.log(`${cards[id].name}をチャージに置いた。`);
      return true;
    }

    async moveGraveCardToCharge(player, predicate, choice = {}) {
      const index = await this.chooseGraveIndex(player, predicate, {
        title: choice.title || "墓地をチャージ",
        message: choice.message || "チャージに置くカードを選んでください。",
      });
      if (index === -1) return false;
      const [id] = player.grave.splice(index, 1);
      player.charge.push({ id, tapped: false });
      this.log(`${cards[id].name}を墓地からチャージに置いた。`);
      return true;
    }

    async discardFromHand(player, choice = {}) {
      const index = await this.chooseHandIndex(player, () => true, {
        title: choice.title || "手札を捨てる",
        message: choice.message || "墓地に送るカードを選んでください。",
      });
      if (index === -1) return this.discardLowestImpact(player);
      const [id] = player.hand.splice(index, 1);
      player.grave.push(id);
      this.log(`${cards[id].name}を墓地に送った。`);
      return true;
    }

    async chooseDeckIndex(player, predicate, choice) {
      return this.chooseCardIndex(player, "deck", player.deck, predicate, choice);
    }

    async chooseGraveIndex(player, predicate, choice) {
      return this.chooseCardIndex(player, "grave", player.grave, predicate, choice);
    }

    async chooseHandIndex(player, predicate, choice) {
      return this.chooseCardIndex(player, "hand", player.hand, predicate, choice);
    }

    async chooseCardIndex(player, zone, list, predicate, choice) {
      const candidates = list
        .map((id, index) => ({ id, index }))
        .filter((entry) => cards[entry.id] && predicate(cards[entry.id], entry.index));
      if (candidates.length === 0) return -1;
      if (player !== this.player) return candidates[0].index;

      const selected = await this.options.requestCardChoice({
        zone,
        title: choice.title,
        message: choice.message,
        candidates,
        allowPass: choice.allowPass,
        confirmLabel: choice.confirmLabel,
        passLabel: choice.passLabel,
      }, this);
      const candidate = candidates.find((entry) => entry.index === selected);
      return candidate ? candidate.index : -1;
    }

    discardLowestImpact(player) {
      if (player.hand.length === 0) return false;
      let index = 0;
      player.hand.forEach((id, handIndex) => {
        const current = cards[id];
        const chosen = cards[player.hand[index]];
        if (current.cost > chosen.cost) return;
        if (current.type === "リアクション" && chosen.type !== "リアクション") return;
        index = handIndex;
      });
      const [id] = player.hand.splice(index, 1);
      player.grave.push(id);
      this.log(`${cards[id].name}を墓地に送った。`);
      return true;
    }

    sendToGrave(player, id) {
      if (!id) return false;
      player.grave.push(id);
      return true;
    }

    returnCardToHandOrDriveDeck(player, id, prefix = "") {
      const card = cards[id];
      if (!card) return false;
      if (card.driveKind) {
        player.driveDeck.push(id);
        this.log(`${card.name}を${prefix}ドライブデッキに戻した。`);
        return true;
      }
      player.hand.push(id);
      this.log(`${card.name}を${prefix}手札に戻した。`);
      return true;
    }

    untapOneCharge(player, predicate = () => true) {
      const charge = player.charge.find((entry) => entry.tapped && predicate(cards[entry.id]));
      if (!charge) return false;
      charge.tapped = false;
      return true;
    }

    buffThemeUnits(player, theme, amount) {
      let changed = 0;
      player.units.forEach((unit) => {
        if (!unit || !cardHasTheme(cards[unit.id], theme)) return;
        unit.atkMod = (unit.atkMod || 0) + amount;
        changed += 1;
      });
      if (changed > 0) this.log(`「${theme}」ユニット${changed}体のATKを${amount}アップ。`);
      return changed;
    }

    countThemeInCharge(player, theme) {
      return player.charge.filter((entry) => cardHasTheme(cards[entry.id], theme)).length;
    }

    countThemeChargeTypes(player, theme) {
      const types = new Set();
      player.charge.forEach((entry) => {
        const card = cards[entry.id];
        if (!cardHasTheme(card, theme)) return;
        const type = baseDriveType(card.type) || card.type;
        if (type) types.add(type);
      });
      return types.size;
    }

    countThemeUnits(player, theme) {
      return player.units.filter((unit) => unit && cardHasTheme(cards[unit.id], theme)).length;
    }

    controlsCard(player, id) {
      return player.units.some((unit) => unit?.id === id);
    }

    hasSosaiPair(player) {
      return (
        player.units.some((unit) => unit && SOSAI_DRIVE_PAIR_IDS.includes(unit.id)) ||
        SOSAI_PAIRS.some(([first, second]) => this.controlsCard(player, first) && this.controlsCard(player, second))
      );
    }

    hasSosaiPairMate(player, id) {
      if (SOSAI_DRIVE_PAIR_IDS.includes(id)) return true;
      return SOSAI_PAIRS.some(([first, second]) => (
        (id === first && this.controlsCard(player, second)) ||
        (id === second && this.controlsCard(player, first))
      ));
    }

    completeTurn() {
      const player = this.active === "enemy" ? this.enemy : this.player;
      player.units.forEach((unit) => {
        if (!unit?.exhaustedUntilOwnerTurnEnd) return;
        if (!unit.exhaustedUntilOwnerTurnEndReady) return;
        unit.exhaustedUntilOwnerTurnEnd = false;
        unit.exhaustedUntilOwnerTurnEndReady = false;
        unit.exhausted = false;
      });
      this.completedTurns += 1;
    }

    async revealReactions(player, amount) {
      let revealed = 0;
      for (let i = 0; i < amount; i += 1) {
        const index = await this.chooseReactionTargetIndex(player, (entry) => reactionId(entry) && !reactionRevealed(entry), {
          title: "公開するリアクションを選択",
          message: "公開状態にする相手のセットリアクションを選んでください。",
        });
        if (index < 0) break;
        const id = reactionId(player.reactions[index]);
        player.reactions[index] = { id, revealed: true };
        revealed += 1;
      }
      return revealed;
    }

    async removeRevealedReaction(player) {
      const index = await this.chooseReactionTargetIndex(player, (entry) => reactionId(entry) && reactionRevealed(entry), {
        title: "墓地に送るリアクションを選択",
        message: "墓地に送る相手の公開リアクションを選んでください。",
      });
      if (index === -1) return false;
      const id = reactionId(player.reactions[index]);
      player.reactions[index] = null;
      player.grave.push(id);
      this.log(`${cards[id].name}は墓地に送られた。`);
      return true;
    }

    reactionRevealed(entry) {
      return reactionRevealed(entry);
    }

    controlsThemeUnit(player, theme) {
      return player.units.some((unit) => unit && cardHasTheme(cards[unit.id], theme));
    }

    hasCore(player, id) {
      return player.cores.includes(id);
    }

    hasThemeCore(player, theme) {
      return player.cores.some((id) => cardHasTheme(cards[id], theme));
    }

    async chooseUnitTargetIndex(player, predicate = () => true, choice = {}) {
      const candidates = player.units
        .map((unit, index) => ({ id: unit?.id, unit, index }))
        .filter((entry) => entry.unit && predicate(entry.unit, entry.index));
      if (candidates.length === 0) return -1;
      if (player !== this.enemy) {
        return candidates
          .slice()
          .sort((a, b) => this.getUnitAtk(player, b.unit) - this.getUnitAtk(player, a.unit))[0].index;
      }
      const selected = await this.options.requestCardChoice({
        zone: "unitTarget",
        title: choice.title || "対象ユニットを選択",
        message: choice.message || "効果の対象にする相手ユニットを選んでください。",
        candidates,
        confirmLabel: choice.confirmLabel || "決定",
      }, this);
      const target = candidates.find((entry) => entry.index === selected);
      return target ? target.index : -1;
    }

    async chooseReactionTargetIndex(player, predicate = () => true, choice = {}) {
      const candidates = player.reactions
        .map((entry, index) => ({ id: reactionId(entry), entry, index }))
        .filter((candidate) => candidate.id && predicate(candidate.entry, candidate.index));
      if (candidates.length === 0) return -1;
      if (player !== this.enemy) return candidates[0].index;
      const selected = await this.options.requestCardChoice({
        zone: "reactionTarget",
        title: choice.title || "対象リアクションを選択",
        message: choice.message || "効果の対象にする相手リアクションを選んでください。",
        candidates,
        confirmLabel: choice.confirmLabel || "決定",
      }, this);
      const target = candidates.find((entry) => entry.index === selected);
      return target ? target.index : -1;
    }

    async chooseCoreTargetIndex(player, predicate = () => true, choice = {}) {
      const candidates = player.cores
        .map((id, index) => ({ id, index }))
        .filter((entry) => entry.id && predicate(entry.id, entry.index));
      if (candidates.length === 0) return -1;
      if (player !== this.enemy) return candidates[0].index;
      const selected = await this.options.requestCardChoice({
        zone: "coreTarget",
        title: choice.title || "対象コアを選択",
        message: choice.message || "効果の対象にする相手コアを選んでください。",
        candidates,
        confirmLabel: choice.confirmLabel || "決定",
      }, this);
      const target = candidates.find((entry) => entry.index === selected);
      return target ? target.index : -1;
    }

    async destroyBestUnit(player) {
      const index = await this.chooseUnitTargetIndex(player, () => true, {
        title: "破壊するユニットを選択",
        message: "破壊する相手ユニットを選んでください。",
      });
      if (index < 0) return false;
      this.destroyUnit(player, index);
      return true;
    }

    async destroyBestCore(player) {
      const index = await this.chooseCoreTargetIndex(player, () => true, {
        title: "破壊するコアを選択",
        message: "破壊する相手コアを選んでください。",
      });
      if (index < 0) return false;
      const id = player.cores[index];
      player.cores[index] = null;
      player.grave.push(id);
      this.log(`${cards[id].name}を破壊した。`);
      return true;
    }

    async returnBestUnitToHand(player) {
      const index = await this.chooseUnitTargetIndex(player, () => true, {
        title: "戻すユニットを選択",
        message: "手札に戻す相手ユニットを選んでください。",
      });
      if (index < 0) return false;
      const unit = player.units[index];
      this.returnCardToHandOrDriveDeck(player, unit.id);
      player.units[index] = null;
      return true;
    }

    async destroyBestExhaustedUnit(player) {
      const index = await this.chooseUnitTargetIndex(player, (unit) => unit.exhausted, {
        title: "破壊する行動済みユニットを選択",
        message: "破壊する相手の行動済みユニットを選んでください。",
      });
      if (index < 0) return false;
      const targetName = cards[player.units[index].id].name;
      this.destroyUnit(player, index);
      this.log(`${targetName}を破壊した。`);
      return true;
    }

    async exhaustBestUnit(player) {
      const index = await this.chooseUnitTargetIndex(player, (unit) => !unit.exhausted, {
        title: "行動済みにするユニットを選択",
        message: "次の相手ターン終了まで行動済みにする相手ユニットを選んでください。",
      });
      if (index < 0) return false;
      this.exhaustUnitUntilOwnerTurnEnd(player, index);
      this.log(`${cards[player.units[index].id].name}を次のターン終了まで行動済みにした。`);
      return true;
    }

    exhaustUnitUntilOwnerTurnEnd(player, index) {
      const unit = player.units[index];
      if (!unit) return false;
      unit.exhausted = true;
      unit.exhaustedUntilOwnerTurnEnd = true;
      unit.exhaustedUntilOwnerTurnEndReady = false;
      return true;
    }

    hasExhaustedUnit(player) {
      return player.units.some((unit) => unit && unit.exhausted);
    }

    hasSetReaction(player) {
      return player.reactions.some((entry) => reactionId(entry));
    }

    resolveAttack(attackerPlayer, defenderPlayer, attackerIndex, targetIndex) {
      const attacker = attackerPlayer.units[attackerIndex];
      if (!attacker) return;
      const attackerCard = cards[attacker.id];
      const attackerAtk = this.getUnitAtk(attackerPlayer, attacker);
      attacker.exhausted = true;

      if (targetIndex === null || targetIndex === undefined) {
        const dealt = this.damage(defenderPlayer, attackerAtk, { log: false });
        this.log(`${attackerCard.name}が直接攻撃。${dealt}ダメージ。`);
        return;
      }

      const defender = defenderPlayer.units[targetIndex];
      if (!defender) return;
      const defenderCard = cards[defender.id];
      const defenderAtk = this.getUnitAtk(defenderPlayer, defender);
      const diff = Math.abs(attackerAtk - defenderAtk);

      if (attackerAtk > defenderAtk) {
        this.destroyUnit(defenderPlayer, targetIndex);
        const dealt = this.damage(defenderPlayer, diff, { log: false });
        this.log(`${attackerCard.name}が${defenderCard.name}を破壊。${dealt}ダメージ。`);
      } else if (attackerAtk < defenderAtk) {
        this.destroyUnit(attackerPlayer, attackerIndex);
        const dealt = this.damage(attackerPlayer, diff, { log: false });
        this.log(`${attackerCard.name}は返り討ち。${dealt}ダメージ。`);
      } else {
        this.destroyUnit(attackerPlayer, attackerIndex);
        this.destroyUnit(defenderPlayer, targetIndex);
        this.log(`${attackerCard.name}と${defenderCard.name}が相打ち。`);
      }
    }

    destroyUnit(player, index) {
      const unit = player.units[index];
      if (!unit) return;
      player.grave.push(unit.id);
      player.units[index] = null;
    }

    damage(player, amount, options = {}) {
      const dealt = amount;
      player.lp = Math.max(0, player.lp - dealt);
      if (options.log !== false) {
        this.log(`${player.name}に${dealt}ダメージ。`);
      }
      return dealt;
    }

    getUnitAtk(player, unit) {
      const card = cards[unit.id];
      let atk = card.atk + (unit.atkMod || 0);
      if (card.name.includes("星導の衛士カイ")) atk += player.cores.filter(Boolean).length * 300;
      if (cardHasTheme(card, "黒機") && this.hasCore(player, "black_tower")) atk += 200;
      if (cardHasTheme(card, "断刃") && this.hasCore(player, "blade_scaffold")) atk += 200;
      if (cardHasTheme(card, "電脳") && this.hasCore(player, "cyber_network")) atk += 100;
      if (cardHasTheme(card, "双彩") && this.hasCore(player, "sosai_pop_stage") && this.hasSosaiPairMate(player, unit.id)) atk += 300;
      if (cardHasTheme(card, "契環") && this.hasCore(player, "keikan_witness_ring") && this.countThemeChargeTypes(player, "契環") >= 3) atk += 300;
      if (cardHasTheme(card, "星導") && this.hasCore(player, "drive_star_core")) atk += 300;
      if (cardHasTheme(card, "黒機") && this.hasCore(player, "drive_black_core")) atk += 300;
      if (cardHasTheme(card, "断刃") && this.hasCore(player, "drive_blade_core")) atk += 300;
      if (cardHasTheme(card, "電脳") && this.hasCore(player, "drive_cyber_core")) atk += 200;
      if (cardHasTheme(card, "双彩") && this.hasCore(player, "drive_sosai_core") && this.hasSosaiPairMate(player, unit.id)) atk += 500;
      if (cardHasTheme(card, "契環") && this.hasCore(player, "drive_keikan_core")) atk += 300;
      return atk;
    }

    checkGameEnd() {
      if (this.finished) return true;
      if (this.player.lp <= 0 || this.enemy.lp <= 0) {
        this.finished = true;
        this.busy = false;
        const won = this.enemy.lp <= 0 && this.player.lp > 0;
        this.log(won ? "勝利。" : "敗北。");
        this.options.onResult(won, this);
        this.notify();
        return true;
      }
      return false;
    }

  }

  function shuffle(list) {
    const result = [...list];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function reactionId(entry) {
    return typeof entry === "string" ? entry : entry?.id;
  }

  function reactionRevealed(entry) {
    return Boolean(entry && typeof entry === "object" && entry.revealed);
  }

  function baseDriveType(type = "") {
    return String(type).replace("ドライブ", "");
  }

  function cardHasTheme(card, theme) {
    return Boolean(card && (card.theme === theme || card.name.includes(theme)));
  }

  function preferredOpenSlot(list, preferredSlot) {
    const slot = Number(preferredSlot);
    if (Number.isInteger(slot) && slot >= 0 && slot < list.length && !list[slot]) return slot;
    return list.findIndex((entry) => !entry);
  }

  function pause(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  Object.assign(window.Chrono, {
    DuelGame,
    Duelist,
    shuffle,
  });
})();
