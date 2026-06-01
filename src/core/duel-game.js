(function () {
  "use strict";

  const {
    MAX_LP,
    UNIT_ZONES,
    MAX_AP,
    MAX_DRIVE,
    cards,
    EffectResolver,
    CpuController,
  } = window.Chrono;

  const CPU_THINK_DELAY_MS = 480;
  const CPU_ACTION_DELAY_MS = 260;

  class Duelist {
    constructor(name, deck, driveDeck = []) {
      this.name = name;
      this.lp = MAX_LP;
      this.deck = shuffle(deck);
      this.driveDeck = driveDeck.slice();
      this.driveUsed = [];
      this.hand = [];
      this.grave = [];
      this.abyss = [];
      this.charge = [];
      this.units = Array(UNIT_ZONES).fill(null);
      this.cores = [];
      this.reactions = [];
      this.driveGauge = 0;
      this.drivePlayedThisTurn = false;
      this.attacksAllocatedThisTurn = 0;
    }

    refreshTurn() {
      this.charge.forEach((entry, index) => {
        entry.tapped = index >= MAX_AP;
      });
      this.units.forEach((entry) => {
        if (!entry) return;
        const card = cards[entry.id];
        entry.defenseTaken = 0;
        entry.activatedThisTurn = false;
        if (isAttacker(card)) {
          entry.remainingAttacks = Number(card.attack || 0);
          entry.exhausted = entry.remainingAttacks <= 0;
        } else {
          entry.remainingAttacks = 0;
          entry.exhausted = true;
        }
      });
      this.drivePlayedThisTurn = false;
      this.attacksAllocatedThisTurn = 0;
    }

    snapshot() {
      return clonePlain({
        name: this.name,
        lp: this.lp,
        deck: this.deck,
        driveDeck: this.driveDeck,
        driveUsed: this.driveUsed,
        hand: this.hand,
        grave: this.grave,
        abyss: this.abyss,
        charge: this.charge,
        units: this.units,
        cores: this.cores,
        reactions: this.reactions,
        driveGauge: this.driveGauge,
        drivePlayedThisTurn: this.drivePlayedThisTurn,
        attacksAllocatedThisTurn: this.attacksAllocatedThisTurn,
      });
    }

    static fromSnapshot(snapshot = {}) {
      const duelist = new Duelist(snapshot.name || "Player", [], []);
      duelist.lp = Number.isFinite(snapshot.lp) ? snapshot.lp : MAX_LP;
      duelist.deck = Array.isArray(snapshot.deck) ? clonePlain(snapshot.deck) : [];
      duelist.driveDeck = Array.isArray(snapshot.driveDeck) ? clonePlain(snapshot.driveDeck) : [];
      duelist.driveUsed = Array.isArray(snapshot.driveUsed) ? clonePlain(snapshot.driveUsed) : [];
      duelist.hand = Array.isArray(snapshot.hand) ? clonePlain(snapshot.hand) : [];
      duelist.grave = Array.isArray(snapshot.grave) ? clonePlain(snapshot.grave) : [];
      duelist.abyss = Array.isArray(snapshot.abyss) ? clonePlain(snapshot.abyss) : [];
      duelist.charge = Array.isArray(snapshot.charge) ? clonePlain(snapshot.charge) : [];
      duelist.units = normalizeZone(snapshot.units, UNIT_ZONES);
      duelist.cores = Array.isArray(snapshot.cores) ? clonePlain(snapshot.cores) : [];
      duelist.reactions = Array.isArray(snapshot.reactions) ? clonePlain(snapshot.reactions) : [];
      duelist.driveGauge = clampNumber(snapshot.driveGauge, 0, MAX_DRIVE);
      duelist.drivePlayedThisTurn = Boolean(snapshot.drivePlayedThisTurn);
      duelist.attacksAllocatedThisTurn = Math.max(0, Number(snapshot.attacksAllocatedThisTurn || 0));
      return duelist;
    }
  }

  class DuelGame {
    static fromSnapshot(snapshot = {}, options = {}) {
      const game = new DuelGame({
        playerDeck: [],
        playerDriveDeck: [],
        cpuDeck: [],
        cpuDriveDeck: [],
        ...options,
      });
      game.turn = Math.max(1, Number(snapshot.turn) || 1);
      game.completedTurns = Math.max(0, Number(snapshot.completedTurns) || 0);
      game.active = snapshot.active === "enemy" ? "enemy" : "player";
      game.firstActive = snapshot.firstActive === "enemy" ? "enemy" : "player";
      game.finished = Boolean(snapshot.finished);
      game.busy = false;
      game.status = snapshot.status || "duel";
      game.player = Duelist.fromSnapshot(snapshot.player);
      game.enemy = Duelist.fromSnapshot(snapshot.enemy);
      game.logItems = Array.isArray(snapshot.logItems) ? snapshot.logItems.slice(-60) : [];
      game.notify();
      return game;
    }

    constructor(options = {}) {
      this.options = options;
      this.player = new Duelist(options.playerName || "Player", options.playerDeck || [], options.playerDriveDeck || []);
      this.enemy = new Duelist(options.cpuName || "CPU", options.cpuDeck || [], options.cpuDriveDeck || []);
      this.turn = 1;
      this.completedTurns = 0;
      this.active = "player";
      this.firstActive = "player";
      this.finished = false;
      this.busy = false;
      this.cpuThinking = false;
      this.pendingChoice = null;
      this.waitingChoice = null;
      this.status = "setup";
      this.isOnline = Boolean(options.isOnline);
      this.logItems = [];
      this.effectResolver = new EffectResolver(this);
      this.cpu = new CpuController(this, { aiLevel: options.cpuAiLevel || 3 });
      this.delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 0;
      this.cpuThinkDelayMs = Number.isFinite(options.cpuThinkDelayMs) ? options.cpuThinkDelayMs : CPU_THINK_DELAY_MS;
      this.cpuActionDelayMs = Number.isFinite(options.cpuActionDelayMs) ? options.cpuActionDelayMs : CPU_ACTION_DELAY_MS;
      this.disposed = false;
    }

    start() {
      this.status = "duel";
      this.active = this.resolveFirstActive();
      this.firstActive = this.active;
      this.drawCards(this.player, 5, { silent: true });
      this.drawCards(this.enemy, 5, { silent: true });
      this.beginTurn(this.currentPlayer(), { opening: true });
      this.log(`${this.currentPlayer().name}が先攻。`);
      this.notify();
      if (this.active === "enemy") this.runCpuTurn();
    }

    dispose() {
      this.disposed = true;
    }

    snapshot() {
      return clonePlain({
        turn: this.turn,
        completedTurns: this.completedTurns,
        active: this.active,
        firstActive: this.firstActive,
        finished: this.finished,
        status: this.status,
        logItems: this.logItems,
        player: this.player.snapshot(),
        enemy: this.enemy.snapshot(),
      });
    }

    resolveFirstActive() {
      const requested = this.options.firstActive || "random";
      if (requested === "player" || requested === "enemy") return requested;
      return Math.random() < 0.5 ? "player" : "enemy";
    }

    currentPlayer() {
      return this.active === "enemy" ? this.enemy : this.player;
    }

    opponentOf(player) {
      return player === this.player ? this.enemy : this.player;
    }

    sideOf(player) {
      return player === this.enemy ? "enemy" : "player";
    }

    canPlayerAct() {
      return !this.finished && !this.busy && this.active === "player" && !this.pendingChoice && !this.waitingChoice;
    }

    canActFor(player) {
      return !this.finished && this.currentPlayer() === player;
    }

    beginTurn(player, options = {}) {
      if (this.finished) return;
      player.refreshTurn();
      if (!options.opening) {
        this.drawCards(player, 1);
      }
      this.autoChargeTop(player);
      player.refreshTurn();
      const gained = this.boardDriveValue(player);
      if (gained > 0) this.addDriveGauge(player, gained, { silent: true });
      this.log(`${player.name}: ドライブ +${gained} (${player.driveGauge}/${MAX_DRIVE})`);
      this.checkGameEnd();
    }

    completeTurn() {
      this.completedTurns += 1;
    }

    endPlayerTurn() {
      if (!this.canPlayerAct()) return false;
      this.completeTurn();
      this.active = "enemy";
      this.beginTurn(this.enemy);
      this.notify();
      this.runCpuTurn();
      return true;
    }

    async runCpuTurn() {
      if (this.finished || this.disposed || this.active !== "enemy") return;
      this.busy = true;
      this.cpuThinking = true;
      this.notify();
      await this.delay(this.cpuThinkDelayMs);
      this.cpuThinking = false;

      for (let i = 0; i < 8 && !this.finished; i += 1) {
        const move = this.cpu.choosePlay(this.enemy, this.player);
        if (!move) break;
        if (await this.playFromHandFor(this.enemy, move.index) === false) break;
        await this.delay(this.cpuActionDelayMs);
      }

      for (let i = 0; i < 3 && !this.finished; i += 1) {
        const index = this.cpu.chooseActivation(this.enemy);
        if (index < 0) break;
        if (await this.activateFieldCard(this.enemy, index) === false) break;
        await this.delay(this.cpuActionDelayMs);
      }

      if (!this.finished) {
        const driveId = this.cpu.chooseDriveCard(this.enemy, this.player);
        if (driveId) {
          await this.playDriveCardFor(this.enemy, driveId);
          await this.delay(this.cpuActionDelayMs);
        }
      }

      for (let pass = 0; pass < 2 && !this.finished; pass += 1) {
        for (let i = 0; i < this.enemy.units.length && !this.finished; i += 1) {
          const entry = this.enemy.units[i];
          if (!entry || Number(entry.remainingAttacks || 0) <= 0) continue;
          const target = this.cpu.chooseAttackTarget(entry, this.player, this.enemy);
          if (target === undefined) continue;
          const amount = this.cpu.chooseAttackAmount(entry, target, this.player);
          if (await this.attackWithUnitFor(this.enemy, i, target, amount) !== false) {
            await this.delay(this.cpuActionDelayMs);
          }
        }
      }

      if (!this.finished) {
        this.completeTurn();
        this.active = "player";
        this.turn += 1;
        this.busy = false;
        this.beginTurn(this.player);
        this.notify();
      } else {
        this.busy = false;
        this.notify();
      }
    }

    drawCards(player, count = 1, options = {}) {
      for (let i = 0; i < count; i += 1) {
        if (player.deck.length === 0) {
          this.damage(player, 1, { reason: "deckout" });
          continue;
        }
        player.hand.push(player.deck.shift());
      }
      if (!options.silent) this.notify();
    }

    autoChargeTop(player) {
      if (player.deck.length === 0) return false;
      const id = player.deck.shift();
      player.charge.push({ id, tapped: false });
      this.log(`${player.name}: ${cards[id]?.name || id}をチャージ。`);
      return true;
    }

    activeChargeCount(player) {
      return player.charge.filter((entry) => !entry.tapped).length;
    }

    canPay(player, cost = 0) {
      return this.activeChargeCount(player) >= Math.max(0, Number(cost || 0));
    }

    payCost(player, cost = 0) {
      let remaining = Math.max(0, Number(cost || 0));
      if (!this.canPay(player, remaining)) return false;
      player.charge.forEach((entry) => {
        if (remaining <= 0 || entry.tapped) return;
        entry.tapped = true;
        remaining -= 1;
      });
      return true;
    }

    canPlayCard(player, card) {
      if (!this.canActFor(player) || !card || isDriveCard(card)) return false;
      if (card.type === "ユニット" || card.type === "コア") return this.openFieldIndex(player) >= 0;
      return card.type === "スペル";
    }

    async playFromHand(index, preferredSlot = null) {
      return this.playFromHandFor(this.player, index, preferredSlot);
    }

    async playFromHandFor(player, index, preferredSlot = null) {
      if (!this.canActFor(player)) return false;
      const id = player.hand[index];
      const card = cards[id];
      if (!card || !this.canPlayCard(player, card) || !this.canPay(player, card.cost || 0)) return false;
      if (!this.payCost(player, card.cost || 0)) return false;
      player.hand.splice(index, 1);
      const opponent = this.opponentOf(player);
      await this.resolvePlayedCard(player, opponent, card, preferredSlot);
      this.checkGameEnd();
      this.notify();
      return true;
    }

    async resolvePlayedCard(player, opponent, card, preferredSlot = null) {
      this.log(`${player.name}: ${card.name}を使用。`);
      if (card.type === "ユニット" || card.type === "コア") {
        this.summonToField(player, card, preferredSlot);
      }
      await this.resolveCardEffect(card, player, opponent);
      if (card.type === "スペル") player.grave.push(card.id);
    }

    summonToField(player, card, preferredSlot = null) {
      const index = this.openFieldIndex(player, preferredSlot);
      if (index < 0) return false;
      player.units[index] = createFieldEntry(card);
      return true;
    }

    chargeFromHand() {
      this.log("このルールでは手札からの通常チャージは行いません。");
      this.notify();
      return false;
    }

    canSetReaction() {
      return false;
    }

    setReaction() {
      return false;
    }

    usableDriveCards(player) {
      if (!this.canActFor(player) || player.drivePlayedThisTurn) return [];
      return player.driveDeck.filter((id) => this.canUseDriveCard(player, cards[id]));
    }

    canUseDriveCard(player, card) {
      if (!card || !isDriveCard(card) || card.driveKind !== "unit") return false;
      if (!this.canActFor(player) || player.drivePlayedThisTurn) return false;
      if (this.openFieldIndex(player) < 0) return false;
      return player.driveGauge >= this.driveCost(card);
    }

    async playDriveCard(id, preferredSlot = null) {
      return this.playDriveCardFor(this.player, id, preferredSlot);
    }

    async playDriveCardFor(player, id, preferredSlot = null) {
      const card = cards[id];
      if (!this.canUseDriveCard(player, card)) return false;
      const deckIndex = player.driveDeck.indexOf(id);
      if (deckIndex < 0) return false;
      player.driveGauge = Math.max(0, player.driveGauge - this.driveCost(card));
      player.drivePlayedThisTurn = true;
      player.driveDeck.splice(deckIndex, 1);
      player.driveUsed.push(id);
      this.log(`${player.name}: ${card.name}をドライブ。`);
      this.summonToField(player, card, preferredSlot);
      await this.resolveCardEffect(card, player, this.opponentOf(player));
      this.checkGameEnd();
      this.notify();
      return true;
    }

    driveCost(card) {
      return Math.max(0, Number(card?.driveCost ?? card?.cost ?? 0));
    }

    canAttack(player) {
      return this.canActFor(player);
    }

    canAttackAllocation(player, attackerIndex, targetIndex, amount = 1) {
      if (!this.canAttack(player)) return false;
      const attacker = player.units[attackerIndex];
      const attackerCard = cards[attacker?.id];
      if (!attacker || !isAttacker(attackerCard)) return false;
      const safeAmount = Math.max(1, Math.floor(Number(amount) || 1));
      if (Number(attacker.remainingAttacks || 0) < safeAmount) return false;
      const defender = this.opponentOf(player);
      const requiredDefense = this.remainingDefense(defender);
      if (targetIndex === null || targetIndex === undefined) return requiredDefense <= 0;
      const target = defender.units[targetIndex];
      const targetCard = cards[target?.id];
      if (!target || !targetCard) return false;
      const targetDefenseRemaining = Math.max(0, Number(targetCard.defense || 0) - Number(target.defenseTaken || 0));
      if (requiredDefense > 0 && targetDefenseRemaining <= 0) return false;
      return true;
    }

    async attackWithUnit(attackerIndex, targetIndex = null, amount = 1) {
      return this.attackWithUnitFor(this.player, attackerIndex, targetIndex, amount);
    }

    async attackWithUnitFor(player, attackerIndex, targetIndex = null, amount = 1) {
      const safeAmount = Math.max(1, Math.floor(Number(amount) || 1));
      if (!this.canAttackAllocation(player, attackerIndex, targetIndex, safeAmount)) return false;
      const attacker = player.units[attackerIndex];
      const attackerCard = cards[attacker.id];
      const defender = this.opponentOf(player);
      attacker.remainingAttacks -= safeAmount;
      attacker.exhausted = attacker.remainingAttacks <= 0;
      player.attacksAllocatedThisTurn += safeAmount;

      if (targetIndex === null || targetIndex === undefined) {
        this.damage(defender, safeAmount);
        this.log(`${attackerCard.name}がリーダーへ${safeAmount}回攻撃。`);
      } else {
        const target = defender.units[targetIndex];
        const targetCard = cards[target?.id];
        if (targetCard?.defense) target.defenseTaken = Number(target.defenseTaken || 0) + safeAmount;
        this.damageBoardEntry(defender, targetIndex, safeAmount);
        this.log(`${attackerCard.name}が${targetCard?.name || "対象"}へ${safeAmount}回攻撃。`);
      }
      this.checkGameEnd();
      this.notify();
      return true;
    }

    attackTargets(player, attackerIndex, amount = 1) {
      const defender = this.opponentOf(player);
      const targets = defender.units
        .map((entry, index) => ({ entry, index, card: cards[entry?.id] }))
        .filter((item) => item.entry && this.canAttackAllocation(player, attackerIndex, item.index, amount));
      if (this.canAttackAllocation(player, attackerIndex, null, amount)) {
        targets.unshift({ entry: null, index: null, card: null });
      }
      return targets;
    }

    remainingDefense(player) {
      return player.units.reduce((sum, entry) => {
        if (!entry) return sum;
        const card = cards[entry.id];
        const defense = Number(card?.defense || 0);
        return sum + Math.max(0, defense - Number(entry.defenseTaken || 0));
      }, 0);
    }

    damageBoardEntry(player, index, amount = 1) {
      const entry = player.units[index];
      const card = cards[entry?.id];
      if (!entry || !card) return false;
      entry.durability = Number(entry.durability ?? card.durability ?? 1) - Math.max(1, Number(amount || 1));
      this.options.onSoundEvent?.({ type: "damage" });
      if (entry.durability <= 0) {
        player.units[index] = null;
        player.grave.push(card.id);
        this.log(`${card.name}が破壊された。`);
        this.options.onSoundEvent?.({ type: "destroy" });
      }
      return true;
    }

    damage(player, amount = 1) {
      const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
      if (safeAmount <= 0) return;
      player.lp = Math.max(0, player.lp - safeAmount);
      this.options.onSoundEvent?.({ type: "damage" });
    }

    heal(player, amount = 1) {
      player.lp = Math.min(MAX_LP, player.lp + Math.max(0, Math.floor(Number(amount) || 0)));
      this.log(`${player.name}: ライフ +${amount}`);
    }

    addDriveGauge(player, amount = 1, options = {}) {
      const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
      player.driveGauge = Math.min(MAX_DRIVE, player.driveGauge + safeAmount);
      if (!options.silent && safeAmount > 0) this.log(`${player.name}: ドライブ +${safeAmount}`);
    }

    boardDriveValue(player) {
      return player.units.reduce((sum, entry) => sum + Number(cards[entry?.id]?.drive || 0), 0);
    }

    async resolveCardEffect(card, player, opponent) {
      if (!card?.effect) return false;
      this.showActivation(card, player, "effect");
      return this.effectResolver.resolve(card.effect, player, opponent, card);
    }

    canActivateFieldCard(player, index) {
      if (!this.canActFor(player)) return false;
      const entry = player.units[index];
      const card = cards[entry?.id];
      const activate = card?.activate;
      if (!entry || !activate || entry.activatedThisTurn) return false;
      if (!this.canPay(player, activate.ap || 0)) return false;
      return player.hand.length >= Number(activate.discard || 0);
    }

    async activateFieldCard(player, index) {
      if (!this.canActivateFieldCard(player, index)) return false;
      const entry = player.units[index];
      const card = cards[entry.id];
      const activate = card.activate;
      if (!this.payCost(player, activate.ap || 0)) return false;
      const discard = Math.max(0, Number(activate.discard || 0));
      for (let i = 0; i < discard; i += 1) {
        const discarded = player.hand.shift();
        if (discarded) player.grave.push(discarded);
      }
      entry.activatedThisTurn = true;
      this.log(`${player.name}: ${card.name}を起動。`);
      this.showActivation(card, player, "activate");
      await this.effectResolver.resolve(activate.effect, player, this.opponentOf(player), card);
      this.checkGameEnd();
      this.notify();
      return true;
    }

    canActivateDriveCore(player, coreIndex) {
      return this.canActivateFieldCard(player, coreIndex);
    }

    activateDriveCore(coreIndex) {
      return this.activateFieldCard(this.player, coreIndex);
    }

    canActivateSpellDriveGraveEffect() {
      return false;
    }

    activateSpellDriveGraveEffect() {
      return false;
    }

    exchangeChargeWithHand(player, maxCost = Infinity) {
      if (!player.hand.length || !player.charge.length) return false;
      const chargeIndex = player.charge.findIndex((entry) => {
        const card = cards[entry?.id];
        return card && Number(card.cost || 0) <= maxCost && !isDriveCard(card);
      });
      if (chargeIndex < 0) return false;
      const handIndex = player.hand.findIndex((id) => cards[id] && !isDriveCard(cards[id]));
      if (handIndex < 0) return false;
      const chargeEntry = player.charge[chargeIndex];
      const handId = player.hand[handIndex];
      player.hand[handIndex] = chargeEntry.id;
      player.charge[chargeIndex] = { id: handId, tapped: Boolean(chargeEntry.tapped) };
      this.log(`${player.name}: チャージの${cards[player.hand[handIndex]]?.name || "カード"}を回収。`);
      return true;
    }

    openFieldIndex(player, preferredSlot = null) {
      if (Number.isInteger(preferredSlot) && preferredSlot >= 0 && preferredSlot < player.units.length && !player.units[preferredSlot]) {
        return preferredSlot;
      }
      return player.units.findIndex((entry) => !entry);
    }

    getUnitAtk(_player, entry) {
      return Number(cards[entry?.id]?.attack || 0);
    }

    showActivation(card, player, kind) {
      this.options.showActivation?.({ id: card.id, owner: this.sideOf(player), kind });
    }

    log(message) {
      if (!message) return;
      this.logItems.push(String(message));
      if (this.logItems.length > 60) this.logItems.shift();
    }

    checkGameEnd() {
      if (this.finished) return true;
      if (this.player.lp > 0 && this.enemy.lp > 0) return false;
      this.finished = true;
      this.busy = false;
      this.cpuThinking = false;
      const won = this.enemy.lp <= 0 && this.player.lp > 0;
      this.log(won ? "勝利！" : this.player.lp <= 0 && this.enemy.lp <= 0 ? "引き分け。" : "敗北。");
      this.options.onResult?.(won, this);
      this.notify();
      return true;
    }

    notify() {
      if (this.disposed) return;
      this.options.onChange?.(this);
    }

    delay(ms) {
      const safeMs = Math.max(0, Number(ms || 0));
      if (safeMs <= 0) return Promise.resolve();
      return new Promise((resolve) => window.setTimeout(resolve, safeMs));
    }
  }

  function createFieldEntry(card) {
    const attacker = isAttacker(card);
    const openingAttacks = attacker ? Math.min(Number(card.attack || 0), Number(card.accelerate || 0)) : 0;
    return {
      id: card.id,
      durability: Number(card.durability || 1),
      remainingAttacks: openingAttacks,
      defenseTaken: 0,
      activatedThisTurn: false,
      exhausted: openingAttacks <= 0,
    };
  }

  function isAttacker(card) {
    return card?.type === "ユニット" || card?.type === "ドライブユニット";
  }

  function isDriveCard(card) {
    return Boolean(card?.driveKind || card?.type === "ドライブユニット");
  }

  function normalizeZone(source, length) {
    const list = Array.isArray(source) ? source : [];
    return Array.from({ length }, (_, index) => list[index] ? clonePlain(list[index]) : null);
  }

  function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function shuffle(list) {
    const result = list.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function clonePlain(value) {
    return JSON.parse(JSON.stringify(value));
  }

  window.Chrono.Duelist = Duelist;
  window.Chrono.DuelGame = DuelGame;
  window.Chrono.shuffle = shuffle;
})();
