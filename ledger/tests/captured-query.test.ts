import { describe, expect, test } from 'claude-code/testing'

import { dataOf, parseEvents, parseItems } from '../hooks/cli'
import { groupBySeat, nestItems, rollupOf, rollupText, sessionLinkLines } from '../hooks/model'
import { LEDGER_0_1_19_QUERY_STDOUT, LEDGER_0_1_19_SEATS_EXPORT_ITEM_STDOUT, LEDGER_0_1_19_SEATS_QUERY_STDOUT } from './ledger-0.1.19-query'

// Each answer below is what a real ledger 0.1.19 printed, not a hand-made row set.
const items = parseItems(dataOf('query', { exitCode: 0, stdout: LEDGER_0_1_19_QUERY_STDOUT, stderr: '' }))
const seatItems = parseItems(dataOf('query', { exitCode: 0, stdout: LEDGER_0_1_19_SEATS_QUERY_STDOUT, stderr: '' }))

// Every key a ledger 0.1.19 `query` row carries, sorted. The mod reads item_id, type, title, status, owner, claim,
// created_at, updated_at, parent_id and children_open. A key dropped from a row, or one the ledger adds, fails the
// shape test, so the fixture and this list move together with the ledger tag.
const QUERY_ROW_KEYS = [
  'children_open',
  'claim',
  'created_at',
  'created_event_id',
  'item_id',
  'owner',
  'parent_id',
  'revision',
  'state_event_id',
  'status',
  'title',
  'type',
  'updated_at',
]

function rawRows(stdout: string): Record<string, unknown>[] {
  const envelope = JSON.parse(stdout) as { data: { items: Record<string, unknown>[] } }
  return envelope.data.items
}

describe('the shape of a captured ledger 0.1.19 query', () => {
  test('every row carries exactly the keys a 0.1.19 query row has', () => {
    for (const stdout of [LEDGER_0_1_19_QUERY_STDOUT, LEDGER_0_1_19_SEATS_QUERY_STDOUT]) {
      const rows = rawRows(stdout)
      expect(rows.length).toBe(4)
      for (const row of rows) expect(Object.keys(row).sort()).toEqual(QUERY_ROW_KEYS)
    }
  })
})

describe('the children view against a captured ledger 0.1.19 query', () => {
  test('every field the mod reads comes through its own parse', () => {
    expect(items).toEqual([
      { id: 'anchor-1', type: 'ticket', title: 'Anchor ticket', status: 'open', owner: null, claim: null, createdAt: '2026-01-01T00:00:01.000Z', updatedAt: '2026-01-01T00:00:01.000Z', childrenOpen: 1 },
      { id: 'child-1', type: 'ticket', title: 'First child', status: 'closed', owner: null, claim: null, createdAt: '2026-01-01T00:00:02.000Z', updatedAt: '2026-01-01T00:00:05.000Z', parentId: 'anchor-1', childrenOpen: 0 },
      { id: 'child-2', type: 'ticket', title: 'Second child', status: 'closed', owner: null, claim: null, createdAt: '2026-01-01T00:00:03.000Z', updatedAt: '2026-01-01T00:00:06.000Z', parentId: 'anchor-1', childrenOpen: 0 },
      { id: 'child-3', type: 'ticket', title: 'Third child', status: 'open', owner: null, claim: null, createdAt: '2026-01-01T00:00:04.000Z', updatedAt: '2026-01-01T00:00:04.000Z', parentId: 'anchor-1', childrenOpen: 0 },
    ])
  })

  test('the anchor counts 2 of 3', () => {
    expect(rollupOf('anchor-1', items)).toEqual({ closed: 2, open: 1, total: 3 })
    expect(rollupText(rollupOf('anchor-1', items)!)).toBe('2 of 3')
  })

  test('the open child is indented under the anchor and the two closed ones fold behind "and 2 closed"', () => {
    const rows = nestItems(items, items, true)
    expect(rows.map(one => (one.kind === 'item' ? `${one.item.id}@${one.depth}` : `fold:${one.anchorId}:${one.closed}`))).toEqual([
      'anchor-1@0',
      'child-3@1',
      'fold:anchor-1:2',
    ])
  })
})

describe('the By seat grouping against a captured ledger 0.1.19 query', () => {
  test('the claim labels come through the parse, owner and claim apart', () => {
    expect(seatItems.map(one => [one.id, one.status, one.owner, one.claim])).toEqual([
      ['row-a1', 'claimed', 'seat-a', 'seat-a'],
      ['row-a2', 'claimed', 'seat-a', 'seat-a'],
      ['row-b1', 'claimed', 'director', 'seat-b'],
      ['row-open', 'open', null, null],
    ])
  })

  test('two claim labels give two seats, each item under its own; the unclaimed item is under none', () => {
    const grouped = groupBySeat(seatItems)
    expect(grouped.seats.map(one => [one.seat, one.items.map(item => item.id)])).toEqual([
      ['seat-a', ['row-a2', 'row-a1']],
      ['seat-b', ['row-b1']],
    ])
    expect(grouped.unlabelled).toEqual([])
    expect(grouped.seats.some(one => one.items.some(item => item.id === 'row-open'))).toBe(false)
  })
})

describe('the session link against a captured ledger 0.1.19 export-item', () => {
  test('the session link on row-b1 gives its resume line', () => {
    const parsed = parseEvents(dataOf('export-item', { exitCode: 0, stdout: LEDGER_0_1_19_SEATS_EXPORT_ITEM_STDOUT, stderr: '' }))
    expect(parsed.error).toBe(null)
    expect(parsed.events.map(one => [one.id, one.kind, one.actor])).toEqual([
      [8, 'item.linked', 'seat-b'],
      [7, 'item.state', 'director'],
      [3, 'item.created', null],
    ])
    expect([...sessionLinkLines(parsed.events).entries()]).toEqual([[8, 'claude --resume sess-b1']])
  })
})
