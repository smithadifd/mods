import type { AskOption, Decision, DecisionRecord, Doctor, Election, Event, Item, ItemHeader, LinkRow, Note, Review, Screen, Spec, Status, Stop, Tried } from '../types'

export const STATUSES: readonly Status[] = ['open', 'claimed', 'blocked', 'closed']
export const SCREENS: readonly Screen[] = ['home', 'needs', 'items', 'item', 'decisions', 'search']

/** Theme keys, so the colors follow the person's own theme in light and dark. */
export const STATUS_COLOR: Record<Status, string> = {
  open: 'claude',
  claimed: 'warning',
  blocked: 'error',
  closed: 'subtle',
}

export const STANDING_COLOR: Record<string, string> = {
  settled: 'success',
  lean: 'warning',
  superseded: 'subtle',
}

export function statusColor(status: string): string {
  return (STATUS_COLOR as Record<string, string>)[status] ?? 'text'
}

export function standingColor(standing: string): string {
  return STANDING_COLOR[standing] ?? 'text'
}

/** A shape per status, so a status is told without its color. */
export const STATUS_GLYPH: Record<Status, string> = {
  open: '●',
  claimed: '◆',
  blocked: '✖',
  closed: '○',
}

export const STANDING_GLYPH: Record<string, string> = {
  settled: '●',
  lean: '◐',
  superseded: '○',
}

export function statusGlyph(status: string): string {
  return (STATUS_GLYPH as Record<string, string>)[status] ?? '·'
}

export function standingGlyph(standing: string): string {
  return STANDING_GLYPH[standing] ?? '·'
}

