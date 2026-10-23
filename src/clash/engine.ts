import { seedHash, shuffle } from '../game/rng'
import { CARD_NAMES, DIRECTIONS, SIDE_NAMES, VECTORS, createDeck, type Card, type Direction, type Side, type UnitKind } from './cards'
export type { Card, CardKind, Direction, Side, UnitKind } from './cards'

export interface Piece { id: string; side: Side; kind: UnitKind; pos: number; direction: Direction; hp: number }
export interface Control { pos: number; xiu: number; tian: number; owner: Side | null }
export type Action =
  | { type: 'play'; cardId: string; to?: number; pieceId?: string; direction: Direction }
  | { type: 'prepare'; cardId: string }
  | { type: 'pass' }
export type EventType = 'card' | 'deploy' | 'spring' | 'move' | 'attack' | 'damage' | 'death' | 'control' | 'score' | 'draw' | 'turn' | 'end' | 'prepare' | 'pass'
export interface ClashEvent {
  type: EventType; text: string; side?: Side; pieceId?: string; targetId?: string; from?: number; to?: number
  amount?: number; hpBefore?: number; hpAfter?: number; reason?: string
}
export interface Attack {
  attackerId: string; from: number; direction: Direction; path: number[]; targetId: string | null
  damage: number; springBonus: 0 | 1; reason: 'enemy' | 'friend' | 'altar' | 'spring' | 'edge' | 'range'
}
interface Board {
  pieces: Piece[]; springs: number[]; scores: Record<Side, number>; round: number; maxRounds: number
  initialFirst: Side; turn: Side; turnInRound: 0 | 1; scenario: 'full' | 'study'
  status: 'playing' | 'finished'; winner: Side | 'draw' | null
}
export interface Snapshot extends Board { control: Control[]; handCounts: Record<Side, number>; deckCounts: Record<Side, number> }
export interface TurnRecord { side: Side; round: number; action: Action; before: Snapshot; after: Snapshot; events: ClashEvent[]; attack: Attack | null }
export interface GameState extends Board {
  seed: string; hands: Record<Side, Card[]>; decks: Record<Side, Card[]>; discards: Record<Side, Card[]>
  turnsTaken: Record<Side, number>; history: TurnRecord[]
}
/** This is the only AI input: no seed, hidden hands, future decks, or history snapshots. */
export interface ClashView extends Snapshot { player: Side; hand: Card[]; discards: Record<Side, Card[]> }
export interface Preview {
  legal: boolean; state: GameState; events: ClashEvent[]; attack: Attack | null; controlBefore: Control[]; controlAfter: Control[]
}
export interface Effect { pieces: Piece[]; springs: number[]; events: ClashEvent[]; attack: Attack | null }
export const ALTARS = [4, 11] as const
export const SIDES: readonly Side[] = ['xiu', 'tian']
export const otherSide = (side: Side): Side => side === 'xiu' ? 'tian' : 'xiu'
export const posLabel = (pos: number): string => `${'ABCD'[pos % 4]}${Math.floor(pos / 4) + 1}`
export function roundOrder(round: number, initialFirst: Side): [Side, Side] {
  const first = round % 2 === 1 ? initialFirst : otherSide(initialFirst)
  return [first, otherSide(first)]
}
export function nextSide(state: Pick<GameState, 'round' | 'turnInRound' | 'initialFirst'>): Side {
  return state.turnInRound === 0 ? roundOrder(state.round, state.initialFirst)[1] : roundOrder(state.round + 1, state.initialFirst)[0]
}
const validPos = (pos: number | undefined): pos is number => Number.isInteger(pos) && pos! >= 0 && pos! < 16
const adjacent = (a: number, b: number): boolean => Math.abs(a % 4 - b % 4) + Math.abs(Math.floor(a / 4) - Math.floor(b / 4)) === 1
export function neighbors(pos: number): number[] { return Array.from({ length: 16 }, (_, i) => i).filter(i => adjacent(pos, i)) }
export function getControl(board: Pick<Board, 'pieces'>): Control[] {
  return ALTARS.map(pos => {
    const xiu = board.pieces.filter(p => p.side === 'xiu' && p.hp > 0 && adjacent(pos, p.pos)).length
    const tian = board.pieces.filter(p => p.side === 'tian' && p.hp > 0 && adjacent(pos, p.pos)).length
    return { pos, xiu, tian, owner: xiu === tian ? null : xiu > tian ? 'xiu' : 'tian' }
  })
}
export function createGame(options: { seed: string; scenario?: 'full' | 'study'; first?: Side }): GameState {
  const scenario = options.scenario ?? 'full'
  const initialFirst = scenario === 'study' ? 'xiu' : options.first ?? 'xiu'
  const hands = { xiu: [] as Card[], tian: [] as Card[] }
  const decks = { xiu: [] as Card[], tian: [] as Card[] }
  for (const side of SIDES) {
    let cards = createDeck(side)
    if (scenario === 'study') {
      hands[side] = ['spear', 'blade', 'spring', 'shift'].map(kind => cards.find(card => card.kind === kind)!)
      cards = cards.filter(card => !hands[side].some(c => c.id === card.id))
      decks[side] = shuffle(cards, seedHash(`${options.seed}:${side}`)).items
    } else {
      cards = shuffle(cards, seedHash(`${options.seed}:${side}`)).items
      hands[side] = cards.slice(0, 4)
      decks[side] = cards.slice(4)
    }
  }
  const unit = (id: string, side: Side, pos: number, direction: Direction, kind: UnitKind = 'spear'): Piece => ({ id, side, pos, direction, kind, hp: 3 })
  const pieces = scenario === 'study'
    ? [unit('start-xiu-a', 'xiu', 8, 'E'), unit('start-xiu-b', 'xiu', 9, 'E'), unit('start-tian-a', 'tian', 6, 'SW', 'blade'), unit('start-tian-b', 'tian', 10, 'W')]
    : [unit('start-xiu-a', 'xiu', 8, 'E'), unit('start-tian-a', 'tian', 7, 'W')]
  return {
    seed: options.seed, scenario, initialFirst, round: 1, maxRounds: scenario === 'study' ? 2 : 6,
    turn: initialFirst, turnInRound: 0, pieces, springs: [], hands, decks, discards: { xiu: [], tian: [] },
    scores: { xiu: 0, tian: 0 }, turnsTaken: { xiu: 0, tian: 0 }, status: 'playing', winner: null, history: [],
  }
}

