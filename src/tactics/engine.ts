import { CARDS, CARD_IDS, type Card } from './cards'
export { CARDS, CARD_IDS } from './cards'
export type { Card, CardId } from './cards'

export type Side = 'asura' | 'deva'
export type Weapon = 'unarmed' | 'spear' | 'blade'
export type Tile = null | { kind: 'shrine'; owner: Side | null } | { kind: 'spring' } | { kind: 'fog' }
export type Player = {
  pos: number; hp: number; weapon: Weapon; hand: Card[]; deck: Card[]; discard: Card[]
  knockouts: number; stunned: boolean; blood: number
}
export type BattleEvent = { id: number; side: Side; round: number; type: string; text: string; from?: number; to?: number; damage?: number }
export type MatchState = {
  seed: string; rng: number; board: Tile[]; players: Record<Side, Player>; turn: Side; first: Side
  scenario: 'full' | 'lesson'; round: number; turnNumber: number; maxTurns: number; ap: number
  attacked: boolean; serial: number; status: 'playing' | 'finished'; winner: Side | 'draw' | null
  reason: string; log: BattleEvent[]
}
export type Action = { type: 'move'; to: number } | { type: 'attack'; to: number } | { type: 'claim'; at: number }
  | { type: 'card'; instanceId: string; to?: number } | { type: 'end' }
export const SIDES: readonly Side[] = ['asura', 'deva']
export const MAX_HP = 6
export const SPAWNS: Record<Side, number> = { asura: 13, deva: 2 }
const NAMES: Record<Side, string> = { asura: '阿修羅', deva: '天眾' }
export const opponent = (side: Side): Side => side === 'asura' ? 'deva' : 'asura'
export const coord = (at: number): string => `${'ABCD'[at % 4]}${Math.floor(at / 4) + 1}`
const valid = (at: number): boolean => Number.isInteger(at) && at >= 0 && at < 16
const distance = (a: number, b: number): number => Math.abs(a % 4 - b % 4) + Math.abs(Math.floor(a / 4) - Math.floor(b / 4))
const neighbors = (at: number): number[] => [at - 4, at - 1, at + 1, at + 4].filter(to => valid(to) && distance(at, to) === 1)
const canStand = (state: MatchState, side: Side, at: number): boolean => valid(at) && state.board[at]?.kind !== 'spring' && state.players[opponent(side)].pos !== at

