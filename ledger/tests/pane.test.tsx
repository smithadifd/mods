import { describe, expect, mock, test } from 'claude-code/testing'
import type { MockClock, TestBody } from 'claude-code/testing'

import type { View } from '../types'
import { READ_VERBS, parseCard, parseEvents } from '../hooks/cli'
import { draw } from '../hooks/screens'
import type { Act, Ui } from '../hooks/screens'

const PANE = {
  plugin: 'ledger',
  component: 'Pane',
  requestId: 'ledger',
  props: {
    title: 'Ledger',
    isFocused: false,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

type Ran = { exitCode: number; stdout: string; stderr: string; isStdoutTruncated: boolean; isStderrTruncated: boolean }

function ok(data: unknown): Ran {
  return { exitCode: 0, stdout: JSON.stringify({ ok: true, data, error: null }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
}

function refused(code: string, message: string): Ran {
  return { exitCode: 1, stdout: JSON.stringify({ ok: false, data: null, error: { code, message } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
}

function row(id: string, type: string, status: string, updated: string, created = updated, claim: string | null = null): Record<string, unknown> {
  return { item_id: id, type, title: `title of ${id}`, status, owner: null, claim, created_at: created, updated_at: updated }
}

const ITEMS = [
  row('A1', 'ticket', 'open', '2026-11-05T10:00:00Z'),
  row('B2', 'ticket', 'blocked', '2026-11-01T10:00:00Z'),
  row('C3', 'ticket', 'closed', '2026-11-04T10:00:00Z'),
  row('D1', 'decision', 'open', '2026-11-03T10:00:00Z', '2026-10-01T10:00:00Z'),
  row('D2', 'decision', 'open', '2026-11-03T10:00:00Z', '2026-10-20T10:00:00Z'),
  row('E4', 'ticket', 'claimed', '2026-11-05T09:00:00Z', '2026-11-05T09:00:00Z', 'seat-1'),
]

const CARD = {
  item_id: 'A1',
  type: 'ticket',
  title: 'title of A1',
  status: 'open',
  owner: null,
  claim: null,
  next_step: 'Build it.',
  open_questions: [],
  blockers: [],
  notes: [{ event_id: 2, text: 'a note on A1' }],
  progress: [],
  links: [{ rel: 'pr', target: 'https://github.com/o/r/pull/7' }],
  decisions: [],
  decision_records: [],
  tried: [],
  stop: null,
  footer: 'This card is a projection; the events are the authority (ledger export-item -- A1)',
  revision: { id: 2, hash: 'abc' },
  source_event_ids: [1, 2],
}

const LOG = {
  completeness: { events_on_item: 3, events_returned: 3, events_decayed: 0 },
  events: [
    { id: 1, kind: 'item.created', actor: 'seat-1', harness: 'claude-code', model: null, recorded_at: '2026-11-05T09:00:00Z', payload: { type: 'ticket', title: 'title of A1' } },
    { id: 2, kind: 'item.note', actor: 'seat-1', harness: 'claude-code', model: null, recorded_at: '2026-11-05T10:00:00Z', payload: { text: 'a note on A1' } },
    { id: 3, kind: 'item.linked', actor: 'seat-1', harness: 'claude-code', model: null, recorded_at: '2026-11-05T10:30:00Z', payload: { rel: 'pr', target: 'https://github.com/o/r/pull/7' } },
  ],
}

const DECISIONS = {
  decisions: [
    {
      decision_event_id: 21587,
      item_id: 'D1',
      effect: 'ADR 1 accepted',
      who: 'Owner',
      who_kind: 'person',
      standing: 'settled',
      verbatim: 'no quote on file',
      recorded_at: '2026-11-01T19:42:55Z',
      tags: [{ type: 'project', id: 'foundry' }],
      superseded_by: null,
      result: null,
      evidence: null,
      phase: 'close',
    },
  ],
}

/** The ledger as the test's process runner answers it, keyed by the verb in argv. */
function answer(argv: readonly string[]): Ran {
  const verb = argv.find(word => (READ_VERBS as readonly string[]).includes(word))
  switch (verb) {
    case 'doctor':
      return ok({ path: '/db/home.db', schema_version: 9, search: { status: 'current', new_events: 0 }, expired_claims: { status: 'ok', items: [] } })
    case 'query':
      return ok({ items: ITEMS, limit: 5000, truncated: false })
    case 'ready':
      return ok({ items: [ITEMS[0]], limit: 5000, truncated: false })
    case 'decisions':
      return ok(DECISIONS)
    case 'card':
      return argv.includes('A1') ? ok(CARD) : refused('not_found', `no item ${argv[argv.length - 1]}`)
    case 'export-item':
      return argv.includes('A1') ? ok(LOG) : refused('not_found', `no item ${argv[argv.length - 1]}`)
    case 'search':
      return ok({
        cards: [
          { id: 'EN1', item_id: 'EN1', doc_type: 'item', title: 'the merge train', snippet: 'ticket closed', date: '2026-10-20T01:52:47Z', score: 1.3, status: 'closed' },
          { id: 'event:9', item_id: null, doc_type: 'utterance', title: 'words about the train', snippet: 'the [train]', date: '2026-11-05T12:14:56Z', score: 8.8 },
        ],
      })
    case 'verify':
      return ok({ events: 3 })
    default:
      return refused('unknown', `unknown verb in ${argv.join(' ')}`)
  }
}

type On = Parameters<TestBody>[1]

/** `/ledger <args>` as the person types it. */
function command(args: string) {
  return { command: 'ledger', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
}

/** The engine beneath the plugin: a clock, a command registry, a pane, a session, and a ledger that answers. */
function engine(on: On, seen: string[][], reply: (argv: readonly string[]) => Ran = answer, copies: string[] = []): MockClock {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'ledger' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.copy', (_, e) => {
    copies.push(e.text)
    return { value: { isCopied: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => {
    seen.push([...e.argv])
    return { value: reply(e.argv) }
  })
  return clock
}

describe('the ledger pane', () => {
  test('home draws the counts, the bars and the tiles, on every surface', async ($, on) => {
    const seen: string[][] = []
    engine(on, seen)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command(''))

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: 'refresh' })

      expect((await ui.find({ type: 'Text', text: /schema 9/ }))?.text).toContain('/db/home.db · schema 9')
      expect((await ui.find({ key: 'tile-ready' }))?.text).toBe('1 ready')
      expect((await ui.find({ key: 'tile-blocked' }))?.text).toBe('1 blocked')
      expect((await ui.find({ key: 'tile-decisions' }))?.text).toBe('2 open decisions')
      expect((await ui.find({ key: 'tile-claimed' }))?.text).toBe('1 claimed')
      expect(await ui.find({ key: 'tile-expired' })).toBe(undefined)
      // The ticket bar is the widest; the decision bar is scaled to it.
      expect((await ui.find({ key: 'type-button-ticket' }))?.text.trim()).toBe('ticket')
      expect((await ui.findAll({ type: 'Text', text: /█/ })).length).toBeGreaterThan(1)
      expect((await ui.find({ type: 'Text', text: /2 open/ }))?.text).toContain('2 open')
      expect((await ui.find({ key: 'claim-E4' }))?.text).toContain('seat-1')
      await ui.unmount()
    }
  })

  test('the pane runs read verbs only', async ($, on) => {
    const seen: string[][] = []
    engine(on, seen)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('A1'))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'refresh' })
    await ui.press({ key: 'tab-home' })
    await ui.press({ key: 'verify' })

    expect(seen.length).toBeGreaterThan(4)
    for (const argv of seen) {
      expect(argv[0]).toBe('ledger')
      expect(argv[1]).toBe('--json')
      expect((READ_VERBS as readonly string[]).includes(argv[2] ?? '')).toBe(true)
      for (const write of ['new', 'note', 'state', 'claim', 'elect', 'append', 'restore']) expect(argv).not.toContain(write)
    }
    await ui.unmount()
  })

  test('a tile lists the items under its filter, and a row opens the item', async ($, on) => {
    engine(on, [])
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command(''))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'refresh' })

    await ui.press({ key: 'tile-blocked' })
    expect((await ui.find({ key: 'status' }))?.props.value).toBe('blocked')
    expect((await ui.find({ key: 'row-B2' }))?.text).toContain('title of B2')
    expect(await ui.find({ key: 'row-A1' })).toBe(undefined)

    await ui.select({ key: 'status', value: 'all' })
    expect((await ui.find({ type: 'Text', text: /6 items/ }))?.text).toContain('6 items')
    // Claimed first, then open, blocked, closed.
    const rows = await ui.findAll({ type: 'Button', text: /title of/ })
    expect(rows.map(one => one.key)).toEqual(['row-E4', 'row-A1', 'row-D1', 'row-D2', 'row-B2', 'row-C3'])
    // Each row's status is told by its glyph, not by its color alone.
    expect(rows.map(one => one.text.trim().charAt(0))).toEqual(['◆', '●', '●', '●', '✖', '○'])

    await ui.press({ key: 'row-A1' })
    expect((await ui.find({ type: 'Text', text: /^Build it\.$/ }))?.text).toBe('Build it.')
    expect((await ui.find({ type: 'Text', text: /a note on A1/ }))?.text).toContain('a note on A1')
    expect((await ui.find({ type: 'Link' }))?.props.href).toBe('https://github.com/o/r/pull/7')
    expect((await ui.find({ type: 'Text', text: /3 events/ }))?.text).toContain('3 events')
    expect((await ui.findAll({ type: 'Text', text: /^item\.(created|note|linked)\s*$/ })).length).toBe(3)
    expect((await ui.find({ type: 'Text', text: /projection/ }))?.text).toContain('the events are the authority')

    await ui.press({ key: 'back' })
    expect((await ui.find({ key: 'row-A1' }))?.text).toContain('title of A1')
    await ui.unmount()
  })

  test('needs-you puts the oldest open decision first and the blocked item after', async ($, on) => {
    engine(on, [])
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('needs'))
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    await ui.press({ key: 'refresh' })

    const decisions = await ui.findAll({ type: 'Button', text: /title of D/ })
    expect(decisions.map(one => one.key)).toEqual(['decision-D1', 'decision-D2'])
    expect((await ui.find({ key: 'blocked-B2' }))?.text).toContain('title of B2')
    expect((await ui.find({ key: 'claimed-E4' }))?.text).toContain('seat-1')
    expect((await ui.find({ type: 'Text', text: /No claim has outlived/ }))?.text).toContain('No claim has outlived its lease.')
    await ui.unmount()
  })

  test('a decision row expands to the words it rests on', async ($, on) => {
    engine(on, [])
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('decisions'))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'refresh' })

    expect((await ui.find({ key: 'decision-row-21587' }))?.text).toContain('ADR 1 accepted')
    expect(await ui.find({ type: 'Text', text: /no quote on file/ })).toBe(undefined)
    await ui.press({ key: 'decision-row-21587' })
    expect((await ui.find({ type: 'Text', text: /no quote on file/ }))?.text).toBe('no quote on file')
    expect((await ui.find({ type: 'Text', text: /project:foundry/ }))?.text).toContain('phase close')
    await ui.select({ key: 'standing', value: 'lean' })
    expect((await ui.find({ type: 'Text', text: /0 decisions/ }))?.text).toContain('0 decisions')
    await ui.unmount()
  })

  test('the search field asks the ledger and lists the hits; an item hit opens', async ($, on) => {
    const seen: string[][] = []
    engine(on, seen)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('search'))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'refresh' })

    await ui.input({ key: 'query', text: 'merge train' })
    expect(seen.some(argv => argv.includes('search') && argv.includes('merge') && argv.includes('train'))).toBe(true)
    expect((await ui.find({ type: 'Text', text: /2 results/ }))?.text).toContain('2 results for "merge train"')
    expect((await ui.find({ key: 'hit-open-EN1' }))?.text).toContain('the merge train')
    expect((await ui.find({ type: 'Text', text: /words about the train/ }))?.text).toContain('words about the train')
    await ui.unmount()
  })

  test('words typed after the command search; one unknown word falls back to a search', async ($, on) => {
    const seen: string[][] = []
    engine(on, seen)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('ZZ-9'))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'refresh' })
    expect(seen.some(argv => argv.includes('card') && argv.includes('ZZ-9'))).toBe(true)
    expect(seen.find(argv => argv.includes('card'))?.slice(-2)).toEqual(['--', 'ZZ-9'])
    expect(seen.find(argv => argv.includes('export-item'))?.slice(-2)).toEqual(['--', 'ZZ-9'])
    expect(seen.some(argv => argv.includes('search') && argv.includes('ZZ-9'))).toBe(true)
    expect((await ui.find({ key: 'query' }))?.props.value).toBe('ZZ-9')
    await ui.unmount()
  })

  test('search words follow a --, so a word that starts with a dash is never read as a flag', async ($, on) => {
    const seen: string[][] = []
    engine(on, seen)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('search'))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'refresh' })
    await ui.input({ key: 'query', text: '--db /elsewhere.db -x merge' })
    const argv = seen.find(one => one.includes('search') && one.includes('-x'))
    expect(argv).toBeDefined()
    expect(argv!.slice(argv!.indexOf('--limit') + 2)).toEqual(['--', '--db', '/elsewhere.db', '-x', 'merge'])
    await ui.unmount()
  })

  test('the timer re-reads every screen but Search, where a re-read would clear the typing', async ($, on) => {
    const seen: string[][] = []
    const clock = engine(on, seen)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('merge train'))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /results for/ }))?.text).toContain('"merge train"')

    const onSearch = seen.length
    await clock.advance(60_000)
    expect(seen.length).toBe(onSearch)

    await ui.press({ key: 'tab-home' })
    const onHome = seen.length
    await clock.advance(60_000)
    expect(seen.length).toBeGreaterThan(onHome)
    expect(seen.slice(onHome).some(argv => argv.includes('doctor'))).toBe(true)
    await ui.unmount()
  })

  test('verify shows the chain result on Home', async ($, on) => {
    engine(on, [])
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command(''))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'refresh' })
    expect((await ui.find({ type: 'Text', text: /not verified/ }))?.text).toBe('not verified this session')
    await ui.press({ key: 'verify' })
    expect((await ui.find({ type: 'Text', text: /ok, 3 events/ }))?.text).toContain('● ok, 3 events')
    await ui.unmount()
  })

  test('a missing database shows the quick start, not an error', async ($, on) => {
    engine(on, [], argv => (argv.includes('doctor') ? refused('refused', 'database does not exist: /db/home.db') : answer(argv)))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command(''))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'refresh' })
    expect((await ui.find({ type: 'Text', text: /No ledger database yet/ }))?.text).toBe('No ledger database yet')
    expect((await ui.find({ type: 'Code' }))?.props.language).toBe('sh')
    expect((await ui.findAll({ type: 'Text' })).filter(one => one.props.color === 'error')).toEqual([])
    await ui.unmount()
  })

  test('a database that disappears after a read shows the quick start alone, not stale rows', async ($, on) => {
    let gone = false
    engine(on, [], argv => (gone && argv.includes('doctor') ? refused('refused', 'database does not exist: /db/home.db') : answer(argv)))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('items'))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'refresh' })
    expect(await ui.find({ key: 'row-A1' })).toBeDefined()
    gone = true
    await ui.press({ key: 'refresh' })
    expect((await ui.find({ type: 'Text', text: /No ledger database yet/ }))?.text).toBe('No ledger database yet')
    expect(await ui.find({ key: 'row-A1' })).toBe(undefined)
    await ui.unmount()
  })

  test('an expired claim with the longest id on Needs you is drawn in full', async ($, on) => {
    const doctor = { path: '/db/home.db', schema_version: 9, search: { status: 'current', new_events: 0 }, expired_claims: { status: 'expired', items: [{ item_id: 'LONGITEM-123', holder: 'seat-9', expires_at: '2026-11-05T00:00:00Z' }] } }
    engine(on, [], argv => (argv.includes('doctor') ? ok(doctor) : answer(argv)))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('needs'))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'refresh' })
    expect((await ui.find({ key: 'expired-LONGITEM-123' }))?.text).toContain('LONGITEM-123')
    await ui.unmount()
  })

  test('an expired claim opened from Needs you steps to the next expired claim', async ($, on) => {
    const doctor = { path: '/db/home.db', schema_version: 9, search: { status: 'current', new_events: 0 }, expired_claims: { status: 'expired', items: [{ item_id: 'A1', holder: 'seat-9', expires_at: '2026-11-05T00:00:00Z' }, { item_id: 'L1', holder: 'seat-8', expires_at: '2026-11-05T00:00:00Z' }] } }
    engine(on, [], argv => (argv.includes('doctor') ? ok(doctor) : loopReply()(argv)))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('needs'))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'refresh' })
    await ui.press({ key: 'expired-A1' })
    expect(await ui.find({ key: 'prev-item' })).toBe(undefined)
    expect((await ui.find({ key: 'next-item' }))?.props.hotkey).toBe('f')
    await ui.unmount()
  })

  test('a decision opened from the Decisions list steps to the next decision item', async ($, on) => {
    const two = { decisions: [{ ...DECISIONS.decisions[0]!, decision_event_id: 1, item_id: 'A1' }, { ...DECISIONS.decisions[0]!, decision_event_id: 2, item_id: 'L1' }] }
    engine(on, [], argv => (argv.includes('decisions') ? ok(two) : loopReply()(argv)))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('decisions'))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'refresh' })
    await ui.press({ key: 'decision-row-1' })
    await ui.press({ key: 'decision-open-1' })
    // The list holds two items; the one opened from it has a neighbour.
    const neighbours = await Promise.all([ui.find({ key: 'prev-item' }), ui.find({ key: 'next-item' })])
    expect(neighbours.filter(one => one !== undefined).length).toBe(1)
    await ui.unmount()
  })

  test('a command that cannot start is said plainly', async ($, on) => {
    mock.clock(on)
    on('command.register', () => ({ value: { command: 'ledger' } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('process.run', () => ({ deny: 'spawn ledger ENOENT' }))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command(''))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'refresh' })
    expect((await ui.find({ type: 'Text', text: /could not run ledger/ }))?.text).toContain('could not run ledger')
    await ui.unmount()
  })

  test('a value an earlier version stored is declined', async ($, on) => {
    on('state.get', () => ({ value: { value: { screen: 'items', items: 'not a list' }, version: 1 } }))
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect((await ui.find({ key: 'tab-home' }))?.props.variant).toBe('primary')
    await ui.unmount()
  })
})

