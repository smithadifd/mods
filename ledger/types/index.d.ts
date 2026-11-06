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

/** One option of an ask. */
export type AskOption = { label: string; description: string }

export type Question = {
  askedEventId: number | null
  options: AskOption[]
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
  session: string | null
  idempotencyKey: string
  hash: string
  recordedAt: string
  summary: string
  /** The event's payload as the ledger wrote it; the item screen's sections are projected from it. */
  payload: Record<string, unknown>
}

/** Where the item was minted from, when, and how long a claim runs. */
export type ItemHeader = { source: string | null; createdAt: string | null; leaseEnds: string | null }

/** One `item.linked` event (or the PR a loop build produced). `copyText` is set for a `url` link. */
export type LinkRow = { eventId: number; rel: string; target: string; href: string | null; copyText: string | null }

/** One `decision.elected` event. */
export type Election = {
  eventId: number
  recordedAt: string
  question: string
  chosen: string
  chosenDescription: string
  rejected: string[]
  scope: string
  quoteRef: number | null
  quotes: string[]
  askedEventId: number | null
  questionId: string
}

/** One `decision.recorded` event with its latest standing and result. */
export type DecisionRecord = {
  eventId: number
  recordedAt: string
  who: string
  whoKind: string
  relayedBy: string
  standing: string
  supersededBy: number | null
  effect: string
  tags: string[]
  verbatim: string
  phase: string
  evidence: string
  result: string
  resultEvidence: string
}

/** The latest `item.stopped` stamp. */
export type Stop = { eventId: number; recordedAt: string; point: string; phase: string; skills: string[]; refs: string[] }

/** One `item.tried` event. */
export type Tried = { eventId: number; what: string; outcome: string; phase: string; evidence: string }

/** A recorded review, or a review step the work loop completed. */
export type Review = {
  eventId: number
  round: number | null
  verdict: string
  head: string
  pr: string
  reviewer: string
  evidence: string
  findings: string[]
}

/** One `item.note`; `href` is the first web address in it. */
export type Note = { eventId: number; text: string; href: string | null }

/** One `item.spec` version; `bodyRecorded` is false when the event carries no string body. */
export type Spec = {
  eventId: number
  recordedAt: string
  version: number | null
  title: string
  body: string
  bodyRecorded: boolean
  acceptance: string
  size: string
  mergeClass: string
  source: string
  sourceRev: string
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
  progress: Line[]
  /** Items linked to this one as their duplicate; only the card derives these. */
  duplicatedBy: Line[]
  footer: string
  revision: { id: number; hash: string } | null
  sourceEventIds: number[]
  events: Event[]
  /** Why the item's events could not be read; `null` when they were. */
  eventsError: string | null
  eventsOnItem: number
  eventsDecayed: number
}

/** The order of the item screen's timeline. */
export type TimelineOrder = 'newest' | 'oldest'

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
  /** When the detail on screen was last read well; a refused read keeps that detail, marked stale with this age. */
  itemReadAt: string | null
  /** The items the open item can step through: the list it was opened from. */
  siblings: string[]
  /** The items left behind by opening one from another; `b` walks back through them. */
  history: string[]
  timelineOrder: TimelineOrder
  timelineKind: string
  /** Timeline rows expanded, by event id, so a re-read keeps them open. */
  openEvents: number[]
  /** Earlier spec versions expanded in the Spec section, by event id; kept apart from the Timeline's rows. */
  openSpecs: number[]
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
