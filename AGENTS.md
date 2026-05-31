# Project Instructions

- After making code, data, or asset changes for this project, verify the change with the most relevant local check before finishing.
- When the change is complete, stage only intentional project files, commit them with a concise message, push the current branch to `origin`, then make sure the same intentional changes are reflected on `main` and push `main` to `origin` unless the user explicitly says not to push.
- Do not stage local runtime state, credentials, generated logs, or unrelated user changes. In particular, leave `accounts.json` and `*.log` files out of commits.
- If tests or checks cannot be run, mention that in the final response before committing or pushing.
- Keep edits scoped to the requested issue and follow the existing JavaScript and asset organization.
- Do not use browser-native dialogs such as `alert`, `confirm`, or `prompt`; use in-app UI/modals so the experience works consistently as an app.
- When adding cards through automation, add/update `src/data/notices.js` with the new card IDs so the in-app notice modal shows the added cards. For a new theme, include a short story section and mention the new theme pack.
- When adding drive cards, keep the drive payment model consistent: a drive card is paid by sending its listed drive materials from hand or field to the graveyard and then paying its printed charge cost by tapping charge. Drive materials should not be selected from the charge zone. Baseline tuning: reaction drives usually have printed cost 0, effect-negating or especially strong reaction drives can use higher costs such as 3, unit drives are generally about +3 cost versus the older templates, and most drive cards should reduce material requirements by about one card from the older heavy templates. Strong finishers can keep heavier material requirements, while low-cost support unit drives can be exceptions when a theme needs them. Material requirements can still be custom when the card design calls for it, even if they differ from the drive card's own type, such as a core drive requiring a unit, core, reaction, and spell as materials. Drive effects should feel like finishers, not normal cards with heavier costs, but increase power gradually and avoid sudden balance-breaking jumps.
- Drive-card buffs should preserve each card's role instead of adding the same generic draw/charge-active package everywhere: reaction drives should disrupt or punish the negated card, core drives can provide small once-per-turn field activations, unit drives should help swing the board, and spell drives should extend the theme engine through search, recovery, charge activity, or targeted removal.

- Daily/weekly card-creation cycle (Asia/Tokyo).
  - Every day at 24:00, add 2 cards from an existing theme and 1 generic card.
  - Every Thursday only, instead of the above, create a new theme with 10 main cards + 3 drive cards (about 13 cards total), introducing a new play pattern.
  - Existing summon methods and core rules must stay unchanged.
- After adding cards on any run:
  - Review all new/changed card text and implementation for consistency before finishing.
  - Verify no mismatch in timing, targeting, cost, and conditions.
  - Run CPU smoke checks for crashes/infinite loops/illegal states.
  - If mismatch or behavior risk appears, fix implementation or wording until they align.
