(function () {
  "use strict";

  const { cards } = window.Chrono;

  class EffectResolver {
    constructor(game) {
      this.game = game;
    }

    async resolve(effect, player, opponent, sourceCard) {
      if (!effect || this.game.finished) return false;
      switch (effect) {
        case "draw1":
          this.game.drawCards(player, 1);
          return true;
        case "draw2":
          this.game.drawCards(player, 2);
          return true;
        case "heal1":
          this.game.heal(player, 1);
          return true;
        case "heal2":
          this.game.heal(player, 2);
          return true;
        case "leaderDamage1":
        case "damageLeader1":
          this.game.damage(opponent, 1);
          return true;
        case "leaderDamage2":
        case "damageLeader2":
          this.game.damage(opponent, 2);
          return true;
        case "pingEnemy1":
          return this.damageBestField(opponent, 1);
        case "pingEnemy2":
          return this.damageBestField(opponent, 2);
        case "gainDrive1":
          this.game.addDriveGauge(player, 1);
          return true;
        case "gainDrive2":
          this.game.addDriveGauge(player, 2);
          return true;
        case "gainDrive3":
          this.game.addDriveGauge(player, 3);
          return true;
        case "gainDriveIfCore":
          if (this.hasCore(player)) {
            this.game.addDriveGauge(player, 2);
            return true;
          }
          return false;
        case "gainDriveIfCharge4":
          if (player.charge.length >= 4) {
            this.game.addDriveGauge(player, 1);
            return true;
          }
          return false;
        case "drawIfCharge6":
          this.game.drawCards(player, player.charge.length >= 6 ? 2 : 1);
          return true;
        case "chargeExchange3":
          return this.game.exchangeChargeWithHand(player, 3);
        case "chargeExchangeAny":
          return this.game.exchangeChargeWithHand(player, Infinity);
        case "drawIfAttacked3":
          this.game.drawCards(player, player.attacksAllocatedThisTurn >= 3 ? 2 : 1);
          return true;
        case "gainDriveIfAttacked3":
          if (player.attacksAllocatedThisTurn >= 3) {
            this.game.addDriveGauge(player, 2);
            return true;
          }
          return false;
        case "leaderDamageIfAttacked4":
          if (player.attacksAllocatedThisTurn >= 4) {
            this.game.damage(opponent, 1);
            return true;
          }
          return false;
        case "repairOwnCore1":
          return this.repairCore(player, 1);
        case "readyOne":
          return this.readyOne(player);
        default:
          this.game.log(`未実装効果: ${effect}`);
          return false;
      }
    }

    damageBestField(player, amount) {
      const target = player.units
        .map((entry, index) => ({ entry, index, card: cards[entry?.id] }))
        .filter((item) => item.entry && item.card)
        .sort((a, b) => {
          const aDurability = Number(a.entry.durability ?? a.card.durability ?? 1);
          const bDurability = Number(b.entry.durability ?? b.card.durability ?? 1);
          return aDurability - bDurability || a.index - b.index;
        })[0];
      if (!target) return false;
      this.game.damageBoardEntry(player, target.index, amount);
      return true;
    }

    repairCore(player, amount) {
      const target = player.units
        .map((entry, index) => ({ entry, index, card: cards[entry?.id] }))
        .find((item) => item.entry && item.card?.type === "コア");
      if (!target) {
        this.game.drawCards(player, 1);
        return true;
      }
      const maxDurability = Number(target.card.durability || 1);
      target.entry.durability = Math.min(maxDurability, Number(target.entry.durability || 0) + amount);
      this.game.log(`${target.card.name}の耐久を${amount}回復。`);
      return true;
    }

    readyOne(player) {
      const target = player.units
        .map((entry, index) => ({ entry, index, card: cards[entry?.id] }))
        .find((item) => item.entry && item.card?.type !== "コア" && Number(item.entry.remainingAttacks || 0) < Number(item.card.attack || 0));
      if (!target) return false;
      target.entry.remainingAttacks += 1;
      this.game.log(`${target.card.name}の攻撃回数を1回復。`);
      return true;
    }

    hasCore(player) {
      return player.units.some((entry) => entry && cards[entry.id]?.type === "コア");
    }
  }

  window.Chrono.EffectResolver = EffectResolver;
})();
