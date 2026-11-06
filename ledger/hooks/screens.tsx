import type { Elements, RenderElement } from 'claude-code'

import type { AskOption, Decision, Detail, Event, Item, Line, Screen, TimelineOrder, View } from '../types'
import type { Band, Nav, TimelineRow } from './model'
import {
  SECTION_KEY_PREFIX,
  STANDING_FILTERS,
  STATUSES,
  STATUS_FILTERS,
  TIMELINE_FILTERS,
  WINDOW_AFTER,
  ageOf,
  answeredAsksOf,
  bandOf,
  barLength,
  clockOf,
  countByStatus,
  countsByType,
  cut,
  dailyTouches,
  dayGroups,
  dayOf,
  filterDecisions,
  electionsOf,
  filterItems,
  firstOpenable,
  fit,
  grantOf,
  groupLinks,
  headerLine,
  headerOf,
  isRecommended,
  kindColor,
  leaseWords,
  linksOf,
  navStep,
  needsYou,
  notesOf,
  optionsOf,
  pageCount,
  pageOf,
  prShort,
  recordsOf,
  reviewsOf,
  segments,
  specOf,
  stampOf,
  stopOf,
  stripOf,
  ticketOf,
  timelineOf,
  triedOf,
  windowOf,
  sparkline,
  standingColor,
  standingGlyph,
  statusColor,
  statusGlyph,
  thousands,
  typesOf,
  whenOf,
} from './model'

/** The elements every screen draws with; the same names on every surface. */
export type Ui = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Input' | 'Select' | 'Link' | 'Code'>

/** What a press or a pick does; the hooks module implements it. */
export type Act = {
  go: (screen: Screen) => void
  refresh: () => void
  /** Opens an item; `siblings` is the list it was opened from, which `,` and `.` step through. */
  openItem: (id: string, siblings?: readonly string[]) => void
  /** The previous (-1) or next (1) item in the list the open item came from. */
  step: (delta: number) => void
  /** Back through the items opened from one another. */
  historyBack: () => void
  /** Scrolls the pane to the section with this key. */
  jump: (key: string) => Promise<void>
  setTimelineOrder: (order: TimelineOrder) => void
  setTimelineKind: (kind: string) => void
  toggleEvent: (eventId: number) => void
  back: () => void
  listWith: (type: string, status: string) => void
  setType: (type: string) => void
  setStatus: (status: string) => void
  setStanding: (standing: string) => void
  page: (delta: number) => void
  search: (words: string) => void
  verify: () => void
  toggle: (eventId: number) => void
  copy: (text: string) => void
}

/** The room the pane has (columns, window rows, the window's offset into the body), and the moment ages are counted from. */
export type Frame = { width: number; rows: number; now: number; offset: number }

const TABS: readonly { screen: Screen; label: string; hotkey: string }[] = [
  { screen: 'home', label: 'Home', hotkey: 'h' },
  { screen: 'needs', label: 'Needs you', hotkey: 'u' },
  { screen: 'items', label: 'Items', hotkey: 'i' },
  { screen: 'decisions', label: 'Decisions', hotkey: 'd' },
  { screen: 'search', label: 'Search', hotkey: 's' },
]

const DAY_MS = 24 * 60 * 60 * 1000
const QUICK_START = [
  'export LEDGER_DB=~/.local/share/ledger/home.db   # or set the pane\'s Database option',
  'export LEDGER_HARNESS=cli                         # required for writes: what is writing',
  'ledger new --type ticket --title "First item"',
].join('\n')

function readAgo(iso: string, now: number): string {
  const age = ageOf(iso, now)
  return age === 'now' ? 'read just now' : `read ${age} ago`
}

function tail(path: string, width: number): string {
  if (path.length <= width) return path
  return `…${path.slice(path.length - width + 1)}`
}

function stamp(event: Event): string {
  const who = [event.actor, event.harness].filter((one): one is string => one !== null && one !== '')
  return who.length === 0 ? '—' : who.join('/')
}

function idWidthOf(ids: readonly string[]): number {
  return Math.min(16, Math.max(6, ...ids.map(id => id.length)))
}

/** The whole pane: tabs, then the screen in view; with no database, the quick start alone, never stale rows beneath it. */
export function draw(ui: Ui, view: View, act: Act, frame: Frame): RenderElement {
  const { Box, Text } = ui
  const quick = view.error !== null && isQuickStart(view.error)
  return (
    <Box flexDirection="column">
      {tabs(ui, view, act, frame)}
      {quick && quickStart(ui, view)}
      {!quick && view.error !== null && <Text color="error">{view.error}</Text>}
      {!quick && screen(ui, view, act, frame)}
    </Box>
  )
}

function isQuickStart(error: string): boolean {
  return error.startsWith('no database')
}

function screen(ui: Ui, view: View, act: Act, frame: Frame): RenderElement {
  switch (view.screen) {
    case 'needs':
      return needs(ui, view, act, frame)
    case 'items':
      return items(ui, view, act, frame)
    case 'item':
      return item(ui, view, act, frame)
    case 'decisions':
      return decisions(ui, view, act, frame)
    case 'search':
      return search(ui, view, act, frame)
    default:
      return home(ui, view, act, frame)
  }
}

function tabs(ui: Ui, view: View, act: Act, frame: Frame): RenderElement {
  const { Box, Button, Text } = ui
  const current = view.screen === 'item' ? 'items' : view.screen
  return (
    <Box flexDirection="column">
      <Box gap={1} flexWrap="wrap">
        {TABS.map(tab => (
          <Button
            key={`tab-${tab.screen}`}
            label={tab.label}
            hotkey={tab.hotkey}
            variant={tab.screen === current ? 'primary' : undefined}
            onPress={() => act.go(tab.screen)}
          />
        ))}
        <Button key="refresh" label="Refresh" hotkey="r" onPress={() => act.refresh()} />
        {view.loading && <Text dimColor>reading…</Text>}
        {!view.loading && view.loadedAt !== null && <Text dimColor>{readAgo(view.loadedAt, frame.now)}</Text>}
      </Box>
      {view.doctor !== null && (
        <Text dimColor>
          {tail(view.doctor.path, Math.max(20, frame.width - 12))} · schema {view.doctor.schemaVersion}
        </Text>
      )}
    </Box>
  )
}

function quickStart(ui: Ui, view: View): RenderElement {
  const { Box, Code, Text } = ui
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>No ledger database yet</Text>
      <Text>{view.error ?? ''}</Text>
      <Text dimColor>The ledger creates it on the first write. From a shell:</Text>
      <Code source={QUICK_START} language="sh" />
      <Text dimColor>Then press Refresh.</Text>
    </Box>
  )
}

