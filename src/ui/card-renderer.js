(function () {
  "use strict";

  const { cards, typeIcons, attrClass, typeClass } = window.Chrono;

  class CardRenderer {
    static cardFace(content) {
      return `<div class="card-face">${content}</div>`;
    }

    static libraryCard(card, count, selected) {
      const limit = card.type === "環境" ? 1 : window.Chrono.MAX_COPIES;
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
      const displayAtk = card.type === "ユニット" ? card.atk + atkMod : 0;
      target.innerHTML = `
        <div class="focus-card-detail ${typeClass[card.type]} ${attrClass[card.attr]}">
          <div class="focus-card-copy">
            <div>
              <p class="focus-type">${this.metaLine(card)}</p>
              <h3>${card.name}</h3>
              ${card.type === "ユニット" ? `<p class="focus-stats">ATK ${displayAtk}${this.statMod(atkMod, true)} / DEF ${card.def}</p>` : ""}
            </div>
            <div class="focus-effect-text">${card.text}</div>
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
              <p class="focus-type">伏せカード</p>
              <h3>${label}</h3>
            </div>
            <div class="focus-effect-text">カード内容は公開されていません。</div>
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

      const atk = card.type === "ユニット" ? card.atk + (options.atkMod || 0) : 0;
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
      const chip = card.type === "環境" ? `Lv${card.level}` : card.cost;
      return `
        <div class="card-mini-top">
          <${headingTag} class="card-name">${card.name}</${headingTag}>
          <span class="cost-chip">${chip}</span>
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
          <div class="type-line">${this.metaLine(card)}</div>
          <p class="card-effect ${this.effectSizeClass(card.text)}">${card.text}</p>
        </div>
      `;
    }

    static metaLine(card) {
      if (card.type === "環境") return `${card.type} / ${card.family} / Lv${card.level}`;
      return `${card.type} / ${card.attr} / コスト${card.cost}`;
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
      if (card.type !== "ユニット") return "";
      return `
        <div class="battle-stats compact-stats">
          <span>ATK <strong>${atk}</strong>${this.statMod(atkMod)}</span>
          <span>DEF <strong>${card.def}</strong></span>
        </div>
      `;
    }

    static previewStats(card) {
      if (card.type !== "ユニット") return "";
      return `
        <div class="preview-stats">
          <span>ATK<strong>${card.atk}</strong></span>
          <span>DEF<strong>${card.def}</strong></span>
        </div>
      `;
    }
  }

  window.Chrono.CardRenderer = CardRenderer;
})();
