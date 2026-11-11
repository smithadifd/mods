import { describe, expect, test } from 'claude-code/testing'

import type { Event } from '../types'
import { dataOf, parseEvents } from '../hooks/cli'
import { stripOf, ticketCount, ticketGoLine, ticketRecordOf, ticketRoundLine, ticketStepsLine } from '../hooks/model'
import { LEDGER_0_1_18_TICKET_EXPORT_STDOUT } from './ledger-0.1.18-ticket-export'

function ev(id: number, kind: string, payload: Record<string, unknown>, idempotencyKey = `key-${id}`): Event {
  return { id, kind, actor: 'seat', harness: 'cli', model: null, session: null, idempotencyKey, hash: `hash-${id}`, recordedAt: '2026-11-05T12:00:00Z', summary: `summary of ${kind} ${id}`, payload }
}

function frame(id: number, kind: string, record: unknown, version = 2): Event {
  return ev(id, 'item.note', { text: `ticket-${kind}:v${version} ${JSON.stringify(record)}`, source: 'ticket' })
}

const CRITERIA = ['first criterion', 'second criterion']
const STEPS = ['orient', 'research', 'plan', 'build', 'review', 'outward'].map(name => ({ name, status: 'complete' }))

function plan(revision: number, criteria: string[] = CRITERIA): Record<string, unknown> {
  return { schema: 'ticket-plan-card/v2', key: 'T-1', title: 't', revision, pass: 'abc123', criteria, steps: STEPS, open_questions: [] }
}

function review(round: number, planRevision: number, passed: number[], criteria: string[] = CRITERIA, verdict = 'pass'): Record<string, unknown> {
  return { round, verdict, plan_revision: planRevision, criteria, passed, findings: [], reviewer: 'fresh', evidence: 'work/r.json' }
}

const GO = { who: 'the person', who_kind: 'person', verbatim: 'Go', effect: 'The plan gate is approved for plan revision 1.', gate: 'plan', plan_revision: 1, standing: 'settled' }

// The real export: a ledger 0.1.18 `export-item` of a closed ticket, written by the /ticket skill's own import.
const CAPTURED = parseEvents(dataOf('export-item', { exitCode: 0, stdout: LEDGER_0_1_18_TICKET_EXPORT_STDOUT, stderr: '' }))