function snapshot(state: GameState): Snapshot {
  return {
    pieces: state.pieces.map(p => ({ ...p })), springs: [...state.springs], scores: { ...state.scores },
    round: state.round, maxRounds: state.maxRounds, initialFirst: state.initialFirst, turn: state.turn,
    turnInRound: state.turnInRound, scenario: state.scenario, status: state.status, winner: state.winner,
    control: getControl(state), handCounts: { xiu: state.hands.xiu.length, tian: state.hands.tian.length },
    deckCounts: { xiu: state.decks.xiu.length, tian: state.decks.tian.length },
  }
}
export function getView(state: GameState, player: Side): ClashView {
  return {
    ...snapshot(state), player, hand: state.hands[player].map(c => ({ ...c })),
    discards: { xiu: state.discards.xiu.map(c => ({ ...c })), tian: state.discards.tian.map(c => ({ ...c })) },
  }
}

function empty(board: Pick<Board, 'pieces' | 'springs'>, pos: number): boolean {
  return validPos(pos) && !ALTARS.some(a => a === pos) && !board.springs.includes(pos) && !board.pieces.some(p => p.pos === pos)
}
function ownHand(state: GameState | ClashView): readonly Card[] {
  return 'hands' in state ? state.hands[state.turn] : state.player === state.turn ? state.hand : []
}
function legal(board: Board, hand: readonly Card[], action: Action): boolean {
  if (board.status !== 'playing') return false
  if (action.type === 'pass') return hand.length === 0
  const card = hand.find(c => c.id === action.cardId)
  if (!card) return false
  if (action.type === 'prepare') return true
  if (action.type !== 'play') return false
  if (card.kind === 'spear' || card.kind === 'blade') {
    return validPos(action.to) && empty(board, action.to) && DIRECTIONS[card.kind].includes(action.direction)
  }
  const piece = board.pieces.find(p => p.id === action.pieceId && p.side === board.turn)
  if (!piece || !DIRECTIONS[piece.kind].includes(action.direction) || !validPos(action.to)) return false
  if (card.kind === 'spring') return empty(board, action.to) && adjacent(action.to, piece.pos)
  return (action.to === piece.pos || adjacent(action.to, piece.pos)) && !ALTARS.some(a => a === action.to) && !board.springs.includes(action.to)
}

/** Enumerates rules from public board plus the acting player's own hand only. */
export function legalActions(state: GameState | ClashView): Action[] {
  if (state.status !== 'playing' || ('player' in state && state.player !== state.turn)) return []
  const hand = ownHand(state)
  if (hand.length === 0) return [{ type: 'pass' }]
  const actions: Action[] = []
  for (const card of hand) {
    if (card.kind === 'spear' || card.kind === 'blade') {
      for (let to = 0; to < 16; to++) if (empty(state, to)) {
        for (const direction of DIRECTIONS[card.kind]) actions.push({ type: 'play', cardId: card.id, to, direction })
      }
    } else {
      for (const piece of state.pieces.filter(p => p.side === state.turn)) {
        const destinations = card.kind === 'shift' ? [piece.pos, ...neighbors(piece.pos)] : neighbors(piece.pos)
        for (const to of destinations) for (const direction of DIRECTIONS[piece.kind]) {
          const action: Action = { type: 'play', cardId: card.id, pieceId: piece.id, to, direction }
          if (legal(state, hand, action)) actions.push(action)
        }
      }
    }
    actions.push({ type: 'prepare', cardId: card.id })
  }
  return actions
}

