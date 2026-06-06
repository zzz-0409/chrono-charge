(function () {
  "use strict";

const ART = {
  flame: "assets/art/flame-knight.png",
  witch: "assets/art/clockwork-witch.png",
  forest: "assets/art/forest-guardian.png",
  shadow: "assets/art/shadow-assassin.png"
};

const CARD_FRAMES = {
  bronze: "assets/ui/card-frame-base-3slot-name-overlay.png",
  ornate: "assets/ui/card-frame-base-3slot-name-ornate-overlay.png",
  silver: "assets/ui/card-frame-rarity-silver-overlay.png",
  rainbow: "assets/ui/card-frame-rarity-rainbow-overlay.png"
};

const START_AP = 1;
const MAX_AP = 20;
const AP_GAIN = 2;
const BOARD = 3;
const DECK_TARGET_SIZE = 17;
const MAX_CARD_COPIES = 3;
const DECK_STORAGE_KEY = "chronoGridDeckV1";
const LEADER_TRAIT_STORAGE_KEY = "chronoGridLeaderTraitV1";

const LEADER_TRAITS = {
  bulwark: {
    id: "bulwark",
    name: "鉄壁",
    text: "大将が受けるダメージを1軽減する。",
    damageReduction: 1,
    leaderMoves: 1,
    bonusDraw: 0
  },
  tactician: {
    id: "tactician",
    name: "軍師",
    text: "対戦開始時、手札を1枚多く引く。",
    damageReduction: 0,
    leaderMoves: 1,
    bonusDraw: 1
  },
  runner: {
    id: "runner",
    name: "疾駆",
    text: "大将が1ターンに2回まで移動できる。",
    damageReduction: 0,
    leaderMoves: 2,
    bonusDraw: 0
  }
};

const CARDS = {
  flameVanguard: {
    id: "flameVanguard",
    name: "紅蓮の斬兵",
    kind: "unit",
    cost: 2,
    atk: 3,
    hp: 2,
    pattern: "front",
    rarity: "silver",
    art: ART.flame,
    text: "自分ターン開始時、正面のマスを攻撃する。召喚したターンと移動したターンは攻撃できない。"
  },
  clockWitch: {
    id: "clockWitch",
    name: "時編みの術師",
    kind: "unit",
    cost: 3,
    atk: 2,
    hp: 4,
    pattern: "column",
    rarity: "rainbow",
    art: ART.witch,
    text: "自分ターン開始時、同じ列を攻撃する。移動していないターンは攻撃力+1。召喚したターンと移動したターンは攻撃できない。"
  },
  forestGuard: {
    id: "forestGuard",
    name: "森冠の守護者",
    kind: "unit",
    cost: 3,
    atk: 1,
    hp: 5,
    pattern: "frontRow",
    trait: "guard",
    rarity: "rainbow",
    art: ART.forest,
    text: "自分ターン開始時、相手前列を攻撃する。大将の前にいる時、大将へのダメージを1軽減。召喚したターンと移動したターンは攻撃できない。"
  },
  shadowRaider: {
    id: "shadowRaider",
    name: "硝影の急襲者",
    kind: "unit",
    cost: 2,
    atk: 3,
    hp: 1,
    pattern: "front",
    trait: "raid",
    rarity: "ornate",
    art: ART.shadow,
    text: "自分ターン開始時、正面のマスを攻撃する。移動した時、相手大将に1ダメージ。召喚したターンと移動したターンは攻撃できない。"
  },
  spikeTrap: {
    id: "spikeTrap",
    name: "影針の罠",
    kind: "trap",
    cost: 2,
    rarity: "silver",
    art: ART.shadow,
    text: "相手フィールドの空きマスに設置。そのマスに相手が入ると2ダメージ。"
  },
  snareTrap: {
    id: "snareTrap",
    name: "封足の罠",
    kind: "trap",
    cost: 1,
    rarity: "bronze",
    art: ART.witch,
    text: "相手フィールドの空きマスに設置。そのマスに相手が入ると1ダメージし、APを1減らす。"
  },
  hasteSeal: {
    id: "hasteSeal",
    name: "加速刻印",
    kind: "boost",
    cost: 1,
    rarity: "bronze",
    art: ART.flame,
    text: "自分ユニット1体の攻撃力を+1する。"
  },
  starShield: {
    id: "starShield",
    name: "星盾結界",
    kind: "boost",
    cost: 2,
    rarity: "rainbow",
    art: ART.forest,
    text: "自分の大将かユニット1体に盾を付与し、次に受けるダメージを1軽減する。"
  }
};

const DECK = [
  "flameVanguard", "flameVanguard", "flameVanguard",
  "clockWitch", "clockWitch",
  "forestGuard", "forestGuard",
  "shadowRaider", "shadowRaider",
  "spikeTrap", "spikeTrap",
  "snareTrap", "snareTrap",
  "hasteSeal", "hasteSeal",
  "starShield", "starShield"
];

  window.ChronoGridData = {
    ART,
    CARD_FRAMES,
    START_AP,
    MAX_AP,
    AP_GAIN,
    BOARD,
    DECK_TARGET_SIZE,
    MAX_CARD_COPIES,
    DECK_STORAGE_KEY,
    LEADER_TRAIT_STORAGE_KEY,
    LEADER_TRAITS,
    CARDS,
    DECK
  };
})();
