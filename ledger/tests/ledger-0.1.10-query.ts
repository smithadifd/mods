// The stdout of `ledger query --json` from a real ledger 0.1.10, run against a throwaway database holding one
// anchor (anchor-1) and three children linked `child-of` it, two of them closed. Only the timestamps are replaced,
// with fixed placeholders; every other value is the ledger's own (keys sorted, indented).
export const LEDGER_0_1_10_QUERY_STDOUT = `{
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
        "updated_at": "2026-01-01T00:00:03.000Z"
      },
      {
        "children_open": 0,
        "claim": null,
        "created_at": "2026-01-01T00:00:04.000Z",
        "created_event_id": 3,
        "item_id": "child-2",
        "owner": null,
        "parent_id": "anchor-1",
        "revision": 9,
        "state_event_id": 9,
        "status": "closed",
        "title": "Second child",
        "type": "ticket",
        "updated_at": "2026-01-01T00:00:05.000Z"
      },
      {
        "children_open": 0,
        "claim": null,
        "created_at": "2026-01-01T00:00:06.000Z",
        "created_event_id": 4,
        "item_id": "child-3",
        "owner": null,
        "parent_id": "anchor-1",
        "revision": 7,
        "state_event_id": null,
        "status": "open",
        "title": "Third child",
        "type": "ticket",
        "updated_at": "2026-01-01T00:00:06.000Z"
      }
    ],
    "limit": 50,
    "truncated": false
  },
  "error": null,
  "ok": true
}
`
