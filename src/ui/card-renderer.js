(function () {
  "use strict";

  const { cards, typeIcons, attrClass, typeClass } = window.Chrono;

  const CARD_ART_ROOT = "assets/cards/art/";
  const CARD_THUMB_ROOT = `${CARD_ART_ROOT}thumbs/`;
  const preloadedArtUrls = new Set();

  class CardRenderer {
    static artSource(card, options = {}) {
      if (!card?.art) return "";
      if (options.large) return card.art;
      return card.thumb || thumbPathForArt(card.art);
    }

    static cardFace(content) {
      return `<div class="card-face">${content}</div>`;
    }

    static libraryCard(card, count, selected, options = {}) {
      const defaultLimit = this.isDriveCard(card) ? window.Chrono.MAX_DRIVE_COPIES : window.Chrono.MAX_COPIES;
      const limit = Number.isFinite(options.limit) ? options.limit : defaultLimit;
      const owned = Number.isFinite(options.owned) ? options.owned : limit;
      const royalOwned = Number.isFinite(options.royalOwned) ? options.royalOwned : 0;
      const finish = options.finish || "normal";
      const button = document.createElement("button");
      button.type = "button";
      button.className = this.cardClassName("library-card", card, { selected, finish });
      button.innerHTML = this.cardFace(`
        ${this.cardHeader(card)}
        ${this.cardArt(card)}
        ${this.cornerStats(card)}
        ${this.rulesBox(card)}
        <div class="deck-row-sub">${finish === "royal" ? "ROYAL / " : ""}投入 ${count} / ${limit} / 所持 ${owned}${finish !== "royal" && royalOwned > 0 ? ` / R ${royalOwned}` : ""}</div>
      `);
      return button;
    }

    static preview(value, target, options = {}) {
      const id = this.cardId(value);
      const finish = options.finish || this.cardFinish(value);
      const card = cards[id];
      if (!card) {
        target.innerHTML = `<div class="small-note">カード未選択</div>`;
        return;
      }
      target.innerHTML = `
        <div class="${this.cardClassName("preview-card zoomable-card", card, { finish })}" data-zoom-card data-card-id="${escapeHtml(card.id)}" data-card-finish="${escapeHtml(finish)}">
          ${this.cardFace(`
            ${this.cardHeader(card, "h3")}
            ${this.cardArt(card, true)}
            ${this.cornerStats(card)}
            ${this.rulesBox(card)}
          `)}
        </div>
      `;
    }

    static focus(value, target, options = {}) {
      const id = this.cardId(value);
      const finish = options.finish || this.cardFinish(value);
      const card = cards[id];
      if (!card) {
        target.innerHTML = `<div class="small-note">カード未選択</div>`;
        return;
      }
      target.innerHTML = `
        <div class="focus-card-detail ${typeClass[card.type] || ""} ${attrClass[card.attr] || ""}">
          <div class="focus-card-copy">
            <div>
              <p class="focus-type">${this.metaLine(card)}</p>
              <h3>${escapeHtml(card.name)}</h3>
              ${this.focusStats(card)}
            </div>
            <div class="focus-effect-text">${escapeHtml(card.text || "効果なし")}</div>
          </div>
          <div class="${this.cardClassName("focus-mini-card zoomable-card", card, { finish })}" data-zoom-card data-card-id="${escapeHtml(card.id)}" data-card-finish="${escapeHtml(finish)}">
            ${this.cardFace(`
              ${this.cardHeader(card)}
              ${this.cardArt(card)}
              ${this.cornerStats(card)}
              ${this.rulesBox(card)}
            `)}
          </div>
        </div>
      `;
    }

    static facedownFocus(target, label = "非公開カード") {
      target.innerHTML = `
        <div class="focus-card-detail facedown-detail">
          <div class="focus-card-copy">
            <div>
              <p class="focus-type">非公開</p>
              <h3>${escapeHtml(label)}</h3>
            </div>
            <div class="focus-effect-text">カード内容は公開されていません。</div>
          </div>
          <div class="focus-mini-card tcg-card facedown zoomable-card" data-zoom-facedown="true" aria-hidden="true"></div>
        </div>
      `;
    }

    static tcgCard(value, options = {}) {
      const id = this.cardId(value);
      const finish = options.finish || this.cardFinish(value);
      const card = cards[id];
      const button = document.createElement("button");
      button.type = "button";
      if (options.facedown || !card) {
        button.className = `tcg-card small facedown ${options.interactive ? "interactive" : ""} ${options.selected ? "selected" : ""}`;
        button.setAttribute("aria-label", "非公開カード");
        return button;
      }
      button.className = this.cardClassName("tcg-card", card, {
        finish,
        small: options.small,
        interactive: options.interactive,
        selected: options.selected,
      });
      button.dataset.zoomCard = "";
      button.dataset.cardId = card.id;
      button.dataset.cardFinish = finish;
      button.innerHTML = this.cardFace(`
        ${this.cardHeader(card)}
        ${this.cardArt(card)}
        ${this.cornerStats(card)}
        ${this.rulesBox(card)}
        ${options.stateTag ? `<span class="state-tag">${escapeHtml(options.stateTag)}</span>` : ""}
      `);
      return button;
    }

    static cardClassName(base, card, options = {}) {
      return [
        base,
        "game-card",
        typeClass[card?.type] || "",
        attrClass[card?.attr] || "",
        this.rarityClass(card),
        this.finishClass(options.finish),
        options.small ? "small" : "",
        options.interactive ? "interactive" : "",
        options.selected ? "selected" : "",
      ].filter(Boolean).join(" ");
    }

    static cardHeader(card, headingTag = "span") {
      return `
        <div class="card-mini-top">
          <${headingTag} class="card-name">${escapeHtml(card.name)}</${headingTag}>
        </div>
      `;
    }

    static cardArt(card, large = false) {
      const artClass = large ? "card-art large" : "card-art";
      if (card.art) {
        const image = this.artSource(card, { large });
        preloadCardArt(image);
        return `<div class="${artClass} has-image" style="--card-art-url: url('${escapeCssUrl(image)}')" aria-label="${escapeHtml(card.name)}"></div>`;
      }
      return `
        <div class="${artClass} placeholder-art">
          <svg aria-hidden="true"><use href="#icon-${typeIcons[card.type] || "star"}"></use></svg>
        </div>
      `;
    }

    static cornerStats(card) {
      const chips = [`<span class="card-stat-chip card-cost-chip">${card.cost}</span>`];
      if (this.hasDriveValue(card)) chips.push(`<span class="card-stat-chip card-drive-chip">${card.drive}</span>`);
      if (this.hasAtk(card)) chips.push(`<span class="card-stat-chip card-attack-chip">${card.attack}</span>`);
      if (this.hasDurability(card)) chips.push(`<span class="card-stat-chip card-durability-chip">${card.durability}</span>`);
      return chips.join("");
    }

    static rulesBox(card) {
      return `<div class="rules-box"><div class="type-line">${this.metaLine(card)}</div></div>`;
    }

    static metaLine(card) {
      const costLabel = this.isDriveCard(card) ? `ドライブ${card.driveCost ?? card.cost}` : `コスト${card.cost}`;
      return `${card.type} / ${card.attr} / ${costLabel}`;
    }

    static focusStats(card) {
      const items = [];
      if (this.hasAtk(card)) items.push(`攻撃回数 ${card.attack}`);
      if (this.hasDurability(card)) items.push(`耐久 ${card.durability}`);
      if (this.hasDriveValue(card)) items.push(`ドライブ値 ${card.drive}`);
      if (card.accelerate) items.push(`加速${card.accelerate}`);
      if (card.defense) items.push(`防衛${card.defense}`);
      if (!items.length) return "";
      return `<p class="focus-stats">${items.map(escapeHtml).join(" / ")}</p>`;
    }

    static shortDriveType(type) {
      return String(type || "").replace("ドライブ", "D");
    }

    static shortDriveTypeHtml(type) {
      return escapeHtml(this.shortDriveType(type));
    }

    static metaLabelHtml(card, options = {}) {
      const type = options.shortDrive && this.isDriveCard(card) ? this.shortDriveType(card.type) : card.type;
      const owned = options.ownedLabel ? ` / ${options.ownedLabel}` : "";
      const total = options.totalLabel ? ` / ${options.totalLabel}` : "";
      return `${escapeHtml(type)} / ${escapeHtml(card.attr)}${escapeHtml(owned)}${escapeHtml(total)}`;
    }

    static effectSizeClass(text) {
      const length = Array.from(text || "").length;
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

    static unitStats(card) {
      if (!this.hasAtk(card)) return "";
      return `
        <div class="battle-stats compact-stats">
          <span>攻撃 <strong>${card.attack}</strong></span>
          <span>耐久 <strong>${card.durability}</strong></span>
        </div>
      `;
    }

    static previewStats(card) {
      return this.unitStats(card);
    }

    static rubyText(text) {
      return escapeHtml(text || "");
    }

    static isDriveCard(card) {
      return Boolean(card?.driveKind || card?.type === "ドライブユニット");
    }

    static isDriveType(type) {
      return String(type || "").includes("ドライブ");
    }

    static hasAtk(card) {
      return card?.type === "ユニット" || card?.type === "ドライブユニット";
    }

    static hasDriveValue(card) {
      return this.hasAtk(card);
    }

    static hasDurability(card) {
      return this.hasAtk(card) || card?.type === "コア";
    }

    static cardId(value) {
      return typeof value === "string" ? value : value?.id;
    }

    static cardFinish(value) {
      return typeof value === "object" && value?.finish === "royal" ? "royal" : "normal";
    }

    static rarityClass(card) {
      const rarity = String(card?.rarity || "bronze").toLowerCase();
      return ["bronze", "silver", "gold", "rainbow"].includes(rarity) ? `rarity-${rarity}` : "rarity-bronze";
    }

    static finishClass(finish) {
      return finish === "royal" ? "finish-royal" : "";
    }
  }

  function preloadCardArt(src) {
    if (!src || preloadedArtUrls.has(src) || typeof Image !== "function") return;
    preloadedArtUrls.add(src);
    const image = new Image();
    image.decoding = "async";
    image.src = src;
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

  function escapeCssUrl(value) {
    return String(value).replace(/[\\'"\n\r\f]/g, (char) => ({
      "\\": "\\\\",
      "'": "\\'",
      "\"": "\\\"",
      "\n": "\\A ",
      "\r": "\\D ",
      "\f": "\\C ",
    })[char]);
  }

  function thumbPathForArt(art) {
    if (!art || !art.startsWith(CARD_ART_ROOT) || art.startsWith(CARD_THUMB_ROOT)) return art;
    return `${CARD_THUMB_ROOT}${art.slice(CARD_ART_ROOT.length).replace(/\.[^/.]+$/, ".jpg")}`;
  }

  window.Chrono.CardRenderer = CardRenderer;
})();
