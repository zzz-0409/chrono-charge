# Project Instructions

- After making code, data, or asset changes for this project, verify the change with the most relevant local check before finishing.
- When the change is complete, stage only intentional project files, commit them with a concise message, and push the current branch to `origin` unless the user explicitly says not to push.
- Do not stage local runtime state, credentials, generated logs, or unrelated user changes. In particular, leave `accounts.json` and `*.log` files out of commits.
- If tests or checks cannot be run, mention that in the final response before committing or pushing.
- Keep edits scoped to the requested issue and follow the existing JavaScript and asset organization.
- Do not use browser-native dialogs such as `alert`, `confirm`, or `prompt`; use in-app UI/modals so the experience works consistently as an app.
- When adding drive cards, keep the drive payment model consistent: a drive card can be paid either by sending its listed drive materials to the graveyard, or by paying its printed charge cost. The charge-cost route for themed drive cards requires that the controller has at least that many same-theme cards in the charge zone, counting tapped and untapped cards; generic drive cards may use the charge-cost route without a theme requirement. Drive effects should feel like finishers, not normal cards with heavier costs.