function sectionHeader(ui: Ui, title: string, count: string, key?: string): RenderElement {
  const { Box, Text } = ui
  return (
    <Box key={key} gap={1} marginTop={1}>
      <Text bold>{title}</Text>
      <Text dimColor>{count}</Text>
    </Box>
  )
}

function home(ui: Ui, view: View, act: Act, frame: Frame): RenderElement {
  const { Box, Button, Text } = ui
  const all = view.items
  if (view.doctor === null && !view.loading && view.error !== null) return <Box />
  const byType = countsByType(all)
  const largest = byType[0]?.total ?? 0
  const labelWidth = Math.min(12, Math.max(5, ...byType.map(row => row.type.length)))
  // label, bar, count: the bar takes what the room allows, 8 to 36 cells.
  const barWidth = Math.max(8, Math.min(36, frame.width - labelWidth - 7))
  const counts = countByStatus(all)
  const openDecisions = all.filter(one => one.type === 'decision' && one.status === 'open').length
  const expired = view.doctor?.expiredClaims.length ?? 0
  const touches = dailyTouches(all, frame.now, 30)
  const peak = Math.max(0, ...touches)
  const peakIndex = touches.lastIndexOf(peak)
  const peakDay = dayOf(new Date(frame.now - (touches.length - 1 - peakIndex) * DAY_MS).toISOString())
  const claimed = all.filter(one => one.status === 'claimed')
  const verify = view.verify
  const search = view.doctor?.search ?? null

  return (
    <Box flexDirection="column">
      <Box gap={1} marginTop={1}>
        <Text bold>Chain</Text>
        {verify === null && <Text dimColor>not verified this session</Text>}
        {verify !== null && (
          <Text color={verify.ok ? 'success' : 'error'}>
            {verify.ok ? '●' : '✗'} {verify.message}
          </Text>
        )}
        {verify !== null && <Text dimColor>{ageOf(verify.at, frame.now)} ago</Text>}
        <Button key="verify" label={view.verifying ? 'Verifying…' : 'Verify'} hotkey="v" onPress={() => act.verify()} />
      </Box>
      {search !== null && (
        <Box gap={1}>
          <Text bold>Search index</Text>
          <Text color={search.status === 'current' ? 'success' : search.status === 'missing' ? 'subtle' : 'warning'}>
            ● {search.status}
            {search.behind > 0 ? ` by ${thousands(search.behind)} ${search.behind === 1 ? 'event' : 'events'}` : ''}
          </Text>
        </Box>
      )}

      {sectionHeader(ui, 'Items', thousands(all.length))}
      {all.length === 0 && !view.loading && <Text dimColor>The ledger has no items yet.</Text>}
      {byType.map(row => {
        const length = barLength(row.total, largest, barWidth)
        const present = STATUSES.filter(status => row.counts[status] > 0)
        const legendWidth = present.reduce((sum, status) => sum + 3 + String(row.counts[status]).length + status.length, 0)
        const inline = labelWidth + 1 + barWidth + 1 + 4 + 2 + legendWidth <= frame.width
        const legend = present.map(status => (
          <Box key={`${row.type}-${status}-count`}>
            <Text color={statusColor(status)}>{statusGlyph(status)}</Text>
            <Text dimColor>
              {' '}
              {row.counts[status]} {status}
            </Text>
          </Box>
        ))
        return (
          <Box key={`type-${row.type}`} flexDirection="column">
            <Box gap={1}>
              <Button key={`type-button-${row.type}`} plain dimColor onPress={() => act.listWith(row.type, 'all')}>
                {fit(row.type, labelWidth)}
              </Button>
              <Box>
                {segments(row.counts, length).map(segment => (
                  <Text key={`${row.type}-${segment.status}`} color={statusColor(segment.status)}>
                    {'█'.repeat(segment.cells)}
                  </Text>
                ))}
                <Text dimColor>{'░'.repeat(Math.max(0, barWidth - length))}</Text>
              </Box>
              <Text>{String(row.total).padStart(4)}</Text>
              {inline && <Box gap={1}>{legend}</Box>}
            </Box>
            {!inline && (
              <Box gap={1} paddingLeft={labelWidth + 1}>
                {legend}
              </Box>
            )}
          </Box>
        )
      })}

      <Box gap={3} marginTop={1} flexWrap="wrap">
        <Button key="tile-ready" plain onPress={() => act.listWith('all', 'ready')}>
          <Text bold>{String(view.ready.length)}</Text> ready
        </Button>
        <Button key="tile-blocked" plain onPress={() => act.listWith('all', 'blocked')}>
          <Text bold>{String(counts.blocked)}</Text> blocked
        </Button>
        <Button key="tile-decisions" plain onPress={() => act.listWith('decision', 'open')}>
          <Text bold>{String(openDecisions)}</Text> open decisions
        </Button>
        <Button key="tile-claimed" plain onPress={() => act.listWith('all', 'claimed')}>
          <Text bold>{String(counts.claimed)}</Text> claimed
        </Button>
        {expired > 0 && (
          <Button key="tile-expired" plain onPress={() => act.go('needs')}>
            <Text color="error">{String(expired)} expired claims</Text>
          </Button>
        )}
      </Box>

      {sectionHeader(ui, 'Activity', 'items touched per day, last 30 days')}
      {(() => {
        const caption = `peak ${peak} on ${peakDay} · today ${touches[touches.length - 1] ?? 0}`
        const beside = touches.length + 1 + caption.length <= frame.width
        return (
          <Box flexDirection={beside ? 'row' : 'column'} gap={beside ? 1 : 0}>
            <Text color="claude">{sparkline(touches)}</Text>
            <Text dimColor>{caption}</Text>
          </Box>
        )
      })()}

      {claimed.length > 0 && sectionHeader(ui, 'Claimed now', String(claimed.length))}
      {claimed.map(one => itemRow(ui, one, act, frame, 'claim', idWidthOf(claimed.map(each => each.id)), one.claim ?? one.owner ?? '—', claimed.map(each => each.id)))}
    </Box>
  )
}

/** One pressable row: status dot, age, id, a dim detail, the title. */
function itemRow(ui: Ui, one: Item, act: Act, frame: Frame, prefix: string, idWidth: number, detail: string, siblings?: readonly string[]): RenderElement {
  const { Button, Text } = ui
  const detailWidth = 10
  const titleWidth = Math.max(10, frame.width - (2 + 5 + idWidth + 1 + detailWidth + 1) - 1)
  return (
    <Button key={`${prefix}-${one.id}`} plain onPress={() => act.openItem(one.id, siblings)}>
      <Text color={statusColor(one.status)}>{statusGlyph(one.status)}</Text> <Text dimColor>{fit(ageOf(one.updatedAt, frame.now), 4)}</Text>{' '}
      {fit(one.id, idWidth)} <Text dimColor>{fit(detail, detailWidth)}</Text> {cut(one.title, titleWidth)}
    </Button>
  )
}

