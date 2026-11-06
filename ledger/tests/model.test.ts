import { describe, expect, test } from 'claude-code/testing'

import type { Event, Item } from '../types'
import {
  ageOf,
  answeredAsksOf,
  bandOf,
  barLength,
  clockOf,
  countByStatus,
  countsByType,
  cut,
  dailyTouches,
  dayGroups,
  dayOf,
  electionsOf,
  filterDecisions,
  filterItems,
  firstOpenable,
  fit,
  grantOf,
  groupLinks,
  headerLine,
  headerOf,
  isRecommended,
  kindColor,
  kindGroup,
  leaseWords,
  linksOf,
  navBack,
  navOpen,
  navStep,
  needsYou,
  notesOf,
  optionsOf,
  pageCount,
  pageOf,
  parseCommandArgs,
  prShort,
  recordsOf,
  reviewsOf,
  segments,
  sortItems,
  spanOf,
  sparkline,
  specLine,
  specMeta,
  specMoved,
  specOf,
  specsOf,
  stampOf,
  stopOf,
  stripOf,
  ticketOf,
  timelineOf,
  triedOf,
  standingColor,
  standingGlyph,
  statusColor,
  statusGlyph,
  scrollArgs,
  windowOf,
} from '../hooks/model'
import type { Nav } from '../hooks/model'

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
  return { id, kind, actor: 'seat', harness: 'cli', model: null, session: null, idempotencyKey: `key-${id}`, hash: `hash-${id}`, recordedAt, summary: `summary of ${kind} ${id}`, payload }
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
    expect(spec).toEqual({
      eventId: 51,
      recordedAt: '2026-10-30T12:00:00Z',
      version: 2,
      title: 'v2 title',
      body: 'line one\nline two',
      bodyRecorded: true,
      acceptance: 'it works',
      size: 'S',
      mergeClass: 'MC-2',
      source: 'plan.md',
      sourceRev: '',
    })
  })

  test('spec versions: every version, newest first, whatever order the events arrive in', () => {
    const versions = specsOf([
      ev(50, 'item.spec', { version: 1, title: 'a', body_md: 'x' }),
      ev(70, 'item.spec', { version: 3, title: 'c', body_md: 'z' }),
      ev(60, 'item.spec', { version: 2, title: 'b', body_md: 'y' }),
      ev(61, 'item.note', { text: 'not a spec' }),
    ])
    expect(versions.map(one => one.version)).toEqual([3, 2, 1])
    expect(specsOf([])).toEqual([])
  })

  test('spec lines: an earlier version in one line; the current one adds the merge class, the source and its rev', () => {
    const [current] = specsOf([ev(51, 'item.spec', { version: 2, title: 't', body_md: 'b', size: 'M', merge_class: 'MC-2', source: 'plan.md', source_rev: 'abc123' }, '2026-10-30T12:00:00Z')])
    expect(specLine(current as never)).toBe(`v2 · ${dayOf('2026-10-30T12:00:00Z')} · size M · #51`)
    expect(specMeta(current as never, 3)).toBe(`v2 of 3 · ${dayOf('2026-10-30T12:00:00Z')} · size M · MC-2 · source plan.md@abc123 · #51`)
    const [bare] = specsOf([ev(52, 'item.spec', { version: 1, title: 't', body_md: 'b', source_rev: 'def456' })])
    expect(specMeta(bare as never, 1)).toBe(`v1 · ${dayOf('2026-10-30T12:00:00Z')} · rev def456 · #52`)
  })

  test('spec moved: only a claim taken against an older version than the current one', () => {
    const specs = [ev(10, 'item.spec', { version: 1, title: 'a', body_md: 'x' }), ev(20, 'item.spec', { version: 2, title: 'b', body_md: 'y' })]
    expect(specMoved([...specs, ev(15, 'item.state', { status: 'claimed', claim: 's', spec_version: 1 })])).toBe(true)
    expect(specMoved([...specs, ev(25, 'item.state', { status: 'claimed', claim: 's', spec_version: 2 })])).toBe(false)
    expect(specMoved([...specs, ev(15, 'item.state', { status: 'claimed', claim: 's' })])).toBe(false)
    expect(specMoved([...specs, ev(15, 'item.state', { status: 'open', spec_version: 1 })])).toBe(false)
    expect(specMoved([specs[0] as Event, ev(15, 'item.state', { status: 'claimed', claim: 's', spec_version: 1 })])).toBe(false)
    expect(specMoved([])).toBe(false)
  })

  test('spec moved: a restamped or handed-off claim with no stamp is the same claim; a holder change ends the run', () => {
    const specs = [ev(10, 'item.spec', { version: 1, title: 'a', body_md: 'x' }), ev(20, 'item.spec', { version: 2, title: 'b', body_md: 'y' })]
    const stamped = ev(15, 'item.state', { status: 'claimed', claim: 's', spec_version: 1 })
    expect(specMoved([...specs, stamped, ev(25, 'item.state', { status: 'claimed', claim: 's', expires_at: '2026-11-06T00:00:00Z' })])).toBe(true)
    expect(specMoved([...specs, stamped, ev(25, 'item.state', { status: 'claimed', claim: 's' }), ev(26, 'item.state', { status: 'claimed', claim: 's', spec_version: 2 })])).toBe(false)
    expect(specMoved([...specs, stamped, ev(25, 'item.state', { status: 'claimed', claim: 'other' })])).toBe(false)
    expect(specMoved([...specs, stamped, ev(24, 'item.state', { status: 'open' }), ev(25, 'item.state', { status: 'claimed', claim: 's' })])).toBe(false)
  })

  test('spec moved: a claimed state with no holder is not a stamped claim', () => {
    const specs = [ev(10, 'item.spec', { version: 1, title: 'a', body_md: 'x' }), ev(20, 'item.spec', { version: 2, title: 'b', body_md: 'y' })]
    expect(specMoved([...specs, ev(15, 'item.state', { status: 'claimed', spec_version: 1 })])).toBe(false)
  })

  test('spec moved: a release ends the run even when it carries the same claim', () => {
    const specs = [ev(10, 'item.spec', { version: 1, title: 'a', body_md: 'x' }), ev(20, 'item.spec', { version: 2, title: 'b', body_md: 'y' })]
    const stamped = ev(15, 'item.state', { status: 'claimed', claim: 's', spec_version: 1 })
    const released = ev(22, 'item.state', { status: 'released', claim: 's' })
    expect(specMoved([...specs, stamped, released, ev(25, 'item.state', { status: 'claimed', claim: 's' })])).toBe(false)
  })

  test('spec body: a missing, empty or non-string body reads as not recorded and never throws', () => {
    const [none, number, empty, fine] = [
      ev(4, 'item.spec', { version: 4, title: 'd', body_md: 'ok' }),
      ev(3, 'item.spec', { version: 3, title: 'c', body_md: '' }),
      ev(2, 'item.spec', { version: 2, title: 'b', body_md: 42 }),
      ev(1, 'item.spec', { version: 1, title: 'a' }),
    ].map(one => specsOf([one])[0])
    expect([none?.bodyRecorded, number?.bodyRecorded, empty?.bodyRecorded, fine?.bodyRecorded]).toEqual([true, false, false, false])
    expect(none?.body).toBe('ok')
    expect(number?.body).toBe('')
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
    // A heartbeat after the claim renews the lease; the latest stamp wins, a shorter one or one before the claim does not.
    const renewed = [...log, ev(4, 'item.progress', { expires_at: '2026-11-07T18:02:00.000Z' }), ev(5, 'item.progress', { expires_at: '2026-11-07T16:00:00.000Z' }), ev(6, 'item.progress', { note: 'no stamp' })]
    expect(headerOf(renewed, 'claimed').leaseEnds).toBe('2026-11-07T18:02:00.000Z')
    expect(headerOf([ev(1, 'item.progress', { expires_at: '2026-12-01T00:00:00.000Z' }), ...log], 'claimed').leaseEnds).toBe('2026-11-07T14:02:00.000Z')
    // A release after the renewal still ends the lease; a renewal from an earlier claim does not carry into a new one.
    expect(headerOf([...renewed, ev(7, 'item.state', { status: 'open' })], 'claimed').leaseEnds).toBe(null)
    expect(headerOf([...renewed, ev(7, 'item.state', { status: 'claimed', claim: 'seat2', expires_at: '2026-11-08T09:00:00.000Z' })], 'claimed').leaseEnds).toBe('2026-11-08T09:00:00.000Z')
    expect(headerOf([], 'open')).toEqual({ source: null, createdAt: null, leaseEnds: null })
    expect(headerLine(headerOf(log, 'claimed'))).toMatch(/^minted Oct (29|30|31) from roadmaps\/x\.md:69@abc · lease ends Nov \d+ \d\d:\d\d$/)
    expect(headerLine({ source: null, createdAt: null, leaseEnds: null })).toBe('')
  })

  test('a payload that is not an object never throws', () => {
    const odd = [{ ...ev(1, 'item.linked', {}), payload: null as never }, { ...ev(2, 'decision.elected', {}), payload: 'x' as never }]
    expect(() => [linksOf(odd), electionsOf(odd), recordsOf(odd), stopOf(odd), triedOf(odd), reviewsOf(odd), notesOf(odd), specOf(odd), headerOf(odd, 'claimed')]).not.toThrow()
  })
})

