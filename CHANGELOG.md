# Changelog

Release notes, newest first. Each mod carries its own version in its `plugin.json` and is tagged `<mod>--v<version>`; an entry names the mod it concerns.

## ledger 0.1.0 — 2026-11-05

The first release of the `ledger` mod, a read-only `/ledger` pane over the [ledger](https://github.com/smithadifd/ledger) CLI.

- Five tabs on one pane: Home (chain, search index, one bar per item type split by status, tiles, a 30-day activity sparkline, claims held), Needs you (open decisions oldest first, blocked, claimed, expired claims), Items (filters by type and status, paged to the pane), Decisions (standing, who, the verbatim words, supersession) and Search over the ledger's own index; any row opens the Item screen (the card's sections, links that open, the event log newest first).
- `/ledger <screen|status|id|words>` opens straight to a screen, a status filter, an item or a search; a word that names no item is searched for.
- Reads through the CLI only: eight read verbs with `--json`. A write verb cannot be built, and a test proves it.
- Options `command`, `folder`, `db` and `refreshSeconds`; no hard-coded paths. A missing database draws the ledger's quick start, not an error.
- Status and standing are told by a glyph and a theme color, so the pane follows the session's theme and color is never the only carrier of meaning.
- 43 tests under `claude plugin test`; built and tested on Claude Code 2.1.318 against ledger 0.1.5 and later.