function needs(ui: Ui, view: View, act: Act, frame: Frame): RenderElement {
  const { Box, Button, Text } = ui
  const found = needsYou(view.items, view.doctor)
  const limit = Math.max(5, Math.floor((frame.rows - 10) / 3))
  const order = [...found.decisions, ...found.blocked, ...found.claimed].map(one => one.id)
  const idWidth = idWidthOf(order.concat(found.expired.map(one => one.itemId)))

  const block = (title: string, rows: Item[], prefix: string, type: string, status: string, empty: string): RenderElement => (
    <Box flexDirection="column">
      {sectionHeader(ui, title, rows.length === 0 ? '' : `${rows.length} · oldest first`)}
      {rows.length === 0 && <Text dimColor>{empty}</Text>}
      {rows.slice(0, limit).map(one => itemRow(ui, one, act, frame, prefix, idWidth, one.status === 'claimed' ? (one.claim ?? one.owner ?? '—') : one.type, order))}
      {rows.length > limit && (
        <Button key={`${prefix}-more`} plain dimColor onPress={() => act.listWith(type, status)}>
          {`and ${rows.length - limit} more in Items`}
        </Button>
      )}
    </Box>
  )

  return (
    <Box flexDirection="column">
      {block('Open decisions', found.decisions, 'decision', 'decision', 'open', 'Nothing waits on a decision.')}
      {block('Blocked', found.blocked, 'blocked', 'all', 'blocked', 'Nothing is blocked.')}
      {block('Claimed', found.claimed, 'claimed', 'all', 'claimed', 'Nothing is claimed.')}
      {sectionHeader(ui, 'Expired claims', found.expired.length === 0 ? '' : String(found.expired.length))}
      {found.expired.length === 0 && <Text dimColor>No claim has outlived its lease.</Text>}
      {found.expired.map(one => (
        <Button key={`expired-${one.itemId}`} plain onPress={() => act.openItem(one.itemId, found.expired.map(each => each.itemId))}>
          <Text color="error">✖</Text> {fit(one.itemId, idWidth)} <Text dimColor>{one.holder}</Text> lease ended {one.expiresAt === '' ? '' : ageOf(one.expiresAt, frame.now)} ago
        </Button>
      ))}
    </Box>
  )
}

function items(ui: Ui, view: View, act: Act, frame: Frame): RenderElement {
  const { Box, Button, Select, Text } = ui
  const list = filterItems(view.items, view.ready, view.typeFilter, view.statusFilter)
  const size = Math.max(5, frame.rows - 7)
  const pages = pageCount(list.length, size)
  const page = Math.min(view.page, pages - 1)
  const shown = pageOf(list, page, size)
  const idWidth = idWidthOf(shown.map(one => one.id))
  const types = typesOf(view.items)
  return (
    <Box flexDirection="column">
      <Box gap={2} marginTop={1} flexWrap="wrap">
        <Select
          key="type"
          label="Type"
          options={[{ label: 'all', value: 'all' }, ...types.map(type => ({ label: type, value: type }))]}
          value={types.includes(view.typeFilter) ? view.typeFilter : 'all'}
          onSelect={value => act.setType(value)}
        />
        <Select
          key="status"
          label="Status"
          options={STATUS_FILTERS.map(status => ({ label: status, value: status }))}
          value={view.statusFilter}
          onSelect={value => act.setStatus(value)}
        />
      </Box>
      <Box gap={1}>
        <Text dimColor>
          {thousands(list.length)} {list.length === 1 ? 'item' : 'items'}
          {pages > 1 ? ` · page ${page + 1} of ${pages}` : ''}
        </Text>
        {pages > 1 && <Button key="next" label="Next" hotkey="j" onPress={() => act.page(1)} />}
        {pages > 1 && <Button key="prev" label="Prev" hotkey="k" onPress={() => act.page(-1)} />}
      </Box>
      {list.length === 0 && <Text dimColor>No items match.</Text>}
      {shown.map(one => itemRow(ui, one, act, frame, 'row', idWidth, one.status === 'claimed' ? (one.claim ?? one.type) : one.type, list.map(each => each.id)))}
    </Box>
  )
}

function lineRows(ui: Ui, prefix: string, rows: readonly Line[], frame: Frame): RenderElement[] {
  const { Box, Link, Text } = ui
  return rows.map((line, index) => (
    <Box key={`${prefix}-${index}`} gap={1}>
      <Text dimColor>·</Text>
      {line.href !== null ? <Link href={line.href} label={cut(line.text, frame.width - 12)} /> : <Text>{cut(line.text, frame.width - 12)}</Text>}
      {line.eventId !== null && <Text dimColor>#{line.eventId}</Text>}
    </Box>
  ))
}

function section(ui: Ui, title: string, rows: readonly Line[], prefix: string, frame: Frame): RenderElement | false {
  const { Box } = ui
  if (rows.length === 0) return false
  return (
    <Box flexDirection="column">
      {sectionHeader(ui, title, String(rows.length))}
      {lineRows(ui, prefix, rows, frame)}
    </Box>
  )
}

/** What the log would have drawn, said once, so a failed read never looks like an item with nothing on it. */
function eventsFailed(ui: Ui, d: Detail): RenderElement {
  const { Box, Text } = ui
  const moved = /moved while reading|moving/i.test(d.eventsError ?? '')
  return (
    <Box key="events-failed" flexDirection="column" marginTop={1}>
      <Text color="error">could not read the events of {d.id}: {moved ? 'the ledger moved while reading; press r' : (d.eventsError ?? '')}</Text>
      <Text dimColor>The stop stamp, spec, decisions, records, reviews, tried, notes, links and timeline come from them and are not shown. Press r to read again.</Text>
    </Box>
  )
}

/** One line under its own key: a Text takes no key the engine or a test can address, a Box does. */
function note(ui: Ui, key: string, content: string, style: { dimColor?: boolean; color?: string } = {}): RenderElement {
  const { Box, Text } = ui
  return (
    <Box key={key}>
      <Text {...style}>{content}</Text>
    </Box>
  )
}

/** One line in a section the events feed, when they could not be read: the section stays and says so. */
function unread(ui: Ui, key: string): RenderElement {
  return note(ui, key, 'not shown: the events could not be read (press r)', { dimColor: true })
}

function askOptions(ui: Ui, askedEventId: number | null, d: Detail, fromCard: readonly AskOption[], recommendation: string): RenderElement | false {
  const { Box, Text } = ui
  const options = optionsOf(d.events, askedEventId) ?? fromCard
  if (options.length === 0) return false
  return (
    <Box key="options" flexDirection="column">
      <Text dimColor>  options:</Text>
      {options.map((option, index) => (
        <Text key={`option-${index}`}>
          {'    '}
          {String.fromCharCode(65 + (index % 26))}) {option.label}
          {option.description !== '' ? ` — ${option.description}` : ''}
          {isRecommended(option, index, recommendation) ? '  ◀ recommended' : ''}
        </Text>
      ))}
    </Box>
  )
}

