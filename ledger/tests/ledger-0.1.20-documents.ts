// Answers a real ledger 0.1.20 printed with `--json`, run against a throwaway database. Only the timestamps are
// replaced, with fixed placeholders in their own order (so an event hash no longer matches its row); every other
// value is the ledger's own (keys sorted, indented). Captured with `python3 -m ledger` from `git archive v0.1.20`
// (commit c02cf668fb1637b2ece2c3cfb356fd4487f73533), with LEDGER_HARNESS=cli and LEDGER_AGENT=seat-a.
//
// The item docs-1 was made with `ledger new`, then two documents were attached with `ledger doc add`: brief.md
// (`--role brief --title "The brief"`, 42 bytes of Markdown), then receipt.txt (`--role review-receipt`, no title,
// 35 bytes). receipt.txt holds a harmless made-up string in the listed `sk-` key shape, so the ledger refused it
// (`doc_credential_shape`) until `--allow-credential-shapes` attached it with `credential_override: true`.

// `export-item docs-1`.
export const LEDGER_0_1_20_DOCUMENTS_EXPORT_ITEM_STDOUT = `{
  "data": {
    "completeness": {
      "events_decayed": 0,
      "events_on_item": 3,
      "events_returned": 3
    },
    "events": [
      {
        "actor": "seat-a",
        "channel": null,
        "harness": "cli",
        "hash": "4c993d133ffdde8db16e57fa9303a6069276a09c86015a613e49f4d2fcbc8931",
        "id": 1,
        "idempotency_key": "c6cbde7a0c154e848d887c8854720c56",
        "item_id": "docs-1",
        "kind": "item.created",
        "model": null,
        "payload": {
          "title": "Documents ticket",
          "type": "ticket"
        },
        "payload_version": 1,
        "prev_hash": "0000000000000000000000000000000000000000000000000000000000000000",
        "provenance_class": null,
        "recorded_at": "2026-01-01T00:00:01.000Z",
        "session": null
      },
      {
        "actor": "seat-a",
        "channel": null,
        "harness": "cli",
        "hash": "789268bee6ada1de93e9bce3b49a462e0a1d362f800b1731047ee75ccbf17b88",
        "id": 2,
        "idempotency_key": "doc:docs-1:brief:d82b5d187c280bc0dca0faf8cf898ec9c88912265e82ff04b47623a94103e60e",
        "item_id": "docs-1",
        "kind": "doc.attached",
        "model": null,
        "payload": {
          "content_b64": "IyBUaGUgYnJpZWYKCkJ1aWxkIHRoZSBEb2N1bWVudHMgc2VjdGlvbi4K",
          "mime": "text/markdown",
          "role": "brief",
          "sha256": "d82b5d187c280bc0dca0faf8cf898ec9c88912265e82ff04b47623a94103e60e",
          "size": 42,
          "title": "The brief"
        },
        "payload_version": 1,
        "prev_hash": "4c993d133ffdde8db16e57fa9303a6069276a09c86015a613e49f4d2fcbc8931",
        "provenance_class": null,
        "recorded_at": "2026-01-01T00:00:02.000Z",
        "session": null
      },
      {
        "actor": "seat-a",
        "channel": null,
        "harness": "cli",
        "hash": "fde067ca35cb7245b4e00f2ed57535d6cd3c71feb9c60c45a88d48d74db740f3",
        "id": 3,
        "idempotency_key": "doc:docs-1:review-receipt:ff2a34781a284225bd9f3e99af785c58e0db0aa41dee764cc0d4427174a8cb1f",
        "item_id": "docs-1",
        "kind": "doc.attached",
        "model": null,
        "payload": {
          "content_b64": "cmVjZWlwdDogc2stZml4dHVyZS1ub3QtYS1yZWFsLWtleQo=",
          "credential_override": true,
          "mime": "application/octet-stream",
          "role": "review-receipt",
          "sha256": "ff2a34781a284225bd9f3e99af785c58e0db0aa41dee764cc0d4427174a8cb1f",
          "size": 35
        },
        "payload_version": 1,
        "prev_hash": "789268bee6ada1de93e9bce3b49a462e0a1d362f800b1731047ee75ccbf17b88",
        "provenance_class": null,
        "recorded_at": "2026-01-01T00:00:03.000Z",
        "session": null
      }
    ],
    "item_id": "docs-1"
  },
  "error": null,
  "ok": true
}
`

// `doc show docs-1`, from the same database: the ledger's own list of the item's documents, oldest first.
export const LEDGER_0_1_20_DOCUMENTS_DOC_SHOW_STDOUT = `{
  "data": {
    "documents": [
      {
        "credential_override": false,
        "event_id": 2,
        "item_id": "docs-1",
        "mime": "text/markdown",
        "path": null,
        "role": "brief",
        "sha256": "d82b5d187c280bc0dca0faf8cf898ec9c88912265e82ff04b47623a94103e60e",
        "size": 42,
        "storage": "inline",
        "title": "The brief"
      },
      {
        "credential_override": true,
        "event_id": 3,
        "item_id": "docs-1",
        "mime": "application/octet-stream",
        "path": null,
        "role": "review-receipt",
        "sha256": "ff2a34781a284225bd9f3e99af785c58e0db0aa41dee764cc0d4427174a8cb1f",
        "size": 35,
        "storage": "inline",
        "title": null
      }
    ],
    "item_id": "docs-1"
  },
  "error": null,
  "ok": true
}
`
