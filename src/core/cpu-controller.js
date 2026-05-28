(function () {
  "use strict";

  const { cards } = window.Chrono;

  class CpuController {
    constructor(game) {
      this.game = game;
    }

    shouldCharge() {
      const enemy = this.game.enemy;
      if (enemy.chargedThisTurn || enemy.hand.length === 0) return false;
      if (!enemy.hand.some((id) => cards[id])) return false;
      if (enemy.hand.length === 1 && this.canUseOnlyHandCard(enemy.hand[0])) return false;
      return true;
    }

    canUseOnlyHandCard(id) {
      const enemy = this.game.enemy;
      const card = cards[id];
      if (!card) return false;
      if (card.type === "リアクション") return this.game.canSetReaction(enemy);
      return this.game.canPlayCard(enemy, card) && this.game.canPay(enemy, card.cost);
    }

    chooseChargeIndex() {
      const enemy = this.game.enemy;
      const reactionIndex = enemy.hand.findIndex((id) => cards[id]?.type === "リアクション" && this.game.canSetReaction(enemy));
      if (reactionIndex !== -1 && enemy.charge.length < 2) return reactionIndex;

      const fallbackIndex = enemy.hand.findIndex((id) => cards[id]);
      if (fallbackIndex === -1) return -1;
      let chosen = fallbackIndex;
      enemy.hand.forEach((id, index) => {
        const card = cards[id];
        const chosenCard = cards[enemy.hand[chosen]];
        if (card && chosenCard && card.cost > chosenCard.cost) chosen = index;
      });
      return chosen;
    }

    setNextReaction() {
      const enemy = this.game.enemy;
      if (!this.game.canSetReaction(enemy)) return false;
      const index = enemy.hand.findIndex((id) => cards[id]?.type === "リアクション");
      if (index === -1) return false;
      const slot = enemy.reactions.findIndex((card) => !card);
      if (slot === -1) return false;
      const id = enemy.hand.splice(index, 1)[0];
      enemy.reactions[slot] = { id, revealed: false };
      this.game.log("相手はリアクションをセット。");
      return true;
    }

    setReactions() {
      let count = 0;
      while (this.setNextReaction()) {
        count += 1;
      }
      return count;
    }

    choosePlay() {
      const priorities = ["コア", "ユニット", "スペル"];
      for (const type of priorities) {
        const playable = this.game.enemy.hand
          .map((id, index) => ({ id, index, card: cards[id] }))
          .filter((entry) => entry.card && entry.card.type === type && this.game.canPlayCard(this.game.enemy, entry.card) && this.game.canPay(this.game.enemy, entry.card.cost))
          .sort((a, b) => b.card.cost - a.card.cost);
        if (playable.length > 0) return playable[0];
      }
      return null;
    }

    chooseAttackTarget(attacker, defender) {
      const attackerAtk = this.game.getUnitAtk(this.game.enemy, attacker);
      const targets = defender.units
        .map((unit, index) => ({ unit, index }))
        .filter((entry) => entry.unit)
        .map((entry) => ({ ...entry, atk: this.game.getUnitAtk(defender, entry.unit) }))
        .filter((entry) => entry.atk <= attackerAtk)
        .sort((a, b) => b.atk - a.atk);
      if (targets.length > 0) return targets[0].index;
      return defender.units.some((unit) => unit) ? undefined : null;
    }
  }

  window.Chrono.CpuController = CpuController;
})();