/** The color of an event kind in a timeline: decisions in the accent, states by status, bookkeeping dim. */
export function kindColor(kind: string, summary: string): string {
  if (kind === 'item.state') {
    const status = summary.replace(/^status → /, '')
    return statusColor(status)
  }
  if (kind.startsWith('decision.')) return 'claude'
  if (kind === 'review.recorded') return /fail|bug|block/i.test(summary) ? 'error' : 'success'
  if (kind.startsWith('loop.') || kind.startsWith('session.') || kind === 'item.progress') return 'subtle'
  return 'text'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parseIso(iso: string): number | null {
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/** `3d`, `2h`, `5m`, `now`; `?` for a date the ledger did not give. */
export function ageOf(iso: string, now: number): string {
  const then = parseIso(iso)
  if (then === null) return '?'
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  if (seconds < 45) return 'now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 14) return `${days}d`
  const weeks = Math.round(days / 7)
  if (weeks < 9) return `${weeks}w`
  return `${Math.round(days / 30)}mo`
}

/** `Oct 28` in the person's own time zone. */
export function dayOf(iso: string): string {
  const ms = parseIso(iso)
  if (ms === null) return '?'
  const date = new Date(ms)
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`
}

/** `Oct 28 14:02`. */
export function whenOf(iso: string): string {
  const ms = parseIso(iso)
  if (ms === null) return '?'
  const date = new Date(ms)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${dayOf(iso)} ${hh}:${mm}`
}

/** Pads or cuts `value` to exactly `width` cells (one cell per character). */
export function fit(value: string, width: number): string {
  if (width <= 0) return ''
  const chars = Array.from(value.replace(/\s+/g, ' '))
  if (chars.length > width) return width === 1 ? chars[0]! : `${chars.slice(0, width - 1).join('')}…`
  return chars.join('') + ' '.repeat(width - chars.length)
}

/** Cuts `value` to at most `width` cells, with an ellipsis when cut; never pads. */
export function cut(value: string, width: number): string {
  const chars = Array.from(value.replace(/\s+/g, ' '))
  if (chars.length <= width) return chars.join('')
  return width <= 1 ? '…' : `${chars.slice(0, width - 1).join('')}…`
}

export function thousands(n: number): string {
  return n.toLocaleString('en-US')
}

export type TypeCount = { type: string; total: number; counts: Record<Status, number> }

/** One row per item type, most items first, with its status split. */
export function countsByType(items: readonly Item[]): TypeCount[] {
  const byType = new Map<string, TypeCount>()
  for (const one of items) {
    const row = byType.get(one.type) ?? { type: one.type, total: 0, counts: { open: 0, claimed: 0, blocked: 0, closed: 0 } }
    row.total += 1
    if (one.status in row.counts) row.counts[one.status as Status] += 1
    byType.set(one.type, row)
  }
  return [...byType.values()].sort((a, b) => b.total - a.total || a.type.localeCompare(b.type))
}

export function countByStatus(items: readonly Item[]): Record<Status, number> {
  const counts: Record<Status, number> = { open: 0, claimed: 0, blocked: 0, closed: 0 }
  for (const one of items) if (one.status in counts) counts[one.status as Status] += 1
  return counts
}

export type Segment = { status: Status; cells: number }

/**
 * Splits `width` cells among the statuses in proportion to their counts
 * (largest remainder), every non-zero status keeping at least one cell.
 */
export function segments(counts: Record<Status, number>, width: number): Segment[] {
  const present = STATUSES.filter(status => counts[status] > 0)
  if (present.length === 0 || width <= 0) return []
  if (width <= present.length) return present.slice(0, width).map(status => ({ status, cells: 1 }))
  const total = present.reduce((sum, status) => sum + counts[status], 0)
  const exact = present.map(status => (counts[status] / total) * width)
  const cells = exact.map(value => Math.max(1, Math.floor(value)))
  let left = width - cells.reduce((sum, value) => sum + value, 0)
  const order = present
    .map((_, index) => index)
    .sort((a, b) => exact[b]! - cells[b]! - (exact[a]! - cells[a]!))
  for (const index of order) {
    if (left <= 0) break
    cells[index]! += 1
    left -= 1
  }
  while (left < 0) {
    let shrunk = false
    for (const index of [...order].reverse()) {
      if (left >= 0) break
      if (cells[index]! > 1) {
        cells[index]! -= 1
        left += 1
        shrunk = true
      }
    }
    if (!shrunk) break
  }
  return present.map((status, index) => ({ status, cells: cells[index]! }))
}

/** How many cells a type's bar takes next to the largest type's `width`. */
export function barLength(total: number, largest: number, width: number): number {
  if (total <= 0 || largest <= 0) return 0
  return Math.max(1, Math.round((total / largest) * width))
}

const DAY_MS = 24 * 60 * 60 * 1000

function localDayKey(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/** Items touched per local day for the last `days` days, oldest first, by their newest event. */
export function dailyTouches(items: readonly Item[], now: number, days: number): number[] {
  const index = new Map<string, number>()
  for (let back = days - 1; back >= 0; back -= 1) index.set(localDayKey(now - back * DAY_MS), days - 1 - back)
  const counts = new Array<number>(days).fill(0)
  for (const one of items) {
    const ms = Date.parse(one.updatedAt)
    if (Number.isNaN(ms)) continue
    const slot = index.get(localDayKey(ms))
    if (slot !== undefined) counts[slot]! += 1
  }
  return counts
}

const BARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

/** A sparkline, one block per value, scaled to the largest. */
export function sparkline(values: readonly number[]): string {
  const largest = Math.max(0, ...values)
  if (largest === 0) return values.map(() => '▁').join('')
  return values.map(value => (value <= 0 ? '▁' : BARS[Math.min(7, Math.ceil((value / largest) * 8) - 1)]!)).join('')
}

const STATUS_RANK: Record<string, number> = { claimed: 0, open: 1, blocked: 2, closed: 3 }

/** Claimed, then open, blocked, closed; newest first within a status. */
export function sortItems(items: readonly Item[]): Item[] {
  return [...items].sort(
    (a, b) =>
      (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) ||
      b.updatedAt.localeCompare(a.updatedAt) ||
      a.id.localeCompare(b.id, undefined, { numeric: true }),
  )
}

/** Oldest first by the field given. */
export function oldestFirst(items: readonly Item[], by: 'createdAt' | 'updatedAt'): Item[] {
  return [...items].sort((a, b) => a[by].localeCompare(b[by]) || a.id.localeCompare(b.id, undefined, { numeric: true }))
}

export const STATUS_FILTERS = ['all', 'ready', 'open', 'claimed', 'blocked', 'closed'] as const

/** The items list under the two filters; `ready` is the ledger's own unblocked set. */
export function filterItems(items: readonly Item[], ready: readonly string[], type: string, status: string): Item[] {
  const readySet = new Set(ready)
  return sortItems(
    items.filter(one => {
      if (type !== 'all' && one.type !== type) return false
      if (status === 'all') return true
      if (status === 'ready') return readySet.has(one.id)
      return one.status === status
    }),
  )
}

export function typesOf(items: readonly Item[]): string[] {
  return countsByType(items).map(row => row.type)
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, size)))
}

