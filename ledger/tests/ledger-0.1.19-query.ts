// Answers a real ledger 0.1.19 printed with `--json`, each run against a throwaway database. Only these values are
// replaced: timestamps, with fixed placeholders in their own order (so an event hash no longer matches its row), and
// each idempotency key, with `key-N`. Every other value is the ledger's own (keys sorted, indented). Captured with
// `python3 -m ledger` from `git archive v0.1.19` (commit e9337e23c3f490d00439b4c0a1b2a126c962b36f).

// `query`: one anchor (anchor-1) and three children linked `child-of` it, two of them closed.
export const LEDGER_0_1_19_QUERY_STDOUT = `{
  "data": {
    "items": [
      {
        "children_open": 1,
        "claim": null,
        "created_at": "2026-01-01T00:00:01.000Z",
        "created_event_id": 1,
        "item_id": "anchor-1",
        "owner": null,
        "parent_id": null,
        "revision": 1,
        "state_event_id": null,
        "status": "open",
        "title": "Anchor ticket",
        "type": "ticket",
        "updated_at": "2026-01-01T00:00:01.000Z"
      },
      {
        "children_open": 0,
        "claim": null,
        "created_at": "2026-01-01T00:00:02.000Z",
        "created_event_id": 2,
        "item_id": "child-1",
        "owner": null,
        "parent_id": "anchor-1",
        "revision": 8,
        "state_event_id": 8,
        "status": "closed",
        "title": "First child",
        "type": "ticket",
        "updated_at": "2026-01-01T00:00:05.000Z"
      },
      {
        "children_open": 0,
        "claim": null,
        "created_at": "2026-01-01T00:00:03.000Z",
        "created_event_id": 3,
        "item_id": "child-2",
        "owner": null,
        "parent_id": "anchor-1",
        "revision": 9,
        "state_event_id": 9,
        "status": "closed",
        "title": "Second child",
        "type": "ticket",
        "updated_at": "2026-01-01T00:00:06.000Z"
      },
      {
        "children_open": 0,
        "claim": null,
        "created_at": "2026-01-01T00:00:04.000Z",
        "created_event_id": 4,
        "item_id": "child-3",
        "owner": null,
        "parent_id": "anchor-1",
        "revision": 7,
        "state_event_id": null,
        "status": "open",
        "title": "Third child",
        "type": "ticket",
        "updated_at": "2026-01-01T00:00:04.000Z"
      }
    ],
    "limit": 50,
    "truncated": false
  },
  "error": null,
  "ok": true
}
`

// `query`: row-a1 and row-a2 claimed by seat-a (LEDGER_AGENT=seat-a, so owner and claim are both seat-a); row-b1
// claimed with `--claim seat-b` by LEDGER_AGENT=director (owner director, claim seat-b); row-open never claimed.
export const LEDGER_0_1_19_SEATS_QUERY_STDOUT = `{
  "data": {
    "items": [
      {
        "children_open": 0,
        "claim": "seat-a",
        "created_at": "2026-01-01T00:00:01.000Z",
        "created_event_id": 1,
        "item_id": "row-a1",
        "owner": "seat-a",
        "parent_id": null,
        "revision": 5,
        "state_event_id": 5,
        "status": "claimed",
        "title": "First seat-a row",
        "type": "ticket",
        "updated_at": "2026-01-01T00:00:05.000Z"
      },
      {
        "children_open": 0,
        "claim": "seat-a",
        "created_at": "2026-01-01T00:00:02.000Z",
        "created_event_id": 2,
        "item_id": "row-a2",
        "owner": "seat-a",
        "parent_id": null,
        "revision": 6,
        "state_event_id": 6,
        "status": "claimed",
        "title": "Second seat-a row",
        "type": "ticket",
        "updated_at": "2026-01-01T00:00:06.000Z"
      },
      {
        "children_open": 0,
        "claim": "seat-b",
        "created_at": "2026-01-01T00:00:03.000Z",
        "created_event_id": 3,
        "item_id": "row-b1",
        "owner": "director",
        "parent_id": null,
        "revision": 8,
        "state_event_id": 7,
        "status": "claimed",
        "title": "The seat-b row",
        "type": "ticket",
        "updated_at": "2026-01-01T00:00:07.000Z"
      },
      {
        "children_open": 0,
        "claim": null,
        "created_at": "2026-01-01T00:00:04.000Z",
        "created_event_id": 4,
        "item_id": "row-open",
        "owner": null,
        "parent_id": null,
        "revision": 4,
        "state_event_id": null,
        "status": "open",
        "title": "Nobody holds this",
        "type": "ticket",
        "updated_at": "2026-01-01T00:00:04.000Z"
      }
    ],
    "limit": 50,
    "truncated": false
  },
  "error": null,
  "ok": true
}
`

// `export-item row-b1`, from the same database: created, claimed for seat-b, then linked `--rel session sess-b1` by
// LEDGER_AGENT=seat-b.
export const LEDGER_0_1_19_SEATS_EXPORT_ITEM_STDOUT = `{
  "data": {
    "completeness": {
      "events_decayed": 0,
      "events_on_item": 3,
      "events_returned": 3
    },
    "events": [
      {
        "actor": null,
        "channel": null,
        "harness": "cli",
        "hash": "25731867a8efb279bee0cb44ee03de820d2adc542b1c64fd237add6d432e48ab",
        "id": 3,
        "idempotency_key": "key-1",
        "item_id": "row-b1",
        "kind": "item.created",
        "model": null,
        "payload": {
          "title": "The seat-b row",
          "type": "ticket"
        },
        "payload_version": 1,
        "prev_hash": "3847ffee7a693c302e4b0c09cbb29520f1aa9ee7b8b915c0296ebb0596a10454",
        "provenance_class": null,
        "recorded_at": "2026-01-01T00:00:01.000Z",
        "session": null
      },
      {
        "actor": "director",
        "channel": null,
        "harness": "cli",
        "hash": "481e1be7c3e5db715dee3442e4c4e8d2294a8f794ea32f15d712c95e9c15bdd8",
        "id": 7,
        "idempotency_key": "key-2",
        "item_id": "row-b1",
        "kind": "item.state",
        "model": null,
        "payload": {
          "claim": "seat-b",
          "expires_at": "2026-01-01T00:00:04.000Z",
          "owner": "director",
          "status": "claimed"
        },
        "payload_version": 1,
        "prev_hash": "518f334c557c0019131dae1996ff0ef915622c8b0214e8eb757070f7056ec347",
        "provenance_class": null,
        "recorded_at": "2026-01-01T00:00:02.000Z",
        "session": null
      },
      {
        "actor": "seat-b",
        "channel": null,
        "harness": "cli",
        "hash": "ec47104e7ad72e3951bbd1ac306986a0777c5d7dc9a1b6c8465923f8aef1720c",
        "id": 8,
        "idempotency_key": "key-3",
        "item_id": "row-b1",
        "kind": "item.linked",
        "model": null,
        "payload": {
          "rel": "session",
          "target": "sess-b1"
        },
        "payload_version": 1,
        "prev_hash": "481e1be7c3e5db715dee3442e4c4e8d2294a8f794ea32f15d712c95e9c15bdd8",
        "provenance_class": null,
        "recorded_at": "2026-01-01T00:00:03.000Z",
        "session": null
      }
    ],
    "item_id": "row-b1"
  },
  "error": null,
  "ok": true
}
`
