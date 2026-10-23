import { describe, expect, it } from 'vitest'
import { applyAction, createGame, type GameState } from './engine'
import { DEFAULT_SETTINGS, HISTORY_KEY, SETTINGS_KEY, exportHistory, loadHistory, loadSettings, saveCompletedGame, saveSettings, type StorageLike } from './storage'

const memory = (): StorageLike => {
  const data = new Map<string, string>()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) } }
}
function finished(seed: string): GameState {
  let state = createGame({ seed, scenario: 'study' })
  for (let i = 0; i < 4; i++) state = applyAction(state, { type: 'prepare', cardId: state.hands[state.turn][0].id })
  return state
}

describe('奪勢獨立記錄與錯誤', () => {
  it('獨立鍵、設定來回與空值預設', () => {
    const store = memory()
    expect(HISTORY_KEY).toContain('clash')
    expect(SETTINGS_KEY).toContain('clash')
    expect(loadHistory(store)).toEqual({ ok: true, value: [] })
    expect(loadSettings(store).value).toEqual(DEFAULT_SETTINGS)
    const settings = { ...DEFAULT_SETTINGS, mode: 'hotseat' as const, humanSide: 'tian' as const, first: 'tian' as const, scenario: 'study' as const, seed: 'own-seed', reduced: true }
    expect(saveSettings(settings, store)).toEqual({ ok: true, value: settings })
    expect(loadSettings(store)).toEqual({ ok: true, value: settings })
  })
  it('只存終局、保留最近20局與逐手事件、seed、回饋及JSON', () => {
    const store = memory()
    expect(saveCompletedGame(createGame({ seed: 'live' }), '', store).ok).toBe(false)
    for (let n = 0; n < 23; n++) expect(saveCompletedGame(finished(`s${n}`), `想法${n}`, store).ok).toBe(true)
    const result = loadHistory(store)
    expect(result.value).toHaveLength(20)
    expect(result.value[0]).toMatchObject({ seed: 's22', feedback: '想法22' })
    expect(result.value[19].seed).toBe('s3')
    expect(result.value[0].state.history).toHaveLength(4)
    expect(result.value[0].state.history[0].events.length).toBeGreaterThan(0)
    const exported = JSON.parse(exportHistory(result.value))
    expect(exported.version).toBe('clash-0.6')
    expect(exported.games).toEqual(result.value)
  })
  it('同一局重按儲存更新回饋、不複製紀錄；儲存不污染遊戲物件', () => {
    const store = memory()
    const state = finished('same')
    const original = JSON.stringify(state)
    saveCompletedGame(state, '第一次', store)
    const result = saveCompletedGame(state, '更新', store)
    expect(result.value).toHaveLength(1)
    expect(result.value[0].feedback).toBe('更新')
    expect(JSON.stringify(state)).toBe(original)
  })
  it('不吞損毀JSON/schema、讀取失敗與寫入失敗，回傳可顯示錯誤', () => {
    const store = memory()
    store.setItem(SETTINGS_KEY, '{bad')
    expect(loadSettings(store)).toMatchObject({ ok: false, value: DEFAULT_SETTINGS, error: expect.any(String) })
    store.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, first: 'unknown' }))
    expect(loadSettings(store).ok).toBe(false)
    store.setItem(HISTORY_KEY, '{}')
    expect(loadHistory(store)).toMatchObject({ ok: false, value: [] })
    store.setItem(HISTORY_KEY, JSON.stringify([{ state: {} }]))
    expect(loadHistory(store).ok).toBe(false)
    const failure: StorageLike = { getItem() { throw Error('blocked') }, setItem() { throw Error('quota') } }
    expect(loadHistory(failure).error).toContain('blocked')
    expect(saveSettings(DEFAULT_SETTINGS, failure).error).toContain('quota')
    expect(saveCompletedGame(finished('blocked'), '', failure).error).toContain('blocked')
    const writeOnlyFailure: StorageLike = { getItem: () => null, setItem() { throw Error('quota') } }
    expect(saveCompletedGame(finished('quota'), '', writeOnlyFailure).error).toContain('quota')
    expect(saveSettings({ ...DEFAULT_SETTINGS, mode: 'bad' } as never, store).ok).toBe(false)
  })
  it.each([
    ['棋子null', (state: GameState) => { state.pieces = [null as never] }],
    ['泉格錯型別', (state: GameState) => { state.springs = ['bad' as never] }],
    ['事件null', (state: GameState) => { state.history[0].events = [null as never] }],
    ['事件缺少文字', (state: GameState) => { state.history[0].events = [{ type: 'turn' } as never] }],
    ['動作空物件', (state: GameState) => { state.history[0].action = {} as never }],
    ['手前快照空物件', (state: GameState) => { state.history[0].before = {} as never }],
    ['手後快照空物件', (state: GameState) => { state.history[0].after = {} as never }],
    ['手牌null', (state: GameState) => { state.hands.xiu = [null as never] }],
    ['牌庫錯牌型', (state: GameState) => { state.decks.xiu[0].kind = 'bad' as never }],
    ['重複實體牌', (state: GameState) => { state.decks.xiu[0] = state.hands.xiu[0] }],
    ['缺少輪次', (state: GameState) => { delete (state as Partial<GameState>).round }],
    ['攻擊空物件', (state: GameState) => { state.history[0].attack = {} as never }],
    ['缺少出手計數', (state: GameState) => { delete (state as Partial<GameState>).turnsTaken }],
  ])('損毀深層資料「%s」回報錯誤並且不覆寫原記錄', (_label, corrupt) => {
    const store = memory()
    const saved = saveCompletedGame(finished('corrupt'), '', store).value
    corrupt(saved[0].state)
    const raw = JSON.stringify(saved)
    store.setItem(HISTORY_KEY, raw)
    expect(loadHistory(store)).toMatchObject({ ok: false, value: [], error: expect.any(String) })
    expect(saveCompletedGame(finished('other'), '', store).ok).toBe(false)
    expect(store.getItem(HISTORY_KEY)).toBe(raw)
  })
})
