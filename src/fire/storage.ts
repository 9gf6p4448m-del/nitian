import type { Action, FireEvent, FireState, Side, Variant } from './engine'

export interface FireSettings { variant: Variant; opponent: 'ai' | 'local'; humanSide: Side }
export interface FireTurn {
  index: number; actor: 'human' | 'ai' | 'system'; side: Side; action: Action
  before: FireState; after: FireState; events: FireEvent[]; decisionMs: number
}
export interface FireRecord {
  id: string; startedAt: string; completedAt: string; settings: FireSettings
  turns: FireTurn[]; outcome: NonNullable<FireState['result']>; feedback: string
}
export interface FireStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const SETTINGS_KEY = 'nitian.fire.settings.v1'
const HISTORY_KEY = 'nitian.fire.history.v1'
export const defaultSettings: FireSettings = { variant: 'B', opponent: 'ai', humanSide: 'asura' }
function browserStorage(): FireStorage {
  if (typeof localStorage === 'undefined') throw new Error('無法使用本機儲存')
  return localStorage
}
function validSettings(value: unknown): value is FireSettings {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<FireSettings>
  return (item.variant === 'A' || item.variant === 'B') && (item.opponent === 'ai' || item.opponent === 'local') && (item.humanSide === 'asura' || item.humanSide === 'deva')
}
function validRecord(value: unknown): value is FireRecord {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<FireRecord>
  return typeof item.id === 'string' && typeof item.startedAt === 'string' && typeof item.completedAt === 'string' && validSettings(item.settings) && Array.isArray(item.turns) && typeof item.feedback === 'string' && !!item.outcome && (item.outcome.winner === null || item.outcome.winner === 'asura' || item.outcome.winner === 'deva') && ['offering', 'elimination', 'repetition'].includes(item.outcome.reason)
}
export function loadSettings(storage?: FireStorage): { value: FireSettings; error: boolean } {
  try {
    const raw = (storage ?? browserStorage()).getItem(SETTINGS_KEY)
    if (raw === null) return { value: { ...defaultSettings }, error: false }
    const value: unknown = JSON.parse(raw)
    if (!validSettings(value)) throw new Error('設定格式不正確')
    return { value, error: false }
  } catch { return { value: { ...defaultSettings }, error: true } }
}
export function saveSettings(settings: FireSettings, storage?: FireStorage): boolean {
  try { (storage ?? browserStorage()).setItem(SETTINGS_KEY, JSON.stringify(settings)); return true } catch { return false }
}
export function loadHistory(storage?: FireStorage): { value: FireRecord[]; error: boolean } {
  try {
    const raw = (storage ?? browserStorage()).getItem(HISTORY_KEY)
    if (raw === null) return { value: [], error: false }
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value) || !value.every(validRecord)) throw new Error('紀錄格式不正確')
    return { value: value.slice(0, 20), error: false }
  } catch { return { value: [], error: true } }
}
export function saveCompleted(record: FireRecord, storage?: FireStorage): { value: FireRecord[]; error: boolean } {
  const previous = loadHistory(storage)
  if (!validRecord(record) || record.turns.length === 0 || !record.turns.at(-1)?.after.result) return { value: previous.value, error: true }
  const value = [record, ...previous.value.filter(item => item.id !== record.id)].slice(0, 20)
  try { (storage ?? browserStorage()).setItem(HISTORY_KEY, JSON.stringify(value)); return { value, error: previous.error } } catch { return { value, error: true } }
}
export function saveFeedback(id: string, feedback: string, storage?: FireStorage): { value: FireRecord[]; error: boolean } {
  const previous = loadHistory(storage)
  if (previous.error || !previous.value.some(item => item.id === id)) return { value: previous.value, error: true }
  const value = previous.value.map(item => item.id === id ? { ...item, feedback } : item)
  try { (storage ?? browserStorage()).setItem(HISTORY_KEY, JSON.stringify(value)); return { value, error: false } } catch { return { value, error: true } }
}
