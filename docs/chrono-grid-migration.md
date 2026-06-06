# Chrono Grid migration

This project now contains the migrated Chrono Grid prototype from the other workspace under:

- `chrono-grid/index.html`
- `chrono-grid/game.js`
- `chrono-grid/style.css`
- `chrono-grid/assets/`

The main `card-game/index.html` shell now embeds Chrono Grid inside the app for guest CPU battle and deck editing.

During the migration window, the old Chrono Drive card pool, packs, account login, ranked battle, and room battle surfaces are gated behind an in-app maintenance modal. The existing Chrono Drive duel mode selection screen remains in use, but its CPU entry starts the embedded Chrono Grid battle.

## What was migrated

- 3x3 field battle rules
- CPU battle entry
- online battle placeholder entry
- deck editor
- player deck persistence
- leader trait selection
- card focus / zoom
- manual attack button
- card drag-and-drop play
- generated card frames, stat panels, and icons
- current Chrono Grid card pool from the other workspace
- `chrono-grid/data.js` for Chrono Grid card and rule constants
- embedded entry modes through `chrono-grid/index.html?embedded=1&entry=battle` and `entry=deck`

## Next development target

Continue future Chrono Grid development from `C:\Users\user\Desktop\card-game`.

Suggested next step:

1. Replace the iframe bridge with shell-native Chrono Grid components once the rules stabilize.
2. Rebuild account, ranked, room, pack, and collection storage around Chrono Grid data.
3. Expand the Chrono Grid card pool and retire the old Chrono Drive data files when no compatibility path is needed.

## Safety notes

- Existing Chrono Drive files under `src/` were not replaced.
- Existing card-game rules are still intact.
- `accounts.json` and log files were not touched.
