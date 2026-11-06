import { describe, expect, test } from 'claude-code/testing'

import {
  LedgerError,
  READ_VERBS,
  argvFor,
  cliFrom,
  dataOf,
  isMissingDatabase,
  parseCard,
  parseDecisions,
  parseDoctor,
  parseEnvelope,
  parseEvents,
  parseHits,
  parseItems,
  parseVerify,
  summarize,
} from '../hooks/cli'

function ok(data: unknown): { exitCode: number; stdout: string; stderr: string } {
  return { exitCode: 0, stdout: JSON.stringify({ ok: true, data, error: null }), stderr: '' }
}

function refused(code: string, message: string): { exitCode: number; stdout: string; stderr: string } {
  return { exitCode: 1, stdout: JSON.stringify({ ok: false, data: null, error: { code, message } }), stderr: '' }
}

describe('the command and its arguments', () => {
  test('a blank command is `ledger` on PATH, run from the session directory', () => {
    expect(cliFrom({})).toEqual({ argv: ['ledger'], cwd: undefined, db: '' })
    expect(cliFrom({ command: '  ', folder: ' ', db: ' ' })).toEqual({ argv: ['ledger'], cwd: undefined, db: '' })
  })

  test('a python form keeps its words, folder and database', () => {
    expect(cliFrom({ command: 'python3 -m ledger', folder: '/lib', db: '/db/home.db' })).toEqual({
      argv: ['python3', '-m', 'ledger'],
      cwd: '/lib',
      db: '/db/home.db',
    })
  })

  test('argv asks for JSON, passes --db only when set, and keeps an id from reading as a flag', () => {
    const cli = cliFrom({ command: 'ledger' })
    expect(argvFor(cli, 'query', ['--limit', '5000'])).toEqual(['ledger', '--json', 'query', '--limit', '5000'])
    expect(argvFor({ ...cli, db: '/db' }, 'card', ['--', '-odd'])).toEqual(['ledger', '--json', '--db', '/db', 'card', '--', '-odd'])
  })

  test('only read verbs can be built: nothing here appends an event', () => {
    for (const verb of READ_VERBS) expect(argvFor(cliFrom({}), verb)).toContain(verb)
    for (const write of ['new', 'note', 'state', 'claim', 'elect', 'append', 'restore']) {
      expect(() => argvFor(cliFrom({}), write as never)).toThrow(`${write} is not a read verb`)
    }
  })
})