const BOUNDED_CARD = {
  ...CARD,
  item_id: 'X1',
  type: 'initiative',
  title: 'title of X1',
  status: 'claimed',
  claim: 'seat-1',
  next_step: 'Resume with: ledger resume --item=X1',
  // The card dropped every one of these to fit its word bound, and says so.
  links: [{ event_id: 40, rel: 'duplicated-by', target: 'X9' }],
  notes: [],
  decisions: [],
  decision_records: [],
  tried: [],
  stop: null,
  truncated: ['links', 'notes'],
  open_questions: [
    {
      asked_event_id: 3,
      question: 'Ship it?',
      ask: 'ship',
      options: [{ label: 'Ship', description: 'clipped by the card' }],
      recommendation: 'A',
      default: 'A',
      unblocks: '',
      effort: '',
      added: '',
    },
  ],
}

function event(id: number, kind: string, payload: Record<string, unknown>): Record<string, unknown> {
  return { id, kind, actor: 'seat-1', harness: 'claude-code', model: null, recorded_at: '2026-10-30T12:00:00Z', payload }
}

const MANY_LINKS = Array.from({ length: 21 }, (_, index) => event(100 + index, 'item.linked', { rel: 'item', target: `member-${index}` }))

const BOUNDED_LOG = {
  completeness: { events_on_item: 30, events_returned: 30, events_decayed: 0 },
  events: [
    event(1, 'item.created', { type: 'initiative', title: 'title of X1', source: 'roadmaps/wave.md:69@abc123' }),
    event(2, 'item.state', { status: 'claimed', claim: 'seat-1', expires_at: '2026-11-07T14:02:00.000Z' }),
    event(3, 'decision.asked', { question: 'Ship it?', options: [{ label: 'Ship', description: 'ship now' }, { label: 'Wait', description: 'wait a week' }] }),
    event(4, 'decision.elected', { question: 'Merge now?', chosen: 'merge now', rejected: ['wait', 'close'], scope: 'this PR', quote_ref: 5, asked_event_id: 3 }),
    event(6, 'decision.recorded', { who: 'Andrew', who_kind: 'person', standing: 'settled', effect: 'ADR accepted', tags: [{ type: 'project', id: 'foundry' }], verbatim: 'accept', phase: 'close' }),
    event(7, 'item.stopped', { point: 'waiting on review', phase: 'review', skills: ['review'], refs: ['org/repo#7', 'notes/plan.md:3'] }),
    event(8, 'item.tried', { what: 'bump the pin', outcome: 'tests red', evidence: 'logs/1.txt' }),
    event(9, 'review.recorded', { round: 1, verdict: 'changes', findings: ['a finding'] }),
    event(10, 'item.note', { text: 'a plain note' }),
    event(11, 'item.spec', { version: 1, title: 'the spec', body_md: 'first line\nsecond line', size: 'S' }),
    event(12, 'item.linked', { rel: 'url', target: 'https://example.test/doc' }),
    event(13, 'item.linked', { rel: 'url', target: 'notes/local.md' }),
    ...MANY_LINKS,
  ],
}

