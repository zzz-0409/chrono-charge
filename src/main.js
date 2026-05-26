(function () {
  "use strict";

  const {
    DECK_SIZE,
    DRIVE_DECK_SIZE,
    DeckStore,
    DeckBuilderView,
    PackView,
    DuelView,
    ScaleManager,
    OnlineClient,
    OnlineGameProxy,
    cards,
  } = window.Chrono;

  const els = {
    scaleMount: document.querySelector("#scaleMount"),
    appShell: document.querySelector("#appShell"),
    homeTab: document.querySelector("#homeTab"),
    builderTab: document.querySelector("#builderTab"),
    packTab: document.querySelector("#packTab"),
    duelTab: document.querySelector("#duelTab"),
    homeView: document.querySelector("#homeView"),
    deckSelectView: document.querySelector("#deckSelectView"),
    builderView: document.querySelector("#builderView"),
    packView: document.querySelector("#packView"),
    duelView: document.querySelector("#duelView"),
    saveDeckButton: document.querySelector("#saveDeckButton"),
    createRoomButton: document.querySelector("#createRoomButton"),
    joinRoomButton: document.querySelector("#joinRoomButton"),
    newDuelButton: document.querySelector("#newDuelButton"),
    loginButton: document.querySelector("#loginButton"),
    displayNameInput: document.querySelector("#displayNameInput"),
    accountUsernameLabel: document.querySelector("#accountUsernameLabel"),
    saveDisplayNameButton: document.querySelector("#saveDisplayNameButton"),
    logoutButton: document.querySelector("#logoutButton"),
    deckPresetSelect: document.querySelector("#deckPresetSelect"),
    loadDeckButton: document.querySelector("#loadDeckButton"),
    deckNameInput: document.querySelector("#deckNameInput"),
    savePresetButton: document.querySelector("#savePresetButton"),
    saveAsPresetButton: document.querySelector("#saveAsPresetButton"),
    deletePresetButton: document.querySelector("#deletePresetButton"),
    autoBuildMode: document.querySelector("#autoBuildMode"),
    autoBuildButton: document.querySelector("#autoBuildButton"),
    bulkDismantleButton: document.querySelector("#bulkDismantleButton"),
    deckPresetGrid: document.querySelector("#deckPresetGrid"),
    deckSelectHomeButton: document.querySelector("#deckSelectHomeButton"),
    headerGachaStoneCount: document.querySelector("#headerGachaStoneCount"),
    headerDustCount: document.querySelector("#headerDustCount"),
    gachaStoneCount: document.querySelector("#gachaStoneCount"),
    packDustCount: document.querySelector("#packDustCount"),
    packList: document.querySelector("#packList"),
    selectedPackEyebrow: document.querySelector("#selectedPackEyebrow"),
    selectedPackTitle: document.querySelector("#selectedPackTitle"),
    openSelectedPackButton: document.querySelector("#openSelectedPackButton"),
    packResultGrid: document.querySelector("#packResultGrid"),
    searchInput: document.querySelector("#searchInput"),
    typeFilter: document.querySelector("#typeFilter"),
    attrFilter: document.querySelector("#attrFilter"),
    ownedOnlyToggle: document.querySelector("#ownedOnlyToggle"),
    poolCount: document.querySelector("#poolCount"),
    collectionGrid: document.querySelector("#collectionGrid"),
    mainDeckModeButton: document.querySelector("#mainDeckModeButton"),
    driveDeckModeButton: document.querySelector("#driveDeckModeButton"),
    deckPanelEyebrow: document.querySelector("#deckPanelEyebrow"),
    deckPanelTitle: document.querySelector("#deckPanelTitle"),
    deckCount: document.querySelector("#deckCount"),
    deckStats: document.querySelector("#deckStats"),
    themeRate: document.querySelector("#themeRate"),
    avgCost: document.querySelector("#avgCost"),
    reactionCount: document.querySelector("#reactionCount"),
    deckList: document.querySelector("#deckList"),
    cardPreview: document.querySelector("#cardPreview"),
    previewDeckControls: document.querySelector("#previewDeckControls"),
    enemyLp: document.querySelector("#enemyLp"),
    enemyLpBar: document.querySelector("#enemyLpBar"),
    playerLp: document.querySelector("#playerLp"),
    playerLpBar: document.querySelector("#playerLpBar"),
    turnBadge: document.querySelector("#turnBadge"),
    phaseBadge: document.querySelector("#phaseBadge"),
    enemyDeckInfo: document.querySelector("#enemyDeckInfo"),
    playerDeckInfo: document.querySelector("#playerDeckInfo"),
    enemyDeckPile: document.querySelector("#enemyDeckPile"),
    enemyGravePile: document.querySelector("#enemyGravePile"),
    playerDeckPile: document.querySelector("#playerDeckPile"),
    playerGravePile: document.querySelector("#playerGravePile"),
    enemyDrivePile: document.querySelector("#enemyDrivePile"),
    playerDrivePile: document.querySelector("#playerDrivePile"),
    enemyCharge: document.querySelector("#enemyCharge"),
    playerCharge: document.querySelector("#playerCharge"),
    enemyHandZone: document.querySelector("#enemyHandZone"),
    enemyCoreZones: document.querySelector("#enemyCoreZones"),
    playerCoreZones: document.querySelector("#playerCoreZones"),
    enemyUnitZones: document.querySelector("#enemyUnitZones"),
    playerUnitZones: document.querySelector("#playerUnitZones"),
    enemyReactionZones: document.querySelector("#enemyReactionZones"),
    playerReactionZones: document.querySelector("#playerReactionZones"),
    handZone: document.querySelector("#handZone"),
    handInfo: document.querySelector("#handInfo"),
    selectedCardPanel: document.querySelector("#selectedCardPanel"),
    contextActions: document.querySelector("#contextActions"),
    battleLog: document.querySelector("#battleLog"),
    endTurnButton: document.querySelector("#endTurnButton"),
    restartDuelButton: document.querySelector("#restartDuelButton"),
    modalRoot: document.querySelector("#modalRoot"),
    toast: document.querySelector("#toast"),
  };

  const playerPiles = document.querySelector(".player-piles");
  if (playerPiles) {
    const fieldCommand = document.createElement("div");
    fieldCommand.className = "turn-command-field";
    const fieldEndTurn = document.createElement("button");
    fieldEndTurn.id = "endTurnFieldButton";
    fieldEndTurn.className = "primary-button";
    fieldEndTurn.type = "button";
    fieldEndTurn.textContent = "ターン終了";
    fieldCommand.append(fieldEndTurn);
    playerPiles.prepend(fieldCommand);
    els.endTurnButton = fieldEndTurn;
  }

  let toastTimer = 0;
  const toast = (message) => {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 1300);
  };

  const setView = (view) => {
    const showHome = view === "home";
    const showDeckSelect = view === "deckSelect";
    const showBuilder = view === "builder";
    const showPack = view === "pack";
    const showDuel = view === "duel";
    els.homeView.hidden = !showHome;
    els.deckSelectView.hidden = !showDeckSelect;
    els.builderView.hidden = !showBuilder;
    els.packView.hidden = !showPack;
    els.duelView.hidden = !showDuel;
    els.homeTab.classList.toggle("active", showHome);
    els.builderTab.classList.toggle("active", showDeckSelect || showBuilder);
    els.packTab.classList.toggle("active", showPack);
    els.duelTab.classList.toggle("active", showDuel);
    const accountEnabled = showHome || showBuilder;
    els.loginButton.disabled = !accountEnabled;
    els.displayNameInput.disabled = !accountEnabled;
    els.saveDisplayNameButton.disabled = !accountEnabled;
    els.logoutButton.disabled = !accountEnabled;
    if (showDeckSelect) renderDeckSelectView();
    if (showPack) packView?.render();
  };

  const openAppModal = (content) => {
    els.modalRoot.replaceChildren(content);
    els.modalRoot.hidden = false;
  };

  const closeAppModal = () => {
    els.modalRoot.hidden = true;
    els.modalRoot.replaceChildren();
  };

  const askSaveBeforeLeaving = () => new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal-dialog app-confirm-dialog";
    modal.innerHTML = `
      <h2>デッキを保存しますか？</h2>
      <p>保存していない変更があります。</p>
      <div class="modal-actions modal-actions-row">
        <button class="ghost-button" type="button" data-choice="cancel">戻る</button>
        <button class="ghost-button" type="button" data-choice="discard">保存せず移動</button>
        <button class="primary-button" type="button" data-choice="save">保存して移動</button>
      </div>
    `;
    modal.querySelectorAll("[data-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        const choice = button.dataset.choice;
        closeAppModal();
        resolve(choice);
      });
    });
    openAppModal(modal);
  });

  const confirmSaveBeforeLeavingBuilder = async () => {
    if (els.builderView.hidden || !builderView?.hasUnsavedChanges?.()) return true;
    const choice = await askSaveBeforeLeaving();
    if (choice === "cancel") return false;
    if (choice === "save") builderView.saveActiveDeck();
    return true;
  };

  const navigateView = async (view) => {
    if (view !== "builder" && !(await confirmSaveBeforeLeavingBuilder())) return;
    setView(view);
  };

  const askRoomId = () => new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal-dialog app-input-dialog";
    modal.innerHTML = `
      <h2>ルーム参加</h2>
      <p>参加するルームIDを入力してください。</p>
      <label class="modal-field">
        <span>ルームID</span>
        <input id="roomIdModalInput" type="text" autocomplete="off" inputmode="text" maxlength="8">
      </label>
      <div class="modal-actions modal-actions-row">
        <button class="ghost-button" type="button" data-action="cancel">キャンセル</button>
        <button class="primary-button" type="button" data-action="join">参加</button>
      </div>
    `;
    const input = modal.querySelector("#roomIdModalInput");
    const finish = (value) => {
      closeAppModal();
      resolve(value);
    };
    modal.querySelector('[data-action="cancel"]').addEventListener("click", () => finish(""));
    modal.querySelector('[data-action="join"]').addEventListener("click", () => finish(input.value.trim().toUpperCase()));
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      finish(input.value.trim().toUpperCase());
    });
    openAppModal(modal);
    window.setTimeout(() => input.focus(), 0);
  });

  const askDeleteDeck = (name) => new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal-dialog app-confirm-dialog";
    modal.innerHTML = `
      <h2>プリセットを削除しますか？</h2>
      <p>${escapeHtml(name)}を削除します。</p>
      <div class="modal-actions modal-actions-row">
        <button class="ghost-button" type="button" data-choice="cancel">キャンセル</button>
        <button class="ghost-button danger" type="button" data-choice="delete">削除</button>
      </div>
    `;
    modal.querySelectorAll("[data-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        const choice = button.dataset.choice;
        closeAppModal();
        resolve(choice === "delete");
      });
    });
    openAppModal(modal);
  });

  new ScaleManager({
    mount: els.scaleMount,
    stage: els.appShell,
    width: 1366,
    height: 768,
    padding: 0,
  });

  const store = new DeckStore();
  const duelView = new DuelView({
    els,
    toast,
    setView,
    onCpuResult: (won) => {
      const gained = store.rewardCpuResult(won);
      builderView.render({ preserveLibraryScroll: true });
      packView.render();
      return gained;
    },
    onOnlineResult: (won) => {
      const gained = store.rewardOnlineResult(won);
      builderView.render({ preserveLibraryScroll: true });
      packView.render();
      return gained;
    },
  });
  const builderView = new DeckBuilderView({
    store,
    els,
    toast,
    onStartDuel: () => startCpuDuel(),
    onAccountChange: async () => {
      await store.syncActiveAccount();
      packView.render();
    },
    confirmDeleteDeck: askDeleteDeck,
    openAppModal,
    closeAppModal,
  });
  const packView = new PackView({
    store,
    els,
    toast,
    onCollectionChange: () => builderView.render({ preserveLibraryScroll: true }),
  });

  function renderDeckSelectView() {
    if (!els.deckPresetGrid) return;
    const deckCards = store.deckPresets.map((deck) => deckPresetCardHtml(deck)).join("");
    els.deckPresetGrid.innerHTML = `
      <button class="deck-preset-card deck-preset-create" type="button" data-create-deck="true">
        <span class="deck-preset-plus">+</span>
        <span class="deck-preset-info">
          <span class="deck-preset-title">新規デッキ</span>
          <span class="deck-preset-meta"><span>現在の内容から作成</span></span>
        </span>
      </button>
      ${deckCards}
    `;
  }

  function deckPresetCardHtml(deck) {
    const mainTotal = deckCount(deck.mainDeck) + deckCount(deck.mainDeckRoyal);
    const driveTotal = deckCount(deck.driveDeck) + deckCount(deck.driveDeckRoyal);
    const theme = deckTheme(deck);
    const image = deckPreviewImage(deck);
    const selected = deck.id === store.activeDeckId ? " selected" : "";
    return `
      <button class="deck-preset-card${selected}" type="button" data-deck-id="${escapeHtml(deck.id)}">
        <span class="deck-preset-art"><img src="${escapeHtml(image)}" alt=""></span>
        <span class="deck-preset-info">
          <span class="deck-preset-title">${escapeHtml(deck.name)}</span>
          <span class="deck-preset-meta">
            <span>${mainTotal}/${DECK_SIZE}</span>
            <span>D ${driveTotal}/${DRIVE_DECK_SIZE}</span>
            <span>${escapeHtml(theme)}</span>
          </span>
        </span>
      </button>
    `;
  }

  function deckCount(source = {}) {
    return Object.values(source || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
  }

  function deckPreviewImage(deck) {
    const ids = deckIds(deck);
    const ace = ids
      .map((id) => cards[id])
      .filter(Boolean)
      .sort((a, b) => (b.cost || 0) - (a.cost || 0))[0];
    return ace?.art || "assets/cards/card-back.png";
  }

  function deckTheme(deck) {
    const counts = new Map();
    deckIds(deck).forEach((id) => {
      const theme = cards[id]?.theme;
      if (!theme) return;
      counts.set(theme, (counts.get(theme) || 0) + 1);
    });
    let bestTheme = "混成";
    let bestCount = 0;
    counts.forEach((count, theme) => {
      if (count > bestCount) {
        bestTheme = theme;
        bestCount = count;
      }
    });
    return bestTheme;
  }

  function deckIds(deck) {
    const entries = [
      deck.mainDeck,
      deck.mainDeckRoyal,
      deck.driveDeck,
      deck.driveDeckRoyal,
    ];
    return entries.flatMap((source = {}) => (
      Object.entries(source || {}).flatMap(([id, count]) => Array(Math.max(0, Number(count) || 0)).fill(id))
    ));
  }

  function openDeckPresetForEdit(id) {
    if (!store.loadPreset(id)) return;
    builderView.selectedCardId = builderView.firstSelectedId();
    builderView.render();
    setView("builder");
  }

  function createDeckPresetForEdit() {
    const deck = store.saveAs(store.nextDeckName());
    builderView.selectedCardId = builderView.firstSelectedId();
    builderView.render();
    setView("builder");
    toast(`${deck.name}を作成しました。`);
  }

  const requireDeck = () => {
    const deck = store.list;
    const driveDeck = store.driveList;
    const ownership = store.validateActiveDeckOwnership();
    if (!ownership.ok) {
      const first = ownership.missing[0];
      toast(`${first.name}の所持枚数が足りません。デッキを直してください。`);
      setView("builder");
      builderView.render({ preserveLibraryScroll: true });
      return null;
    }
    if (deck.length !== DECK_SIZE) {
      toast("通常デッキを40枚にしてください。");
      setView("builder");
      return null;
    }
    if (driveDeck.length !== DRIVE_DECK_SIZE) {
      toast("ドライブデッキを10枚にしてください。");
      setView("builder");
      return null;
    }
    return { deck, driveDeck };
  };

  const startCpuDuel = () => {
    const deckSet = requireDeck();
    if (!deckSet) return;
    duelView.start(deckSet.deck, deckSet.driveDeck, {
      mainRoyalIds: store.royalBattleIds,
      driveRoyalIds: store.driveRoyalBattleIds,
    });
  };

  const canUseOnline = () => {
    if (window.location.protocol !== "file:") return true;
    toast("オンラインは node server.js で起動してから使えます。");
    return false;
  };

  const startOnlineDuel = (client) => {
    const game = new OnlineGameProxy({ client, toast });
    duelView.startOnline(game);
  };

  els.createRoomButton.addEventListener("click", async () => {
    if (!canUseOnline()) return;
    const deckSet = requireDeck();
    if (!deckSet) return;
    try {
      const client = await OnlineClient.createRoom(deckSet.deck, deckSet.driveDeck);
      startOnlineDuel(client);
      toast(`ルーム ${client.roomId} を作成しました。`);
    } catch (error) {
      toast(error.message || "ルーム作成に失敗しました。");
    }
  });

  els.joinRoomButton.addEventListener("click", async () => {
    if (!canUseOnline()) return;
    const deckSet = requireDeck();
    if (!deckSet) return;
    const roomId = await askRoomId();
    if (!roomId) return;
    try {
      const client = await OnlineClient.joinRoom(roomId, deckSet.deck, deckSet.driveDeck);
      startOnlineDuel(client);
      toast(`ルーム ${client.roomId} に参加しました。`);
    } catch (error) {
      toast(error.message || "ルーム参加に失敗しました。");
    }
  });

  els.homeTab.addEventListener("click", () => navigateView("home"));
  els.builderTab.addEventListener("click", () => navigateView("deckSelect"));
  els.packTab.addEventListener("click", () => navigateView("pack"));
  els.duelTab.addEventListener("click", () => navigateView("duel"));
  els.deckSelectHomeButton?.addEventListener("click", () => navigateView("home"));
  els.deckPresetGrid?.addEventListener("click", (event) => {
    const createButton = event.target.closest("[data-create-deck]");
    if (createButton) {
      createDeckPresetForEdit();
      return;
    }
    const deckButton = event.target.closest("[data-deck-id]");
    if (deckButton) openDeckPresetForEdit(deckButton.dataset.deckId);
  });
  document.querySelectorAll("[data-nav-view]").forEach((button) => {
    button.addEventListener("click", () => navigateView(button.dataset.navView));
  });

  setView("home");
  store.syncActiveAccount().finally(() => {
    builderView.render();
    packView.render();
  });

  let accountSyncTimer = 0;
  const syncAccountFromServer = () => {
    window.clearTimeout(accountSyncTimer);
    accountSyncTimer = window.setTimeout(() => {
      store.syncActiveAccount().finally(() => {
        builderView.render({ preserveLibraryScroll: true });
        packView.render();
      });
    }, 120);
  };
  window.addEventListener("focus", syncAccountFromServer);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncAccountFromServer();
  });

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }
})();