const T0 = Date.parse('2026-10-30T12:00:00Z')

function at(minutes: number): string {
  return new Date(T0 + minutes * 60_000).toISOString()
}

describe('the item screen layout: width bands, leases and spans', () => {
  test('the three width bands, and a width outside them clamps to the nearest', () => {
    expect([bandOf(69), bandOf(70), bandOf(119), bandOf(120)]).toEqual(['narrow', 'standard', 'standard', 'wide'])
    expect([bandOf(0), bandOf(-4), bandOf(100_000)]).toEqual(['narrow', 'narrow', 'wide'])
    expect(bandOf(Number.NaN)).toBe('standard')
  })

  test('a span reads as a person says it', () => {
    expect([spanOf(45_000), spanOf(17 * 60_000), spanOf(2 * 3_600_000), spanOf(3 * 86_400_000), spanOf(-5)]).toEqual(['45s', '17m', '2h', '3d', '0s'])
  })

  test('a lease reads in words, and a lease past its end says it ended', () => {
    const now = Date.parse('2026-11-07T12:00:00Z')
    expect(leaseWords('2026-11-07T14:00:00Z', now)).toEqual({ text: 'lease ends in 2h', ended: false })
    expect(leaseWords('2026-11-07T09:00:00Z', now)).toEqual({ text: 'lease ended 3h ago', ended: true })
    expect(leaseWords(null, now)).toBe(null)
    expect(leaseWords('not a time', now)).toBe(null)
  })

  test('clock and stamp', () => {
    expect(clockOf('not a time', false)).toBe('?')
    expect(clockOf(at(0), false)).toMatch(/^\d\d:\d\d$/)
    expect(clockOf(at(0), true)).toMatch(/^\d\d:\d\d:\d\d$/)
    expect(stampOf(at(0))).toMatch(/^Oct \d+ \d\d:\d\d:\d\d$/)
  })
})