function boundedReply(log: Ran): (argv: readonly string[]) => Ran {
  return argv => {
    const verb = argv.find(word => (READ_VERBS as readonly string[]).includes(word))
    if (argv.includes('X1') && verb === 'card') return ok(BOUNDED_CARD)
    if (argv.includes('X1') && verb === 'export-item') return log
    return answer(argv)
  }
}

describe('the item screen draws from the item\'s own events', () => {
  test('every section the bounded card dropped is drawn from the events, and the card keeps its own', async ($, on) => {
    engine(on, [], boundedReply(ok(BOUNDED_LOG)))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('X1'))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'refresh' })

    // The card's own: next step, duplicated-by.
    expect((await ui.find({ type: 'Text', text: /Resume with/ }))?.text).toContain('ledger resume --item=X1')
    expect((await ui.find({ key: 'duplicate-0' }))?.text).toContain('X9')
    // The header line: mint source, created day, lease end.
    expect((await ui.find({ type: 'Text', text: /^minted / }))?.text).toMatch(/^minted Oct \d+ from roadmaps\/wave\.md:69@abc123 · lease ends Nov \d+ \d\d:\d\d$/)
    // All 23 links, though the card carried none of them.
    expect((await ui.findAll({ type: 'Text', text: /^member-\d+$/ })).length).toBe(21)
    expect((await ui.find({ type: 'Link', text: /example\.test/ }))?.props.href).toBe('https://example.test/doc')
    // Elections: chosen, rejected, scope and quote reference.
    const election = await ui.find({ key: 'election-4' })
    expect(election?.text).toContain('Merge now? → merge now')
    expect(election?.text).toContain('rejected: wait | close')
    expect(election?.text).toContain('scope: this PR')
    expect(election?.text).toContain('on these words: #5')
    // Decision records, stop, tried, reviews, notes, spec.
    expect((await ui.find({ key: 'record-6' }))?.text).toContain('ADR accepted')
    expect((await ui.find({ key: 'stop' }))?.text).toContain('waiting on review')
    expect((await ui.find({ key: 'tried-8' }))?.text).toContain('outcome: tests red')
    expect((await ui.find({ key: 'review-9' }))?.text).toContain('a finding')
    expect((await ui.find({ key: 'note-10' }))?.text).toContain('a plain note')
    expect((await ui.find({ key: 'spec' }))?.text).toContain('second line')
    await ui.unmount()
  })

  test('an ask shows its options in full, from the ask event', async ($, on) => {
    engine(on, [], boundedReply(ok(BOUNDED_LOG)))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('X1'))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'refresh' })

    const options = await ui.find({ key: 'options' })
    expect(options?.text).toContain('A) Ship — ship now')
    expect(options?.text).toContain('B) Wait — wait a week')
    expect(options?.text).not.toContain('clipped by the card')
    await ui.unmount()
  })

  test('url link targets and stop refs copy', async ($, on) => {
    const copies: string[] = []
    engine(on, [], boundedReply(ok(BOUNDED_LOG)), copies)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('X1'))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'refresh' })

    await ui.press({ key: 'copy-link-12' })
    await ui.press({ key: 'copy-link-13' })
    await ui.press({ key: 'copy-ref-1' })
    expect(copies).toEqual(['https://example.test/doc', 'notes/local.md', 'notes/plan.md:3'])
    // An item link is not copyable.
    expect(await ui.find({ key: 'copy-link-100' })).toBe(undefined)
    await ui.unmount()
  })

  const failures: [string, Ran][] = [
    ['refuses', refused('moving', 'the ledger moved while reading')],
    ['answers with no event list', ok({ item_id: 'X1' })],
    ['answers with nothing', ok(null)],
  ]
  for (const [name, log] of failures) {
    test(`an export-item that ${name} says so and keeps the card's own sections`, async ($, on) => {
      engine(on, [], boundedReply(log))
      await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
      await $.command.run(command('X1'))
      const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
      await ui.press({ key: 'refresh' })

      expect((await ui.find({ key: 'events-failed' }))?.text).toContain('could not read the events of X1')
      expect((await ui.find({ key: 'events-failed' }))?.text).toContain('are not shown')
      expect((await ui.find({ type: 'Text', text: /Resume with/ }))?.text).toContain('ledger resume --item=X1')
      expect((await ui.find({ key: 'duplicate-0' }))?.text).toContain('X9')
      expect(await ui.find({ key: 'event-sections' })).toBe(undefined)
      expect(await ui.find({ key: 'stop' })).toBe(undefined)
      await ui.unmount()
    })
  }
})

