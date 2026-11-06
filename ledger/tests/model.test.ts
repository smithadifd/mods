import { describe, expect, test } from 'claude-code/testing'

import type { Item } from '../types'
import {
  ageOf,
  barLength,
  countByStatus,
  countsByType,
  cut,
  dailyTouches,
  filterDecisions,
  filterItems,
  fit,
  kindColor,
  needsYou,
  pageCount,
  pageOf,
  parseCommandArgs,
  segments,
  sortItems,
  sparkline,
  standingColor,
  standingGlyph,
  statusColor,
  statusGlyph,
} from '../hooks/model'

const NOW = Date.parse('2026-11-06T12:00:00Z')

function item(id: string, status: string, type = 'ticket', updatedAt = '2026-11-06T11:00:00Z', createdAt = updatedAt): Item {
  return { id, type, title: `title of ${id}`, status, owner: null, claim: status === 'claimed' ? 'seat-1' : null, createdAt, updatedAt }
}

describe('ages and widths', () => {
  test('ages read as a person says them', () => {
    expect(ageOf('2026-11-06T11:59:50Z', NOW)).toBe('now')
    expect(ageOf('2026-11-06T11:55:00Z', NOW)).toBe('5m')
    expect(ageOf('2026-11-06T09:00:00Z', NOW)).toBe('3h')
    expect(ageOf('2026-11-03T12:00:00Z', NOW)).toBe('3d')
    expect(ageOf('2026-10-16T12:00:00Z', NOW)).toBe('3w')
    expect(ageOf('2026-07-06T12:00:00Z', NOW)).toBe('4mo')
    expect(ageOf('', NOW)).toBe('?')
  })

  test('fit pads or cuts to the width; cut never pads', () => {
    expect(fit('abc', 5)).toBe('abc  ')
    expect(fit('abcdef', 4)).toBe('abc…')
    expect(fit('abcdef', 1)).toBe('a')
    expect(fit('abc', 0)).toBe('')
    expect(fit('a\nb  c', 5)).toBe('a b c')
    expect(cut('abc', 5)).toBe('abc')
    expect(cut('abcdef', 4)).toBe('abc…')
  })
})

describe('counts and bars', () => {
  const items = [item('a', 'open'), item('b', 'closed'), item('c', 'blocked', 'decision'), item('d', 'open', 'decision'), item('e', 'claimed')]

  test('counts by type come largest first with the status split', () => {
    expect(countsByType(items)).toEqual([
      { type: 'ticket', total: 3, counts: { open: 1, claimed: 1, blocked: 0, closed: 1 } },
      { type: 'decision', total: 2, counts: { open: 1, claimed: 0, blocked: 1, closed: 0 } },
    ])
    expect(countByStatus(items)).toEqual({ open: 2, claimed: 1, blocked: 1, closed: 1 })
  })

  test('segments share the cells by count and keep every present status visible', () => {
    expect(segments({ open: 129, claimed: 3, blocked: 15, closed: 136 }, 36).reduce((sum, one) => sum + one.cells, 0)).toBe(36)
    expect(segments({ open: 129, claimed: 3, blocked: 15, closed: 136 }, 36).find(one => one.status === 'claimed')?.cells).toBe(1)
    expect(segments({ open: 1, claimed: 0, blocked: 0, closed: 0 }, 10)).toEqual([{ status: 'open', cells: 10 }])
    expect(segments({ open: 0, claimed: 0, blocked: 0, closed: 0 }, 10)).toEqual([])
    expect(segments({ open: 5, claimed: 5, blocked: 5, closed: 5 }, 2)).toEqual([
      { status: 'open', cells: 1 },
      { status: 'claimed', cells: 1 },
    ])
  })

  test('a bar is scaled to the largest type and never shorter than one cell', () => {
    expect(barLength(283, 283, 36)).toBe(36)
    expect(barLength(100, 283, 36)).toBe(13)
    expect(barLength(1, 283, 36)).toBe(1)
    expect(barLength(0, 283, 36)).toBe(0)
  })

  test('daily touches bucket items by their newest event, oldest day first', () => {
    const touched = [
      item('a', 'open', 'ticket', new Date(NOW - 1000).toISOString()),
      item('b', 'open', 'ticket', new Date(NOW - 2 * 24 * 3600 * 1000).toISOString()),
      item('c', 'open', 'ticket', new Date(NOW - 2 * 24 * 3600 * 1000).toISOString()),
      item('d', 'open', 'ticket', new Date(NOW - 40 * 24 * 3600 * 1000).toISOString()),
      item('e', 'open', 'ticket', 'not a date'),
    ]
    const days = dailyTouches(touched, NOW, 7)
    expect(days.length).toBe(7)
    expect(days[6]).toBe(1)
    expect(days[4]).toBe(2)
    expect(days.reduce((sum, one) => sum + one, 0)).toBe(3)
  })

  test('a sparkline scales to the largest value', () => {
    expect(sparkline([0, 0, 0])).toBe('▁▁▁')
    expect(sparkline([1, 4, 8])).toBe('▁▄█')
    expect(sparkline([8])).toBe('█')
  })

  test('colors are theme keys, by status, standing and event kind', () => {
    expect(statusColor('open')).toBe('claude')
    expect(statusColor('blocked')).toBe('error')
    expect(statusColor('odd')).toBe('text')
    expect(standingColor('settled')).toBe('success')
    expect(standingColor('lean')).toBe('warning')
    expect(kindColor('item.state', 'status → closed')).toBe('subtle')
    expect(kindColor('decision.asked', 'q')).toBe('claude')
    expect(kindColor('review.recorded', 'review BUG round 2')).toBe('error')
    expect(kindColor('loop.done', 'x')).toBe('subtle')
    expect(kindColor('item.note', 'x')).toBe('text')
  })

  test('every status and standing has a glyph of its own, so color is never the only carrier', () => {
    const statuses = ['open', 'claimed', 'blocked', 'closed'].map(statusGlyph)
    expect(new Set(statuses).size).toBe(4)
    expect(statusGlyph('blocked')).toBe('✖')
    expect(statusGlyph('odd')).toBe('·')
    const standings = ['settled', 'lean', 'superseded'].map(standingGlyph)
    expect(new Set(standings).size).toBe(3)
    expect(standingGlyph('odd')).toBe('·')
  })
})

