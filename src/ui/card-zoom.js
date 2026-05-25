(function () {
  "use strict";

  window.Chrono = window.Chrono || {};

  const { CardRenderer } = window.Chrono;
  const zoomBase = { width: 244, height: 366 };
  const zoomMaxWidth = 500;
  const zoomMargin = 48;

  const protectedSelector = [
    ".game-card",
    ".tcg-card",
    ".focus-card-detail",
    ".preview-panel",
    ".selected-panel",
    ".library-panel",
    ".deck-panel",
    ".board-area",
    ".card-zoom-overlay",
  ].join(",");

  class CardZoom {
    constructor() {
      this.overlay = null;
      this.handleKeydown = (event) => {
        if (event.key === "Escape") this.close();
      };
      this.handleResize = () => this.layout();
      this.installInteractionGuards();
    }

    open(id, options = {}) {
      this.close();
      const overlay = document.createElement("div");
      overlay.className = "card-zoom-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "カード拡大表示");
      overlay.innerHTML = `<div class="card-zoom-shell"></div>`;

      const shell = overlay.querySelector(".card-zoom-shell");
      shell.addEventListener("click", (event) => event.stopPropagation());
      if (options.facedown || !id) {
        shell.innerHTML = `<div class="tcg-card facedown card-zoom-facedown" aria-label="伏せカード"></div>`;
      } else {
        CardRenderer.preview(id, shell, { finish: options.finish });
      }

      overlay.addEventListener("click", () => this.close());
      overlay.addEventListener("contextmenu", (event) => event.preventDefault());
      overlay.addEventListener("dragstart", (event) => event.preventDefault());
      overlay.addEventListener("selectstart", (event) => event.preventDefault());

      document.body.append(overlay);
      document.addEventListener("keydown", this.handleKeydown);
      window.addEventListener("resize", this.handleResize);
      this.overlay = overlay;
      this.layout();
    }

    close() {
      if (!this.overlay) return;
      this.overlay.remove();
      this.overlay = null;
      document.removeEventListener("keydown", this.handleKeydown);
      window.removeEventListener("resize", this.handleResize);
    }

    layout() {
      if (!this.overlay) return;
      const shell = this.overlay.querySelector(".card-zoom-shell");
      if (!shell) return;
      const scale = this.scaleForViewport();
      shell.style.width = `${zoomBase.width * scale}px`;
      shell.style.height = `${zoomBase.height * scale}px`;
      shell.style.setProperty("--card-zoom-scale", scale.toFixed(4));
    }

    scaleForViewport() {
      const availableWidth = Math.max(160, window.innerWidth - zoomMargin);
      const availableHeight = Math.max(220, window.innerHeight - zoomMargin);
      return Math.max(0.4, Math.min(
        zoomMaxWidth / zoomBase.width,
        availableWidth / zoomBase.width,
        availableHeight / zoomBase.height,
      ));
    }

    openFromEvent(event) {
      const target = closest(event.target, "[data-zoom-card], [data-zoom-facedown]");
      if (!target) return false;
      event.preventDefault();
      event.stopPropagation();
      this.open(target.dataset.cardId, {
        facedown: target.dataset.zoomFacedown === "true",
        finish: target.dataset.cardFinish,
      });
      return true;
    }

    installInteractionGuards() {
      document.addEventListener("contextmenu", (event) => {
        if (closest(event.target, "input, textarea, [contenteditable='true']")) return;
        if (closest(event.target, protectedSelector)) event.preventDefault();
      });
      document.addEventListener("selectstart", (event) => {
        if (closest(event.target, "input, textarea, [contenteditable='true']")) return;
        if (closest(event.target, protectedSelector)) event.preventDefault();
      });
      document.addEventListener("dragstart", (event) => {
        if (closest(event.target, ".game-card, .tcg-card, img")) event.preventDefault();
      }, true);
    }
  }

  function closest(target, selector) {
    if (target instanceof Element) return target.closest(selector);
    return target?.parentElement?.closest(selector) || null;
  }

  window.Chrono.CardZoom = new CardZoom();
})();
