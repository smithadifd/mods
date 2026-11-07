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

  test('an item with two decision records is stepped past, not reloaded', async ($, on) => {
    const three = {
      decisions: [
        { ...DECISIONS.decisions[0]!, decision_event_id: 3, item_id: 'A1' },
        { ...DECISIONS.decisions[0]!, decision_event_id: 2, item_id: 'A1' },
        { ...DECISIONS.decisions[0]!, decision_event_id: 1, item_id: 'L1' },
      ],
    }
    engine(on, [], argv => (argv.includes('decisions') ? ok(three) : loopReply()(argv)))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('decisions'))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'refresh' })
    await ui.press({ key: 'decision-row-2' })
    await ui.press({ key: 'decision-open-2' })
    expect((await ui.find({ type: 'Text', text: /^A1$/ }))?.text).toBe('A1')
    await ui.press({ key: 'next-item' })
    expect((await ui.find({ type: 'Text', text: /^L1$/ }))?.text).toBe('L1')
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

/** An item with three spec versions and a claim taken against `built` (default 1). */
function specLog(built = 1): Ran {
  return loopLog([
    stamped(20, 'item.spec', { version: 1, title: 'First', body_md: 'first body', size: 'S' }, '2026-10-28T12:30:00Z'),
    stamped(21, 'item.spec', { version: 2, title: 'Second', body_md: 'second **body**', size: 'L' }, '2026-10-29T12:30:00Z'),
    stamped(22, 'item.spec', { version: 3, title: 'Third', body_md: '# Third\n\nthird body', acceptance: '- it works', size: 'M', merge_class: 'MC-2', source: 'plan.md', source_rev: 'abc123' }, '2026-10-30T12:30:00Z'),
    stamped(23, 'item.state', { status: 'claimed', claim: 'seat-1', expires_at: FAR_FUTURE, spec_version: built }, '2026-10-30T12:31:00Z'),
  ])
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

  test('the Spec section draws the current version, every earlier one newest first, and the spec as Markdown', async ($, on) => {
    await openL1($, on, loopReply(specLog()))
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })

    expect((await ui.find({ key: 'strip-spec' }))?.props.label).toBe('Spec 3')
    const meta = (await ui.find({ key: 'spec-meta' }))?.text ?? ''
    for (const part of ['v3 of 3', 'size M', 'MC-2', 'source plan.md@abc123', '#22']) expect(meta).toContain(part)
    expect((await ui.find({ key: 'spec-moved' }))?.text).toBe('spec moved')
    // The body and the acceptance criteria are Markdown elements wrapped to the pane width.
    const current = await ui.find({ key: 'spec-current-body-md' })
    expect(current?.type).toBe('Markdown')
    expect(current?.props.text).toBe('# Third\n\nthird body')
    expect((await ui.find({ key: 'spec-current-acceptance-md' }))?.props.text).toBe('- it works')
    expect((await ui.find({ key: 'spec-current-body' }))?.props.width).toBe(98)
    // Earlier versions, newest first, one line each; their bodies are not drawn until pressed.
    const rows = await ui.findAll({ type: 'Button', text: /^[▸▾] v\d+ · / })
    expect(rows.length).toBe(2)
    expect(rows[0]?.text).toMatch(/^▸ v2 · Oct \d+ · size L · #21$/)
    expect(rows[1]?.text).toMatch(/^▸ v1 · Oct \d+ · size S · #20$/)
    expect(await ui.find({ key: 'spec-version-21-text-body-md' })).toBe(undefined)
    await ui.press({ key: 'spec-version-row-21' })
    expect((await ui.find({ key: 'spec-version-21-text-body-md' }))?.props.text).toBe('second **body**')
    expect(await ui.find({ key: 'spec-version-20-text-body-md' })).toBe(undefined)
    // The expansion survives a re-read and folds on a second press.
    await ui.press({ key: 'refresh' })
    expect(await ui.find({ key: 'spec-version-21-text-body-md' })).toBeDefined()
    await ui.press({ key: 'spec-version-row-21' })
    expect(await ui.find({ key: 'spec-version-21-text-body-md' })).toBe(undefined)
    await ui.unmount()
  })

  test('opening an earlier spec version leaves the Timeline row closed, and the reverse', async ($, on) => {
    await openL1($, on, loopReply(specLog()))
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    await ui.press({ key: 'spec-version-row-21' })
    expect(await ui.find({ key: 'spec-version-21-text-body-md' })).toBeDefined()
    expect(await ui.find({ key: 'event-detail-21' })).toBe(undefined)
    await ui.press({ key: 'spec-version-row-21' })
    await ui.press({ key: 'event-row-20' })
    expect(await ui.find({ key: 'event-detail-20' })).toBeDefined()
    expect(await ui.find({ key: 'spec-version-20-text-body-md' })).toBe(undefined)
    await ui.unmount()
  })

  test('the Spec section says nothing moved when the claim was taken against the current version', async ($, on) => {
    await openL1($, on, loopReply(specLog(3)))
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    expect(await ui.find({ key: 'spec-meta' })).toBeDefined()
    expect(await ui.find({ key: 'spec-moved' })).toBe(undefined)
    await ui.unmount()
  })

  test('a spec event with no usable body shows its metadata and says the body was not recorded', async ($, on) => {
    const log = loopLog([
      stamped(20, 'item.spec', { version: 1, title: 'no body at all', size: 'S' }, '2026-10-29T10:00:00Z'),
      stamped(21, 'item.spec', { version: 2, title: 'number body', body_md: 42, acceptance: 'still criteria', size: 'M' }, '2026-10-29T11:00:00Z'),
    ])
    await openL1($, on, loopReply(log))
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    expect((await ui.find({ key: 'spec-meta' }))?.text).toContain('v2 of 2')
    expect((await ui.find({ key: 'spec-current-body-missing' }))?.text).toBe('body not recorded')
    expect(await ui.find({ key: 'spec-current-body-md' })).toBe(undefined)
    expect((await ui.find({ key: 'spec-current-acceptance-md' }))?.props.text).toBe('still criteria')
    await ui.press({ key: 'spec-version-row-20' })
    expect((await ui.find({ key: 'spec-version-20-text-body-missing' }))?.text).toBe('body not recorded')
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
      openSpecs: [],
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

describe('a view stored by an earlier version', () => {
  const stored = {
    screen: 'item', isOpen: true, loading: false, error: null, loadedAt: null, doctor: null,
    items: [], ready: [], decisions: [], typeFilter: 'all', statusFilter: 'all', standingFilter: 'all',
    page: 0, itemId: 'L1', item: null, itemLoading: false, itemError: null, itemReadAt: null,
    siblings: [], history: [], timelineOrder: 'newest', timelineKind: 'all', openEvents: [],
    expanded: null, query: '', hits: [], searched: null, verify: null, verifying: false,
  }
  const VIEW = { plugin: 'ledger', key: 'view' } as const

  async function openWith(shape: string, $: Parameters<TestBody>[0], on: On) {
    engine(on, [], loopReply())
    // The engine's store answers the pane's read of its view with a value kept under `shape`.
    on('state.get', VIEW, async (_, e, next) => {
      const real = await next(e)
      // Until the pane writes its own view, the store holds the seeded one.
      if (real.value?.value !== undefined) return real
      return { value: { value: { shape, value: stored }, version: real.value?.version ?? 0 } } as never
    })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    return ui
  }

  test('a value kept under the current tag is resumed on its item screen', async ($, on) => {
    const ui = await openWith('view-4', $, on)
    expect(await ui.find({ key: 'strip-now' })).toBeDefined()
    await ui.unmount()
  })

  test('a value kept under the earlier view-3 tag is declined: the pane opens on its default view', async ($, on) => {
    const ui = await openWith('view-3', $, on)
    expect(await ui.find({ key: 'strip-now' })).toBe(undefined)
    expect(await ui.find({ key: 'tile-ready' })).toBeDefined()
    await ui.unmount()
  })
})

const SESSION_LOG = {
  completeness: { events_on_item: 7, events_returned: 7, events_decayed: 0 },
  events: [
    { ...event(1, 'item.created', { type: 'initiative', title: 'title of X1' }), session: 'sess-old' },
    { ...event(2, 'item.note', { text: 'first' }), session: 'sess-mid' },
    { ...event(3, 'item.linked', { rel: 'session', target: 'sess-linked' }) },
    { ...event(4, 'item.note', { text: 'second' }), session: 'sess-old' },
    { ...event(5, 'item.linked', { rel: 'session', target: 'has a space' }) },
    { ...event(6, 'item.note', { text: 'third' }), session: 42 },
    { ...event(7, 'item.note', { text: 'fourth' }), session: 'two words' },
  ],
}

describe('the item screen copies a resume line for each session it names', () => {
  async function open(log: Ran, copies: string[], $: Parameters<TestBody>[0], on: On, seen: string[][] = []) {
    engine(on, seen, boundedReply(log), copies)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('X1'))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'refresh' })
    return ui
  }

  test('Now lists each usable session once, the latest named first, and each copies exactly its line', async ($, on) => {
    const copies: string[] = []
    const ui = await open(ok(SESSION_LOG), copies, $, on)
    // Latest event per session: sess-linked (3) is older than sess-old (4) and newer than sess-mid (2); the unusable ones sit at 5, 6 and 7.
    const rows = (await ui.findAll({ type: 'Button' })).filter(one => (one.key ?? '').startsWith('copy-resume-session-'))
    expect(rows.length).toBe(3)
    expect(rows.map(one => one.props.label)).toEqual(['Copy resume line', 'Copy resume line', 'Copy resume line'])
    // The unusable rows come first by their event ids (7, 6, 5), so the usable ones are at positions 3, 4 and 5.
    await ui.press({ key: 'copy-resume-session-3' })
    await ui.press({ key: 'copy-resume-session-4' })
    await ui.press({ key: 'copy-resume-session-5' })
    expect(copies).toEqual(['claude --resume sess-old', 'claude --resume sess-linked', 'claude --resume sess-mid'])
    await ui.unmount()
  })

  test('a session value that cannot be resumed offers no copy and says so', async ($, on) => {
    const ui = await open(ok(SESSION_LOG), [], $, on)
    for (const index of [0, 1, 2]) {
      expect((await ui.find({ key: `session-${index}` }))?.text).toContain('session id unusable')
      expect(await ui.find({ key: `copy-resume-session-${index}` })).toBe(undefined)
    }
    expect((await ui.find({ key: 'session-3' }))?.text).toContain('sess-old')
    await ui.unmount()
  })

  test('an item with no session anywhere says no sessions recorded', async ($, on) => {
    const log = ok({ completeness: { events_on_item: 1, events_returned: 1, events_decayed: 0 }, events: [event(1, 'item.created', { type: 'initiative', title: 't' })] })
    const ui = await open(log, [], $, on)
    expect((await ui.find({ key: 'sessions-none' }))?.text).toContain('no sessions recorded')
    expect(await ui.find({ key: 'copy-resume-session-0' })).toBe(undefined)
    await ui.unmount()
  })

  test('an expanded event that records a session copies its resume line; an unusable one does not', async ($, on) => {
    const copies: string[] = []
    const ui = await open(ok(SESSION_LOG), copies, $, on)
    await ui.press({ key: 'event-row-2' })
    await ui.press({ key: 'event-row-6' })
    await ui.press({ key: 'copy-resume-event-2' })
    expect(copies).toEqual(['claude --resume sess-mid'])
    expect(await ui.find({ key: 'copy-resume-event-6' })).toBe(undefined)
    expect((await ui.find({ key: 'provenance-session-6' }))?.text).toContain('session id unusable')
    await ui.unmount()
  })

  test('a session link copies the line built from its target; an unusable target does not', async ($, on) => {
    const copies: string[] = []
    const ui = await open(ok(SESSION_LOG), copies, $, on)
    await ui.press({ key: 'copy-resume-link-3' })
    expect(copies).toEqual(['claude --resume sess-linked'])
    expect(await ui.find({ key: 'copy-resume-link-5' })).toBe(undefined)
    expect((await ui.find({ key: 'link-session-unusable-5' }))?.text).toContain('session id unusable')
    await ui.unmount()
  })

  test('an id carrying shell syntax, a leading dash, 129 characters or non-ASCII offers no copy at any sink', async ($, on) => {
    const bad = ['$(id)', '`id`', 'x;touch${IFS}/p', 'a|b', 'x&&id', 'a>b', "'q'", '"q"', '\\', '-r', 'a'.repeat(129), 'sess\u00e9']
    const events = [
      { ...event(1, 'item.created', { type: 'initiative', title: 'title of X1' }) },
      ...bad.map((value, index) => ({ ...event(index + 2, 'item.note', { text: 'n' }), session: value })),
      ...bad.map((value, index) => event(index + 2 + bad.length, 'item.linked', { rel: 'session', target: value })),
    ]
    const copies: string[] = []
    const ui = await open(ok({ completeness: { events_on_item: events.length, events_returned: events.length, events_decayed: 0 }, events }), copies, $, on)
    for (let index = 0; index < bad.length; index++) await ui.press({ key: `event-row-${index + 2}` })
    const buttons = (await ui.findAll({ type: 'Button' })).filter(one => (one.key ?? '').startsWith('copy-resume-'))
    expect(buttons.length).toBe(0)
    expect((await ui.find({ key: 'session-0' }))?.text).toContain('session id unusable')
    expect((await ui.find({ key: 'provenance-session-2' }))?.text).toContain('session id unusable')
    expect((await ui.find({ key: `link-session-unusable-${2 + bad.length}` }))?.text).toContain('session id unusable')
    expect(copies).toEqual([])
    await ui.unmount()
  })

  test('the pane runs only the read verbs while it offers resume lines', async ($, on) => {
    const seen: string[][] = []
    const ui = await open(ok(SESSION_LOG), [], $, on, seen)
    await ui.press({ key: 'copy-resume-session-3' })
    expect(seen.length).toBeGreaterThan(0)
    for (const argv of seen) expect(argv.some(word => (READ_VERBS as readonly string[]).includes(word))).toBe(true)
    expect(seen.some(argv => argv.includes('claude'))).toBe(false)
    await ui.unmount()
  })
})

