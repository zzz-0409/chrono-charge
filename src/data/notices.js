(function () {
  "use strict";

  window.Chrono = window.Chrono || {};

  // Card-addition automation can append a new entry here after it updates cards.js.
  window.Chrono.notices = [
    {
      id: "2026-05-29-sosai-support",
      date: "2026.05.29",
      badge: "カード追加",
      title: "双彩サポートカード追加",
      summary: "双彩に相方を呼び込む新カードを追加しました。パートナー関係をそろえやすくし、バックステージからの立て直しも狙えます。",
      cardIds: [
        "sosai_partner_call_ai",
        "sosai_backstage_call",
        "generic_rearguard_aide",
      ],
      pack: {
        theme: "双彩",
        title: "双彩パック更新",
        text: "双彩パックに新しい双彩カード2種が収録されました。5枚目はこれまで通り双彩カード確定です。汎用後衛補佐員は共通プールに追加されています。",
      },
    },
    {
      id: "2026-05-28-keikan-theme",
      date: "2026.05.28",
      badge: "新テーマ",
      title: "新テーマ「契環」登場",
      summary: "誓約書、証環、裁定で戦場の約束を形にする新テーマです。チャージに契環のカード種類をそろえるほど、追加効果とドライブの圧力が強まります。",
      cardIds: [
        "keikan_scribe_yura",
        "keikan_charm_ren",
        "keikan_mediator_sae",
        "keikan_oathbearer_kuga",
        "keikan_ring_adept_may",
        "keikan_oath_script",
        "keikan_seal_exchange",
        "keikan_witness_ring",
        "keikan_binding_clause",
        "keikan_null_clause",
        "drive_keikan_unit",
        "drive_keikan_core",
        "drive_keikan_react_effect",
        "generic_supply_box",
      ],
      story: {
        title: "契環ストーリー",
        paragraphs: [
          "月下の記録都市では、交わされた約束そのものが力になります。書記が条項を記し、護符兵が証環を守り、調停者たちは破約の火種を静かに裁定します。",
          "ユニット、スペル、リアクション、コアがチャージにそろうほど契約は強い効力を持ち、円環審判リヴァと盟約の玉座が戦場の約束を一つの裁定へ束ねます。",
        ],
      },
      pack: {
        theme: "契環",
        title: "契環パック追加",
        text: "新テーマ用の契環パックを追加しました。契環テーマカード13種を収録し、5枚目は契環カード確定です。",
      },
    },
    {
      id: "2026-05-27-star-cyber-support",
      date: "2026.05.27",
      badge: "カード追加",
      title: "星導・電脳サポートカード追加",
      summary: "星導と電脳に低コストの展開補助カードを追加しました。既存テーマの物語も少し広がっています。",
      cardIds: [
        "star_surveyor_noll",
        "star_observation_record",
        "generic_watch_drone",
        "cyber_packet_mana",
        "cyber_trace_route",
        "generic_field_medic",
      ],
      pack: {
        title: "星導・電脳パック更新",
        text: "星導パックと電脳パックは、それぞれ新しいテーマカードを含むよう更新されました。汎用カードは共通プールから入手できます。",
      },
    },
  ];
})();
