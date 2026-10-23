export type CardId = 'strike' | 'guard' | 'draw_thunder' | 'return' | 'steal_armor' | 'thorns' | 'evade' | 'channel'
export type Mode = 'standard' | 'classic' | 'paper'
export type Side = 'player' | 'enemy'
export interface Card { instanceId: string; cardId: CardId }
export interface Fighter {
  hp: number; maxHp: number; shield: number; thunder: number; evade: boolean; thorns: boolean
}
export interface CombatState {
  player: Fighter; enemy: Fighter; round: number; seed: string; rng: number
  hand: Card[]; drawPile: Card[]; discardPile: Card[]
  status: 'planning' | 'won' | 'lost'; mode: Mode; tutorial: boolean
}
export interface PlannedCard { instanceId: string; slot: number }
export interface Intent { kind: 'charge' | 'lightning' | 'shield' | 'attack'; value: number; label: string; description: string }
export interface Resources { player: Fighter; enemy: Fighter }
export interface CombatEvent {
  index: number; mainIndex: number; actor: Side | 'system'; target: Side | 'both'
  effect: 'attack' | 'shield' | 'thunder' | 'transfer' | 'evade' | 'thorns' | 'reflect' | 'defeat' | 'discard'
  label: string; amount: number; reason: string; before: Resources; after: Resources
}
export interface Resolution { nextState: CombatState; events: CombatEvent[] }
export interface TurnRecord {
  round: number; hand: Card[]; plan: PlannedCard[]; events: CombatEvent[]
  decisionMs: number; withdrawals: number
}
export interface RunRecord {
  id: string; seed: string; mode: Mode; tutorial: boolean; completedAt: string
  outcome: 'won' | 'lost'; hp: number; turns: TurnRecord[]; feedback: string
}
