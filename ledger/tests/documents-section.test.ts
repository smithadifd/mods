import { describe, expect, test } from 'claude-code/testing'

import type { Event } from '../types'
import { dataOf, parseEvents } from '../hooks/cli'
import { DOC_DIGEST_CHARS, documentLine, documentsOf, shownPayload, stripOf, timelineOf, unreadableDocumentLine, whenOf } from '../hooks/model'
import type { DocumentRow, ReadableDocument } from '../hooks/model'
import { LEDGER_0_1_20_DOCUMENTS_DOC_SHOW_STDOUT, LEDGER_0_1_20_DOCUMENTS_EXPORT_ITEM_STDOUT } from './ledger-0.1.20-documents'

function ev(id: number, kind: string, payload: Record<string, unknown>, recordedAt = '2026-11-05T12:00:00Z'): Event {
  return { id, kind, actor: 'seat', harness: 'cli', model: null, session: null, idempotencyKey: `key-${id}`, hash: `hash-${id}`, recordedAt, summary: `summary of ${kind} ${id}`, payload }
}

const SHA = 'ab'.repeat(32)

/** A well-formed version 1 payload, as `ledger doc add` writes it; `over` replaces or adds keys. */
function doc(id: number, over: Record<string, unknown> = {}): Event {
  return ev(id, 'doc.attached', { role: 'brief', title: `doc ${id}`, mime: 'text/plain', size: 10, sha256: SHA, content_b64: 'AAAA', ...over })
}

function readable(row: DocumentRow | undefined): ReadableDocument {
  if (row === undefined || !row.readable) throw new Error(`not a readable row: ${JSON.stringify(row)}`)
  return row
}

// The real export: a ledger 0.1.20 `export-item` of one item with two documents attached by `ledger doc add`.
const CAPTURED = parseEvents(dataOf('export-item', { exitCode: 0, stdout: LEDGER_0_1_20_DOCUMENTS_EXPORT_ITEM_STDOUT, stderr: '' }))
const SHOWN = (JSON.parse(LEDGER_0_1_20_DOCUMENTS_DOC_SHOW_STDOUT) as { data: { documents: Record<string, unknown>[] } }).data.documents
const RAW = (JSON.parse(LEDGER_0_1_20_DOCUMENTS_EXPORT_ITEM_STDOUT) as { data: { events: { id: number; kind: string; payload: Record<string, unknown> }[] } }).data.events

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** The test's own base64 decoder (the fixture's documents are ASCII text), to know which bytes must never be drawn. */
function decode(b64: string): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const ch of b64.replace(/=+$/, '')) {
    value = ((value << 6) | B64.indexOf(ch)) & 0xffffff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out += String.fromCharCode((value >> bits) & 0xff)
    }
  }
  return out
}

/** A payload without the named keys. */
function without(payload: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !keys.includes(key)))
}

/** Each captured document's content_b64, and the non-empty lines its bytes decode to: never part of any row or summary. */
const CONTENT = RAW.filter(one => one.kind === 'doc.attached').map(one => String(one.payload.content_b64))
const DECODED = CONTENT.flatMap(b64 =>
  decode(b64)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== ''),
)