function random(state: MatchState): number {
  let n = state.rng
  n ^= n << 13; n ^= n >>> 17; n ^= n << 5
  state.rng = n >>> 0
  return state.rng / 4294967296
}
function shuffle(state: MatchState, cards: Card[]): Card[] {
  const result = [...cards]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
function draw(state: MatchState, side: Side): void {
  const player = state.players[side]
  if (player.hand.length >= 6) return
  if (!player.deck.length) {
    player.deck = shuffle(state, player.discard)
    player.discard = []
  }
  const card = player.deck.shift()
  if (card) player.hand.push(card)
}
function event(state: MatchState, type: string, text: string, extra: Partial<BattleEvent> = {}): void {
  state.log.push({ id: ++state.serial, side: state.turn, round: state.round, type, text, ...extra })
}
export function createMatch({ seed, first = 'asura', scenario = 'full' }: { seed: string; first?: Side; scenario?: 'full' | 'lesson' }): MatchState {
  let rng = 2166136261
  for (const char of seed) rng = Math.imul(rng ^ char.charCodeAt(0), 16777619) >>> 0
  const makePlayer = (side: Side): Player => ({ pos: SPAWNS[side], hp: MAX_HP, weapon: 'unarmed', hand: [], deck: [], discard: [], knockouts: 0, stunned: false, blood: 0 })
  const board: Tile[] = Array.from({ length: 16 }, () => null)
  for (const at of [0, 3, 12, 15]) board[at] = { kind: 'shrine', owner: at === 12 ? 'asura' : at === 3 ? 'deva' : null }
  const state: MatchState = { seed, rng: rng || 1, board, players: { asura: makePlayer('asura'), deva: makePlayer('deva') }, turn: first, first, scenario, round: 1, turnNumber: 1, maxTurns: 16, ap: 2, attacked: false, serial: 0, status: 'playing', winner: null, reason: '', log: [] }
  for (const side of SIDES) {
    state.players[side].deck = shuffle(state, CARD_IDS.flatMap(id => [0, 1].map(copy => ({ id, instanceId: `${side}-${id}-${copy}` }))))
    for (let i = 0; i < 4; i++) draw(state, side)
  }
  if (scenario === 'lesson') {
    state.players.asura.pos = 10; state.players.asura.weapon = 'spear'
    state.players.deva.pos = 11; state.players.deva.weapon = 'blade'
    state.board[9] = { kind: 'spring' }; state.board[5] = { kind: 'fog' }
    const player = state.players.asura
    const pile = [...player.hand, ...player.deck]
    player.hand = (['dash', 'fog', 'blade', 'blood'] as const).map(id => pile.splice(pile.findIndex(card => card.id === id), 1)[0])
    player.deck = pile
  }
  event(state, 'start', `${NAMES[first]}先手；${scenario === 'lesson' ? '參考練習盤' : '完整對局'}開始。`)
  return state
}
export function damageBreakdown(state: MatchState, side: Side): { base: number; spring: number; blood: number; total: number } {
  const player = state.players[side]
  const base = player.weapon === 'blade' ? 3 : 2
  const spring = neighbors(player.pos).some(at => state.board[at]?.kind === 'spring') ? 1 : 0
  const blood = player.blood
  return { base, spring, blood, total: base + spring + blood }
}
export function controlled(state: MatchState): Record<Side, number> {
  const counts = { asura: 0, deva: 0 }
  for (const tile of state.board) if (tile?.kind === 'shrine' && tile.owner) counts[tile.owner]++
  return counts
}
function canAttack(state: MatchState, side: Side): boolean {
  const from = state.players[side].pos, to = state.players[opponent(side)].pos
  const dx = Math.abs(from % 4 - to % 4), dy = Math.abs(Math.floor(from / 4) - Math.floor(to / 4))
  const weapon = state.players[side].weapon
  if (weapon === 'blade') return dx === 1 && dy === 1
  if (distance(from, to) === 1) return true
  if (weapon !== 'spear' || distance(from, to) !== 2 || (dx !== 0 && dy !== 0)) return false
  const middle = (from + to) / 2
  return state.board[middle]?.kind !== 'spring' && state.board[middle]?.kind !== 'fog' && state.board[to]?.kind !== 'fog'
}
function dashTargets(state: MatchState, side: Side): number[] {
  const origin = state.players[side].pos, reached = new Set<number>([origin])
  let edge = [origin]
  for (let depth = 0; depth < 2; depth++) {
    const next: number[] = []
    for (const from of edge) for (const to of neighbors(from)) if (!reached.has(to) && canStand(state, side, to)) { reached.add(to); next.push(to) }
    edge = next
  }
  reached.delete(origin)
  return [...reached].sort((a, b) => a - b)
}
export function legalActions(state: MatchState): Action[] {
  if (state.status !== 'playing' || state.ap <= 0) return []
  const side = state.turn, player = state.players[side], enemy = state.players[opponent(side)]
  const actions: Action[] = neighbors(player.pos).filter(to => canStand(state, side, to)).map(to => ({ type: 'move', to }))
  if (!state.attacked && canAttack(state, side)) actions.push({ type: 'attack', to: enemy.pos })
  state.board.forEach((tile, at) => {
    if (tile?.kind === 'shrine' && tile.owner !== side && distance(player.pos, at) <= 1 && distance(enemy.pos, at) > 1) actions.push({ type: 'claim', at })
  })
  for (const card of player.hand) {
    const add = (to?: number) => actions.push({ type: 'card', instanceId: card.instanceId, ...(to === undefined ? {} : { to }) })
    if (card.id === 'spear' || card.id === 'blade') { if (player.weapon !== card.id) add() }
    else if (card.id === 'dash') dashTargets(state, side).forEach(add)
    else if (card.id === 'blood') {
      if (!player.blood && !state.attacked) state.board.forEach((tile, at) => { if (tile?.kind === 'shrine' && tile.owner === side) add(at) })
    } else state.board.forEach((tile, at) => { if (!tile && at !== player.pos && at !== enemy.pos) add(at) })
  }
  actions.push({ type: 'end' })
  return actions
}
function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'end' && b.type === 'end') return true
  if (a.type === 'claim' && b.type === 'claim') return a.at === b.at
  if (a.type === 'card' && b.type === 'card') return a.instanceId === b.instanceId && a.to === b.to
  return 'to' in a && 'to' in b && a.to === b.to
}
function endTurn(state: MatchState): void {
  state.players[state.turn].blood = 0
  if (state.turnNumber >= state.maxTurns) {
    const counts = controlled(state)
    const difference = counts.asura - counts.deva || state.players.asura.knockouts - state.players.deva.knockouts
    state.winner = difference > 0 ? 'asura' : difference < 0 ? 'deva' : 'draw'
    state.status = 'finished'; state.ap = 0
    state.reason = counts.asura !== counts.deva ? '祭壇控制數' : state.players.asura.knockouts !== state.players.deva.knockouts ? '擊倒次數' : '祭壇與擊倒數相同'
    event(state, 'finish', `對局結束：${state.winner === 'draw' ? '平手' : `${NAMES[state.winner]}獲勝`}（${state.reason}）。`)
    return
  }
  state.turn = opponent(state.turn); state.turnNumber++; state.round = Math.ceil(state.turnNumber / 2)
  const player = state.players[state.turn]
  state.ap = player.stunned ? 1 : 2; player.stunned = false; state.attacked = false
  if (state.turnNumber > 2) draw(state, state.turn)
  event(state, 'turn', `${NAMES[state.turn]}第${state.round}回合，${state.ap}行動。`)
}
/** Illegal actions return the original object; valid actions never mutate the source state or RNG. */
export function applyAction(source: MatchState, action: Action): MatchState {
  if (!legalActions(source).some(candidate => sameAction(candidate, action))) return source
  const state = structuredClone(source), side = state.turn, player = state.players[side], enemy = state.players[opponent(side)]
  if (action.type === 'end') { event(state, 'end', `${NAMES[side]}提早結束回合。`); endTurn(state); return state }
  state.ap--
  if (action.type === 'move') {
    const from = player.pos; player.pos = action.to
    event(state, 'move', `${NAMES[side]}由${coord(from)}移動至${coord(action.to)}。`, { from, to: action.to })
  } else if (action.type === 'claim') {
    state.board[action.at] = { kind: 'shrine', owner: side }
    event(state, 'claim', `${NAMES[side]}占領${coord(action.at)}界壇。`, { to: action.at })
  } else if (action.type === 'attack') {
    const damage = damageBreakdown(state, side).total
    state.attacked = true; enemy.hp -= damage; player.blood = 0
    event(state, 'attack', `${NAMES[side]}攻擊${coord(action.to)}，造成${damage}傷害。`, { from: player.pos, to: action.to, damage })
    if (enemy.hp <= 0) {
      const victim = opponent(side), spawn = SPAWNS[victim]
      player.knockouts++; enemy.hp = MAX_HP; enemy.stunned = true; enemy.blood = 0
      enemy.pos = Array.from({ length: 16 }, (_, at) => at).filter(at => canStand(state, victim, at)).sort((a, b) => distance(a, spawn) - distance(b, spawn) || a - b)[0]
      event(state, 'knockout', `${NAMES[victim]}被擊倒，於${coord(enemy.pos)}重生；下回合只有一行動。`, { to: enemy.pos })
    }
  } else {
    const index = player.hand.findIndex(card => card.instanceId === action.instanceId), card = player.hand.splice(index, 1)[0]
    player.discard.push(card)
    const from = player.pos
    if (card.id === 'spear' || card.id === 'blade') player.weapon = card.id
    else if (card.id === 'dash') player.pos = action.to!
    else if (card.id === 'blood') { state.board[action.to!] = { kind: 'shrine', owner: null }; player.blood = 2 }
    else state.board[action.to!] = { kind: card.id }
    event(state, `card:${card.id}`, `${NAMES[side]}使用${CARDS[card.id].name}${action.to === undefined ? '' : `（${coord(action.to)}）`}。`, { from, ...(action.to === undefined ? {} : { to: action.to }) })
  }
  if (state.ap === 0) endTurn(state)
  return state
}
