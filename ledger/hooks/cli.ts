import type { AskOption, Decision, Detail, Doctor, Event, Hit, Item, Line, Question, Verify } from '../types'

/** How the pane reaches the ledger: the command's words, where to run it, which database. */
export type Cli = { argv: string[]; cwd: string | undefined; db: string }

/** What `$.process.run` resolves with; the fields the parsers read. */
export type Ran = { exitCode: number; stdout: string; stderr: string }

/** The only verbs the pane runs. Every one reads; none appends an event. */
export const READ_VERBS = ['doctor', 'query', 'ready', 'decisions', 'card', 'export-item', 'search', 'verify'] as const
export type Verb = (typeof READ_VERBS)[number]

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** The user's settings as a Cli; a blank command means `ledger` on PATH. */
export function cliFrom(options: Record<string, unknown>): Cli {
  const words = str(options.command)
    .trim()
    .split(/\s+/)
    .filter(word => word !== '')
  const folder = str(options.folder).trim()
  return {
    argv: words.length === 0 ? ['ledger'] : words,
    cwd: folder === '' ? undefined : folder,
    db: str(options.db).trim(),
  }
}

/** The argv for one read verb. A verb outside READ_VERBS is refused here, in code. */
export function argvFor(cli: Cli, verb: Verb, args: readonly string[] = []): string[] {
  if (!(READ_VERBS as readonly string[]).includes(verb)) throw new Error(`${verb} is not a read verb`)
  const db = cli.db === '' ? [] : ['--db', cli.db]
  return [...cli.argv, '--json', ...db, verb, ...args]
}

export type Envelope = { ok: true; data: unknown } | { ok: false; code: string; message: string }

function lastLine(text: string): string {
  const lines = text.trim().split('\n')
  return lines[lines.length - 1] ?? ''
}

/** The CLI's `{ok, data, error}` envelope, or why there is none. */
export function parseEnvelope(ran: Ran): Envelope {
  const stdout = ran.stdout.trim()
  if (stdout === '') {
    const reason = lastLine(ran.stderr)
    return { ok: false, code: 'no-output', message: reason === '' ? `the ledger command exited ${ran.exitCode}` : reason }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return { ok: false, code: 'no-json', message: `the ledger command printed no JSON: ${stdout.slice(0, 120)}` }
  }
  if (!isObject(parsed)) return { ok: false, code: 'no-json', message: 'the ledger command printed an unexpected shape' }
  if (parsed.ok === true) return { ok: true, data: parsed.data }
  const error = parsed.error
  if (isObject(error)) {
    const code = str(error.code) || 'refused'
    return { ok: false, code, message: str(error.message) || code }
  }
  return { ok: false, code: 'refused', message: str(error) || 'no reason given' }
}

/** A refusal the pane shows as such, with the verb that refused. */
export class LedgerError extends Error {
  readonly code: string
  readonly verb: Verb
  constructor(verb: Verb, code: string, message: string) {
    super(message)
    this.code = code
    this.verb = verb
  }
}

/** The envelope's data; `null` when the verb found nothing; a LedgerError otherwise. */
export function dataOf(verb: Verb, ran: Ran): unknown {
  const envelope = parseEnvelope(ran)
  if (envelope.ok) return envelope.data
  if (envelope.code === 'empty') return null
  throw new LedgerError(verb, envelope.code, envelope.message)
}

/** True when the refusal says the database is not there yet: the quick start, not an error. */
export function isMissingDatabase(error: unknown): boolean {
  if (!(error instanceof LedgerError)) return false
  return /does not exist|no such file|not found/i.test(error.message)
}

function item(row: Json): Item | null {
  const id = str(row.item_id)
  if (id === '') return null
  return {
    id,
    type: str(row.type),
    title: str(row.title),
    status: str(row.status),
    owner: strOrNull(row.owner),
    claim: strOrNull(row.claim),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    // Only when the row carries them: an older ledger's rows keep exactly the fields they had. A parent_id that is
    // not a non-empty string, or a children_open that is not a non-negative whole number, is dropped, so the row
    // renders flat.
    ...(strOrNull(row.parent_id) !== null ? { parentId: strOrNull(row.parent_id) } : {}),
    ...(typeof row.children_open === 'number' && Number.isInteger(row.children_open) && row.children_open >= 0 ? { childrenOpen: row.children_open } : {}),
  }
}

/** Items from `query` or `ready`. */
export function parseItems(data: unknown): Item[] {
  const rows = isObject(data) ? list(data.items) : []
  const items: Item[] = []
  for (const row of rows) {
    if (!isObject(row)) continue
    const one = item(row)
    if (one !== null) items.push(one)
  }
  return items
}

