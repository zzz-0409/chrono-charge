(function () {
  "use strict";

  const {
    DECK_SIZE,
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
    resetDeckButton: document.querySelector("#resetDeckButton"),
    clearDeckButton: document.querySelector("#clearDeckButton"),
    searchInput: document.querySelector("#searchInput"),
    typeFilter: document.querySelector("#typeFilter"),
    attrFilter: document.querySelector("#attrFilter"),
    poolCount: document.querySelector("#poolCount"),
    collectionGrid: document.querySelector("#collectionGrid"),
    deckCount: document.querySelector("#deckCount"),
    themeRate: document.querySelector("#themeRate"),
    avgCost: document.querySelector("#avgCost"),
    reactionCount: document.querySelector("#reactionCount"),
    deckList: document.querySelector("#deckList"),
    cardPreview: document.querySelector("#cardPreview"),
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
    onStartDuel: () => duelView.start(store.list),
  });

  const requireDeck = () => {
    const deck = store.list;
    if (deck.length !== DECK_SIZE) {
      toast("40枚デッキにするとオンライン対戦できます。");
      setView("builder");
      return null;
    }
    return deck;
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
    const deck = requireDeck();
    if (!deck) return;
    try {
      const client = await OnlineClient.createRoom(deck);
      startOnlineDuel(client);
      toast(`ルーム ${client.roomId} を作成しました。`);
    } catch (error) {
      toast(error.message || "ルーム作成に失敗しました。");
    }
  });

  els.joinRoomButton.addEventListener("click", async () => {
    if (!canUseOnline()) return;
    const deck = requireDeck();
    if (!deck) return;
    const roomId = window.prompt("参加するルームIDを入力してください。");
    if (!roomId) return;
    try {
      const client = await OnlineClient.joinRoom(roomId, deck);
      startOnlineDuel(client);
      toast(`ルーム ${client.roomId} に参加しました。`);
    } catch (error) {
      toast(error.message || "ルーム参加に失敗しました。");
    }
  });

  els.builderTab.addEventListener("click", () => setView("builder"));
  els.duelTab.addEventListener("click", () => {
    if (!duelView.game) duelView.start(store.list);
    else setView("duel");
  });

  setView("builder");
  builderView.render();
})();