export function pageOf<T>(rows: readonly T[], page: number, size: number): T[] {
  const start = Math.max(0, page) * Math.max(1, size)
  return rows.slice(start, start + Math.max(1, size))
}

export type Needs = {
  decisions: Item[]
  blocked: Item[]
  claimed: Item[]
  expired: Doctor['expiredClaims']
}

/** What waits on a person: open decisions oldest first, blocked items, held claims, expired claims. A claim past its lease is expired, not held. */
export function needsYou(items: readonly Item[], doctor: Doctor | null): Needs {
  const expired = doctor?.expiredClaims ?? []
  const expiredIds = new Set(expired.map(one => one.itemId))
  return {
    decisions: oldestFirst(
      items.filter(one => one.type === 'decision' && one.status === 'open'),
      'createdAt',
    ),
    blocked: oldestFirst(
      items.filter(one => one.status === 'blocked'),
      'updatedAt',
    ),
    claimed: oldestFirst(
      items.filter(one => one.status === 'claimed' && !expiredIds.has(one.id)),
      'updatedAt',
    ),
    expired,
  }
}

export const STANDING_FILTERS = ['all', 'settled', 'lean', 'superseded'] as const

export function filterDecisions(decisions: readonly Decision[], standing: string): Decision[] {
  const kept = standing === 'all' ? [...decisions] : decisions.filter(one => one.standing === standing)
  return kept.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.eventId - a.eventId)
}

export type Asked =
  | { screen: Screen }
  | { screen: 'items'; status: string }
  | { id: string }
  | { query: string }

const ID = /^[A-Za-z][A-Za-z0-9._-]*$/

/**
 * `/ledger`, `/ledger needs`, `/ledger blocked`, `/ledger NY-148`, `/ledger merge train`:
 * a screen, a status filter on the items list, one id, or words to search.
 */
export function parseCommandArgs(args: string): Asked {
  const words = args.trim().split(/\s+/).filter(word => word !== '')
  if (words.length === 0) return { screen: 'home' }
  const first = words[0]!.toLowerCase()
  if (words.length === 1) {
    if (first === 'needs' || first === 'needs-you' || first === 'you') return { screen: 'needs' }
    if (first === 'home' || first === 'items' || first === 'decisions' || first === 'search') return { screen: first }
    if ((STATUS_FILTERS as readonly string[]).includes(first)) return { screen: 'items', status: first }
    if (ID.test(words[0]!)) return { id: words[0]! }
  }
  return { query: words.join(' ') }
}

/*
 * The item screen's sections, projected from the item's own events (`export-item`).
 * Each is a pure function of the event list: no bound on the resume card can hide a row.
 * An event whose payload lacks the field a row is built on keeps its row, drawn with
 * the event's one-line summary in that field's place; nothing here throws.
 */

type Payload = Record<string, unknown>

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function whole(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string' && one !== '') : []
}

function oldestFirstEvents(events: readonly Event[]): Event[] {
  return [...events].sort((a, b) => a.id - b.id)
}

function payloadOf(event: Event): Payload {
  return typeof event.payload === 'object' && event.payload !== null && !Array.isArray(event.payload) ? event.payload : {}
}

/** The field when present, else the event's own one-line summary, so a malformed event still draws. */
function orSummary(value: string, event: Event): string {
  return value !== '' ? value : event.summary
}

function httpHref(target: string): string | null {
  const match = /^https?:\/\/\S+$/.exec(target.trim())
  return match === null ? null : match[0]
}

