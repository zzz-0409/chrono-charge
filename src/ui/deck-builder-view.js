(function () {
  "use strict";

  const {
    DECK_SIZE,
    DRIVE_DECK_SIZE,
    MAX_COPIES,
    MAX_DRIVE_COPIES,
    cardPool,
    drivePool,
    cards,
    CardRenderer,
    CardZoom,
  } = window.Chrono;

  const BUILDER_TOUCH_DRAG_DELAY_MS = 320;
  const BUILDER_TOUCH_SCROLL_CANCEL_DISTANCE = 8;
  const BUILDER_MOUSE_DRAG_DISTANCE = 4;

  class DeckBuilderView {
    constructor(options) {
      this.store = options.store;
      this.els = options.els;
      this.toast = options.toast;
      this.onStartDuel = options.onStartDuel;
      this.onAccountChange = options.onAccountChange || (() => {});
      this.onLoginBonus = options.onLoginBonus || (() => {});
      this.confirmDeleteDeck = options.confirmDeleteDeck || (() => Promise.resolve(false));
      this.openAppModal = options.openAppModal || (() => {});
      this.closeAppModal = options.closeAppModal || (() => {});
      this.deckMode = "main";
      this.selectedCardId = "gen_front_runner";
      this.selectedFinish = "normal";
      this.ownedOnly = false;
      this.builderPointerDrag = null;
      this.builderDragPayload = null;
      this.suppressBuilderClick = false;
      this.handleBuilderPointerMove = (event) => this.moveBuilderPointerDrag(event);
      this.handleBuilderPointerUp = (event) => this.finishBuilderPointerDrag(event);
      this.handleBuilderPointerCancel = (event) => this.cancelBuilderPointerDrag(event);
      this.bindEvents();
      this.render();
    }

    bindEvents() {
      this.els.saveDeckButton.addEventListener("click", () => this.saveActiveDeck());
      this.els.savePresetButton?.addEventListener("click", () => this.saveActiveDeck());
      this.els.saveAsPresetButton?.addEventListener("click", () => {
        if (!this.validateDeckBeforeSave()) return;
        const deck = this.store.saveAs(this.els.deckNameInput.value || this.store.nextDeckName());
        if (this.els.deckPresetSelect) this.els.deckPresetSelect.value = this.store.activeDeckId;
        this.render();
        this.toast(`${deck.name}を新規保存しました。`);
      });
      this.els.loadDeckButton?.addEventListener("click", () => {
        if (!this.store.loadPreset(this.els.deckPresetSelect.value)) return;
        this.selectedCardId = this.firstSelectedId();
        this.render();
        this.toast(`${this.store.activeDeck.name}を読み込みました。`);
      });
      this.els.deletePresetButton?.addEventListener("click", async () => {
        const deck = this.store.activeAccountData.decks[this.els.deckPresetSelect.value];
        if (!deck) return;
        if (!(await this.confirmDeleteDeck(deck.name))) return;
        if (!this.store.deletePreset(deck.id)) {
          this.toast("最後のプリセットは削除できません。");
          return;
        }
        this.selectedCardId = this.firstSelectedId();
        this.render();
        this.toast("プリセットを削除しました。");
      });
      this.els.loginButton.addEventListener("click", () => this.openAuthDialog());
      this.els.logoutButton.addEventListener("click", () => this.logoutAccount());
      this.els.saveDisplayNameButton.addEventListener("click", () => this.saveDisplayName());
      this.els.displayNameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") this.saveDisplayName();
      });
      this.els.deckPresetSelect?.addEventListener("change", () => this.renderProfilePanel());
      this.els.autoBuildButton.addEventListener("click", () => {
        const label = this.store.autoBuild(this.els.autoBuildMode.value, { ownedOnly: this.ownedOnly });
        this.selectedCardId = this.firstSelectedId();
        if (this.els.deckPresetSelect) this.els.deckPresetSelect.value = this.store.activeDeckId;
        this.render();
        if (this.store.total < DECK_SIZE || this.store.driveTotal < DRIVE_DECK_SIZE) {
          this.toast(`${label}を作成しましたが、所持カード不足で枚数が足りません。`);
          return;
        }
        this.toast(`${label}を作成しました。保存するとプリセットに反映されます。`);
      });
      this.els.openPackButton?.addEventListener("click", () => this.openPack());
      this.els.bulkDismantleButton?.addEventListener("click", () => this.bulkDismantleExtras());
      this.els.newDuelButton.addEventListener("click", () => this.onStartDuel());
      this.els.searchInput.addEventListener("input", () => this.render());
      this.els.typeFilter.addEventListener("change", () => this.render());
      this.els.attrFilter.addEventListener("change", () => this.render());
      this.els.ownedOnlyToggle?.addEventListener("click", () => {
        this.ownedOnly = !this.ownedOnly;
        this.els.ownedOnlyToggle.setAttribute("aria-pressed", String(this.ownedOnly));
        this.render();
      });
      this.els.cardPreview.addEventListener("click", (event) => CardZoom.openFromEvent(event));
      this.els.mainDeckModeButton?.addEventListener("click", () => this.setDeckMode("main"));
      this.els.driveDeckModeButton?.addEventListener("click", () => this.setDeckMode("drive"));
    }

    openAuthDialog(options = {}) {
      const modal = document.createElement("div");
      modal.className = "modal-dialog auth-dialog";
      let mode = "login";

      const renderMode = () => {
        const isRegister = mode === "register";
        modal.innerHTML = `
          <h2>${isRegister ? "新規登録" : "ログイン"}</h2>
          <label class="profile-field">
            <span>ユーザー名</span>
            <input data-field="username" type="text" autocomplete="username" maxlength="24">
          </label>
          <label class="profile-field">
            <span>パスワード</span>
            <input data-field="password" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" maxlength="64">
          </label>
          <p class="auth-error" data-auth-error></p>
          <div class="modal-actions modal-actions-row">
            <button class="ghost-button" type="button" data-action="cancel">キャンセル</button>
            ${options.allowGuest ? `<button class="ghost-button" type="button" data-action="guest">ゲストモード</button>` : ""}
            <button class="primary-button" type="button" data-action="submit">${isRegister ? "登録" : "ログイン"}</button>
          </div>
          <button class="ghost-button auth-mode-switch" type="button" data-action="switch">
            ${isRegister ? "ログインはこちら" : "新規登録の方はこちら"}
          </button>
        `;
        modal.querySelector('[data-action="cancel"]').addEventListener("click", () => this.closeAppModal());
        const guestButton = modal.querySelector('[data-action="guest"]');
        if (guestButton) {
          guestButton.disabled = true;
          window.setTimeout(() => {
            if (modal.isConnected && modal.dataset.authSubmitting !== "true") guestButton.disabled = false;
          }, 500);
        }
        guestButton?.addEventListener("click", () => {
          this.closeAppModal();
          options.onGuest?.();
        });
        modal.querySelector('[data-action="switch"]').addEventListener("click", () => {
          mode = isRegister ? "login" : "register";
          renderMode();
        });
        modal.querySelector('[data-action="submit"]').addEventListener("click", () => this.submitAuthDialog(modal, mode, options));
        modal.querySelector('[data-field="password"]').addEventListener("keydown", (event) => {
          if (event.key === "Enter") this.submitAuthDialog(modal, mode, options);
        });
        window.setTimeout(() => modal.querySelector('[data-field="username"]')?.focus(), 0);
      };

      renderMode();
      this.openAppModal(modal);
    }

    async submitAuthDialog(modal, mode, options = {}) {
      if (modal.dataset.authSubmitting === "true") return;
      modal.dataset.authSubmitting = "true";
      modal.querySelectorAll("button").forEach((button) => {
        button.disabled = true;
      });
      const username = modal.querySelector('[data-field="username"]')?.value || "";
      const password = modal.querySelector('[data-field="password"]')?.value || "";
      const errorEl = modal.querySelector("[data-auth-error]");
      try {
        const account = mode === "register"
          ? await this.store.register(username, password)
          : await this.store.login(username, password);
        await this.onAccountChange(account);
        this.closeAppModal();
        this.selectedCardId = this.firstSelectedId();
        this.render();
        options.onSuccess?.(account);
        this.onLoginBonus();
        this.toast(mode === "register" ? "登録しました。" : `${this.store.displayName}でログインしました。`);
      } catch (error) {
        if (errorEl) errorEl.textContent = this.authErrorMessage(error);
        if (modal.isConnected) {
          modal.dataset.authSubmitting = "false";
          modal.querySelectorAll("button").forEach((button) => {
            button.disabled = false;
          });
        }
      }
    }

    authErrorMessage(error) {
      const message = String(error?.message || "");
      if (message.includes("already exists")) return "このユーザー名は既に使われています。";
      if (message.includes("invalid username or password")) return "ユーザー名またはパスワードが違います。";
      if (message.includes("username and password")) return "ユーザー名とパスワードを入力してください。";
      return message || "認証に失敗しました。";
    }

    async logoutAccount() {
      await this.store.logout();
      this.render();
      this.toast("ログアウトしました。");
    }

    saveDisplayName() {
      const name = this.store.updateDisplayName(this.els.displayNameInput.value);
      this.render();
      this.toast(`ゲーム内名を${name}にしました。`);
    }

    setDeckMode(mode) {
      if (this.deckMode === mode) return;
      this.deckMode = mode;
      this.els.typeFilter.value = "all";
      this.selectedCardId = this.firstSelectedId();
      this.render();
    }

    render(options = {}) {
      const deckScrollTop = options.preserveDeckScroll && this.els.deckList ? this.els.deckList.scrollTop : 0;
      this.ensureSelectedCard();
      this.renderResources();
      this.renderProfilePanel();
      this.renderTypeFilterOptions();
      this.renderAttrFilterOptions();
      this.renderLibrary({ preserveScroll: Boolean(options.preserveLibraryScroll) });
      this.renderDeckPanel();
      CardRenderer.preview(this.selectedCardId, this.els.cardPreview, { finish: this.selectedFinish });
      this.renderPreviewDeckControls();
      if (options.preserveDeckScroll && this.els.deckList) this.els.deckList.scrollTop = deckScrollTop;
    }

    makeBuilderCardDraggable(element, payload) {
      if (!element || !cards[payload?.id]) return;
      element.draggable = false;
      element.classList.add("builder-draggable-card");
      element.addEventListener("dragstart", (event) => event.preventDefault());
      element.addEventListener("contextmenu", (event) => {
        if (this.builderPointerDrag?.started) event.preventDefault();
      });
      element.addEventListener("pointerdown", (event) => this.startBuilderPointerDrag(event, element, payload));
    }

    startBuilderPointerDrag(event, element, payload) {
      if (!event.isPrimary) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      this.cancelBuilderPointerDrag();
      this.builderPointerDrag = {
        payload,
        source: element,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
        pointerType: event.pointerType,
        started: false,
        ghost: null,
        dropTarget: null,
        pressTimer: 0,
      };
      if (event.pointerType !== "mouse") {
        this.builderPointerDrag.pressTimer = window.setTimeout(() => {
          const drag = this.builderPointerDrag;
          if (!drag || drag.pointerId !== event.pointerId || drag.started) return;
          this.beginBuilderPointerDrag(drag, drag.currentX, drag.currentY);
        }, BUILDER_TOUCH_DRAG_DELAY_MS);
      }
      if (event.pointerType === "mouse") element.setPointerCapture?.(event.pointerId);
      document.addEventListener("pointermove", this.handleBuilderPointerMove, { passive: false });
      document.addEventListener("pointerup", this.handleBuilderPointerUp);
      document.addEventListener("pointercancel", this.handleBuilderPointerCancel);
    }

    moveBuilderPointerDrag(event) {
      const drag = this.builderPointerDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.currentX = event.clientX;
      drag.currentY = event.clientY;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const distance = Math.hypot(dx, dy);

      if (!drag.started) {
        if (drag.pointerType !== "mouse" && distance > BUILDER_TOUCH_SCROLL_CANCEL_DISTANCE) {
          this.cleanupBuilderPointerDrag(false);
          return;
        }
        if (drag.pointerType !== "mouse") return;
        if (distance <= BUILDER_MOUSE_DRAG_DISTANCE) return;
        this.beginBuilderPointerDrag(drag, event.clientX, event.clientY);
      }

      event.preventDefault();
      this.positionBuilderDragGhost(event.clientX, event.clientY);
      this.updateBuilderPointerDropTarget(event.clientX, event.clientY);
    }

    beginBuilderPointerDrag(drag, clientX, clientY) {
      if (!drag || drag.started) return;
      window.clearTimeout(drag.pressTimer);
      drag.started = true;
      this.builderDragPayload = drag.payload;
      drag.source.classList.add("builder-dragging");
      drag.source.setAttribute("aria-grabbed", "true");
      drag.source.setPointerCapture?.(drag.pointerId);
      drag.ghost = drag.source.cloneNode(true);
      const rect = drag.source.getBoundingClientRect();
      drag.ghost.classList.add("builder-drag-ghost");
      drag.ghost.removeAttribute("id");
      drag.ghost.removeAttribute("aria-label");
      drag.ghost.style.width = `${rect.width}px`;
      drag.ghost.style.height = `${rect.height}px`;
      document.body.append(drag.ghost);
      this.positionBuilderDragGhost(clientX, clientY);
      this.updateBuilderPointerDropTarget(clientX, clientY);
    }

    positionBuilderDragGhost(clientX, clientY) {
      const ghost = this.builderPointerDrag?.ghost;
      if (!ghost) return;
      ghost.style.left = `${clientX}px`;
      ghost.style.top = `${clientY}px`;
    }

    updateBuilderPointerDropTarget(clientX, clientY) {
      const drag = this.builderPointerDrag;
      if (!drag) return;
      this.clearBuilderDropTargets();
      const target = this.findBuilderDropTarget(clientX, clientY);
      drag.dropTarget = this.acceptsBuilderDrop(drag.payload, target) ? target : null;
      if (drag.dropTarget === "deck") this.els.deckList?.classList.add("builder-drop-target");
      if (drag.dropTarget === "library") this.els.collectionGrid?.classList.add("builder-drop-target");
    }

    findBuilderDropTarget(clientX, clientY) {
      if (this.pointInsideElement(clientX, clientY, this.els.deckList)) return "deck";
      if (this.pointInsideElement(clientX, clientY, this.els.collectionGrid)) return "library";
      return "";
    }

    pointInsideElement(clientX, clientY, element) {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    }

    finishBuilderPointerDrag(event) {
      const drag = this.builderPointerDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const target = drag.dropTarget;
      const payload = drag.payload;
      const started = drag.started;
      if (started) {
        event.preventDefault();
        event.stopPropagation();
      }
      this.cleanupBuilderPointerDrag(started);
      if (started && target) this.applyBuilderDrop(payload, target);
    }

    cancelBuilderPointerDrag(event) {
      const drag = this.builderPointerDrag;
      if (event && drag && event.pointerId !== drag.pointerId) return;
      this.cleanupBuilderPointerDrag(false);
    }

    cleanupBuilderPointerDrag(suppressClick) {
      const drag = this.builderPointerDrag;
      if (!drag) return;
      window.clearTimeout(drag.pressTimer);
      document.removeEventListener("pointermove", this.handleBuilderPointerMove);
      document.removeEventListener("pointerup", this.handleBuilderPointerUp);
      document.removeEventListener("pointercancel", this.handleBuilderPointerCancel);
      drag.ghost?.remove();
      drag.source?.classList.remove("builder-dragging");
      drag.source?.removeAttribute("aria-grabbed");
      if (drag.source?.hasPointerCapture?.(drag.pointerId)) drag.source.releasePointerCapture(drag.pointerId);
      this.builderPointerDrag = null;
      this.builderDragPayload = null;
      this.clearBuilderDropTargets();
      if (suppressClick) {
        this.suppressBuilderClick = true;
        window.setTimeout(() => {
          this.suppressBuilderClick = false;
        }, 220);
      }
    }

    consumeSuppressedBuilderClick(event) {
      if (!this.suppressBuilderClick) return false;
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    acceptsBuilderDrop(payload, target) {
      if (!payload || !cards[payload.id]) return false;
      if (target === "deck") return payload.source === "library";
      if (target === "library") return payload.source === "deck";
      return false;
    }

    applyBuilderDrop(payload, target) {
      const driveMode = Boolean(payload.drive);
      if (target === "deck") {
        const result = driveMode ? this.store.addDrive(payload.id, payload.finish) : this.store.add(payload.id, payload.finish);
        this.toastDeckResult(result, driveMode);
        if (!result.ok) return;
      } else {
        if (driveMode) this.store.removeDrive(payload.id, payload.finish);
        else this.store.remove(payload.id, payload.finish);
      }

      this.deckMode = driveMode ? "drive" : "main";
      this.selectedCardId = payload.id;
      this.selectedFinish = payload.finish || "normal";
      this.render({ preserveLibraryScroll: true, preserveDeckScroll: true });
    }

    clearBuilderDropTargets() {
      this.els.collectionGrid?.classList.remove("builder-drop-target");
      this.els.deckList?.classList.remove("builder-drop-target");
    }

    renderResources() {
      if (this.els.headerGachaStoneCount) this.els.headerGachaStoneCount.textContent = this.store.isAuthorAccount ? "作者" : String(this.store.gems);
      if (this.els.headerDustCount) this.els.headerDustCount.textContent = String(this.store.dust);
    }

    saveActiveDeck() {
      if (!this.validateDeckBeforeSave()) return null;
      const deck = this.store.save(this.els.deckNameInput?.value || this.store.activeDeck?.name);
      if (this.els.deckPresetSelect) this.els.deckPresetSelect.value = this.store.activeDeckId;
      this.render({ preserveLibraryScroll: true });
      this.toast(`${deck.name}を保存しました。`);
      return deck;
    }

    validateDeckBeforeSave() {
      const size = this.store.validateActiveDeckSize();
      if (size.ok) return true;
      if (size.mainOver && size.driveOver) {
        this.toast(`通常デッキは${DECK_SIZE}枚、ドライブデッキは${DRIVE_DECK_SIZE}枚までです。枚数を減らしてください。`);
      } else if (size.mainOver) {
        this.toast(`通常デッキが${DECK_SIZE}枚を超えています。枚数を減らしてください。`);
      } else {
        this.toast(`ドライブデッキが${DRIVE_DECK_SIZE}枚を超えています。枚数を減らしてください。`);
      }
      if (size.mainOver && this.deckMode !== "main") this.deckMode = "main";
      else if (size.driveOver && this.deckMode !== "drive") this.deckMode = "drive";
      this.render({ preserveLibraryScroll: true, preserveDeckScroll: true });
      return false;
    }

    confirmAppAction(options = {}) {
      return new Promise((resolve) => {
        const modal = document.createElement("div");
        const lines = Array.isArray(options.lines) ? options.lines : [options.message || ""];
        modal.className = "modal-dialog app-confirm-dialog";
        modal.innerHTML = `
          <h2>${escapeHtml(options.title || "確認")}</h2>
          <div class="app-confirm-copy">
            ${lines.filter(Boolean).map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
          </div>
          <div class="modal-actions modal-actions-row">
            <button class="ghost-button" type="button" data-choice="cancel">${escapeHtml(options.cancelLabel || "キャンセル")}</button>
            <button class="${options.danger ? "ghost-button danger" : "primary-button"}" type="button" data-choice="ok">${escapeHtml(options.confirmLabel || "OK")}</button>
          </div>
        `;
        modal.querySelectorAll("[data-choice]").forEach((button) => {
          button.addEventListener("click", () => {
            const ok = button.dataset.choice === "ok";
            this.closeAppModal();
            resolve(ok);
          });
        });
        this.openAppModal(modal);
        window.setTimeout(() => modal.querySelector('[data-choice="cancel"]')?.focus(), 0);
      });
    }

    hasUnsavedChanges() {
      const deck = this.store.activeDeck;
      if (!deck) return false;
      const currentName = normalizeCompareName(this.els.deckNameInput?.value || deck.name);
      if (currentName !== normalizeCompareName(deck.name)) return true;
      return !sameCounts(this.store.counts, deck.mainDeck)
        || !sameCounts(this.store.royalCounts, deck.mainDeckRoyal)
        || !sameCounts(this.store.driveCounts, deck.driveDeck)
        || !sameCounts(this.store.driveRoyalCounts, deck.driveDeckRoyal);
    }

    renderProfilePanel() {
      const activeDeck = this.store.activeDeck;
      const selectedId = this.els.deckPresetSelect?.value || this.store.activeDeckId;
      const loggedIn = this.store.isAuthenticated;
      if (document.activeElement !== this.els.displayNameInput) {
        this.els.displayNameInput.value = this.store.displayName || "";
      }
      if (this.els.accountUsernameLabel) this.els.accountUsernameLabel.textContent = "ユーザー名";
      this.els.loginButton.hidden = loggedIn;
      this.els.logoutButton.hidden = !loggedIn;
      this.els.saveDisplayNameButton.disabled = false;

      if (this.els.deckPresetSelect) {
        this.els.deckPresetSelect.replaceChildren();
        this.store.deckPresets.forEach((deck) => {
          const option = document.createElement("option");
          option.value = deck.id;
          option.textContent = deck.name;
          option.selected = deck.id === (this.store.activeAccountData.decks[selectedId] ? selectedId : this.store.activeDeckId);
          this.els.deckPresetSelect.append(option);
        });
      }

      if (this.els.deckNameInput && document.activeElement !== this.els.deckNameInput) {
        this.els.deckNameInput.value = activeDeck.name;
      }
      if (this.els.deletePresetButton) this.els.deletePresetButton.disabled = this.store.deckPresets.length <= 1;
    }

    renderLibrary(options = {}) {
      const scrollTop = options.preserveScroll ? this.els.collectionGrid.scrollTop : 0;
      const query = this.els.searchInput.value.trim().toLowerCase();
      const type = this.els.typeFilter.value;
      const attr = this.els.attrFilter.value;
      const filtered = this.activePool().filter((card) => {
        const matchesQuery = card.name.toLowerCase().includes(query);
        const matchesType = type === "all" || card.type === type;
        const matchesAttr = attr === "all" || card.attr === attr;
        const matchesOwned = !this.ownedOnly || this.store.totalOwnedCount(card.id) > 0;
        return matchesQuery && matchesType && matchesAttr && matchesOwned;
      });

      const visibleCount = filtered.reduce((sum, card) => sum + (this.store.ownedCount(card.id, "royal") > 0 ? 2 : 1), 0);
      this.els.poolCount.textContent = `${visibleCount}種`;
      if (this.els.ownedOnlyToggle) {
        this.els.ownedOnlyToggle.textContent = this.ownedOnly ? "所持済み" : "全カード";
        this.els.ownedOnlyToggle.classList.toggle("active", this.ownedOnly);
        this.els.ownedOnlyToggle.setAttribute("aria-pressed", String(this.ownedOnly));
      }
      this.els.mainDeckModeButton?.classList.toggle("active", this.deckMode === "main");
      this.els.driveDeckModeButton?.classList.toggle("active", this.deckMode === "drive");
      this.els.collectionGrid.replaceChildren();
      filtered.forEach((card) => {
        const owned = this.store.ownedCount(card.id);
        const royalOwned = this.store.ownedCount(card.id, "royal");
        const limit = this.store.deckLimit(card.id, this.deckMode === "drive");
        const normalCount = this.deckMode === "drive" ? this.store.driveCounts[card.id] || 0 : this.store.counts[card.id] || 0;
        const normalButton = CardRenderer.libraryCard(card, normalCount, this.selectedCardId === card.id && this.selectedFinish !== "royal", { owned, royalOwned, limit });
        normalButton.dataset.cardId = card.id;
        normalButton.dataset.finish = "normal";
        normalButton.classList.toggle("unowned-card", owned <= 0 && !this.store.isAuthorAccount);
        this.makeBuilderCardDraggable(normalButton, {
          source: "library",
          id: card.id,
          finish: "normal",
          drive: this.deckMode === "drive",
        });
        normalButton.addEventListener("click", (event) => {
          if (this.consumeSuppressedBuilderClick(event)) return;
          this.handleCardClick(card.id, "normal");
        });
        this.els.collectionGrid.append(normalButton);
        if (royalOwned > 0) {
          const royalCount = this.deckMode === "drive" ? this.store.driveRoyalCounts[card.id] || 0 : this.store.royalCounts[card.id] || 0;
          const royalButton = CardRenderer.libraryCard(card, royalCount, this.selectedCardId === card.id && this.selectedFinish === "royal", {
            owned: royalOwned,
            limit,
            finish: "royal",
          });
          royalButton.dataset.cardId = card.id;
          royalButton.dataset.finish = "royal";
          this.makeBuilderCardDraggable(royalButton, {
            source: "library",
            id: card.id,
            finish: "royal",
            drive: this.deckMode === "drive",
          });
          royalButton.addEventListener("click", (event) => {
            if (this.consumeSuppressedBuilderClick(event)) return;
            this.handleCardClick(card.id, "royal");
          });
          this.els.collectionGrid.append(royalButton);
        }
      });
      if (options.preserveScroll) this.els.collectionGrid.scrollTop = scrollTop;
    }

    renderTypeFilterOptions() {
      const select = this.els.typeFilter;
      if (!select) return;
      const current = select.value;
      const types = [...new Set(this.activePool().map((card) => card.type).filter(Boolean))];
      select.replaceChildren();
      select.append(new Option("すべて", "all"));
      types.forEach((type) => select.append(new Option(type, type)));
      select.value = types.includes(current) ? current : "all";
    }

    renderAttrFilterOptions() {
      const select = this.els.attrFilter;
      if (!select) return;
      const current = select.value;
      const attrs = [...new Set(this.activePool().map((card) => card.attr).filter(Boolean))];
      select.replaceChildren();
      select.append(new Option("すべて", "all"));
      attrs.forEach((attr) => select.append(new Option(attr, attr)));
      select.value = attrs.includes(current) ? current : "all";
    }

    handleCardClick(id, finish = "normal") {
      this.selectedCardId = id;
      this.selectedFinish = finish;
      this.render({ preserveLibraryScroll: true });
      this.scrollDeckToCard(id, finish);
    }

    scrollDeckToCard(id, finish = "normal") {
      const escapedId = window.CSS?.escape ? CSS.escape(id) : id;
      const escapedFinish = window.CSS?.escape ? CSS.escape(finish) : finish;
      const exact = this.els.deckList.querySelector(`[data-card-id="${escapedId}"][data-finish="${escapedFinish}"]`);
      const fallback = this.els.deckList.querySelector(`[data-card-id="${escapedId}"]`);
      const target = exact || fallback;
      if (target) target.scrollIntoView({ block: "nearest", inline: "nearest" });
    }

    scrollLibraryToCard(id, finish = "normal") {
      const escapedId = window.CSS?.escape ? CSS.escape(id) : id;
      const escapedFinish = window.CSS?.escape ? CSS.escape(finish) : finish;
      const target = this.els.collectionGrid.querySelector(`[data-card-id="${escapedId}"][data-finish="${escapedFinish}"]`);
      if (target) target.scrollIntoView({ block: "nearest", inline: "nearest" });
    }

    renderPreviewDeckControls() {
      const target = this.els.previewDeckControls;
      if (!target) return;
      const card = cards[this.selectedCardId];
      if (!card) {
        target.innerHTML = `<div class="preview-control-empty">カード未選択</div>`;
        return;
      }

      const counts = this.activeCounts();
      const copyLimit = this.deckMode === "drive" ? MAX_DRIVE_COPIES : MAX_COPIES;
      const owned = this.store.ownedCount(this.selectedCardId);
      const limit = this.store.deckLimit(this.selectedCardId, this.deckMode === "drive");
      const total = this.deckMode === "drive" ? this.store.driveTotal : this.store.total;
      const size = this.deckMode === "drive" ? DRIVE_DECK_SIZE : DECK_SIZE;
      const count = counts[this.selectedCardId] || 0;
      const canAdd = count < limit && total < size;
      const canRemove = count > 0;
      const canDismantle = this.store.dismantlableCount(this.selectedCardId, this.selectedFinish) >= 1;
      const dismantleLabel = canDismantle ? `分解 +${this.store.dustPerDismantle}` : "分解不可";
      const canCraft = !this.store.isAuthorAccount && this.store.dust >= this.store.craftCost;

      target.innerHTML = `
        <div class="preview-control-copy">
          <span>投入枚数</span>
          <strong>${count} / ${limit}</strong>
          <small>${card.type} / ${card.attr} / 所持 ${owned}${this.store.isAuthorAccount ? " (作者)" : ""} / ${copyLimit} / 分解 ${this.store.dust}</small>
        </div>
        <div class="preview-count-stepper">
          <button class="mini-button" type="button" data-action="preview-remove">-</button>
          <strong>${count}</strong>
          <button class="mini-button" type="button" data-action="preview-add">+</button>
        </div>
        <div class="craft-controls">
          <button class="ghost-button compact-action" type="button" data-action="preview-dismantle">${dismantleLabel}</button>
          <button class="primary-button compact-action" type="button" data-action="preview-craft">購入 ${this.store.craftCost}</button>
        </div>
      `;

      const removeButton = target.querySelector('[data-action="preview-remove"]');
      const addButton = target.querySelector('[data-action="preview-add"]');
      const dismantleButton = target.querySelector('[data-action="preview-dismantle"]');
      const craftButton = target.querySelector('[data-action="preview-craft"]');
      removeButton.disabled = !canRemove;
      addButton.disabled = !canAdd;
      dismantleButton.disabled = !canDismantle;
      craftButton.disabled = !canCraft;
      removeButton.addEventListener("click", () => this.removeCardFromDeck(this.selectedCardId));
      addButton.addEventListener("click", () => this.addCardToDeck(this.selectedCardId));
      dismantleButton.addEventListener("click", () => this.dismantleSelectedCard());
      craftButton.addEventListener("click", () => this.craftSelectedCard());
    }

    async dismantleSelectedCard() {
      const selectedId = this.selectedCardId;
      const selectedFinish = this.selectedFinish;
      const card = cards[selectedId];
      const gain = selectedFinish === "royal" ? this.store.royalDustPerDismantle : this.store.dustPerDismantle;
      const finishLabel = selectedFinish === "royal" ? "Rカード " : "";
      if (card && !(await this.confirmAppAction({
        title: "カードを分解しますか？",
        lines: [`${finishLabel}${card.name}を1枚分解します。`, `分解石 +${gain}`],
        confirmLabel: "分解",
        danger: true,
      }))) return;
      const result = this.store.dismantleCard(selectedId, selectedFinish);
      if (!result.ok) {
        if (result.reason === "minimum") this.toast("初期配布分より少なくなるため分解できません。");
        else if (result.reason === "owned") this.toast("所持しているカードだけ分解できます。");
        else if (result.reason === "author") this.toast("作者アカウントは分解不要です。");
        else this.toast("分解できません。");
        this.render({ preserveLibraryScroll: true });
        return;
      }
      this.toast(`${selectedFinish === "royal" ? "ロイヤル " : ""}${card.name}を分解しました。分解アイテム +${result.gained}`);
      this.render({ preserveLibraryScroll: true });
    }

    async craftSelectedCard() {
      if (this.selectedFinish === "royal") {
        this.toast("Rカードは生成できません。パックから入手してください。");
        this.render({ preserveLibraryScroll: true });
        return;
      }
      const selectedId = this.selectedCardId;
      const card = cards[selectedId];
      if (card && !(await this.confirmAppAction({
        title: "カードを生成しますか？",
        lines: [`${card.name}を生成します。`, `分解石 -${this.store.craftCost}`],
        confirmLabel: "生成",
      }))) return;
      const result = this.store.craftCard(selectedId);
      if (!result.ok) {
        if (result.reason === "dust") this.toast("分解アイテムが足りません。");
        else if (result.reason === "author") this.toast("作者アカウントは全カードを持っています。");
        else this.toast("購入できません。");
        this.render({ preserveLibraryScroll: true });
        return;
      }
      this.toast(`${card.name}を購入しました。`);
      this.render({ preserveLibraryScroll: true });
    }

    addCardToDeck(id) {
      const card = cards[id];
      if (!card) return;
      const result = this.deckMode === "drive" ? this.store.addDrive(id) : this.store.add(id);
      this.toastDeckResult(result);
      this.selectedCardId = id;
      this.render({ preserveLibraryScroll: true });
    }

    removeCardFromDeck(id) {
      if (!cards[id]) return;
      if (this.deckMode === "drive") this.store.removeDrive(id);
      else this.store.remove(id);
      this.selectedCardId = id;
      this.render({ preserveLibraryScroll: true });
    }

    toastDeckResult(result, driveMode = this.deckMode === "drive") {
      if (result.ok) return;
      if (result.reason === "class") {
        this.toast("選択中のクラスでは使えないカードです。");
        return;
      }
      if (result.reason === "owned") {
        this.toast("所持枚数が足りません。パックで入手してください。");
        return;
      }
      if (driveMode) {
        if (result.reason === "full") this.toast("ドライブデッキは10枚までです。");
        if (result.reason === "copies") this.toast(`ドライブカードは各${MAX_DRIVE_COPIES}枚までです。`);
        return;
      }
      if (result.reason === "full") this.toast("デッキは40枚までです。");
      if (result.reason === "copies") this.toast("同名カードは3枚までです。");
    }

    renderDeckPanel() {
      const driveMode = this.deckMode === "drive";
      const labels = this.els.deckStats.querySelectorAll("span");
      if (driveMode) {
        const stats = this.store.driveStats;
        this.els.deckPanelEyebrow.textContent = "Drive Deck";
        this.els.deckPanelTitle.textContent = "ドライブデッキ";
        this.els.deckCount.textContent = `${this.store.driveTotal} / ${DRIVE_DECK_SIZE}`;
        this.els.deckCount.style.color = this.store.driveReady ? "var(--gold)" : "var(--red)";
        if (labels[0]) labels[0].textContent = "テーマ純度";
        if (labels[1]) labels[1].textContent = "平均コスト";
        if (labels[2]) labels[2].textContent = "メインテーマ";
        this.els.themeRate.textContent = `${stats.themeRate}%`;
        this.els.avgCost.textContent = stats.avgCost.toFixed(1);
        this.els.reactionCount.textContent = stats.mainTheme;
        this.renderDeckRows(this.store.driveCounts);
        return;
      }

      const stats = this.store.stats;
      this.els.deckPanelEyebrow.textContent = "Main Deck";
      this.els.deckPanelTitle.textContent = "構築デッキ";
      this.els.deckCount.textContent = `${this.store.total} / ${DECK_SIZE}`;
      this.els.deckCount.style.color = this.store.total === DECK_SIZE ? "var(--gold)" : "var(--red)";
      if (labels[0]) labels[0].textContent = "テーマ純度";
      if (labels[1]) labels[1].textContent = "平均コスト";
      if (labels[2]) labels[2].textContent = "メインテーマ";
      this.els.themeRate.textContent = `${stats.themeRate}%`;
      this.els.avgCost.textContent = stats.avgCost.toFixed(1);
      this.els.reactionCount.textContent = stats.mainTheme;
      this.renderDeckRows(this.store.counts);
    }

    renderDeckRows(counts) {
      this.els.deckList.replaceChildren();
      Object.entries(counts)
        .sort((a, b) => sortCardRows(cards[a[0]], cards[b[0]]))
        .forEach(([id, count]) => this.els.deckList.append(this.createDeckRow(id, count)));
    }

    createDeckRow(id, count) {
      const card = cards[id];
      const driveMode = this.deckMode === "drive";
      const limit = this.store.deckLimit(id, driveMode);
      const total = driveMode ? this.store.driveTotal : this.store.total;
      const size = driveMode ? DRIVE_DECK_SIZE : DECK_SIZE;
      const chip = card.cost;
      const typeLabel = driveMode ? CardRenderer.shortDriveType(card.type) : card.type;
      const row = document.createElement("div");
      row.className = `deck-row main-deck-row${this.selectedCardId === id ? " selected" : ""}`;
      row.innerHTML = `
        <div>
          <div class="deck-row-main">
            <span class="card-name">${CardRenderer.rubyText(card.name)}</span>
          </div>
          <div class="deck-row-sub">${CardRenderer.rubyText(`${typeLabel} / ${card.attr} / 所持${this.store.ownedCount(id)}`)}</div>
        </div>
        <div class="deck-row-controls">
          <span class="cost-chip">${chip}</span>
          <div class="deck-row-count-editor" aria-label="投入枚数">
            <span>投入枚数</span>
            <div>
              <button class="mini-button" type="button" data-action="remove">-</button>
              <strong>${count}</strong>
              <button class="mini-button" type="button" data-action="add">+</button>
            </div>
          </div>
        </div>
      `;
      this.bindDeckRowSelection(row, id);
      row.querySelector('[data-action="remove"]').addEventListener("click", () => {
        this.removeCardFromDeck(id);
      });
      row.querySelector('[data-action="add"]').addEventListener("click", () => {
        this.addCardToDeck(id);
      });
      row.querySelector('[data-action="add"]').disabled = count >= limit || total >= size;
      return row;
    }

    openPack() {
      const results = this.store.openPack("standard");
      this.render({ preserveLibraryScroll: true });
      const modal = this.els.modalRoot;
      modal.hidden = false;
      modal.innerHTML = `
        <div class="modal-dialog pack-dialog" role="dialog" aria-modal="true" aria-label="パック開封結果">
          <div class="grave-dialog-head">
            <div>
              <h2>パック開封</h2>
              <p class="small-note">入手したカードはこのアカウントの所持枚数に追加されます。</p>
            </div>
            <button class="ghost-button" type="button" data-action="close-pack">閉じる</button>
          </div>
          <div class="pack-result-list"></div>
          <div class="choice-actions">
            <button class="ghost-button" type="button" data-action="open-more">もう1パック</button>
            <button class="primary-button" type="button" data-action="close-pack">完了</button>
          </div>
        </div>
      `;

      const list = modal.querySelector(".pack-result-list");
      results.forEach((result, index) => {
        const card = CardRenderer.tcgCard(result.id, { interactive: true });
        card.classList.add("pack-result-card");
        card.style.setProperty("--pack-index", index);
        const badge = document.createElement("div");
        badge.className = "pack-owned-badge";
        badge.textContent = result.isNew ? `NEW / 所持 ${result.after}` : `所持 ${result.before} -> ${result.after}`;
        const slot = document.createElement("div");
        slot.className = "pack-result-slot";
        slot.append(card, badge);
        card.addEventListener("click", () => {
          this.selectedCardId = result.id;
          this.render({ preserveLibraryScroll: true });
        });
        list.append(slot);
      });

      modal.querySelectorAll('[data-action="close-pack"]').forEach((button) => {
        button.addEventListener("click", () => {
          modal.hidden = true;
          modal.replaceChildren();
        });
      });
      modal.querySelector('[data-action="open-more"]')?.addEventListener("click", () => this.openPack());
      this.toast("パックを開封しました。");
    }

    bindDeckRowSelection(row, id, finish = "normal") {
      row.dataset.cardId = id;
      row.dataset.finish = finish;
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.setAttribute("aria-label", `${cards[id].name}をフォーカス`);
      row.addEventListener("click", (event) => {
        if (event.target.closest("[data-action]")) return;
        this.selectedCardId = id;
        this.selectedFinish = finish;
        this.render({ preserveLibraryScroll: true });
        this.scrollLibraryToCard(id, finish);
      });
      row.addEventListener("keydown", (event) => {
        if (event.target.closest("[data-action]")) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        this.selectedCardId = id;
        this.selectedFinish = finish;
        this.render({ preserveLibraryScroll: true });
        this.scrollLibraryToCard(id, finish);
      });
    }

    activePool() {
      const classKey = this.store.activeClass || "blader";
      const allowed = (card) => card.cardClass === "generic" || card.cardClass === classKey;
      if (this.deckMode === "drive") return drivePool.filter((card) => card.cardClass === classKey);
      return cardPool.filter(allowed);
    }

    activeCounts() {
      return this.deckMode === "drive" ? this.store.driveCounts : this.store.counts;
    }

    firstSelectedId() {
      const counts = this.activeCounts();
      return Object.keys(counts)[0] || this.activePool()[0]?.id || "gen_front_runner";
    }

    ensureSelectedCard() {
      if (this.activePool().some((card) => card.id === this.selectedCardId)) {
        if (this.selectedFinish === "royal" && this.store.ownedCount(this.selectedCardId, "royal") <= 0) this.selectedFinish = "normal";
        return;
      }
      this.selectedCardId = this.firstSelectedId();
      this.selectedFinish = "normal";
    }

    renderPreviewDeckControls() {
      const target = this.els.previewDeckControls;
      if (!target) return;
      const card = cards[this.selectedCardId];
      if (!card) {
        target.innerHTML = `<div class="preview-control-empty">カード未選択</div>`;
        return;
      }

      const driveMode = this.deckMode === "drive";
      const normalCounts = driveMode ? this.store.driveCounts : this.store.counts;
      const royalCounts = driveMode ? this.store.driveRoyalCounts : this.store.royalCounts;
      const owned = this.store.ownedCount(this.selectedCardId);
      const royalOwned = this.store.ownedCount(this.selectedCardId, "royal");
      const limit = this.store.deckLimit(this.selectedCardId, driveMode);
      const count = normalCounts[this.selectedCardId] || 0;
      const royalCount = royalCounts[this.selectedCardId] || 0;
      const totalCount = count + royalCount;
      const canAdd = totalCount < limit;
      const canAddRoyal = royalCount < royalOwned && totalCount < limit;
      const canRemove = count > 0;
      const canRemoveRoyal = royalCount > 0;
      const activeFinish = this.selectedFinish === "royal" ? "royal" : "normal";
      const activeCount = activeFinish === "royal" ? royalCount : count;
      const canAddActive = activeFinish === "royal" ? canAddRoyal : canAdd;
      const canRemoveActive = activeFinish === "royal" ? canRemoveRoyal : canRemove;
      const selectedOwned = activeFinish === "royal" ? royalOwned : owned;
      const dismantleGain = activeFinish === "royal" ? this.store.royalDustPerDismantle : this.store.dustPerDismantle;
      const canDismantle = this.store.dismantlableCount(this.selectedCardId, activeFinish) >= 1;
      const dismantleLabel = canDismantle
        ? `分解 <img class="item-icon" src="assets/ui/dismantle-stone.png" alt=""> +${dismantleGain}`
        : "分解不可";
      const canCraft = activeFinish !== "royal" && !this.store.isAuthorAccount && this.store.dust >= this.store.craftCost;
      const ownedLabel = CardRenderer.metaLabelHtml(card, {
        shortDrive: true,
        ownedLabel: `所持${selectedOwned}`,
      });
      const craftLabel = activeFinish === "royal"
        ? "生成不可"
        : `生成 <img class="item-icon" src="assets/ui/dismantle-stone.png" alt=""> -${this.store.craftCost}`;

      target.innerHTML = `
        <div class="preview-control-copy">
          <span>投入枚数</span>
          <strong>${totalCount} / ${limit}</strong>
          <small>${ownedLabel}</small>
        </div>
        <div class="preview-count-stepper">
          <button class="mini-button" type="button" data-action="preview-remove">-</button>
          <span class="deck-row-count-stack">
            <span class="finish-row-label">${activeFinish === "royal" ? "R" : "N"}</span>
            <strong>${activeCount}</strong>
          </span>
          <button class="mini-button" type="button" data-action="preview-add">+</button>
        </div>
        <div class="craft-controls">
          <button class="ghost-button compact-action" type="button" data-action="preview-dismantle">${dismantleLabel}</button>
          <button class="primary-button compact-action" type="button" data-action="preview-craft">${craftLabel}</button>
        </div>
      `;

      const removeButton = target.querySelector('[data-action="preview-remove"]');
      const addButton = target.querySelector('[data-action="preview-add"]');
      const dismantleButton = target.querySelector('[data-action="preview-dismantle"]');
      const craftButton = target.querySelector('[data-action="preview-craft"]');
      removeButton.disabled = !canRemoveActive;
      addButton.disabled = !canAddActive;
      dismantleButton.disabled = !canDismantle;
      craftButton.disabled = !canCraft;
      removeButton.addEventListener("click", () => this.removeCardFromDeck(this.selectedCardId, activeFinish));
      addButton.addEventListener("click", () => this.addCardToDeck(this.selectedCardId, activeFinish));
      dismantleButton.addEventListener("click", () => this.dismantleSelectedCard());
      craftButton.addEventListener("click", () => this.craftSelectedCard());
    }

    addCardToDeck(id, finish = "normal") {
      const card = cards[id];
      if (!card) return;
      const result = this.deckMode === "drive" ? this.store.addDrive(id, finish) : this.store.add(id, finish);
      this.toastDeckResult(result);
      this.selectedCardId = id;
      this.selectedFinish = finish;
      this.render({ preserveLibraryScroll: true, preserveDeckScroll: true });
    }

    removeCardFromDeck(id, finish = "normal") {
      if (!cards[id]) return;
      if (this.deckMode === "drive") this.store.removeDrive(id, finish);
      else this.store.remove(id, finish);
      this.selectedCardId = id;
      this.selectedFinish = finish;
      this.render({ preserveLibraryScroll: true, preserveDeckScroll: true });
    }

    async bulkDismantleExtras() {
      const preview = this.bulkDismantlePreview();
      if (preview.dismantled > 0 && !(await this.confirmAppAction({
        title: "余剰カードを分解しますか？",
        lines: [`分解 ${preview.dismantled}枚`, `分解石 +${preview.gained}`],
        confirmLabel: "一括分解",
        danger: true,
      }))) return;
      const result = this.store.bulkDismantleExtras();
      if (!result.ok) {
        this.toast(result.reason === "author" ? "作者アカウントは分解不要です。" : "分解できる余剰カードがありません。");
        this.render({ preserveLibraryScroll: true });
        return;
      }
      this.toast(`${result.dismantled}枚を一括分解しました。分解石 +${result.gained}`);
      this.render({ preserveLibraryScroll: true });
    }

    bulkDismantlePreview() {
      let dismantled = 0;
      Object.entries(this.store.activeAccountData.collection || {}).forEach(([id, count]) => {
        if (!cards[id]) return;
        const copyLimit = isDriveCard(cards[id]) ? MAX_DRIVE_COPIES : MAX_COPIES;
        const keep = Math.max(copyLimit, this.store.minimumOwnedCount(id));
        dismantled += Math.max(0, Math.floor(Number(count) || 0) - keep);
      });
      return {
        dismantled,
        gained: dismantled * this.store.dustPerDismantle,
      };
    }

    renderDeckRows(counts) {
      const normalCounts = this.deckMode === "drive" ? this.store.driveCounts : this.store.counts;
      const royalCounts = this.deckMode === "drive" ? this.store.driveRoyalCounts : this.store.royalCounts;
      const rows = [
        ...Object.entries(normalCounts).filter(([, count]) => count > 0).map(([id, count]) => ({ id, count, finish: "normal" })),
        ...Object.entries(royalCounts).filter(([, count]) => count > 0).map(([id, count]) => ({ id, count, finish: "royal" })),
      ].sort((a, b) => sortCardRows(cards[a.id], cards[b.id]) || a.finish.localeCompare(b.finish));
      this.els.deckList.replaceChildren();
      rows.forEach((entry) => {
        for (let copyIndex = 0; copyIndex < entry.count; copyIndex += 1) {
          this.els.deckList.append(this.createDeckRow(entry.id, entry.count, entry.finish, copyIndex));
        }
      });
    }

    createDeckRowLegacy(id, normalCount = 0, royalCount = 0) {
      const card = cards[id];
      const driveMode = this.deckMode === "drive";
      const limit = this.store.deckLimit(id, driveMode);
      const total = driveMode ? this.store.driveTotal : this.store.total;
      const size = driveMode ? DRIVE_DECK_SIZE : DECK_SIZE;
      const typeLabel = driveMode ? CardRenderer.shortDriveType(card.type) : card.type;
      const totalCount = normalCount + royalCount;
      const owned = this.store.ownedCount(id);
      const royalOwned = this.store.ownedCount(id, "royal");
      const focusFinish = normalCount > 0 || royalCount <= 0 ? "normal" : "royal";
      const row = document.createElement("div");
      row.className = `deck-row main-deck-row${this.selectedCardId === id ? " selected" : ""}`;
      row.innerHTML = `
        <div>
          <div class="deck-row-main">
            <span class="card-name">${isRoyal ? `<span class="finish-label">R</span> ` : ""}${CardRenderer.rubyText(card.name)}</span>
          </div>
          <div class="deck-row-sub">${CardRenderer.rubyText(`${typeLabel} / ${card.attr} / 所持${this.store.ownedCount(id, finish)}`)}</div>
        </div>
        <div class="deck-row-controls">
          <span class="cost-chip">${card.cost}</span>
          <div class="deck-row-count-editor" aria-label="投入枚数">
            <span>投入枚数</span>
            <div>
              <button class="mini-button" type="button" data-action="remove">-</button>
              <strong>${count}</strong>
              <button class="mini-button" type="button" data-action="add">+</button>
            </div>
          </div>
        </div>
      `;
      this.bindDeckRowSelection(row, id, finish);
      row.querySelector('[data-action="remove"]').addEventListener("click", () => this.removeCardFromDeck(id, finish));
      row.querySelector('[data-action="add"]').addEventListener("click", () => this.addCardToDeck(id, finish));
      row.querySelector('[data-action="add"]').disabled = this.store.deckCount(id, driveMode) >= limit || total >= size;
      return row;
    }

    createDeckRow(id, normalCount = 0, royalCount = 0) {
      const card = cards[id];
      const driveMode = this.deckMode === "drive";
      const limit = this.store.deckLimit(id, driveMode);
      const total = driveMode ? this.store.driveTotal : this.store.total;
      const size = driveMode ? DRIVE_DECK_SIZE : DECK_SIZE;
      const typeLabel = driveMode ? CardRenderer.shortDriveType(card.type) : card.type;
      const totalCount = normalCount + royalCount;
      const owned = this.store.ownedCount(id);
      const royalOwned = this.store.ownedCount(id, "royal");
      const focusFinish = normalCount > 0 || royalCount <= 0 ? "normal" : "royal";
      const row = document.createElement("div");
      row.className = `deck-row main-deck-row${this.selectedCardId === id ? " selected" : ""}`;
      row.innerHTML = `
        <div class="deck-row-summary">
          <div class="deck-row-sub">${CardRenderer.rubyText(`${typeLabel} / ${card.attr} / 所持 N ${owned} / R ${royalOwned} / ${totalCount}/${limit}`)}</div>
        </div>
        <div class="deck-row-finish-stack">
          <div class="deck-finish-entry" aria-label="normal count">
            <span class="finish-row-label">N</span>
            <div class="deck-finish-line">
              <span class="cost-chip">${card.cost}</span>
              <span class="card-name">${CardRenderer.rubyText(card.name)}</span>
              <button class="mini-button" type="button" data-action="remove-normal">-</button>
              <strong>${normalCount}</strong>
              <button class="mini-button" type="button" data-action="add-normal">+</button>
            </div>
          </div>
          <div class="deck-finish-entry royal-finish-entry" aria-label="royal count">
            <span class="finish-row-label">R</span>
            <div class="deck-finish-line">
              <span class="cost-chip">${card.cost}</span>
              <span class="card-name">${CardRenderer.rubyText(card.name)}</span>
              <button class="mini-button" type="button" data-action="remove-royal">-</button>
              <strong>${royalCount}</strong>
              <button class="mini-button" type="button" data-action="add-royal">+</button>
            </div>
          </div>
        </div>
      `;
      this.bindDeckRowSelection(row, id, focusFinish);
      const removeNormal = row.querySelector('[data-action="remove-normal"]');
      const addNormal = row.querySelector('[data-action="add-normal"]');
      const removeRoyal = row.querySelector('[data-action="remove-royal"]');
      const addRoyal = row.querySelector('[data-action="add-royal"]');
      removeNormal.addEventListener("click", () => this.removeCardFromDeck(id));
      addNormal.addEventListener("click", () => this.addCardToDeck(id));
      removeRoyal.addEventListener("click", () => this.removeCardFromDeck(id, "royal"));
      addRoyal.addEventListener("click", () => this.addCardToDeck(id, "royal"));
      removeNormal.disabled = normalCount <= 0;
      addNormal.disabled = normalCount >= owned || totalCount >= limit || total >= size;
      removeRoyal.disabled = royalCount <= 0;
      addRoyal.disabled = royalCount >= royalOwned || totalCount >= limit || total >= size;
      return row;
    }

    createDeckRow(id, count = 0, finish = "normal", copyIndex = 0) {
      const card = cards[id];
      const driveMode = this.deckMode === "drive";
      const limit = this.store.deckLimit(id, driveMode);
      const normalCounts = driveMode ? this.store.driveCounts : this.store.counts;
      const royalCounts = driveMode ? this.store.driveRoyalCounts : this.store.royalCounts;
      const totalCount = (normalCounts[id] || 0) + (royalCounts[id] || 0);
      const finishCount = Math.max(0, Number(count) || 0);
      const finishOwned = this.store.ownedCount(id, finish);
      const isMissingOwned = copyIndex >= finishOwned && !this.store.isAuthorAccount;
      const row = CardRenderer.tcgCard(id, {
        finish,
        interactive: true,
        selected: this.selectedCardId === id && this.selectedFinish === finish,
      });
      row.classList.add("library-card", "deck-list-card");
      row.classList.toggle("missing-owned-card", isMissingOwned);
      row.dataset.cardId = id;
      row.dataset.finish = finish;
      row.dataset.copyIndex = String(copyIndex);
      row.dataset.copyCount = String(finishCount);
      row.dataset.deckCount = String(totalCount);
      row.dataset.deckLimit = String(limit);
      row.setAttribute("aria-label", `${card.name} ${finish} copy ${copyIndex + 1} of ${finishCount}, total ${totalCount} of ${limit}`);
      this.makeBuilderCardDraggable(row, {
        source: "deck",
        id,
        finish,
        drive: driveMode,
      });
      row.addEventListener("click", (event) => {
        if (this.consumeSuppressedBuilderClick(event)) return;
        this.selectedCardId = id;
        this.selectedFinish = finish;
        this.render({ preserveLibraryScroll: true, preserveDeckScroll: true });
        this.scrollLibraryToCard(id, finish);
      });
      if (isMissingOwned) {
        const badge = document.createElement("span");
        badge.className = "deck-copy-badge missing";
        badge.textContent = "!";
        row.append(badge);
      }
      return row;
    }
  }

  function sortCardRows(a, b) {
    if (!a || !b) return 0;
    const costA = Number.isFinite(a.cost) ? a.cost : 0;
    const costB = Number.isFinite(b.cost) ? b.cost : 0;
    if (costA !== costB) return costA - costB;
    if (a.type !== b.type) return a.type.localeCompare(b.type, "ja");
    return a.name.localeCompare(b.name, "ja");
  }

  function sameCounts(a = {}, b = {}) {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (const key of keys) {
      if ((Number(a[key]) || 0) !== (Number(b[key]) || 0)) return false;
    }
    return true;
  }

  function normalizeCompareName(name) {
    return String(name || "").trim().replace(/\s+/g, " ");
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function isDriveCard(card) {
    return Boolean(card?.driveKind || card?.type?.includes("ドライブ"));
  }

  window.Chrono.DeckBuilderView = DeckBuilderView;
})();