function copyButton(ui: Ui, key: string, text: string, act: Act): RenderElement {
  const { Button } = ui
  return <Button key={key} label="Copy" onPress={() => act.copy(text)} />
}

function stopRows(ui: Ui, d: Detail, act: Act): RenderElement {
  const { Box, Link, Text } = ui
  const stop = stopOf(d.events)
  if (stop === null) {
    return note(ui, 'stop-none', 'stop   none recorded', { dimColor: true })
  }
  return (
    <Box key="stop" flexDirection="column">
      <Box gap={1}>
        <Text dimColor>stop  </Text>
        {stop.phase !== '' && <Text dimColor>{stop.phase} ·</Text>}
        <Text>{stop.point}</Text>
        <Text dimColor>#{stop.eventId}</Text>
      </Box>
      {stop.skills.length > 0 && <Text dimColor>  skills: {stop.skills.join(', ')}</Text>}
      {stop.refs.map((ref, index) => (
        <Box key={`stop-ref-${index}`} gap={1}>
          <Text dimColor>  ref</Text>
          {/^https?:\/\/\S+$/.test(ref) ? <Link href={ref} label={ref} /> : <Text>{ref}</Text>}
          {copyButton(ui, `copy-ref-${index}`, ref, act)}
        </Box>
      ))}
    </Box>
  )
}

/** A blocker is an item id the card names; when the pane holds that item it is a row that opens it. */
function blockerRows(ui: Ui, view: View, d: Detail, act: Act, frame: Frame, band: Band): RenderElement {
  const { Box, Button, Text } = ui
  if (d.blockers.length === 0) {
    return note(ui, 'blockers-none', 'blockers none', { dimColor: true })
  }
  const known = new Map(view.items.map(one => [one.id, one]))
  return (
    <Box key="blockers" flexDirection="column">
      <Text dimColor>blockers {d.blockers.length}</Text>
      {d.blockers.map((line, index) => {
        const id = line.text.trim().split(/\s+/)[0] ?? ''
        const one = known.get(id)
        if (one === undefined) return <Text key={`blocker-${index}`}>{'  '}{cut(line.text, frame.width - 4)}</Text>
        return (
          <Button key={`blocker-${index}`} plain onPress={() => act.openItem(one.id)}>
            {'  '}
            <Text color={statusColor(one.status)}>{statusGlyph(one.status)}</Text> {one.id} {cut(one.title, Math.max(10, frame.width - one.id.length - (band === 'narrow' ? 8 : 10)))}
          </Button>
        )
      })}
    </Box>
  )
}

