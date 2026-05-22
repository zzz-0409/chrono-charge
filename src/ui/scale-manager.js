(function () {
  "use strict";

  class ScaleManager {
    constructor(options) {
      this.mount = options.mount;
      this.stage = options.stage;
      this.width = options.width;
      this.height = options.height;
      this.padding = options.padding ?? 16;
      this.resize = this.resize.bind(this);
      window.addEventListener("resize", this.resize);
      window.addEventListener("orientationchange", this.resize);
      window.visualViewport?.addEventListener("resize", this.resize);
      this.resize();
    }

    resize() {
      const viewport = window.visualViewport || window;
      const availableWidth = Math.max(320, viewport.width - this.padding);
      const availableHeight = Math.max(320, viewport.height - this.padding);
      const scale = Math.min(availableWidth / this.width, availableHeight / this.height);
      const stageWidth = Math.max(this.width, availableWidth / scale);
      const stageHeight = Math.max(this.height, availableHeight / scale);
      document.documentElement.style.setProperty("--ui-scale", scale.toFixed(4));
      document.documentElement.style.setProperty("--stage-width", `${stageWidth}px`);
      document.documentElement.style.setProperty("--stage-height", `${stageHeight}px`);
      this.mount.style.width = `${stageWidth * scale}px`;
      this.mount.style.height = `${stageHeight * scale}px`;
      this.stage.style.width = `${stageWidth}px`;
      this.stage.style.height = `${stageHeight}px`;
    }
  }

  window.Chrono.ScaleManager = ScaleManager;
})();
