(function () {
  "use strict";

  class ScaleManager {
    constructor(options) {
      this.mount = options.mount;
      this.stage = options.stage;
      this.width = options.width;
      this.height = options.height;
      this.padding = options.padding || 16;
      this.resize = this.resize.bind(this);
      window.addEventListener("resize", this.resize);
      window.addEventListener("orientationchange", this.resize);
      this.resize();
    }

    resize() {
      const availableWidth = Math.max(320, window.innerWidth - this.padding);
      const availableHeight = Math.max(320, window.innerHeight - this.padding);
      const scale = Math.min(availableWidth / this.width, availableHeight / this.height);
      document.documentElement.style.setProperty("--ui-scale", scale.toFixed(4));
      this.mount.style.width = `${this.width * scale}px`;
      this.mount.style.height = `${this.height * scale}px`;
      this.stage.style.width = `${this.width}px`;
      this.stage.style.height = `${this.height}px`;
    }
  }

  window.Chrono.ScaleManager = ScaleManager;
})();
