import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, loadRecords, saveRecords } from './storage'
import type { RunRecord } from './game/types'

function memory() {
  const data = new Map<string, string>()
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) } }
}
describe('本機設定與紀錄', () => {
  it('空資料使用預設，設定可往返', () => {
    const m = memory()
    expect(loadSettings(m)).toEqual({ value: DEFAULT_SETTINGS, ok: true })
    const settings = { ...DEFAULT_SETTINGS, seed: '手機', tutorial: false, sound: true, speed: 2 as const, mode: 'paper' as const }
    expect(saveSettings(settings, m)).toBe(true)
    expect(loadSettings(m).value).toEqual(settings)
  })
  it('損壞或形狀錯誤的資料安全降級', () => {
    const m = memory()
    m.setItem('nitian.settings.v1', '{')
    expect(loadSettings(m)).toEqual({ value: DEFAULT_SETTINGS, ok: false })
    m.setItem('nitian.settings.v1', JSON.stringify({ mode: 'bad', seed: {}, sound: 'true' }))
    expect(loadSettings(m).ok).toBe(false)
    m.setItem('nitian.records.v1', JSON.stringify([{ outcome: {}, hp: 'oops' }]))
    expect(loadRecords(m)).toEqual({ value: [], ok: false })
    m.setItem('nitian.records.v1', '{}')
    expect(loadRecords(m).ok).toBe(false)
  })
  it('拒絕儲存時回報失敗，不拋出或阻止遊戲', () => {
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('quota') } }
    expect(loadSettings(broken).ok).toBe(false)
    expect(loadRecords(broken).ok).toBe(false)
    expect(saveSettings(DEFAULT_SETTINGS, broken)).toBe(false)
    expect(saveRecords([], broken)).toBe(false)
  })
  it('紀錄往返且最多保留20局', () => {
    const m = memory()
    const records = Array.from({ length: 22 }, (_, i): RunRecord => ({
      id: `r${i}`, seed: 'test', mode: 'paper', tutorial: false, completedAt: '2026-10-23T00:00:00Z',
      outcome: 'won', hp: 43, turns: [], feedback: '再試一次',
    }))
    expect(saveRecords(records, m)).toBe(true)
    expect(loadRecords(m).value).toEqual(records.slice(0, 20))
    expect(loadRecords(memory())).toEqual({ value: [], ok: true })
  })
})
