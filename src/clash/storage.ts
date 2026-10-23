import { type GameState, type Side } from './engine'
import { DIRECTIONS, VECTORS, createDeck } from './cards'

export const SETTINGS_KEY = 'nitian-clash-0.6-settings'
export const HISTORY_KEY = 'nitian-clash-0.6-history'
export interface ClashSettings { mode: 'ai' | 'hotseat'; humanSide: Side; first: Side; scenario: 'full' | 'study'; seed: string; reduced: boolean }
export const DEFAULT_SETTINGS: ClashSettings = { mode: 'ai', humanSide: 'xiu', first: 'xiu', scenario: 'full', seed: 'nitian-06', reduced: false }
export interface StorageResult<T> { ok: boolean; value: T; error?: string }
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface SavedGame {
  id: string; endedAt: string; seed: string; scenario: GameState['scenario']; winner: GameState['winner']
  scores: Record<Side, number>; feedback: string; state: GameState
}
const savedIds = new WeakMap<GameState, string>()
let sequence = 0
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const side = (value: unknown): value is Side => value === 'xiu' || value === 'tian'
const settingsValid = (value: unknown): value is ClashSettings => object(value) && (value.mode === 'ai' || value.mode === 'hotseat') && side(value.humanSide) && side(value.first) && (value.scenario === 'full' || value.scenario === 'study') && typeof value.seed === 'string' && typeof value.reduced === 'boolean'
const scoresValid = (value: unknown): value is Record<Side, number> => object(value) && ['xiu', 'tian'].every(key => typeof value[key] === 'number' && Number.isInteger(value[key]) && Number(value[key]) >= 0)
const integer = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
const position = (value: unknown): value is number => integer(value, 0, 15)
const direction = (value: unknown): boolean => typeof value === 'string' && Object.hasOwn(VECTORS, value)
const countsValid = (value: unknown): boolean => object(value) && integer(value.xiu, 0, 12) && integer(value.tian, 0, 12)
function boardValid(value: unknown): boolean {
  if (!object(value) || !scoresValid(value.scores) || !side(value.turn) || !side(value.initialFirst) || !integer(value.turnInRound, 0, 1)) return false
  const maxRounds = value.scenario === 'study' ? 2 : 6
  if ((value.scenario !== 'study' && value.scenario !== 'full') || value.maxRounds !== maxRounds || !integer(value.round, 1, maxRounds)) return false
  if ((value.status !== 'playing' && value.status !== 'finished') || (value.status === 'playing' ? value.winner !== null : !side(value.winner) && value.winner !== 'draw')) return false
  const springs = value.springs
  if (!Array.isArray(springs) || !springs.every(position) || new Set(springs).size !== springs.length || springs.some(pos => pos === 4 || pos === 11)) return false
  if (!Array.isArray(value.pieces) || !value.pieces.every(p => object(p) && typeof p.id === 'string' && side(p.side) && position(p.pos) && p.pos !== 4 && p.pos !== 11 && !springs.includes(p.pos) && integer(p.hp, 1, 3) && (p.kind === 'spear' || p.kind === 'blade') && DIRECTIONS[p.kind].some(dir => dir === p.direction))) return false
  return new Set(value.pieces.map(p => p.id)).size === value.pieces.length && new Set(value.pieces.map(p => p.pos)).size === value.pieces.length
}
function snapshotValid(value: unknown): boolean {
  if (!object(value) || !boardValid(value) || !countsValid(value.handCounts) || !countsValid(value.deckCounts) || !Array.isArray(value.control) || value.control.length !== 2) return false
  return value.control.every((c, i) => object(c) && c.pos === [4, 11][i] && integer(c.xiu, 0, 4) && integer(c.tian, 0, 4) && (c.owner === null || side(c.owner)))
}
function actionValid(value: unknown): boolean {
  if (!object(value)) return false
  if (value.type === 'pass') return true
  if (typeof value.cardId !== 'string') return false
  if (value.type === 'prepare') return true
  return value.type === 'play' && direction(value.direction) && (value.to === undefined || position(value.to)) && (value.pieceId === undefined || typeof value.pieceId === 'string')
}
function eventValid(value: unknown): boolean {
  const types = ['card', 'deploy', 'spring', 'move', 'attack', 'damage', 'death', 'control', 'score', 'draw', 'turn', 'end', 'prepare', 'pass']
  if (!object(value) || typeof value.type !== 'string' || !types.includes(value.type) || typeof value.text !== 'string') return false
  if (value.side !== undefined && !side(value.side)) return false
  if (['pieceId', 'targetId', 'reason'].some(key => value[key] !== undefined && typeof value[key] !== 'string')) return false
  if (['from', 'to'].some(key => value[key] !== undefined && !position(value[key]))) return false
  return ['amount', 'hpBefore', 'hpAfter'].every(key => value[key] === undefined || integer(value[key], 0, 3))
}
function attackValid(value: unknown): boolean {
  if (value === null) return true
  return object(value) && typeof value.attackerId === 'string' && position(value.from) && direction(value.direction) && Array.isArray(value.path) && value.path.every(position)
    && (value.targetId === null || typeof value.targetId === 'string') && integer(value.damage, 2, 3) && integer(value.springBonus, 0, 1)
    && typeof value.reason === 'string' && ['enemy', 'friend', 'altar', 'spring', 'edge', 'range'].includes(value.reason)
}
function gameValid(value: unknown): value is GameState {
  if (!object(value) || !boardValid(value) || value.status !== 'finished' || value.round !== value.maxRounds || typeof value.seed !== 'string' || !countsValid(value.turnsTaken)) return false
  if (!Array.isArray(value.history) || value.history.length !== Number(value.maxRounds) * 2 || !value.history.every(turn => object(turn) && side(turn.side) && integer(turn.round, 1, Number(value.maxRounds)) && actionValid(turn.action) && snapshotValid(turn.before) && snapshotValid(turn.after) && Array.isArray(turn.events) && turn.events.every(eventValid) && attackValid(turn.attack))) return false
  for (const owner of ['xiu', 'tian'] as const) {
    const cards: unknown[] = []
    for (const key of ['hands', 'decks', 'discards']) {
      const zone = value[key]
      if (!object(zone) || !Array.isArray(zone[owner])) return false
      cards.push(...zone[owner])
    }
    const expected = createDeck(owner)
    if (cards.length !== 12 || !cards.every(card => object(card) && expected.some(c => c.id === card.id && c.kind === card.kind)) || new Set(cards.map(card => (card as { id: string }).id)).size !== 12) return false
  }
  return true
}
function savedValid(value: unknown): value is SavedGame {
  if (!object(value) || typeof value.id !== 'string' || typeof value.endedAt !== 'string' || !Number.isFinite(Date.parse(value.endedAt)) || typeof value.seed !== 'string' || typeof value.feedback !== 'string' || !scoresValid(value.scores)) return false
  if ((value.scenario !== 'full' && value.scenario !== 'study') || (!side(value.winner) && value.winner !== 'draw')) return false
  const state = value.state
  return gameValid(state) && state.seed === value.seed && state.scenario === value.scenario && state.winner === value.winner && state.scores.xiu === value.scores.xiu && state.scores.tian === value.scores.tian
}
function failure<T>(value: T, operation: string, cause: unknown): StorageResult<T> {
  return { ok: false, value, error: `${operation}：${cause instanceof Error ? cause.message : String(cause)}` }
}
function storageOrDefault(storage?: StorageLike): StorageLike {
  // Access itself can throw in private/restricted browser contexts, so keep it inside callers' try blocks.
  return storage ?? globalThis.localStorage
}
export function loadSettings(storage?: StorageLike): StorageResult<ClashSettings> {
  try {
    const raw = storageOrDefault(storage).getItem(SETTINGS_KEY)
    if (raw === null) return { ok: true, value: { ...DEFAULT_SETTINGS } }
    const value: unknown = JSON.parse(raw)
    if (!settingsValid(value)) throw Error('設定格式損毀')
    return { ok: true, value }
  } catch (error) { return failure({ ...DEFAULT_SETTINGS }, '無法讀取奪勢設定', error) }
}
export function saveSettings(settings: ClashSettings, storage?: StorageLike): StorageResult<ClashSettings> {
  try {
    if (!settingsValid(settings)) throw Error('設定格式無效')
    storageOrDefault(storage).setItem(SETTINGS_KEY, JSON.stringify(settings))
    return { ok: true, value: { ...settings } }
  } catch (error) { return failure({ ...settings }, '無法儲存奪勢設定', error) }
}
export function loadHistory(storage?: StorageLike): StorageResult<SavedGame[]> {
  try {
    const raw = storageOrDefault(storage).getItem(HISTORY_KEY)
    if (raw === null) return { ok: true, value: [] }
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value) || !value.every(savedValid)) throw Error('對局記錄格式損毀')
    return { ok: true, value: value.slice(0, 20) }
  } catch (error) { return failure([], '無法讀取奪勢記錄', error) }
}
export function saveCompletedGame(state: GameState, feedback = '', storage?: StorageLike): StorageResult<SavedGame[]> {
  if (state.status !== 'finished') return failure([], '無法儲存奪勢記錄', Error('僅保存已結束對局'))
  const loaded = loadHistory(storage)
  if (!loaded.ok) return loaded
  try {
    const id = savedIds.get(state) ?? `${Date.now()}-${++sequence}`
    const existing = loaded.value.find(game => game.id === id)
    const game: SavedGame = {
      id, endedAt: existing?.endedAt ?? new Date().toISOString(), seed: state.seed, scenario: state.scenario,
      winner: state.winner, scores: { ...state.scores }, feedback, state,
    }
    if (!savedValid(game)) throw Error('終局記錄格式無效')
    const value = [game, ...loaded.value.filter(item => item.id !== id)].slice(0, 20)
    storageOrDefault(storage).setItem(HISTORY_KEY, JSON.stringify(value))
    savedIds.set(state, id)
    return { ok: true, value }
  } catch (error) { return failure(loaded.value, '無法儲存奪勢記錄', error) }
}
export function exportHistory(history: readonly SavedGame[]): string {
  return JSON.stringify({ version: 'clash-0.6', exportedAt: new Date().toISOString(), games: history }, null, 2)
}
