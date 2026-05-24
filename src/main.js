(function () {
  "use strict";

  const {
    DECK_SIZE,
    DRIVE_DECK_SIZE,
    DeckStore,
    DeckBuilderView,
    DuelView,
    ScaleManager,
    OnlineClient,
    OnlineGameProxy,
  } = window.Chrono;

  const els = {
    scaleMount: document.querySelector("#scaleMount"),
    appShell: document.querySelector("#appShell"),
    builderTab: document.querySelector("#builderTab"),
    duelTab: document.querySelector("#duelTab"),
    builderView: document.querySelector("#builderView"),
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
    searchInput: document.querySelector("#searchInput"),
    typeFilter: document.querySelector("#typeFilter"),
    attrFilter: document.querySelector("#attrFilter"),
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

  let toastTimer = 0;
  const toast = (message) => {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 1300);
  };

  const setView = (view) => {
    const showBuilder = view === "builder";
    els.builderView.hidden = !showBuilder;
    els.duelView.hidden = showBuilder;
    els.builderTab.classList.toggle("active", showBuilder);
    els.duelTab.classList.toggle("active", !showBuilder);
  };

  new ScaleManager({
    mount: els.scaleMount,
    stage: els.appShell,
    width: 1366,
    height: 768,
    padding: 0,
  });

  const store = new DeckStore();
  const duelView = new DuelView({ els, toast, setView });
  const builderView = new DeckBuilderView({
    store,
    els,
    toast,
    onStartDuel: () => duelView.start(store.list, store.driveList),
  });

  const requireDeck = () => {
    const deck = store.list;
    const driveDeck = store.driveList;
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
    const roomId = window.prompt("参加するルームIDを入力してください。");
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
  els.duelTab.addEventListener("click", () => {
    if (!duelView.game) duelView.start(store.list, store.driveList);
    else setView("duel");
  });

  setView("builder");
  builderView.render();
})();
