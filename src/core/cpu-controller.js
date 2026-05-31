(function () {
  "use strict";

  const { cards } = window.Chrono;

  class CpuController {
    constructor(game) {
      this.game = game;
    }

    shouldCharge(player = this.game.enemy, opponent = this.game.opponentOf?.(player)) {
      if (!player || player.chargedThisTurn || player.hand.length === 0) return false;
      if (!player.hand.some((id) => cards[id])) return false;
      if (player.hand.length === 1 && this.canUseOnlyHandCard(player.hand[0], player)) return false;
      if (this.canPresentLethal(player, opponent)) return false;
      const playable = player.hand
        .map((id) => cards[id])
        .filter((card) => card && this.game.canPlayCard(player, card) && this.game.canPay(player, card.cost));
      if (player.charge.filter((entry) => !entry.tapped).length >= 4 && playable.length >= 2) return false;
      return true;
    }

    canUseOnlyHandCard(id, player = this.game.enemy) {
      const card = cards[id];
      if (!card) return false;
      if (card.type === "リアクション") return this.game.canSetReaction(player);
      return this.game.canPlayCard(player, card) && this.game.canPay(player, card.cost);
    }

    chooseChargeIndex(player = this.game.enemy) {
      if (!player) return -1;
      const fallbackIndex = player.hand.findIndex((id) => cards[id]);
      if (fallbackIndex === -1) return -1;
      return player.hand
        .map((id, index) => ({ id, index, card: cards[id] }))
        .filter((entry) => entry.card)
        .sort((a, b) => this.chargeCandidateScore(a.card, player) - this.chargeCandidateScore(b.card, player))[0].index;
    }

    setNextReaction(player = this.game.enemy) {
      if (!player || !this.game.canSetReaction(player)) return false;
      const candidate = player.hand
        .map((id, index) => ({ id, index, card: cards[id] }))
        .filter((entry) => entry.card?.type === "リアクション")
        .sort((a, b) => this.reactionScore(b.card, player) - this.reactionScore(a.card, player))[0];
      const index = candidate?.index ?? -1;
      if (index === -1) return false;
      const slot = player.reactions.findIndex((card) => !card);
      if (slot === -1) return false;
      const id = player.hand.splice(index, 1)[0];
      player.reactions[slot] = { id, revealed: false };
      this.game.log(`${player === this.game.enemy ? "相手は" : ""}リアクションをセット。`);
      return true;
    }

    setReactions(player = this.game.enemy) {
      let count = 0;
      while (this.setNextReaction(player)) {
        count += 1;
      }
      return count;
    }

    choosePlay(player = this.game.enemy, opponent = this.game.opponentOf?.(player)) {
      return player.hand
        .map((id, index) => ({ id, index, card: cards[id] }))
        .filter((entry) => entry.card && this.game.canPlayCard(player, entry.card) && this.game.canPay(player, entry.card.cost))
        .map((entry) => ({ ...entry, score: this.playScore(entry.card, player, opponent) }))
        .sort((a, b) => b.score - a.score || b.card.cost - a.card.cost)[0] || null;
    }

    chooseDriveCard(player = this.game.enemy, opponent = this.game.opponentOf?.(player), trigger = null) {
      return this.game.usableDriveCards(player, trigger)
        .map((id) => ({ id, card: cards[id] }))
        .filter((entry) => entry.card)
        .map((entry) => ({ ...entry, score: this.driveScore(entry.card, player, opponent) }))
        .filter((entry) => trigger || entry.score >= this.driveUseThreshold(player, opponent))
        .sort((a, b) => b.score - a.score)[0]?.id || null;
    }

    chooseAttackTarget(attacker, defender, attackerPlayer = this.game.enemy) {
      const attackerAtk = this.game.getUnitAtk(attackerPlayer, attacker);
      if (defender.lp <= attackerAtk) return null;
      const targets = defender.units
        .map((unit, index) => ({ unit, index }))
        .filter((entry) => entry.unit)
        .map((entry) => ({ ...entry, atk: this.game.getUnitAtk(defender, entry.unit) }))
        .filter((entry) => entry.atk <= attackerAtk)
        .sort((a, b) => this.attackTargetScore(b, attackerAtk) - this.attackTargetScore(a, attackerAtk));
      if (targets.length > 0) return targets[0].index;
      return defender.units.some((unit) => unit) ? undefined : null;
    }

    chooseReactionOption(player, options = [], event = {}) {
      return options
        .slice()
        .sort((a, b) => this.reactionOptionScore(b, player, event) - this.reactionOptionScore(a, player, event))[0]?.index ?? null;
    }

    chooseCardIndex(player, zone, candidates = []) {
      const scored = candidates
        .map((entry) => ({ ...entry, card: cards[entry.id] }))
        .filter((entry) => entry.card)
        .sort((a, b) => this.choiceScore(b.card, player, zone) - this.choiceScore(a.card, player, zone));
      return scored[0]?.index ?? -1;
    }

    chargeCandidateScore(card, player) {
      const opponent = this.game.opponentOf?.(player);
      let score = this.keepScore(card, player);
      if (card.type === "リアクション" && this.game.canSetReaction(player) && player.reactions.filter(Boolean).length < 1) score += 14;
      if (this.game.canPlayCard(player, card) && this.game.canPay(player, card.cost)) score += 18;
      const duplicateCount = player.hand.filter((id) => id === card.id).length;
      if (duplicateCount > 1) score -= 8;
      if ((card.cost || 0) > player.charge.length + 2) score -= 6;
      score += this.themePlanScore(card, player, opponent);
      return score;
    }

    keepScore(card, player) {
      const opponent = this.game.opponentOf?.(player);
      let score = 20;
      if (card.type === "コア") score += player.cores.some((core) => !core) ? 18 : 2;
      if (card.type === "ユニット") score += player.units.some((unit) => !unit) ? 12 : 1;
      if (card.type === "スペル") score += card.effect ? 10 : 4;
      if (card.type === "リアクション") score += this.game.canSetReaction(player) ? 10 : -2;
      if (card.effect) score += 8;
      if (card.atk) score += Math.min(12, card.atk / 250);
      score -= Math.max(0, (card.cost || 0) - player.charge.length) * 3;
      score += this.themePlanScore(card, player, opponent);
      return score;
    }

    playScore(card, player, opponent) {
      let score = this.keepScore(card, player) + 10;
      const incoming = this.incomingDamage(opponent);
      if (card.type === "コア") score += player.cores.filter(Boolean).length === 0 ? 16 : 6;
      if (card.type === "ユニット") {
        const enemyBest = Math.max(0, ...opponent.units.filter(Boolean).map((unit) => this.game.getUnitAtk(opponent, unit)));
        if ((card.atk || 0) >= enemyBest) score += 10;
        if (opponent.lp <= (card.atk || 0)) score += 18;
        if (incoming >= player.lp && player.units.filter(Boolean).length === 0) score += 18;
      }
      if (card.type === "スペル" && opponent.units.some((unit) => unit)) score += 5;
      if (this.canPresentLethal(player, opponent, card)) score += 40;
      score -= (card.cost || 0) * 1.5;
      return score;
    }

    driveScore(card, player, opponent) {
      let score = 30 + (card.cost || 0) * 2;
      const incoming = this.incomingDamage(opponent);
      if (card.driveKind === "unit") score += player.units.some((unit) => !unit) ? 20 : 4;
      if (card.driveKind === "core") score += player.cores.some((core) => !core) ? 18 : 3;
      if (card.driveKind === "spell") score += opponent.units.some((unit) => unit) ? 14 : 8;
      if (card.driveKind === "reaction") score += 12;
      if (card.effect || card.driveEffect) score += 8;
      if (card.atk) score += Math.min(16, card.atk / 250);
      if (incoming >= player.lp) score += 18;
      if (this.canPresentLethal(player, opponent, card)) score += 30;
      score += this.themePlanScore(card, player, opponent);
      return score;
    }

    reactionScore(card, player) {
      let score = 18 + (card.cost || 0) * 2;
      if (card.trigger === "effect") score += 5;
      if (player.reactions.filter(Boolean).length === 0) score += 6;
      if (card.effect) score += 6;
      return score;
    }

    reactionOptionScore(option, player, event = {}) {
      const card = cards[option.id];
      if (!card) return 0;
      let score = this.driveScore(card, player, this.game.opponentOf?.(player)) + this.reactionScore(card, player);
      if (event.trigger === "attack" && card.trigger === "attack") score += 12;
      if (event.trigger === "effect" && card.trigger === "effect") score += 12;
      if (option.drive) score += 8;
      return score;
    }

    choiceScore(card, player, zone) {
      if (zone === "hand") return -this.keepScore(card, player);
      if (zone === "grave") return this.keepScore(card, player) + (card.driveKind ? 8 : 0);
      if (zone === "deck") return this.keepScore(card, player) + (card.effect ? 8 : 0);
      return this.keepScore(card, player);
    }

    driveUseThreshold(player, opponent) {
      if (this.canPresentLethal(player, opponent) || this.incomingDamage(opponent) >= player.lp) return 28;
      if (player.driveDeck.length <= 3) return 48;
      return 58;
    }

    incomingDamage(player) {
      if (!player) return 0;
      return player.units
        .filter(Boolean)
        .reduce((sum, unit) => sum + this.game.getUnitAtk(player, unit), 0);
    }

    readyDamage(player) {
      if (!player) return 0;
      return player.units
        .filter((unit) => unit && !unit.exhausted)
        .reduce((sum, unit) => sum + this.game.getUnitAtk(player, unit), 0);
    }

    canPresentLethal(player, opponent, addedCard = null) {
      if (!opponent) return false;
      const addedAtk = addedCard?.type === "ユニット" || addedCard?.driveKind === "unit" ? (addedCard.atk || 0) : 0;
      return this.readyDamage(player) + addedAtk >= opponent.lp;
    }

    attackTargetScore(target, attackerAtk) {
      const card = cards[target.unit?.id];
      return target.atk / 10 + Math.max(0, attackerAtk - target.atk) / 20 + (card?.effect ? 16 : 0) + (card?.cost || 0) * 4;
    }

    themePlanScore(card, player, opponent) {
      const theme = card?.theme || "";
      if (!theme) return 0;
      let score = 0;
      if (theme === "星導") {
        if (card.type === "コア" && !player.cores.some((id) => cards[id]?.theme === theme)) score += 12;
        if (player.charge.filter((entry) => cards[entry.id]?.theme === theme).length >= 2) score += 5;
      }
      if (theme === "黒機") {
        if (opponent?.units?.some((unit) => unit) && card.type === "スペル") score += 8;
        if (card.type === "ユニット" && player.cores.includes("black_tower")) score += 7;
      }
      if (theme === "断刃") {
        if (opponent?.units?.some((unit) => unit?.exhausted)) score += 10;
        if (card.type === "リアクション" && player.charge.filter((entry) => cards[entry.id]?.theme === theme).length >= 2) score += 6;
      }
      if (theme === "電脳") {
        if (card.type === "リアクション" || card.type === "スペル") score += 7;
        if (opponent?.reactions?.some((entry) => entry)) score += 5;
      }
      if (theme === "双彩") {
        const ids = new Set(player.units.filter(Boolean).map((unit) => unit.id));
        const pairs = [["sosai_hikari", "sosai_mint"], ["sosai_nene", "sosai_ruri"], ["sosai_coco", "sosai_luna"]];
        if (pairs.some(([a, b]) => (ids.has(a) && card.id === b) || (ids.has(b) && card.id === a))) score += 18;
      }
      if (theme === "契環") {
        const types = new Set(player.charge.filter((entry) => cards[entry.id]?.theme === theme).map((entry) => cards[entry.id]?.type));
        if (card.type && !types.has(card.type)) score += 8;
      }
      return score;
    }
  }

  window.Chrono.CpuController = CpuController;
})();