/* The item screen's layout: strip, Now, timeline, navigation, width bands and error states. */

type Node = { type: string; props: Record<string, unknown> }

/** The elements as plain data, one constructor per tag, as the engine hands them out; for reading a drawn tree without an engine. */
const FAKE = Object.fromEntries(['Box', 'Text', 'Button', 'Input', 'Select', 'Link', 'Code'].map(type => [type, (props: Record<string, unknown>) => ({ type, props })])) as unknown as Ui

function nodes(tree: unknown, into: Node[] = []): Node[] {
  if (Array.isArray(tree)) {
    for (const one of tree) nodes(one, into)
  } else if (typeof tree === 'object' && tree !== null && 'type' in tree && 'props' in tree) {
    const node = tree as Node
    into.push(node)
    nodes(node.props.children, into)
  }
  return into
}

function stamped(id: number, kind: string, payload: Record<string, unknown>, recordedAt: string): Record<string, unknown> {
  return { id, kind, actor: 'seat-1', harness: 'claude-code', model: 'model-x', session: 'sess-1', idempotency_key: `key-${id}`, hash: `hash-${id}`, recorded_at: recordedAt, payload }
}

const FAR_PAST = '2020-01-01T00:00:00.000Z'
const FAR_FUTURE = '2099-01-01T00:00:00.000Z'

