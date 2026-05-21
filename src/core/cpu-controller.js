(function () {
  "use strict";

  const { cards } = window.Chrono;

  class CpuController {
    constructor(game) {
      this.game = game;
    }

    chooseChargeIndex() {
      const enemy = this.game.enemy;
      const reactionIndex = enemy.hand.findIndex((id) => cards[id].type === "リアクション" && this.game.canSetReaction(enemy));
      if (reactionIndex !== -1 && enemy.charge.length < 2) return reactionIndex;

      let chosen = 0;
      enemy.hand.forEach((id, index) => {
        if (cards[id].cost > cards[enemy.hand[chosen]].cost) chosen = index;
      });
      return chosen;
    }

    setReactions() {
      const enemy = this.game.enemy;
      let moved = true;
      while (moved && this.game.canSetReaction(enemy)) {
        moved = false;
        const index = enemy.hand.findIndex((id) => cards[id].type === "リアクション");
        if (index !== -1) {
          const id = enemy.hand.splice(index, 1)[0];
          const slot = enemy.reactions.findIndex((card) => !card);
          enemy.reactions[slot] = id;
          this.game.log("相手はリアクションをセット。");
          moved = true;
        }
      }
    }

    choosePlay() {
      const priorities = ["コア", "ユニット", "スペル"];
      for (const type of priorities) {
        const playable = this.game.enemy.hand
          .map((id, index) => ({ id, index, card: cards[id] }))
          .filter((entry) => entry.card.type === type && this.game.canPlayCard(this.game.enemy, entry.card) && this.game.canPay(this.game.enemy, entry.card.cost))
          .sort((a, b) => b.card.cost - a.card.cost);
        if (playable.length > 0) return playable[0];
      }
      return null;
    }

    chooseAttackTarget(player) {
      const targets = player.units
        .map((unit, index) => ({ unit, index }))
        .filter((entry) => entry.unit)
        .sort((a, b) => this.game.getUnitAtk(player, a.unit) - this.game.getUnitAtk(player, b.unit));
      return targets.length ? targets[0].index : null;
    }
  }

  window.Chrono.CpuController = CpuController;
})();
