(function () {
  "use strict";

  const { cards, typeIcons, attrClass, typeClass } = window.Chrono;

  class CardRenderer {
    static libraryCard(card, count, selected) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `library-card game-card ${typeClass[card.type]} ${attrClass[card.attr]}${selected ? " selected" : ""}`;
      button.innerHTML = `
        ${this.cardHeader(card)}
        ${this.cardArt(card)}
        ${this.rulesBox(card)}
        ${this.unitStats(card)}
        <div class="deck-row-sub">投入 ${count} / ${window.Chrono.MAX_COPIES}</div>
      `;
      return button;
    }

    static preview(id, target) {
      const card = cards[id];
      if (!card) {
        target.innerHTML = `<div class="small-note">カード未選択</div>`;
        return;
      }
      target.innerHTML = `
        <div class="preview-card game-card ${typeClass[card.type]} ${attrClass[card.attr]}">
          ${this.cardHeader(card, "h3")}
          ${this.cardArt(card, true)}
          ${this.rulesBox(card)}
          ${this.unitStats(card)}
        </div>
      `;
    }

    static focus(id, target) {
      const card = cards[id];
      if (!card) {
        target.innerHTML = `<div class="small-note">カード未選択</div>`;
        return;
      }
      target.innerHTML = `
        <div class="focus-card-detail ${typeClass[card.type]} ${attrClass[card.attr]}">
          <div class="focus-card-copy">
            <div>
              <p class="focus-type">${card.type} / ${card.attr}</p>
              <h3>${card.name}</h3>
              ${card.type === "ユニット" ? `<p class="focus-stats">ATK ${card.atk} / DEF ${card.def}</p>` : ""}
            </div>
            <div class="focus-effect-text">${card.text}</div>
          </div>
          <div class="focus-mini-card game-card ${typeClass[card.type]} ${attrClass[card.attr]}">
            ${this.cardHeader(card)}
            ${this.cardArt(card)}
            ${this.rulesBox(card)}
            ${this.unitStats(card)}
          </div>
        </div>
      `;
    }

    static tcgCard(id, options = {}) {
      const card = cards[id];
      const button = document.createElement("button");
      button.type = "button";
      if (options.facedown) {
        button.className = "tcg-card small facedown";
        button.setAttribute("aria-label", "セットカード");
        return button;
      }

      const atk = card.type === "ユニット" ? card.atk + (options.atkMod || 0) : 0;
      button.className = `tcg-card game-card ${typeClass[card.type]} ${attrClass[card.attr]} ${options.small ? "small" : ""} ${options.interactive ? "interactive" : ""} ${options.selected ? "selected" : ""}`;
      button.innerHTML = `
        ${this.cardHeader(card)}
        ${this.cardArt(card)}
        ${this.rulesBox(card)}
        ${this.unitStats(card, atk)}
        ${options.stateTag ? `<span class="state-tag">${options.stateTag}</span>` : ""}
      `;
      return button;
    }

    static cardHeader(card, headingTag = "span") {
      return `
        <div class="card-mini-top">
          <${headingTag} class="card-name">${card.name}</${headingTag}>
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
          <div class="type-line">${card.type} / ${card.attr} / コスト${card.cost}</div>
          <p class="card-effect ${this.effectSizeClass(card.text)}">${card.text}</p>
        </div>
      `;
    }

    static effectSizeClass(text) {
      const length = Array.from(text).length;
      if (length >= 78) return "effect-xxs";
      if (length >= 58) return "effect-xs";
      if (length >= 42) return "effect-sm";
      return "";
    }

    static unitStats(card, atk = card.atk) {
      if (card.type !== "ユニット") return "";
      return `
        <div class="battle-stats compact-stats">
          <span>ATK <strong>${atk}</strong></span>
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