const LOOP_CARD = {
  ...CARD,
  item_id: 'L1',
  type: 'ticket',
  title: 'title of L1',
  status: 'claimed',
  claim: 'seat-1',
  next_step: 'Review round 1.',
  blockers: ['A1 has not landed'],
  notes: [],
  links: [],
  open_questions: [
    {
      asked_event_id: 3,
      question: 'Ship it?',
      ask: 'ship',
      options: [{ label: 'Ship', description: 'ship now' }, { label: 'Wait', description: 'wait a week' }],
      recommendation: 'B',
      default: 'B',
      unblocks: '',
      effort: '',
      added: '',
    },
  ],
}

function loopLog(extra: Record<string, unknown>[] = [], lease = FAR_PAST): Ran {
  return ok({
    completeness: { events_on_item: 9 + extra.length, events_returned: 9 + extra.length, events_decayed: 2 },
    events: [
      stamped(1, 'item.created', { type: 'ticket', title: 'title of L1', source: 'roadmaps/x.md:1@abc' }, '2026-10-28T12:00:00Z'),
      stamped(2, 'item.state', { status: 'claimed', claim: 'seat-1', expires_at: lease }, '2026-10-28T12:01:00Z'),
      stamped(3, 'decision.asked', { question: 'Ship it?', options: [{ label: 'Ship', description: 'ship now' }, { label: 'Wait', description: 'wait a week' }] }, '2026-10-28T12:02:00Z'),
      stamped(10, 'loop.intent', { operation: 'build', operation_id: 'b1' }, '2026-10-30T12:00:00Z'),
      stamped(11, 'loop.done', { operation: 'build', operation_id: 'b1', intent_event_id: 10, target: 'https://github.com/o/r/pull/133' }, '2026-10-30T12:17:00Z'),
      stamped(12, 'loop.intent', { operation: 'review', operation_id: 'r1', head: '3c0d5aa1122334455' }, '2026-10-30T12:20:00Z'),
      stamped(13, 'loop.done', { operation: 'review', operation_id: 'r1', intent_event_id: 12, verdict: 'changes', head: '3c0d5aa1122334455' }, '2026-10-30T12:25:00Z'),
      stamped(14, 'item.note', { text: 'a plain note' }, '2026-10-30T12:26:00Z'),
      stamped(15, 'item.linked', { rel: 'pr', target: 'https://github.com/o/r/pull/133' }, '2026-10-30T12:27:00Z'),
      ...extra,
    ],
  })
}

function loopReply(log: Ran = loopLog(), card: Ran = ok(LOOP_CARD)): (argv: readonly string[]) => Ran {
  return argv => {
    const verb = argv.find(word => (READ_VERBS as readonly string[]).includes(word))
    if (argv.includes('L1') && verb === 'card') return card
    if (argv.includes('L1') && verb === 'export-item') return log
    return answer(argv)
  }
}

/** The pane's props at another width, or scrolled. */
function paneAt(columns: number, offset = 0, bodyRows = 30) {
  return { ...PANE, props: { ...PANE.props, bodyColumns: columns, scroll: { offset, bodyRows } }, surface: 'terminal' as const }
}

async function openL1($: Parameters<TestBody>[0], on: On, reply = loopReply(), copies: string[] = [], seen: string[][] = []) {
  engine(on, seen, reply, copies)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(command('L1'))
}

