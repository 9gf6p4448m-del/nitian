import type { Card, CombatEvent, Fighter, Side } from './game/types'
import type { DuelState } from './game/duel'

export interface DuelTurnRecord {
  round: number
  firstSide: Side
  hands: Record<Side, Card[]>
  timeline: DuelState['timeline']
  moves: DuelState['moves']
  events: CombatEvent[]
  decisionMs: number
  after: { player: Fighter; enemy: Fighter }
}
export interface DuelRecord {
  variant: 'alternating-v1'
  id: string
  seed: string
  initialFirstSide: Side
  completedAt: string
  outcome: 'won' | 'lost'
  hp: number
  turns: DuelTurnRecord[]
  feedback: string
}
export interface DuelPreferences {
  seed: string
  firstSide: Side
  reducedMotion: boolean
  speed: 1 | 2
}
interface Store { getItem(key: string): string | null; setItem(key: string, value: string): void }
const PREFS = 'nitian.duel.settings.v1'
const RECORDS = 'nitian.duel.records.v1'
export const DEFAULT_DUEL_PREFERENCES: DuelPreferences = { seed: 'SUMERU', firstSide: 'player', reducedMotion: false, speed: 1 }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const side = (value: unknown): value is Side => value === 'player' || value === 'enemy'
function preferences(value: unknown): value is DuelPreferences {
  return object(value) && typeof value.seed === 'string' && value.seed.length <= 80 && side(value.firstSide)
    && typeof value.reducedMotion === 'boolean' && (value.speed === 1 || value.speed === 2)
}
function record(value: unknown): value is DuelRecord {
  return object(value) && value.variant === 'alternating-v1' && typeof value.id === 'string'
    && typeof value.seed === 'string' && side(value.initialFirstSide) && typeof value.completedAt === 'string'
    && (value.outcome === 'won' || value.outcome === 'lost') && typeof value.hp === 'number' && Number.isFinite(value.hp)
    && typeof value.feedback === 'string' && Array.isArray(value.turns)
    && value.turns.every(turn => object(turn) && Number.isInteger(turn.round) && side(turn.firstSide)
      && Array.isArray(turn.timeline) && Array.isArray(turn.moves) && Array.isArray(turn.events))
}
function read<T>(key: string, fallback: T, valid: (value: unknown) => value is T, store?: Store): { value: T; ok: boolean } {
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
export const loadDuelPreferences = (store?: Store) => read(PREFS, DEFAULT_DUEL_PREFERENCES, preferences, store)
export const saveDuelPreferences = (value: DuelPreferences, store?: Store) => write(PREFS, value, store)
export const loadDuelRecords = (store?: Store) => read(RECORDS, [] as DuelRecord[], (value): value is DuelRecord[] => Array.isArray(value) && value.every(record), store)
export const saveDuelRecords = (value: DuelRecord[], store?: Store) => write(RECORDS, value.slice(0, 20), store)
