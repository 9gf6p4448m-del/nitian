import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyAction, createMatch } from './engine'
import { DEFAULT_SETTINGS, exportMatch, loadHistory, loadSettings, saveRecord, saveSettings } from './storage'

const values = new Map<string, string>()
const storage = {
  getItem: vi.fn((key: string) => values.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
}
function finished(seed = 'storage') {
  let state = createMatch({ seed })
  while (state.status === 'playing') state = applyAction(state, { type: 'end' })
  return state
}
beforeEach(() => { values.clear(); storage.getItem.mockClear(); storage.setItem.mockClear(); vi.stubGlobal('localStorage', storage) })
afterEach(() => vi.unstubAllGlobals())

describe('tactics storage failure boundaries', () => {
  it('falls back for corrupt settings and rejects malformed history entries', () => {
    values.set('nitian-tactics-settings-v1', '{broken')
    values.set('nitian-tactics-history-v1', JSON.stringify([null, 2, {}, { id: 'bad', at: 'now', feedback: '', state: { status: 'playing', log: [] } }]))
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    expect(loadHistory()).toEqual([])
    values.set('nitian-tactics-history-v1', '{broken')
    expect(loadHistory()).toEqual([])
  })
  it('validates settings and caps the seed length', () => {
    values.set('nitian-tactics-settings-v1', JSON.stringify({ opponent: 'bad', player: 'bad', first: 'deva', seed: 'a'.repeat(100), reduced: 'true' }))
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, first: 'deva', seed: 'a'.repeat(80) })
    expect(saveSettings({ ...DEFAULT_SETTINGS, opponent: 'local' })).toBe(true)
    expect(loadSettings().opponent).toBe('local')
  })
  it('survives denied reads and writes without blocking engine play or JSON export', () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') } })
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    expect(loadHistory()).toEqual([])
    expect(saveSettings(DEFAULT_SETTINGS)).toBe(false)
    const state = finished()
    expect(saveRecord(state, DEFAULT_SETTINGS)).toBe(false)
    expect(JSON.parse(exportMatch(state, DEFAULT_SETTINGS, '仍可匯出')).feedback).toBe('仍可匯出')
  })
  it('keeps twenty completed records, deduplicates and preserves feedback', () => {
    expect(saveRecord(createMatch({ seed: 'unfinished' }), DEFAULT_SETTINGS)).toBe(false)
    for (let i = 0; i < 22; i++) expect(saveRecord(finished(`history-${i}`), DEFAULT_SETTINGS)).toBe(true)
    expect(loadHistory()).toHaveLength(20)
    expect(loadHistory().at(-1)?.state.seed).toBe('history-2')
    const state = finished('history-21')
    expect(saveRecord(state, DEFAULT_SETTINGS, '保留感受')).toBe(true)
    const at = loadHistory()[0].at
    expect(saveRecord(state, DEFAULT_SETTINGS)).toBe(true)
    expect(loadHistory()).toHaveLength(20)
    expect(loadHistory()[0]).toMatchObject({ at, feedback: '保留感受' })
  })
  it('exports parseable complete state, settings, feedback and completed history', () => {
    const state = finished()
    saveRecord(state, DEFAULT_SETTINGS, '走位')
    const data = JSON.parse(exportMatch(state, DEFAULT_SETTINGS, '雷泉共用'))
    expect(data).toMatchObject({ game: '逆天・神壇交鋒', version: '0.5', settings: DEFAULT_SETTINGS, feedback: '雷泉共用', state })
    expect(data.history).toHaveLength(1)
    expect(new Date(data.exportedAt).getTime()).not.toBeNaN()
  })
})