describe('the item screen: strip, Now and the timeline', () => {
  test('the strip has a button per section with its hotkey and count, and no Ticket without ticket notes', async ($, on) => {
    await openL1($, on)
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })

    const entries = await Promise.all(['now', 'decisions', 'links', 'timeline', 'spec'].map(name => ui.find({ key: `strip-${name}` })))
    expect(entries.map(one => [one?.props.label, one?.props.hotkey])).toEqual([
      ['Now', 'n'],
      ['Decisions –', 'e'],
      ['Links 1', 'l'],
      ['Timeline 9', 't'],
      ['Spec –', 'p'],
    ])
    expect(await ui.find({ key: 'strip-ticket' })).toBe(undefined)
    await ui.unmount()
  })

  test('the strip carries Ticket, on g, when the item has framed ticket notes', async ($, on) => {
    await openL1($, on, loopReply(loopLog([stamped(20, 'item.note', { text: 'ticket-review:v2 {"round":1,"verdict":"pass","reviewer":"fresh"}' }, '2026-10-30T13:00:00Z'), stamped(21, 'item.note', { text: 'ticket-plan:v9 {broken' }, '2026-10-30T13:01:00Z')])))
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    expect((await ui.find({ key: 'strip-ticket' }))?.props).toMatchObject({ label: 'Ticket 2', hotkey: 'g' })
    expect((await ui.find({ key: 'ticket-20' }))?.text).toContain('review r1 pass · fresh')
    expect((await ui.find({ key: 'ticket-21' }))?.text).toContain('unreadable ticket record (v9)')
    await ui.unmount()
  })

  test('each strip button asks the pane to scroll to its own section header, which is drawn under that key', () => {
    const calls: [string, unknown[]][] = []
    const act = new Proxy({}, { get: (_, name) => (...args: unknown[]) => calls.push([String(name), args]) }) as Act
    const data = JSON.parse(loopLog().stdout).data
    const events = parseEvents(data)
    const view: View = {
      screen: 'item',
      isOpen: true,
      loading: false,
      error: null,
      loadedAt: null,
      doctor: null,
      items: [],
      ready: [],
      decisions: [],
      typeFilter: 'all',
      statusFilter: 'all',
      standingFilter: 'all',
      page: 0,
      itemId: 'L1',
      item: { ...parseCard(LOOP_CARD), events: events.events, eventsError: null, eventsOnItem: events.onItem, eventsDecayed: events.decayed },
      itemLoading: false,
      itemError: null,
      itemReadAt: null,
      siblings: [],
      history: [],
      timelineOrder: 'newest',
      timelineKind: 'all',
      openEvents: [],
      expanded: null,
      query: '',
      hits: [],
      searched: null,
      verify: null,
      verifying: false,
    }
    const found = nodes(draw(FAKE, view, act, { width: 100, rows: 30, now: Date.now(), offset: 0 }))
    for (const [name, hotkey] of [['now', 'n'], ['decisions', 'e'], ['links', 'l'], ['timeline', 't'], ['spec', 'p']] as const) {
      const button = found.find(one => one.props.key === `strip-${name}`)
      expect(button?.props.hotkey).toBe(hotkey)
      ;(button?.props.onPress as () => void)()
      expect(calls.pop()).toEqual(['jump', [`section-${name}`]])
      // The anchor the strip scrolls to is drawn, keyed the same.
      expect(found.some(one => one.type === 'Box' && one.props.key === `section-${name}`)).toBe(true)
    }
  })

  test('Now: the claim in words in the error colour once the lease ended, the next step, the stop, the recommended option and the blocker as a row', async ($, on) => {
    await openL1($, on)
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })

    const claim = await ui.find({ type: 'Text', text: /^claimed by / })
    expect(claim?.text).toMatch(/^claimed by seat-1 · lease ended \d+[smhd] ago$/)
    expect(claim?.props.color).toBe('error')
    const ended = await ui.find({ type: 'Text', text: /^lease ended; / })
    expect(ended?.text).toBe('lease ended; a takeover may claim it')
    expect(ended?.props.color).toBe('error')
    expect((await ui.find({ type: 'Text', text: /^Review round 1\.$/ }))?.text).toBe('Review round 1.')
    expect((await ui.find({ key: 'stop-none' }))?.text).toContain('none recorded')
    const options = await ui.find({ key: 'options' })
    expect(options?.text).toContain('B) Wait — wait a week  ◀ recommended')
    expect(options?.text).not.toContain('A) Ship — ship now  ◀')
    // The blocker is a pressable row with the item's glyph, id and title from the list the pane holds.
    const blocker = await ui.find({ key: 'blocker-0' })
    expect(blocker?.text).toContain('● A1')
    expect(blocker?.text).toContain('title of A1')
    await ui.unmount()
  })

  test('Now: a lease still running is in words, in the claim colour', async ($, on) => {
    await openL1($, on, loopReply(loopLog([], FAR_FUTURE)))
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    const claim = await ui.find({ type: 'Text', text: /^claimed by / })
    expect(claim?.text).toMatch(/^claimed by seat-1 · lease ends in \d+d$/)
    expect(claim?.props.color).toBe('warning')
    expect(await ui.find({ type: 'Text', text: /^lease ended; / })).toBe(undefined)
    await ui.unmount()
  })

  test('Decisions and Links print their placeholders and their empty lines instead of an empty section', async ($, on) => {
    await openL1($, on, loopReply(ok({ completeness: { events_on_item: 1, events_returned: 1, events_decayed: 0 }, events: [stamped(1, 'item.created', { type: 'ticket', title: 't' }, '2026-10-28T12:00:00Z')] })))
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    expect((await ui.find({ key: 'decisions-none' }))?.text).toBe('no decisions on this item')
    expect((await ui.find({ key: 'tagged-here' }))?.text).toContain('LP6-3')
    expect((await ui.find({ key: 'links-none' }))?.text).toContain('ledger link L1 --rel pr --target <url>')
    expect((await ui.find({ key: 'links-in' }))?.text).toContain('related items need ledger links (LP6-3)')
    expect((await ui.find({ key: 'links-docs' }))?.text).toContain('documents land with LC5')
    expect((await ui.find({ key: 'spec-none' }))?.text).toBe('no spec recorded')
    await ui.unmount()
  })

  test('an election quoting an utterance the pane cannot fetch says so, and a grant election shows its grant id', async ($, on) => {
    const log = loopLog([
      stamped(30, 'decision.elected', { question: 'Grant?', chosen: 'yes', question_id: 'grant:g7', quote_ref: 20516, quotes: ['go ahead'], asked_event_id: 3 }, '2026-10-30T14:00:00Z'),
    ])
    await openL1($, on, loopReply(log))
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    const election = await ui.find({ key: 'election-30' })
    expect(election?.text).toContain('grant:g7')
    expect(election?.text).toContain('on these words: #20516 (not on this item; needs events --id, LP6-5) "go ahead"')
    expect((await ui.find({ key: 'answered-3' }))?.text).toContain('Ship it? → yes')
    await ui.unmount()
  })

  test('the timeline groups by day, folds a loop step into one row with its round and elapsed time, and expands by event id', async ($, on) => {
    await openL1($, on)
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })

    const days = await ui.findAll({ type: 'Text', text: /^(Oct \d+) · \d+ events?$/ })
    expect(days.map(one => one.text)).toEqual(['Oct 30 · 6 events', 'Oct 28 · 3 events'])
    const build = await ui.find({ key: 'event-row-11' })
    expect(build?.text).toContain('build r1 → PR #133')
    expect(build?.text).toContain('· 17m')
    expect((await ui.find({ key: 'event-row-13' }))?.text).toContain('review r1 on 3c0d5aa → changes')
    // The folded intents have no rows of their own.
    expect(await ui.find({ key: 'event-row-10' })).toBe(undefined)
    expect(await ui.find({ key: 'event-row-12' })).toBe(undefined)
    expect(await ui.find({ key: 'event-detail-11' })).toBe(undefined)

    await ui.press({ key: 'event-row-11' })
    const detail = await ui.find({ key: 'event-detail-11' })
    // Both events behind the folded row, each with its provenance.
    expect(detail?.text).toContain('#10 loop.intent')
    expect(detail?.text).toContain('#11 loop.done')
    expect(detail?.text).toContain('session sess-1')
    expect(detail?.text).toContain('key key-11')
    expect(detail?.text).toContain('hash hash-11')
    expect(detail?.text).toContain('model model-x')
    expect((await ui.findAll({ type: 'Code' })).map(one => String(one.props.source)).some(source => source.includes('"intent_event_id": 10'))).toBe(true)

    // The expansion is keyed by event id, so a re-read keeps it.
    await ui.press({ key: 'refresh' })
    expect(await ui.find({ key: 'event-detail-11' })).toBeDefined()
    await ui.press({ key: 'event-row-11' })
    expect(await ui.find({ key: 'event-detail-11' })).toBe(undefined)
    await ui.unmount()
  })

  test('event rows carry no hotkeys, so dozens of ids never arm a letter', async ($, on) => {
    await openL1($, on)
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    const rows = (await ui.findAll({ type: 'Button' })).filter(one => (one.key ?? '').startsWith('event-row-'))
    expect(rows.length).toBeGreaterThan(5)
    for (const row of rows) expect(row.props.hotkey).toBeUndefined()
    await ui.unmount()
  })

  test('the kind filter narrows the timeline, and the order toggle reverses it', async ($, on) => {
    await openL1($, on)
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    const keys = async () => (await ui.findAll({ type: 'Button' })).map(one => one.key ?? '').filter(key => key.startsWith('event-row-'))

    expect((await keys())[0]).toBe('event-row-15')
    await ui.press({ key: 'timeline-order' })
    expect((await keys())[0]).toBe('event-row-1')
    await ui.press({ key: 'timeline-order' })

    await ui.select({ key: 'timeline-kind', value: 'loop' })
    expect(await keys()).toEqual(['event-row-13', 'event-row-11'])
    await ui.select({ key: 'timeline-kind', value: 'notes' })
    expect(await keys()).toEqual(['event-row-14'])
    await ui.select({ key: 'timeline-kind', value: 'decisions' })
    expect(await keys()).toEqual(['event-row-3'])
    await ui.select({ key: 'timeline-kind', value: 'provenance' })
    expect(await keys()).toEqual([])
    expect((await ui.find({ key: 'timeline-none' }))?.text).toBe('no provenance events on this item')
    await ui.unmount()
  })

  test('past 40 rows the timeline draws the rows near the window in full and the rest as one line each, with no row dropped', async ($, on) => {
    const many = Array.from({ length: 100 }, (_, index) => stamped(100 + index, 'item.note', { text: `note ${index}` }, '2026-10-29T12:00:00Z'))
    await openL1($, on, loopReply(loopLog(many)))

    const top = await $.ui.mount(paneAt(100, 0, 30))
    await top.press({ key: 'refresh' })
    // Newest first: the head of the list is in the window, the tail is placeholders.
    expect(await top.find({ key: 'event-row-199' })).toBeDefined()
    expect(await top.find({ key: 'event-row-100' })).toBe(undefined)
    expect(await top.find({ key: 'event-100' })).toBeDefined()
    // Every row is present, as a row or a placeholder: 100 notes plus the 7 rows of the other events.
    const drawn = async (pane: typeof top) => (await pane.findAll({ type: 'Box' })).filter(one => /^event-\d+$/.test(one.key ?? '')).length
    expect(await drawn(top)).toBe(100 + 7)
    await top.unmount()

    const down = await $.ui.mount(paneAt(100, 150, 30))
    await down.press({ key: 'refresh' })
    expect(await down.find({ key: 'event-row-199' })).toBe(undefined)
    expect(await down.find({ key: 'event-199' })).toBeDefined()
    const full = (await down.findAll({ type: 'Button' })).filter(one => (one.key ?? '').startsWith('event-row-')).length
    expect(full).toBeGreaterThan(10)
    expect(full).toBeLessThan(100)
    expect(await drawn(down)).toBe(100 + 7)
    await down.unmount()
  })

  test('an expanded row stays drawn in full when the window moves past it', async ($, on) => {
    const many = Array.from({ length: 100 }, (_, index) => stamped(100 + index, 'item.note', { text: `note ${index}` }, '2026-10-29T12:00:00Z'))
    await openL1($, on, loopReply(loopLog(many)))
    const ui = await $.ui.mount(paneAt(100, 0, 30))
    await ui.press({ key: 'refresh' })
    await ui.press({ key: 'event-row-199' })
    expect(await ui.find({ key: 'event-detail-199' })).toBeDefined()
    // Oldest first puts the same row far outside the window at the top.
    await ui.press({ key: 'timeline-order' })
    expect(await ui.find({ key: 'event-row-190' })).toBe(undefined)
    expect(await ui.find({ key: 'event-row-199' })).toBeDefined()
    expect(await ui.find({ key: 'event-detail-199' })).toBeDefined()
    await ui.unmount()
  })

  test('a timeline of 40 rows or fewer is drawn whole', async ($, on) => {
    await openL1($, on)
    const ui = await $.ui.mount(paneAt(100, 500, 5))
    await ui.press({ key: 'refresh' })
    expect((await ui.findAll({ type: 'Button' })).filter(one => (one.key ?? '').startsWith('event-row-')).length).toBe(7)
    await ui.unmount()
  })
})

