import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { View } from '../types'
import {
  LedgerError,
  argvFor,
  cliFrom,
  dataOf,
  isMissingDatabase,
  parseCard,
  parseDecisions,
  parseDoctor,
  parseEvents,
  parseHits,
  parseItems,
  parseVerify,
} from './cli'
import type { Cli, Ran, Verb } from './cli'
import { navBack, navOpen, navStep, parseCommandArgs, scrollArgs } from './model'
import { draw } from './screens'
import type { Act, Ui } from './screens'

const PANE = 'ledger'
const TIMEOUT_MS = 60_000
const ROW_LIMIT = '5000'
const SEARCH_LIMIT = '50'

const EMPTY: View = {
  screen: 'home',
  isOpen: false,
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
  itemId: null,
  item: null,
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

// Change the tag when View's fields change: it declines what an earlier version stored.
const view = atom({ plugin: 'ledger', key: 'view' } as const, EMPTY, { shape: 'view-3' })

// Each load takes a number; a result from an older load than the latest is dropped.
let loads = 0
let itemLoads = 0
let searches = 0

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function nowIso(): string {
  return new Date().toISOString()
}

/** Runs one read verb and returns the envelope's data (`null` when it found nothing). */
async function run($: EngineInterface, cli: Cli, verb: Verb, args: readonly string[] = []): Promise<unknown> {
  return dataOf(verb, await exec($, cli, verb, args))
}

async function exec($: EngineInterface, cli: Cli, verb: Verb, args: readonly string[]): Promise<Ran> {
  const init = cli.cwd === undefined ? { timeoutMs: TIMEOUT_MS } : { cwd: cli.cwd, timeoutMs: TIMEOUT_MS }
  try {
    return await $.process.run(argvFor(cli, verb, args), init)
  } catch (error) {
    throw new Error(`could not run ${cli.argv.join(' ')}: ${message(error)}`)
  }
}

function reason(error: unknown): string {
  if (isMissingDatabase(error)) return `no database: ${message(error)}`
  if (error instanceof LedgerError) return `ledger ${error.verb} refused: ${error.message}`
  return message(error)
}

/** Re-reads everything the Home, Needs you, Items and Decisions screens draw from. */
async function loadAll($: EngineInterface, cli: Cli): Promise<void> {
  loads += 1
  const load = loads
  await update($, view, current => ({ ...current, loading: true, error: null }))
  try {
    const [doctor, items, ready, decisions] = await Promise.all([
      run($, cli, 'doctor'),
      run($, cli, 'query', ['--limit', ROW_LIMIT]),
      run($, cli, 'ready', ['--limit', ROW_LIMIT]),
      run($, cli, 'decisions', ['--limit', ROW_LIMIT]),
    ])
    if (load !== loads) return
    await update($, view, current => ({
      ...current,
      loading: false,
      loadedAt: nowIso(),
      doctor: parseDoctor(doctor),
      items: parseItems(items),
      ready: parseItems(ready).map(one => one.id),
      decisions: parseDecisions(decisions),
    }))
  } catch (error) {
    if (load !== loads) return
    const why = reason(error)
    await update($, view, current => ({ ...current, loading: false, error: why }))
  }
}

/** Reads one item's card and its log; `false` when the ledger has no such item. */
async function loadItem($: EngineInterface, cli: Cli, id: string): Promise<boolean> {
  itemLoads += 1
  const load = itemLoads
  await update($, view, (current): View => ({
    ...current,
    screen: 'item',
    itemId: id,
    item: current.itemId === id ? current.item : null,
    itemReadAt: current.itemId === id ? current.itemReadAt : null,
    openEvents: current.itemId === id ? current.openEvents : [],
    itemLoading: true,
    itemError: null,
  }))
  try {
    // A failed or malformed log must not take the card's own sections down with it, nor pass for an empty log.
    const [card, log] = await Promise.all([
      run($, cli, 'card', ['--', id]),
      run($, cli, 'export-item', ['--', id]).then(
        data => ({ data }),
        (error: unknown) => ({ error: reason(error) }),
      ),
    ])
    if (load !== itemLoads) return true
    const detail = parseCard(card)
    const events = 'error' in log ? { events: [], onItem: 0, decayed: 0, error: log.error } : parseEvents(log.data)
    await update($, view, current => ({
      ...current,
      itemLoading: false,
      itemReadAt: nowIso(),
      item: {
        ...detail,
        id: detail.id === '' ? id : detail.id,
        events: events.events,
        eventsError: events.error,
        eventsOnItem: events.onItem,
        eventsDecayed: events.decayed,
      },
    }))
    return true
  } catch (error) {
    if (load !== itemLoads) return true
    const missing = error instanceof LedgerError && (error.code === 'not_found' || /not found|no such|no item|unknown item/i.test(error.message))
    await update($, view, current => ({ ...current, itemLoading: false, itemError: `could not read ${id}: ${reason(error)}` }))
    return !missing
  }
}

async function runSearch($: EngineInterface, cli: Cli, words: string): Promise<void> {
  searches += 1
  const search = searches
  const trimmed = words.trim()
  await update($, view, (current): View => ({ ...current, screen: 'search', query: trimmed, searched: trimmed === '' ? null : current.searched, loading: trimmed !== '' }))
  if (trimmed === '') {
    await update($, view, current => ({ ...current, hits: [], loading: false }))
    return
  }
  try {
    const data = await run($, cli, 'search', ['--limit', SEARCH_LIMIT, '--', ...trimmed.split(/\s+/)])
    if (search !== searches) return
    await update($, view, current => ({ ...current, loading: false, hits: parseHits(data), searched: trimmed, error: null }))
  } catch (error) {
    if (search !== searches) return
    const why = reason(error)
    await update($, view, current => ({ ...current, loading: false, hits: [], searched: trimmed, error: why }))
  }
}

async function runVerify($: EngineInterface, cli: Cli): Promise<void> {
  await update($, view, current => ({ ...current, verifying: true }))
  let ran: Ran
  try {
    ran = await exec($, cli, 'verify', [])
  } catch (error) {
    const why = message(error)
    await update($, view, current => ({ ...current, verifying: false, verify: { ok: false, events: 0, message: why, at: nowIso() } }))
    return
  }
  const verified = parseVerify(ran, nowIso())
  await update($, view, current => ({ ...current, verifying: false, verify: verified }))
}

function actions($: EngineInterface, cli: Cli): Act {
  return {
    go: screen => void update($, view, current => ({ ...current, screen, page: screen === current.screen ? current.page : 0 })),
    refresh: () => {
      void loadAll($, cli)
      void read($, view).then(current => {
        if (current.screen === 'item' && current.itemId !== null) void loadItem($, cli, current.itemId)
        if (current.screen === 'search' && current.searched !== null) void runSearch($, cli, current.searched)
      })
    },
    openItem: (id, siblings) =>
      void (async () => {
        await update($, view, (current): View => {
          const next = navOpen({ screen: current.screen, itemId: current.itemId, history: current.history, siblings: current.siblings }, id, siblings ?? null)
          return { ...current, history: next.history, siblings: next.siblings }
        })
        await loadItem($, cli, id)
      })(),
    step: delta =>
      void read($, view).then(current => {
        const target = navStep({ screen: current.screen, itemId: current.itemId, history: current.history, siblings: current.siblings }, delta)
        if (target !== null) void loadItem($, cli, target)
      }),
    historyBack: () =>
      void read($, view).then(async current => {
        const back = navBack({ screen: current.screen, itemId: current.itemId, history: current.history, siblings: current.siblings })
        if (back === null) return
        await update($, view, (now): View => ({ ...now, history: back.history }))
        await loadItem($, cli, back.id)
      }),
    jump: async key => {
      const moved = await $.ui.scroll(scrollArgs(PANE, key))
      if (moved.deny !== undefined) $.ui.toast(`Could not scroll: ${moved.deny}`)
    },
    setTimelineOrder: order => void update($, view, current => ({ ...current, timelineOrder: order })),
    setTimelineKind: kind => void update($, view, current => ({ ...current, timelineKind: kind })),
    toggleEvent: eventId =>
      void update($, view, (current): View => ({
        ...current,
        openEvents: current.openEvents.includes(eventId) ? current.openEvents.filter(one => one !== eventId) : [...current.openEvents, eventId],
      })),
    back: () => void update($, view, (current): View => ({ ...current, screen: 'items' })),
    listWith: (type, status) => void update($, view, (current): View => ({ ...current, screen: 'items', typeFilter: type, statusFilter: status, page: 0 })),
    setType: type => void update($, view, current => ({ ...current, typeFilter: type, page: 0 })),
    setStatus: status => void update($, view, current => ({ ...current, statusFilter: status, page: 0 })),
    setStanding: standing => void update($, view, current => ({ ...current, standingFilter: standing, page: 0, expanded: null })),
    page: delta => void update($, view, current => ({ ...current, page: Math.max(0, current.page + delta) })),
    search: words => void runSearch($, cli, words),
    verify: () => void runVerify($, cli),
    toggle: eventId => void update($, view, current => ({ ...current, expanded: current.expanded === eventId ? null : eventId })),
    copy: text => {
      if (text === '') return
      void $.ui.copy({ text }).then(copied => {
        $.ui.toast(copied.isCopied ? `Copied ${text}` : `Could not copy: ${copied.reason}`)
      })
    },
  }
}

export const register: Register = (on, options) => {
  const cli = cliFrom(options)
  const refreshMs = Math.max(0, Number(options.refreshSeconds ?? 60)) * 1000

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'ledger',
      description: 'Show the ledger in a pane: what needs you, every item, the decisions, one item, or a search',
      argumentHint: '[needs|items|decisions|search|ready|blocked|ITEM-ID|words to search]',
    })
    if (refreshMs > 0) {
      $.clock.every(refreshMs, async () => {
        const current = await read($, view)
        // A re-read would redraw the search field under the person's typing.
        if (!current.isOpen || current.loading || current.screen === 'search') return
        await loadAll($, cli)
      })
    }
    return started
  })

  on('command.run', { command: 'ledger' }, async ($, e) => {
    const asked = parseCommandArgs(e.args)
    const opened = await $.ui.open({ id: PANE, title: 'Ledger', focus: true })
    await update($, view, current => ({ ...current, isOpen: true }))
    void loadAll($, cli)
    if ('id' in asked) {
      await update($, view, (current): View => ({ ...current, history: [], siblings: [] }))
      void loadItem($, cli, asked.id).then(found => {
        // One word that names no item is a search for it.
        if (!found) void runSearch($, cli, asked.id)
      })
    } else if ('query' in asked) {
      void runSearch($, cli, asked.query)
    } else if ('status' in asked) {
      await update($, view, (current): View => ({ ...current, screen: 'items', typeFilter: 'all', statusFilter: asked.status, page: 0 }))
    } else {
      await update($, view, current => ({ ...current, screen: asked.screen }))
    }
    return { text: opened.isPlaced ? 'Ledger pane opened.' : `Ledger pane is waiting: ${opened.reason}` }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    await update($, view, current => ({ ...current, isOpen: false }))
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui: Ui = $.ui.resolve(e)
    const current = await read($, view)
    return draw(ui, current, actions($, cli), {
      width: e.props.bodyColumns,
      rows: e.props.scroll.bodyRows,
      offset: e.props.scroll.offset,
      now: Date.now(),
    })
  })
}