/** One attack, stopped by the first object; never starts any other unit. */
export function traceAttack(board: Pick<Board, 'pieces' | 'springs'>, attacker: Piece): Attack {
  const springBonus = board.springs.some(pos => adjacent(pos, attacker.pos)) ? 1 : 0
  const result: Attack = { attackerId: attacker.id, from: attacker.pos, direction: attacker.direction, path: [], targetId: null, damage: 2 + springBonus, springBonus, reason: 'range' }
  const [dx, dy] = VECTORS[attacker.direction]
  const range = attacker.kind === 'spear' ? 2 : 1
  for (let step = 1; step <= range; step++) {
    const x = attacker.pos % 4 + dx * step
    const y = Math.floor(attacker.pos / 4) + dy * step
    if (x < 0 || x > 3 || y < 0 || y > 3) { result.reason = 'edge'; break }
    const pos = y * 4 + x
    result.path.push(pos)
    if (ALTARS.some(a => a === pos)) { result.reason = 'altar'; break }
    if (board.springs.includes(pos)) { result.reason = 'spring'; break }
    const target = board.pieces.find(p => p.pos === pos)
    if (target) {
      result.reason = target.side === attacker.side ? 'friend' : 'enemy'
      if (target.side !== attacker.side) result.targetId = target.id
      break
    }
  }
  return result
}

function effect(board: Board, hand: readonly Card[], action: Action): Effect | null {
  if (!legal(board, hand, action)) return null
  const result: Effect = { pieces: board.pieces.map(p => ({ ...p })), springs: [...board.springs], events: [], attack: null }
  const side = board.turn
  const emit = (event: ClashEvent) => result.events.push(event)
  if (action.type === 'pass') { emit({ type: 'pass', side, text: `${SIDE_NAMES[side]}方無手牌，空過` }); return result }
  const card = hand.find(c => c.id === action.cardId)!
  emit({ type: 'card', side, text: `${SIDE_NAMES[side]}方消耗${CARD_NAMES[card.kind]}`, reason: card.id })
  if (action.type === 'prepare') { emit({ type: 'prepare', side, text: '整備：棄牌並結束本手' }); return result }
  let attacker: Piece
  if (card.kind === 'spear' || card.kind === 'blade') {
    attacker = { id: `piece:${card.id}`, side, kind: card.kind, pos: action.to!, direction: action.direction, hp: 3 }
    result.pieces.push(attacker)
    emit({ type: 'deploy', side, pieceId: attacker.id, to: attacker.pos, text: `${CARD_NAMES[card.kind]}部署${posLabel(attacker.pos)}` })
  } else {
    attacker = result.pieces.find(p => p.id === action.pieceId)!
    if (card.kind === 'spring') {
      result.springs.push(action.to!)
      emit({ type: 'spring', side, to: action.to, pieceId: attacker.id, text: `雷泉置於${posLabel(action.to!)}，立即啟動${posLabel(attacker.pos)}` })
    } else {
      const oldPos = attacker.pos
      const swapped = result.pieces.find(p => p.pos === action.to && p.id !== attacker.id)
      if (swapped) swapped.pos = oldPos
      attacker.pos = action.to!
      emit({ type: 'move', side, pieceId: attacker.id, from: oldPos, to: attacker.pos, targetId: swapped?.id, reason: swapped ? 'swap' : oldPos === attacker.pos ? 'stay' : 'move', text: `${posLabel(oldPos)}→${posLabel(attacker.pos)}${swapped ? '換位，僅選定棋子攻擊' : ''}` })
    }
    attacker.direction = action.direction
  }
  const attack = traceAttack(result, attacker)
  result.attack = attack
  emit({ type: 'attack', side, pieceId: attacker.id, targetId: attack.targetId ?? undefined, amount: attack.damage, reason: attack.reason, text: `基礎2${attack.springBonus ? '＋相鄰共享雷泉1（不疊加）' : ''}；${attack.targetId ? '命中敵人' : `未命中（${attack.reason}）`}` })
  const target = result.pieces.find(p => p.id === attack.targetId)
  if (target) {
    const hpBefore = target.hp
    target.hp = Math.max(0, target.hp - attack.damage)
    emit({ type: 'damage', side, pieceId: attacker.id, targetId: target.id, amount: attack.damage, hpBefore, hpAfter: target.hp, to: target.pos, text: `${posLabel(target.pos)}生命${hpBefore}→${target.hp}` })
    if (target.hp === 0) {
      result.pieces = result.pieces.filter(p => p.id !== target.id)
      emit({ type: 'death', side: target.side, pieceId: target.id, from: target.pos, text: `${posLabel(target.pos)}棋子死亡移除` })
    }
  }
  return result
}
/** Public-only effect evaluation used by AI; does not draw, inspect, or predict cards. */
export function previewView(view: ClashView, action: Action): Effect | null {
  if (view.player !== view.turn) return null
  return effect(view, view.hand, action)
}

