"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_GAMES_PER_ORDERED_PAIR = 8;
const MAX_COMPLETED_TURNS = 60;
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
  [
    "src/data/cards.js",
    "src/core/effect-resolver.js",
    "src/core/cpu-controller.js",
    "src/core/duel-game.js",
  ].forEach((file) => {
    const fullPath = path.join(ROOT, file);
    vm.runInThisContext(fs.readFileSync(fullPath, "utf8"), { filename: fullPath });
  });
  return global.window.Chrono;
}

const Chrono = loadChrono();
const { cpuDecks, CpuController, DuelGame } = Chrono;

async function main() {
  const gamesPerPair = Math.max(1, Number(process.argv[2]) || DEFAULT_GAMES_PER_ORDERED_PAIR);
  const decks = cpuDecks.map((entry, index) => normalizeDeckEntry(entry, index));
  const stats = new Map(decks.map((deck) => [deck.theme, { theme: deck.theme, games: 0, wins: 0, losses: 0, draws: 0, turns: 0 }]));
  const errors = [];
  let games = 0;

  for (let a = 0; a < decks.length; a += 1) {
    for (let b = 0; b < decks.length; b += 1) {
      if (a === b) continue;
      for (let i = 0; i < gamesPerPair; i += 1) {
        withSeed(100003 + a * 1009 + b * 101 + i);
        const result = await runGame(decks[a], decks[b]).catch((error) => {
          errors.push(`${decks[a].theme} vs ${decks[b].theme}: ${error.stack || error.message}`);
          return null;
        });
        if (!result) continue;
        games += 1;
        applyResult(stats.get(decks[a].theme), result, "player");
        applyResult(stats.get(decks[b].theme), result, "enemy");
      }
    }
  }

  console.log("# CPU smoke");
  console.log(`games=${games} gamesPerOrderedPair=${gamesPerPair} errors=${errors.length}`);
  [...stats.values()]
    .sort((a, b) => (b.wins / Math.max(1, b.games)) - (a.wins / Math.max(1, a.games)))
    .forEach((entry) => {
      const rate = entry.games ? (entry.wins / entry.games) * 100 : 0;
      const avgTurns = entry.games ? entry.turns / entry.games : 0;
      console.log(`${entry.theme}: ${entry.wins}-${entry.losses}-${entry.draws} winRate=${rate.toFixed(1)}% avgTurns=${avgTurns.toFixed(1)}`);
    });
  if (errors.length) {
    console.log("## Errors");
    errors.slice(0, 10).forEach((error) => console.log(error));
    process.exitCode = 1;
  }
}

async function runGame(playerDeck, enemyDeck) {
  const game = new DuelGame({
    playerDeck: expandDeck(playerDeck.deck),
    playerDriveDeck: expandDeck(playerDeck.driveDeck),
    cpuName: enemyDeck.theme,
    cpuDeck: expandDeck(enemyDeck.deck),
    cpuDriveDeck: expandDeck(enemyDeck.driveDeck),
    cpuAiLevel: HARNESS_AI_LEVEL,
    firstActive: "player",
    delayMs: 0,
    cpuThinkDelayMs: 0,
    cpuActionDelayMs: 0,
    onChange: () => {},
    onResult: () => {},
    showActivation: () => {},
    onSoundEvent: () => {},
  });
  const pilot = new CpuController(game, { aiLevel: HARNESS_AI_LEVEL });
  game.start();

  while (!game.finished && game.completedTurns < MAX_COMPLETED_TURNS) {
    await playManualCpuTurn(game, pilot, game.active);
    if (!game.finished) advanceTurn(game);
  }

  if (!game.finished) {
    game.finished = true;
  }
  const winnerSide = game.player.lp === game.enemy.lp ? null : game.player.lp > game.enemy.lp ? "player" : "enemy";
  return {
    winnerSide,
    completedTurns: game.completedTurns,
    playerTheme: playerDeck.theme,
    enemyTheme: enemyDeck.theme,
  };
}

async function playManualCpuTurn(game, pilot, side) {
  const player = side === "enemy" ? game.enemy : game.player;
  const opponent = side === "enemy" ? game.player : game.enemy;

  for (let i = 0; i < 8 && !game.finished; i += 1) {
    const move = pilot.choosePlay(player, opponent);
    if (!move) break;
    if (await game.playFromHandFor(player, move.index) === false) break;
  }

  for (let i = 0; i < 3 && !game.finished; i += 1) {
    const index = pilot.chooseActivation(player);
    if (index < 0) break;
    if (await game.activateFieldCard(player, index) === false) break;
  }

  const driveId = pilot.chooseDriveCard(player, opponent);
  if (driveId) await game.playDriveCardFor(player, driveId);

  for (let pass = 0; pass < 2 && !game.finished; pass += 1) {
    for (let i = 0; i < player.units.length && !game.finished; i += 1) {
      const unit = player.units[i];
      if (!unit || Number(unit.remainingAttacks || 0) <= 0) continue;
      const target = pilot.chooseAttackTarget(unit, opponent, player);
      if (target === undefined) continue;
      const amount = pilot.chooseAttackAmount(unit, target, opponent);
      await game.attackWithUnitFor(player, i, target, amount);
    }
  }
}

function advanceTurn(game) {
  game.completeTurn();
  if (game.active === "player") {
    game.active = "enemy";
    game.beginTurn(game.enemy);
  } else {
    game.active = "player";
    game.turn += 1;
    game.beginTurn(game.player);
  }
}

function applyResult(stats, result, side) {
  stats.games += 1;
  stats.turns += result.completedTurns;
  if (!result.winnerSide) stats.draws += 1;
  else if (result.winnerSide === side) stats.wins += 1;
  else stats.losses += 1;
}

function normalizeDeckEntry(entry, index) {
  return {
    id: `deck_${index}`,
    theme: entry.name.replace(/^CPU:\s*/, "") || `Deck ${index + 1}`,
    deck: entry.deck,
    driveDeck: entry.driveDeck,
  };
}

function expandDeck(counts = {}) {
  return Object.entries(counts || {}).flatMap(([id, count]) => Array(Math.max(0, Number(count) || 0)).fill(id));
}

function withSeed(seed) {
  let state = seed >>> 0;
  Math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