describe('the timeline', () => {
  const log = [
    ev(1, 'item.created', { type: 'ticket', title: 't' }, at(-2 * 24 * 60)),
    ev(10, 'loop.intent', { operation: 'build', operation_id: 'b1' }, at(0)),
    ev(11, 'loop.done', { operation: 'build', operation_id: 'b1', intent_event_id: 10, target: 'https://github.com/o/r/pull/133' }, at(17)),
    ev(12, 'loop.intent', { operation: 'review', operation_id: 'r1', head: '3c0d5aa1122334455' }, at(20)),
    ev(13, 'loop.done', { operation: 'review', operation_id: 'r1', intent_event_id: 12, verdict: 'changes', head: '3c0d5aa1122334455' }, at(25)),
    ev(14, 'loop.intent', { operation: 'build', operation_id: 'b2' }, at(30)),
    ev(15, 'decision.elected', { question: 'q', chosen: 'c' }, at(31)),
    ev(16, 'item.note', { text: 'a note' }, at(32)),
    ev(17, 'session.opened', { purpose: 'x' }, at(33)),
  ]

  test('a loop intent and its completion fold into one row with the round and the elapsed time', () => {
    const rows = timelineOf(log, 'all', 'oldest')
    expect(rows.map(row => row.id)).toEqual([1, 11, 13, 14, 15, 16, 17])
    const build = rows.find(row => row.id === 11)!
    expect(build).toMatchObject({ summary: 'build r1 → PR #133', elapsed: '17m', folded: true })
    expect(build.events.map(one => one.id)).toEqual([10, 11])
    expect(rows.find(row => row.id === 13)).toMatchObject({ summary: 'review r1 on 3c0d5aa → changes', elapsed: '5m' })
    // An intent with no completion yet stays a row of its own, unfolded.
    expect(rows.find(row => row.id === 14)).toMatchObject({ folded: false, elapsed: null })
  })

  test('a completion whose intent is not in the list stays a row, and a second completion does not steal the intent', () => {
    const lone = timelineOf([ev(5, 'loop.done', { operation: 'merge', operation_id: 'm', intent_event_id: 99, head: 'abcdef0123' }, at(0))], 'all', 'newest')
    expect(lone).toHaveLength(1)
    expect(lone[0]).toMatchObject({ id: 5, folded: false })
    const twice = timelineOf(
      [
        ev(1, 'loop.intent', { operation: 'merge', operation_id: 'm' }, at(0)),
        ev(2, 'loop.done', { operation: 'merge', operation_id: 'm', intent_event_id: 1, head: 'abcdef0123' }, at(1)),
        ev(3, 'loop.done', { operation: 'merge', operation_id: 'm', intent_event_id: 1, head: 'abcdef0123' }, at(2)),
      ],
      'all',
      'oldest',
    )
    expect(twice.map(row => [row.id, row.folded])).toEqual([[2, true], [3, false]])
  })

  test('newest first by default, oldest first on the toggle', () => {
    expect(timelineOf(log, 'all', 'newest').map(row => row.id)).toEqual([17, 16, 15, 14, 13, 11, 1])
    expect(timelineOf(log, 'all', 'oldest').map(row => row.id)).toEqual([1, 11, 13, 14, 15, 16, 17])
  })

  test('the kind filter narrows by group, and every kind belongs to one', () => {
    expect(timelineOf(log, 'decisions', 'oldest').map(row => row.id)).toEqual([15])
    expect(timelineOf(log, 'notes', 'oldest').map(row => row.id)).toEqual([16])
    expect(timelineOf(log, 'state', 'oldest').map(row => row.id)).toEqual([1])
    expect(timelineOf(log, 'loop', 'oldest').map(row => row.id)).toEqual([11, 13, 14])
    expect(timelineOf(log, 'provenance', 'oldest').map(row => row.id)).toEqual([17])
    expect(kindGroup('some.future.kind')).toBe('provenance')
    expect(kindGroup('item.linked')).toBe('state')
    expect(kindGroup('outside.recorded')).toBe('provenance')
  })

  test('day groups keep the order given and count events, a folded pair being two', () => {
    const groups = dayGroups(timelineOf(log, 'all', 'newest'))
    expect(groups.map(group => [group.day, group.events])).toEqual([
      [dayOf(at(0)), 8],
      [dayOf(at(-2 * 24 * 60)), 1],
    ])
    expect(groups[0]!.rows.map(row => row.id)).toEqual([17, 16, 15, 14, 13, 11])
  })

  test('the window draws every row when there are 40 or fewer, and a margin around the pane past that', () => {
    expect(windowOf(40, 500, 30, 0, 5)).toEqual({ from: 0, to: 40 })
    // 100 rows, 10 lines of body above them, the pane scrolled to line 60 and 30 rows tall, a margin of 5.
    expect(windowOf(100, 60, 30, 10, 5)).toEqual({ from: 45, to: 85 })
    // Scrolled past the end, the last rows; above the first row, the first.
    expect(windowOf(100, 5000, 30, 10, 5)).toEqual({ from: 94, to: 100 })
    expect(windowOf(100, 0, 30, 10, 5)).toEqual({ from: 0, to: 35 })
  })
})

