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
    DuelGame,
    SoundEffects,
    cards,
    CardRenderer,
    CardZoom,
    notices: noticeEntries = [],
  } = window.Chrono;

  const els = {
    scaleMount: document.querySelector("#scaleMount"),
    appShell: document.querySelector("#appShell"),
    homeTab: document.querySelector("#homeTab"),
    builderTab: document.querySelector("#builderTab"),
    packTab: document.querySelector("#packTab"),
    duelTab: document.querySelector("#duelTab"),
    homeView: document.querySelector("#homeView"),
    titleView: document.querySelector("#titleView"),
    deckSelectView: document.querySelector("#deckSelectView"),
    builderView: document.querySelector("#builderView"),
    packView: document.querySelector("#packView"),
    packResultView: document.querySelector("#packResultView"),
    duelMenuView: document.querySelector("#duelMenuView"),
    duelView: document.querySelector("#duelView"),
    chronoGridView: document.querySelector("#chronoGridView"),
    chronoGridFrame: document.querySelector("#chronoGridFrame"),
    saveDeckButton: document.querySelector("#saveDeckButton"),
    createRoomButton: document.querySelector("#createRoomButton"),
    joinRoomButton: document.querySelector("#joinRoomButton"),
    newDuelButton: document.querySelector("#newDuelButton"),
    duelSelectedDeckButton: document.querySelector("#duelSelectedDeckButton"),
    modeCreateRoomButton: document.querySelector("#modeCreateRoomButton"),
    modeJoinRoomButton: document.querySelector("#modeJoinRoomButton"),
    modeCpuDuelButton: document.querySelector("#modeCpuDuelButton"),
    modeRankedDuelButton: document.querySelector("#modeRankedDuelButton"),
    rankedLeaderboardButton: document.querySelector("#rankedLeaderboardButton"),
    rankedModeCard: document.querySelector(".mode-ranked"),
    cpuLevelSelect: document.querySelector("#cpuLevelSelect"),
    cpuThemeSelect: document.querySelector("#cpuThemeSelect"),
    cpuFirstSelect: document.querySelector("#cpuFirstSelect"),
    rankedStatusText: document.querySelector("#rankedStatusText"),
    rankedNextRankText: document.querySelector("#rankedNextRankText"),
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
    giftButton: document.querySelector("#giftButton"),
    giftCountBadge: document.querySelector("#giftCountBadge"),
    gachaStoneCount: document.querySelector("#gachaStoneCount"),
    packDustCount: document.querySelector("#packDustCount"),
    packList: document.querySelector("#packList"),
    selectedPackEyebrow: document.querySelector("#selectedPackEyebrow"),
    selectedPackTitle: document.querySelector("#selectedPackTitle"),
    openSelectedPackButton: document.querySelector("#openSelectedPackButton"),
    selectedPackPreview: document.querySelector("#selectedPackPreview"),
    packResultEyebrow: document.querySelector("#packResultEyebrow"),
    packResultTitle: document.querySelector("#packResultTitle"),
    packResultBackButton: document.querySelector("#packResultBackButton"),
    packResultAgainButton: document.querySelector("#packResultAgainButton"),
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
    enemyNameplate: document.querySelector("#enemyNameplate"),
    playerLp: document.querySelector("#playerLp"),
    playerLpBar: document.querySelector("#playerLpBar"),
    playerNameplate: document.querySelector("#playerNameplate"),
    turnBadge: document.querySelector("#turnBadge"),
    phaseBadge: document.querySelector("#phaseBadge"),
    enemyDeckInfo: document.querySelector("#enemyDeckInfo"),
    playerDeckInfo: document.querySelector("#playerDeckInfo"),
    enemyDeckPile: document.querySelector("#enemyDeckPile"),
    enemyGravePile: document.querySelector("#enemyGravePile"),
    enemyAbyssPile: document.querySelector("#enemyAbyssPile"),
    playerDeckPile: document.querySelector("#playerDeckPile"),
    playerGravePile: document.querySelector("#playerGravePile"),
    playerAbyssPile: document.querySelector("#playerAbyssPile"),
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

  const RANK_TIERS = [
    { tier: "bronze", label: "ブロンズ", min: 0 },
    { tier: "silver", label: "シルバー", min: 1200 },
    { tier: "gold", label: "ゴールド", min: 1500 },
    { tier: "platinum", label: "プラチナ", min: 1800 },
    { tier: "diamond", label: "ダイヤ", min: 2200 },
    { tier: "master", label: "マスター", min: 2600 },
  ];

  const playerPiles = document.querySelector(".player-piles");
  if (playerPiles) {
    const fieldCommand = document.createElement("div");
    fieldCommand.className = "turn-command-field";
    const fieldStatus = document.createElement("div");
    fieldStatus.className = "turn-status";
    fieldStatus.append(els.turnBadge, els.phaseBadge);
    const fieldEndTurn = document.createElement("button");
    fieldEndTurn.id = "endTurnFieldButton";
    fieldEndTurn.className = "primary-button";
    fieldEndTurn.type = "button";
    fieldEndTurn.textContent = "ターン終了";
    fieldCommand.append(fieldStatus, fieldEndTurn);
    playerPiles.prepend(fieldCommand);
    els.endTurnButton = fieldEndTurn;
  }

  let toastTimer = 0;
  let hiddenViewsReleasedForDuel = false;
  const GRID_REPLACEMENT_MODE = false;
  const CHRONO_GRID_FRAME_VERSION = "20260607zoomtop";
  const CHRONO_GRID_MAINTENANCE_TITLE = "メンテナンス中";
  const CHRONO_GRID_MAINTENANCE_TEXT = "現在はクロノグリッドへの移行作業中です。ゲストモードのCPU戦とデッキ編集だけ利用できます。";
  const DUEL_RECOVERY_KEY = "chrono.cpuDuelRecovery.v1";
  const DUEL_RECOVERY_MAX_AGE_MS = 12 * 60 * 60 * 1000;
  const toast = (message) => {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 1300);
  };

  const normalizeView = (view) => {
    if (!GRID_REPLACEMENT_MODE) return view;
    if (view === "deckSelect" || view === "builder") return "chronoGridDeck";
    if (view === "duel") return "chronoGridBattle";
    return view;
  };

  const setChronoGridLoading = (loading) => {
    els.chronoGridView?.classList.toggle("loading", Boolean(loading));
    els.chronoGridFrame?.classList.toggle("loading", Boolean(loading));
  };

  const setChronoGridFrame = (mode) => {
    if (!els.chronoGridFrame) return;
    const safeMode = mode === "deck" ? "deck" : "battle";
    const src = `chrono-grid/index.html?embedded=1&entry=${safeMode}&v=${CHRONO_GRID_FRAME_VERSION}`;
    if (els.chronoGridFrame.dataset.mode !== safeMode) {
      setChronoGridLoading(true);
      els.chronoGridFrame.dataset.mode = safeMode;
      els.chronoGridFrame.src = src;
    }
  };

  els.chronoGridFrame?.addEventListener("load", () => {
    try {
      const frameUrl = new URL(els.chronoGridFrame.contentWindow.location.href);
      const loadedMode = frameUrl.searchParams.get("entry") === "deck" ? "deck" : "battle";
      if (loadedMode !== els.chronoGridFrame.dataset.mode) return;
    } catch (error) {
      console.warn("Chrono Grid frame load check failed:", error);
    }
    setChronoGridLoading(false);
  });

  const setView = (view) => {
    view = normalizeView(view);
    if (GRID_REPLACEMENT_MODE && (view === "pack" || view === "packResult")) {
      openMaintenanceModal("pack");
      return;
    }
    const showHome = view === "home";
    const showDeckSelect = view === "deckSelect";
    const showBuilder = view === "builder";
    const showPack = view === "pack";
    const showPackResult = view === "packResult";
    const showDuelMenu = view === "duelMenu";
    const showDuel = view === "duel";
    const showChronoGridBattle = view === "chronoGridBattle";
    const showChronoGridDeck = view === "chronoGridDeck";
    const showChronoGrid = showChronoGridBattle || showChronoGridDeck;
    if (showChronoGridBattle) setChronoGridFrame("battle");
    if (showChronoGridDeck) setChronoGridFrame("deck");
    els.homeView.hidden = !showHome;
    els.deckSelectView.hidden = !showDeckSelect;
    els.builderView.hidden = !showBuilder;
    els.packView.hidden = !showPack;
    els.packResultView.hidden = !showPackResult;
    els.duelMenuView.hidden = !showDuelMenu;
    els.duelView.hidden = !showDuel;
    if (els.chronoGridView) els.chronoGridView.hidden = !showChronoGrid;
    els.homeTab?.classList.toggle("active", showHome);
    els.builderTab?.classList.toggle("active", showDeckSelect || showBuilder || showChronoGridDeck);
    els.packTab?.classList.toggle("active", showPack || showPackResult);
    els.duelTab?.classList.toggle("active", showDuelMenu || showDuel || showChronoGridBattle);
    els.appShell?.classList.toggle("compact-header", !showHome);
    els.appShell?.classList.toggle("duel-menu-active", showDuelMenu);
    els.appShell?.classList.toggle("duel-active", showDuel);
    els.appShell?.classList.toggle("chrono-grid-active", showChronoGrid);
    const activeNavView = showDeckSelect || showBuilder
      ? "deckSelect"
      : showChronoGridDeck
        ? "deckSelect"
        : showPack || showPackResult
        ? "pack"
        : showDuelMenu || showDuel || showChronoGridBattle
          ? "duelMenu"
          : "home";
    document.querySelectorAll("[data-nav-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.navView === activeNavView);
    });
    const accountEnabled = !GRID_REPLACEMENT_MODE;
    els.loginButton.disabled = !accountEnabled;
    els.displayNameInput.disabled = !accountEnabled;
    els.saveDisplayNameButton.disabled = !accountEnabled;
    els.logoutButton.disabled = !accountEnabled;
    if (showDuel) {
      releaseHiddenViewDomForDuel();
    } else if (hiddenViewsReleasedForDuel) {
      hiddenViewsReleasedForDuel = false;
    }
    if (showDeckSelect) renderDeckSelectView();
    if (showBuilder) builderView?.render({ preserveLibraryScroll: true });
    if (showPack || showPackResult) packView?.render();
    if (showDuelMenu) {
      renderDuelMenuDeckCard();
      renderRankedStatus();
    }
    renderShellResources();
  };

  const releaseHiddenViewDomForDuel = () => {
    if (hiddenViewsReleasedForDuel) return;
    hiddenViewsReleasedForDuel = true;
    [
      els.deckPresetGrid,
      els.collectionGrid,
      els.deckList,
      els.cardPreview,
      els.previewDeckControls,
      els.packList,
      els.selectedPackPreview,
      els.packResultGrid,
    ].forEach((element) => element?.replaceChildren());
  };

  function saveCpuDuelRecovery(game) {
    if (!game || game.isOnline || game.finished || typeof game.snapshot !== "function") return;
    if (game.active !== "player") return;
    if (game.busy || game.cpuThinking || game.enemyTurnRunning || game.pendingChoice || game.waitingChoice) return;
    try {
      window.localStorage.setItem(DUEL_RECOVERY_KEY, JSON.stringify({
        savedAt: Date.now(),
        mainRoyalIds: [...(store.royalBattleIds || [])],
        driveRoyalIds: [...(store.driveRoyalBattleIds || [])],
        game: game.snapshot(),
      }));
    } catch (error) {
      console.warn("Duel recovery save failed", error);
    }
  }

  function clearCpuDuelRecovery() {
    try {
      window.localStorage.removeItem(DUEL_RECOVERY_KEY);
    } catch {
      // Recovery is best-effort only.
    }
  }

  function loadCpuDuelRecovery() {
    try {
      const raw = window.localStorage.getItem(DUEL_RECOVERY_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      const savedAt = Number(payload?.savedAt || 0);
      if (!payload?.game || !savedAt || Date.now() - savedAt > DUEL_RECOVERY_MAX_AGE_MS) {
        clearCpuDuelRecovery();
        return null;
      }
      return payload;
    } catch (error) {
      console.warn("Duel recovery load failed", error);
      clearCpuDuelRecovery();
      return null;
    }
  }

  const askCpuDuelRecovery = (payload) => new Promise((resolve) => {
    const savedAt = Number(payload?.savedAt || payload?.game?.savedAt || 0);
    const savedTime = savedAt
      ? new Date(savedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "";
    const modal = document.createElement("div");
    modal.className = "modal-dialog app-confirm-dialog";
    modal.innerHTML = `
      <h2>中断された対戦があります</h2>
      <p>${savedTime ? `${escapeHtml(savedTime)}に保存された` : "保存された"}CPU対戦を復帰しますか？</p>
      <div class="modal-actions modal-actions-row">
        <button class="ghost-button danger" type="button" data-choice="discard" data-cancel-sound="true">復帰しない</button>
        <button class="primary-button" type="button" data-choice="resume">復帰する</button>
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

  function resumeRecoveredCpuDuel(payload = loadCpuDuelRecovery()) {
    if (!payload) return false;
    try {
      const game = DuelGame.fromSnapshot(payload.game);
      setTitleActive(false);
      duelView.resumeLocal(game, {
        mainRoyalIds: payload.mainRoyalIds || [],
        driveRoyalIds: payload.driveRoyalIds || [],
      });
      toast("中断された対戦を復帰しました。");
      return true;
    } catch (error) {
      console.warn("Duel recovery resume failed", error);
      clearCpuDuelRecovery();
      return false;
    }
  }

  async function promptRecoveredCpuDuel() {
    const payload = loadCpuDuelRecovery();
    if (!payload) return false;
    const choice = await askCpuDuelRecovery(payload);
    if (choice === "resume") return resumeRecoveredCpuDuel(payload);
    clearCpuDuelRecovery();
    toast("中断された対戦を破棄しました。");
    return false;
  }

  const openAppModal = (content) => {
    els.modalRoot.replaceChildren(content);
    els.modalRoot.hidden = false;
  };

  const closeAppModal = () => {
    els.modalRoot.hidden = true;
    els.modalRoot.replaceChildren();
  };

  function openMaintenanceModal(surface = "system") {
    const labels = {
      pack: "カードとパック",
      account: "ログインとアカウント",
      online: "オンライン対戦",
      ranked: "ランク戦",
      room: "ルーム戦",
      gift: "プレゼント",
      notice: "お知らせ",
      shop: "ショップ",
      profile: "プロフィール",
      system: "この機能",
    };
    const label = labels[surface] || labels.system;
    const modal = document.createElement("div");
    modal.className = "modal-dialog app-confirm-dialog maintenance-dialog";
    modal.innerHTML = `
      <p class="eyebrow">Chrono Grid Migration</p>
      <h2>${CHRONO_GRID_MAINTENANCE_TITLE}</h2>
      <p>${escapeHtml(label)}は現在メンテナンス中です。</p>
      <p>${CHRONO_GRID_MAINTENANCE_TEXT}</p>
      <div class="modal-actions modal-actions-row">
        <button class="primary-button" type="button" data-action="close">OK</button>
      </div>
    `;
    modal.querySelector('[data-action="close"]').addEventListener("click", closeAppModal);
    openAppModal(modal);
  }

  const setTitleActive = (active) => {
    els.appShell?.classList.toggle("title-active", active);
  };

  const enterAppFromTitle = () => {
    setTitleActive(false);
    setView("home");
    if (!GRID_REPLACEMENT_MODE) {
      builderView.render();
      packView.render();
      showLoginBonusIfReady();
    }
    renderRankedStatus();
    renderShellResources();
  };

  const openTitleLogin = () => {
    builderView.openAuthDialog({
      allowGuest: true,
      onSuccess: () => enterAppFromTitle(),
      onGuest: () => {
        enterAppFromTitle();
        toast("ゲストモードで開始しました。");
      },
    });
  };

  const handleTitleStart = () => {
    if (!els.appShell?.classList.contains("title-active")) return;
    if (GRID_REPLACEMENT_MODE) {
      forceGuestMode();
      enterAppFromTitle();
      toast("ゲストモードで開始しました。");
      return;
    }
    if (store.isAuthenticated) {
      enterAppFromTitle();
      return;
    }
    openTitleLogin();
  };

  const handleTitleKeydown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleTitleStart();
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
    if (choice === "save") return Boolean(builderView.saveActiveDeck());
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

  function forceGuestMode() {
    if (!GRID_REPLACEMENT_MODE) return;
    if (!store.isAuthenticated) return;
    store.saveAuth(null);
    store.pendingLoginBonus = null;
    store.applyLoadedState(store.guestState());
  }

  forceGuestMode();
  els.appShell?.classList.toggle("guest-only-mode", GRID_REPLACEMENT_MODE);

  const duelView = new DuelView({
    els,
    toast,
    setView,
    onDuelSnapshot: (game) => saveCpuDuelRecovery(game),
    onDuelFinished: () => clearCpuDuelRecovery(),
    onCpuResult: (won) => {
      const gained = store.rewardCpuResult(won);
      builderView.render({ preserveLibraryScroll: true });
      packView.render();
      renderShellResources();
      return gained;
    },
    onOnlineResult: (won) => {
      if (duelView.game?.isRanked) store.applyRankedSnapshot(duelView.game.rankedResult);
      const gained = store.rewardOnlineResult(won);
      builderView.render({ preserveLibraryScroll: true });
      packView.render();
      renderRankedStatus();
      renderShellResources();
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
      renderShellResources();
      checkRankedResume();
    },
    onLoginBonus: () => showLoginBonusIfReady(),
    confirmDeleteDeck: askDeleteDeck,
    openAppModal,
    closeAppModal,
  });
  const packView = new PackView({
    store,
    els,
    toast,
    setView,
    sounds: SoundEffects,
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

  function renderDuelMenuDeckCard() {
    const button = els.duelSelectedDeckButton;
    if (!button) return;
    if (GRID_REPLACEMENT_MODE) {
      button.disabled = false;
      button.classList.add("ready");
      button.classList.remove("unusable");
      button.innerHTML = `
        <span class="duel-selected-deck-head">
          <span class="duel-mode-emblem duel-mode-emblem-deck" aria-hidden="true"></span>
          <span>
            <span class="eyebrow">Guest Deck</span>
            <strong>Chrono Grid Prototype</strong>
          </span>
        </span>
        <span class="duel-selected-deck-art"><img src="chrono-grid/assets/art/battle-bg.png" alt=""></span>
        <span class="deck-preset-meta duel-selected-deck-meta">
          <span>17 cards</span>
          <span>3x3 Grid</span>
          <span>CPU Ready</span>
        </span>
        <span class="duel-deck-status">デッキ編集は下部メニューのDECKから行えます</span>
      `;
      return;
    }
    const deck = store.activeDeck || store.deckPresets[0];
    if (!deck) {
      button.disabled = true;
      button.classList.remove("ready", "unusable");
      button.innerHTML = `<span class="duel-selected-deck-empty">デッキがありません</span>`;
      return;
    }
    const mainTotal = deckCount(deck.mainDeck) + deckCount(deck.mainDeckRoyal);
    const driveTotal = deckCount(deck.driveDeck) + deckCount(deck.driveDeckRoyal);
    const image = deckPreviewImage(deck);
    const theme = deckTheme(deck);
    const issues = duelDeckIssues(deck);
    const ready = issues.length === 0;
    button.disabled = false;
    button.classList.toggle("ready", ready);
    button.classList.toggle("unusable", !ready);
    button.innerHTML = `
      <span class="duel-selected-deck-head">
        <span class="duel-mode-emblem duel-mode-emblem-deck" aria-hidden="true"></span>
        <span>
          <span class="eyebrow">Preset Deck</span>
          <strong>${escapeHtml(deck.name)}</strong>
        </span>
      </span>
      <span class="duel-selected-deck-art"><img src="${escapeHtml(image)}" alt=""></span>
      <span class="deck-preset-meta duel-selected-deck-meta">
        <span>${mainTotal}/${DECK_SIZE}</span>
        <span>D ${driveTotal}/${DRIVE_DECK_SIZE}</span>
        <span>${escapeHtml(theme)}</span>
      </span>
      <span class="duel-deck-status">${escapeHtml(ready ? "使用可能" : issues[0])}</span>
    `;
  }

  function renderRankedStatus() {
    if (!els.rankedStatusText) return;
    if (GRID_REPLACEMENT_MODE) {
      els.rankedStatusText.textContent = "クロノグリッド移行中: ランク戦はメンテナンス中";
      if (els.rankedModeCard) els.rankedModeCard.dataset.rankTier = "bronze";
      if (els.rankedNextRankText) els.rankedNextRankText.textContent = "現在はゲストCPU戦のみ利用できます";
      return;
    }
    if (!store.isAuthenticated) {
      els.rankedStatusText.textContent = "ログインでランク記録";
      if (els.rankedModeCard) els.rankedModeCard.dataset.rankTier = "bronze";
      if (els.rankedNextRankText) els.rankedNextRankText.textContent = "次: シルバーまであと200 RP（1200 RP）";
      return;
    }
    const ranked = store.ranked;
    const progress = rankedProgress(ranked.points);
    if (els.rankedModeCard) els.rankedModeCard.dataset.rankTier = progress.current.tier;
    els.rankedStatusText.textContent = `${store.rankedLabel} / ${ranked.wins}勝 ${ranked.losses}敗`;
    if (els.rankedNextRankText) {
      els.rankedNextRankText.textContent = progress.next
        ? `次: ${progress.next.label}まであと${progress.remaining} RP（${progress.next.min} RP）`
        : "最高ランク到達";
    }
  }

  function rankedProgress(points) {
    const value = Number(points) || 0;
    const current = RANK_TIERS.reduce((best, tier) => (value >= tier.min ? tier : best), RANK_TIERS[0]);
    const next = RANK_TIERS.find((tier) => value < tier.min) || null;
    return {
      current,
      next,
      remaining: next ? Math.max(0, next.min - value) : 0,
    };
  }

  function renderShellResources() {
    if (els.headerGachaStoneCount) els.headerGachaStoneCount.textContent = store.isAuthorAccount ? "作者" : String(store.gems);
    if (els.headerDustCount) els.headerDustCount.textContent = String(store.dust);
    const count = store.presentCount;
    if (els.giftCountBadge) {
      els.giftCountBadge.hidden = count <= 0;
      els.giftCountBadge.textContent = String(Math.min(count, 99));
    }
    if (els.giftButton) {
      const label = count > 0 ? `プレゼント ${count}件` : "プレゼント";
      els.giftButton.setAttribute("aria-label", label);
      els.giftButton.title = label;
    }
  }

  function openSettingsModal() {
    const soundEnabled = typeof SoundEffects?.isEnabled === "function"
      ? SoundEffects.isEnabled()
      : Boolean(SoundEffects?.enabled);
    const soundVolume = typeof SoundEffects?.getVolume === "function"
      ? SoundEffects.getVolume()
      : Number(SoundEffects?.volume || 1);
    const soundVolumePercent = Math.round(Math.max(0, Math.min(1, soundVolume)) * 100);
    const modal = document.createElement("div");
    modal.className = "modal-dialog app-settings-dialog";
    modal.innerHTML = `
      <h2>設定</h2>
      <div class="settings-list">
        <label class="settings-toggle-row">
          <span>SE</span>
          <input id="soundEffectsToggle" type="checkbox"${soundEnabled ? " checked" : ""}>
        </label>
        <label class="settings-range-row">
          <span>
            <span>音量</span>
            <strong id="soundVolumeValue">${soundVolumePercent}%</strong>
          </span>
          <input id="soundVolumeRange" type="range" min="0" max="100" step="5" value="${soundVolumePercent}"${soundEnabled ? "" : " disabled"} aria-label="SE音量">
        </label>
      </div>
      <div class="modal-actions modal-actions-row">
        <button class="ghost-button" type="button" data-action="close">閉じる</button>
      </div>
    `;
    const toggle = modal.querySelector("#soundEffectsToggle");
    const range = modal.querySelector("#soundVolumeRange");
    const volumeValue = modal.querySelector("#soundVolumeValue");
    const updateVolumeLabel = () => {
      if (volumeValue) volumeValue.textContent = `${range?.value || 0}%`;
    };
    toggle?.addEventListener("change", () => {
      SoundEffects?.setEnabled?.(toggle.checked);
      if (range) range.disabled = !toggle.checked;
      toast(toggle.checked ? "SEをオンにしました。" : "SEをオフにしました。");
    });
    range?.addEventListener("input", () => {
      updateVolumeLabel();
      SoundEffects?.setVolume?.(Number(range.value) / 100);
    });
    modal.querySelector('[data-action="close"]').addEventListener("click", closeAppModal);
    openAppModal(modal);
  }

  function showLoginBonusIfReady() {
    if (GRID_REPLACEMENT_MODE) return;
    if (els.appShell?.classList.contains("title-active")) return;
    const reward = store.takeLoginBonusReward();
    if (!reward) return;
    openLoginBonusModal(reward);
  }

  function openLoginBonusModal(reward) {
    const cycleDays = Math.max(1, Math.min(10, Math.floor(Number(reward.cycleDays) || 10)));
    const totalClaims = Math.max(0, Math.floor(Number(reward.totalClaims) || 0));
    const claimedCycleDay = totalClaims > 0
      ? ((totalClaims - 1) % cycleDays) + 1
      : Math.floor(Number(reward.cycleDay) || 1);
    const currentDay = Math.max(1, Math.min(cycleDays, claimedCycleDay));
    const modal = document.createElement("div");
    modal.className = "modal-dialog login-bonus-dialog";
    modal.innerHTML = `
      <div class="login-bonus-hero">
        <p>DAILY LOGIN</p>
        <h2>ログインボーナス</h2>
        <span>毎日24:00更新</span>
      </div>
      <div class="login-bonus-grid">
        ${Array.from({ length: cycleDays }, (_, index) => loginBonusDayHtml(index + 1, currentDay, reward.amount)).join("")}
      </div>
      <p class="login-bonus-message">本日の報酬はプレゼントに届きました。</p>
      <div class="modal-actions modal-actions-row">
        <button class="ghost-button" type="button" data-action="close">OK</button>
        <button class="primary-button" type="button" data-action="present">プレゼントを見る</button>
      </div>
    `;
    modal.querySelector('[data-action="close"]').addEventListener("click", closeAppModal);
    modal.querySelector('[data-action="present"]').addEventListener("click", () => {
      closeAppModal();
      openPresentBox();
    });
    openAppModal(modal);
  }

  function loginBonusDayHtml(day, currentDay, amount) {
    const claimed = day <= currentDay;
    const current = day === currentDay;
    return `
      <article class="login-bonus-day${claimed ? " claimed" : ""}${current ? " current" : ""}">
        <span class="login-bonus-day-label">${day}日目</span>
        <span class="login-bonus-check" aria-hidden="true">✓</span>
        <img src="assets/ui/gacha-stone.png" alt="">
        <strong>${escapeHtml(amount)}個</strong>
      </article>
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
    if (Array.isArray(source)) return deckSourceIds(source).length;
    return Object.values(source || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
  }

  function duelDeckChoiceHtml(deck) {
    const mainTotal = deckCount(deck.mainDeck) + deckCount(deck.mainDeckRoyal);
    const driveTotal = deckCount(deck.driveDeck) + deckCount(deck.driveDeckRoyal);
    const image = deckPreviewImage(deck);
    const theme = deckTheme(deck);
    const issues = duelDeckIssues(deck);
    const ready = issues.length === 0;
    const selected = deck.id === store.activeDeckId ? " selected" : "";
    const state = ready ? "ready" : "unusable";
    return `
      <button class="deck-preset-card duel-deck-choice ${state}${selected}" type="button" data-duel-deck-id="${escapeHtml(deck.id)}">
        <span class="deck-preset-art"><img src="${escapeHtml(image)}" alt=""></span>
        <span class="deck-preset-info">
          <span class="deck-preset-title">${escapeHtml(deck.name)}</span>
          <span class="deck-preset-meta">
            <span>${mainTotal}/${DECK_SIZE}</span>
            <span>D ${driveTotal}/${DRIVE_DECK_SIZE}</span>
            <span>${escapeHtml(theme)}</span>
          </span>
          <span class="duel-deck-status">${escapeHtml(ready ? "使用可能" : issues[0])}</span>
        </span>
      </button>
    `;
  }

  function duelDeckIssues(deck) {
    const issues = [];
    const mainTotal = deckCount(deck.mainDeck) + deckCount(deck.mainDeckRoyal);
    const driveTotal = deckCount(deck.driveDeck) + deckCount(deck.driveDeckRoyal);
    if (mainTotal !== DECK_SIZE) issues.push(`通常 ${mainTotal}/${DECK_SIZE}`);
    if (driveTotal !== DRIVE_DECK_SIZE) issues.push(`ドライブ ${driveTotal}/${DRIVE_DECK_SIZE}`);
    const missing = deckOwnershipIssues(deck);
    if (missing.length) {
      issues.push("カード不足");
    }
    return issues;
  }

  function deckOwnershipIssues(deck) {
    if (store.isAuthorAccount) return [];
    return [
      ...deckSourceOwnershipIssues(deck.mainDeck),
      ...deckSourceOwnershipIssues(deck.mainDeckRoyal, "royal"),
      ...deckSourceOwnershipIssues(deck.driveDeck),
      ...deckSourceOwnershipIssues(deck.driveDeckRoyal, "royal"),
    ];
  }

  function deckSourceOwnershipIssues(source = {}, finish = "normal") {
    return Object.entries(deckSourceCounts(source))
      .map(([id, count]) => ({
        id,
        name: cards[id]?.name || id,
        count,
        owned: store.ownedCount(id, finish),
        finish,
      }))
      .filter((entry) => entry.count > entry.owned);
  }

  function deckSourceCounts(source = {}) {
    const result = {};
    deckSourceIds(source).forEach((id) => {
      if (!cards[id]) return;
      result[id] = (result[id] || 0) + 1;
    });
    return result;
  }

  function deckPreviewImage(deck) {
    const ids = deckIds(deck);
    if (deck.favoriteCardId && ids.includes(deck.favoriteCardId) && cards[deck.favoriteCardId]?.art) {
      return cardPreviewArt(cards[deck.favoriteCardId]);
    }
    const ace = ids
      .map((id) => cards[id])
      .filter(Boolean)
      .sort((a, b) => (b.cost || 0) - (a.cost || 0))[0];
    return cardPreviewArt(ace);
  }

  function cardPreviewArt(card) {
    if (!card?.art) return "assets/cards/card-back.png";
    return window.Chrono.CardRenderer?.artSource(card) || card.art;
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
    return entries.flatMap((source = {}) => deckSourceIds(source));
  }

  function deckSourceIds(source = {}) {
    if (Array.isArray(source)) return source.filter((id) => cards[id]);
    return Object.entries(source || {}).flatMap(([id, count]) => Array(Math.max(0, Number(count) || 0)).fill(id));
  }

  function openDeckPresetForEdit(id) {
    if (!store.loadPreset(id)) return;
    builderView.selectedCardId = builderView.firstSelectedId();
    builderView.render();
    setView("builder");
  }

  function openDeckPresetActions(id) {
    const deck = store.activeAccountData.decks[id];
    if (!deck) return;
    const modal = document.createElement("div");
    modal.className = "modal-dialog deck-action-dialog";
    modal.innerHTML = `
      <h2>${escapeHtml(deck.name)}</h2>
      <div class="deck-action-list">
        <button class="primary-button" type="button" data-action="edit">カード編集</button>
        <button class="ghost-button" type="button" data-action="rename">デッキ名編集</button>
        <button class="ghost-button" type="button" data-action="favorite">お気に入りカード選択</button>
      </div>
      <div class="modal-actions modal-actions-row">
        <button class="ghost-button" type="button" data-action="cancel">閉じる</button>
      </div>
    `;
    modal.querySelector('[data-action="edit"]').addEventListener("click", () => {
      closeAppModal();
      openDeckPresetForEdit(id);
    });
    modal.querySelector('[data-action="rename"]').addEventListener("click", () => openDeckRenameDialog(id));
    modal.querySelector('[data-action="favorite"]').addEventListener("click", () => openDeckFavoriteDialog(id));
    modal.querySelector('[data-action="cancel"]').addEventListener("click", closeAppModal);
    openAppModal(modal);
  }

  function openDeckRenameDialog(id) {
    const deck = store.activeAccountData.decks[id];
    if (!deck) return;
    const modal = document.createElement("div");
    modal.className = "modal-dialog app-input-dialog";
    modal.innerHTML = `
      <h2>デッキ名編集</h2>
      <label class="modal-field">
        <span>デッキ名</span>
        <input id="deckRenameInput" type="text" autocomplete="off" maxlength="32" value="${escapeHtml(deck.name)}">
      </label>
      <div class="modal-actions modal-actions-row">
        <button class="ghost-button" type="button" data-action="cancel">キャンセル</button>
        <button class="primary-button" type="button" data-action="save">保存</button>
      </div>
    `;
    const input = modal.querySelector("#deckRenameInput");
    const save = () => {
      const renamed = store.renamePreset(id, input.value);
      if (!renamed) return;
      builderView.render({ preserveLibraryScroll: true });
      renderDeckSelectView();
      closeAppModal();
      toast(`${renamed.name}に変更しました。`);
    };
    modal.querySelector('[data-action="cancel"]').addEventListener("click", closeAppModal);
    modal.querySelector('[data-action="save"]').addEventListener("click", save);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      save();
    });
    openAppModal(modal);
    window.setTimeout(() => input.focus(), 0);
  }

  function openDeckFavoriteDialog(id) {
    const deck = store.activeAccountData.decks[id];
    if (!deck) return;
    let ids = [...new Set(deckIds(deck))].filter((cardId) => cards[cardId]);
    if (ids.length === 0 && id === store.activeDeckId) {
      ids = [...new Set([...store.list, ...store.driveList])].filter((cardId) => cards[cardId]);
    }
    let selectedId = deck.favoriteCardId || ids[0] || "";
    const modal = document.createElement("div");
    modal.className = "modal-dialog deck-favorite-dialog";
    modal.innerHTML = `
      <h2>お気に入りカード選択</h2>
      <p class="small-note">このデッキに入っているカードから1枚選びます。</p>
      <div class="favorite-card-grid">
        ${ids.map((cardId) => favoriteCardButtonHtml(cardId, cardId === selectedId)).join("") || '<div class="small-note">選択できるカードがありません。</div>'}
      </div>
      <div class="modal-actions modal-actions-row">
        <button class="ghost-button" type="button" data-action="cancel">キャンセル</button>
        <button class="primary-button" type="button" data-action="save">設定</button>
      </div>
    `;
    const grid = modal.querySelector(".favorite-card-grid");
    grid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-favorite-card-id]");
      if (!button) return;
      selectedId = button.dataset.favoriteCardId;
      grid.querySelectorAll(".favorite-card-option").forEach((option) => {
        option.classList.toggle("selected", option === button);
      });
    });
    modal.querySelector('[data-action="cancel"]').addEventListener("click", closeAppModal);
    modal.querySelector('[data-action="save"]').addEventListener("click", () => {
      if (!selectedId || !store.setDeckFavoriteCard(id, selectedId)) return;
      builderView.render({ preserveLibraryScroll: true });
      renderDeckSelectView();
      closeAppModal();
      toast(`${cards[selectedId].name}をデッキアイコンにしました。`);
    });
    openAppModal(modal);
  }

  function favoriteCardButtonHtml(id, selected) {
    const card = cards[id];
    const image = cardPreviewArt(card);
    return `
      <button class="favorite-card-option${selected ? " selected" : ""}" type="button" data-favorite-card-id="${escapeHtml(id)}">
        <span class="favorite-card-art"><img src="${escapeHtml(image)}" alt=""></span>
        <span class="favorite-card-name">${escapeHtml(card.name)}</span>
      </button>
    `;
  }

  function createDeckPresetForEdit() {
    if (!builderView.validateDeckBeforeSave()) {
      setView("builder");
      return;
    }
    const deck = store.saveAs(store.nextDeckName());
    builderView.selectedCardId = builderView.firstSelectedId();
    builderView.render();
    setView("builder");
    toast(`${deck.name}を作成しました。`);
  }

  function openDuelDeckSelector() {
    if (GRID_REPLACEMENT_MODE) {
      setView("chronoGridDeck");
      return;
    }
    const modal = document.createElement("div");
    modal.className = "modal-dialog duel-deck-dialog";
    modal.innerHTML = `
      <h2>使用デッキ選択</h2>
      <p class="small-note">対戦で使うプリセットデッキを1つ選んでください。</p>
      <div class="duel-deck-choice-grid">
        ${store.deckPresets.map((deck) => duelDeckChoiceHtml(deck)).join("")}
      </div>
      <div class="modal-actions modal-actions-row">
        <button class="ghost-button" type="button" data-action="cancel">キャンセル</button>
      </div>
    `;
    modal.querySelector(".duel-deck-choice-grid").addEventListener("click", (event) => {
      const button = event.target.closest("[data-duel-deck-id]");
      if (!button) return;
      if (!store.loadPreset(button.dataset.duelDeckId)) return;
      closeAppModal();
      builderView.selectedCardId = builderView.firstSelectedId();
      builderView.render({ preserveLibraryScroll: true });
      renderDuelMenuDeckCard();
      renderDeckSelectView();
      toast(`${store.activeDeck.name}を使用デッキに設定しました。`);
    });
    modal.querySelector('[data-action="cancel"]').addEventListener("click", closeAppModal);
    openAppModal(modal);
  }

  const requireDeck = () => {
    const deck = store.list;
    const driveDeck = store.driveList;
    const ownership = store.validateActiveDeckOwnership();
    if (!ownership.ok) {
      toast("カード不足です。デッキを直してください。");
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
    if (GRID_REPLACEMENT_MODE) {
      setView("chronoGridBattle");
      return;
    }
    const deckSet = requireDeck();
    if (!deckSet) return;
    clearCpuDuelRecovery();
    duelView.start(deckSet.deck, deckSet.driveDeck, {
      mainRoyalIds: store.royalBattleIds,
      driveRoyalIds: store.driveRoyalBattleIds,
      cpuLevel: els.cpuLevelSelect?.value || "random",
      cpuTheme: els.cpuThemeSelect?.value || "random",
      firstActive: els.cpuFirstSelect?.value || "random",
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

  const askRankedResume = () => new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal-dialog app-confirm-dialog";
    modal.innerHTML = `
      <h2>中断されたランク戦があります</h2>
      <p>復帰すると対戦を続けます。復帰しない場合は敗北になります。</p>
      <div class="modal-actions modal-actions-row">
        <button class="ghost-button danger" type="button" data-choice="abandon">復帰しない</button>
        <button class="primary-button" type="button" data-choice="resume">復帰する</button>
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

  let rankedResumePromptActive = false;
  const checkRankedResume = async () => {
    if (GRID_REPLACEMENT_MODE) return;
    if (!store.isAuthenticated || rankedResumePromptActive || duelView.game?.isRanked) return;
    rankedResumePromptActive = true;
    try {
      const client = await OnlineClient.resumeRanked(store.authHeaders());
      if (!client) return;
      const choice = client.finished ? "resume" : await askRankedResume();
      const finalClient = choice === "abandon"
        ? await OnlineClient.abandonRankedResume(store.authHeaders())
        : client;
      if (finalClient) startOnlineDuel(finalClient);
    } catch {
      // Resume is a convenience prompt; normal play should continue if it fails.
    } finally {
      rankedResumePromptActive = false;
    }
  };

  const createRoomDuel = async () => {
    if (GRID_REPLACEMENT_MODE) {
      openMaintenanceModal("room");
      return;
    }
    if (!canUseOnline()) return;
    const deckSet = requireDeck();
    if (!deckSet) return;
    try {
      const client = await OnlineClient.createRoom(deckSet.deck, deckSet.driveDeck, store.displayName);
      startOnlineDuel(client);
      toast(`ルーム ${client.roomId} を作成しました。`);
    } catch (error) {
      toast(error.message || "ルーム作成に失敗しました。");
    }
  };

  const joinRoomDuel = async () => {
    if (GRID_REPLACEMENT_MODE) {
      openMaintenanceModal("room");
      return;
    }
    if (!canUseOnline()) return;
    const deckSet = requireDeck();
    if (!deckSet) return;
    const roomId = await askRoomId();
    if (!roomId) return;
    try {
      const client = await OnlineClient.joinRoom(roomId, deckSet.deck, deckSet.driveDeck, store.displayName);
      startOnlineDuel(client);
      toast(`ルーム ${client.roomId} に参加しました。`);
    } catch (error) {
      toast(error.message || "ルーム参加に失敗しました。");
    }
  };

  function openPresentBox() {
    const presents = store.presents;
    const modal = document.createElement("div");
    modal.className = "modal-dialog present-dialog";
    modal.innerHTML = `
      <h2>プレゼント</h2>
      <div class="present-list">
        ${presents.length
          ? presents.map((present) => presentRowHtml(present)).join("")
          : '<p class="small-note present-empty">未受け取りのプレゼントはありません。</p>'}
      </div>
      <div class="modal-actions modal-actions-row">
        <button class="ghost-button" type="button" data-action="close">閉じる</button>
        <button class="primary-button" type="button" data-action="claim"${presents.length ? "" : " disabled"}>まとめて受け取り</button>
      </div>
    `;
    modal.querySelector('[data-action="close"]').addEventListener("click", closeAppModal);
    modal.querySelector('[data-action="claim"]').addEventListener("click", () => {
      const result = store.claimAllPresents();
      if (!result.ok) return;
      closeAppModal();
      builderView.render({ preserveLibraryScroll: true });
      packView.render();
      renderShellResources();
      toast(result.gems > 0 ? `プレゼントを受け取りました。ガチャ石 +${result.gems}` : "プレゼントを受け取りました。");
    });
    openAppModal(modal);
  }

  function presentRowHtml(present) {
    return `
      <article class="present-row">
        <div>
          <strong>${escapeHtml(present.title)}</strong>
          <p>${escapeHtml(present.message || "プレゼントが届いています。")}</p>
        </div>
        <span class="present-reward"><img class="item-icon" src="assets/ui/gacha-stone.png" alt=""> ${escapeHtml(presentRewardText(present))}</span>
      </article>
    `;
  }

  function presentRewardText(present) {
    if (present.type === "gems") return `${present.amount}`;
    return `${present.amount}`;
  }

  function openNoticeBox() {
    const entries = Array.isArray(noticeEntries) ? noticeEntries.filter(Boolean) : [];
    const modal = document.createElement("div");
    modal.className = "modal-dialog notice-dialog";
    modal.innerHTML = `
      <div class="notice-dialog-head">
        <div>
          <p class="eyebrow">Notice</p>
          <h2>お知らせ</h2>
        </div>
      </div>
      <div class="notice-list">
        ${entries.length
          ? entries.map((entry, index) => noticeEntryHtml(entry, index)).join("")
          : '<p class="small-note notice-empty">現在のお知らせはありません。</p>'}
      </div>
      <div class="modal-actions modal-actions-row">
        <button class="ghost-button" type="button" data-action="close">閉じる</button>
      </div>
    `;
    renderNoticeCardGrids(modal, entries);
    modal.querySelector(".notice-list")?.addEventListener("click", (event) => {
      if (CardZoom?.openFromEvent?.(event)) return;
      const packButton = event.target.closest("[data-notice-pack-theme]");
      if (!packButton) return;
      closeAppModal();
      if (!packView.selectPackByTheme(packButton.dataset.noticePackTheme)) {
        toast("対象のパックが見つかりません。");
      }
    });
    modal.querySelector('[data-action="close"]').addEventListener("click", closeAppModal);
    openAppModal(modal);
  }

  function noticeEntryHtml(entry, index) {
    const story = entry.story?.paragraphs?.length
      ? `
        <section class="notice-story">
          <strong>${escapeHtml(entry.story.title || "ストーリー")}</strong>
          ${entry.story.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
        </section>
      `
      : "";
    const pack = entry.pack
      ? `
        <section class="notice-pack-note">
          <div>
            <strong>${escapeHtml(entry.pack.title || "パック更新")}</strong>
            <p>${escapeHtml(entry.pack.text || "")}</p>
          </div>
          ${entry.pack.theme ? `<button class="primary-button" type="button" data-notice-pack-theme="${escapeHtml(entry.pack.theme)}">${escapeHtml(entry.pack.buttonLabel || "パックを見る")}</button>` : ""}
        </section>
      `
      : "";
    const cardCount = Array.isArray(entry.cardIds) ? entry.cardIds.filter((id) => cards[id]).length : 0;
    const cardsHtml = cardCount > 0
      ? `
        <section class="notice-card-section">
          <div class="notice-card-section-head">
            <strong>追加カード</strong>
            <small>${cardCount} cards</small>
          </div>
          <div class="notice-card-grid" data-notice-cards="${index}"></div>
        </section>
      `
      : "";
    return `
      <article class="notice-entry">
        <div class="notice-entry-head">
          <div>
            <div class="notice-meta">
              <span>${escapeHtml(entry.date || "")}</span>
              <span>${escapeHtml(entry.badge || "更新")}</span>
            </div>
            <h3>${escapeHtml(entry.title || "お知らせ")}</h3>
            <p>${escapeHtml(entry.summary || "")}</p>
          </div>
        </div>
        ${story}
        ${pack}
        ${cardsHtml}
      </article>
    `;
  }

  function renderNoticeCardGrids(modal, entries) {
    modal.querySelectorAll("[data-notice-cards]").forEach((grid) => {
      const entry = entries[Number(grid.dataset.noticeCards)];
      const cardIds = Array.isArray(entry?.cardIds) ? entry.cardIds.filter((id) => cards[id]) : [];
      cardIds.forEach((id) => {
        const card = CardRenderer.tcgCard(id, { interactive: true });
        card.classList.add("notice-card");
        card.setAttribute("aria-label", `${cards[id].name}を拡大表示`);
        grid.append(card);
      });
    });
  }

  const openRankedLeaderboard = async () => {
    if (GRID_REPLACEMENT_MODE) {
      openMaintenanceModal("ranked");
      return;
    }
    if (!canUseOnline()) return;
    try {
      const result = await OnlineClient.rankedLeaderboard();
      const entries = Array.isArray(result.entries) ? result.entries : [];
      const modal = document.createElement("div");
      modal.className = "modal-dialog ranked-leaderboard-dialog";
      modal.innerHTML = `
        <h2>ランク順位表</h2>
        <section class="ranked-threshold-panel" aria-label="ランク昇格ライン">
          <h3>ランク昇格ライン</h3>
          ${rankThresholdTable()}
        </section>
        <div class="ranked-leaderboard-list">
          ${entries.length ? entries.map((entry) => rankedLeaderboardRow(entry)).join("") : '<p class="small-note">まだランク記録がありません。</p>'}
        </div>
        <div class="modal-actions modal-actions-row">
          <button class="ghost-button" type="button" data-action="close">閉じる</button>
        </div>
      `;
      modal.querySelector('[data-action="close"]').addEventListener("click", closeAppModal);
      openAppModal(modal);
    } catch (error) {
      toast(error.message || "順位表を取得できませんでした。");
    }
  };

  function rankThresholdTable() {
    return `
      <table class="ranked-threshold-table">
        <thead>
          <tr><th>ランク</th><th>必要RP</th></tr>
        </thead>
        <tbody>
          ${RANK_TIERS.map((rank) => `<tr><td>${escapeHtml(rank.label)}</td><td>${rank.min}</td></tr>`).join("")}
        </tbody>
      </table>
    `;
  }

  function rankedLeaderboardRow(entry) {
    const current = store.isAuthenticated && entry.username === store.username;
    return `
      <article class="ranked-leaderboard-row${current ? " current" : ""}">
        <strong>${entry.place}</strong>
        <span>${escapeHtml(entry.displayName || entry.username)}</span>
        <em>${escapeHtml(entry.rank)} ${entry.points} RP</em>
        <small>${entry.wins}勝 ${entry.losses}敗</small>
      </article>
    `;
  }

  const startRankedDuel = async () => {
    if (GRID_REPLACEMENT_MODE) {
      openMaintenanceModal("ranked");
      return;
    }
    if (!canUseOnline()) return;
    if (!store.isAuthenticated) {
      toast("ランク戦はログインが必要です。");
      builderView.openAuthDialog({
        onSuccess: () => {
          renderRankedStatus();
          startRankedDuel();
        },
      });
      return;
    }
    const deckSet = requireDeck();
    if (!deckSet) return;
    try {
      const client = await OnlineClient.enterRanked(deckSet.deck, deckSet.driveDeck, store.displayName, store.authHeaders());
      startOnlineDuel(client);
      toast(client.matched ? "ランク戦の相手が見つかりました。" : "ランク戦の相手を検索中です。");
    } catch (error) {
      toast(error.message || "ランク戦の開始に失敗しました。");
    }
  };

  els.createRoomButton?.addEventListener("click", createRoomDuel);
  els.joinRoomButton?.addEventListener("click", joinRoomDuel);
  els.newDuelButton?.addEventListener("click", () => startCpuDuel());
  els.duelSelectedDeckButton?.addEventListener("click", openDuelDeckSelector);
  els.modeRankedDuelButton?.addEventListener("click", () => startRankedDuel());
  els.rankedLeaderboardButton?.addEventListener("click", openRankedLeaderboard);
  els.modeCreateRoomButton?.addEventListener("click", createRoomDuel);
  els.modeJoinRoomButton?.addEventListener("click", joinRoomDuel);
  els.modeCpuDuelButton?.addEventListener("click", () => startCpuDuel());
  els.titleView?.addEventListener("click", handleTitleStart);
  els.titleView?.addEventListener("keydown", handleTitleKeydown);

  els.homeTab?.addEventListener("click", () => navigateView("home"));
  els.builderTab?.addEventListener("click", () => navigateView("deckSelect"));
  els.packTab?.addEventListener("click", () => navigateView("pack"));
  els.duelTab?.addEventListener("click", () => navigateView("duelMenu"));
  els.deckSelectHomeButton?.addEventListener("click", () => navigateView("home"));
  els.deckPresetGrid?.addEventListener("click", (event) => {
    const createButton = event.target.closest("[data-create-deck]");
    if (createButton) {
      createDeckPresetForEdit();
      return;
    }
    const deckButton = event.target.closest("[data-deck-id]");
    if (deckButton) openDeckPresetActions(deckButton.dataset.deckId);
  });
  document.querySelectorAll("[data-nav-view]").forEach((button) => {
    button.addEventListener("click", () => navigateView(button.dataset.navView));
  });
  const shellActionLabels = {
    gachaStone: "ガチャ石",
    dismantleStone: "分解石",
    mail: "メール",
    notice: "お知らせ",
    gift: "プレゼント",
    settings: "設定",
    shop: "ショップ",
    profile: "プロフィール",
  };
  document.querySelectorAll("[data-shell-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (GRID_REPLACEMENT_MODE) {
        const action = button.dataset.shellAction;
        if (action === "settings") {
          openSettingsModal();
          return;
        }
        const maintenanceMap = {
          gachaStone: "pack",
          dismantleStone: "pack",
          mail: "system",
          notice: "notice",
          gift: "gift",
          shop: "shop",
          profile: "profile",
        };
        openMaintenanceModal(maintenanceMap[action] || "system");
        return;
      }
      if (button.dataset.shellAction === "gift") {
        openPresentBox();
        return;
      }
      if (button.dataset.shellAction === "notice") {
        openNoticeBox();
        return;
      }
      if (button.dataset.shellAction === "settings") {
        openSettingsModal();
        return;
      }
      const label = shellActionLabels[button.dataset.shellAction] || "この機能";
      toast(`${label}はまだ準備中です。`);
    });
  });

  setView("home");
  store.syncActiveAccount().finally(async () => {
    if (GRID_REPLACEMENT_MODE) {
      renderRankedStatus();
      renderShellResources();
      return;
    }
    builderView.render();
    packView.render();
    renderRankedStatus();
    renderShellResources();
    if (!(await promptRecoveredCpuDuel())) {
      showLoginBonusIfReady();
      checkRankedResume();
    }
  });

  let accountSyncTimer = 0;
  const syncAccountFromServer = () => {
    if (GRID_REPLACEMENT_MODE) return;
    window.clearTimeout(accountSyncTimer);
    accountSyncTimer = window.setTimeout(() => {
      store.syncActiveAccount().finally(() => {
        if (!els.duelView.hidden) {
          renderRankedStatus();
          renderShellResources();
          return;
        }
        builderView.render({ preserveLibraryScroll: true });
        packView.render();
        renderRankedStatus();
        renderShellResources();
        showLoginBonusIfReady();
        checkRankedResume();
      });
    }, 120);
  };
  window.addEventListener("focus", syncAccountFromServer);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncAccountFromServer();
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data || {};
    if (data.type !== "chrono-grid:navigate") return;
    const allowedViews = new Set(["home", "duelMenu", "chronoGridBattle", "chronoGridDeck"]);
    if (!allowedViews.has(data.view)) return;
    setView(data.view);
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
