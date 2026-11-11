# Changelog

Release notes, newest first. Each mod carries its own version in its `plugin.json` and is tagged `<mod>--v<version>`; an entry names the mod it concerns.

## Unreleased

- ledger: the Item screen's Ticket section draws the /ticket skill's whole pass record from the `ticket-*:v2` records and the tried and stop events the skill writes: plan revisions newest first with each criterion checked against the latest review round on that revision, the plan's steps, skip reason, diff statement and open questions, the goes, the review rounds, the tried records and the stop stamps, the skill's close stamp marked `close`. An item with no ticket frame has no Ticket section. A frame of another kind or version, or a record missing a field the section draws, is listed as unreadable with its reason and never guessed. Checked against a real ledger 0.1.18 export of a closed ticket imported by the skill. No new ledger verbs: the pane still runs the same eight read verbs.

## ledger 0.2.0 — 2026-11-07

The Item screen is rebuilt on the item's own events, with a section strip, a timeline, a Spec section, resume lines and children.

- ledger: the Items screen lists a child indented under its anchor when the anchor is in the list too, and the anchor's row carries the closed-of-total count (`2 of 3`); an anchor's closed children fold behind one `and N closed` line, except when the list is filtered to closed items. The item detail gains a Children section between Now and Decisions: each child with its status glyph, id, claim holder and title, under a header with the same count, and a child opens its own item. This needs ledger 0.1.10 or later, because earlier versions of `query` do not return `parent_id` or `children_open`; a child whose anchor is not in the result, a malformed `parent_id` and every row from an older ledger render flat, as before.
- ledger: the Item screen copies a resume line for each session the item names. Now lists the item's distinct sessions once each (from event envelopes and `session` links, the latest-named first) with a Copy resume line button that copies exactly `claude --resume <session>`, or `no sessions recorded`; an expanded timeline row and a `session` link offer the same copy. A session id is usable only when it is a string of at most 128 characters that starts with a letter or digit and holds only letters, digits and `. _ : -`; anything else (empty, not a string, whitespace, shell syntax, a leading `-`, too long, non-ASCII) shows `session id unusable` and offers no copy, so a pasted line can never run injected shell syntax. The pane still runs only its read verbs. Looking up which live terminal workspace holds a session is a separate follow-up and is not built here.
- ledger: the Item screen's Spec section draws the spec's body and acceptance criteria as Markdown wrapped to the pane, shows the current version with its size, merge class, source and rev, says `spec moved` when the claim was taken against an older version, and lists every earlier version newest first (version, day, size, event id), each expanding to its own body. A spec event with no string body says `body not recorded`. The strip's Spec count is the number of versions.
- ledger: the Item screen draws links, elections, decision records, the latest stop stamp, tried, reviews, notes and the spec from the item's own events (`export-item`) instead of the resume card, which is bounded to a few hundred words and drops whole sections, links first, without saying so. The card stays the source for the next step, open questions, blockers, duplicated-by and the decayed count.
- ledger: an ask shows its options; a `url` link target and a stop ref have a copy button; a header line under the title shows the mint source, the created day and, for a claimed item, when the lease ends.
- ledger: when `export-item` fails or answers without a list of events, the screen says so and keeps the card's sections.
- ledger: the Item screen has a strip of sections under the tab row (Now `n`, Decisions `e`, Links `l`, Timeline `t`, Spec `p`, Ticket `g` when the item has ticket-pass notes), each with a count and a jump to its header. Now gathers the next step, the latest stop, open asks with the recommended option marked, blockers as rows that open the item, and the claim with its lease in words. Decisions adds the asks each election answered; Links groups by relation with PR repo and number and item status and title.
- ledger: the Item timeline groups events under day lines, folds a loop intent and its completion into one row with its round and elapsed time, expands a row by event id to its payload and provenance (model, session, idempotency key, hash), filters by kind, can run oldest first, and draws only the rows near the pane's window past 40 rows. Event rows take no hotkeys.
- ledger: `a` and `f` step to the previous and next item in the list the item was opened from, `b` goes back through items opened from one another, and `o` copies the first PR link or url. The engine accepts only a digit or a lowercase letter as a hotkey, so these are letters.
- ledger: the Item screen reads the pane's width in three bands (under 70, 70 to 119, 120 and up). A refused re-read keeps the last good detail, dimmed, with the age of the read; a section whose events could not be read says so in that section.
- No new ledger verbs: the pane still runs the same eight read verbs.

## ledger 0.1.0 — 2026-11-05

The first release of the `ledger` mod, a read-only `/ledger` pane over the [ledger](https://github.com/smithadifd/ledger) CLI.

- Five tabs on one pane: Home (chain, search index, one bar per item type split by status, tiles, a 30-day activity sparkline, claims held), Needs you (open decisions oldest first, blocked, claimed, expired claims), Items (filters by type and status, paged to the pane), Decisions (standing, who, the verbatim words, supersession) and Search over the ledger's own index; any row opens the Item screen (the card's sections, links that open, the event log newest first).
- `/ledger <screen|status|id|words>` opens straight to a screen, a status filter, an item or a search; a word that names no item is searched for.
- Reads through the CLI only: eight read verbs with `--json`. A write verb cannot be built, and a test proves it.
- Options `command`, `folder`, `db` and `refreshSeconds`; no hard-coded paths. A missing database draws the ledger's quick start, not an error.
- Status and standing are told by a glyph and a theme color, so the pane follows the session's theme and color is never the only carrier of meaning.
- 48 tests under `claude plugin test`; built and tested on Claude Code 2.1.318 against ledger 0.1.5 and later.