describe('the strip, navigation, links and the ticket pass', () => {
  test('a strip button scrolls its section header to the top of the pane', () => {
    expect(scrollArgs('ledger', 'section-timeline')).toEqual({ in: 'ledger', to: { key: 'section-timeline' }, block: 'start' })
  })

  test('the strip counts what is there, shows a dash when empty and a question mark when the events were unread', () => {
    const none = stripOf([])
    expect(none.map(entry => `${entry.label}:${entry.hotkey}:${entry.count}`)).toEqual(['Now:n:', 'Decisions:e:–', 'Links:l:–', 'Timeline:t:–', 'Spec:p:–'])
    const some = stripOf([
      ev(1, 'decision.elected', { question: 'q', chosen: 'c' }),
      ev(2, 'decision.recorded', { who: 'w', effect: 'e' }),
      ev(3, 'item.linked', { rel: 'url', target: 'https://x.test' }),
      ev(4, 'item.spec', { version: 1 }),
      ev(5, 'item.spec', { version: 2 }),
    ])
    expect(some.map(entry => entry.count)).toEqual(['', '2', '1', '5', '2'])
    expect(stripOf(null).map(entry => entry.count)).toEqual(['', '?', '?', '?', '?'])
  })

  test('the ticket section is in the strip only when the item carries framed ticket notes', () => {
    expect(stripOf([ev(1, 'item.note', { text: 'plain' })]).some(entry => entry.section === 'ticket')).toBe(false)
    const framed = [ev(1, 'item.note', { text: 'ticket-review:v2 {"round":1,"verdict":"pass","reviewer":"fresh"}' })]
    expect(stripOf(framed).find(entry => entry.section === 'ticket')).toMatchObject({ hotkey: 'g', count: '1' })
  })

  test('ticket notes: readable frames are summarised, an unreadable one is kept and marked', () => {
    const notes = ticketOf([
      ev(1, 'item.note', { text: 'ticket-plan:v2 {"revision":1,"criteria":["a","b"]}' }),
      ev(2, 'item.note', { text: 'ticket-decision:v2 {"gate":"plan","plan_revision":1,"who":"the person","verbatim":"Go"}' }),
      ev(3, 'item.note', { text: 'ticket-review:v2 {"round":1,"verdict":"pass","reviewer":"fresh"}' }),
      ev(4, 'item.note', { text: 'ticket-plan:v3 {not json' }),
      ev(5, 'item.note', { text: 'ticket-other:v2 {}' }),
      ev(6, 'item.note', { text: 'plain' }),
    ])
    expect(notes.map(one => [one.eventId, one.type, one.readable, one.text])).toEqual([
      [1, 'plan', true, 'plan r1 · 2 criteria'],
      [2, 'decision', true, 'plan go r1 the person "Go"'],
      [3, 'review', true, 'review r1 pass · fresh'],
      [4, 'plan', false, 'unreadable ticket record (v3)'],
    ])
  })

  test('opening an item from a list remembers the list; from another item it pushes the history', () => {
    const list: Nav = { screen: 'items', itemId: null, history: [], siblings: [] }
    expect(navOpen(list, 'A', ['A', 'B', 'C'])).toEqual({ history: [], siblings: ['A', 'B', 'C'] })
    const onA: Nav = { screen: 'item', itemId: 'A', history: [], siblings: ['A', 'B', 'C'] }
    expect(navOpen(onA, 'X', null)).toEqual({ history: ['A'], siblings: ['A', 'B', 'C'] })
    expect(navOpen({ ...onA, itemId: 'X', history: ['A'] }, 'Y', null).history).toEqual(['A', 'X'])
    // Reopening the item on screen changes nothing; a list opened later starts a fresh history.
    expect(navOpen(onA, 'A', null)).toEqual({ history: [], siblings: ['A', 'B', 'C'] })
    expect(navOpen({ ...onA, screen: 'search', history: ['Q'] }, 'B', ['B']).history).toEqual([])
  })

  test('a list that names an item twice steps past it, not back onto it', () => {
    const opened = navOpen({ screen: 'decisions', itemId: null, history: [], siblings: [] }, 'A1', ['A1', 'A1', 'L1', 'A1', 'L1'])
    expect(opened.siblings).toEqual(['A1', 'L1'])
    const nav: Nav = { screen: 'item', itemId: 'A1', history: [], siblings: opened.siblings }
    expect(navStep(nav, 1)).toBe('L1')
    expect(navStep({ ...nav, itemId: 'L1' }, -1)).toBe('A1')
    // Opening a neighbour from inside an item dedupes the new list too.
    expect(navOpen(nav, 'X', ['X', 'X', 'Y']).siblings).toEqual(['X', 'Y'])
    expect(navOpen({ ...nav, itemId: 'A1' }, 'A1', ['B', 'B']).siblings).toEqual(['B'])
  })

  test('the history is bounded', () => {
    const deep: Nav = { screen: 'item', itemId: 'N', history: Array.from({ length: 50 }, (_, index) => `h${index}`), siblings: [] }
    const next = navOpen(deep, 'M', null)
    expect(next.history).toHaveLength(50)
    expect(next.history[49]).toBe('N')
    expect(next.history[0]).toBe('h1')
  })

  test('previous and next step along the list the item came from, and stop at its ends', () => {
    const nav: Nav = { screen: 'item', itemId: 'B', history: [], siblings: ['A', 'B', 'C'] }
    expect([navStep(nav, -1), navStep(nav, 1)]).toEqual(['A', 'C'])
    expect(navStep({ ...nav, itemId: 'A' }, -1)).toBe(null)
    expect(navStep({ ...nav, itemId: 'C' }, 1)).toBe(null)
    expect(navStep({ ...nav, itemId: 'Z' }, 1)).toBe(null)
    expect(navStep({ ...nav, siblings: [] }, 1)).toBe(null)
  })

  test('back pops the history', () => {
    expect(navBack({ screen: 'item', itemId: 'X', history: ['A', 'B'], siblings: [] })).toEqual({ id: 'B', history: ['A'] })
    expect(navBack({ screen: 'item', itemId: 'X', history: [], siblings: [] })).toBe(null)
  })

  test('the first PR link, else the first url, is what o takes', () => {
    const rows = linksOf([ev(1, 'item.linked', { rel: 'url', target: 'notes/a.md' }), ev(2, 'item.linked', { rel: 'pr', target: 'https://github.com/o/r/pull/7' })])
    expect(firstOpenable(rows)).toEqual({ text: 'https://github.com/o/r/pull/7', label: 'PR link' })
    expect(firstOpenable(rows.filter(one => one.rel === 'url'))).toEqual({ text: 'notes/a.md', label: 'url' })
    expect(firstOpenable([])).toBe(null)
  })

  test('links group by relation in the design order, and a pull request reads as repo#number', () => {
    const rows = linksOf([
      ev(1, 'item.linked', { rel: 'item', target: 'X' }),
      ev(2, 'item.linked', { rel: 'blocks', target: 'Y' }),
      ev(3, 'item.linked', { rel: 'odd', target: 'Z' }),
      ev(4, 'item.linked', { rel: 'url', target: 'https://x.test' }),
      ev(5, 'item.linked', { rel: 'pr', target: 'https://github.com/o/r/pull/7' }),
      ev(6, 'item.linked', { rel: 'item', target: 'X2' }),
    ])
    expect(groupLinks(rows).map(one => one.target)).toEqual(['https://github.com/o/r/pull/7', 'https://x.test', 'X', 'X2', 'Y', 'Z'])
    expect(prShort('https://github.com/o/r/pull/7')).toBe('o/r#7')
    expect(prShort('not a pr')).toBe('not a pr')
  })

  test('an ask answered is paired to its election by event id or by question id; a grant election names its grant', () => {
    const log = [
      ev(1, 'decision.asked', { question: 'by id?', options: [{ label: 'a' }] }),
      ev(2, 'decision.asked', { question: 'by key?', question_id: 'grant:g1', options: [{ label: 'a' }] }),
      ev(3, 'decision.asked', { question: 'still open?', options: [{ label: 'a' }] }),
      ev(4, 'decision.elected', { question: 'by id?', chosen: 'yes', asked_event_id: 1 }),
      ev(5, 'decision.elected', { question: 'by key?', chosen: 'no', question_id: 'grant:g1' }),
    ]
    expect(answeredAsksOf(log)).toEqual([
      { askedEventId: 2, question: 'by key?', chosen: 'no', electionId: 5 },
      { askedEventId: 1, question: 'by id?', chosen: 'yes', electionId: 4 },
    ])
    expect(grantOf(log, 5)).toBe('grant:g1')
    expect(grantOf(log, 4)).toBe('')
    const kinds = [ev(6, 'decision.elected', { question: 'c', chosen: 'y', question_id: 'countersign:c1' }), ev(7, 'decision.elected', { question: 'r', chosen: 'y', question_id: 'rung:r2' }), ev(8, 'decision.elected', { question: 'o', chosen: 'y', question_id: 'other:o1' })]
    expect([grantOf(kinds, 6), grantOf(kinds, 7), grantOf(kinds, 8)]).toEqual(['countersign:c1', 'rung:r2', ''])
    expect(electionsOf(log)[1]!.questionId).toBe('grant:g1')
  })

  test('the recommended option is the one named by letter or by label', () => {
    expect([isRecommended({ label: 'Ship', description: '' }, 0, 'A'), isRecommended({ label: 'Wait', description: '' }, 1, 'A'), isRecommended({ label: 'Wait', description: '' }, 1, 'wait'), isRecommended({ label: 'Wait', description: '' }, 1, '')]).toEqual([true, false, true, false])
  })

  test('nothing here throws on a payload that is not an object', () => {
    const odd = [{ ...ev(1, 'loop.done', {}), payload: null as never }, { ...ev(2, 'loop.intent', {}), payload: 'x' as never }, { ...ev(3, 'item.note', {}), payload: [] as never }, ev(4, 'decision.asked', {})]
    expect(() => [timelineOf(odd, 'all', 'newest'), dayGroups(timelineOf(odd, 'all', 'oldest')), stripOf(odd), ticketOf(odd), answeredAsksOf(odd), groupLinks(linksOf(odd))]).not.toThrow()
  })
})