describe('the Ticket section against a captured ledger 0.1.18 export of a closed ticket', () => {
  const record = ticketRecordOf(CAPTURED.events)

  test('the capture reads as fourteen events with nothing unreadable', () => {
    expect(CAPTURED.error).toBe(null)
    expect(CAPTURED.events.length).toBe(14)
    expect(record).not.toBe(null)
    expect(record!.unreadable).toEqual([])
  })

  test('the plan revision with its criteria checked by the review round on that revision', () => {
    expect(record!.plans.map(one => [one.eventId, one.revision, one.pass])).toEqual([[3, 1, '5a1c0de5a1c0de01']])
    const current = record!.plans[0]!
    expect(current.criteria).toEqual([
      { text: 'Raise zod in the frontend to at least 4.6.6.', mark: 'passed', round: 1 },
      { text: 'npm audit in frontend shows no high-severity finding for zod.', mark: 'passed', round: 1 },
      { text: 'npm run build, npm run type-check, npm run lint and npm test stay green.', mark: 'passed', round: 1 },
      { text: 'No deploy.', mark: 'passed', round: 1 },
    ])
    expect(ticketStepsLine(current.steps)).toBe('orient complete · research complete · plan skipped · build pending · review pending · outward pending')
    expect(current.steps.find(step => step.name === 'plan')?.skip).toBe('a one-package lockfile-only bump with no design choice')
    expect(current.diffStatement).toBe('Update frontend/package-lock.json so the transitive dev dependency zod resolves to 4.6.7 instead of 4.6.5, with no package.json change.')
    expect(current.openQuestions).toHaveLength(1)
  })

  test('the plan go and the outward go, each with its plan revision, who and verbatim words', () => {
    expect(record!.goes.map(one => [one.eventId, ticketGoLine(one)])).toEqual([
      [4, 'plan go · plan r1 · the person: "Go"'],
      [5, 'outward go · plan r1 · the person: "Go"'],
    ])
  })

  test('the review round with its verdict, plan revision, criteria passed and reviewer', () => {
    expect(record!.rounds.map(one => [one.eventId, ticketRoundLine(one), one.evidence])).toEqual([[6, 'r1 pass · plan r1 · 4 of 4 criteria · fresh-context reviewer', 'work/ic-zod-bump/review/receipts/diff-claude-empirical-r1/review-run.json']])
  })

  test('the five tried records with phase, outcome and evidence', () => {
    expect(record!.tried.map(one => [one.eventId, one.phase])).toEqual([
      [7, 'orient'],
      [8, 'build'],
      [9, 'build'],
      [10, 'review'],
      [11, 'review'],
    ])
    expect(record!.tried[1]).toEqual({ eventId: 8, phase: 'build', what: 'builder-core dispatch', outcome: 'refused: agent worktree isolation needs a git cwd; built on the main thread in the same worktree', evidence: 'branch:fix/zod-advisory' })
  })

  test('the three stop stamps, the last the close stamp of the skill\'s own close', () => {
    expect(record!.stops.map(one => [one.eventId, one.phase, one.close, one.skills])).toEqual([
      [12, 'plan', false, ['ticket']],
      [13, 'review', false, ['ticket']],
      [14, 'close', true, ['deploy']],
    ])
    expect(record!.stops[2]!.refs).toContain('example/example-app#423')
    expect(record!.stops[0]!.point).toBe('Waiting at plan go for plan revision 1.')
  })

  test('the strip carries Ticket with the section\'s row count', () => {
    expect(ticketCount(record!)).toBe(12)
    expect(stripOf(CAPTURED.events).find(entry => entry.section === 'ticket')).toMatchObject({ label: 'Ticket', hotkey: 'g', count: '12' })
  })
})

describe('the Ticket section is there only for an item with ticket frames', () => {
  test('tried and stop stamps the skill wrote, without a frame, give no section and no strip entry', () => {
    const log = [
      ev(1, 'item.created', { type: 'ticket', title: 't', source: 'ticket' }),
      ev(2, 'item.tried', { what: 'w', phase: 'build', source: 'ticket' }),
      ev(3, 'item.stopped', { point: 'p', phase: 'plan', skills: [], refs: [], source: 'ticket' }),
      ev(4, 'item.note', { text: 'a plain note' }),
    ]
    expect(ticketRecordOf(log)).toBe(null)
    expect(ticketRecordOf([])).toBe(null)
    expect(stripOf(log).some(entry => entry.section === 'ticket')).toBe(false)
  })

  test('tried and stops another writer recorded are not the ticket\'s', () => {
    const record = ticketRecordOf([frame(1, 'plan', plan(1)), ev(2, 'item.tried', { what: 'w', phase: 'build', source: 'loop' }), ev(3, 'item.stopped', { point: 'p', phase: 'plan' })])
    expect(record!.tried).toEqual([])
    expect(record!.stops).toEqual([])
  })

  test('a close-phase stamp is the close stamp only under the skill\'s close key', () => {
    const stop = { point: 'done', phase: 'close', skills: [], refs: [], source: 'ticket' }
    const record = ticketRecordOf([frame(1, 'plan', plan(1)), ev(2, 'item.stopped', stop), ev(3, 'item.stopped', stop, 'ticket-close/T-1/aa/bb/stop')])
    expect(record!.stops.map(one => [one.eventId, one.close])).toEqual([
      [2, false],
      [3, true],
    ])
  })
})

