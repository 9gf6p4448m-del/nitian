import type { RealmAction, RealmState, Player } from './engine'

export interface RealmSettings { mode: 'full' | 'trial'; opponent: 'ai' | 'local'; humanSide: Player; first: Player }
export interface RealmTurn { side: Player; action: RealmAction; before: RealmState; after: RealmState; decisionMs: number }
export interface RealmRecord { schema: 'nitian.realm.v1'; id: string; startedAt: string; completedAt: string | null; settings: RealmSettings; turns: RealmTurn[]; outcome: { winner: Player | 'draw'; scores: Record<Player, number> } | null; feedback: string }
export interface Store { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const defaults: RealmSettings = { mode: 'full', opponent: 'ai', humanSide: 'asura', first: 'asura' }
const key = 'nitian.realm.history.v1'
export function readHistory(store?: Store): { records: RealmRecord[]; error: boolean } {
  try {
    const raw = (store ?? localStorage).getItem(key)
    if (!raw) return { records: [], error: false }
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data) || !data.every(r => r && r.schema === 'nitian.realm.v1' && typeof r.id === 'string' && typeof r.startedAt === 'string' && typeof r.completedAt === 'string' && typeof r.feedback === 'string' && Array.isArray(r.turns) && r.outcome && ['asura', 'deva', 'draw'].includes(r.outcome.winner) && typeof r.outcome.scores?.asura === 'number' && typeof r.outcome.scores?.deva === 'number')) throw Error('紀錄格式錯誤')
    return { records: data.slice(0, 20), error: false }
  } catch { return { records: [], error: true } }
}
export function writeRecord(record: RealmRecord, store?: Store): { records: RealmRecord[]; error: boolean } {
  const previous = readHistory(store)
  if (!record.outcome || !record.completedAt || !record.turns.length) return { records: previous.records, error: true }
  const records = [record, ...previous.records.filter(r => r.id !== record.id)].slice(0, 20)
  try { (store ?? localStorage).setItem(key, JSON.stringify(records)); return { records, error: previous.error } }
  catch { return { records, error: true } }
}