function nowSection(ui: Ui, view: View, d: Detail, act: Act, frame: Frame, band: Band): RenderElement {
  const { Box, Text } = ui
  const lease = d.eventsError === null ? leaseWords(headerOf(d.events, d.status).leaseEnds, frame.now) : null
  return (
    <Box key="now" flexDirection="column">
      {sectionHeader(ui, 'Now', '', `${SECTION_KEY_PREFIX}now`)}
      {lease !== null && lease.ended && note(ui, 'lease-ended', 'lease ended; a takeover may claim it', { color: 'error' })}
      <Box gap={1}>
        <Text dimColor>next  </Text>
        {d.nextStep !== '' ? <Text>{d.nextStep}</Text> : <Text dimColor>none recorded</Text>}
      </Box>
      {d.eventsError === null ? stopRows(ui, d, act) : unread(ui, 'stop-unread')}
      {d.claim !== null && note(ui, 'claim', `claimed by ${d.claim}${lease === null ? '' : ` · ${lease.text}`}`, { color: lease !== null && lease.ended ? 'error' : 'warning' })}
      {d.questions.length === 0 && note(ui, 'asks-none', 'asks   none open', { dimColor: true })}
      {d.questions.length > 0 && <Text dimColor>asks {d.questions.length} open</Text>}
      {d.questions.map((q, index) => (
        <Box key={`q-${index}`} flexDirection="column" marginBottom={1}>
          <Box gap={1}>
            <Text color="claude">?</Text>
            <Text>{q.question}</Text>
          </Box>
          {q.added !== '' && <Text dimColor>  asked {q.added}</Text>}
          {q.ask !== '' && q.ask !== q.question && <Text dimColor>  {q.ask}</Text>}
          {askOptions(ui, q.askedEventId, d, q.options, q.recommendation)}
          {q.recommendation !== '' && <Text dimColor>  recommendation: {q.recommendation}</Text>}
          {q.fallback !== '' && <Text dimColor>  default: {q.fallback}</Text>}
          {q.unblocks !== '' && <Text dimColor>  unblocks: {q.unblocks}</Text>}
          {q.effort !== '' && <Text dimColor>  effort: {q.effort}</Text>}
          {q.askedEventId !== null && <Text dimColor>  #{q.askedEventId}</Text>}
        </Box>
      ))}
      {blockerRows(ui, view, d, act, frame, band)}
      {section(ui, 'Duplicated by', d.duplicatedBy, 'duplicate', frame)}
      {section(ui, 'Progress', d.progress, 'progress', frame)}
    </Box>
  )
}

function decisionsSection(ui: Ui, d: Detail): RenderElement {
  const { Box, Text } = ui
  if (d.eventsError !== null) {
    return (
      <Box key="decisions" flexDirection="column">
        {sectionHeader(ui, 'Decisions', '?', `${SECTION_KEY_PREFIX}decisions`)}
        {unread(ui, 'decisions-unread')}
      </Box>
    )
  }
  const elections = [...electionsOf(d.events)].reverse()
  const answered = answeredAsksOf(d.events)
  const records = [...recordsOf(d.events)].reverse()
  const here = new Set(d.events.map(one => one.id))
  return (
    <Box key="decisions" flexDirection="column">
      {sectionHeader(ui, 'Decisions', elections.length + records.length === 0 ? '–' : String(elections.length + records.length), `${SECTION_KEY_PREFIX}decisions`)}
      {elections.length + records.length + answered.length === 0 && note(ui, 'decisions-none', 'no decisions on this item', { dimColor: true })}
      {elections.map(one => {
        const grant = grantOf(d.events, one.eventId)
        return (
          <Box key={`election-${one.eventId}`} flexDirection="column" marginBottom={1}>
            <Box gap={1}>
              <Text color="claude">●</Text>
              <Text>{one.question === '' ? one.chosen : `${one.question} → ${one.chosen}`}</Text>
              <Text dimColor>{dayOf(one.recordedAt)}</Text>
              {grant !== '' && <Text dimColor>{grant}</Text>}
              <Text dimColor>#{one.eventId}</Text>
            </Box>
            {one.chosenDescription !== '' && <Text dimColor>  {one.chosenDescription}</Text>}
            {one.rejected.length > 0 && <Text dimColor>  rejected: {one.rejected.join(' | ')}</Text>}
            {one.scope !== '' && <Text dimColor>  scope: {one.scope}</Text>}
            {(one.quoteRef !== null || one.quotes.length > 0) && (
              <Text dimColor>
                {'  '}on these words:
                {one.quoteRef === null ? '' : ` #${one.quoteRef}${here.has(one.quoteRef) ? '' : ' (not on this item; needs events --id, LP6-5)'}`}
                {one.quotes.length > 0 ? ` ${one.quotes.map(quote => `"${quote}"`).join(' ')}` : ''}
              </Text>
            )}
          </Box>
        )
      })}

      {answered.length > 0 && <Text dimColor>asks answered {answered.length}</Text>}
      {answered.map(one => (
        <Box key={`answered-${one.askedEventId}`} gap={1}>
          <Text dimColor>·</Text>
          <Text dimColor>{one.question} → {one.chosen}</Text>
          <Text dimColor>#{one.askedEventId} · #{one.electionId}</Text>
        </Box>
      ))}

      {records.length > 0 && <Text dimColor>decision records {records.length}</Text>}
      {records.map(one => (
        <Box key={`record-${one.eventId}`} flexDirection="column" marginBottom={1}>
          <Box gap={1}>
            <Text color={standingColor(one.standing)}>{standingGlyph(one.standing)}</Text>
            <Text dimColor>{one.standing}</Text>
            <Text>{one.who}{one.whoKind !== '' ? ` (${one.whoKind})` : ''}</Text>
            {one.relayedBy !== '' && <Text dimColor>relayed by {one.relayedBy}</Text>}
            {one.phase !== '' && <Text dimColor>{one.phase}</Text>}
            <Text dimColor>{dayOf(one.recordedAt)}</Text>
            <Text dimColor>#{one.eventId}</Text>
          </Box>
          <Text>  {one.effect}</Text>
          {one.verbatim !== '' && <Text dimColor>  words: {one.verbatim}</Text>}
          {one.tags.length > 0 && <Text dimColor>  {one.tags.join(' ')}</Text>}
          {one.evidence !== '' && <Text dimColor>  cites: {one.evidence}</Text>}
          {one.supersededBy !== null && <Text dimColor>  superseded by #{one.supersededBy}</Text>}
          {one.result !== '' && <Text dimColor>  result: {one.result}{one.resultEvidence !== '' ? ` (${one.resultEvidence})` : ''}</Text>}
        </Box>
      ))}
      {note(ui, 'tagged-here', 'records tagged here from other items need ledger links (LP6-3)', { dimColor: true })}
    </Box>
  )
}

function linksSection(ui: Ui, view: View, d: Detail, act: Act, frame: Frame, band: Band): RenderElement {
  const { Box, Button, Link, Text } = ui
  if (d.eventsError !== null) {
    return (
      <Box key="links" flexDirection="column">
        {sectionHeader(ui, 'Links', '?', `${SECTION_KEY_PREFIX}links`)}
        {unread(ui, 'links-unread')}
      </Box>
    )
  }
  const links = groupLinks(linksOf(d.events))
  const known = new Map(view.items.map(one => [one.id, one]))
  return (
    <Box key="links" flexDirection="column">
      {sectionHeader(ui, 'Links', links.length === 0 ? '–' : String(links.length), `${SECTION_KEY_PREFIX}links`)}
      {links.length === 0 && note(ui, 'links-none', `no links; link with: ledger link ${d.id} --rel pr --target <url>`, { dimColor: true })}
      {links.length > 0 && <Text dimColor>out</Text>}
      {links.map(one => {
        const target = one.rel === 'pr' ? prShort(one.target) : one.target
        const other = known.get(one.target)
        return (
          <Box key={`link-${one.eventId}-${one.rel}`} gap={1}>
            <Text dimColor>{fit(one.rel, 10)}</Text>
            {other !== undefined ? (
              <Button key={`link-item-${one.eventId}`} plain onPress={() => act.openItem(other.id)}>
                <Text color={statusColor(other.status)}>{statusGlyph(other.status)}</Text> {other.id}{' '}
                {band === 'wide' ? other.title : cut(other.title, Math.max(10, frame.width - other.id.length - 20))}
              </Button>
            ) : one.href !== null ? (
              <Link href={one.href} label={target} />
            ) : (
              <Text>{target}</Text>
            )}
            {one.copyText !== null && copyButton(ui, `copy-link-${one.eventId}`, one.copyText, act)}
            <Text dimColor>#{one.eventId}</Text>
          </Box>
        )
      })}
      {note(ui, 'links-in', 'in: related items need ledger links (LP6-3)', { dimColor: true })}
      {note(ui, 'links-docs', 'documents: documents land with LC5', { dimColor: true })}
    </Box>
  )
}

function provenance(ui: Ui, event: Event): RenderElement {
  const { Box, Text } = ui
  return (
    <Box key={`provenance-${event.id}`} flexDirection="column">
      <Text dimColor>#{event.id} {event.kind}</Text>
      <Text dimColor>  actor {event.actor ?? '—'} · harness {event.harness ?? '—'} · model {event.model ?? '—'}</Text>
      <Text dimColor>  session {event.session ?? '—'}</Text>
      <Text dimColor>  time {stampOf(event.recordedAt)}</Text>
      <Text dimColor>  key {event.idempotencyKey === '' ? '—' : event.idempotencyKey}</Text>
      <Text dimColor>  hash {event.hash === '' ? '—' : event.hash}</Text>
    </Box>
  )
}

function timelineRow(ui: Ui, row: TimelineRow, open: boolean, act: Act, frame: Frame, band: Band): RenderElement {
  const { Box, Button, Code, Text } = ui
  const id = `#${row.id}`.padStart(7)
  const time = clockOf(row.at, band === 'wide')
  const elapsed = row.elapsed === null ? '' : ` · ${row.elapsed}`
  const color = kindColor(row.kind, row.summary)
  const modelWidth = band === 'wide' ? 15 : 0
  const fixed = 7 + 1 + time.length + 1 + 18 + 1 + 20 + 1 + modelWidth
  const summaryWidth = Math.max(16, frame.width - fixed - elapsed.length - 1)
  const wide = band === 'wide'
  return (
    <Box key={`event-${row.id}`} flexDirection="column">
      {band === 'narrow' ? (
        <Box flexDirection="column">
          <Button key={`event-row-${row.id}`} plain onPress={() => act.toggleEvent(row.id)}>
            <Text dimColor>{id}</Text> <Text dimColor>{time}</Text> <Text color={color}>{cut(row.kind, 18)}</Text> <Text dimColor>{cut(row.actor === '' ? '—' : row.actor, Math.max(6, frame.width - 36))}</Text>
          </Button>
          <Text>{'  '}{cut(row.summary + elapsed, Math.max(10, frame.width - 3))}</Text>
        </Box>
      ) : (
        <Button key={`event-row-${row.id}`} plain onPress={() => act.toggleEvent(row.id)}>
          <Text dimColor>{id}</Text> <Text dimColor>{time}</Text> <Text color={color}>{fit(row.kind, 18)}</Text> <Text dimColor>{fit(row.actor === '' ? '—' : row.actor, 20)}</Text>
          {wide ? <Text dimColor> {fit(row.model === '' ? '—' : row.model, 14)}</Text> : ''} <Text>{cut(row.summary, summaryWidth)}</Text>
          {row.elapsed !== null && <Text dimColor>{elapsed}</Text>}
        </Button>
      )}
      {open && (
        <Box key={`event-detail-${row.id}`} flexDirection={wide ? 'row' : 'column'} gap={wide ? 2 : 0} paddingLeft={2} paddingBottom={1}>
          <Box flexDirection="column">
            {row.events.map(event => (
              <Code key={`payload-${event.id}`} source={JSON.stringify(event.payload, null, 2)} language="json" />
            ))}
          </Box>
          <Box flexDirection="column">{row.events.map(event => provenance(ui, event))}</Box>
        </Box>
      )}
    </Box>
  )
}

function timelineSection(ui: Ui, view: View, d: Detail, act: Act, frame: Frame, band: Band, leading: number): RenderElement {
  const { Box, Button, Select, Text } = ui
  const heading = `${d.eventsOnItem} ${d.eventsOnItem === 1 ? 'event' : 'events'}${d.eventsDecayed > 0 ? `, ${d.eventsDecayed} ephemeral decayed` : ''}`
  if (d.eventsError !== null) {
    return (
      <Box key="timeline" flexDirection="column">
        {sectionHeader(ui, 'Timeline', '?', `${SECTION_KEY_PREFIX}timeline`)}
        {unread(ui, 'timeline-unread')}
      </Box>
    )
  }
  const order = view.timelineOrder
  const filter = (TIMELINE_FILTERS as readonly string[]).includes(view.timelineKind) ? view.timelineKind : 'all'
  const rows = timelineOf(d.events, filter, order)
  const range = windowOf(rows.length, frame.offset, frame.rows, leading, Math.max(10, frame.rows))
  const open = new Set(view.openEvents)
  const groups = dayGroups(rows)
  let index = 0
  return (
    <Box key="timeline" flexDirection="column">
      {sectionHeader(ui, 'Timeline', `${heading} · ${order === 'newest' ? 'newest first' : 'oldest first'}`, `${SECTION_KEY_PREFIX}timeline`)}
      <Box gap={2} flexWrap="wrap">
        <Select key="timeline-kind" label="Show" options={TIMELINE_FILTERS.map(kind => ({ label: kind, value: kind }))} value={filter} onSelect={value => act.setTimelineKind(value)} />
        <Button key="timeline-order" label={order === 'newest' ? 'Oldest first' : 'Newest first'} onPress={() => act.setTimelineOrder(order === 'newest' ? 'oldest' : 'newest')} />
      </Box>
      {rows.length === 0 && note(ui, 'timeline-none', filter === 'all' ? 'no events on this item' : `no ${filter} events on this item`, { dimColor: true })}
      {groups.map(group => (
        <Box key={`day-${group.day}-${group.rows[0]?.id ?? 0}`} flexDirection="column">
          <Text bold>
            {group.day} <Text dimColor>· {group.events} {group.events === 1 ? 'event' : 'events'}</Text>
          </Text>
          {group.rows.map(row => {
            const at = index
            index += 1
            if ((at < range.from || at >= range.to) && !open.has(row.id)) {
              return note(ui, `event-${row.id}`, `${`#${row.id}`.padStart(7)} ${cut(row.kind, 18)}`, { dimColor: true })
            }
            return timelineRow(ui, row, open.has(row.id), act, frame, band)
          })}
        </Box>
      ))}
      {rows.length > WINDOW_AFTER && note(ui, 'timeline-window', `${rows.length} rows; those near the window are drawn in full`, { dimColor: true })}
      {d.footer !== '' && (
        <Box marginTop={1}>
          <Text dimColor>{d.footer}</Text>
        </Box>
      )}
    </Box>
  )
}

function specSection(ui: Ui, d: Detail): RenderElement {
  const { Box, Text } = ui
  if (d.eventsError !== null) {
    return (
      <Box key="spec-section" flexDirection="column">
        {sectionHeader(ui, 'Spec', '?', `${SECTION_KEY_PREFIX}spec`)}
        {unread(ui, 'spec-unread')}
      </Box>
    )
  }
  const spec = specOf(d.events)
  const versions = d.events.filter(one => one.kind === 'item.spec').length
  if (spec === null) {
    return (
      <Box key="spec-section" flexDirection="column">
        {sectionHeader(ui, 'Spec', '–', `${SECTION_KEY_PREFIX}spec`)}
        {note(ui, 'spec-none', 'no spec recorded', { dimColor: true })}
      </Box>
    )
  }
  return (
    <Box key="spec-section" flexDirection="column">
      {sectionHeader(
        ui,
        'Spec',
        `${spec.version === null ? '' : `v${spec.version}`}${versions > 1 ? ` of ${versions}` : ''}${spec.size !== '' ? ` · size ${spec.size}` : ''}${spec.mergeClass !== '' ? ` · ${spec.mergeClass}` : ''} · #${spec.eventId}`,
        `${SECTION_KEY_PREFIX}spec`,
      )}
      <Box key="spec" flexDirection="column">
        <Text bold>{spec.title}</Text>
        {spec.body.split('\n').map((line, index) => (
          <Text key={`spec-body-${index}`}>{line}</Text>
        ))}
        {spec.acceptance !== '' && <Text bold>Acceptance</Text>}
        {spec.acceptance !== '' &&
          spec.acceptance.split('\n').map((line, index) => (
            <Text key={`spec-acceptance-${index}`}>{line}</Text>
          ))}
        {spec.source !== '' && <Text dimColor>source {spec.source}</Text>}
      </Box>
    </Box>
  )
}

function ticketSection(ui: Ui, d: Detail): RenderElement | false {
  const { Box, Text } = ui
  if (d.eventsError !== null) return false
  const notes = ticketOf(d.events)
  if (notes.length === 0) return false
  return (
    <Box key="ticket" flexDirection="column">
      {sectionHeader(ui, 'Ticket', String(notes.length), `${SECTION_KEY_PREFIX}ticket`)}
      {notes.map(one => (
        <Box key={`ticket-${one.eventId}`} gap={1}>
          <Text dimColor>{fit(one.type, 8)}</Text>
          <Text color={one.readable ? undefined : 'warning'}>{one.text}</Text>
          <Text dimColor>#{one.eventId}</Text>
        </Box>
      ))}
    </Box>
  )
}

/** Reviews, tried and plain notes, as the item screen drew them before the timeline; the timeline's rows carry one line each. */
function recordSections(ui: Ui, d: Detail): RenderElement | false {
  const { Box, Link, Text } = ui
  if (d.eventsError !== null) return false
  const reviews = reviewsOf(d.events)
  const tried = triedOf(d.events)
  const notes = notesOf(d.events)
  if (reviews.length + tried.length + notes.length === 0) return false
  return (
    <Box key="event-sections" flexDirection="column">
      {reviews.length > 0 && sectionHeader(ui, 'Reviews', String(reviews.length))}
      {reviews.map(one => (
        <Box key={`review-${one.eventId}`} flexDirection="column">
          <Box gap={1}>
            <Text dimColor>·</Text>
            <Text color={/changes|fail|bug|block/i.test(one.verdict) ? 'error' : 'success'}>
              {one.round === null ? '' : `r${one.round} `}
              {one.verdict}
            </Text>
            {one.head !== '' && <Text dimColor>on {one.head.slice(0, 8)}</Text>}
            {one.pr !== '' && <Text>{one.pr}</Text>}
            {one.reviewer !== '' && <Text dimColor>by {one.reviewer}</Text>}
            {one.evidence !== '' && <Text dimColor>{one.evidence}</Text>}
            <Text dimColor>#{one.eventId}</Text>
          </Box>
          {one.findings.map((finding, index) => (
            <Text key={`finding-${one.eventId}-${index}`} dimColor>
              {'    '}- {finding}
            </Text>
          ))}
        </Box>
      ))}

      {tried.length > 0 && sectionHeader(ui, 'Tried', String(tried.length))}
      {tried.map(one => (
        <Box key={`tried-${one.eventId}`} flexDirection="column">
          <Box gap={1}>
            <Text dimColor>·</Text>
            <Text>{one.what}</Text>
            {one.phase !== '' && <Text dimColor>{one.phase}</Text>}
            <Text dimColor>#{one.eventId}</Text>
          </Box>
          {one.outcome !== '' && <Text dimColor>  outcome: {one.outcome}</Text>}
          {one.evidence !== '' && <Text dimColor>  evidence: {one.evidence}</Text>}
        </Box>
      ))}

      {notes.length > 0 && sectionHeader(ui, 'Notes', String(notes.length))}
      {notes.map(one => (
        <Box key={`note-${one.eventId}`} gap={1}>
          <Text dimColor>·</Text>
          {one.href !== null ? <Link href={one.href} label={one.text} /> : <Text>{one.text}</Text>}
          <Text dimColor>#{one.eventId}</Text>
        </Box>
      ))}
    </Box>
  )
}

/** The strip under the tab row: one Button per section the item has, with its hotkey and count. */
function strip(ui: Ui, d: Detail, act: Act): RenderElement {
  const { Box, Button } = ui
  return (
    <Box key="strip" gap={1} flexWrap="wrap">
      {stripOf(d.eventsError === null ? d.events : null).map(entry => (
        <Button
          key={`strip-${entry.section}`}
          label={entry.count === '' ? entry.label : `${entry.label} ${entry.count}`}
          hotkey={entry.hotkey}
          onPress={() => act.jump(`${SECTION_KEY_PREFIX}${entry.section}`)}
        />
      ))}
    </Box>
  )
}

function itemHeader(ui: Ui, d: Detail, band: Band): RenderElement {
  const { Box, Text } = ui
  const fields = [
    <Text key="id" bold>
      {d.id}
    </Text>,
    <Text key="status" color={statusColor(d.status)}>
      {statusGlyph(d.status)} {d.status}
    </Text>,
    <Text key="type" dimColor>
      {d.type}
    </Text>,
    d.owner !== null ? (
      <Text key="owner" dimColor>
        owner {d.owner}
      </Text>
    ) : null,
    d.revision !== null ? (
      <Text key="revision" dimColor>
        revision {d.revision.id}
      </Text>
    ) : null,
  ]
  return band === 'narrow' ? (
    <Box key="header" flexDirection="column" marginTop={1}>
      {fields}
    </Box>
  ) : (
    <Box key="header" gap={1} marginTop={1} flexWrap="wrap">
      {fields}
    </Box>
  )
}

/** Opens the detail drawn dim, with the age of the read it shows, when the ledger refused the latest one. */
function dimmed(ui: Ui): Ui {
  return { ...ui, Text: props => ui.Text({ ...props, dimColor: true }) }
}

function item(ui: Ui, view: View, act: Act, frame: Frame): RenderElement {
  const { Box, Button, Text } = ui
  const d: Detail | null = view.item
  const id = view.itemId ?? ''
  const band = bandOf(frame.width)
  const stale = view.itemError !== null && d !== null
  const body = stale ? dimmed(ui) : ui
  const nav: Nav = { screen: view.screen, itemId: view.itemId, history: view.history, siblings: view.siblings }
  const prev = navStep(nav, -1)
  const next = navStep(nav, 1)
  const links = d !== null && d.eventsError === null ? linksOf(d.events) : []
  const open = firstOpenable(links)
  let leading = 0
  if (d !== null) {
    leading = 14 + 6 * d.questions.length + d.blockers.length + (d.eventsError === null ? electionsOf(d.events).length * 4 + recordsOf(d.events).length * 5 + links.length + 6 : 0)
  }
  return (
    <Box flexDirection="column">
      <Box gap={1} marginTop={1} flexWrap="wrap">
        <Button key="back" label="Back" hotkey="x" onPress={() => act.back()} />
        <Button key="copy" label="Copy id" hotkey="c" onPress={() => act.copy(id)} />
        {prev !== null && <Button key="prev-item" label="Prev" hotkey="a" onPress={() => act.step(-1)} />}
        {next !== null && <Button key="next-item" label="Next" hotkey="f" onPress={() => act.step(1)} />}
        {view.history.length > 0 && <Button key="history" label="Last item" hotkey="b" onPress={() => act.historyBack()} />}
        {open !== null && <Button key="open-link" label={`Copy ${open.label}`} hotkey="o" onPress={() => act.copy(open.text)} />}
        {view.itemLoading && <Text dimColor>reading {id}…</Text>}
      </Box>
      {view.itemError !== null && <Text color="error">{view.itemError}</Text>}
      {stale && view.itemReadAt !== null && note(ui, 'stale', `showing the read from ${ageOf(view.itemReadAt, frame.now)} ago`, { dimColor: true })}
      {d !== null && strip(ui, d, act)}
      {d !== null && (
        <Box flexDirection="column">
          {itemHeader(body, d, band)}
          <body.Text>{d.title}</body.Text>
          {d.eventsError === null && headerLine(headerOf(d.events, d.status)) !== '' && <body.Text dimColor>{headerLine(headerOf(d.events, d.status))}</body.Text>}
          {nowSection(body, view, d, act, frame, band)}
          {d.eventsError !== null && eventsFailed(body, d)}
          {decisionsSection(body, d)}
          {linksSection(body, view, d, act, frame, band)}
          {timelineSection(body, view, d, act, frame, band, leading)}
          {specSection(body, d)}
          {ticketSection(body, d)}
          {recordSections(body, d)}
        </Box>
      )}
    </Box>
  )
}

function decisions(ui: Ui, view: View, act: Act, frame: Frame): RenderElement {
  const { Box, Button, Select, Text } = ui
  const list = filterDecisions(view.decisions, view.standingFilter)
  const size = Math.max(5, Math.floor((frame.rows - 6) / 1))
  const pages = pageCount(list.length, size)
  const page = Math.min(view.page, pages - 1)
  const shown = pageOf(list, page, size)
  const idWidth = idWidthOf(shown.map(one => one.itemId))
  // A narrow pane gives the effect its own line under the row's stamps.
  const narrow = frame.width < 2 + 11 + 7 + 11 + idWidth + 1 + 24
  const effectWidth = narrow ? Math.max(10, frame.width - 3) : frame.width - (2 + 11 + 7 + 11 + idWidth + 1) - 1
  return (
    <Box flexDirection="column">
      <Box gap={2} marginTop={1} flexWrap="wrap">
        <Select
          key="standing"
          label="Standing"
          options={STANDING_FILTERS.map(standing => ({ label: standing, value: standing }))}
          value={view.standingFilter}
          onSelect={value => act.setStanding(value)}
        />
        <Text dimColor>
          {thousands(list.length)} {list.length === 1 ? 'decision' : 'decisions'}
          {pages > 1 ? ` · page ${page + 1} of ${pages}` : ''}
        </Text>
        {pages > 1 && <Button key="next" label="Next" hotkey="j" onPress={() => act.page(1)} />}
        {pages > 1 && <Button key="prev" label="Prev" hotkey="k" onPress={() => act.page(-1)} />}
      </Box>
      {list.length === 0 && <Text dimColor>No decision records yet.</Text>}
      {shown.map(one => decisionRow(ui, one, view, act, frame, idWidth, effectWidth, narrow, list.map(each => each.itemId)))}
    </Box>
  )
}

function decisionRow(ui: Ui, one: Decision, view: View, act: Act, frame: Frame, idWidth: number, effectWidth: number, narrow: boolean, siblings: readonly string[]): RenderElement {
  const { Box, Button, Text } = ui
  const isOpen = view.expanded === one.eventId
  const tags = one.tags.map(tag => `${tag.type}:${tag.id}`).join(' ')
  return (
    <Box key={`decision-${one.eventId}`} flexDirection="column">
      <Button key={`decision-row-${one.eventId}`} plain onPress={() => act.toggle(one.eventId)}>
        <Text color={standingColor(one.standing)}>{standingGlyph(one.standing)}</Text> <Text dimColor>{fit(one.standing, 10)}</Text> <Text dimColor>{fit(dayOf(one.recordedAt), 6)}</Text>{' '}
        {fit(one.who, 10)} <Text dimColor>{fit(one.itemId, idWidth)}</Text>
        {narrow ? '' : ` ${cut(one.effect, effectWidth)}`}
      </Button>
      {narrow && !isOpen && <Text>{'  '}{cut(one.effect, effectWidth)}</Text>}
      {isOpen && (
        <Box flexDirection="column" paddingLeft={2} paddingBottom={1}>
          <Text>{one.effect}</Text>
          <Box gap={1}>
            <Text dimColor>words:</Text>
            <Text italic>{one.verbatim}</Text>
          </Box>
          <Text dimColor>
            {one.who} ({one.whoKind}) · {whenOf(one.recordedAt)}
            {one.phase !== null ? ` · phase ${one.phase}` : ''}
            {tags !== '' ? ` · ${tags}` : ''}
            {one.supersededBy !== null ? ` · superseded by #${one.supersededBy}` : ''}
          </Text>
          {one.result !== null && <Text dimColor>result: {one.result}</Text>}
          {one.evidence !== null && <Text dimColor>evidence: {one.evidence}</Text>}
          <Box>
            <Button key={`decision-open-${one.eventId}`} label={`Open ${one.itemId}`} onPress={() => act.openItem(one.itemId, siblings)} />
          </Box>
        </Box>
      )}
    </Box>
  )
}

function search(ui: Ui, view: View, act: Act, frame: Frame): RenderElement {
  const { Box, Button, Input, Text } = ui
  const hits = view.hits
  const idWidth = idWidthOf(hits.map(hit => hit.itemId ?? ''))
  const titleWidth = Math.max(16, frame.width - (9 + 1 + 6 + 1 + idWidth + 1) - 1)
  const hitIds = hits.flatMap(hit => (hit.itemId === null ? [] : [hit.itemId]))
  return (
    <Box flexDirection="column">
      <Box marginTop={1}>
        <Input
          key="query"
          label="Search"
          placeholder="words, ranked by the ledger's own index"
          value={view.query}
          autoFocus
          onSubmit={value => act.search(value)}
        />
      </Box>
      {view.searched !== null && (
        <Text dimColor>
          {hits.length} {hits.length === 1 ? 'result' : 'results'} for "{view.searched}"
        </Text>
      )}
      {hits.map(hit => (
        <Box key={`hit-${hit.id}`} flexDirection="column">
          {hit.itemId !== null ? (
            <Button key={`hit-open-${hit.id}`} plain onPress={() => act.openItem(hit.itemId ?? '', hitIds)}>
              <Text dimColor>{fit(hit.docType, 9)}</Text> <Text dimColor>{fit(dayOf(hit.date), 6)}</Text> {fit(hit.itemId, idWidth)} {cut(hit.title, titleWidth)}
            </Button>
          ) : (
            <Box gap={1}>
              <Text dimColor>{fit(hit.docType, 9)}</Text>
              <Text dimColor>{fit(dayOf(hit.date), 6)}</Text>
              <Text dimColor>{fit('', idWidth)}</Text>
              <Text>{cut(hit.title, titleWidth)}</Text>
            </Box>
          )}
          {hit.snippet !== '' && hit.snippet !== hit.title && <Text dimColor>{'  '}{cut(hit.snippet, frame.width - 4)}</Text>}
        </Box>
      ))}
    </Box>
  )
}