/** Where the item came from and when, and how long a claim runs. */
export function headerOf(events: readonly Event[], status: string): ItemHeader {
  const ordered = oldestFirstEvents(events)
  const created = ordered.find(one => one.kind === 'item.created')
  let leaseEnds: string | null = null
  if (status === 'claimed') {
    const states = ordered.filter(one => one.kind === 'item.state')
    const latest = states[states.length - 1]
    if (latest !== undefined) {
      const p = payloadOf(latest)
      if (text(p.status) === 'claimed' && text(p.expires_at) !== '') {
        leaseEnds = text(p.expires_at)
        // A heartbeat on the current claim renews it: the latest stamp wins, as the ledger's own lease view reads it.
        for (const one of ordered) {
          if (one.kind !== 'item.progress' || one.id <= latest.id) continue
          const renewed = text(payloadOf(one).expires_at)
          if (renewed > leaseEnds) leaseEnds = renewed
        }
      }
    }
  }
  const source = created === undefined ? '' : text(payloadOf(created).source)
  return { source: source === '' ? null : source, createdAt: created === undefined ? null : created.recordedAt, leaseEnds }
}

/** Every `item.linked` event, plus the PR a loop build produced, once per relation and target. */
export function linksOf(events: readonly Event[]): LinkRow[] {
  const rows: LinkRow[] = []
  const seen = new Set<string>()
  for (const event of oldestFirstEvents(events)) {
    const p = payloadOf(event)
    let rel = ''
    let target = ''
    if (event.kind === 'item.linked') {
      rel = text(p.rel)
      target = text(p.target)
      if (target === '') {
        rows.push({ eventId: event.id, rel: rel === '' ? '?' : rel, target: event.summary, href: null, copyText: null })
        continue
      }
    } else if (event.kind === 'loop.done' && text(p.operation) === 'build' && text(p.target) !== '') {
      rel = 'pr'
      target = text(p.target)
    } else {
      continue
    }
    const key = `${rel}\n${target}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ eventId: event.id, rel: rel === '' ? '?' : rel, target, href: httpHref(target), copyText: rel === 'url' ? target : null })
  }
  return rows
}

/** Every `decision.elected` event: the chosen option, the rejected ones, the scope and the quote reference. */
export function electionsOf(events: readonly Event[]): Election[] {
  return oldestFirstEvents(events)
    .filter(one => one.kind === 'decision.elected')
    .map(event => {
      const p = payloadOf(event)
      return {
        eventId: event.id,
        recordedAt: event.recordedAt,
        question: text(p.question),
        chosen: orSummary(text(p.chosen), event),
        chosenDescription: text(p.chosen_description),
        rejected: strings(p.rejected),
        scope: text(p.scope),
        quoteRef: whole(p.quote_ref),
        quotes: strings(p.quotes),
        askedEventId: whole(p.asked_event_id),
      }
    })
}

/** Every `decision.recorded` event with its latest standing and result applied. */
export function recordsOf(events: readonly Event[]): DecisionRecord[] {
  const ordered = oldestFirstEvents(events)
  const standing = new Map<number, { standing: string; supersededBy: number | null }>()
  const result = new Map<number, { result: string; evidence: string }>()
  for (const event of ordered) {
    const p = payloadOf(event)
    const target = whole(p.decision_event_id)
    if (target === null) continue
    if (event.kind === 'decision.standing' && text(p.standing) !== '') standing.set(target, { standing: text(p.standing), supersededBy: whole(p.superseded_by) })
    if (event.kind === 'decision.result' && text(p.result) !== '') result.set(target, { result: text(p.result), evidence: text(p.evidence) })
  }
  return ordered
    .filter(one => one.kind === 'decision.recorded')
    .map(event => {
      const p = payloadOf(event)
      const later = standing.get(event.id)
      const came = result.get(event.id)
      return {
        eventId: event.id,
        recordedAt: event.recordedAt,
        who: text(p.who),
        whoKind: text(p.who_kind),
        relayedBy: text(p.relayed_by),
        standing: later?.standing ?? text(p.standing),
        supersededBy: later?.supersededBy ?? null,
        effect: orSummary(text(p.effect), event),
        tags: (Array.isArray(p.tags) ? p.tags : []).map(tag => {
          const t = typeof tag === 'object' && tag !== null ? (tag as Payload) : {}
          return `${text(t.type)}:${text(t.id)}`
        }),
        verbatim: text(p.verbatim),
        phase: text(p.phase),
        evidence: text(p.evidence),
        result: came?.result ?? '',
        resultEvidence: came?.evidence ?? '',
      }
    })
}

/** The latest `item.stopped` stamp: where work stopped, the skills to invoke next, the refs to read. */
export function stopOf(events: readonly Event[]): Stop | null {
  const stops = oldestFirstEvents(events).filter(one => one.kind === 'item.stopped')
  const event = stops[stops.length - 1]
  if (event === undefined) return null
  const p = payloadOf(event)
  return { eventId: event.id, recordedAt: event.recordedAt, point: orSummary(text(p.point), event), phase: text(p.phase), skills: strings(p.skills), refs: strings(p.refs) }
}

/** Every `item.tried` event with its outcome and evidence. */
export function triedOf(events: readonly Event[]): Tried[] {
  return oldestFirstEvents(events)
    .filter(one => one.kind === 'item.tried')
    .map(event => {
      const p = payloadOf(event)
      return { eventId: event.id, what: orSummary(text(p.what), event), outcome: text(p.outcome), phase: text(p.phase), evidence: text(p.evidence) }
    })
}

/** Every recorded review, and every review step the work loop completed (its head, verdict and PR). */
export function reviewsOf(events: readonly Event[]): Review[] {
  const rows: Review[] = []
  for (const event of oldestFirstEvents(events)) {
    const p = payloadOf(event)
    if (event.kind === 'review.recorded') {
      rows.push({
        eventId: event.id,
        round: whole(p.round),
        verdict: orSummary(text(p.verdict), event),
        head: '',
        pr: '',
        reviewer: text(p.reviewer),
        evidence: text(p.evidence),
        findings: strings(p.findings),
      })
    } else if (event.kind === 'loop.done' && text(p.operation) === 'review') {
      rows.push({ eventId: event.id, round: null, verdict: orSummary(text(p.verdict), event), head: text(p.head), pr: text(p.target), reviewer: '', evidence: '', findings: [] })
    }
  }
  return rows
}

/** Every `item.note`. */
export function notesOf(events: readonly Event[]): Note[] {
  return oldestFirstEvents(events)
    .filter(one => one.kind === 'item.note')
    .map(event => {
      const body = orSummary(text(payloadOf(event).text), event)
      return { eventId: event.id, text: body, href: httpHref(body.split(/\s+/).find(word => httpHref(word) !== null) ?? '') }
    })
}

/** The latest `item.spec`: the item's current spec. */
export function specOf(events: readonly Event[]): Spec | null {
  const specs = oldestFirstEvents(events).filter(one => one.kind === 'item.spec')
  const event = specs[specs.length - 1]
  if (event === undefined) return null
  const p = payloadOf(event)
  return {
    eventId: event.id,
    version: whole(p.version),
    title: orSummary(text(p.title), event),
    body: text(p.body_md),
    acceptance: text(p.acceptance),
    size: text(p.size),
    mergeClass: text(p.merge_class),
    source: text(p.source),
  }
}

/** The options of the ask event `askedEventId`, in full; `null` when the log holds no such ask. */
export function optionsOf(events: readonly Event[], askedEventId: number | null): AskOption[] | null {
  if (askedEventId === null) return null
  const asked = events.find(one => one.id === askedEventId && one.kind === 'decision.asked')
  if (asked === undefined) return null
  const options = payloadOf(asked).options
  if (!Array.isArray(options)) return null
  const rows: AskOption[] = []
  for (const option of options) {
    const o = typeof option === 'object' && option !== null ? (option as Payload) : {}
    if (text(o.label) !== '') rows.push({ label: text(o.label), description: text(o.description) })
  }
  return rows
}

/** `minted Oct 30 from roadmaps/x.md:69@abc · lease ends Nov 7 14:02`; empty when the log says neither. */
export function headerLine(header: ItemHeader): string {
  const parts: string[] = []
  if (header.createdAt !== null) parts.push(`minted ${dayOf(header.createdAt)}${header.source === null ? '' : ` from ${header.source}`}`)
  else if (header.source !== null) parts.push(`minted from ${header.source}`)
  if (header.leaseEnds !== null) parts.push(`lease ends ${whenOf(header.leaseEnds)}`)
  return parts.join(' · ')
}
