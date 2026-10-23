import { describe, expect, it } from 'vitest'
import { createGame } from './engine'
import { defaultSettings, loadHistory, loadSettings, saveCompleted, saveFeedback, saveSettings } from './storage'
import type { FireRecord, FireStorage } from './storage'

function memoryStorage(): FireStorage {
  const data = new Map<string, string>()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) } }
}
function record(id: string): FireRecord {
  const before = createGame('B')
  const outcome = { winner: 'asura' as const, reason: 'offering' as const }
  return { id, startedAt: '2026-10-23T00:00:00.000Z', completedAt: '2026-10-23T00:01:00.000Z', settings: { ...defaultSettings }, turns: [{ index: 1, actor: 'human', side: 'asura', action: { type: 'offer', unitId: 'a1' }, before, after: { ...before, result: outcome }, events: [], decisionMs: 1200 }], outcome, feedback: '' }
}
describe('奪火本機儲存', () => {
  it('初次使用預設 B 人機先手，設定可讀回且使用獨立命名空間', () => {
    const storage = memoryStorage()
    storage.setItem('nitian.settings.v1', '舊模式資料')
    expect(loadSettings(storage)).toEqual({ value: defaultSettings, error: false })
    const settings = { variant: 'A' as const, opponent: 'local' as const, humanSide: 'deva' as const }
    expect(saveSettings(settings, storage)).toBe(true)
    expect(loadSettings(storage).value).toEqual(settings)
    expect(storage.getItem('nitian.settings.v1')).toBe('舊模式資料')
  })
  it('儲存故障回報但不拋出，保留本局可匯出資料', () => {
    const storage = { getItem: () => { throw new Error('停用') }, setItem: () => { throw new Error('已滿') } }
    expect(loadSettings(storage).error).toBe(true)
    expect(loadHistory(storage)).toEqual({ value: [], error: true })
    expect(saveSettings(defaultSettings, storage)).toBe(false)
    const saved = saveCompleted(record('failure'), storage)
    expect(saved.error).toBe(true)
    expect(saved.value[0].id).toBe('failure')
  })
  it('拒絕損壞 JSON 與無效設定及紀錄格式', () => {
    const storage = memoryStorage()
    for (const value of ['{', 'null', '{"variant":"C"}', '[]']) {
      storage.setItem('nitian.fire.settings.v1', value)
      expect(loadSettings(storage).error).toBe(true)
    }
    for (const value of ['{', '{}', '[{"id":"x"}]']) {
      storage.setItem('nitian.fire.history.v1', value)
      expect(loadHistory(storage).error).toBe(true)
    }
  })
  it('只保留最近20局，重存同局不重複，完整決策與事件可讀回', () => {
    const storage = memoryStorage()
    for (let n = 1; n <= 23; n++) saveCompleted(record(String(n)), storage)
    expect(loadHistory(storage).value.map(item => item.id)).toEqual(Array.from({ length: 20 }, (_, index) => String(23 - index)))
    const revised = { ...record('23'), feedback: '接火後仍可啟用，理解了' }
    expect(saveCompleted(revised, storage).value).toHaveLength(20)
    expect(loadHistory(storage).value[0]).toEqual(revised)
  })
  it('未完局不能偽裝成完成紀錄，空局也不存', () => {
    const storage = memoryStorage()
    const unfinished = record('unfinished')
    unfinished.turns[0].after.result = null
    expect(saveCompleted(unfinished, storage).error).toBe(true)
    expect(saveCompleted({ ...record('empty'), turns: [] }, storage).error).toBe(true)
    expect(loadHistory(storage).value).toEqual([])
  })
  it('回饋僅更新指定局，找不到的局明確回報失敗', () => {
    const storage = memoryStorage()
    saveCompleted(record('one'), storage); saveCompleted(record('two'), storage)
    expect(saveFeedback('one', '想試A版', storage).error).toBe(false)
    expect(loadHistory(storage).value.find(item => item.id === 'one')?.feedback).toBe('想試A版')
    expect(loadHistory(storage).value.find(item => item.id === 'two')?.feedback).toBe('')
    expect(saveFeedback('missing', '無此局', storage).error).toBe(true)
    const broken = { getItem: () => { throw new Error('停用') }, setItem: () => {} }
    expect(saveFeedback('one', '失敗', broken).error).toBe(true)
    const cannotWrite = { getItem: storage.getItem, setItem: () => { throw new Error('寫入失敗') } }
    expect(saveFeedback('one', '失敗', cannotWrite).error).toBe(true)
  })
})
