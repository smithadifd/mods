export type Status = 'open' | 'claimed' | 'blocked' | 'closed'
export type Standing = 'lean' | 'settled' | 'superseded'
export type Screen = 'home' | 'needs' | 'items' | 'item' | 'decisions' | 'search'

/** One row of `ledger query` or `ledger ready`. */
export type Item = {
  id: string
  type: string
  title: string
  status: Status | string
  owner: string | null
  claim: string | null
  createdAt: string
  updatedAt: string
}

/** What `ledger doctor` says about the database. */
export type Doctor = {
  path: string
  schemaVersion: number
  search: { status: string; behind: number }
  expiredClaims: { itemId: string; holder: string; expiresAt: string }[]
}

/** One decision record from `ledger decisions`. */
export type Decision = {
  eventId: number
  itemId: string
  effect: string
  who: string
  whoKind: string
  standing: Standing | string
  verbatim: string
  recordedAt: string
  tags: { type: string; id: string }[]
  supersededBy: number | null
  result: string | null
  evidence: string | null
  phase: string | null
}

export type Question = {
  askedEventId: number | null
  question: string
  ask: string
  fallback: string
  recommendation: string
  unblocks: string
  effort: string
  added: string
}

/** A line of a card section, with the event it came from when the card says. */
export type Line = { eventId: number | null; text: string; href: string | null }

/** One event of the item's log, from `ledger export-item`. */
export type Event = {
  id: number
  kind: string
  actor: string | null
  harness: string | null
  model: string | null
  recordedAt: string
  summary: string
}

/** An item's resume card plus its log. */
export type Detail = {
  id: string
  type: string
  title: string
  status: Status | string
  owner: string | null
  claim: string | null
  nextStep: string
  questions: Question[]
  blockers: Line[]
  notes: Line[]
  progress: Line[]
  links: Line[]
  decisions: Line[]
  records: Line[]
  tried: Line[]
  stop: string | null
  footer: string
  revision: { id: number; hash: string } | null
  sourceEventIds: number[]
  events: Event[]
  eventsOnItem: number
  eventsDecayed: number
}

/** One hit of `ledger search`. */
export type Hit = {
  id: string
  itemId: string | null
  docType: string
  title: string
  snippet: string
  date: string
  score: number
  status: string | null
}

export type Verify = { ok: boolean; events: number; message: string; at: string }

/** The whole pane's state: one value, so a hot reload keeps the place. */
export type View = {
  screen: Screen
  isOpen: boolean
  loading: boolean
  error: string | null
  loadedAt: string | null
  doctor: Doctor | null
  items: Item[]
  ready: string[]
  decisions: Decision[]
  typeFilter: string
  statusFilter: string
  standingFilter: string
  page: number
  itemId: string | null
  item: Detail | null
  itemLoading: boolean
  itemError: string | null
  expanded: number | null
  query: string
  hits: Hit[]
  searched: string | null
  verify: Verify | null
  verifying: boolean
}

declare module 'claude-code' {
  interface PluginState {
    ledger: {
      view: Shaped<View>
    }
  }
}