describe('children under their anchor', () => {
  /** A row as a ledger with `child-of` answers it: `parent_id` and `children_open` after the usual columns. */
  function kin(id: string, status: string, updated: string, parent: string | null, childrenOpen: number, claim: string | null = null): Record<string, unknown> {
    return { ...row(id, 'ticket', status, updated, updated, claim), parent_id: parent, children_open: childrenOpen }
  }

  const FAMILY = [
    kin('P1', 'open', '2026-11-05T10:00:00Z', null, 1),
    kin('K1', 'open', '2026-11-05T09:00:00Z', 'P1', 0, null),
    kin('K2', 'closed', '2026-11-04T09:00:00Z', 'P1', 0),
    kin('K3', 'closed', '2026-11-03T09:00:00Z', 'P1', 0),
    kin('F1', 'open', '2026-11-02T10:00:00Z', null, 0),
  ]

  function familyReply(items: readonly Record<string, unknown>[]): (argv: readonly string[]) => Ran {
    return argv => {
      const verb = argv.find(word => (READ_VERBS as readonly string[]).includes(word))
      if (verb === 'query') return ok({ items, limit: 5000, truncated: false })
      return answer(argv)
    }
  }

  async function itemsScreen($: Parameters<TestBody>[0], on: On, items: readonly Record<string, unknown>[], seen: string[][] = []) {
    engine(on, seen, familyReply(items))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('items'))
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })
    return ui
  }

  test('an anchor carries closed of total, its open child sits indented under it, and its closed children fold behind one line', async ($, on) => {
    const ui = await itemsScreen($, on, FAMILY)

    const keys = (await ui.findAll({ type: 'Button', text: /title of/ })).map(one => one.key)
    expect(keys).toEqual(['row-P1', 'row-K1', 'row-F1'])
    expect((await ui.find({ key: 'row-P1' }))?.text).toContain('2 of 3')
    // The open child is indented under its anchor and carries no count of its own.
    expect((await ui.find({ key: 'row-K1' }))?.text).toMatch(/ticket {7}title of K1/)
    expect((await ui.find({ key: 'row-K1' }))?.text).not.toMatch(/\d of \d/)
    // The anchor and a flat row are not indented.
    expect((await ui.find({ key: 'row-P1' }))?.text).toMatch(/ticket {5}2 of 3 title of P1/)
    expect(await ui.find({ key: 'row-K2' })).toBe(undefined)
    expect(await ui.find({ key: 'row-K3' })).toBe(undefined)
    expect((await ui.find({ key: 'fold-P1' }))?.text).toContain('and 2 closed')
    // A row with no children carries no count.
    expect((await ui.find({ key: 'row-F1' }))?.text).toMatch(/ticket {5}title of F1/)
    await ui.unmount()
  })

  test('an anchor whose children are all closed folds all of them behind one line', async ($, on) => {
    const ui = await itemsScreen($, on, [
      kin('P2', 'open', '2026-11-05T10:00:00Z', null, 0),
      kin('K4', 'closed', '2026-11-04T09:00:00Z', 'P2', 0),
      kin('K5', 'closed', '2026-11-03T09:00:00Z', 'P2', 0),
      kin('K6', 'closed', '2026-11-02T09:00:00Z', 'P2', 0),
    ])

    expect((await ui.findAll({ type: 'Button', text: /title of/ })).map(one => one.key)).toEqual(['row-P2'])
    expect((await ui.find({ key: 'row-P2' }))?.text).toContain('3 of 3')
    expect((await ui.find({ key: 'fold-P2' }))?.text).toContain('and 3 closed')
    await ui.unmount()
  })

  test('closed children are listed, not folded, when the list asks for closed items', async ($, on) => {
    const ui = await itemsScreen($, on, [
      ...FAMILY,
      kin('PC', 'closed', '2026-11-01T10:00:00Z', null, 0),
      kin('KC1', 'closed', '2026-10-31T10:00:00Z', 'PC', 0),
      kin('KC2', 'closed', '2026-10-30T10:00:00Z', 'PC', 0),
    ])
    // With every status, the closed children are folded under the closed anchor.
    expect(await ui.find({ key: 'fold-PC' })).not.toBe(undefined)
    await ui.select({ key: 'status', value: 'closed' })

    // Asking for closed items lists them, the anchor's two nested under it, with nothing folded.
    expect((await ui.findAll({ type: 'Button', text: /title of/ })).map(one => one.key)).toEqual(['row-K2', 'row-K3', 'row-PC', 'row-KC1', 'row-KC2'])
    expect(await ui.find({ key: 'fold-PC' })).toBe(undefined)
    expect((await ui.find({ key: 'row-KC1' }))?.text).toMatch(/ticket {7}title of KC1/)
    await ui.unmount()
  })

  test('a child whose anchor is not in the result renders flat, as it does today', async ($, on) => {
    const ui = await itemsScreen($, on, [
      kin('K7', 'open', '2026-11-05T10:00:00Z', 'GONE', 0),
      kin('F2', 'open', '2026-11-04T10:00:00Z', null, 0),
    ])

    expect((await ui.findAll({ type: 'Button', text: /title of/ })).map(one => one.key)).toEqual(['row-K7', 'row-F2'])
    expect((await ui.find({ key: 'row-K7' }))?.text).toMatch(/ticket {5}title of K7/)
    expect(await ui.find({ key: 'fold-GONE' })).toBe(undefined)
    await ui.unmount()
  })

  test('rows from an older ledger, without parent_id or children_open, render exactly as today', async ($, on) => {
    const plain = [
      row('A1', 'ticket', 'open', '2026-11-05T10:00:00Z'),
      row('B2', 'ticket', 'blocked', '2026-11-01T10:00:00Z'),
      row('C3', 'ticket', 'closed', '2026-11-04T10:00:00Z'),
      row('E4', 'ticket', 'claimed', '2026-11-05T09:00:00Z', '2026-11-05T09:00:00Z', 'seat-1'),
    ]
    const ui = await itemsScreen($, on, plain)

    expect((await ui.findAll({ type: 'Button', text: /title of/ })).map(one => one.key)).toEqual(['row-E4', 'row-A1', 'row-B2', 'row-C3'])
    for (const one of await ui.findAll({ type: 'Button', text: /title of/ })) {
      expect(one.text).not.toMatch(/\d of \d/)
      expect(one.text).toMatch(/(ticket|seat-1) {4,5}title of/)
    }
    expect(await ui.find({ key: 'fold-A1' })).toBe(undefined)
    await ui.unmount()
  })

  test('a malformed parent_id renders the row flat', async ($, on) => {
    const ui = await itemsScreen($, on, [
      { ...kin('P3', 'open', '2026-11-05T10:00:00Z', null, 0) },
      { ...kin('K8', 'open', '2026-11-04T10:00:00Z', null, 0), parent_id: 7 },
      { ...kin('K9', 'open', '2026-11-03T10:00:00Z', null, 0), parent_id: '' },
      { ...kin('K10', 'open', '2026-11-02T10:00:00Z', 'K10', 0) },
    ])

    expect((await ui.findAll({ type: 'Button', text: /title of/ })).map(one => one.key)).toEqual(['row-P3', 'row-K8', 'row-K9', 'row-K10'])
    await ui.unmount()
  })

  test('the detail lists every child, with the same count in its header, between Now and Decisions', async ($, on) => {
    const items = [
      ...FAMILY.map(one => (one.item_id === 'K1' ? { ...one, claim: 'seat-9', status: 'claimed' } : one)),
    ]
    const reply = (argv: readonly string[]): Ran => {
      const verb = argv.find(word => (READ_VERBS as readonly string[]).includes(word))
      if (verb === 'query') return ok({ items, limit: 5000, truncated: false })
      if (argv.includes('P1') && verb === 'card') return ok({ ...CARD, item_id: 'P1', title: 'title of P1' })
      if (argv.includes('P1') && verb === 'export-item') return ok(LOG)
      return answer(argv)
    }
    engine(on, [], reply)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('P1'))
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })

    const header = await ui.find({ key: 'section-children' })
    expect(header?.text).toContain('Children')
    expect(header?.text).toContain('2 of 3')
    for (const id of ['K1', 'K2', 'K3']) expect((await ui.find({ key: `child-${id}` }))?.text).toContain(`title of ${id}`)
    expect((await ui.find({ key: 'child-K1' }))?.text).toContain('◆')
    expect((await ui.find({ key: 'child-K1' }))?.text).toContain('seat-9')
    expect((await ui.find({ key: 'child-K2' }))?.text).toContain('○')

    // The order of the sections in the tree: Now, Children, Decisions.
    const order = (await ui.findAll({ type: 'Box' })).map(one => one.key).filter(key => ['section-now', 'section-children', 'section-decisions'].includes(key ?? ''))
    expect(order).toEqual(['section-now', 'section-children', 'section-decisions'])

    // A child opens its own detail, which has no Children section.
    await ui.press({ key: 'child-K2' })
    expect(await ui.find({ key: 'section-children' })).toBe(undefined)
    await ui.unmount()
  })

  test('the Links section still prints the child-of row as it prints every relation', async ($, on) => {
    const log = {
      completeness: { events_on_item: 2, events_returned: 2, events_decayed: 0 },
      events: [
        stamped(1, 'item.created', { type: 'ticket', title: 'title of K1' }, '2026-11-05T09:00:00Z'),
        stamped(2, 'item.linked', { rel: 'child-of', target: 'P1' }, '2026-11-05T09:01:00Z'),
      ],
    }
    const reply = (argv: readonly string[]): Ran => {
      const verb = argv.find(word => (READ_VERBS as readonly string[]).includes(word))
      if (verb === 'query') return ok({ items: FAMILY, limit: 5000, truncated: false })
      if (argv.includes('K1') && verb === 'card') return ok({ ...CARD, item_id: 'K1', title: 'title of K1' })
      if (argv.includes('K1') && verb === 'export-item') return ok(log)
      return answer(argv)
    }
    engine(on, [], reply)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run(command('K1'))
    const ui = await $.ui.mount(paneAt(100))
    await ui.press({ key: 'refresh' })

    expect((await ui.find({ key: 'link-2-child-of' }))?.text).toContain('child-of')
    await ui.unmount()
  })

  test('the pane still runs read verbs only while it nests children', async ($, on) => {
    const seen: string[][] = []
    const ui = await itemsScreen($, on, FAMILY, seen)
    await ui.press({ key: 'row-P1' })
    expect(seen.length).toBeGreaterThan(2)
    for (const argv of seen) expect((READ_VERBS as readonly string[]).includes(argv[2] ?? '')).toBe(true)
    await ui.unmount()
  })
})