describe('the item screen: navigation', () => {
  const LIST_ITEMS = [row('A1', 'ticket', 'open', '2026-11-05T10:00:00Z'), row('L1', 'ticket', 'open', '2026-11-04T10:00:00Z'), row('C3', 'ticket', 'open', '2026-11-03T10:00:00Z')]

  function listReply(argv: readonly string[]): Ran {
    const verb = argv.find(word => (READ_VERBS as readonly string[]).includes(word))
    if (verb === 'query') return ok({ items: LIST_ITEMS, limit: 5000, truncated: false })
    if (verb === 'card' && argv.includes('C3')) return ok({ ...CARD, item_id: 'C3', title: 'title of C3' })
    if (verb === 'export-item' && argv.includes('C3')) return ok({ completeness: { events_on_item: 0, events_returned: 0, events_decayed: 0 }, events: [] })
    return loopReply()(argv)
  }

  test('previous and next step through the list the item was opened from, and stop at its ends', async ($, on) => {
    const seen: string[][] = []
    engine(on, seen, listReply)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('items'))
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    await ui.press({ key: 'row-L1' })

    expect((await ui.find({ key: 'prev-item' }))?.props.hotkey).toBe('a')
    expect((await ui.find({ key: 'next-item' }))?.props.hotkey).toBe('f')
    await ui.press({ key: 'next-item' })
    expect((await ui.find({ type: 'Text', text: /^C3$/ }))?.text).toBe('C3')
    // At the end of the list there is nothing further.
    expect(await ui.find({ key: 'next-item' })).toBe(undefined)
    await ui.press({ key: 'prev-item' })
    await ui.press({ key: 'prev-item' })
    expect((await ui.find({ type: 'Text', text: /^A1$/ }))?.text).toBe('A1')
    expect(await ui.find({ key: 'prev-item' })).toBe(undefined)
    // Stepping is not opening: the history stays empty.
    expect(await ui.find({ key: 'history' })).toBe(undefined)
    // Everything the steps ran was a read.
    for (const argv of seen) expect((READ_VERBS as readonly string[]).includes(argv[2] ?? '')).toBe(true)
    await ui.unmount()
  })

  test('b goes back through the items opened from one another, and x leaves them all', async ($, on) => {
    engine(on, [], listReply)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('items'))
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    await ui.press({ key: 'row-L1' })
    expect(await ui.find({ key: 'history' })).toBe(undefined)

    // The blocker opens A1 from L1: L1 is left on the history.
    await ui.press({ key: 'blocker-0' })
    expect((await ui.find({ type: 'Text', text: /^A1$/ }))?.text).toBe('A1')
    expect((await ui.find({ key: 'history' }))?.props.hotkey).toBe('b')
    await ui.press({ key: 'history' })
    expect((await ui.find({ type: 'Text', text: /^L1$/ }))?.text).toBe('L1')
    expect(await ui.find({ key: 'history' })).toBe(undefined)

    await ui.press({ key: 'blocker-0' })
    await ui.press({ key: 'back' })
    expect((await ui.find({ key: 'row-L1' }))?.text).toContain('title of L1')
    await ui.press({ key: 'row-L1' })
    expect(await ui.find({ key: 'history' })).toBe(undefined)
    await ui.unmount()
  })

  test('a command that opens an item starts a fresh history', async ($, on) => {
    engine(on, [], listReply)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('items'))
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    await ui.press({ key: 'row-L1' })
    await ui.press({ key: 'blocker-0' })
    expect(await ui.find({ key: 'history' })).toBeDefined()

    await $.command.run(command('C3'))
    await ui.press({ key: 'refresh' })
    expect((await ui.find({ type: 'Text', text: /^C3$/ }))?.text).toBe('C3')
    expect(await ui.find({ key: 'history' })).toBe(undefined)
    await ui.unmount()
  })

  test('o takes the first PR link, else the first url; nothing is drawn with neither', async ($, on) => {
    const copies: string[] = []
    await openL1($, on, loopReply(), copies)
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    const open = await ui.find({ key: 'open-link' })
    expect(open?.props).toMatchObject({ label: 'Copy PR link', hotkey: 'o' })
    await ui.press({ key: 'open-link' })
    expect(copies).toEqual(['https://github.com/o/r/pull/133'])
    await ui.unmount()
  })

  test('with only a url link, o copies it; with none, the button is absent', async ($, on) => {
    const copies: string[] = []
    const log = ok({ completeness: { events_on_item: 1, events_returned: 1, events_decayed: 0 }, events: [stamped(1, 'item.linked', { rel: 'url', target: 'notes/a.md' }, '2026-10-30T12:00:00Z')] })
    await openL1($, on, loopReply(log), copies)
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    expect((await ui.find({ key: 'open-link' }))?.props.label).toBe('Copy url')
    await ui.press({ key: 'open-link' })
    expect(copies).toEqual(['notes/a.md'])
    await ui.unmount()
  })
})