describe('the Documents section against a captured ledger 0.1.20 export', () => {
  const rows = documentsOf(CAPTURED.events)

  test('the capture reads as three events: the item and its two documents, the second attached over a credential-shape hit', () => {
    expect(CAPTURED.error).toBe(null)
    expect(CAPTURED.events.map(one => [one.id, one.kind])).toEqual([
      [3, 'doc.attached'],
      [2, 'doc.attached'],
      [1, 'item.created'],
    ])
    expect(RAW.find(one => one.id === 3)?.payload.credential_override).toBe(true)
    expect('credential_override' in (RAW.find(one => one.id === 2)?.payload ?? {})).toBe(false)
    expect(CONTENT).toHaveLength(2)
    // The decoder reads the fixture's bytes back: the brief's Markdown, then the receipt's line.
    expect(DECODED[0]).toBe('# The brief')
    expect(DECODED.length).toBe(3)
    expect(DECODED[2]!.startsWith('receipt: ')).toBe(true)
  })

  test('two rows, newest first: name (the title, or the role with none), role, mime, size, short digest, when and by whom, and the marker on the right row only', () => {
    expect(rows.map(one => one.eventId)).toEqual([3, 2])
    const [receipt, brief] = [readable(rows[0]), readable(rows[1])]
    const at = (id: number): string => whenOf(CAPTURED.events.find(one => one.id === id)!.recordedAt)
    expect(receipt).toEqual({ eventId: 3, readable: true, name: 'review-receipt', role: 'review-receipt', mime: 'application/octet-stream', size: '35 bytes', digest: 'ff2a34781a28', at: at(3), by: 'seat-a/cli', override: true })
    expect(brief).toEqual({ eventId: 2, readable: true, name: 'The brief', role: 'brief', mime: 'text/markdown', size: '42 bytes', digest: 'd82b5d187c28', at: at(2), by: 'seat-a/cli', override: false })
    expect(documentLine(brief)).toBe(`The brief · brief · text/markdown · 42 bytes · d82b5d187c28 · ${at(2)} · seat-a/cli`)
  })

  test('each row agrees with the ledger\'s own `doc show` of the same item: event id, role, size, the start of the sha256, the override', () => {
    const byId = new Map(rows.map(one => [one.eventId, readable(one)]))
    expect(SHOWN).toHaveLength(2)
    for (const shown of SHOWN) {
      const row = byId.get(shown.event_id as number)!
      expect(row.role).toBe(shown.role)
      expect(row.mime).toBe(shown.mime)
      expect(row.size).toBe(`${shown.size} bytes`)
      expect(row.digest).toBe(String(shown.sha256).slice(0, 12))
      expect(row.override).toBe(shown.credential_override)
      expect(row.name).toBe(shown.title ?? shown.role)
    }
  })

  test('the digest is the first twelve hex characters, never the whole sha256', () => {
    expect(DOC_DIGEST_CHARS).toBe(12)
    for (const row of rows.map(readable)) {
      const full = String(RAW.find(one => one.id === row.eventId)!.payload.sha256)
      expect(full).toHaveLength(64)
      expect(row.digest).toBe(full.slice(0, 12))
      expect(documentLine(row)).not.toContain(full)
    }
  })

  test('the strip carries Documents on m with the row count', () => {
    expect(stripOf(CAPTURED.events).find(entry => entry.section === 'documents')).toEqual({ section: 'documents', label: 'Documents', hotkey: 'm', count: '2' })
  })

  test('no row, no timeline line and no shown payload holds the content_b64 value or the bytes it decodes to', () => {
    const drawn = [
      ...rows.map(one => (one.readable ? documentLine(one) : unreadableDocumentLine(one))),
      ...timelineOf(CAPTURED.events, 'all', 'newest').map(one => one.summary),
      ...CAPTURED.events.map(one => JSON.stringify(shownPayload(one))),
    ]
    for (const text of drawn) {
      for (const b64 of CONTENT) expect(text).not.toContain(b64.slice(0, 12))
      for (const line of DECODED) expect(text).not.toContain(line)
    }
  })

  test('an untitled document\'s timeline line is drawn from its display fields, not the generic summary that would carry its bytes', () => {
    const untitled = CAPTURED.events.find(one => one.id === 3)!
    // The generic one-line summary of a payload without a title lists its string fields, content_b64 among them.
    expect(untitled.summary).toContain(CONTENT[1]!.slice(0, 12))
    const line = timelineOf(CAPTURED.events, 'all', 'newest').find(one => one.id === 3)!.summary
    expect(line).toBe('review-receipt · 35 bytes · ff2a34781a28 · credential override')
    expect(timelineOf(CAPTURED.events, 'all', 'newest').find(one => one.id === 2)!.summary).toBe('The brief · 42 bytes · d82b5d187c28')
  })

  test('an expanded document payload names its size in place of content_b64 and keeps every other field', () => {
    const brief = CAPTURED.events.find(one => one.id === 2)!
    expect(shownPayload(brief)).toEqual({ ...brief.payload, content_b64: '(not shown: 42 bytes)' })
    expect(shownPayload(CAPTURED.events.find(one => one.id === 3)!)).toMatchObject({ content_b64: '(not shown: 35 bytes)', credential_override: true })
    // Another kind's payload is drawn as the ledger wrote it.
    const created = CAPTURED.events.find(one => one.id === 1)!
    expect(shownPayload(created)).toBe(created.payload)
  })
})

