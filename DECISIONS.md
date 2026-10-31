# Editor decisions

Owner's decisions and constraints for the slot editor, moved here from the project `AGENTS.md` so
that file stays short. Read this before changing editor behavior. The layout and usage are in `README.md`.

- `editor\` is the slot-based filter editor (own git repo, all TypeScript). See `editor\README.md`.
- The editor is published as a private artifact (https://claude.ai/artifact/WVo8XrbNXoX2yHFeRzsvag), built with
  `npm run build:single` in `editor\` and republished from `dist-single\editor.html` (same path keeps the URL).
  It contains the owner's filters, so don't share it.
- Editor imports are an improved presentation, not the source of truth: the importer may reshape
  rules to fit (drop "all unique charms" recolours, remove gear IDs from charm rules, rarity 14 -> 8
  with a GA condition, adopt the shared gear colour, fold mythics-only rules into the fixed one),
  each with an import note. Saved filters are only changed when the owner asks.
- Owner's design for the editor: one model exports a **starter** and an **end-game** filter (switched
  in game). Per slot: one desired-stats count and one GA count. Starter: always show, recolour on the
  desired stats (GA and ancestral ignored). End-game: show = ancestral + desired stats, recolour =
  that + the GA count. Stats: checkbox = desired, star = GA wanted on that stat.
  One global gear recolour colour. Charms are one section (uniques, sets, shared desired stats) with
  colours: +Stats yellow-green, picked unique green, wanted set orange. No charm GA rules (owner: lowest
  priority, saves rules; `GA Needed Set Charms` is dropped on import). Other unique charms just show via
  the materials rule (no "all unique charms" rule, to save a rule). Global
  settings sit in a collapsed section at the top of the right column.
- Charm stat rules (`Skill Set Charms`, `GA Needed Set Charms`) use charm stats, not gear stats:
  `Talisman_Charm_SkillRankBonus_Warlock_Category_Hellfire` 2545972, `…_Demonology` 2545970,
  `Talisman_Charm_Affix_Life` 2588359 (changed 2026-10-31; was the gear IDs 2534852, 2534856, 1829592).
- Set charms always show via `Charms/Seals for Mats`, so the charm colours only mark wanted sets.
- Filters always end with `No Ma'am`; the owner switches it off in game when wanted.
- Editor rule order is fixed (no tier picker): a rule moves up only if that changes what matches.
  Inside a section: strong recolour (much better), recolour, show.
  Codex Upgrades (recolour red) is always the first rule.
  Mythics (show rarity 32) is the last rule before `No Ma'am`, so recolour rules apply to mythics.
  Strict Warlock BS has it there too (moved from first, 2026-10-31).
- Editor limits (owner, 2026-10-31): at most 25 rules per filter, 10 uniques per rule. Note the
  10-unique cap is a choice, not a verified game limit: 11 and 12 import fine (see Loot Filters README).
  `Build Unique Charms` stays at 11 uniques (owner's call); the editor's export warning about it is expected.
- Before Mythics: starter "All Ancestral" (on), end-game "Any 2GA+ Ancestral" (off); toggled in game,
  not editor settings.
- **Goal (met):** the editor runs completely in the browser (Vite + React, no server). Building
  the mapping in `editor\data\` from d4data stays an offline step. Keep `editor\src\` free of Node-only APIs.
- Third profile, strict end-game (owner, 2026-11-01): per slot one recolour rule needing the desired
  stats and the GA count together (starred stats must be the GA); no show rule. Name suffix " Strict".