describe('the item screen: width bands', () => {
  test('narrow: the header stacks, the strip wraps, and a timeline row puts its summary on a second line', async ($, on) => {
    await openL1($, on)
    const ui = await $.ui.mount(paneAt(60))
    await ui.press({ key: 'refresh' })
    expect((await ui.find({ key: 'header' }))?.props.flexDirection).toBe('column')
    expect((await ui.find({ key: 'strip' }))?.props.flexWrap).toBe('wrap')
    const row = await ui.find({ key: 'event-row-11' })
    expect(row?.text).toContain('#11')
    expect(row?.text).not.toContain('build r1')
    expect((await ui.find({ type: 'Text', text: /build r1 → PR #133/ }))?.text).toMatch(/^\s+build r1 → PR #133 · 17m$/)
    await ui.unmount()
  })

  test('standard: one row per event, header on one line, no model column, minutes only', async ($, on) => {
    await openL1($, on)
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    expect((await ui.find({ key: 'header' }))?.props.flexDirection).toBeUndefined()
    const row = await ui.find({ key: 'event-row-11' })
    expect(row?.text).toContain('build r1 → PR #133')
    expect(row?.text).not.toContain('model-x')
    expect(row?.text).toMatch(/\d\d:\d\d(?!:)/)
    await ui.unmount()
  })

  test('wide: the model column and the time to the second; an expanded payload sits beside the provenance', async ($, on) => {
    await openL1($, on)
    const ui = await $.ui.mount(paneAt(130))
    await ui.press({ key: 'refresh' })
    const row = await ui.find({ key: 'event-row-11' })
    expect(row?.text).toContain('model-x')
    expect(row?.text).toMatch(/\d\d:\d\d:\d\d/)
    await ui.press({ key: 'event-row-11' })
    expect((await ui.find({ key: 'event-detail-11' }))?.props.flexDirection).toBe('row')
    await ui.unmount()

    // The expansion is the view's, so it is still open at the other width.
    const standard = await $.ui.mount(paneAt(100))
    await standard.press({ key: 'refresh' })
    expect((await standard.find({ key: 'event-detail-11' }))?.props.flexDirection).toBe('column')
    await standard.unmount()
  })

  test('a width outside the bands draws as the nearest band', async ($, on) => {
    await openL1($, on)
    const tiny = await $.ui.mount(paneAt(10))
    await tiny.press({ key: 'refresh' })
    expect((await tiny.find({ key: 'header' }))?.props.flexDirection).toBe('column')
    await tiny.unmount()
    const huge = await $.ui.mount(paneAt(900))
    await huge.press({ key: 'refresh' })
    expect((await huge.find({ key: 'event-row-11' }))?.text).toContain('model-x')
    await huge.unmount()
  })
})

describe('the item screen: stale and failed reads', () => {
  test('a refused read keeps the last good detail, dimmed, with the age of the read it shows', async ($, on) => {
    let refuse = false
    await openL1($, on, argv => {
      const verb = argv.find(word => (READ_VERBS as readonly string[]).includes(word))
      if (refuse && argv.includes('L1') && verb === 'card') return refused('refused', 'the ledger is busy')
      return loopReply()(argv)
    })
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    expect((await ui.find({ type: 'Text', text: /^Review round 1\.$/ }))?.props.dimColor).toBeUndefined()
    expect(await ui.find({ key: 'stale' })).toBe(undefined)

    refuse = true
    await ui.press({ key: 'refresh' })
    expect((await ui.find({ type: 'Text', text: /could not read L1/ }))?.props.color).toBe('error')
    expect((await ui.find({ key: 'stale' }))?.text).toMatch(/^showing the read from (now|\d+[smhd]) ago$/)
    const next = await ui.find({ type: 'Text', text: /^Review round 1\.$/ })
    expect(next?.props.dimColor).toBe(true)
    expect((await ui.find({ key: 'event-row-11' }))?.text).toContain('build r1')
    await ui.unmount()
  })

  test('a read that refuses with the ledger moving says so in each section the events feed, and the rest stands', async ($, on) => {
    await openL1($, on, loopReply(refused('moving', 'the ledger moved while reading')))
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    expect((await ui.find({ key: 'events-failed' }))?.text).toContain('the ledger moved while reading; press r')
    for (const name of ['stop', 'decisions', 'links', 'timeline', 'spec']) expect((await ui.find({ key: `${name}-unread` }))?.text).toContain('not shown: the events could not be read')
    // The strip does not call an unread section empty.
    expect((await ui.find({ key: 'strip-timeline' }))?.props.label).toBe('Timeline ?')
    // The card's own sections stand.
    expect((await ui.find({ type: 'Text', text: /^Review round 1\.$/ }))?.text).toBe('Review round 1.')
    expect((await ui.find({ key: 'blocker-0' }))?.text).toContain('title of A1')
    await ui.unmount()
  })

  test('an event with a kind or a payload the screen does not know draws as its one-line summary, never throws', async ($, on) => {
    const log = ok({
      completeness: { events_on_item: 3, events_returned: 3, events_decayed: 0 },
      events: [
        { id: 1, kind: 'future.kind', actor: null, harness: null, model: null, recorded_at: '2026-10-30T12:00:00Z', payload: 'not an object' },
        { id: 2, kind: 'loop.done', actor: null, harness: null, model: null, recorded_at: 'garbled', payload: { intent_event_id: 'x' } },
        { id: 3, kind: 'loop.intent', actor: null, harness: null, model: null, recorded_at: '2026-10-30T12:00:00Z' },
      ],
    })
    await openL1($, on, loopReply(log))
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    expect(await ui.find({ key: 'event-row-1' })).toBeDefined()
    expect(await ui.find({ key: 'event-row-2' })).toBeDefined()
    expect(await ui.find({ key: 'event-row-3' })).toBeDefined()
    await ui.press({ key: 'event-row-1' })
    expect(await ui.find({ key: 'event-detail-1' })).toBeDefined()
    await ui.unmount()
  })
})