describe('criteria checks', () => {
  test('each revision is checked by its own latest round; a criterion whose text moved is unchecked', () => {
    const record = ticketRecordOf([
      frame(1, 'plan', plan(1)),
      frame(2, 'review', review(1, 1, [], CRITERIA, 'changes')),
      frame(3, 'plan', plan(2, ['first criterion', 'a reworded second'])),
      frame(4, 'review', review(2, 2, [0], ['first criterion', 'second criterion'], 'changes')),
      frame(5, 'plan', plan(3)),
    ])!
    expect(record.plans.map(one => [one.revision, one.criteria.map(check => `${check.mark}:${check.round ?? '-'}`)])).toEqual([
      [3, ['unchecked:-', 'unchecked:-']],
      [2, ['passed:2', 'unchecked:-']],
      [1, ['failed:1', 'failed:1']],
    ])
  })
})

describe('a frame the section cannot read is shown as unreadable, never guessed', () => {
  test('an unknown frame version: the record is not read as a plan, and the rest still draws', () => {
    const record = ticketRecordOf([frame(1, 'plan', plan(1), 3), frame(2, 'decision', GO)])!
    expect(record.plans).toEqual([])
    expect(record.unreadable).toEqual([{ eventId: 1, frame: 'ticket-plan:v3', reason: 'format version 3 is not one this pane reads' }])
    expect(record.currentPlan).toBe(1)
    expect(record.goes.map(ticketGoLine)).toEqual(['plan go · plan r1 · the person: "Go"'])
    expect(stripOf([frame(1, 'plan', plan(1), 3)]).find(entry => entry.section === 'ticket')?.count).toBe('1')
  })

  test('a readable v2 plan followed by an unsupported v3 plan: the v3 is the current revision, the v2 is not', () => {
    const record = ticketRecordOf([frame(1, 'plan', plan(1)), frame(2, 'plan', plan(2), 3)])!
    expect(record.plans.map(one => [one.eventId, one.revision])).toEqual([[1, 1]])
    expect(record.currentPlan).toBe(2)
    expect(record.unreadable).toEqual([{ eventId: 2, frame: 'ticket-plan:v3', reason: 'format version 3 is not one this pane reads' }])
    // An unreadable v2 plan frame newest is the current revision too; the older readable plan is not promoted.
    expect(ticketRecordOf([frame(1, 'plan', plan(1)), frame(2, 'plan', { ...plan(2), pass: '' })])!.currentPlan).toBe(2)
    // With every plan frame readable, the newest one is current.
    expect(ticketRecordOf([frame(1, 'plan', plan(1)), frame(2, 'plan', plan(2))])!.currentPlan).toBe(2)
    expect(ticketRecordOf([frame(1, 'decision', GO)])!.currentPlan).toBe(null)
  })

  test('each near miss of the frame grammar is unreadable with its reason, or not a frame at all', () => {
    const record = ticketRecordOf([
      frame(1, 'other', {}),
      ev(2, 'item.note', { text: 'ticket-plan:v2 {not json' }),
      ev(3, 'item.note', { text: 'ticket-review:v2 [1,2]' }),
      frame(4, 'plan', { ...plan(1), schema: 'ticket-plan-card/v3' }),
      frame(5, 'plan', { ...plan(1), revision: 0 }),
      frame(6, 'review', review(1, 1, [2])),
      frame(7, 'review', { ...review(1, 1, [0]), verdict: 'approve' }),
      frame(8, 'decision', { ...GO, gate: 'merge' }),
      frame(9, 'decision', { ...GO, plan_revision: undefined }),
      frame(10, 'review', { ...review(1, 1, [0, 0]) }),
      frame(11, 'decision', { ...GO, verbatim: '' }),
      ev(12, 'item.tried', { phase: 'build', source: 'ticket' }),
      frame(13, 'plan', { ...plan(1), criteria: [] }),
      frame(14, 'plan', { ...plan(1), pass: '' }),
      frame(15, 'plan', { ...plan(1), steps: 'all done' }),
      frame(16, 'plan', { ...plan(1), steps: [{ name: 'orient' }] }),
      frame(17, 'plan', { ...plan(1), steps: [{ name: 'plan', status: 'skipped', skip: 3 }] }),
      frame(18, 'plan', { ...plan(1), open_questions: undefined }),
      frame(19, 'plan', { ...plan(1), diff_statement: 5 }),
      frame(20, 'decision', { ...GO, who: undefined }),
      frame(21, 'decision', { ...GO, effect: ' ' }),
      frame(22, 'review', { ...review(1, 1, []), round: 'one' }),
      frame(23, 'review', review(1, 1, [], [])),
      frame(24, 'review', { ...review(1, 1, []), findings: undefined }),
      frame(25, 'review', { ...review(1, 1, []), reviewer: '' }),
      frame(26, 'review', { ...review(1, 1, []), evidence: undefined }),
      frame(27, 'review', { ...review(1, 1, []), plan_revision: undefined }),
      ev(28, 'item.stopped', { phase: 'plan', skills: [], refs: [], source: 'ticket' }),
    ])!
    expect(record.unreadable.map(one => [one.eventId, one.frame, one.reason])).toEqual([
      [1, 'ticket-other:v2', 'a record kind the ticket skill does not write'],
      [2, 'ticket-plan:v2', 'the body is not JSON'],
      [3, 'ticket-review:v2', 'the body is not a JSON object'],
      [4, 'ticket-plan:v2', 'plan schema is ticket-plan-card/v3'],
      [5, 'ticket-plan:v2', 'no plan revision'],
      [6, 'ticket-review:v2', 'passed is not a list of criterion indices'],
      [7, 'ticket-review:v2', 'a verdict other than pass or changes'],
      [8, 'ticket-decision:v2', 'unknown gate merge'],
      [9, 'ticket-decision:v2', 'a go without a plan revision'],
      [10, 'ticket-review:v2', 'passed is not a list of criterion indices'],
      [11, 'ticket-decision:v2', 'no verbatim'],
      [12, 'item.tried', 'a tried record without what or phase'],
      [13, 'ticket-plan:v2', 'no criteria'],
      [14, 'ticket-plan:v2', 'no pass'],
      [15, 'ticket-plan:v2', 'no steps'],
      [16, 'ticket-plan:v2', 'a step without a name or status'],
      [17, 'ticket-plan:v2', 'step plan has a skip that is not text'],
      [18, 'ticket-plan:v2', 'no open questions list'],
      [19, 'ticket-plan:v2', 'a diff statement that is not text'],
      [20, 'ticket-decision:v2', 'no who'],
      [21, 'ticket-decision:v2', 'no effect'],
      [22, 'ticket-review:v2', 'no round'],
      [23, 'ticket-review:v2', 'no criteria'],
      [24, 'ticket-review:v2', 'no findings list'],
      [25, 'ticket-review:v2', 'no reviewer'],
      [26, 'ticket-review:v2', 'no evidence'],
      [27, 'ticket-review:v2', 'no plan revision'],
      [28, 'item.stopped', 'a stop stamp without point or phase'],
    ])
    expect([record.plans, record.goes, record.rounds, record.tried, record.stops]).toEqual([[], [], [], [], []])
  })

  test('text that does not have the frame exactly is an ordinary note, not a ticket record', () => {
    for (const text of ['Ticket-plan:v2 {}', 'ticket-plan:V2 {}', 'ticket-plan:v2{}', 'ticket-plan:v02 {}', 'ticket-plan:v0 {}', ' ticket-plan:v2 {}', '- ticket-plan:v2 {}', 'ticket-plan:v2 ', 'ticket_plan:v2 {}']) {
      expect(ticketRecordOf([ev(1, 'item.note', { text })])).toBe(null)
    }
  })

  test('a payload that is not an object, or a note with no text, never throws', () => {
    const odd = [{ ...ev(1, 'item.note', {}), payload: null as never }, { ...ev(2, 'item.tried', {}), payload: 'x' as never }, ev(3, 'item.note', { text: 42 })]
    expect(() => ticketRecordOf(odd)).not.toThrow()
    expect(ticketRecordOf(odd)).toBe(null)
  })
})
