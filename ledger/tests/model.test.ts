import { describe, expect, test } from 'claude-code/testing'

import type { Event, Item } from '../types'
import {
  ageOf,
  barLength,
  countByStatus,
  countsByType,
  cut,
  dailyTouches,
  electionsOf,
  filterDecisions,
  filterItems,
  fit,
  headerLine,
  headerOf,
  kindColor,
  linksOf,
  needsYou,
  notesOf,
  optionsOf,
  pageCount,
  pageOf,
  parseCommandArgs,
  recordsOf,
  reviewsOf,
  segments,
  sortItems,
  sparkline,
  specOf,
  stopOf,
  triedOf,
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
    expect(segments({ open: 100, claimed: 1, blocked: 1, closed: 1 }, 8).reduce((sum, one) => sum + one.cells, 0)).toBe(8)
    expect(segments({ open: 100, claimed: 1, blocked: 1, closed: 1 }, 8).find(one => one.status === 'open')?.cells).toBe(5)
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

  test('needs-you lists open decisions oldest first, then blocked and claimed; a claim past its lease is expired, not held', () => {
    const found = needsYou(items, { path: '', schemaVersion: 9, search: { status: 'current', behind: 0 }, expiredClaims: [{ itemId: 'z', holder: 'h', expiresAt: '' }] })
    expect(found.decisions.map(one => one.id)).toEqual(['f', 'd'])
    expect(found.blocked.map(one => one.id)).toEqual(['c'])
    expect(found.claimed.map(one => one.id)).toEqual(['e'])
    expect(found.expired.length).toBe(1)
    const lapsed = needsYou(items, { path: '', schemaVersion: 9, search: { status: 'current', behind: 0 }, expiredClaims: [{ itemId: 'e', holder: 'h', expiresAt: '' }] })
    expect(lapsed.claimed).toEqual([])
    expect(lapsed.expired.map(one => one.itemId)).toEqual(['e'])
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

function ev(id: number, kind: string, payload: Record<string, unknown>, recordedAt = '2026-10-30T12:00:00Z'): Event {
  return { id, kind, actor: 'seat', harness: 'cli', model: null, recordedAt, summary: `summary of ${kind} ${id}`, payload }
}

describe('the item screen projects its sections from the events', () => {
  test('links: every item.linked event shows, however many, and a loop build adds its PR once', () => {
    const many = Array.from({ length: 25 }, (_, index) => ev(100 + index, 'item.linked', { rel: 'item', target: `rm-${index}` }))
    const rows = linksOf([
      ...many,
      ev(10, 'item.linked', { rel: 'url', target: 'https://example.test/doc' }),
      ev(11, 'item.linked', { rel: 'url', target: 'notes/plan.md' }),
      ev(12, 'loop.done', { operation: 'build', target: 'https://github.com/o/r/pull/9' }),
      ev(13, 'item.linked', { rel: 'pr', target: 'https://github.com/o/r/pull/9' }),
    ])
    expect(rows.length).toBe(25 + 3)
    expect(rows.filter(one => one.rel === 'item').length).toBe(25)
    const url = rows.find(one => one.target === 'https://example.test/doc')
    expect(url).toEqual({ eventId: 10, rel: 'url', target: 'https://example.test/doc', href: 'https://example.test/doc', copyText: 'https://example.test/doc' })
    // A path under a url link is copyable though it is not a web address.
    expect(rows.find(one => one.target === 'notes/plan.md')).toEqual({ eventId: 11, rel: 'url', target: 'notes/plan.md', href: null, copyText: 'notes/plan.md' })
    // The build's PR and the same PR linked by hand are one row, the earlier event's.
    expect(rows.filter(one => one.target.endsWith('/pull/9')).map(one => one.eventId)).toEqual([12])
    expect(rows.find(one => one.rel === 'item')?.copyText).toBe(null)
  })

  test('links: a link event with no target still draws, as its summary', () => {
    expect(linksOf([ev(1, 'item.linked', { rel: 'pr' })])).toEqual([{ eventId: 1, rel: 'pr', target: 'summary of item.linked 1', href: null, copyText: null }])
  })

  test('elections: the chosen option, the rejected ones, the scope and the quote reference', () => {
    const rows = electionsOf([
      ev(5, 'item.note', { text: 'not an election' }),
      ev(9, 'decision.elected', {
        question: 'Merge now?',
        chosen: 'merge now',
        chosen_description: 'land it',
        rejected: ['wait', 'close it'],
        scope: 'this PR only',
        quote_ref: 8,
        quotes: ['merge now'],
        asked_event_id: 3,
      }),
      ev(7, 'decision.elected', { question: 'Older?', chosen: 'yes' }),
    ])
    expect(rows.map(one => one.eventId)).toEqual([7, 9])
    expect(rows[1]).toMatchObject({
      question: 'Merge now?',
      chosen: 'merge now',
      chosenDescription: 'land it',
      rejected: ['wait', 'close it'],
      scope: 'this PR only',
      quoteRef: 8,
      quotes: ['merge now'],
      askedEventId: 3,
    })
    expect(rows[0]).toMatchObject({ rejected: [], scope: '', quoteRef: null })
    expect(electionsOf([ev(1, 'decision.elected', {})])[0]?.chosen).toBe('summary of decision.elected 1')
  })

  test('decision records: the latest standing and result apply, and a superseded record names its successor', () => {
    const rows = recordsOf([
      ev(20, 'decision.recorded', {
        who: 'Andrew',
        who_kind: 'person',
        relayed_by: 'director',
        standing: 'lean',
        effect: 'ADR accepted',
        tags: [{ type: 'project', id: 'foundry' }],
        verbatim: 'accept it',
        phase: 'close',
        evidence: 'decisions/0001.md',
      }),
      ev(21, 'decision.standing', { decision_event_id: 20, standing: 'settled' }),
      ev(22, 'decision.standing', { decision_event_id: 20, standing: 'superseded', superseded_by: 30 }),
      ev(23, 'decision.result', { decision_event_id: 20, result: 'shipped', evidence: 'org/repo#4' }),
      ev(24, 'decision.standing', { decision_event_id: 999, standing: 'settled' }),
      ev(25, 'decision.recorded', { who: 'x', who_kind: 'role', standing: 'settled', effect: 'second', tags: [], verbatim: 'v', phase: 'plan' }),
    ])
    expect(rows.length).toBe(2)
    expect(rows[0]).toMatchObject({
      eventId: 20,
      who: 'Andrew',
      relayedBy: 'director',
      standing: 'superseded',
      supersededBy: 30,
      effect: 'ADR accepted',
      tags: ['project:foundry'],
      verbatim: 'accept it',
      evidence: 'decisions/0001.md',
      result: 'shipped',
      resultEvidence: 'org/repo#4',
    })
    expect(rows[1]).toMatchObject({ standing: 'settled', supersededBy: null, result: '' })
  })

  test('stop: the latest stamp wins, with its phase, skills and refs', () => {
    expect(stopOf([ev(1, 'item.note', { text: 'x' })])).toBe(null)
    const stop = stopOf([
      ev(30, 'item.stopped', { point: 'newer', phase: 'review', skills: ['review'], refs: ['org/repo#7', 'notes/a.md:3'] }),
      ev(12, 'item.stopped', { point: 'older', phase: 'plan' }),
    ])
    expect(stop).toMatchObject({ eventId: 30, point: 'newer', phase: 'review', skills: ['review'], refs: ['org/repo#7', 'notes/a.md:3'] })
    expect(stopOf([ev(2, 'item.stopped', {})])?.point).toBe('summary of item.stopped 2')
  })

  test('tried: what was tried with its outcome and evidence', () => {
    const rows = triedOf([ev(4, 'item.tried', { what: 'bump', outcome: 'tests red', phase: 'build', evidence: 'logs/1.txt' }), ev(3, 'item.tried', { what: 'first' })])
    expect(rows.map(one => one.what)).toEqual(['first', 'bump'])
    expect(rows[1]).toEqual({ eventId: 4, what: 'bump', outcome: 'tests red', phase: 'build', evidence: 'logs/1.txt' })
  })

  test('reviews: a recorded review and a loop review step, each with its verdict', () => {
    const rows = reviewsOf([
      ev(40, 'review.recorded', { round: 2, verdict: 'changes', findings: ['a', 'b'], reviewer: 'sol', evidence: 'r/2.md' }),
      ev(41, 'loop.done', { operation: 'review', verdict: 'pass', head: '0572e4ba9f', target: 'https://github.com/o/r/pull/133' }),
      ev(42, 'loop.done', { operation: 'merge', verdict: 'pass' }),
    ])
    expect(rows).toEqual([
      { eventId: 40, round: 2, verdict: 'changes', head: '', pr: '', reviewer: 'sol', evidence: 'r/2.md', findings: ['a', 'b'] },
      { eventId: 41, round: null, verdict: 'pass', head: '0572e4ba9f', pr: 'https://github.com/o/r/pull/133', reviewer: '', evidence: '', findings: [] },
    ])
  })

  test('notes: every note in order, the first web address in one is its link', () => {
    const rows = notesOf([ev(6, 'item.note', { text: 'see https://example.test/x now' }), ev(5, 'item.note', { text: 'plain' }), ev(7, 'item.note', {})])
    expect(rows.map(one => one.eventId)).toEqual([5, 6, 7])
    expect(rows[1]?.href).toBe('https://example.test/x')
    expect(rows[0]?.href).toBe(null)
    expect(rows[2]?.text).toBe('summary of item.note 7')
  })

  test('spec: the latest version is the current spec', () => {
    expect(specOf([])).toBe(null)
    const spec = specOf([
      ev(51, 'item.spec', { version: 2, title: 'v2 title', body_md: 'line one\nline two', acceptance: 'it works', size: 'S', merge_class: 'MC-2', source: 'plan.md' }),
      ev(50, 'item.spec', { version: 1, title: 'v1 title', body_md: 'old' }),
    ])
    expect(spec).toEqual({ eventId: 51, version: 2, title: 'v2 title', body: 'line one\nline two', acceptance: 'it works', size: 'S', mergeClass: 'MC-2', source: 'plan.md' })
  })

  test('asks: the options come in full from the ask event, or null when the log holds no such ask', () => {
    const asked = ev(3, 'decision.asked', { question: 'q', options: [{ label: 'A', description: 'first' }, { label: 'B' }, { description: 'no label' }] })
    expect(optionsOf([asked], 3)).toEqual([
      { label: 'A', description: 'first' },
      { label: 'B', description: '' },
    ])
    expect(optionsOf([asked], 4)).toBe(null)
    expect(optionsOf([asked], null)).toBe(null)
    expect(optionsOf([ev(3, 'item.note', { options: [{ label: 'A' }] })], 3)).toBe(null)
  })

  test('header: the mint source and day from the first item.created, the lease end only while claimed', () => {
    const log = [
      ev(2, 'item.state', { status: 'claimed', claim: 'seat', expires_at: '2026-11-07T14:02:00.000Z' }),
      ev(1, 'item.created', { type: 'ticket', title: 't', source: 'roadmaps/x.md:69@abc' }, '2026-10-30T12:00:00Z'),
    ]
    expect(headerOf(log, 'claimed')).toEqual({ source: 'roadmaps/x.md:69@abc', createdAt: '2026-10-30T12:00:00Z', leaseEnds: '2026-11-07T14:02:00.000Z' })
    expect(headerOf(log, 'open').leaseEnds).toBe(null)
    // A later release ends the lease even if the item reads claimed from a stale card.
    expect(headerOf([...log, ev(3, 'item.state', { status: 'open' })], 'claimed').leaseEnds).toBe(null)
    expect(headerOf([], 'open')).toEqual({ source: null, createdAt: null, leaseEnds: null })
    expect(headerLine(headerOf(log, 'claimed'))).toMatch(/^minted Oct (29|30|31) from roadmaps\/x\.md:69@abc · lease ends Nov \d+ \d\d:\d\d$/)
    expect(headerLine({ source: null, createdAt: null, leaseEnds: null })).toBe('')
  })

  test('a payload that is not an object never throws', () => {
    const odd = [{ ...ev(1, 'item.linked', {}), payload: null as never }, { ...ev(2, 'decision.elected', {}), payload: 'x' as never }]
    expect(() => [linksOf(odd), electionsOf(odd), recordsOf(odd), stopOf(odd), triedOf(odd), reviewsOf(odd), notesOf(odd), specOf(odd), headerOf(odd, 'claimed')]).not.toThrow()
  })
})