describe('lists', () => {
  const items = [
    item('a', 'open', 'ticket', '2026-11-01T00:00:00Z'),
    item('b', 'closed', 'ticket', '2026-11-05T00:00:00Z'),
    item('c', 'blocked', 'decision', '2026-11-02T00:00:00Z'),
    item('d', 'open', 'decision', '2026-11-04T00:00:00Z', '2026-10-01T00:00:00Z'),
    item('e', 'claimed', 'ticket', '2026-11-03T00:00:00Z'),
    item('f', 'open', 'decision', '2026-11-03T00:00:00Z', '2026-09-01T00:00:00Z'),
  ]

  test('sorting puts claimed first, then open, blocked, closed, newest first within', () => {
    expect(sortItems(items).map(one => one.id)).toEqual(['e', 'd', 'f', 'a', 'c', 'b'])
  })

  test('filters narrow by type and status; ready is the ledger\'s own set', () => {
    expect(filterItems(items, ['a'], 'all', 'ready').map(one => one.id)).toEqual(['a'])
    expect(filterItems(items, [], 'decision', 'open').map(one => one.id)).toEqual(['d', 'f'])
    expect(filterItems(items, [], 'all', 'all').length).toBe(6)
  })

  test('paging', () => {
    expect(pageCount(0, 10)).toBe(1)
    expect(pageCount(21, 10)).toBe(3)
    expect(pageOf([1, 2, 3, 4, 5], 1, 2)).toEqual([3, 4])
    expect(pageOf([1, 2, 3], 5, 2)).toEqual([])
  })

  test('needs-you lists open decisions oldest first, then blocked and claimed', () => {
    const found = needsYou(items, { path: '', schemaVersion: 9, search: { status: 'current', behind: 0 }, expiredClaims: [{ itemId: 'z', holder: 'h', expiresAt: '' }] })
    expect(found.decisions.map(one => one.id)).toEqual(['f', 'd'])
    expect(found.blocked.map(one => one.id)).toEqual(['c'])
    expect(found.claimed.map(one => one.id)).toEqual(['e'])
    expect(found.expired.length).toBe(1)
    expect(needsYou(items, null).expired).toEqual([])
  })

  test('decisions filter by standing, newest first', () => {
    const decisions = [
      { eventId: 1, itemId: 'x', effect: 'a', who: 'o', whoKind: 'person', standing: 'settled', verbatim: '', recordedAt: '2026-11-01T00:00:00Z', tags: [], supersededBy: null, result: null, evidence: null, phase: null },
      { eventId: 2, itemId: 'y', effect: 'b', who: 'o', whoKind: 'person', standing: 'lean', verbatim: '', recordedAt: '2026-11-02T00:00:00Z', tags: [], supersededBy: null, result: null, evidence: null, phase: null },
    ]
    expect(filterDecisions(decisions, 'all').map(one => one.eventId)).toEqual([2, 1])
    expect(filterDecisions(decisions, 'settled').map(one => one.eventId)).toEqual([1])
  })
})

describe('the command line', () => {
  test('no words is home; a screen word is that screen', () => {
    expect(parseCommandArgs('')).toEqual({ screen: 'home' })
    expect(parseCommandArgs(' needs ')).toEqual({ screen: 'needs' })
    expect(parseCommandArgs('Decisions')).toEqual({ screen: 'decisions' })
  })

  test('a status word lists items under it', () => {
    expect(parseCommandArgs('blocked')).toEqual({ screen: 'items', status: 'blocked' })
    expect(parseCommandArgs('ready')).toEqual({ screen: 'items', status: 'ready' })
  })

  test('one id-shaped word is an item; anything else is a search', () => {
    expect(parseCommandArgs('NY-148')).toEqual({ id: 'NY-148' })
    expect(parseCommandArgs('adr-0037.acceptance')).toEqual({ id: 'adr-0037.acceptance' })
    expect(parseCommandArgs('merge train')).toEqual({ query: 'merge train' })
    expect(parseCommandArgs('"quoted"')).toEqual({ query: '"quoted"' })
  })
})
