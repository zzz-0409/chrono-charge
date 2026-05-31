"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_GAMES_PER_ORDERED_PAIR = 20;
const MAX_COMPLETED_TURNS = 80;
const HARNESS_AI_LEVEL = 5;

function loadChrono() {
  global.window = {
    Chrono: {},
    setTimeout: (fn, ms = 0, ...args) => {
      if (Number(ms) <= 0) {
        queueMicrotask(() => fn(...args));
        return 0;
      }
      return setTimeout(fn, ms, ...args);
    },
    clearTimeout,
  };
  const files = [
    "src/data/cards.js",
    "src/core/effect-resolver.js",
    "src/core/cpu-controller.js",
    "src/core/duel-game.js",
  ];
  files.forEach((file) => {
    const fullPath = path.join(ROOT, file);
    vm.runInThisContext(fs.readFileSync(fullPath, "utf8"), { filename: fullPath });
  });
  return global.window.Chrono;
}

const Chrono = loadChrono();
const { cards, cpuDecks, CpuController, DuelGame } = Chrono;

function main() {
  const gamesPerPair = Math.max(1, Number(process.argv[2]) || DEFAULT_GAMES_PER_ORDERED_PAIR);
  runStandardRoundRobin(gamesPerPair).then((result) => {
    printResult(result);
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function runStandardRoundRobin(gamesPerPair) {
  const decks = cpuDecks.map((entry, index) => normalizeDeckEntry(entry, index));
  const matrix = new Map();
  const themeStats = new Map(decks.map((deck) => [deck.theme, emptyThemeStats(deck.theme)]));
  const weaknessStats = new Map(decks.map((deck) => [deck.theme, emptyWeaknessStats()]));
  let games = 0;
  let draws = 0;
  const errors = [];

  for (let a = 0; a < decks.length; a += 1) {
    for (let b = 0; b < decks.length; b += 1) {
      if (a === b) continue;
      for (let i = 0; i < gamesPerPair; i += 1) {
        const seed = 1000003 + a * 100003 + b * 1009 + i;
        const gameResult = await runGame(decks[a], decks[b], seed).catch((error) => {
          errors.push(`${decks[a].theme} vs ${decks[b].theme}: ${error.message}`);
          return null;
        });
        if (!gameResult) continue;
        games += 1;
        if (gameResult.draw) draws += 1;
        updateThemeStats(themeStats.get(decks[a].theme), gameResult.player, gameResult);
        updateThemeStats(themeStats.get(decks[b].theme), gameResult.enemy, gameResult);
        updateMatrix(matrix, decks[a].theme, decks[b].theme, gameResult);
        if (gameResult.loserTheme) {
          const weakness = classifyWeakness(gameResult, gameResult.loserSide);
          weaknessStats.get(gameResult.loserTheme)[weakness] += 1;
        }
      }
    }
  }

  return {
    games,
    draws,
    gamesPerPair,
    errors,
    themes: [...themeStats.values()].map(finalizeThemeStats).sort((a, b) => b.winRate - a.winRate),
    matrix: [...matrix.values()].sort((a, b) => a.a.localeCompare(b.a, "ja") || a.b.localeCompare(b.b, "ja")),
    weaknesses: [...weaknessStats.entries()].map(([theme, stats]) => ({ theme, ...stats })),
  };
}

async function runGame(playerDeck, enemyDeck, seed) {
  withSeed(seed);
  const playerVariant = makeHarnessVariant(playerDeck);
  const enemyVariant = makeHarnessVariant(enemyDeck);
  let finalGame = null;
  const turnStats = {
    player: [],
    enemy: [],
  };
  const actionStats = {
    player: emptyActionStats(),
    enemy: emptyActionStats(),
  };
  const game = new DuelGame({
    playerDeck: expandDeck(playerVariant.deck),
    playerDriveDeck: expandDeck(playerVariant.driveDeck),
    cpuName: enemyVariant.theme,
    cpuDeck: expandDeck(enemyVariant.deck),
    cpuDriveDeck: expandDeck(enemyVariant.driveDeck),
    firstActive: "player",
    delayMs: 0,
    cpuThinkDelayMs: 0,
    cpuActionDelayMs: 0,
    cpuCardPlayDelayMs: 0,
    cpuSetReactionDelayMs: 0,
    cpuAttackDelayMs: 0,
    cpuMinTurnMs: 0,
    cpuOpeningMinTurnMs: 0,
    cpuTurnEndDelayMs: 0,
    cpuCardCommitDelayMs: 0,
    cpuCardEntryDelayMs: 0,
    cpuActivationWindupMs: 0,
    cpuChoiceDelayMs: 0,
    cpuReactionDecisionDelayMs: 0,
    onResult: (_, finishedGame) => { finalGame = finishedGame; },
    requestReaction: async (options, event, currentGame) => chooseHarnessReaction(currentGame, currentGame.player, options, event),
    requestCardChoice: async (choice, currentGame) => chooseHarnessCardChoice(currentGame, currentGame.player, choice),
    showActivation: async () => {},
    onChange: () => {},
    onSoundEvent: () => {},
  });
  const playerPilot = new CpuController(game);
  game.start();

  while (!game.finished && game.completedTurns < MAX_COMPLETED_TURNS) {
    if (game.active === "player") {
      await playManualCpuTurn(game, playerPilot, "player", actionStats.player);
      recordTurnStats(turnStats.player, game.player, game.enemy);
      if (!game.finished) advanceManualTurn(game, "player");
    } else {
      await playManualCpuTurn(game, playerPilot, "enemy", actionStats.enemy);
      recordTurnStats(turnStats.enemy, game.enemy, game.player);
      if (!game.finished) advanceManualTurn(game, "enemy");
    }
  }

  if (!game.finished) {
    game.finished = true;
    game.busy = false;
  }

  const winnerSide = game.player.lp === game.enemy.lp ? null : game.player.lp > game.enemy.lp ? "player" : "enemy";
  const loserSide = winnerSide === "player" ? "enemy" : winnerSide === "enemy" ? "player" : null;
  const result = {
    seed,
    draw: !winnerSide,
    winnerSide,
    loserSide,
    winnerTheme: winnerSide === "player" ? playerDeck.theme : winnerSide === "enemy" ? enemyDeck.theme : "",
    loserTheme: loserSide === "player" ? playerDeck.theme : loserSide === "enemy" ? enemyDeck.theme : "",
    completedTurns: game.completedTurns,
    player: summarizeSide(game.player, turnStats.player, actionStats.player),
    enemy: summarizeSide(game.enemy, turnStats.enemy, actionStats.enemy),
    logTail: (finalGame || game).logItems.slice(-8),
  };
  result.player.theme = playerDeck.theme;
  result.enemy.theme = enemyDeck.theme;
  return result;
}

function makeHarnessVariant(deck) {
  if (typeof Chrono.createCpuDeckVariant !== "function") return deck;
  const variant = Chrono.createCpuDeckVariant({
    name: `CPU: ${deck.theme}`,
    deck: deck.deck,
    driveDeck: deck.driveDeck,
  }, {
    theme: deck.theme,
    aiLevel: HARNESS_AI_LEVEL,
    allowSplash: true,
  });
  return {
    ...deck,
    deck: variant.deck,
    driveDeck: variant.driveDeck,
  };
}

async function playManualCpuTurn(game, pilot, side, actions) {
  const player = side === "enemy" ? game.enemy : game.player;
  const opponent = side === "enemy" ? game.player : game.enemy;
  if (game.finished || game.active !== side) return;
  const wasBusy = game.busy;
  if (side === "enemy") game.busy = true;

  try {
    if (pilot.shouldCharge(player)) {
      const index = pilot.chooseChargeIndex(player);
      if (index >= 0 && await chargeCardAutomatically(game, player, index, side)) actions.charge += 1;
    }

    while (pilot.setNextReaction(player)) actions.setReaction += 1;

    for (let i = 0; i < 7; i += 1) {
      const move = pilot.choosePlay(player, opponent);
      if (!move) break;
      if (!await playCardFromHandAutomatically(game, player, opponent, move.index, side)) break;
      actions.play += 1;
      if (game.finished) return;
    }

    for (let i = 0; i < 3; i += 1) {
      const driveId = pilot.chooseDriveCard(player, opponent);
      if (!driveId) break;
      if (!await playDriveCardAutomatically(game, player, opponent, driveId, side)) break;
      actions.drive += 1;
      if (game.finished) return;
    }

    for (let i = 0; i < player.cores.length; i += 1) {
      if (await activateDriveCoreAutomatically(game, player, opponent, i)) actions.driveCore += 1;
      if (game.finished) return;
    }

    for (let i = player.grave.length - 1; i >= 0; i -= 1) {
      if (await activateSpellDriveGraveAutomatically(game, player, opponent, i)) actions.spellDriveGrave += 1;
      if (game.finished) return;
    }

    for (let i = 0; i < player.units.length; i += 1) {
      if (!game.canAttack(player)) break;
      const unit = player.units[i];
      if (!unit || unit.exhausted) continue;
      const target = pilot.chooseAttackTarget(unit, opponent, player);
      if (target === undefined) continue;
      if (await attackAutomatically(game, player, opponent, i, target)) actions.attack += 1;
      if (game.finished) return;
    }
  } finally {
    game.busy = wasBusy;
  }
}

function advanceManualTurn(game, side) {
  game.completeTurn();
  if (side === "player") {
    game.active = "enemy";
    game.enemy.refreshTurn();
    game.drawCards(game.enemy, 1);
  } else {
    game.active = "player";
    game.turn += 1;
    game.player.refreshTurn();
    game.drawCards(game.player, 1);
  }
  game.checkGameEnd();
}

async function chargeCardAutomatically(game, player, index, side) {
  if (player.chargedThisTurn || !player.hand[index]) return false;
  const id = player.hand.splice(index, 1)[0];
  player.charge.push({ id, tapped: false });
  player.chargedThisTurn = true;
  game.log(`${side === "enemy" ? "相手は" : ""}${cards[id].name}をチャージ。`);
  await game.triggerChargeCore(player);
  game.checkGameEnd();
  game.notify();
  return true;
}

async function playCardFromHandAutomatically(game, player, opponent, index, side) {
  const id = player.hand[index];
  const card = cards[id];
  if (!card || !game.canPlayCard(player, card) || !game.payCost(player, card.cost)) return false;
  player.hand.splice(index, 1);
  await game.resolvePlayedCard(player, opponent, card, side);
  game.checkGameEnd();
  game.notify();
  return true;
}

async function playDriveCardAutomatically(game, player, opponent, id, side) {
  const card = cards[id];
  if (!card || card.driveKind === "reaction" || !game.canUseDriveCard(player, card)) return false;
  if (!game.payDriveCombinedCostAutomatically(player, card)) return false;
  const index = player.driveDeck.indexOf(card.id);
  if (index === -1) return false;
  player.driveDeck.splice(index, 1);
  await game.resolveDriveCardEffect(player, opponent, card, side);
  game.checkGameEnd();
  game.notify();
  return true;
}

async function activateDriveCoreAutomatically(game, player, opponent, coreIndex) {
  if (!game.canActivateDriveCore(player, coreIndex)) return false;
  const card = cards[player.cores[coreIndex]];
  const cost = game.driveCoreActivationCost(card);
  if (cost > 0 && !game.payCost(player, cost)) return false;
  player.driveCoreActivations[game.driveCoreActivationKey(coreIndex, card)] = true;
  const negated = await game.resolveReactionWindow({ trigger: "effect", source: card }, opponent, player);
  if (!negated) await game.applyDriveCoreAbility(card, player, opponent);
  game.checkGameEnd();
  game.notify();
  return true;
}

async function activateSpellDriveGraveAutomatically(game, player, opponent, graveIndex) {
  if (!game.canActivateSpellDriveGraveEffect(player, graveIndex)) return false;
  const card = cards[player.grave[graveIndex]];
  const [removed] = player.grave.splice(graveIndex, 1);
  if (!Array.isArray(player.abyss)) player.abyss = [];
  player.abyss.push(removed);
  const negated = await game.resolveReactionWindow({ trigger: "effect", source: card }, opponent, player);
  if (!negated) await game.applySpellDriveGraveEffect(card, player, opponent);
  game.checkGameEnd();
  game.notify();
  return true;
}

async function attackAutomatically(game, player, opponent, attackerIndex, targetIndex) {
  const unit = player.units[attackerIndex];
  if (!unit || unit.exhausted || !game.canAttack(player)) return false;
  const negated = await game.resolveReactionWindow({ trigger: "attack", source: cards[unit.id], sourceIndex: attackerIndex }, opponent, player);
  if (negated) {
    unit.exhausted = true;
    game.notify();
    return true;
  }
  game.resolveAttack(player, opponent, attackerIndex, targetIndex);
  game.checkGameEnd();
  game.notify();
  return true;
}

function chooseHarnessReaction(game, player, options, event) {
  const normalOptions = options.filter((option) => !option.drive);
  return game.cpu.chooseReactionOption(player, normalOptions, event);
}

function chooseHarnessCardChoice(game, player, choice) {
  if (choice.zone === "effectActivation") return choice.allowPass ? 0 : choice.candidates?.[0]?.index ?? null;
  const candidates = choice.candidates || [];
  if (!candidates.length) return choice.allowPass ? "pass" : null;
  const index = game.cpu.chooseCardIndex(player, choice.zone, candidates);
  return index === -1 ? (choice.allowPass ? "pass" : candidates[0].index) : index;
}

function recordTurnStats(list, player, opponent) {
  list.push({
    lp: player.lp,
    hand: player.hand.length,
    deck: player.deck.length,
    units: player.units.filter(Boolean).length,
    cores: player.cores.filter(Boolean).length,
    reactions: player.reactions.filter(Boolean).length,
    charge: player.charge.length,
    untappedCharge: player.charge.filter((entry) => !entry.tapped).length,
    playable: player.hand.filter((id) => cards[id] && opponent && true).length,
    opponentUnits: opponent.units.filter(Boolean).length,
    opponentLp: opponent.lp,
  });
}

function summarizeSide(player, turns, actions) {
  const last = turns[turns.length - 1] || {};
  return {
    lp: player.lp,
    turns: turns.length,
    avgHand: avg(turns.map((entry) => entry.hand)),
    avgUnits: avg(turns.map((entry) => entry.units)),
    avgCharge: avg(turns.map((entry) => entry.charge)),
    lowHandTurns: turns.filter((entry) => entry.hand <= 1).length,
    emptyBoardTurns: turns.filter((entry) => entry.units === 0 && entry.cores === 0).length,
    opponentWideTurns: turns.filter((entry) => entry.opponentUnits >= 3).length,
    finalHand: player.hand.length,
    finalUnits: player.units.filter(Boolean).length,
    finalCores: player.cores.filter(Boolean).length,
    finalCharge: player.charge.length,
    finalOpponentUnits: last.opponentUnits || 0,
    actions,
  };
}

function classifyWeakness(result, loserSide) {
  const loser = result[loserSide];
  const winner = result[loserSide === "player" ? "enemy" : "player"];
  if (!loser) return "unknown";
  if (result.completedTurns <= 6 && loser.avgUnits < 1.2) return "early_stall";
  if (loser.lowHandTurns >= Math.max(2, loser.turns * 0.45)) return "resource_exhaustion";
  if (loser.emptyBoardTurns >= Math.max(2, loser.turns * 0.35) && winner.avgUnits >= 2) return "board_collapse";
  if (winner.finalUnits >= 3 && loser.finalUnits <= 1) return "removal_shortage";
  if (winner.lp <= 2500 && result.completedTurns >= 12) return "finisher_shortage";
  if (loser.avgCharge < 2.4 && loser.actions.play <= loser.turns) return "charge_shortage";
  return "fair_loss";
}

function normalizeDeckEntry(entry, index) {
  return {
    id: `deck_${index}`,
    theme: dominantTheme(entry.deck) || entry.name.replace(/^CPU:\s*/, "") || `Theme ${index + 1}`,
    deck: entry.deck,
    driveDeck: entry.driveDeck,
  };
}

function dominantTheme(deck) {
  const counts = new Map();
  Object.entries(deck || {}).forEach(([id, count]) => {
    const theme = cards[id]?.theme || "";
    if (!theme) return;
    counts.set(theme, (counts.get(theme) || 0) + Number(count || 0));
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function expandDeck(counts) {
  return Object.entries(counts || {}).flatMap(([id, count]) => Array(Math.max(0, Number(count) || 0)).fill(id));
}

function emptyThemeStats(theme) {
  return {
    theme,
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    totalTurns: 0,
    totalLp: 0,
  };
}

function emptyWeaknessStats() {
  return {
    early_stall: 0,
    resource_exhaustion: 0,
    board_collapse: 0,
    removal_shortage: 0,
    finisher_shortage: 0,
    charge_shortage: 0,
    fair_loss: 0,
    unknown: 0,
  };
}

function emptyActionStats() {
  return {
    charge: 0,
    setReaction: 0,
    play: 0,
    drive: 0,
    driveCore: 0,
    spellDriveGrave: 0,
    attack: 0,
  };
}

function updateThemeStats(stats, side, result) {
  stats.games += 1;
  stats.totalTurns += result.completedTurns;
  stats.totalLp += side.lp;
  if (result.draw) stats.draws += 1;
  else if (result.winnerTheme === side.theme) stats.wins += 1;
  else stats.losses += 1;
}

function finalizeThemeStats(stats) {
  return {
    ...stats,
    winRate: stats.games ? stats.wins / stats.games : 0,
    avgTurns: stats.games ? stats.totalTurns / stats.games : 0,
    avgEndLp: stats.games ? stats.totalLp / stats.games : 0,
  };
}

function updateMatrix(matrix, a, b, result) {
  const key = `${a}=>${b}`;
  if (!matrix.has(key)) matrix.set(key, { a, b, games: 0, wins: 0, draws: 0 });
  const entry = matrix.get(key);
  entry.games += 1;
  if (result.draw) entry.draws += 1;
  else if (result.winnerTheme === a) entry.wins += 1;
  entry.winRate = entry.games ? entry.wins / entry.games : 0;
}

function avg(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function withSeed(seed) {
  let state = seed >>> 0;
  Math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function printResult(result) {
  console.log(`# CPU balance harness`);
  console.log(`games=${result.games} gamesPerOrderedPair=${result.gamesPerPair} draws=${result.draws} errors=${result.errors.length}`);
  console.log("");
  console.log("## Theme standings");
  result.themes.forEach((theme) => {
    console.log(`${theme.theme}: ${theme.wins}-${theme.losses}-${theme.draws} winRate=${pct(theme.winRate)} avgTurns=${theme.avgTurns.toFixed(1)} avgEndLp=${theme.avgEndLp.toFixed(0)}`);
  });
  console.log("");
  console.log("## Loss weakness profile");
  result.weaknesses.forEach((entry) => {
    const labels = Object.entries(entry)
      .filter(([key]) => key !== "theme")
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => `${key}:${value}`)
      .join(" ");
    console.log(`${entry.theme}: ${labels || "no losses"}`);
  });
  console.log("");
  console.log("## Ordered matchup win rates");
  result.matrix.forEach((entry) => {
    console.log(`${entry.a} > ${entry.b}: ${entry.wins}/${entry.games} (${pct(entry.winRate)}) draws=${entry.draws}`);
  });
  if (result.errors.length) {
    console.log("");
    console.log("## Errors");
    result.errors.slice(0, 20).forEach((error) => console.log(error));
  }
}

if (require.main === module) main();
