(function () {
  "use strict";

  class EffectResolver {
    constructor(game) {
      this.game = game;
    }

    async resolve(effect, player, opponent, sourceCard) {
      switch (effect) {
        case "starScout":
          await this.game.addFromDeck(player, (card) => card.name.includes("星導"), {
            title: "星導カードをサーチ",
            message: "デッキから手札に加えるカードを選んでください。",
          });
          if (this.game.countThemeInCharge(player, "星導") >= 2) {
            await this.game.afterEffectStep();
            this.game.drawCards(player, 1);
          }
          break;
        case "starLux":
          if (player.chargedThisTurn) {
            await this.game.specialSummonFromHand(player, (card) => card.type === "ユニット" && card.name.includes("星導") && card.cost <= 1, {
              title: "星導ユニットを追加召喚",
              message: "手札から追加召喚するユニットを選んでください。",
            });
          }
          break;
        case "starMira":
          if (!await this.game.addFromGrave(player, (card) => card.type === "スペル" && card.name.includes("星導"), {
            title: "星導スペルを回収",
            message: "墓地から手札に戻すカードを選んでください。",
          })) this.game.drawCards(player, 1);
          break;
        case "starKai":
          if (this.game.countThemeInCharge(player, "星導") >= 3) this.game.damage(opponent, 500);
          break;
        case "starDragon":
          if (this.game.countThemeInCharge(player, "星導") >= 4 && this.game.destroyBestUnit(opponent)) {
            this.game.log("星龍の光が相手ユニットを破壊。");
          } else {
            this.game.damage(opponent, 1200);
          }
          break;
        case "starInvite":
          await this.game.addFromDeck(player, (card) => card.type === "ユニット" && card.name.includes("星導"), {
            title: "星導ユニットをサーチ",
            message: "デッキから手札に加えるユニットを選んでください。",
          });
          if (this.game.countThemeInCharge(player, "星導") >= 2) {
            await this.game.afterEffectStep();
            this.game.drawCards(player, 1);
          }
          break;
        case "starLink":
          this.game.drawCards(player, 1);
          await this.game.afterEffectStep(560);
          if (this.game.controlsThemeUnit(player, "星導")) {
            await this.game.specialSummonFromHand(player, (card) => card.type === "ユニット" && card.name.includes("星導") && card.cost <= 1, {
              title: "星導ユニットを追加召喚",
              message: "手札から追加召喚するユニットを選んでください。",
            });
          }
          break;
        case "starReignite":
          await this.game.addFromGrave(player, (card) => card.name.includes("星導"), {
            title: "星導カードを回収",
            message: "墓地から手札に戻すカードを選んでください。",
          });
          await this.game.afterEffectStep();
          this.game.untapOneCharge(player, (card) => card.name.includes("星導"));
          break;
        case "starOrbit":
          this.game.drawCards(player, 1);
          break;
        case "blackGrinder":
          if (opponent.units.some(Boolean)) this.game.damage(opponent, 400);
          if (player.cores.some(Boolean)) {
            await this.game.afterEffectStep();
            this.game.drawCards(player, 1);
          }
          break;
        case "blackGear":
          if (this.game.countThemeInCharge(player, "黒機") >= 2) {
            await this.game.specialSummonFromHand(player, (card) => card.type === "ユニット" && card.name.includes("黒機") && card.cost <= 1, {
              title: "黒機ユニットを追加召喚",
              message: "手札から追加召喚するユニットを選んでください。",
            });
          }
          break;
        case "blackAnchor":
          this.game.exhaustBestUnit(opponent);
          await this.game.afterEffectStep();
          if (player.cores.some(Boolean)) this.game.damage(opponent, 700);
          break;
        case "blackTower":
          this.game.damage(opponent, 600);
          break;
        case "blackRaid":
          this.game.damage(opponent, 800);
          if (this.game.controlsThemeUnit(player, "黒機")) {
            await this.game.afterEffectStep();
            this.game.exhaustBestUnit(opponent);
          }
          break;
        case "drawDiscard":
          this.game.drawCards(player, 2);
          await this.game.afterEffectStep(560);
          await this.game.discardFromHand(player, {
            title: "手札を1枚捨てる",
            message: "墓地に送るカードを選んでください。",
          });
          break;
        case "bindUnit":
          this.game.exhaustBestUnit(opponent);
          await this.game.afterEffectStep();
          this.game.damage(opponent, 500);
          break;
        case "recallUnit":
          await this.game.addFromGrave(player, (card) => card.type === "ユニット", {
            title: "ユニットを回収",
            message: "墓地から手札に戻すユニットを選んでください。",
          });
          break;
        case "zeroCore":
          this.game.drawCards(player, 1);
          break;
        default:
          if (sourceCard) this.game.log(`${sourceCard.name}の効果を処理。`);
      }
    }
  }

  window.Chrono.EffectResolver = EffectResolver;
})();