export function parseDoctor(data: unknown): Doctor {
  const root = isObject(data) ? data : {}
  const search = isObject(root.search) ? root.search : {}
  const expired = isObject(root.expired_claims) ? list(root.expired_claims.items) : []
  return {
    path: str(root.path),
    schemaVersion: num(root.schema_version),
    search: { status: str(search.status) || 'unknown', behind: num(search.new_events) },
    expiredClaims: expired.filter(isObject).map(row => ({
      itemId: str(row.item_id) || str(row.item) || str(row.id),
      holder: str(row.holder) || str(row.claim) || str(row.actor),
      expiresAt: str(row.expires_at) || str(row.expired_at),
    })),
  }
}

export function parseDecisions(data: unknown): Decision[] {
  const rows = isObject(data) ? list(data.decisions) : []
  const decisions: Decision[] = []
  for (const row of rows) {
    if (!isObject(row)) continue
    const eventId = numOrNull(row.decision_event_id)
    if (eventId === null) continue
    decisions.push({
      eventId,
      itemId: str(row.item_id),
      effect: str(row.effect),
      who: str(row.who),
      whoKind: str(row.who_kind),
      standing: str(row.standing),
      verbatim: str(row.verbatim),
      recordedAt: str(row.recorded_at),
      tags: list(row.tags)
        .filter(isObject)
        .map(tag => ({ type: str(tag.type), id: str(tag.id) })),
      supersededBy: numOrNull(row.superseded_by),
      result: strOrNull(row.result),
      evidence: strOrNull(row.evidence),
      phase: strOrNull(row.phase),
    })
  }
  return decisions
}

/** The first text a payload or card entry carries, by the keys the ledger uses. */
const TEXT_KEYS = ['text', 'title', 'question', 'chosen', 'effect', 'outcome', 'what', 'verdict', 'summary', 'reason', 'target', 'status', 'system', 'operation'] as const

function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (!isObject(value)) return ''
  for (const key of TEXT_KEYS) {
    const found = value[key]
    if (typeof found === 'string' && found !== '') return found
  }
  const pairs = Object.entries(value)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
    .map(([k, v]) => `${k}=${String(v)}`)
  return pairs.join(' ')
}

function firstLine(text: string): string {
  const line = text.split('\n').find(one => one.trim() !== '') ?? ''
  return line.trim()
}

function lineOf(value: unknown): Line {
  if (typeof value === 'string') return { eventId: null, text: value, href: hrefOf(value) }
  if (!isObject(value)) return { eventId: null, text: textOf(value), href: null }
  const rel = str(value.rel)
  const target = str(value.target) || str(value.url) || str(value.href)
  const text = target !== '' ? (rel === '' ? target : `${rel}: ${target}`) : textOf(value)
  return { eventId: numOrNull(value.event_id), text, href: hrefOf(target) ?? hrefOf(text) }
}

function hrefOf(text: string): string | null {
  const match = /https?:\/\/\S+/.exec(text)
  return match === null ? null : match[0]
}

function lines(value: unknown): Line[] {
  return list(value).map(lineOf)
}

function question(value: unknown): Question | null {
  if (!isObject(value)) return null
  const text = str(value.question) || str(value.ask)
  if (text === '') return null
  return {
    askedEventId: numOrNull(value.asked_event_id),
    options: list(value.options).flatMap((option): AskOption[] => {
      if (!isObject(option) || str(option.label) === '') return []
      return [{ label: str(option.label), description: str(option.description) }]
    }),
    question: text,
    ask: str(value.ask),
    fallback: str(value.default),
    recommendation: str(value.recommendation),
    unblocks: str(value.unblocks),
    effort: str(value.effort),
    added: str(value.added),
  }
}

/**
 * What only the card derives: next step, open questions after re-asks, blockers, duplicated-by.
 * The card is bounded, so links, notes, decisions, records, tried, stops and reviews are never read from it:
 * `parseEvents` carries the whole log and the item screen projects those from it.
 * `events` stay empty until `parseEvents` fills them.
 */
