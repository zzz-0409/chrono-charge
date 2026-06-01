(function () {
  "use strict";

  const { cards } = window.Chrono;

  class CpuController {
    constructor(game, options = {}) {
      this.game = game;
      this.aiLevel = Number(options.aiLevel || 3);
    }

    choosePlay(player = this.game.enemy, opponent = this.game.opponentOf(player)) {
      const playable = player.hand
        .map((id, index) => ({ id, index, card: cards[id] }))
        .filter((entry) => entry.card && this.game.canPlayCard(player, entry.card) && this.game.canPay(player, entry.card.cost || 0))
        .sort((a, b) => this.playScore(b.card, player, opponent) - this.playScore(a.card, player, opponent));
      return playable[0] || null;
    }

    chooseDriveCard(player = this.game.enemy, opponent = this.game.opponentOf(player)) {
      const usable = this.game.usableDriveCards(player)
        .map((id) => cards[id])
        .filter(Boolean)
        .sort((a, b) => this.driveScore(b, player, opponent) - this.driveScore(a, player, opponent));
      return usable[0]?.id || "";
    }

    chooseActivation(player = this.game.enemy) {
      return player.units.findIndex((entry, index) => entry && this.game.canActivateFieldCard(player, index));
    }

    chooseAttackTarget(unitEntry, opponent, player) {
      const remainingDefense = this.game.remainingDefense(opponent);
      if (remainingDefense > 0) {
        const defender = opponent.units
          .map((entry, index) => ({ entry, index, card: cards[entry?.id] }))
          .filter((item) => item.entry && Number(item.card?.defense || 0) > Number(item.entry.defenseTaken || 0))
          .sort((a, b) => (a.entry.durability || 0) - (b.entry.durability || 0))[0];
        return defender ? defender.index : undefined;
      }

      const remaining = Number(unitEntry?.remainingAttacks || 0);
      if (opponent.lp <= remaining) return null;

      const target = opponent.units
        .map((entry, index) => ({ entry, index, card: cards[entry?.id] }))
        .filter((item) => item.entry && item.card)
        .sort((a, b) => {
          const aDurability = Number(a.entry.durability || a.card.durability || 1);
          const bDurability = Number(b.entry.durability || b.card.durability || 1);
          return aDurability - bDurability || Number(b.card.drive || 0) - Number(a.card.drive || 0);
        })[0];
      if (!target) return null;
      if (target.entry.durability <= remaining || player.lp <= 6) return target.index;
      return null;
    }

    chooseAttackAmount(unitEntry, targetIndex, opponent) {
      const remaining = Math.max(1, Number(unitEntry?.remainingAttacks || 1));
      if (targetIndex === null) return remaining;
      const target = opponent.units[targetIndex];
      return Math.min(remaining, Math.max(1, Number(target?.durability || 1)));
    }

    playScore(card, player, opponent) {
      let score = Number(card.cost || 0) * 4;
      if (card.type === "ユニット") score += 8 + Number(card.attack || 0) * 3 + Number(card.durability || 0) * 2 + Number(card.drive || 0);
      if (card.type === "コア") score += 7 + Number(card.durability || 0) * 2;
      if (card.type === "スペル") score += 5;
      if (card.defense) score += player.lp <= 8 ? 8 : 3;
      if (card.accelerate) score += opponent.lp <= 6 ? 8 : 2;
      if (card.effect?.includes("heal") && player.lp > 14) score -= 5;
      if (card.effect?.includes("ping") && !opponent.units.some(Boolean)) score -= 4;
      return score;
    }

    driveScore(card, player, opponent) {
      let score = Number(card.driveCost || card.cost || 0) * 2;
      score += Number(card.attack || 0) * 4 + Number(card.durability || 0) * 2 + Number(card.drive || 0);
      if (card.defense) score += player.lp <= 8 ? 10 : 2;
      if (card.accelerate) score += opponent.lp <= Number(card.accelerate || 0) ? 10 : 2;
      return score;
    }

    shouldCharge() {
      return false;
    }

    chooseChargeIndex() {
      return -1;
    }

    setNextReaction() {
      return false;
    }

    chooseReactionOption() {
      return null;
    }

    chooseCardIndex(_player, _zone, candidates = []) {
      return candidates[0]?.index ?? -1;
    }
  }

  window.Chrono.CpuController = CpuController;
})();
