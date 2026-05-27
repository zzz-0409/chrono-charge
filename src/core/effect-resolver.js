(function () {
  "use strict";

  class EffectResolver {
    constructor(game) {
      this.game = game;
    }

    async optionalAdditional(player, sourceCard, message) {
      return this.game.confirmEffectActivation(player, sourceCard, {
        title: `${sourceCard?.name || "カード"}の追加効果`,
        message,
        confirmLabel: "追加で発動する",
      });
    }

    async resolve(effect, player, opponent, sourceCard) {
      switch (effect) {
        case "starScout":
          await this.game.addFromDeck(player, (card) => card.name.includes("星導"), {
            title: "星導カードをサーチ",
            message: "デッキから手札に加えるカードを選んでください。",
          });
          if (
            this.game.countThemeInCharge(player, "星導") >= 2 &&
            await this.optionalAdditional(player, sourceCard, "チャージに「星導」が2枚以上あります。追加で1枚ドローしますか？")
          ) {
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
          if (this.game.countThemeInCharge(player, "星導") >= 4 && await this.game.destroyBestUnit(opponent)) {
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
          if (
            this.game.countThemeInCharge(player, "星導") >= 2 &&
            await this.optionalAdditional(player, sourceCard, "チャージに「星導」が2枚以上あります。追加で1枚ドローしますか？")
          ) {
            await this.game.afterEffectStep();
            this.game.drawCards(player, 1);
          }
          break;
        case "starLink":
          this.game.drawCards(player, 1);
          await this.game.afterEffectStep(560);
          if (
            this.game.controlsThemeUnit(player, "星導") &&
            await this.optionalAdditional(player, sourceCard, "自分フィールドに「星導」ユニットがいます。追加で手札から召喚しますか？")
          ) {
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
        case "starNavigator":
          if (await this.game.moveHandCardToCharge(player, (card) => card.name.includes("星導"), {
            title: "星導カードをチャージ",
            message: "手札からチャージに置く「星導」カードを選んでください。",
          })) {
            await this.game.afterEffectStep();
            await this.game.addFromDeck(player, (card) => card.name.includes("星導"), {
              title: "星導カードをサーチ",
              message: "デッキから手札に加える「星導」カードを選んでください。",
            });
          }
          break;
        case "starChart":
          if (await this.game.moveGraveCardToCharge(player, (card) => card.name.includes("星導"), {
            title: "星導カードをチャージ",
            message: "墓地からチャージに置く「星導」カードを選んでください。",
          }) && this.game.controlsThemeUnit(player, "星導") &&
            await this.optionalAdditional(player, sourceCard, "自分フィールドに「星導」ユニットがいます。追加でチャージをアクティブにしますか？")) {
            await this.game.afterEffectStep();
            this.game.untapOneCharge(player);
          }
          break;
        case "starSurveyorNoll":
          if (player.chargedThisTurn && await this.game.moveHandCardToCharge(player, (card) => card.name.includes("星導"), {
            title: "星導カードをチャージ",
            message: "手札からチャージに置く「星導」カードを選んでください。",
          }) && this.game.countThemeInCharge(player, "星導") >= 3 &&
            await this.optionalAdditional(player, sourceCard, "チャージに「星導」が3枚以上あります。追加で1枚ドローしますか？")) {
            await this.game.afterEffectStep();
            this.game.drawCards(player, 1);
          }
          break;
        case "starObservationRecord":
          await this.game.addFromDeck(player, (card) => card.type === "コア" && card.theme === "星導", {
            title: "星導コアをサーチ",
            message: "デッキから手札に加える「星導」コアを選んでください。",
          });
          if (
            this.game.countThemeInCharge(player, "星導") >= 3 &&
            await this.optionalAdditional(player, sourceCard, "チャージに「星導」が3枚以上あります。追加で1枚ドローしますか？")
          ) {
            await this.game.afterEffectStep();
            this.game.drawCards(player, 1);
          }
          break;
        case "starOrbit":
          this.game.drawCards(player, 1);
          break;
        case "blackGrinder":
          if (opponent.units.some(Boolean)) this.game.damage(opponent, 400);
          if (
            player.cores.some(Boolean) &&
            await this.optionalAdditional(player, sourceCard, "自分のコアがあります。追加で1枚ドローしますか？")
          ) {
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
        case "blackSupplyEngineer":
          if (this.game.hasThemeCore(player, "黒機")) {
            await this.game.addFromDeck(player, (card) => card.type === "スペル" && card.theme === "黒機", {
              title: "黒機スペルをサーチ",
              message: "デッキから手札に加える「黒機」スペルを選んでください。",
            });
          } else {
            this.game.damage(opponent, 300);
          }
          break;
        case "blackBindingGunner":
          if (this.game.hasThemeCore(player, "黒機") && await this.game.exhaustBestUnit(opponent)) {
            await this.game.afterEffectStep();
            this.game.drawCards(player, 1);
          }
          break;
        case "blackAnchor":
          await this.game.exhaustBestUnit(opponent);
          await this.game.afterEffectStep();
          if (
            player.cores.some(Boolean) &&
            await this.optionalAdditional(player, sourceCard, "自分のコアがあります。追加で相手に700ダメージを与えますか？")
          ) this.game.damage(opponent, 700);
          break;
        case "blackTower":
          this.game.damage(opponent, 600);
          break;
        case "blackRaid":
          this.game.damage(opponent, 800);
          if (
            this.game.controlsThemeUnit(player, "黒機") &&
            await this.optionalAdditional(player, sourceCard, "自分フィールドに「黒機」ユニットがいます。追加で相手ユニットを行動済みにしますか？")
          ) {
            await this.game.afterEffectStep();
            await this.game.exhaustBestUnit(opponent);
          }
          break;
        case "bladeTracker":
          if (!await this.game.exhaustBestUnit(opponent)) this.game.damage(opponent, 300);
          break;
        case "bladeMarksmith":
          if (this.game.hasExhaustedUnit(opponent)) this.game.drawCards(player, 1);
          break;
        case "bladeEdgeguard":
          if (this.game.countThemeInCharge(player, "断刃") >= 2) await this.game.exhaustBestUnit(opponent);
          break;
        case "bladeExecutioner":
          if (!await this.game.destroyBestExhaustedUnit(opponent)) {
            await this.game.afterEffectStep();
            await this.game.exhaustBestUnit(opponent);
          }
          break;
        case "bladeArbiter":
          if (this.game.countThemeInCharge(player, "断刃") >= 4) await this.game.destroyBestUnit(opponent);
          else await this.game.destroyBestExhaustedUnit(opponent);
          break;
        case "bladeMark":
          await this.game.exhaustBestUnit(opponent);
          if (
            this.game.controlsThemeUnit(player, "断刃") &&
            await this.optionalAdditional(player, sourceCard, "自分フィールドに「断刃」ユニットがいます。追加で相手に400ダメージを与えますか？")
          ) {
            await this.game.afterEffectStep();
            this.game.damage(opponent, 400);
          }
          break;
        case "bladeCleave":
          if (!await this.game.destroyBestExhaustedUnit(opponent)) {
            await this.game.afterEffectStep();
            await this.game.exhaustBestUnit(opponent);
          }
          break;
        case "bladeWarrant":
          await this.game.addFromDeck(player, (card) => card.type === "ユニット" && card.name.includes("断刃"), {
            title: "断刃ユニットをサーチ",
            message: "デッキから手札に加えるユニットを選んでください。",
          });
          if (
            this.game.hasExhaustedUnit(opponent) &&
            await this.optionalAdditional(player, sourceCard, "相手の行動済みユニットがいます。追加で1枚ドローしますか？")
          ) {
            await this.game.afterEffectStep();
            this.game.drawCards(player, 1);
          }
          break;
        case "bladeScaffold":
          await this.game.exhaustBestUnit(opponent);
          break;
        case "cyberMio":
          await this.game.specialSummonFromHand(player, (card) => card.type === "ユニット" && card.name.includes("電脳") && card.cost <= 1, {
            title: "電脳ユニットを追加召喚",
            message: "手札から追加召喚するユニットを選んでください。",
          }, opponent);
          break;
        case "cyberReiSpecial":
          await this.game.addFromDeck(player, (card) => card.type === "リアクション" && card.name.includes("電脳"), {
            title: "電脳リアクションをサーチ",
            message: "デッキから手札に加えるリアクションを選んでください。",
          });
          break;
        case "cyberShionSpecial": {
          const revealed = await this.game.revealReactions(opponent, 1);
          if (
            revealed > 0 &&
            await this.optionalAdditional(player, sourceCard, "リアクションを公開しました。追加で相手に500ダメージを与えますか？")
          ) {
            await this.game.afterEffectStep();
            this.game.damage(opponent, 500);
          }
          break;
        }
        case "cyberYuna":
          await this.game.specialSummonFromHand(player, (card) => card.type === "ユニット" && card.name.includes("電脳") && card.cost <= 2, {
            title: "電脳ユニットを追加召喚",
            message: "手札から追加召喚するユニットを選んでください。",
          }, opponent);
          break;
        case "cyberYunaSpecial":
          this.game.untapOneCharge(player);
          break;
        case "cyberAkariSpecial":
          this.game.drawCards(player, 2);
          await this.game.afterEffectStep(560);
          await this.game.discardFromHand(player, {
            title: "手札を1枚捨てる",
            message: "墓地に送るカードを選んでください。",
          });
          await this.game.afterEffectStep();
          await this.game.removeRevealedReaction(opponent);
          break;
        case "cyberPacketMana":
          if (await this.game.addFromDeck(player, (card) => card.type === "スペル" && card.theme === "電脳", {
            title: "電脳スペルをサーチ",
            message: "デッキから手札に加える「電脳」スペルを選んでください。",
          })) {
            if (
              opponent.reactions.some((entry) => entry && this.game.reactionRevealed(entry)) &&
              await this.optionalAdditional(player, sourceCard, "相手の公開状態リアクションがあります。追加で1枚ドローしますか？")
            ) {
              await this.game.afterEffectStep();
              this.game.drawCards(player, 1);
            }
          }
          break;
        case "cyberPreview":
          if (await this.game.specialSummonFromHand(player, (card) => card.type === "ユニット" && card.name.includes("電脳") && card.cost <= 1, {
            title: "電脳ユニットを追加召喚",
            message: "手札から追加召喚するユニットを選んでください。",
          }, opponent) &&
            await this.optionalAdditional(player, sourceCard, "ユニットを追加召喚しました。追加で1枚ドローしますか？")) {
            await this.game.afterEffectStep();
            this.game.drawCards(player, 1);
          }
          break;
        case "cyberIntrusion": {
          const revealed = await this.game.revealReactions(opponent, 1);
          if (revealed > 0) await this.game.afterEffectStep();
          if (
            this.game.countThemeUnits(player, "電脳") >= 2 &&
            await this.optionalAdditional(player, sourceCard, "自分フィールドに「電脳」ユニットが2体以上います。追加で手札から召喚しますか？")
          ) {
            await this.game.specialSummonFromHand(player, (card) => card.type === "ユニット" && card.name.includes("電脳"), {
              title: "電脳ユニットを追加召喚",
              message: "手札から追加召喚するユニットを選んでください。",
            }, opponent);
          }
          break;
        }
        case "cyberNetwork":
          await this.game.specialSummonFromHand(player, (card) => card.type === "ユニット" && card.name.includes("電脳") && card.cost <= 1, {
            title: "電脳ユニットを追加召喚",
            message: "手札から追加召喚するユニットを選んでください。",
          }, opponent);
          break;
        case "cyberBackchannel":
          await this.game.addFromDeck(player, (card) => card.type === "リアクション" && (card.theme === "電脳" || !card.theme), {
            title: "リアクションをサーチ",
            message: "デッキから手札に加えるリアクションを選んでください。",
          });
          await this.game.revealReactions(opponent, 1);
          if (
            opponent.reactions.some((entry) => entry && this.game.reactionRevealed(entry)) &&
            await this.optionalAdditional(player, sourceCard, "公開状態のリアクションがあります。追加で手札から召喚しますか？")
          ) {
            await this.game.afterEffectStep(560);
            await this.game.specialSummonFromHand(player, (card) => card.type === "ユニット" && card.theme === "電脳" && card.cost <= 2, {
              title: "電脳ユニットを追加召喚",
              message: "手札から追加召喚する「電脳」ユニットを選んでください。",
            }, opponent);
          }
          break;
        case "cyberTraceRoute": {
          const revealed = await this.game.revealReactions(opponent, 1);
          if (
            revealed > 0 &&
            await this.optionalAdditional(player, sourceCard, "リアクションを公開しました。追加でコスト1以下の「電脳」ユニットをサーチしますか？")
          ) {
            await this.game.afterEffectStep();
            await this.game.addFromDeck(player, (card) => card.type === "ユニット" && card.theme === "電脳" && card.cost <= 1, {
              title: "電脳ユニットをサーチ",
              message: "デッキから手札に加えるコスト1以下の「電脳」ユニットを選んでください。",
            });
          }
          break;
        }
        case "probeDrone":
          if (
            await this.game.revealReactions(opponent, 1) > 0 &&
            await this.optionalAdditional(player, sourceCard, "リアクションを公開しました。追加で手札から召喚しますか？")
          ) {
            await this.game.afterEffectStep(560);
            await this.game.specialSummonFromHand(player, (card) => card.type === "ユニット" && card.theme === "電脳" && card.cost <= 1, {
              title: "電脳ユニットを追加召喚",
              message: "手札から追加召喚する「電脳」ユニットを選んでください。",
            }, opponent);
          }
          break;
        case "sosaiHikari":
          await this.game.addFromDeck(player, (card) => card.id === "sosai_mint", {
            title: "ミントをサーチ",
            message: "デッキから手札に加えるミントを選んでください。",
          });
          if (
            this.game.controlsCard(player, "sosai_mint") &&
            await this.optionalAdditional(player, sourceCard, "自分フィールドに「双彩のミント」がいます。追加で1枚ドローしますか？")
          ) {
            await this.game.afterEffectStep();
            this.game.drawCards(player, 1);
          }
          break;
        case "sosaiMint": {
          const revealed = await this.game.revealReactions(opponent, 1);
          if (revealed > 0) await this.game.afterEffectStep();
          if (
            this.game.controlsCard(player, "sosai_hikari") &&
            await this.optionalAdditional(player, sourceCard, "自分フィールドに「双彩のヒカリ」がいます。追加で表向きリアクションを墓地に送りますか？")
          ) await this.game.removeRevealedReaction(opponent);
          break;
        }
        case "sosaiNene":
          await this.game.addFromDeck(player, (card) => card.id === "sosai_ruri", {
            title: "ルリをサーチ",
            message: "デッキから手札に加えるルリを選んでください。",
          });
          if (
            this.game.controlsCard(player, "sosai_ruri") &&
            await this.optionalAdditional(player, sourceCard, "自分フィールドに「双彩のルリ」がいます。追加で相手ユニットを手札に戻しますか？")
          ) {
            await this.game.afterEffectStep();
            await this.game.returnBestUnitToHand(opponent);
          }
          break;
        case "sosaiRuri":
          await this.game.addFromDeck(player, (card) => card.id === "sosai_nene", {
            title: "ネネをサーチ",
            message: "デッキから手札に加えるネネを選んでください。",
          });
          if (
            this.game.controlsCard(player, "sosai_nene") &&
            await this.optionalAdditional(player, sourceCard, "自分フィールドに「双彩のネネ」がいます。追加で700ダメージと1枚ドローを行いますか？")
          ) {
            await this.game.afterEffectStep();
            this.game.damage(opponent, 700);
            await this.game.afterEffectStep();
            this.game.drawCards(player, 1);
          }
          break;
        case "sosaiCoco":
          await this.game.addFromDeck(player, (card) => card.id === "sosai_luna", {
            title: "ルナをサーチ",
            message: "デッキから手札に加えるルナを選んでください。",
          });
          if (
            this.game.controlsCard(player, "sosai_luna") &&
            await this.optionalAdditional(player, sourceCard, "自分フィールドに「双彩のルナ」がいます。追加でチャージをアクティブにして1枚ドローしますか？")
          ) {
            await this.game.afterEffectStep();
            this.game.untapOneCharge(player);
            this.game.drawCards(player, 1);
          }
          break;
        case "sosaiLuna":
          this.game.damage(opponent, 700);
          if (
            this.game.controlsCard(player, "sosai_coco") &&
            await this.optionalAdditional(player, sourceCard, "自分フィールドに「双彩のココ」がいます。追加で相手ユニットを破壊しますか？")
          ) {
            await this.game.afterEffectStep();
            await this.game.destroyBestUnit(opponent);
          }
          break;
        case "sosaiLiveStart":
          await this.game.addFromDeck(player, (card) => card.type === "ユニット" && card.name.includes("双彩"), {
            title: "双彩ユニットをサーチ",
            message: "デッキから手札に加えるユニットを選んでください。",
          });
          if (
            this.game.hasSosaiPair(player) &&
            await this.optionalAdditional(player, sourceCard, "自分フィールドに「双彩」のペアがそろっています。追加で1枚ドローしますか？")
          ) {
            await this.game.afterEffectStep();
            this.game.drawCards(player, 1);
          }
          break;
        case "sosaiHeartSync":
          if (await this.game.specialSummonFromHand(player, (card) => card.type === "ユニット" && card.name.includes("双彩") && card.cost <= 2, {
            title: "双彩ユニットを追加召喚",
            message: "手札から追加召喚するユニットを選んでください。",
          }, opponent) && this.game.hasSosaiPair(player) &&
            await this.optionalAdditional(player, sourceCard, "自分フィールドに「双彩」のペアがそろっています。追加で1枚ドローしますか？")) {
            await this.game.afterEffectStep();
            this.game.drawCards(player, 1);
          }
          break;
        case "sosaiPopStage":
          this.game.drawCards(player, 1);
          break;
        case "drawDiscard":
          this.game.drawCards(player, 2);
          await this.game.afterEffectStep(560);
          await this.game.discardFromHand(player, {
            title: "手札を1枚捨てる",
            message: "墓地に送るカードを選んでください。",
          });
          break;
        case "genericFieldNotes":
          this.game.drawCards(player, 1);
          if (
            !player.units.some(Boolean) &&
            await this.optionalAdditional(player, sourceCard, "自分フィールドにユニットがいません。追加で手札1枚をチャージに置きますか？")
          ) {
            await this.game.afterEffectStep();
            await this.game.moveHandCardToCharge(player, () => true, {
              title: "手札をチャージ",
              message: "手札からチャージに置くカードを選んでください。",
            });
          }
          break;
        case "genericSurveyTeam":
          if (player.charge.length < opponent.charge.length) {
            await this.game.moveHandCardToCharge(player, () => true, {
              title: "手札をチャージ",
              message: "前線測量班でチャージに置くカードを選んでください。",
            });
          }
          break;
        case "genericFieldMedic":
          if (player.lp < opponent.lp) this.game.drawCards(player, 1);
          break;
        case "bindUnit":
          await this.game.exhaustBestUnit(opponent);
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
