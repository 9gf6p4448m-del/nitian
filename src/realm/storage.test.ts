import { describe, expect, it } from 'vitest'
import { createRealm } from './engine'
import { defaults, readHistory, recordVictory, writeRecord } from './storage'
import type { RealmRecord, Store } from './storage'
function memory(): Store { const map = new Map<string, string>(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v) } } }
function record(id = 'one'): RealmRecord { const state = createRealm('full'); return { schema: 'nitian.realm.v1', id, startedAt: '2026-10-23', completedAt: '2026-10-23', settings: defaults, turns: [{ side: 'asura', action: { type: 'build', at: 0, rank: 1 }, before: state, after: state, decisionMs: 20 }], outcome: { winner: 'draw', scores: { asura: 2, deva: 2 } }, feedback: '' } }
describe('realm local records', () => {
  it('distinguishes domain records while keeping old records as power rules', () => {
    const store = memory()
    expect(recordVictory(record())).toBe('power')
    const next = { ...record('domains'), settings: { ...defaults, victory: 'domains' as const }, outcome: { winner: 'deva' as const, scores: { asura: 13, deva: 12 }, rule: 'domains' as const, reason: 'domains' as const, domains: { asura: 1, deva: 2 } } }
    expect(writeRecord(next, store).error).toBe(false)
    const saved = readHistory(store).records[0]
    expect(recordVictory(saved)).toBe('domains')
    expect(saved.outcome).toEqual(next.outcome)
    expect(recordVictory({ ...next, settings: defaults })).toBe('domains')
  })
  it('empty, bad JSON, malformed and unavailable storage remain usable', () => {
    expect(readHistory(memory())).toEqual({ records: [], error: false })
    for (const raw of ['{', '{}', '[{}]']) expect(readHistory({ getItem: () => raw, setItem() {} }).error).toBe(true)
    expect(readHistory({ getItem() { throw Error('denied') }, setItem() {} }).error).toBe(true)
    expect(readHistory().error).toBe(true)
  })
  it('saves, replaces feedback and caps history at20', () => {
    const store = memory()
    for (let i = 0; i < 22; i++) expect(writeRecord(record(String(i)), store).error).toBe(false)
    expect(readHistory(store).records).toHaveLength(20)
    expect(writeRecord({ ...record('21'), feedback: '想再試' }, store).records[0].feedback).toBe('想再試')
    expect(readHistory(store).records).toHaveLength(20)
  })
  it('does not save unfinished games and exposes write errors', () => {
    expect(writeRecord({ ...record(), outcome: null }, memory()).error).toBe(true)
    expect(writeRecord({ ...record(), completedAt: null }, memory()).error).toBe(true)
    expect(writeRecord({ ...record(), turns: [] }, memory()).error).toBe(true)
    expect(writeRecord(record(), { getItem: () => null, setItem() { throw Error('quota') } }).error).toBe(true)
    expect(writeRecord(record()).error).toBe(true)
  })
})
