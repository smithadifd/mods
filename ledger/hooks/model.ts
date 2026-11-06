import type { Decision, Doctor, Item, Screen, Status } from '../types'

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
