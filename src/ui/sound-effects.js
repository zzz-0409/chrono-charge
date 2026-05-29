(function () {
  "use strict";

  window.Chrono = window.Chrono || {};

  const SOUND_FILES = {
    draw: "assets/SE/doro-.mp3",
    place: "assets/SE/ka-dohaiti.mp3",
    damage: "assets/SE/dame-ji.mp3",
    destroy: "assets/SE/hakai.mp3",
    activation: "assets/SE/koukahatudou.mp3",
    victory: "assets/SE/shouri.mp3",
    defeat: "assets/SE/haiboku.mp3",
  };

  function prefersLiteAudio() {
    const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches;
    const lowMemory = Number(navigator.deviceMemory || 8) <= 4;
    return Boolean(coarsePointer || lowMemory);
  }

  class SoundEffects {
    constructor() {
      this.volume = 0.72;
      this.enabled = true;
      this.lastPlayedAt = {};
      this.minIntervalMs = 70;
      this.liteAudio = prefersLiteAudio();
      this.audio = Object.fromEntries(Object.entries(SOUND_FILES).map(([key, src]) => {
        const audio = new Audio(src);
        audio.preload = this.liteAudio ? "metadata" : "auto";
        return [key, audio];
      }));
      this.unlocked = false;
      this.installUnlockHandlers();
    }

    installUnlockHandlers() {
      const unlock = () => this.unlock();
      window.addEventListener("pointerdown", unlock, { once: true, passive: true });
      window.addEventListener("keydown", unlock, { once: true });
      window.addEventListener("touchstart", unlock, { once: true, passive: true });
    }

    unlock() {
      if (this.unlocked) return;
      this.unlocked = true;
      const audioList = Object.values(this.audio);
      const unlockList = this.liteAudio ? audioList.slice(0, 1) : audioList;
      unlockList.forEach((audio) => {
        audio.muted = true;
        const promise = audio.play();
        if (promise?.then) {
          promise
            .then(() => {
              audio.pause();
              this.reset(audio);
              audio.muted = false;
            })
            .catch(() => {
              audio.muted = false;
            });
        } else {
          audio.pause();
          this.reset(audio);
          audio.muted = false;
        }
      });
    }

    play(name, options = {}) {
      if (!this.enabled || !this.audio[name]) return;
      const now = performance.now();
      if (now - (this.lastPlayedAt[name] || 0) < this.minIntervalMs) return;
      this.lastPlayedAt[name] = now;
      const audio = this.audio[name];
      audio.pause();
      this.reset(audio);
      audio.volume = Math.max(0, Math.min(1, options.volume ?? this.volume));
      audio.play().catch(() => {
        // Browsers may block sound until the first user gesture.
      });
    }

    reset(audio) {
      try {
        audio.currentTime = 0;
      } catch {
        // Some browsers disallow seeking before metadata is ready.
      }
    }
  }

  window.Chrono.SoundEffects = new SoundEffects();
})();