describe('the Documents grammar: one row per doc.attached event, newest first', () => {
  test('an item with no documents has no rows and an en dash in the strip', () => {
    const events = [ev(1, 'item.created', { type: 'ticket', title: 't' }), ev(2, 'item.note', { text: 'a note' })]
    expect(documentsOf(events)).toEqual([])
    expect(stripOf(events).find(entry => entry.section === 'documents')?.count).toBe('–')
    expect(stripOf([]).find(entry => entry.section === 'documents')?.count).toBe('–')
    expect(stripOf(null).find(entry => entry.section === 'documents')?.count).toBe('?')
  })

  test('an event of any other kind never makes a row, however close its name or its payload', () => {
    const shaped = { role: 'brief', title: 'shaped', mime: 'text/plain', size: 1, sha256: SHA, content_b64: 'AA==' }
    const others = ['doc.attachedx', 'doc.Attached', 'doc.attached ', ' doc.attached', 'doc.detached', 'doc', 'item.note', 'doc_attached', 'DOC.ATTACHED', '']
    const events = others.map((kind, index) => ev(index + 1, kind, shaped))
    expect(documentsOf(events)).toEqual([])
    expect(documentsOf([...events, doc(99)]).map(one => one.eventId)).toEqual([99])
  })

  test('rows come newest first by event id, whatever order the events arrive in', () => {
    expect(documentsOf([doc(5), doc(9), doc(1), doc(7)]).map(one => one.eventId)).toEqual([9, 7, 5, 1])
  })

  test('a payload missing its title shows the role in its place; a missing size, mime or role is an en dash; the rest of the row stands', () => {
    expect(readable(documentsOf([ev(1, 'doc.attached', without(doc(1).payload, 'title'))])[0])).toMatchObject({ name: 'brief', role: 'brief', size: '10 bytes', digest: 'abababababab' })
    expect(readable(documentsOf([ev(2, 'doc.attached', without(doc(2).payload, 'size'))])[0])).toMatchObject({ name: 'doc 2', size: '–', mime: 'text/plain' })
    const row = readable(documentsOf([ev(3, 'doc.attached', without(doc(3).payload, 'mime', 'role', 'title'))])[0])
    expect(row).toMatchObject({ name: '–', role: '–', mime: '–', size: '10 bytes', digest: 'abababababab', override: false })
    expect(documentLine(row)).toMatch(/^– · – · – · 10 bytes · abababababab · /)
  })

  test('a display field of the wrong type or an empty one is an en dash, never a guess', () => {
    const row = readable(documentsOf([doc(1, { title: 42, role: '', mime: ['text/plain'], size: '10' })])[0])
    expect(row).toMatchObject({ name: '–', role: '–', mime: '–', size: '–' })
    for (const size of [-1, 1.5, Number.NaN, null, true]) expect(readable(documentsOf([doc(1, { size })])[0]).size).toBe('–')
    expect(readable(documentsOf([doc(1, { size: 0 })])[0]).size).toBe('0 bytes')
    expect(readable(documentsOf([doc(1, { size: 1 })])[0]).size).toBe('1 byte')
    expect(readable(documentsOf([doc(1, { size: 65536 })])[0]).size).toBe('65,536 bytes')
  })

  test('no actor, no harness and no time are en dashes too', () => {
    const row = readable(documentsOf([{ ...doc(1), actor: null, harness: null, recordedAt: '' }])[0])
    expect(row).toMatchObject({ by: '–', at: '–' })
    expect(readable(documentsOf([{ ...doc(1), actor: null }])[0]).by).toBe('cli')
  })

  test('a title or role with line breaks or control characters is drawn on one line', () => {
    const row = readable(documentsOf([doc(1, { title: 'first\nsecond\r\n\tthird\u0007', role: 'other\u001b[31m' })])[0])
    expect(row.name).toBe('first second third')
    expect(row.role).toBe('other [31m')
  })

  test('the override marker shows only when credential_override is exactly true', () => {
    expect(readable(documentsOf([doc(1, { credential_override: true })])[0]).override).toBe(true)
    for (const value of [false, 'true', 1, null, {}, undefined]) expect(readable(documentsOf([doc(1, { credential_override: value })])[0]).override).toBe(false)
    expect(readable(documentsOf([doc(1)])[0]).override).toBe(false)
  })

  test('a field the pane does not name is ignored', () => {
    expect(readable(documentsOf([doc(1, { path: '/elsewhere', storage: 'by-path', extra: { nested: true } })])[0])).toMatchObject({ name: 'doc 1', size: '10 bytes' })
  })
})

