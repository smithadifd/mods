import { describe, expect, test } from 'claude-code/testing'

import { dataOf, parseItems } from '../hooks/cli'
import { nestItems, rollupOf, rollupText } from '../hooks/model'
import { LEDGER_0_1_10_QUERY_STDOUT } from './ledger-0.1.10-query'

// The answer below is what a real ledger 0.1.10 printed for `query --json`, not a hand-made row set.
const items = parseItems(dataOf('query', { exitCode: 0, stdout: LEDGER_0_1_10_QUERY_STDOUT, stderr: '' }))

describe('the children view against a captured ledger 0.1.10 query', () => {
  test('the real rows carry the anchor link and the open count through the mod\'s own parse', () => {
    expect(items.map(one => [one.id, one.status, one.parentId ?? null, one.childrenOpen])).toEqual([
      ['anchor-1', 'open', null, 1],
      ['child-1', 'closed', 'anchor-1', 0],
      ['child-2', 'closed', 'anchor-1', 0],
      ['child-3', 'open', 'anchor-1', 0],
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
