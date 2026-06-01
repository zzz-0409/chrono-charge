(function () {
  "use strict";

  const DECK_SIZE = 40;
  const DRIVE_DECK_SIZE = 10;
  const MAX_COPIES = 3;
  const MAX_DRIVE_COPIES = 1;
  const MAX_LP = 20;
  const UNIT_ZONES = 5;
  const CORE_ZONES = 0;
  const REACTION_ZONES = 0;
  const MAX_AP = 10;
  const MAX_DRIVE = 20;
  const STORAGE_KEY = "chrono-charge-deck-v2";

  const TYPES = {
    UNIT: "ユニット",
    SPELL: "スペル",
    CORE: "コア",
    DRIVE_UNIT: "ドライブユニット",
  };

  const RARITIES = {
    bronze: { id: "bronze", label: "\u9285" },
    silver: { id: "silver", label: "\u9280" },
    gold: { id: "gold", label: "\u91d1" },
    rainbow: { id: "rainbow", label: "\u8679" },
  };

  const CLASSES = {
    blader: {
      id: "blader",
      name: "ブレイダー",
      shortName: "斬撃",
      description: "攻撃を割り振った回数を参照し、加速でテンポを取るクラス。",
      art: "assets/cards/art/blade-arbiter.png",
    },
    fortress: {
      id: "fortress",
      name: "フォートレス",
      shortName: "防衛",
      description: "防衛とコアの耐久で攻撃先をずらし、長期戦で返すクラス。",
      art: "assets/cards/art/generic-guardian.png",
    },
    alchemist: {
      id: "alchemist",
      name: "アルケミスト",
      shortName: "錬成",
      description: "表向きチャージを手札やドライブに変換して戦うクラス。",
      art: "assets/cards/art/cyber-akari.png",
    },
  };

  const typeIcons = {
    [TYPES.UNIT]: "blade",
    [TYPES.SPELL]: "star",
    [TYPES.CORE]: "core",
    [TYPES.DRIVE_UNIT]: "core",
  };

  const attrClass = {
    ブレイダー: "attr-fire",
    フォートレス: "attr-light",
    アルケミスト: "attr-shadow",
    汎用: "attr-neutral",
  };

  const typeClass = {
    [TYPES.UNIT]: "type-unit",
    [TYPES.SPELL]: "type-spell",
    [TYPES.CORE]: "type-core",
    [TYPES.DRIVE_UNIT]: "type-unit-drive drive-card-type",
  };

  const classArt = {
    blader: [
      "assets/cards/art/blade-tracker.png",
      "assets/cards/art/blade-marksmith.png",
      "assets/cards/art/blade-edgeguard.png",
      "assets/cards/art/blade-executioner.png",
      "assets/cards/art/blade-arbiter.png",
      "assets/cards/art/blade-cleave.png",
    ],
    fortress: [
      "assets/cards/art/generic-guardian.png",
      "assets/cards/art/generic-wall.png",
      "assets/cards/art/generic-golem.png",
      "assets/cards/art/generic-giant.png",
      "assets/cards/art/black-tower.png",
      "assets/cards/art/star-guard.png",
    ],
    alchemist: [
      "assets/cards/art/cyber-mio.png",
      "assets/cards/art/cyber-rei.png",
      "assets/cards/art/cyber-shion.png",
      "assets/cards/art/cyber-yuna.png",
      "assets/cards/art/cyber-akari.png",
      "assets/cards/art/cyber-network.png",
    ],
    generic: [
      "assets/cards/art/generic-vanguard.png",
      "assets/cards/art/generic-watch-drone.png",
      "assets/cards/art/generic-field-medic.png",
      "assets/cards/art/generic-supply-box.png",
      "assets/cards/art/generic-transfer.png",
      "assets/cards/art/generic-code.png",
    ],
  };

  function art(cardClass, index = 0) {
    const list = classArt[cardClass] || classArt.generic;
    return list[index % list.length];
  }

  function defaultRarity(spec) {
    const cost = Number(spec.driveCost ?? spec.cost ?? 0);
    if (spec.driveKind || spec.type === TYPES.DRIVE_UNIT) {
      if (cost >= 15) return RARITIES.rainbow.id;
      return RARITIES.gold.id;
    }
    if (cost >= 5) return RARITIES.gold.id;
    if (cost >= 3) return RARITIES.silver.id;
    return RARITIES.bronze.id;
  }

  function baseCard(spec) {
    return {
      attr: classLabel(spec.cardClass),
      theme: spec.cardClass === "generic" ? "汎用" : classLabel(spec.cardClass),
      text: spec.text || "",
      art: spec.art || art(spec.cardClass || "generic", spec.artIndex || 0),
      ...spec,
      rarity: spec.rarity || defaultRarity(spec),
    };
  }

  function unit(spec) {
    return baseCard({
      type: TYPES.UNIT,
      attack: 1,
      durability: 1,
      drive: 1,
      accelerate: 0,
      defense: 0,
      ...spec,
    });
  }

  function spell(spec) {
    return baseCard({
      type: TYPES.SPELL,
      attack: 0,
      durability: 0,
      drive: 0,
      ...spec,
    });
  }

  function core(spec) {
    return baseCard({
      type: TYPES.CORE,
      attack: 0,
      durability: 2,
      drive: 0,
      ...spec,
    });
  }

  function driveUnit(spec) {
    return baseCard({
      type: TYPES.DRIVE_UNIT,
      driveKind: "unit",
      cost: spec.driveCost,
      attack: 2,
      durability: 2,
      drive: 2,
      accelerate: 0,
      defense: 0,
      ...spec,
    });
  }

  function classLabel(cardClass) {
    return CLASSES[cardClass]?.name || "汎用";
  }

  const genericCards = [
    unit({ id: "gen_front_runner", name: "前線ランナー", cardClass: "generic", cost: 1, attack: 1, durability: 1, drive: 1, accelerate: 1, text: "加速1。" }),
    unit({ id: "gen_watch_guard", name: "見張り衛兵", cardClass: "generic", cost: 1, attack: 1, durability: 2, drive: 1, defense: 1, text: "防衛1。" }),
    unit({ id: "gen_line_duelist", name: "ラインデュエリスト", cardClass: "generic", cost: 2, attack: 2, durability: 1, drive: 1, text: "攻撃回数が高い標準ユニット。" }),
    unit({ id: "gen_core_keeper", name: "コア番", cardClass: "generic", cost: 2, attack: 1, durability: 2, drive: 1, defense: 1, text: "防衛1。" }),
    unit({ id: "gen_drive_scout", name: "ドライブ斥候", cardClass: "generic", cost: 2, attack: 1, durability: 1, drive: 2, text: "ターン開始時のドライブ増加量が高い。" }),
    unit({ id: "gen_steady_attacker", name: "定石の攻め手", cardClass: "generic", cost: 3, attack: 2, durability: 2, drive: 1, text: "扱いやすい中型ユニット。" }),
    unit({ id: "gen_iron_wall", name: "即席バリケード", cardClass: "generic", cost: 3, attack: 1, durability: 3, drive: 1, defense: 2, text: "防衛2。" }),
    unit({ id: "gen_heavy_vanguard", name: "重装先鋒", cardClass: "generic", cost: 4, attack: 2, durability: 3, drive: 2, text: "耐久に優れる標準ユニット。" }),
    spell({ id: "gen_quick_draw", name: "クイックドロー", cardClass: "generic", cost: 1, effect: "draw1", text: "カードを1枚引く。" }),
    spell({ id: "gen_field_medic", name: "フィールドメディック", cardClass: "generic", cost: 2, effect: "heal2", text: "自分のライフを2回復する。" }),
    spell({ id: "gen_point_shot", name: "ポイントショット", cardClass: "generic", cost: 2, effect: "pingEnemy1", text: "相手の場のカード1枚の耐久を1減らす。" }),
    spell({ id: "gen_tactical_shift", name: "タクティカルシフト", cardClass: "generic", cost: 2, effect: "chargeExchange3", text: "自分のチャージからコスト3以下のカード1枚を手札1枚と交換する。" }),
    spell({ id: "gen_drive_spark", name: "ドライブスパーク", cardClass: "generic", cost: 3, effect: "gainDrive2", text: "ドライブ+2。" }),
    core({ id: "gen_supply_core", name: "補給コア", cardClass: "generic", cost: 2, durability: 2, effect: "draw1", text: "登場時、カードを1枚引く。" }),
    core({ id: "gen_repair_core", name: "修復コア", cardClass: "generic", cost: 2, durability: 3, activate: { ap: 1, effect: "heal1" }, text: "起動: AP1を払う。自分のライフを1回復する。" }),
    core({ id: "gen_drive_core", name: "駆動コア", cardClass: "generic", cost: 3, durability: 2, activate: { ap: 2, effect: "gainDrive2" }, text: "起動: AP2を払う。ドライブ+2。" }),
  ];

  const bladerCards = [
    unit({ id: "bla_cut_runner", name: "切込ランナー", cardClass: "blader", cost: 1, attack: 1, durability: 1, drive: 1, accelerate: 1, text: "加速1。" }),
    unit({ id: "bla_twin_edge", name: "双刃の斬り手", cardClass: "blader", cost: 2, attack: 2, durability: 1, drive: 1, text: "2回攻撃を割り振れる軽量ユニット。" }),
    unit({ id: "bla_spark_fencer", name: "閃光フェンサー", cardClass: "blader", cost: 2, attack: 1, durability: 1, drive: 1, accelerate: 1, effect: "bladerMomentum", text: "加速1。登場時、このターン攻撃を2回以上割り振っていればカードを1枚引く。" }),
    unit({ id: "bla_mark_blade", name: "刻印ブレード", cardClass: "blader", cost: 3, attack: 2, durability: 2, drive: 1, effect: "gainDriveIfAttacked3", text: "登場時、このターン攻撃を3回以上割り振っていればドライブ+2。" }),
    unit({ id: "bla_step_slasher", name: "ステップスラッシャー", cardClass: "blader", cost: 3, attack: 3, durability: 1, drive: 1, text: "攻撃回数が多いが耐久は低い。" }),
    unit({ id: "bla_edge_guard", name: "刃の護衛", cardClass: "blader", cost: 3, attack: 1, durability: 2, drive: 1, defense: 1, text: "防衛1。" }),
    unit({ id: "bla_chain_dancer", name: "連鎖剣舞", cardClass: "blader", cost: 4, attack: 2, durability: 2, drive: 2, effect: "leaderDamageIfAttacked4", text: "登場時、このターン攻撃を4回以上割り振っていれば相手リーダーに1ダメージ。" }),
    unit({ id: "bla_cross_raider", name: "クロスレイダー", cardClass: "blader", cost: 4, attack: 3, durability: 2, drive: 1, text: "攻撃回数で圧をかける中型ユニット。" }),
    spell({ id: "bla_opening_cut", name: "開幕斬り", cardClass: "blader", cost: 1, effect: "pingEnemy1", text: "相手の場のカード1枚の耐久を1減らす。" }),
    spell({ id: "bla_follow_through", name: "追撃姿勢", cardClass: "blader", cost: 2, effect: "drawIfAttacked3", text: "このターン攻撃を3回以上割り振っていればカードを2枚引く。そうでないなら1枚引く。" }),
    core({ id: "bla_training_ring", name: "訓練リング", cardClass: "blader", cost: 2, durability: 2, activate: { ap: 1, effect: "gainDriveIfAttacked3" }, text: "起動: AP1を払う。このターン攻撃を3回以上割り振っていればドライブ+2。" }),
    core({ id: "bla_blade_lane", name: "ブレードレーン", cardClass: "blader", cost: 3, durability: 3, activate: { ap: 2, effect: "leaderDamageIfAttacked4" }, text: "起動: AP2を払う。このターン攻撃を4回以上割り振っていれば相手リーダーに1ダメージ。" }),
  ];

  const fortressCards = [
    unit({ id: "for_gate_guard", name: "門番ガード", cardClass: "fortress", cost: 1, attack: 1, durability: 2, drive: 1, defense: 1, text: "防衛1。" }),
    unit({ id: "for_shield_bearer", name: "盾持ち兵", cardClass: "fortress", cost: 2, attack: 1, durability: 2, drive: 1, defense: 2, text: "防衛2。" }),
    unit({ id: "for_core_mason", name: "コア石工", cardClass: "fortress", cost: 2, attack: 1, durability: 1, drive: 1, effect: "repairOwnCore1", text: "登場時、自分のコア1枚の耐久を1回復する。" }),
    unit({ id: "for_bastion_squire", name: "砦の従士", cardClass: "fortress", cost: 3, attack: 1, durability: 3, drive: 1, defense: 1, text: "防衛1。" }),
    unit({ id: "for_counter_wall", name: "反撃ウォール", cardClass: "fortress", cost: 3, attack: 2, durability: 2, drive: 1, defense: 1, effect: "gainDriveIfCore", text: "防衛1。登場時、自分の場にコアがあればドライブ+2。" }),
    unit({ id: "for_bulwark_knight", name: "城壁騎士", cardClass: "fortress", cost: 4, attack: 2, durability: 3, drive: 2, defense: 2, text: "防衛2。" }),
    unit({ id: "for_hold_line", name: "戦線維持兵", cardClass: "fortress", cost: 4, attack: 1, durability: 4, drive: 2, defense: 2, text: "防衛2。高耐久の守り役。" }),
    unit({ id: "for_gate_colossus", name: "ゲートコロッサス", cardClass: "fortress", cost: 5, attack: 2, durability: 4, drive: 2, defense: 3, text: "防衛3。" }),
    spell({ id: "for_repair_order", name: "修復命令", cardClass: "fortress", cost: 1, effect: "repairOwnCore1", text: "自分のコア1枚の耐久を1回復する。対象がなければカードを1枚引く。" }),
    spell({ id: "for_safe_route", name: "退避ルート", cardClass: "fortress", cost: 2, effect: "heal2", text: "自分のライフを2回復する。" }),
    core({ id: "for_watchtower", name: "見張り塔", cardClass: "fortress", cost: 2, durability: 3, activate: { ap: 1, effect: "gainDriveIfCore" }, text: "起動: AP1を払う。自分の場に他のコアがあればドライブ+2。" }),
    core({ id: "for_citadel_core", name: "城塞コア", cardClass: "fortress", cost: 4, durability: 4, activate: { ap: 2, effect: "heal2" }, text: "起動: AP2を払う。自分のライフを2回復する。" }),
  ];

  const alchemistCards = [
    unit({ id: "alc_vial_runner", name: "試薬ランナー", cardClass: "alchemist", cost: 1, attack: 1, durability: 1, drive: 1, effect: "gainDriveIfCharge4", text: "登場時、自分のチャージが4枚以上ならドライブ+1。" }),
    unit({ id: "alc_charge_apprentice", name: "チャージ見習い", cardClass: "alchemist", cost: 2, attack: 1, durability: 1, drive: 2, text: "ドライブ値が高い軽量ユニット。" }),
    unit({ id: "alc_retort_guard", name: "レトルトガード", cardClass: "alchemist", cost: 2, attack: 1, durability: 2, drive: 1, defense: 1, text: "防衛1。" }),
    unit({ id: "alc_formula_scribe", name: "式写しの書記", cardClass: "alchemist", cost: 3, attack: 1, durability: 2, drive: 2, effect: "chargeExchange3", text: "登場時、自分のチャージからコスト3以下のカード1枚を手札1枚と交換できる。" }),
    unit({ id: "alc_catalyst_mage", name: "触媒術師", cardClass: "alchemist", cost: 3, attack: 2, durability: 1, drive: 2, effect: "gainDrive2", text: "登場時、ドライブ+2。" }),
    unit({ id: "alc_gear_homunculus", name: "歯車ホムンクルス", cardClass: "alchemist", cost: 4, attack: 2, durability: 2, drive: 2, effect: "drawIfCharge6", text: "登場時、自分のチャージが6枚以上ならカードを2枚引く。そうでないなら1枚引く。" }),
    unit({ id: "alc_reactor_sage", name: "反応炉の賢者", cardClass: "alchemist", cost: 4, attack: 2, durability: 2, drive: 3, text: "高いドライブ値で中盤以降のドライブを早める。" }),
    unit({ id: "alc_gold_engine", name: "金色エンジン", cardClass: "alchemist", cost: 5, attack: 2, durability: 3, drive: 3, text: "盤面に残ると大きくドライブを伸ばす。" }),
    spell({ id: "alc_transmute", name: "トランスミュート", cardClass: "alchemist", cost: 1, effect: "chargeExchange3", text: "自分のチャージからコスト3以下のカード1枚を手札1枚と交換する。" }),
    spell({ id: "alc_overcharge", name: "オーバーチャージ", cardClass: "alchemist", cost: 2, effect: "gainDrive2", text: "ドライブ+2。" }),
    core({ id: "alc_converter", name: "変換炉", cardClass: "alchemist", cost: 2, durability: 2, activate: { ap: 1, effect: "chargeExchange3" }, text: "起動: AP1を払う。チャージ交換を行う。" }),
    core({ id: "alc_drive_lab", name: "ドライブ実験室", cardClass: "alchemist", cost: 3, durability: 3, activate: { ap: 2, effect: "gainDrive3" }, text: "起動: AP2を払う。ドライブ+3。" }),
  ];

  const driveCards = [
    driveUnit({ id: "drive_bla_crimson_edge", name: "紅蓮ドライブ・一閃", cardClass: "blader", driveCost: 5, attack: 2, durability: 2, drive: 2, accelerate: 1, effect: "pingEnemy1", text: "加速1。登場時、相手の場のカード1枚の耐久を1減らす。" }),
    driveUnit({ id: "drive_bla_rapid_tempest", name: "迅風ドライブ・連閃", cardClass: "blader", driveCost: 7, attack: 3, durability: 2, drive: 2, accelerate: 1, text: "加速1。3回攻撃を割り振れる。" }),
    driveUnit({ id: "drive_bla_marked_finisher", name: "刻印ドライブ・終刃", cardClass: "blader", driveCost: 8, attack: 3, durability: 3, drive: 2, activate: { ap: 2, effect: "leaderDamageIfAttacked4" }, text: "起動: AP2を払う。このターン攻撃を4回以上割り振っていれば相手リーダーに1ダメージ。" }),
    driveUnit({ id: "drive_bla_shadow_duo", name: "影双ドライブ", cardClass: "blader", driveCost: 10, attack: 4, durability: 2, drive: 2, accelerate: 1, text: "加速1。攻撃回数が非常に高い。" }),
    driveUnit({ id: "drive_bla_final_arc", name: "終弧ドライブ・アーク", cardClass: "blader", driveCost: 12, attack: 4, durability: 3, drive: 3, activate: { ap: 3, effect: "pingEnemy2" }, text: "起動: AP3を払う。相手の場のカード1枚の耐久を2減らす。" }),
    driveUnit({ id: "drive_bla_flash_code", name: "閃刃コード", cardClass: "blader", driveCost: 13, attack: 3, durability: 3, drive: 3, effect: "drawIfAttacked3", text: "登場時、このターン攻撃を3回以上割り振っていればカードを2枚引く。" }),
    driveUnit({ id: "drive_bla_zenith_slash", name: "天頂斬", cardClass: "blader", driveCost: 15, attack: 4, durability: 4, drive: 3, text: "高い攻撃回数と耐久を持つ切り札。" }),
    driveUnit({ id: "drive_bla_storm_ronin", name: "嵐浪人", cardClass: "blader", driveCost: 16, attack: 5, durability: 2, drive: 3, accelerate: 1, text: "加速1。放置すると大きな打点になる。" }),
    driveUnit({ id: "drive_bla_limit_breaker", name: "リミットブレイカー", cardClass: "blader", driveCost: 18, attack: 5, durability: 3, drive: 4, activate: { ap: 2, discard: 1, effect: "leaderDamage2" }, text: "起動: AP2を払い手札1枚を捨てる。相手リーダーに2ダメージ。" }),
    driveUnit({ id: "drive_bla_last_drive", name: "ラストドライブ・無尽", cardClass: "blader", driveCost: 20, attack: 6, durability: 3, drive: 4, text: "攻撃回数6。試合を決めに行く最終ドライブ。" }),

    driveUnit({ id: "drive_for_shield_angel", name: "盾天ドライブ", cardClass: "fortress", driveCost: 5, attack: 1, durability: 3, drive: 2, defense: 2, text: "防衛2。" }),
    driveUnit({ id: "drive_for_bastion_gate", name: "城門ドライブ", cardClass: "fortress", driveCost: 7, attack: 2, durability: 3, drive: 2, defense: 2, effect: "heal2", text: "防衛2。登場時、自分のライフを2回復する。" }),
    driveUnit({ id: "drive_for_iron_citadel", name: "鉄壁ドライブ・城塞", cardClass: "fortress", driveCost: 8, attack: 2, durability: 4, drive: 2, defense: 3, text: "防衛3。" }),
    driveUnit({ id: "drive_for_core_paladin", name: "コア聖騎士", cardClass: "fortress", driveCost: 10, attack: 2, durability: 4, drive: 3, defense: 2, effect: "repairOwnCore1", text: "防衛2。登場時、自分のコア1枚の耐久を1回復する。" }),
    driveUnit({ id: "drive_for_counter_fort", name: "反攻要塞", cardClass: "fortress", driveCost: 12, attack: 3, durability: 4, drive: 3, defense: 2, activate: { ap: 2, effect: "gainDriveIfCore" }, text: "起動: AP2を払う。自分の場にコアがあればドライブ+2。" }),
    driveUnit({ id: "drive_for_silver_wall", name: "銀壁ドライブ", cardClass: "fortress", driveCost: 13, attack: 2, durability: 5, drive: 3, defense: 3, text: "防衛3。非常に高い耐久を持つ。" }),
    driveUnit({ id: "drive_for_guardian_line", name: "守護戦列", cardClass: "fortress", driveCost: 15, attack: 3, durability: 4, drive: 3, defense: 3, effect: "draw1", text: "防衛3。登場時、カードを1枚引く。" }),
    driveUnit({ id: "drive_for_cannon_keep", name: "砲台城塞", cardClass: "fortress", driveCost: 16, attack: 3, durability: 4, drive: 3, activate: { ap: 3, effect: "pingEnemy2" }, text: "起動: AP3を払う。相手の場のカード1枚の耐久を2減らす。" }),
    driveUnit({ id: "drive_for_oath_bastion", name: "誓約の砦", cardClass: "fortress", driveCost: 18, attack: 3, durability: 5, drive: 4, defense: 4, text: "防衛4。相手の攻撃割り振りを強く縛る。" }),
    driveUnit({ id: "drive_for_world_wall", name: "ワールドウォール", cardClass: "fortress", driveCost: 20, attack: 4, durability: 6, drive: 4, defense: 4, activate: { ap: 2, discard: 1, effect: "heal2" }, text: "防衛4。起動: AP2を払い手札1枚を捨てる。自分のライフを2回復する。" }),

    driveUnit({ id: "drive_alc_quick_synthesis", name: "高速錬成ドライブ", cardClass: "alchemist", driveCost: 5, attack: 2, durability: 2, drive: 3, effect: "chargeExchange3", text: "登場時、チャージ交換を行う。" }),
    driveUnit({ id: "drive_alc_gold_formula", name: "黄金式ドライブ", cardClass: "alchemist", driveCost: 7, attack: 2, durability: 2, drive: 3, effect: "drawIfCharge6", text: "登場時、自分のチャージが6枚以上ならカードを2枚引く。そうでないなら1枚引く。" }),
    driveUnit({ id: "drive_alc_reactor_drake", name: "反応炉ドレイク", cardClass: "alchemist", driveCost: 8, attack: 2, durability: 3, drive: 3, activate: { ap: 1, effect: "gainDrive2" }, text: "起動: AP1を払う。ドライブ+2。" }),
    driveUnit({ id: "drive_alc_vessel_zero", name: "零式ベッセル", cardClass: "alchemist", driveCost: 10, attack: 3, durability: 2, drive: 3, effect: "gainDrive3", text: "登場時、ドライブ+3。" }),
    driveUnit({ id: "drive_alc_clockwork_sage", name: "時計仕掛けの賢者", cardClass: "alchemist", driveCost: 12, attack: 3, durability: 3, drive: 3, activate: { ap: 2, effect: "chargeExchangeAny" }, text: "起動: AP2を払う。チャージからカード1枚を手札1枚と交換する。" }),
    driveUnit({ id: "drive_alc_storm_alembic", name: "嵐のアランビック", cardClass: "alchemist", driveCost: 13, attack: 3, durability: 3, drive: 4, text: "高いドライブ値を持つ中型ドライブ。" }),
    driveUnit({ id: "drive_alc_catalyst_queen", name: "触媒の女王", cardClass: "alchemist", driveCost: 15, attack: 3, durability: 4, drive: 4, activate: { ap: 2, discard: 1, effect: "pingEnemy2" }, text: "起動: AP2を払い手札1枚を捨てる。相手の場のカード1枚の耐久を2減らす。" }),
    driveUnit({ id: "drive_alc_prism_engine", name: "プリズムエンジン", cardClass: "alchemist", driveCost: 16, attack: 4, durability: 3, drive: 4, effect: "draw1", text: "登場時、カードを1枚引く。" }),
    driveUnit({ id: "drive_alc_grand_reaction", name: "大反応ドライブ", cardClass: "alchemist", driveCost: 18, attack: 4, durability: 4, drive: 4, activate: { ap: 3, effect: "gainDrive3" }, text: "起動: AP3を払う。ドライブ+3。" }),
    driveUnit({ id: "drive_alc_philosopher_core", name: "賢者核ドライブ", cardClass: "alchemist", driveCost: 20, attack: 5, durability: 4, drive: 5, activate: { ap: 2, discard: 1, effect: "draw2" }, text: "起動: AP2を払い手札1枚を捨てる。カードを2枚引く。" }),
  ];

  const cardPool = [
    ...genericCards,
    ...bladerCards,
    ...fortressCards,
    ...alchemistCards,
  ];

  const drivePool = driveCards;
  const cards = Object.fromEntries([...cardPool, ...drivePool].map((card) => [card.id, card]));

  const classDecks = {
    blader: {
      bla_cut_runner: 3,
      bla_twin_edge: 3,
      bla_spark_fencer: 3,
      bla_mark_blade: 2,
      bla_step_slasher: 2,
      bla_edge_guard: 2,
      bla_chain_dancer: 2,
      bla_cross_raider: 2,
      bla_opening_cut: 2,
      bla_follow_through: 2,
      bla_training_ring: 1,
      bla_blade_lane: 1,
      gen_front_runner: 2,
      gen_watch_guard: 2,
      gen_line_duelist: 2,
      gen_quick_draw: 2,
      gen_point_shot: 2,
      gen_tactical_shift: 1,
      gen_drive_spark: 1,
      gen_supply_core: 3,
    },
    fortress: {
      for_gate_guard: 3,
      for_shield_bearer: 3,
      for_core_mason: 3,
      for_bastion_squire: 2,
      for_counter_wall: 2,
      for_bulwark_knight: 2,
      for_hold_line: 2,
      for_gate_colossus: 2,
      for_repair_order: 2,
      for_safe_route: 2,
      for_watchtower: 2,
      for_citadel_core: 1,
      gen_watch_guard: 2,
      gen_core_keeper: 2,
      gen_iron_wall: 2,
      gen_quick_draw: 2,
      gen_field_medic: 2,
      gen_tactical_shift: 1,
      gen_repair_core: 1,
      gen_drive_core: 2,
    },
    alchemist: {
      alc_vial_runner: 3,
      alc_charge_apprentice: 3,
      alc_retort_guard: 3,
      alc_formula_scribe: 3,
      alc_catalyst_mage: 2,
      alc_gear_homunculus: 2,
      alc_reactor_sage: 2,
      alc_gold_engine: 2,
      alc_transmute: 3,
      alc_overcharge: 2,
      alc_converter: 2,
      alc_drive_lab: 1,
      gen_front_runner: 2,
      gen_drive_scout: 2,
      gen_quick_draw: 2,
      gen_tactical_shift: 2,
      gen_drive_spark: 2,
      gen_supply_core: 2,
    },
  };

  const classDriveDecks = {
    blader: makeDriveDeck("blader"),
    fortress: makeDriveDeck("fortress"),
    alchemist: makeDriveDeck("alchemist"),
  };

  const starterDeck = classDecks.blader;
  const starterDriveDeck = classDriveDecks.blader;
  const cpuDeck = classDecks.fortress;
  const cpuDriveDeck = classDriveDecks.fortress;

  const cpuDecks = Object.values(CLASSES).map((entry) => ({
    name: `CPU: ${entry.name}`,
    classKey: entry.id,
    deck: classDecks[entry.id],
    driveDeck: classDriveDecks[entry.id],
  }));

  function makeDriveDeck(cardClass) {
    return Object.fromEntries(
      drivePool
        .filter((card) => card.cardClass === cardClass)
        .slice(0, DRIVE_DECK_SIZE)
        .map((card) => [card.id, 1])
    );
  }

  function createCpuDeckVariant(source = {}) {
    return source;
  }

  window.Chrono = window.Chrono || {};
  Object.assign(window.Chrono, {
    DECK_SIZE,
    DRIVE_DECK_SIZE,
    MAX_COPIES,
    MAX_DRIVE_COPIES,
    MAX_LP,
    UNIT_ZONES,
    CORE_ZONES,
    REACTION_ZONES,
    MAX_AP,
    MAX_DRIVE,
    STORAGE_KEY,
    TYPES,
    RARITIES,
    CLASSES,
    typeIcons,
    attrClass,
    typeClass,
    cardPool,
    drivePool,
    cards,
    classDecks,
    classDriveDecks,
    starterDeck,
    starterDriveDeck,
    cpuDeck,
    cpuDriveDeck,
    cpuDecks,
    createCpuDeckVariant,
  });
})();
