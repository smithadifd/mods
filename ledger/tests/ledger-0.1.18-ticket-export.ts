// The stdout of `ledger --json export-item IC-ZOD-BUMP` from a real ledger 0.1.18, run against a throwaway
// database after the /ticket skill's own `ticket.py import-cards` imported its closed markdown fixture card
// (skills/ticket/tests/fixtures/IC-ZOD-BUMP.md) into it. The first event id is 2 because one unrelated item
// was written first to create the database. Only the timestamps are replaced, with fixed placeholders; every
// other value is the ledger's own (keys sorted, indented). String.raw keeps the JSON escapes inside the note
// texts as the ledger printed them.
export const LEDGER_0_1_18_TICKET_EXPORT_STDOUT = String.raw`{
  "data": {
    "completeness": {
      "events_decayed": 0,
      "events_on_item": 14,
      "events_returned": 14
    },
    "events": [
      {
        "actor": null,
        "channel": null,
        "harness": "fixture-capture",
        "hash": "9ee21d19f39e6595899f8812854d6dfaac4452a8e1ffe67a4651da94afee205b",
        "id": 2,
        "idempotency_key": "ticket-item/IC-ZOD-BUMP/created",
        "item_id": "IC-ZOD-BUMP",
        "kind": "item.created",
        "model": null,
        "payload": {
          "source": "ticket",
          "title": "Bump zod past the memory-exhaustion advisory in example-app's frontend",
          "type": "ticket"
        },
        "payload_version": 1,
        "prev_hash": "f24cef87b3180b496b83b8157f71fedcbb74fc3c981bbaf9717af176c61161f1",
        "provenance_class": null,
        "recorded_at": "2026-11-05T12:00:02.000Z",
        "session": null
      },
      {
        "actor": null,
        "channel": null,
        "harness": "fixture-capture",
        "hash": "f0669a1d3259daf92df71b066631247e4c2605f915756bd02e20a7d6b851f50d",
        "id": 3,
        "idempotency_key": "ticket-import/IC-ZOD-BUMP/8cd7e0b77f932ef336e203ed3b0e8ea9/0",
        "item_id": "IC-ZOD-BUMP",
        "kind": "item.note",
        "model": null,
        "payload": {
          "source": "ticket",
          "text": "ticket-plan:v2 {\"criteria\":[\"Raise zod in the frontend to at least 4.6.6.\",\"npm audit in frontend shows no high-severity finding for zod.\",\"npm run build, npm run type-check, npm run lint and npm test stay green.\",\"No deploy.\"],\"diff_statement\":\"Update frontend/package-lock.json so the transitive dev dependency zod resolves to 4.6.7 instead of 4.6.5, with no package.json change.\",\"key\":\"IC-ZOD-BUMP\",\"open_questions\":[\"The ticket text calls zod a direct dependency; it is transitive and dev-only (via eslint-plugin-react-hooks), so the fix is lockfile-only and package.json is not touched.\"],\"pass\":\"5a1c0de5a1c0de01\",\"revision\":1,\"schema\":\"ticket-plan-card/v2\",\"steps\":[{\"name\":\"orient\",\"status\":\"complete\"},{\"name\":\"research\",\"status\":\"complete\"},{\"name\":\"plan\",\"skip\":\"a one-package lockfile-only bump with no design choice\",\"status\":\"skipped\"},{\"name\":\"build\",\"status\":\"pending\"},{\"name\":\"review\",\"status\":\"pending\"},{\"name\":\"outward\",\"status\":\"pending\"}],\"ticket_status\":\"open\",\"ticket_updated_at\":\"2026-11-05\",\"title\":\"Bump zod past the memory-exhaustion advisory in example-app's frontend\"}"
        },
        "payload_version": 1,
        "prev_hash": "9ee21d19f39e6595899f8812854d6dfaac4452a8e1ffe67a4651da94afee205b",
        "provenance_class": null,
        "recorded_at": "2026-11-05T12:00:03.000Z",
        "session": null
      },
      {
        "actor": null,
        "channel": null,
        "harness": "fixture-capture",
        "hash": "731bd563e51552fb5cfddb3904b63629c2c3fc6998a122d48f93077c6a9f4f14",
        "id": 4,
        "idempotency_key": "ticket-import/IC-ZOD-BUMP/8cd7e0b77f932ef336e203ed3b0e8ea9/1",
        "item_id": "IC-ZOD-BUMP",
        "kind": "item.note",
        "model": null,
        "payload": {
          "source": "ticket",
          "text": "ticket-decision:v2 {\"criteria\":[\"Raise zod in the frontend to at least 4.6.6.\",\"npm audit in frontend shows no high-severity finding for zod.\",\"npm run build, npm run type-check, npm run lint and npm test stay green.\",\"No deploy.\"],\"effect\":\"The plan gate is approved for plan revision 1.\",\"evidence\":\"/home/user/.claude/projects/home/11111111-2222-4333-8444-555555555555.jsonl\",\"gate\":\"plan\",\"pass\":\"5a1c0de5a1c0de01\",\"phase\":\"plan\",\"plan_revision\":1,\"source\":{\"ref\":\"/home/user/.claude/projects/home/11111111-2222-4333-8444-555555555555.jsonl\",\"what\":\"ratification\"},\"standing\":\"settled\",\"tags\":[{\"id\":\"IC-ZOD-BUMP\",\"type\":\"ticket\"}],\"verbatim\":\"Go\",\"who\":\"the person\",\"who_kind\":\"person\"}"
        },
        "payload_version": 1,
        "prev_hash": "f0669a1d3259daf92df71b066631247e4c2605f915756bd02e20a7d6b851f50d",
        "provenance_class": null,
        "recorded_at": "2026-11-05T12:00:04.000Z",
        "session": null
      },
      {
        "actor": null,
        "channel": null,
        "harness": "fixture-capture",
        "hash": "b7df026d0b1df4ae61cde9a3cfe824d43557b6247461eb12e2a31077ac2be9b1",
        "id": 5,
        "idempotency_key": "ticket-import/IC-ZOD-BUMP/8cd7e0b77f932ef336e203ed3b0e8ea9/2",
        "item_id": "IC-ZOD-BUMP",
        "kind": "item.note",
        "model": null,
        "payload": {
          "source": "ticket",
          "text": "ticket-decision:v2 {\"criteria\":[\"Raise zod in the frontend to at least 4.6.6.\",\"npm audit in frontend shows no high-severity finding for zod.\",\"npm run build, npm run type-check, npm run lint and npm test stay green.\",\"No deploy.\"],\"effect\":\"The outward gate is approved for plan revision 1.\",\"evidence\":\"/home/user/.claude/projects/home/11111111-2222-4333-8444-555555555555.jsonl\",\"gate\":\"outward\",\"phase\":\"review\",\"plan_revision\":1,\"source\":{\"ref\":\"/home/user/.claude/projects/home/11111111-2222-4333-8444-555555555555.jsonl\",\"what\":\"ratification\"},\"standing\":\"settled\",\"tags\":[{\"id\":\"IC-ZOD-BUMP\",\"type\":\"ticket\"}],\"verbatim\":\"Go\",\"who\":\"the person\",\"who_kind\":\"person\"}"
        },
        "payload_version": 1,
        "prev_hash": "731bd563e51552fb5cfddb3904b63629c2c3fc6998a122d48f93077c6a9f4f14",
        "provenance_class": null,
        "recorded_at": "2026-11-05T12:00:05.000Z",
        "session": null
      },
      {
        "actor": null,
        "channel": null,
        "harness": "fixture-capture",
        "hash": "aa99cafd21669d0779c27c4ffc471115d195d54ece2d99dc2926d9ed4ec93033",
        "id": 6,
        "idempotency_key": "ticket-import/IC-ZOD-BUMP/8cd7e0b77f932ef336e203ed3b0e8ea9/3",
        "item_id": "IC-ZOD-BUMP",
        "kind": "item.note",
        "model": null,
        "payload": {
          "source": "ticket",
          "text": "ticket-review:v2 {\"criteria\":[\"Raise zod in the frontend to at least 4.6.6.\",\"npm audit in frontend shows no high-severity finding for zod.\",\"npm run build, npm run type-check, npm run lint and npm test stay green.\",\"No deploy.\"],\"evidence\":\"work/ic-zod-bump/review/receipts/diff-claude-empirical-r1/review-run.json\",\"findings\":[],\"passed\":[0,1,2,3],\"plan_revision\":1,\"reviewer\":\"fresh-context reviewer\",\"round\":1,\"verdict\":\"pass\"}"
        },
        "payload_version": 1,
        "prev_hash": "b7df026d0b1df4ae61cde9a3cfe824d43557b6247461eb12e2a31077ac2be9b1",
        "provenance_class": null,
        "recorded_at": "2026-11-05T12:00:06.000Z",
        "session": null
      },
      {
        "actor": null,
        "channel": null,
        "harness": "fixture-capture",
        "hash": "279089964375cbb5767026bab35d73be4c2dee651467f9016f9ea4afd9885cef",
        "id": 7,
        "idempotency_key": "ticket-import/IC-ZOD-BUMP/8cd7e0b77f932ef336e203ed3b0e8ea9/4",
        "item_id": "IC-ZOD-BUMP",
        "kind": "item.tried",
        "model": null,
        "payload": {
          "evidence": "work/ic-zod-bump/audit-main.json",
          "outcome": "0 critical, 1 high, 8 moderate; high = zod <4.6.6, isDirect false, via eslint-config-next > eslint-plugin-react-hooks@7.1.1 > zod@4.6.5",
          "phase": "orient",
          "source": "ticket",
          "what": "npm audit on origin/main 49d3aef in a fresh worktree (npm ci)"
        },
        "payload_version": 1,
        "prev_hash": "aa99cafd21669d0779c27c4ffc471115d195d54ece2d99dc2926d9ed4ec93033",
        "provenance_class": null,
        "recorded_at": "2026-11-05T12:00:07.000Z",
        "session": null
      },
      {
        "actor": null,
        "channel": null,
        "harness": "fixture-capture",
        "hash": "6f1ddb12742c00b9d73adf4be0d13a1d7f906ed13d83d3e13066b7133be7fe15",
        "id": 8,
        "idempotency_key": "ticket-import/IC-ZOD-BUMP/8cd7e0b77f932ef336e203ed3b0e8ea9/5",
        "item_id": "IC-ZOD-BUMP",
        "kind": "item.tried",
        "model": null,
        "payload": {
          "evidence": "branch:fix/zod-advisory",
          "outcome": "refused: agent worktree isolation needs a git cwd; built on the main thread in the same worktree",
          "phase": "build",
          "source": "ticket",
          "what": "builder-core dispatch"
        },
        "payload_version": 1,
        "prev_hash": "279089964375cbb5767026bab35d73be4c2dee651467f9016f9ea4afd9885cef",
        "provenance_class": null,
        "recorded_at": "2026-11-05T12:00:08.000Z",
        "session": null
      },
      {
        "actor": null,
        "channel": null,
        "harness": "fixture-capture",
        "hash": "0082f6b3c264b39cf98b96aec3d4c2968940ebc915d56820f27958be51d721b3",
        "id": 9,
        "idempotency_key": "ticket-import/IC-ZOD-BUMP/8cd7e0b77f932ef336e203ed3b0e8ea9/6",
        "item_id": "IC-ZOD-BUMP",
        "kind": "item.tried",
        "model": null,
        "payload": {
          "evidence": "ecbd2892e092bc6b4a8fff8b04e85d438a08d57c",
          "outcome": "lockfile diff limited to the zod entry; gates green",
          "phase": "build",
          "source": "ticket",
          "what": "npm update zod with local Node 26 / npm 11.16 (no Node 22 installed)"
        },
        "payload_version": 1,
        "prev_hash": "6f1ddb12742c00b9d73adf4be0d13a1d7f906ed13d83d3e13066b7133be7fe15",
        "provenance_class": null,
        "recorded_at": "2026-11-05T12:00:09.000Z",
        "session": null
      },
      {
        "actor": null,
        "channel": null,
        "harness": "fixture-capture",
        "hash": "e83b27479d3f815b1b607229861394a0d4666be4586ed34aa9ef9ef80b7cce39",
        "id": 10,
        "idempotency_key": "ticket-import/IC-ZOD-BUMP/8cd7e0b77f932ef336e203ed3b0e8ea9/7",
        "item_id": "IC-ZOD-BUMP",
        "kind": "item.tried",
        "model": null,
        "payload": {
          "evidence": "work/ic-zod-bump/review/receipts/diff-sol-r1-adjudicated/review-run.json",
          "outcome": "APPROVE, no issues; receipt unparseable on its Checks section, adjudicated approved",
          "phase": "review",
          "source": "ticket",
          "what": "Sol round 1 (gpt-5.6-sol high)"
        },
        "payload_version": 1,
        "prev_hash": "0082f6b3c264b39cf98b96aec3d4c2968940ebc915d56820f27958be51d721b3",
        "provenance_class": null,
        "recorded_at": "2026-11-05T12:00:10.000Z",
        "session": null
      },
      {
        "actor": null,
        "channel": null,
        "harness": "fixture-capture",
        "hash": "0e0deceafd48520d649488fb8f187f45ba2a31e85130d586bdfd3fa2832ae950",
        "id": 11,
        "idempotency_key": "ticket-import/IC-ZOD-BUMP/8cd7e0b77f932ef336e203ed3b0e8ea9/8",
        "item_id": "IC-ZOD-BUMP",
        "kind": "item.tried",
        "model": null,
        "payload": {
          "evidence": "/home/user/.claude/projects/home/11111111-2222-4333-8444-555555555555.jsonl",
          "outcome": "Go",
          "phase": "review",
          "source": "ticket",
          "what": "owner merge go typed in pane"
        },
        "payload_version": 1,
        "prev_hash": "e83b27479d3f815b1b607229861394a0d4666be4586ed34aa9ef9ef80b7cce39",
        "provenance_class": null,
        "recorded_at": "2026-11-05T12:00:11.000Z",
        "session": null
      },
      {
        "actor": null,
        "channel": null,
        "harness": "fixture-capture",
        "hash": "bd136300e2ba2be57cc5d29dbba331cde99f8dd1992fcdcd227bd13fb6fbb905",
        "id": 12,
        "idempotency_key": "ticket-import/IC-ZOD-BUMP/8cd7e0b77f932ef336e203ed3b0e8ea9/9",
        "item_id": "IC-ZOD-BUMP",
        "kind": "item.stopped",
        "model": null,
        "payload": {
          "phase": "plan",
          "point": "Waiting at plan go for plan revision 1.",
          "refs": [
            ".ticket/IC-ZOD-BUMP.md"
          ],
          "skills": [
            "ticket"
          ],
          "source": "ticket"
        },
        "payload_version": 1,
        "prev_hash": "0e0deceafd48520d649488fb8f187f45ba2a31e85130d586bdfd3fa2832ae950",
        "provenance_class": null,
        "recorded_at": "2026-11-05T12:00:12.000Z",
        "session": null
      },
      {
        "actor": null,
        "channel": null,
        "harness": "fixture-capture",
        "hash": "5ffac29d539a4fa8e608c54db6204d2bb054cac8ce6e182c2a7dea4c0eea1563",
        "id": 13,
        "idempotency_key": "ticket-import/IC-ZOD-BUMP/8cd7e0b77f932ef336e203ed3b0e8ea9/10",
        "item_id": "IC-ZOD-BUMP",
        "kind": "item.stopped",
        "model": null,
        "payload": {
          "phase": "review",
          "point": "Waiting at outward go after review round 1.",
          "refs": [
            ".ticket/IC-ZOD-BUMP.md",
            "work/ic-zod-bump/review/receipts/diff-claude-empirical-r1/review-run.json"
          ],
          "skills": [
            "ticket"
          ],
          "source": "ticket"
        },
        "payload_version": 1,
        "prev_hash": "bd136300e2ba2be57cc5d29dbba331cde99f8dd1992fcdcd227bd13fb6fbb905",
        "provenance_class": null,
        "recorded_at": "2026-11-05T12:00:13.000Z",
        "session": null
      },
      {
        "actor": null,
        "channel": null,
        "harness": "fixture-capture",
        "hash": "c850e42e256fd2b5165ba7c23c1d3a2b278cc0dc242937f771f756afe17681af",
        "id": 14,
        "idempotency_key": "ticket-close/IC-ZOD-BUMP/8cd7e0b77f932ef3/36e203ed3b0e8ea9/stop",
        "item_id": "IC-ZOD-BUMP",
        "kind": "item.stopped",
        "model": null,
        "payload": {
          "phase": "close",
          "point": "Merged example/example-app#423 (squash 92b1b49, head ecbd289) on the owner's typed go; zod 4.6.5 -> 4.6.7 lockfile-only; npm audit high 1 -> 0; no deploy within this pass. The owner then asked for a deploy, run as a separate action after close.",
          "refs": [
            "example/example-app#423",
            "92b1b49",
            "ecbd2892e092bc6b4a8fff8b04e85d438a08d57c",
            "branch:fix/zod-advisory",
            "work/ic-zod-bump/review-pr/receipts"
          ],
          "skills": [
            "deploy"
          ],
          "source": "ticket"
        },
        "payload_version": 1,
        "prev_hash": "5ffac29d539a4fa8e608c54db6204d2bb054cac8ce6e182c2a7dea4c0eea1563",
        "provenance_class": null,
        "recorded_at": "2026-11-05T12:00:14.000Z",
        "session": null
      },
      {
        "actor": null,
        "channel": null,
        "harness": "fixture-capture",
        "hash": "e39d30b12560ba2facb62b28d02f69724b755735da44bdf2f2efed3a1d1b53e5",
        "id": 15,
        "idempotency_key": "ticket-close/IC-ZOD-BUMP/8cd7e0b77f932ef3/36e203ed3b0e8ea9/state",
        "item_id": "IC-ZOD-BUMP",
        "kind": "item.state",
        "model": null,
        "payload": {
          "source": "ticket",
          "status": "closed"
        },
        "payload_version": 1,
        "prev_hash": "c850e42e256fd2b5165ba7c23c1d3a2b278cc0dc242937f771f756afe17681af",
        "provenance_class": null,
        "recorded_at": "2026-11-05T12:00:15.000Z",
        "session": null
      }
    ],
    "item_id": "IC-ZOD-BUMP"
  },
  "error": null,
  "ok": true
}`
