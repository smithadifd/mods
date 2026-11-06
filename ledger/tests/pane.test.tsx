import { describe, expect, mock, test } from 'claude-code/testing'
import type { MockClock, TestBody } from 'claude-code/testing'

import { READ_VERBS } from '../hooks/cli'

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
  completeness: { events_on_item: 2, events_returned: 2, events_decayed: 0 },
  events: [
    { id: 1, kind: 'item.created', actor: 'seat-1', harness: 'claude-code', model: null, recorded_at: '2026-11-05T09:00:00Z', payload: { type: 'ticket', title: 'title of A1' } },
    { id: 2, kind: 'item.note', actor: 'seat-1', harness: 'claude-code', model: null, recorded_at: '2026-11-05T10:00:00Z', payload: { text: 'a note on A1' } },
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
function engine(on: On, seen: string[][], reply: (argv: readonly string[]) => Ran = answer): MockClock {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'ledger' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.copy', () => ({ value: { isCopied: true } }))
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
    expect((await ui.find({ type: 'Text', text: /2 events/ }))?.text).toContain('2 events')
    expect((await ui.findAll({ type: 'Text', text: /^item\.(created|note)\s*$/ })).length).toBe(2)
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