describe('the envelope', () => {
  test('ok data comes through; a refusal keeps its code and message', () => {
    expect(parseEnvelope(ok({ items: [] }))).toEqual({ ok: true, data: { items: [] } })
    expect(parseEnvelope(refused('not_found', 'no item X'))).toEqual({ ok: false, code: 'not_found', message: 'no item X' })
  })

  test('no output reads the last stderr line; non-JSON says so', () => {
    expect(parseEnvelope({ exitCode: 127, stdout: '', stderr: 'zsh: command not found: ledger\n' })).toEqual({
      ok: false,
      code: 'no-output',
      message: 'zsh: command not found: ledger',
    })
    expect(parseEnvelope({ exitCode: 2, stdout: '', stderr: '' }).ok).toBe(false)
    const bad = parseEnvelope({ exitCode: 0, stdout: 'path: /x\n', stderr: '' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.code).toBe('no-json')
  })

  test('dataOf hands back data, null for an empty result, and throws a LedgerError otherwise', () => {
    expect(dataOf('query', ok({ items: [1] }))).toEqual({ items: [1] })
    expect(dataOf('ready', refused('empty', 'no rows'))).toBe(null)
    let caught: unknown
    try {
      dataOf('card', refused('not_found', 'no item NY-9'))
    } catch (error) {
      caught = error
    }
    expect(caught instanceof LedgerError).toBe(true)
    if (caught instanceof LedgerError) {
      expect(caught.verb).toBe('card')
      expect(caught.code).toBe('not_found')
    }
  })

  test('a missing database is told apart from every other refusal', () => {
    expect(isMissingDatabase(new LedgerError('doctor', 'refused', 'database does not exist: /x/ledger.db'))).toBe(true)
    expect(isMissingDatabase(new LedgerError('doctor', 'refused', 'schema too new'))).toBe(false)
    expect(isMissingDatabase(new Error('database does not exist'))).toBe(false)
  })
})

describe('the parsers', () => {
  test('items keep the fields the list draws and skip rows without an id', () => {
    const items = parseItems({
      items: [
        { item_id: 'A1', type: 'ticket', title: 'first', status: 'open', owner: null, claim: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z' },
        { type: 'ticket', title: 'no id' },
        'junk',
      ],
    })
    expect(items).toEqual([
      { id: 'A1', type: 'ticket', title: 'first', status: 'open', owner: null, claim: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z' },
    ])
    expect(parseItems(null)).toEqual([])
  })

  test('doctor reads the path, schema, search state and expired claims', () => {
    const doctor = parseDoctor({
      path: '/db/home.db',
      schema_version: 9,
      search: { status: 'behind', new_events: 3 },
      expired_claims: { status: 'expired', items: [{ item_id: 'B2', holder: 'seat-1', expires_at: '2026-11-01T00:00:00Z' }] },
    })
    expect(doctor).toEqual({
      path: '/db/home.db',
      schemaVersion: 9,
      search: { status: 'behind', behind: 3 },
      expiredClaims: [{ itemId: 'B2', holder: 'seat-1', expiresAt: '2026-11-01T00:00:00Z' }],
    })
    expect(parseDoctor(undefined).search).toEqual({ status: 'unknown', behind: 0 })
  })

  test('decisions keep standing, who, the words and the tags', () => {
    const [one] = parseDecisions({
      decisions: [
        {
          decision_event_id: 21587,
          item_id: 'adr-1',
          effect: 'ADR 1 accepted',
          who: 'Owner',
          who_kind: 'person',
          standing: 'settled',
          verbatim: 'no quote on file',
          recorded_at: '2026-11-01T19:42:55.527Z',
          tags: [{ type: 'project', id: 'foundry' }],
          superseded_by: null,
          result: null,
          evidence: null,
          phase: 'close',
        },
        { item_id: 'no-event-id' },
      ],
    })
    expect(one?.eventId).toBe(21587)
    expect(one?.standing).toBe('settled')
    expect(one?.tags).toEqual([{ type: 'project', id: 'foundry' }])
    expect(one?.phase).toBe('close')
    expect(parseDecisions({ decisions: [{ item_id: 'x' }] })).toEqual([])
  })

  test('a card keeps what only the ledger derives, and never reads the bounded sections it drops', () => {
    const card = parseCard({
      item_id: 'NY-1',
      type: 'decision',
      title: 'decide',
      status: 'open',
      owner: null,
      claim: null,
      next_step: 'Answer open questions before continuing.',
      open_questions: [{ options: [{ label: 'a', description: 'first' }, { description: 'no label' }], question: 'which?', ask: 'pick one', default: 'hold', recommendation: 'b', unblocks: 'the row', effort: '5 min', added: '2026-09-15', asked_event_id: 3656 }],
      blockers: ['NY-0'],
      notes: [{ event_id: 2, text: 'a note' }],
      progress: [],
      links: [{ rel: 'pr', target: 'https://github.com/o/r/pull/1' }, { event_id: 8, rel: 'duplicated-by', target: 'NY-9' }],
      decisions: [],
      decision_records: [],
      tried: [],
      stop: null,
      footer: 'This card is a projection',
      revision: { id: 9, hash: 'abc' },
      source_event_ids: [1, 2, 'x'],
    })
    expect(card.questions[0]?.fallback).toBe('hold')
    expect(card.questions[0]?.askedEventId).toBe(3656)
    expect(card.blockers).toEqual([{ eventId: null, text: 'NY-0', href: null }])
    expect(card.questions[0]?.options).toEqual([{ label: 'a', description: 'first' }])
    expect(card.duplicatedBy).toEqual([{ eventId: 8, text: 'NY-9', href: null }])
    // The card is bounded: its links, notes, decisions, records, tried and stop are not carried.
    for (const dropped of ['links', 'notes', 'decisions', 'records', 'tried', 'stop']) expect(dropped in card).toBe(false)
    expect(card.revision).toEqual({ id: 9, hash: 'abc' })
    expect(card.sourceEventIds).toEqual([1, 2])
    expect(card.events).toEqual([])
  })

  test('events come newest first with a one-line summary per kind', () => {
    const parsed = parseEvents({
      completeness: { events_on_item: 3, events_returned: 3, events_decayed: 1 },
      events: [
        { id: 1, kind: 'item.created', actor: 'seat', harness: 'claude', model: 'm', recorded_at: '2026-10-12T20:29:19Z', payload: { type: 'ticket', title: 'first\nsecond line' } },
        { id: 2, kind: 'item.state', actor: null, harness: 'cli', model: null, recorded_at: '2026-10-13T00:00:00Z', payload: { status: 'closed' } },
        { kind: 'no-id' },
      ],
    })
    expect(parsed.error).toBe(null)
    expect(parsed.events[1]?.payload).toEqual({ type: 'ticket', title: 'first\nsecond line' })
    expect(parsed.onItem).toBe(3)
    expect(parsed.decayed).toBe(1)
    expect(parsed.events.map(one => one.id)).toEqual([2, 1])
    expect(parsed.events[1]?.summary).toBe('ticket "first"')
    expect(parsed.events[0]?.summary).toBe('status → closed')
  })

  test('an export-item answer with no list of events is an error, not an empty log', () => {
    for (const bad of [null, {}, { events: 'x' }, { completeness: {} }, 'text']) {
      const parsed = parseEvents(bad)
      expect(parsed.events).toEqual([])
      expect(parsed.error).toBe('the ledger answered export-item with no list of events')
    }
    expect(parseEvents({ events: [] }).error).toBe(null)
  })

  test('summaries name what each kind records', () => {
    expect(summarize('decision.asked', { question: 'merge?' })).toBe('merge?')
    expect(summarize('decision.elected', { chosen: 'Elect (b)', question: 'q' })).toBe('elected: Elect (b)')
    expect(summarize('decision.recorded', { standing: 'settled', effect: 'ADR 1', who: 'Owner' })).toBe('settled: ADR 1 (Owner)')
    expect(summarize('outside.recorded', { what: 'ratification', text: 'ADR 1 accepted', who: 'Owner' })).toBe('ratification: ADR 1 accepted (Owner)')
    expect(summarize('item.linked', { rel: 'pr', target: 'https://x' })).toBe('pr https://x')
    expect(summarize('loop.done', { operation: 'review', verdict: 'pass' })).toBe('review pass')
    expect(summarize('loop.intent', { operation: 'build', target: '-' })).toBe('intends build -')
    expect(summarize('ledger.system', { system: 'home' })).toBe('system home')
    expect(summarize('utterance.captured', { text: '[prompt omitted: 8 bytes]', origin: 'person' })).toBe('[prompt omitted: 8 bytes]')
    expect(summarize('something.new', { count: 2, name: 'x' })).toBe('count=2 name=x')
    expect(summarize('something.new', 'plain')).toBe('plain')
  })

  test('search hits keep the item they point at', () => {
    const hits = parseHits({
      cards: [
        { id: 'event:1', item_id: null, doc_type: 'utterance', title: 'words', snippet: 'the [words]', date: '2026-11-05T12:14:56Z', score: 8.8 },
        { id: 'EN1', item_id: 'EN1', doc_type: 'item', title: 'an item', snippet: 'ticket closed', date: '2026-10-20T01:52:47Z', score: 1.3, status: 'closed' },
        { title: 'no id' },
      ],
    })
    expect(hits.map(one => one.id)).toEqual(['event:1', 'EN1'])
    expect(hits[0]?.itemId).toBe(null)
    expect(hits[1]?.itemId).toBe('EN1')
    expect(hits[1]?.status).toBe('closed')
  })

  test('verify reads the event count, or the refusal', () => {
    expect(parseVerify(ok({ events: 22661 }), '2026-11-06T00:00:00Z')).toEqual({ ok: true, events: 22661, message: 'ok, 22661 events', at: '2026-11-06T00:00:00Z' })
    expect(parseVerify(refused('chain', 'hash mismatch at event 12'), 'now')).toEqual({ ok: false, events: 0, message: 'hash mismatch at event 12', at: 'now' })
  })
})

describe('export-item provenance', () => {
  test('an event carries its session, idempotency key and hash for the expanded timeline row', () => {
    const parsed = parseEvents({
      completeness: { events_on_item: 1, events_returned: 1, events_decayed: 0 },
      events: [{ id: 5, kind: 'item.note', actor: 'a', harness: 'h', model: 'm', session: 's-1', idempotency_key: 'k-5', hash: 'h-5', recorded_at: '2026-10-30T12:00:00Z', payload: { text: 'x' } }],
    })
    expect(parsed.events[0]).toMatchObject({ session: 's-1', idempotencyKey: 'k-5', hash: 'h-5', model: 'm' })
    const bare = parseEvents({ events: [{ id: 6, kind: 'item.note', recorded_at: '2026-10-30T12:00:00Z', payload: {} }] })
    expect(bare.events[0]).toMatchObject({ session: null, idempotencyKey: '', hash: '' })
  })
})