describe('a document payload the pane cannot read is one unreadable row, never dropped and never a crash', () => {
  test('a sha256 that is not 64 lowercase hex characters: upper case, short, long, padded, not a string, missing', () => {
    const bad = [SHA.toUpperCase(), SHA.slice(0, 63), `${SHA}a`, ` ${SHA}`, `${SHA}\n`, 'g'.repeat(64), 12, null, ['x']]
    const events = [...bad.map((sha256, index) => doc(index + 1, { sha256 })), ev(bad.length + 1, 'doc.attached', { role: 'brief', size: 1 })]
    const rows = documentsOf(events)
    expect(rows).toHaveLength(events.length)
    for (const row of rows) {
      expect(row.readable).toBe(false)
      expect(unreadableDocumentLine(row as Extract<DocumentRow, { readable: false }>)).toBe(`unreadable document event ${row.eventId}: its sha256 is not 64 lowercase hex characters`)
    }
  })

  test('a payload that is not an object: null, a string, an array, a number', () => {
    const odd = [null, 'payload', [SHA], 7].map((payload, index) => ({ ...doc(index + 1), payload: payload as never }))
    const rows = documentsOf(odd)
    expect(rows.map(one => [one.eventId, one.readable])).toEqual([
      [4, false],
      [3, false],
      [2, false],
      [1, false],
    ])
    expect(unreadableDocumentLine(rows[0] as Extract<DocumentRow, { readable: false }>)).toBe('unreadable document event 4: the payload is not an object')
    expect(() => [timelineOf(odd, 'all', 'newest'), stripOf(odd), odd.map(shownPayload)]).not.toThrow()
    expect(odd.map(one => shownPayload(one))).toEqual([{}, {}, {}, {}])
  })

  test('through the parser, a payload that is not an object still gives its unreadable row, beside a good one', () => {
    const parsed = parseEvents({
      completeness: { events_on_item: 2, events_returned: 2, events_decayed: 0 },
      events: [
        { id: 4, kind: 'doc.attached', actor: 'a', harness: 'cli', recorded_at: '2026-11-05T12:00:00Z', payload: 'not an object' },
        { id: 5, kind: 'doc.attached', actor: 'a', harness: 'cli', recorded_at: '2026-11-05T12:01:00Z', payload: { role: 'retro', sha256: SHA, size: 3, mime: 'text/plain', content_b64: 'YWJj' } },
      ],
    })
    const rows = documentsOf(parsed.events)
    expect(rows.map(one => [one.eventId, one.readable])).toEqual([
      [5, true],
      [4, false],
    ])
  })

  test('an unreadable row keeps its place among readable ones, and the strip counts it', () => {
    const events = [doc(1), doc(2, { sha256: 'nope' }), doc(3)]
    expect(documentsOf(events).map(one => [one.eventId, one.readable])).toEqual([
      [3, true],
      [2, false],
      [1, true],
    ])
    expect(stripOf(events).find(entry => entry.section === 'documents')?.count).toBe('3')
  })
})
