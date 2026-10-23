import type { Mode, RunRecord } from './game/types'

export interface Settings {
  seed: string; mode: Mode; tutorial: boolean; sound: boolean; reducedMotion: boolean; speed: 1 | 2
}
export const DEFAULT_SETTINGS: Settings = { seed: 'SUMERU', mode: 'standard', tutorial: true, sound: false, reducedMotion: false, speed: 1 }
interface Store { getItem(key: string): string | null; setItem(key: string, value: string): void }
interface Loaded<T> { value: T; ok: boolean }
const SETTINGS = 'nitian.settings.v1'
const RECORDS = 'nitian.records.v1'

function read<T>(key: string, fallback: T, valid: (x: unknown) => x is T, store?: Store): Loaded<T> {
  try {
    const raw = (store ?? window.localStorage).getItem(key)
    if (raw === null) return { value: fallback, ok: true }
    const value: unknown = JSON.parse(raw)
    return valid(value) ? { value, ok: true } : { value: fallback, ok: false }
  } catch { return { value: fallback, ok: false } }
}
function write(key: string, value: unknown, store?: Store): boolean {
  try { (store ?? window.localStorage).setItem(key, JSON.stringify(value)); return true }
  catch { return false }
}
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const mode = (x: unknown): x is Mode => x === 'standard' || x === 'classic' || x === 'paper'
function settings(x: unknown): x is Settings {
  return object(x) && typeof x.seed === 'string' && x.seed.length <= 80 && mode(x.mode)
    && typeof x.tutorial === 'boolean' && typeof x.sound === 'boolean' && typeof x.reducedMotion === 'boolean'
    && (x.speed === 1 || x.speed === 2)
}
function record(x: unknown): x is RunRecord {
  return object(x) && typeof x.id === 'string' && typeof x.seed === 'string' && mode(x.mode)
    && typeof x.tutorial === 'boolean' && typeof x.completedAt === 'string'
    && Number.isFinite(x.hp) && (x.outcome === 'won' || x.outcome === 'lost')
    && Array.isArray(x.turns) && typeof x.feedback === 'string'
}
export const loadSettings = (store?: Store) => read(SETTINGS, DEFAULT_SETTINGS, settings, store)
export const saveSettings = (value: Settings, store?: Store) => write(SETTINGS, value, store)
export const loadRecords = (store?: Store) => read(RECORDS, [] as RunRecord[], (x): x is RunRecord[] => Array.isArray(x) && x.every(record), store)
export const saveRecords = (value: RunRecord[], store?: Store) => write(RECORDS, value.slice(0, 20), store)
