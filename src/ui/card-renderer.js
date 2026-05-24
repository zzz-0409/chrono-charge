(function () {
  "use strict";

  const { cards, typeIcons, attrClass, typeClass } = window.Chrono;

  const rubyTerms = [
    ["ドライブ召喚", "どらいぶしょうかん"],
    ["ドライブ発動", "どらいぶはつどう"],
    ["ユニットドライブ", "ゆにっとどらいぶ"],
    ["スペルドライブ", "すぺるどらいぶ"],
    ["リアクションドライブ", "りあくしょんどらいぶ"],
    ["コアドライブ", "こあどらいぶ"],
    ["天星龍", "てんせいりゅう"],
    ["天球儀", "てんきゅうぎ"],
    ["流星招来", "りゅうせいしょうらい"],
    ["恒星防壁", "こうせいぼうへき"],
    ["因果遮断", "いんがしゃだん"],
    ["黒機", "こっき"],
    ["殲滅機兵", "せんめつきへい"],
    ["重圧炉", "じゅうあつろ"],
    ["総分解", "そうぶんかい"],
    ["反撃砲列", "はんげきほうれつ"],
    ["回路封鎖", "かいろふうさ"],
    ["終刃", "しゅうじん"],
    ["審判台", "しんぱんだい"],
    ["無明一閃", "むみょういっせん"],
    ["見切り返し", "みきりがえし"],
    ["裁きの間", "さばきのま"],
    ["量子姫", "りょうしひめ"],
    ["量子中枢", "りょうしちゅうすう"],
    ["全域侵入", "ぜんいきしんにゅう"],
    ["絶対防壁", "ぜったいぼうへき"],
    ["管理者権限", "かんりしゃけんげん"],
    ["プリズムデュオ", "ぷりずむでゅお"],
    ["プリズムステージ", "ぷりずむすてーじ"],
    ["満員アンコール", "まんいんあんこーる"],
    ["ハートガード", "はーとがーど"],
    ["シンクロカーテン", "しんくろかーてん"],
    ["汎用ドライブ", "はんようどらいぶ"],
    ["クロノガーディアン", "くろのがーでぃあん"],
    ["クロノ炉", "くろのろ"],
    ["時空圧縮", "じくうあっしゅく"],
    ["時防壁", "ときぼうへき"],
    ["無効領域", "むこうりょういき"],
    ["攻撃宣言時", "こうげきせんげんじ"],
    ["通常召喚時", "つうじょうしょうかんじ"],
    ["追加召喚時", "ついかしょうかんじ"],
    ["追加召喚", "ついかしょうかん"],
    ["行動済み", "こうどうずみ"],
    ["タップ済み", "たっぷずみ"],
    ["各プレイヤー", "かくぷれいやー"],
    ["全ユニット", "ぜんゆにっと"],
    ["自分フィールド", "じぶんふぃーるど"],
    ["公開", "こうかい"],
    ["内容", "ないよう"],
    ["属性", "ぞくせい"],
    ["伏せ", "ふせ"],
    ["双彩", "そうさい"],
    ["配信室", "はいしんしつ"],
    ["緊急停止", "きんきゅうていし"],
    ["開始", "かいし"],
    ["同調", "どうちょう"],
    ["相方", "あいかた"],
    ["電脳", "でんのう"],
    ["転校生", "てんこうせい"],
    ["委員長", "いいんちょう"],
    ["風紀ランナー", "ふうきらんなー"],
    ["生徒会長", "せいとかいちょう"],
    ["予習", "よしゅう"],
    ["侵入コード", "しんにゅうこーど"],
    ["校内ネット", "こうないねっと"],
    ["即応シールド", "そくおうしーるど"],
    ["カウンターハック", "かうんたーはっく"],
    ["星導", "せいどう"],
    ["斥候", "せっこう"],
    ["戦士", "せんし"],
    ["祈り手", "いのりて"],
    ["衛士", "えいし"],
    ["星龍", "せいりゅう"],
    ["誘い", "さそい"],
    ["連結", "れんけつ"],
    ["再点火", "さいてんか"],
    ["軌道環", "きどうかん"],
    ["防壁", "ぼうへき"],
    ["干渉波", "かんしょうは"],
    ["黒機", "こっき"],
    ["分解者", "ぶんかいしゃ"],
    ["歯車兵", "はぐるまへい"],
    ["固定砲", "こていほう"],
    ["制圧塔", "せいあつとう"],
    ["強襲", "きょうしゅう"],
    ["遮断爪", "しゃだんづめ"],
    ["断刃", "だんじん"],
    ["追跡者", "ついせきしゃ"],
    ["刻印士", "こくいんし"],
    ["影刃兵", "えいじんへい"],
    ["処刑人", "しょけいにん"],
    ["裁断者", "さいだんしゃ"],
    ["断罪斬", "だんざいざん"],
    ["追跡令", "ついせきれい"],
    ["処刑台", "しょけいだい"],
    ["返し刃", "かえしば"],
    ["汎用歩兵", "はんようほへい"],
    ["鋼盾", "こうじゅん"],
    ["見張り", "みはり"],
    ["路地裏", "ろじうら"],
    ["剣士", "けんし"],
    ["装甲", "そうこう"],
    ["突撃", "とつげき"],
    ["量産型", "りょうさんがた"],
    ["城塞", "じょうさい"],
    ["重装", "じゅうそう"],
    ["星屑", "ほしくず"],
    ["巨兵", "きょへい"],
    ["無銘", "むめい"],
    ["守護騎士", "しゅごきし"],
    ["遮断", "しゃだん"],
    ["汎用防壁", "はんようぼうへき"],
    ["緊急転送", "きんきゅうてんそう"],
    ["次元拘束", "じげんこうそく"],
    ["墓地回収", "ぼちかいしゅう"],
    ["ゼロシフト装置", "ぜろしふとそうち"],
    ["召喚時", "しょうかんじ"],
    ["発動時", "はつどうじ"],
    ["墓地", "ぼち"],
    ["手札", "てふだ"],
    ["相手", "あいて"],
    ["自分", "じぶん"],
    ["以上", "いじょう"],
    ["以下", "いか"],
    ["効果", "こうか"],
    ["発動", "はつどう"],
    ["攻撃", "こうげき"],
    ["宣言", "せんげん"],
    ["無効", "むこう"],
    ["破壊", "はかい"],
    ["軽減", "けいげん"],
    ["表向き", "おもてむき"],
    ["最初", "さいしょ"],
    ["戻す", "もどす"],
    ["送る", "おくる"],
    ["受ける", "うける"],
    ["加える", "くわえる"],
    ["場合", "ばあい"],
    ["系統", "けいとう"],
    ["晴れ", "はれ"],
    ["快晴", "かいせい"],
    ["白昼", "はくちゅう"],
    ["豪雨", "ごうう"],
    ["霧雨", "きりさめ"],
    ["旋風", "せんぷう"],
    ["強風", "きょうふう"],
    ["吹雪", "ふぶき"],
    ["氷霧", "ひょうむ"],
    ["流星", "りゅうせい"],
    ["極光", "きょっこう"],
    ["灼熱", "しゃくねつ"],
    ["太陽嵐", "たいようあらし"],
    ["台風", "たいふう"],
    ["幻霧", "げんむ"],
    ["暴風", "ぼうふう"],
    ["竜巻", "たつまき"],
    ["氷河", "ひょうが"],
    ["絶零", "ぜつれい"],
    ["星嵐", "せいらん"],
    ["天啓", "てんけい"],
  ].sort((a, b) => b[0].length - a[0].length);

  const kanjiReadings = {
    上: "うえ", 下: "した", 人: "ひと", 令: "れい", 以: "い", 体: "たい", 候: "こう", 元: "げん",
    会: "かい", 内: "ない", 入: "にゅう", 員: "いん", 園: "えん", 学: "がく", 委: "い", 室: "しつ", 応: "おう",
    数: "すう", 校: "こう", 生: "せい", 紀: "き", 習: "しゅう", 脳: "のう", 侵: "しん", 即: "そく",
    予: "よ", 長: "ちょう", 電: "でん",
    光: "ひかり", 全: "ぜん", 兵: "へい", 再: "さい", 処: "しょ", 刃: "じん", 分: "ぶん", 刑: "けい",
    初: "しょ", 制: "せい", 刻: "こく", 剣: "けん", 加: "くわ", 効: "こう", 動: "どう", 印: "いん",
    収: "しゅう", 受: "う", 召: "しょう", 双: "そう", 台: "だい", 各: "かく", 合: "あ", 名: "な", 向: "む",
    吹: "ふ", 啓: "けい", 喚: "かん", 回: "かい", 固: "こ", 圧: "あつ", 地: "ち", 型: "がた",
    城: "じょう", 場: "ば", 塔: "とう", 塞: "さい", 境: "きょう", 墓: "ぼ", 壁: "へき", 壊: "かい",
    士: "し", 夜: "よる", 天: "てん", 太: "たい", 守: "しゅ", 定: "てい", 宣: "せん", 導: "どう",
    屑: "くず", 嵐: "あらし", 巨: "きょ", 巻: "まき", 干: "かん", 幻: "げん", 張: "ちょう", 強: "きょう",
    影: "かげ", 後: "あと", 快: "かい", 急: "きゅう", 戦: "せん", 戻: "もど", 手: "て", 拘: "こう",
    撃: "げき", 攻: "こう", 斥: "せき", 斬: "ざん", 断: "だん", 旋: "せん", 星: "ほし", 昼: "ひる",
    時: "じ", 晴: "は", 暴: "ぼう", 最: "さい", 札: "ふだ", 束: "そく", 枚: "まい", 果: "か",
    極: "きょく", 機: "き", 次: "じ", 歩: "ほ", 歯: "は", 氷: "こおり", 汎: "はん", 河: "かわ",
    波: "は", 流: "りゅう", 済: "ず", 渉: "しょう", 減: "げん", 火: "か", 灼: "しゃく", 炎: "ほのお",
    停: "てい", 点: "てん", 無: "む", 熱: "ねつ", 爪: "つめ", 環: "かん", 産: "さん", 用: "よう", 甲: "こう",
    発: "はつ", 白: "はく", 相: "あい", 盾: "たて", 砲: "ほう", 破: "は", 祈: "いの", 突: "とつ",
    竜: "りゅう", 結: "けつ", 絶: "ぜつ", 緊: "きん", 罪: "ざい", 置: "ち", 者: "しゃ", 自: "じ",
    行: "こう", 衛: "えい", 表: "おもて", 裁: "さい", 彩: "さい", 装: "そう", 裏: "うら", 襲: "しゅう", 見: "み",
    解: "かい", 言: "げん", 誘: "さそ", 護: "ご", 豪: "ごう", 跡: "せき", 路: "ろ", 車: "しゃ",
    調: "ちょう", 軌: "き", 転: "てん", 軽: "けい", 返: "かえ", 追: "つい", 送: "おく", 連: "れん", 通: "つう", 道: "どう",
    遮: "しゃ", 重: "じゅう", 量: "りょう", 銘: "めい", 鋼: "こう", 防: "ぼう", 陽: "よう", 雨: "あめ",
    配: "はい", 雪: "ゆき", 零: "れい", 霧: "きり", 風: "かぜ", 騎: "き", 黒: "くろ", 龍: "りゅう", 常: "じょう", 信: "しん", 方: "かた", 始: "し",
  };

  const kanjiPattern = /[一-龯々]/;
  const katakanaPattern = /[\u30A0-\u30FF]/;
  const latinPattern = /[A-Za-z]/;
  const latinReadings = {
    AP: "エーピー",
    CPU: "シーピーユー",
    D: "ドライブ",
    DECK: "デッキ",
    DRIVE: "ドライブ",
    LP: "エルピー",
    MAIN: "メイン",
    TCG: "ティーシージー",
  };
  const plainLatinTerms = new Set(["ATK"]);
  const letterReadings = {
    A: "エー",
    B: "ビー",
    C: "シー",
    D: "ディー",
    E: "イー",
    F: "エフ",
    G: "ジー",
    H: "エイチ",
    I: "アイ",
    J: "ジェイ",
    K: "ケー",
    L: "エル",
    M: "エム",
    N: "エヌ",
    O: "オー",
    P: "ピー",
    Q: "キュー",
    R: "アール",
    S: "エス",
    T: "ティー",
    U: "ユー",
    V: "ブイ",
    W: "ダブリュー",
    X: "エックス",
    Y: "ワイ",
    Z: "ゼット",
  };

  class CardRenderer {
    static cardFace(content) {
      return `<div class="card-face">${content}</div>`;
    }

    static libraryCard(card, count, selected) {
      const limit = this.isDriveCard(card) ? window.Chrono.MAX_DRIVE_COPIES : window.Chrono.MAX_COPIES;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `library-card game-card ${typeClass[card.type]} ${attrClass[card.attr]}${selected ? " selected" : ""}`;
      button.innerHTML = this.cardFace(`
        ${this.cardHeader(card)}
        ${this.cardArt(card)}
        ${this.rulesBox(card)}
        ${this.unitStats(card)}
        <div class="deck-row-sub">投入 ${count} / ${limit}</div>
      `);
      return button;
    }

    static preview(id, target) {
      const card = cards[id];
      if (!card) {
        target.innerHTML = `<div class="small-note">カード未選択</div>`;
        return;
      }
      target.innerHTML = `
        <div class="preview-card game-card zoomable-card ${typeClass[card.type]} ${attrClass[card.attr]}" data-zoom-card data-card-id="${card.id}">
          ${this.cardFace(`
            ${this.cardHeader(card, "h3")}
            ${this.cardArt(card, true)}
            ${this.rulesBox(card)}
            ${this.unitStats(card)}
          `)}
        </div>
      `;
    }

    static focus(id, target, options = {}) {
      const card = cards[id];
      if (!card) {
        target.innerHTML = `<div class="small-note">カード未選択</div>`;
        return;
      }
      const atkMod = options.atkMod || 0;
      const displayAtk = this.hasAtk(card) ? card.atk + atkMod : 0;
      target.innerHTML = `
        <div class="focus-card-detail ${typeClass[card.type]} ${attrClass[card.attr]}">
          <div class="focus-card-copy">
            <div>
              <p class="focus-type">${this.rubyText(this.metaLine(card))}</p>
              <h3>${this.rubyText(card.name)}</h3>
              ${this.hasAtk(card) ? `<p class="focus-stats">ATK ${displayAtk}${this.statMod(atkMod, true)}</p>` : ""}
            </div>
            <div class="focus-effect-text">${this.rubyText(card.text)}</div>
          </div>
          <div class="focus-mini-card game-card zoomable-card ${typeClass[card.type]} ${attrClass[card.attr]}" data-zoom-card data-card-id="${card.id}">
            ${this.cardFace(`
              ${this.cardHeader(card)}
              ${this.cardArt(card)}
              ${this.rulesBox(card)}
              ${this.unitStats(card, displayAtk || card.atk, atkMod)}
            `)}
          </div>
        </div>
      `;
    }

    static facedownFocus(target, label = "相手のセットカード") {
      target.innerHTML = `
        <div class="focus-card-detail facedown-detail">
          <div class="focus-card-copy">
            <div>
              <p class="focus-type">${this.rubyText("伏せカード")}</p>
              <h3>${this.rubyText(label)}</h3>
            </div>
            <div class="focus-effect-text">${this.rubyText("カード内容は公開されていません。")}</div>
          </div>
          <div class="focus-mini-card tcg-card facedown zoomable-card" data-zoom-facedown="true" aria-hidden="true"></div>
        </div>
      `;
    }

    static tcgCard(id, options = {}) {
      const card = cards[id];
      const button = document.createElement("button");
      button.type = "button";
      if (options.facedown) {
        button.className = `tcg-card small facedown ${options.interactive ? "interactive" : ""} ${options.selected ? "selected" : ""}`;
        button.setAttribute("aria-label", "セットカード");
        return button;
      }

      const atk = this.hasAtk(card) ? card.atk + (options.atkMod || 0) : 0;
      button.className = `tcg-card game-card ${typeClass[card.type]} ${attrClass[card.attr]} ${options.small ? "small" : ""} ${options.interactive ? "interactive" : ""} ${options.selected ? "selected" : ""}`;
      button.innerHTML = this.cardFace(`
        ${this.cardHeader(card)}
        ${this.cardArt(card)}
        ${this.rulesBox(card)}
        ${this.unitStats(card, atk, options.atkMod || 0)}
        ${options.stateTag ? `<span class="state-tag">${options.stateTag}</span>` : ""}
      `);
      return button;
    }

    static cardHeader(card, headingTag = "span") {
      return `
        <div class="card-mini-top">
          <${headingTag} class="card-name">${this.rubyText(card.name)}</${headingTag}>
          <span class="cost-chip">${card.cost}</span>
        </div>
      `;
    }

    static cardArt(card, large = false) {
      const artClass = large ? "card-art large" : "card-art";
      if (card.art) {
        return `
          <div class="${artClass}">
            <img src="${card.art}" alt="${card.name}">
          </div>
        `;
      }
      return `
        <div class="${artClass} placeholder-art">
          <svg aria-hidden="true"><use href="#icon-${typeIcons[card.type]}"></use></svg>
        </div>
      `;
    }

    static rulesBox(card) {
      return `
        <div class="rules-box">
          <div class="type-line">${this.rubyText(this.metaLine(card))}</div>
          <p class="card-effect ${this.effectSizeClass(card.text)}">${this.rubyText(card.text)}</p>
        </div>
      `;
    }

    static metaLine(card) {
      if (this.isDriveCard(card)) return `${this.shortDriveType(card.type)} / ${card.attr} / コスト${card.cost}`;
      return `${card.type} / ${card.attr} / コスト${card.cost}`;
    }

    static shortDriveType(type) {
      return String(type || "").replace("ドライブ", "D");
    }

    static effectSizeClass(text) {
      const length = Array.from(text).length;
      if (length >= 78) return "effect-xxs";
      if (length >= 58) return "effect-xs";
      if (length >= 42) return "effect-sm";
      return "";
    }

    static statMod(value, parenthesized = false) {
      if (!value) return "";
      const text = `${value > 0 ? "+" : ""}${value}`;
      return parenthesized ? ` <span class="stat-mod">(${text})</span>` : `<em class="stat-mod">${text}</em>`;
    }

    static unitStats(card, atk = card.atk, atkMod = 0) {
      if (!this.hasAtk(card)) return "";
      return `
        <div class="battle-stats compact-stats">
          <span>ATK <strong>${atk}</strong>${this.statMod(atkMod)}</span>
        </div>
      `;
    }

    static previewStats(card) {
      if (!this.hasAtk(card)) return "";
      return `
        <div class="preview-stats">
          <span>ATK<strong>${card.atk}</strong></span>
        </div>
      `;
    }

    static rubyText(text) {
      return renderRuby(String(text || ""));
    }

    static isDriveCard(card) {
      return Boolean(card?.driveKind || card?.type?.includes("ドライブ"));
    }

    static hasAtk(card) {
      return card?.type === "ユニット" || card?.type === "ユニットドライブ";
    }
  }

  function renderRuby(text) {
    let html = "";
    for (let i = 0; i < text.length;) {
      const matched = rubyTerms.find(([term]) => text.startsWith(term, i));
      if (matched) {
        html += renderRubyTerm(matched[0], matched[1]);
        i += matched[0].length;
        continue;
      }

      const char = text[i];
      if (latinPattern.test(char)) {
        const word = readLatinWord(text, i);
        html += plainLatinTerms.has(word.toUpperCase()) ? escapeHtml(word) : ruby(word, englishReading(word));
        i += word.length;
        continue;
      }
      if (kanjiPattern.test(char)) {
        html += ruby(char, kanjiReadings[char] || "");
      } else {
        html += escapeHtml(char);
      }
      i += 1;
    }
    return html;
  }

  function renderRubyTerm(term, reading) {
    if (katakanaPattern.test(term)) return renderRubyWithoutTerms(term);
    return ruby(term, reading);
  }

  function renderRubyWithoutTerms(text) {
    let html = "";
    for (let i = 0; i < text.length;) {
      const char = text[i];
      if (latinPattern.test(char)) {
        const word = readLatinWord(text, i);
        html += plainLatinTerms.has(word.toUpperCase()) ? escapeHtml(word) : ruby(word, englishReading(word));
        i += word.length;
        continue;
      }
      if (kanjiPattern.test(char)) html += ruby(char, kanjiReadings[char] || "");
      else html += escapeHtml(char);
      i += 1;
    }
    return html;
  }

  function readLatinWord(text, start) {
    let end = start;
    while (end < text.length && latinPattern.test(text[end])) end += 1;
    return text.slice(start, end);
  }

  function englishReading(word) {
    const key = String(word || "").toUpperCase();
    if (latinReadings[key]) return latinReadings[key];
    return Array.from(key).map((letter) => letterReadings[letter] || letter).join("");
  }

  function ruby(base, reading) {
    if (!reading) return escapeHtml(base);
    return `<ruby>${escapeHtml(base)}<rt>${escapeHtml(reading)}</rt></ruby>`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    })[char]);
  }

  window.Chrono.CardRenderer = CardRenderer;
})();
