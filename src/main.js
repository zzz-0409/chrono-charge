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
  } = window.Chrono;

  const els = {
    scaleMount: document.querySelector("#scaleMount"),
    appShell: document.querySelector("#appShell"),
    builderTab: document.querySelector("#builderTab"),
    packTab: document.querySelector("#packTab"),
    duelTab: document.querySelector("#duelTab"),
    builderView: document.querySelector("#builderView"),
    packView: document.querySelector("#packView"),
    duelView: document.querySelector("#duelView"),
    saveDeckButton: document.querySelector("#saveDeckButton"),
    createRoomButton: document.querySelector("#createRoomButton"),
    joinRoomButton: document.querySelector("#joinRoomButton"),
    newDuelButton: document.querySelector("#newDuelButton"),
    accountNameInput: document.querySelector("#accountNameInput"),
    accountNameList: document.querySelector("#accountNameList"),
    changeAccountButton: document.querySelector("#changeAccountButton"),
    deckPresetSelect: document.querySelector("#deckPresetSelect"),
    loadDeckButton: document.querySelector("#loadDeckButton"),
    deckNameInput: document.querySelector("#deckNameInput"),
    savePresetButton: document.querySelector("#savePresetButton"),
    saveAsPresetButton: document.querySelector("#saveAsPresetButton"),
    deletePresetButton: document.querySelector("#deletePresetButton"),
    autoBuildMode: document.querySelector("#autoBuildMode"),
    autoBuildButton: document.querySelector("#autoBuildButton"),
    bulkDismantleButton: document.querySelector("#bulkDismantleButton"),
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
    const showBuilder = view === "builder";
    const showPack = view === "pack";
    const showDuel = view === "duel";
    els.builderView.hidden = !showBuilder;
    els.packView.hidden = !showPack;
    els.duelView.hidden = !showDuel;
    els.builderTab.classList.toggle("active", showBuilder);
    els.packTab.classList.toggle("active", showPack);
    els.duelTab.classList.toggle("active", showDuel);
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
  });
  const packView = new PackView({
    store,
    els,
    toast,
    onCollectionChange: () => builderView.render({ preserveLibraryScroll: true }),
  });

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

  els.builderTab.addEventListener("click", () => setView("builder"));
  els.packTab.addEventListener("click", () => {
    navigateView("pack");
  });
  els.duelTab.addEventListener("click", () => {
    navigateView("duel");
  });

  setView("builder");
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
