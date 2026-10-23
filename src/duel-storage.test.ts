import { describe, expect, it } from 'vitest'
import { DEFAULT_DUEL_PREFERENCES, loadDuelPreferences, loadDuelRecords, saveDuelPreferences, saveDuelRecords, type DuelRecord } from './duel-storage'

function memory() {
  const items = new Map<string, string>()
  return { items, getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value) } }
}
const record = (): DuelRecord => ({ variant: 'alternating-v1', id: 'one', seed: 'same', initialFirstSide: 'player', completedAt: '2026-10-23T08:00:00Z', outcome: 'won', hp: 2, turns: [], feedback: '' })

describe('輪流插牌獨立本機儲存', () => {
  it('空儲存提供預設且設定可以往返', () => {
    const store = memory()
    expect(loadDuelPreferences(store)).toEqual({ value: DEFAULT_DUEL_PREFERENCES, ok: true })
    const preferences = { ...DEFAULT_DUEL_PREFERENCES, seed: 'phone', firstSide: 'enemy' as const, speed: 2 as const, reducedMotion: true }
    expect(saveDuelPreferences(preferences, store)).toBe(true)
    expect(loadDuelPreferences(store)).toEqual({ value: preferences, ok: true })
  })
  it('損壞JSON與錯誤型別提示降級，不阻止遊玩', () => {
    const store = memory()
    store.items.set('nitian.duel.settings.v1', '{bad')
    expect(loadDuelPreferences(store).ok).toBe(false)
    store.items.set('nitian.duel.settings.v1', JSON.stringify({ ...DEFAULT_DUEL_PREFERENCES, firstSide: 'cheat' }))
    expect(loadDuelPreferences(store).ok).toBe(false)
    store.items.set('nitian.duel.records.v1', JSON.stringify([{ ...record(), turns: [{}] }]))
    expect(loadDuelRecords(store)).toEqual({ value: [], ok: false })
  })
  it('新舊紀錄不覆蓋，只保留最近20場', () => {
    const store = memory()
    store.items.set('nitian.records.v1', 'old-records')
    const records = Array.from({ length: 23 }, (_, index) => ({ ...record(), id: String(index) }))
    expect(saveDuelRecords(records, store)).toBe(true)
    expect(loadDuelRecords(store).value.map(value => value.id)).toEqual(records.slice(0, 20).map(value => value.id))
    expect(store.items.get('nitian.records.v1')).toBe('old-records')
  })
  it('有回合與回饋的完整紀錄往返，拒絕其他版本', () => {
    const store = memory()
    const value: DuelRecord = { ...record(), feedback: '反制太強', turns: [{ round: 1, firstSide: 'player', hands: { player: [], enemy: [] }, timeline: [], moves: [], events: [], decisionMs: 2, after: { player: { hp: 2, maxHp: 45, shield: 0, thunder: 0, evade: false, thorns: false }, enemy: { hp: 0, maxHp: 45, shield: 0, thunder: 0, evade: false, thorns: false } } }] }
    saveDuelRecords([value], store)
    expect(loadDuelRecords(store)).toEqual({ value: [value], ok: true })
    store.items.set('nitian.duel.records.v1', JSON.stringify([{ ...value, variant: 'legacy' }]))
    expect(loadDuelRecords(store).ok).toBe(false)
  })
  it('儲存權限被拒絕時回報失敗', () => {
    const denied = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    expect(loadDuelRecords(denied)).toEqual({ value: [], ok: false })
    expect(loadDuelPreferences(denied).ok).toBe(false)
    expect(saveDuelPreferences(DEFAULT_DUEL_PREFERENCES, denied)).toBe(false)
    expect(saveDuelRecords([record()], denied)).toBe(false)
  })
})