function validState(state: GameState): boolean {
  const cards = SIDES.flatMap(side => [...state.hands[side], ...state.decks[side], ...state.discards[side]])
  if (cards.length !== 24 || new Set(cards.map(c => c.id)).size !== 24) return false
  for (const side of SIDES) {
    const actual = [...state.hands[side], ...state.decks[side], ...state.discards[side]]
    const expected = createDeck(side)
    if (actual.length !== 12 || actual.some(c => !expected.some(e => e.id === c.id && e.kind === c.kind))) return false
  }
  if (new Set(state.pieces.map(p => p.id)).size !== state.pieces.length || new Set(state.pieces.map(p => p.pos)).size !== state.pieces.length) return false
  if (new Set(state.springs).size !== state.springs.length) return false
  if (state.springs.some(pos => !validPos(pos) || ALTARS.some(a => a === pos))) return false
  return state.pieces.every(p => validPos(p.pos) && !ALTARS.some(a => a === p.pos) && !state.springs.includes(p.pos) && p.hp > 0 && p.hp <= 3 && SIDES.includes(p.side) && DIRECTIONS[p.kind]?.includes(p.direction))
}
export function previewAction(state: GameState, action: Action): Preview {
  const controlBefore = getControl(state)
  const invalid: Preview = { legal: false, state, events: [], attack: null, controlBefore, controlAfter: controlBefore }
  if (state.status !== 'playing' || !validState(state)) return invalid
  const result = effect(state, state.hands[state.turn], action)
  if (!result) return invalid
  const side = state.turn
  const cloneCards = (source: Record<Side, Card[]>): Record<Side, Card[]> => ({ xiu: source.xiu.map(c => ({ ...c })), tian: source.tian.map(c => ({ ...c })) })
  const next: GameState = {
    ...state, pieces: result.pieces, springs: result.springs, scores: { ...state.scores },
    hands: cloneCards(state.hands), decks: cloneCards(state.decks), discards: cloneCards(state.discards),
    turnsTaken: { ...state.turnsTaken, [side]: state.turnsTaken[side] + 1 }, history: [...state.history],
  }
  if (action.type !== 'pass') {
    const index = next.hands[side].findIndex(c => c.id === action.cardId)
    next.discards[side].push(...next.hands[side].splice(index, 1))
  }
  const controlAfter = getControl(next)
  const events = result.events
  events.push({ type: 'control', text: controlAfter.map(c => `${posLabel(c.pos)}修${c.xiu}:天${c.tian}（${c.owner ? SIDE_NAMES[c.owner] : '中立'}）`).join('；') })
  if (state.turnInRound === 1) {
    for (const altar of controlAfter) if (altar.owner) {
      next.scores[altar.owner]++
      events.push({ type: 'score', side: altar.owner, to: altar.pos, amount: 1, text: `第${state.round}輪末：${SIDE_NAMES[altar.owner]}方控制${posLabel(altar.pos)}，得1分` })
    }
    if (state.round === state.maxRounds) {
      next.status = 'finished'
      next.winner = next.scores.xiu === next.scores.tian ? 'draw' : next.scores.xiu > next.scores.tian ? 'xiu' : 'tian'
      events.push({ type: 'end', text: next.winner === 'draw' ? '累計同分，和局' : `${SIDE_NAMES[next.winner]}方累計分較高，獲勝` })
    } else { next.round++; next.turnInRound = 0 }
  } else next.turnInRound = 1
  if (next.status === 'playing') {
    next.turn = nextSide(state)
    if (next.turnsTaken[next.turn] > 0 && next.decks[next.turn].length > 0) {
      next.hands[next.turn].push(next.decks[next.turn].shift()!)
      events.push({ type: 'draw', side: next.turn, amount: 1, text: `${SIDE_NAMES[next.turn]}方手前抽1張` })
    }
    events.push({ type: 'turn', side: next.turn, text: `第${next.round}輪，${SIDE_NAMES[next.turn]}方出手` })
  }
  next.history.push({ side, round: state.round, action: { ...action }, before: snapshot(state), after: snapshot(next), events: events.map(e => ({ ...e })), attack: result.attack ? { ...result.attack, path: [...result.attack.path] } : null })
  return { legal: true, state: next, events, attack: result.attack, controlBefore, controlAfter }
}
export function applyAction(state: GameState, action: Action): GameState { return previewAction(state, action).state }
