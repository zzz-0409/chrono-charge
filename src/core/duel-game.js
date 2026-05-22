(function () {
  "use strict";

  const {
    MAX_LP,
    ENVIRONMENT_MAX_LEVEL,
    UNIT_ZONES,
    CORE_ZONES,
    REACTION_ZONES,
    cards,
    starterEnvironmentDeck,
    cpuEnvironmentDeck,
    EffectResolver,
    CpuController,
  } = window.Chrono;

  class Duelist {
    constructor(name, deck) {
      this.name = name;
      this.lp = MAX_LP;
      this.deck = shuffle(deck);
      this.hand = [];
      this.grave = [];
      this.charge = [];
      this.units = Array(UNIT_ZONES).fill(null);
      this.cores = Array(CORE_ZONES).fill(null);
      this.reactions = Array(REACTION_ZONES).fill(null);
      this.chargedThisTurn = false;
      this.drewFromStarCore = false;
      this.shiftedThisTurn = false;
    }

    refreshTurn() {
      this.charge.forEach((charge) => {
        charge.tapped = false;
      });
      this.units.forEach((unit) => {
        if (unit) unit.exhausted = false;
      });
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
        delayMs: 360,
        ...options,
      };
      this.turn = 1;
      this.active = Math.random() < 0.5 ? "player" : "enemy";
      this.busy = false;
      this.finished = false;
      this.logItems = [];
      this.player = new Duelist("Player", this.options.playerDeck);
      this.enemy = new Duelist("CPU: 黒機", this.options.cpuDeck);
      this.firstActive = this.active;
      this.completedTurns = 0;
      this.environmentCycle = 0;
      this.naturalEnvironmentLevel = 1;
      this.currentEnvironment = null;
      this.playerEnvironmentDeck = this.options.playerEnvironmentDeck?.length ? this.options.playerEnvironmentDeck.slice() : expandCounts(starterEnvironmentDeck);
      this.enemyEnvironmentDeck = this.options.cpuEnvironmentDeck?.length ? this.options.cpuEnvironmentDeck.slice() : expandCounts(cpuEnvironmentDeck);
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
      this.changeEnvironment(this.naturalEnvironmentLevel);
      this.notify();
      if (this.active === "enemy") this.runEnemyTurn({ opening: true });
    }

    notify() {
      this.options.onChange(this);
    }

    log(message) {
      this.logItems.push(message);
      if (this.logItems.length > 80) this.logItems.shift();
    }

    canPlayerAct() {
      return this.active === "player" && !this.busy && !this.finished;
    }

    async playFromHand(index, preferredSlot = null) {
      if (!this.canPlayerAct()) return false;
      const id = this.player.hand[index];
      const card = cards[id];
      if (!card || !this.canPlayCard(this.player, card)) return false;
      if (!this.payCost(this.player, card.cost)) return false;

      this.player.hand.splice(index, 1);
      const negated = card.effect ? await this.opponentMayReact({ trigger: "effect", source: card }) : false;
      await this.resolvePlayedCard(this.player, this.enemy, card, negated, "player", preferredSlot);
      this.checkGameEnd();
      this.notify();
      return true;
    }

    async chargeFromHand(index) {
      if (!this.canPlayerAct() || this.player.chargedThisTurn) return false;
      const id = this.player.hand.splice(index, 1)[0];
      this.player.charge.push({ id, tapped: false });
      this.player.chargedThisTurn = true;
      this.log(`${cards[id].name}をチャージ。`);
      await this.triggerChargeCore(this.player);
      this.notify();
      return true;
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

    async attackWithUnit(attackerIndex, targetIndex) {
      if (!this.canPlayerAct()) return;
      const unit = this.player.units[attackerIndex];
      if (!unit || unit.exhausted) return;

      const negated = await this.opponentMayReact({ trigger: "attack", source: cards[unit.id] });
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

      for (let i = 0; i < this.enemy.units.length; i += 1) {
        const unit = this.enemy.units[i];
        if (!unit || unit.exhausted || this.finished) continue;
        const target = this.cpu.chooseAttackTarget(this.player);
        const negated = await this.playerMayReact({ trigger: "attack", source: cards[unit.id] });
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

      const negated = card.effect ? await this.playerMayReact({ trigger: "effect", source: card }) : false;
      await this.resolvePlayedCard(this.enemy, this.player, card, negated, "enemy");
      this.checkGameEnd();
      this.notify();
    }

    async resolvePlayedCard(player, opponent, card, negated, side, preferredSlot = null) {
      const prefix = side === "enemy" ? "相手は" : "";
      if (card.type === "ユニット") {
        this.summonUnit(player, card.id, preferredSlot);
        this.log(`${prefix}${card.name}を召喚。`);
        if (!negated && card.effect) {
          await this.effects.resolve(card.effect, player, opponent, card);
          this.afterSummon(player, card.id);
        } else if (negated) {
          this.log(`${card.name}の召喚時効果は無効化された。`);
        } else {
          this.afterSummon(player, card.id);
        }
        return;
      }

      if (card.type === "コア") {
        this.placeCore(player, card.id, preferredSlot);
        this.log(`${prefix}${card.name}を発動。`);
        if (!negated && card.effect) await this.effects.resolve(card.effect, player, opponent, card);
        if (negated) this.log(`${card.name}の効果は無効化された。`);
        return;
      }

      if (card.type === "スペル") {
        this.log(`${prefix}${card.name}を発動。`);
        if (!negated && card.effect) await this.effects.resolve(card.effect, player, opponent, card);
        if (negated) this.log(`${card.name}は無効化された。`);
        player.grave.push(card.id);
      }
    }

    async playerMayReact(event) {
      const options = this.getUsableReactions(this.player, event.trigger);
      if (options.length === 0) return false;
      const choiceIndex = await this.options.requestReaction(options, event, this);
      if (choiceIndex === null || choiceIndex === undefined) return false;

      const option = options.find((entry) => entry.index === choiceIndex);
      if (!option) return false;
      const card = cards[option.id];
      if (!this.payCost(this.player, card.cost)) return false;
      this.player.reactions[option.index] = null;
      this.player.grave.push(option.id);
      this.log(`${card.name}を発動。`);
      this.applyReactionEffect(card, this.player, this.enemy);
      this.notify();
      return true;
    }

    async opponentMayReact(event) {
      const options = this.getUsableReactions(this.enemy, event.trigger);
      if (options.length === 0) return false;
      const option = options[0];
      const card = cards[option.id];
      if (!this.payCost(this.enemy, card.cost)) return false;
      this.enemy.reactions[option.index] = null;
      this.enemy.grave.push(option.id);
      this.log(`相手は${card.name}を発動。`);
      this.applyReactionEffect(card, this.enemy, this.player);
      this.notify();
      return true;
    }

    getUsableReactions(player, trigger) {
      return player.reactions
        .map((entry, index) => ({ id: reactionId(entry), index }))
        .filter((entry) => {
          if (!entry.id) return false;
          const card = cards[entry.id];
          return card.trigger === trigger && this.canPay(player, card.cost);
        });
    }

    applyReactionEffect(card, player, opponent) {
      if (card.effect === "negateAttackDamage") {
        const dealt = this.damage(opponent, 500, { log: false });
        this.log(`${card.name}で攻撃を止め、${dealt}ダメージ。`);
        return;
      }
      if (card.effect === "negateAttackUntap") {
        this.untapOneCharge(player);
        this.log(`${card.name}で攻撃を止めた。`);
        return;
      }
      if (card.effect === "negateEffectDraw") {
        if (this.countThemeInCharge(player, "星導") >= 3) this.drawCards(player, 1);
        this.log(`${card.name}で効果を止めた。`);
        return;
      }
      this.log(`${card.name}で止めた。`);
    }

    afterSummon(player, id) {
      const card = cards[id];
      if (card.name.includes("星導") && this.hasCore(player, "star_orbit") && !player.drewFromStarCore) {
        player.drewFromStarCore = true;
        this.drawCards(player, 1);
        this.log("星導の軌道環で1枚ドロー。");
      }
    }

    async triggerChargeCore(player) {
      if (this.hasCore(player, "generic_zero") && !player.shiftedThisTurn) {
        player.shiftedThisTurn = true;
        this.drawCards(player, 1);
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

    async specialSummonFromHand(player, predicate, choice = {}) {
      const slot = player.units.findIndex((unit) => !unit);
      if (slot === -1) return false;
      const index = await this.chooseHandIndex(player, predicate, {
        title: choice.title || "追加召喚",
        message: choice.message || "手札から追加召喚するカードを選んでください。",
      });
      if (index === -1) return false;
      const id = player.hand.splice(index, 1)[0];
      player.units[slot] = { id, exhausted: false, atkMod: 0 };
      this.log(`${cards[id].name}を追加召喚。`);
      this.afterSummon(player, id);
      return true;
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
      player.hand.push(id);
      this.log(`${cards[id].name}を墓地から戻した。`);
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

    untapOneCharge(player, predicate = () => true) {
      const charge = player.charge.find((entry) => entry.tapped && predicate(cards[entry.id]));
      if (!charge) return false;
      charge.tapped = false;
      return true;
    }

    countThemeInCharge(player, theme) {
      return player.charge.filter((entry) => cards[entry.id].name.includes(theme)).length;
    }

    completeTurn() {
      this.completedTurns += 1;
      if (this.completedTurns % 2 !== 0) return;
      this.environmentCycle += 1;
      this.naturalEnvironmentLevel = Math.min(ENVIRONMENT_MAX_LEVEL, 1 + Math.floor(this.environmentCycle / 2));
      this.changeEnvironment(this.naturalEnvironmentLevel);
    }

    changeEnvironment(level) {
      const candidates = [...this.playerEnvironmentDeck, ...this.enemyEnvironmentDeck]
        .filter((id) => cards[id]?.type === "環境" && cards[id].level === level);
      const pool = candidates.length ? candidates : Object.keys(starterEnvironmentDeck).filter((id) => cards[id]?.level === level);
      if (pool.length === 0) return false;
      const next = pool[Math.floor(Math.random() * pool.length)];
      this.currentEnvironment = next;
      this.log(`環境が${cards[next].name}（Lv${cards[next].level}）になった。`);
      this.applyEnvironmentEnter(cards[next]);
      return true;
    }

    applyEnvironmentEnter(card) {
      if (card.family === "星") {
        const drawAmount = card.level >= 3 ? 2 : 1;
        this.drawCards(this.player, drawAmount);
        this.drawCards(this.enemy, drawAmount);
        let untapped = false;
        if (card.level >= 2) {
          untapped = this.untapOneCharge(this.player) || untapped;
          untapped = this.untapOneCharge(this.enemy) || untapped;
        }
        this.log(`${card.name}で各プレイヤーは${drawAmount}枚ドロー。`);
        if (untapped) this.log(`${card.name}でチャージがアクティブになった。`);
        return;
      }

      if (card.family !== "風") return;
      if (card.level >= 3) {
        const playerRemoved = this.removeRevealedReaction(this.player) || this.revealReactions(this.player, 1);
        const enemyRemoved = this.removeRevealedReaction(this.enemy) || this.revealReactions(this.enemy, 1);
        if (playerRemoved || enemyRemoved) this.log(`${card.name}が表向きのリアクションを吹き飛ばした。`);
        return;
      }
      const amount = card.level >= 2 ? 2 : 1;
      if (this.revealReactions(this.player, amount) || this.revealReactions(this.enemy, amount)) {
        this.log(`${card.name}でセットリアクションがめくられた。`);
      }
    }

    revealReactions(player, amount) {
      let revealed = 0;
      for (let i = 0; i < player.reactions.length && revealed < amount; i += 1) {
        const entry = player.reactions[i];
        const id = reactionId(entry);
        if (!id || reactionRevealed(entry)) continue;
        player.reactions[i] = { id, revealed: true };
        revealed += 1;
      }
      return revealed > 0;
    }

    removeRevealedReaction(player) {
      const index = player.reactions.findIndex((entry) => reactionId(entry) && reactionRevealed(entry));
      if (index === -1) return false;
      const id = reactionId(player.reactions[index]);
      player.reactions[index] = null;
      player.grave.push(id);
      this.log(`${cards[id].name}は環境で墓地に送られた。`);
      return true;
    }

    controlsThemeUnit(player, theme) {
      return player.units.some((unit) => unit && cards[unit.id].name.includes(theme));
    }

    hasCore(player, id) {
      return player.cores.includes(id);
    }

    destroyBestUnit(player) {
      const target = player.units
        .map((unit, index) => ({ unit, index }))
        .filter((entry) => entry.unit)
        .sort((a, b) => this.getUnitAtk(player, b.unit) - this.getUnitAtk(player, a.unit))[0];
      if (!target) return false;
      this.destroyUnit(player, target.index);
      return true;
    }

    exhaustBestUnit(player) {
      const target = player.units
        .map((unit, index) => ({ unit, index }))
        .filter((entry) => entry.unit && !entry.unit.exhausted)
        .sort((a, b) => this.getUnitAtk(player, b.unit) - this.getUnitAtk(player, a.unit))[0];
      if (!target) return false;
      target.unit.exhausted = true;
      this.log(`${cards[target.unit.id].name}を行動済みにした。`);
      return true;
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
      const reduction = this.getEnvironmentDamageReduction();
      const dealt = Math.max(0, amount - reduction);
      player.lp = Math.max(0, player.lp - dealt);
      if (options.log !== false) {
        const reduced = amount - dealt;
        if (reduced > 0) this.log(`${cards[this.currentEnvironment].name}で${reduced}ダメージ軽減。`);
        this.log(`${player.name}に${dealt}ダメージ。`);
      }
      return dealt;
    }

    getUnitAtk(player, unit) {
      const card = cards[unit.id];
      let atk = card.atk + (unit.atkMod || 0);
      if (card.name.includes("星導の衛士カイ")) atk += player.cores.filter(Boolean).length * 300;
      if (card.name.includes("黒機") && this.hasCore(player, "black_tower")) atk += 200;
      atk += this.getEnvironmentAtkMod();
      return atk;
    }

    getEnvironmentAtkMod() {
      const environment = cards[this.currentEnvironment];
      if (!environment || environment.type !== "環境") return 0;
      if (environment.family === "晴れ") return environment.level * 100;
      if (environment.family === "雪") return environment.level * -100;
      return 0;
    }

    getEnvironmentDamageReduction() {
      const environment = cards[this.currentEnvironment];
      if (!environment || environment.type !== "環境") return 0;
      if (environment.family === "雨") return environment.level * 100;
      return 0;
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

  function preferredOpenSlot(list, preferredSlot) {
    const slot = Number(preferredSlot);
    if (Number.isInteger(slot) && slot >= 0 && slot < list.length && !list[slot]) return slot;
    return list.findIndex((entry) => !entry);
  }

  function expandCounts(counts) {
    return Object.entries(counts).flatMap(([id, count]) => Array(count).fill(id));
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
