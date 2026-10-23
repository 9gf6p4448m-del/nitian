import type { MatchState, Side } from './engine'

export interface Settings {
  opponent: 'ai' | 'local'
  player: Side
  first: Side
  scenario: 'full' | 'lesson'
  seed: string
  reduced: boolean
}
export const DEFAULT_SETTINGS: Settings = {
  opponent: 'ai', player: 'asura', first: 'asura', scenario: 'full', seed: 'nitian-05', reduced: false,
}
const SETTINGS_KEY = 'nitian-tactics-settings-v1'
const HISTORY_KEY = 'nitian-tactics-history-v1'
export interface RecordEntry {
  id: string
  at: string
  settings: Settings
  state: MatchState
  feedback: string
}
export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null') as Partial<Settings> | null
    if (!saved) return { ...DEFAULT_SETTINGS }
    return {
      opponent: saved.opponent === 'local' ? 'local' : 'ai',
      player: saved.player === 'deva' ? 'deva' : 'asura',
      first: saved.first === 'deva' ? 'deva' : 'asura',
      scenario: saved.scenario === 'lesson' ? 'lesson' : 'full',
      seed: typeof saved.seed === 'string' && saved.seed.trim() ? saved.seed.slice(0, 80) : DEFAULT_SETTINGS.seed,
      reduced: saved.reduced === true,
    }
  } catch { return { ...DEFAULT_SETTINGS } }
}
export function saveSettings(settings: Settings): boolean {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true } catch { return false }
}
export function loadHistory(): RecordEntry[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    return Array.isArray(list) ? list.filter((r): r is RecordEntry => !!r && typeof r === 'object' && typeof r.id === 'string' && typeof r.at === 'string' && typeof r.feedback === 'string' && r.state?.status === 'finished' && Array.isArray(r.state?.log)).slice(0, 20) : []
  } catch { return [] }
}
export function saveRecord(state: MatchState, settings: Settings, feedback = ''): boolean {
  if (state.status !== 'finished') return false
  try {
    const id = `${state.seed}:${state.first}:${state.scenario}:${state.log.map(e => e.text).join('|')}`
    const previous = loadHistory()
    const existing = previous.find(r => r.id === id)
    const record: RecordEntry = { id, at: existing?.at || new Date().toISOString(), settings: { ...settings }, state, feedback: feedback || existing?.feedback || '' }
    localStorage.setItem(HISTORY_KEY, JSON.stringify([record, ...previous.filter(r => r.id !== id)].slice(0, 20)))
    return true
  } catch { return false }
}
export function exportMatch(state: MatchState, settings: Settings, feedback: string): string {
  return JSON.stringify({ game: '逆天・神壇交鋒', version: '0.5', exportedAt: new Date().toISOString(), settings, feedback, state, history: loadHistory() }, null, 2)
}