export function parseCard(data: unknown): Detail {
  const root = isObject(data) ? data : {}
  const revision = isObject(root.revision) ? root.revision : null
  return {
    id: str(root.item_id),
    type: str(root.type),
    title: str(root.title),
    status: str(root.status),
    owner: strOrNull(root.owner),
    claim: strOrNull(typeof root.claim === 'string' ? root.claim : isObject(root.claim) ? str(root.claim.holder) : null),
    nextStep: str(root.next_step),
    questions: list(root.open_questions)
      .map(question)
      .filter((one): one is Question => one !== null),
    blockers: lines(root.blockers),
    progress: lines(root.progress),
    duplicatedBy: list(root.links)
      .filter(isObject)
      .filter(row => row.rel === 'duplicated-by' && str(row.target) !== '')
      .map((row): Line => ({ eventId: numOrNull(row.event_id), text: str(row.target), href: null })),
    footer: str(root.footer),
    revision: revision === null ? null : { id: num(revision.id), hash: str(revision.hash) },
    sourceEventIds: list(root.source_event_ids).filter((one): one is number => typeof one === 'number'),
    events: [],
    eventsError: null,
    eventsOnItem: 0,
    eventsDecayed: 0,
  }
}

/** One line for an event, by what its kind records. */
export function summarize(kind: string, payload: unknown): string {
  const p = isObject(payload) ? payload : {}
  switch (kind) {
    case 'item.created':
      return `${str(p.type)} "${firstLine(str(p.title))}"`.trim()
    case 'item.state':
      return `status → ${str(p.status)}`
    case 'item.linked':
      return `${str(p.rel)} ${str(p.target)}`.trim()
    case 'item.spec':
      return `spec v${str(p.version) || textOf(p.version)}`.trim()
    case 'decision.asked':
      return firstLine(str(p.question))
    case 'decision.elected':
      return `elected: ${firstLine(str(p.chosen) || str(p.question))}`
    case 'decision.recorded':
      return `${str(p.standing)}: ${firstLine(str(p.effect))} (${str(p.who)})`
    case 'decision.held':
      return `held: ${firstLine(str(p.question) || str(p.reason))}`
    case 'outside.recorded':
      return `${str(p.what)}: ${firstLine(str(p.text))} (${str(p.who)})`
    case 'review.recorded':
      return `review ${str(p.verdict)}${p.round === undefined ? '' : ` round ${String(p.round)}`}`
    case 'loop.intent':
      return `intends ${str(p.operation)} ${str(p.target)}`.trim()
    case 'loop.done':
      return `${str(p.operation)} ${str(p.verdict)}`.trim()
    case 'loop.closed':
      return firstLine(str(p.outcome))
    case 'ledger.system':
      return `system ${str(p.system)}`
    default:
      return firstLine(textOf(isObject(payload) ? p : payload))
  }
}

/**
 * The item's log from `export-item`, newest first. `error` says why there is none: an answer
 * with no event list is a failed read, never an item with no events.
 */
export function parseEvents(data: unknown): { events: Event[]; onItem: number; decayed: number; error: string | null } {
  const root = isObject(data) ? data : {}
  if (!Array.isArray(root.events)) {
    return { events: [], onItem: 0, decayed: 0, error: 'the ledger answered export-item with no list of events' }
  }
  const completeness = isObject(root.completeness) ? root.completeness : {}
  const events: Event[] = []
  for (const row of list(root.events)) {
    if (!isObject(row)) continue
    const id = numOrNull(row.id)
    if (id === null) continue
    const kind = str(row.kind)
    events.push({
      id,
      kind,
      actor: strOrNull(row.actor),
      harness: strOrNull(row.harness),
      model: strOrNull(row.model),
      session: strOrNull(row.session),
      badSession: row.session !== undefined && row.session !== null && strOrNull(row.session) === null,
      idempotencyKey: str(row.idempotency_key),
      hash: str(row.hash),
      recordedAt: str(row.recorded_at),
      summary: summarize(kind, row.payload),
      payload: isObject(row.payload) ? row.payload : {},
    })
  }
  events.sort((a, b) => b.id - a.id)
  return { events, onItem: num(completeness.events_on_item), decayed: num(completeness.events_decayed), error: null }
}

export function parseHits(data: unknown): Hit[] {
  const rows = isObject(data) ? list(data.cards) : []
  const hits: Hit[] = []
  for (const row of rows) {
    if (!isObject(row)) continue
    const id = str(row.id)
    if (id === '') continue
    hits.push({
      id,
      itemId: strOrNull(row.item_id),
      docType: str(row.doc_type),
      title: str(row.title),
      snippet: str(row.snippet),
      date: str(row.date),
      score: num(row.score),
      status: strOrNull(row.status),
    })
  }
  return hits
}

export function parseVerify(ran: Ran, at: string): Verify {
  const envelope = parseEnvelope(ran)
  if (envelope.ok) {
    const root = isObject(envelope.data) ? envelope.data : {}
    return { ok: true, events: num(root.events), message: `ok, ${num(root.events)} events`, at }
  }
  return { ok: false, events: 0, message: envelope.message, at }
}
