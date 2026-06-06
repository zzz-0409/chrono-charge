# Chrono Grid migration

This project now contains the migrated Chrono Grid prototype from the other workspace under:

- `chrono-grid/index.html`
- `chrono-grid/game.js`
- `chrono-grid/style.css`
- `chrono-grid/assets/`

The main `card-game/index.html` home menu has a `Chrono Grid` launch button that opens `chrono-grid/index.html`.

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

## Next development target

Continue future Chrono Grid development from `C:\Users\user\Desktop\card-game`.

Suggested next step:

1. Integrate `chrono-grid` more deeply into the main `card-game` shell instead of launching it as a sub-page.
2. Replace the standalone deck editor with a shell-native view if needed.
3. Reuse `card-game` account/deck storage only after the Chrono Grid rules stabilize.

## Safety notes

- Existing Chrono Drive files under `src/` were not replaced.
- Existing card-game rules are still intact.
- `accounts.json` and log files were not touched.
