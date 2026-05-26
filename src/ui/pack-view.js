(function () {
  "use strict";

  const { CardRenderer, CardZoom } = window.Chrono;

  class PackView {
    constructor(options) {
      this.store = options.store;
      this.els = options.els;
      this.toast = options.toast;
      this.setView = options.setView || (() => {});
      this.onCollectionChange = options.onCollectionChange || (() => {});
      this.selectedPackId = this.store.packDefinitions[0]?.id || "";
      this.lastResultPack = null;
      this.lastResultCount = 0;
      this.bindEvents();
    }

    bindEvents() {
      this.els.openSelectedPackButton?.addEventListener("click", () => this.openSelectedPack());
      this.els.packResultAgainButton?.addEventListener("click", () => this.openSelectedPack());
      this.els.packResultBackButton?.addEventListener("click", () => {
        this.setView("pack");
        this.render();
      });
      this.els.packResultGrid?.addEventListener("click", (event) => CardZoom.openFromEvent(event));
    }

    render() {
      const packs = this.store.packDefinitions;
      if (!packs.some((pack) => pack.id === this.selectedPackId)) this.selectedPackId = packs[0]?.id || "";
      const selected = this.selectedPack;
      if (this.els.headerGachaStoneCount) this.els.headerGachaStoneCount.textContent = this.store.isAuthorAccount ? "作者" : String(this.store.gems);
      if (this.els.headerDustCount) this.els.headerDustCount.textContent = String(this.store.dust);
      const canOpen = Boolean(selected) && (this.store.isAuthorAccount || this.store.gems >= this.store.packCost);
      if (this.els.openSelectedPackButton) {
        this.els.openSelectedPackButton.innerHTML = this.openButtonHtml();
        this.els.openSelectedPackButton.disabled = !canOpen;
      }
      if (this.els.packResultAgainButton) {
        this.els.packResultAgainButton.innerHTML = this.openButtonHtml(true);
        this.els.packResultAgainButton.disabled = !canOpen;
      }
      if (this.els.selectedPackEyebrow) this.els.selectedPackEyebrow.textContent = selected ? `${selected.count} cards` : "Selected Pack";
      if (this.els.selectedPackTitle) this.els.selectedPackTitle.textContent = selected?.name || "パックを選択";
      if (this.els.packResultEyebrow) this.els.packResultEyebrow.textContent = this.lastResultCount ? `${this.lastResultCount} cards` : "Pack Result";
      if (this.els.packResultTitle) this.els.packResultTitle.textContent = this.lastResultPack ? `${this.lastResultPack.name} 開封結果` : "開封結果";
      this.renderSelectedPackPreview(selected);
      this.renderPackList(packs);
      if (this.els.packResultGrid && this.els.packResultGrid.childElementCount === 0) {
        this.els.packResultGrid.innerHTML = `<div class="pack-empty-note">開封結果はここに表示されます。</div>`;
      }
    }

    openButtonHtml(again = false) {
      if (this.store.isAuthorAccount) return again ? "もう一度開封" : "開封";
      return again
        ? `<img class="item-icon" src="assets/ui/gacha-stone.png" alt=""> もう一度開封`
        : `<img class="item-icon" src="assets/ui/gacha-stone.png" alt=""> ${this.store.packCost}で開封`;
    }

    renderSelectedPackPreview(selected) {
      const preview = this.els.selectedPackPreview;
      if (!preview) return;
      if (!selected) {
        preview.replaceChildren();
        return;
      }
      preview.innerHTML = `
        <span class="pack-selected-cover">
          ${selected.cover ? `<img src="${selected.cover}" alt="">` : ""}
        </span>
        <span class="pack-selected-info">
          <strong>${selected.name}</strong>
          <small>${selected.description}</small>
          <small>${selected.count}種収録</small>
        </span>
      `;
    }

    renderPackList(packs) {
      const list = this.els.packList;
      if (!list) return;
      list.replaceChildren();
      packs.forEach((pack) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "pack-option";
        button.classList.toggle("active", pack.id === this.selectedPackId);
        button.innerHTML = `
          <span class="pack-cover-wrap">
            ${pack.cover ? `<img class="pack-cover-image" src="${pack.cover}" alt="">` : ""}
          </span>
          <span class="pack-option-info">
            <strong>${pack.name}</strong>
            <small>${pack.description}</small>
            <small>${pack.count}種収録</small>
          </span>
        `;
        button.addEventListener("click", () => {
          this.selectedPackId = pack.id;
          this.clearResults();
          this.render();
        });
        list.append(button);
      });
    }

    openSelectedPack() {
      const result = this.store.openPack(this.selectedPackId);
      if (!result.ok) {
        if (result.reason === "gems") this.toast("ガチャ石が足りません。CPU戦で入手できます。");
        else this.toast("開封できるパックがありません。");
        this.render();
        return;
      }
      this.lastResultPack = result.pack;
      this.renderResults(result.results, result.pack);
      this.onCollectionChange();
      this.render();
      this.setView("packResult");
      this.toast(result.royalPack ? "ロイヤルパック！ 全カードがレア加工です。" : `${result.pack.name}を開封しました。`);
    }

    renderResults(results, pack = this.selectedPack) {
      const grid = this.els.packResultGrid;
      if (!grid) return;
      this.lastResultCount = results.length;
      grid.replaceChildren();
      if (this.els.packResultEyebrow) this.els.packResultEyebrow.textContent = `${results.length} cards`;
      if (this.els.packResultTitle) this.els.packResultTitle.textContent = `${pack?.name || "パック"} 開封結果`;
      results.forEach((entry, index) => {
        const card = CardRenderer.tcgCard(entry.id, { interactive: true, finish: entry.finish });
        card.classList.add("pack-result-card");
        card.dataset.zoomCard = "true";
        card.dataset.cardId = entry.id;
        card.dataset.cardFinish = entry.finish;
        card.style.setProperty("--pack-index", index);
        card.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          CardZoom.open(entry.id, { finish: entry.finish });
        });
        const badge = document.createElement("div");
        badge.className = "pack-owned-badge";
        badge.innerHTML = `${entry.royalPack ? "全ロイヤル / " : ""}${entry.guaranteed ? "確定 / " : ""}${entry.finish === "royal" ? `<span class="finish-label">ROYAL</span> / ` : ""}${entry.isNew ? "NEW" : `所持 ${entry.before} -&gt; ${entry.after}`}`;
        const slot = document.createElement("div");
        slot.className = "pack-result-slot";
        slot.append(card, badge);
        grid.append(slot);
      });
    }

    clearResults() {
      this.lastResultPack = null;
      this.lastResultCount = 0;
      this.els.packResultGrid?.replaceChildren();
    }

    get selectedPack() {
      return this.store.packDefinitions.find((pack) => pack.id === this.selectedPackId) || null;
    }
  }

  window.Chrono.PackView = PackView;
})();
