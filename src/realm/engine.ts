export type Player = 'asura' | 'deva'
export type Axis = 'h' | 'v'
export type Rank = 1 | 2
export type Cell =
  | { kind: 'shrine'; owner: Player; rank: Rank }
  | { kind: 'power'; strength: number; axis: Axis }
  | { kind: 'rubble' }
  | null
export type RealmAction =
  | { type: 'build'; at: number; rank: Rank }
  | { type: 'channel'; at: number; strength: number; axis: Axis }
  | { type: 'reverse'; sacrifice: number; power: number }
export interface RealmState {
  mode: 'full' | 'trial'
  board: Cell[]
  turn: Player
  first: Player
  remaining: Record<Player, number>
  inventory: Record<Player, { small: number; big: number; powers: number[] }>
  ply: number
  status: 'playing' | 'finished'
  winner: Player | 'draw' | null
}
export interface Supply {
  source: number
  strength: number
  multiplier: Rank
  value: number
  axis: Axis
}

export const opponent = (player: Player): Player => player === 'asura' ? 'deva' : 'asura'
const inBounds = (at: number) => Number.isInteger(at) && at >= 0 && at < 16
const sameRow = (a: number, b: number) => Math.floor(a / 4) === Math.floor(b / 4)
const sameColumn = (a: number, b: number) => a % 4 === b % 4
const aligned = (a: number, b: number) => sameRow(a, b) || sameColumn(a, b)

/** Columns A–D, rows 1–4; the board array is row-major. */
export function coord(index: number): string {
  if (!inBounds(index)) throw new Error('棋格超出神域')
  return `${'ABCD'[index % 4]}${Math.floor(index / 4) + 1}`
}

export function createRealm(mode: 'full' | 'trial', first: Player = 'asura'): RealmState {
  if (mode !== 'full' && mode !== 'trial') throw new Error('未知神域模式')
  if (first !== 'asura' && first !== 'deva') throw new Error('未知先手')
  const board: Cell[] = Array(16).fill(null)
  const shrine = (at: number, owner: Player, rank: Rank) => { board[at] = { kind: 'shrine', owner, rank } }
  const power = (at: number, strength: number, axis: Axis) => { board[at] = { kind: 'power', strength, axis } }
  if (mode === 'full') {
    shrine(12, 'asura', 1); shrine(3, 'deva', 1)
    power(13, 2, 'h'); power(2, 2, 'h')
  } else {
    shrine(1, 'asura', 2); shrine(4, 'asura', 1); shrine(14, 'asura', 1)
    shrine(7, 'deva', 2); shrine(11, 'deva', 1)
    power(5, 3, 'h'); power(10, 2, 'v')
  }
  const inventory = () => mode === 'full'
    ? { small: 3, big: 2, powers: [1, 2, 3] }
    : { small: 1, big: 1, powers: [3] }
  const steps = mode === 'full' ? 6 : 2
  return {
    mode, board, turn: first, first, remaining: { asura: steps, deva: steps },
    inventory: { asura: inventory(), deva: inventory() }, ply: 0,
    status: 'playing', winner: null,
  }
}

/** Direct sources only: intervening cells do not block or retransmit supply. */
export function supplyBreakdown(state: RealmState, shrineIndex: number): Supply[] {
  if (!inBounds(shrineIndex)) return []
  const shrine = state.board[shrineIndex]
  if (shrine?.kind !== 'shrine') return []
  const supplies: Supply[] = []
  state.board.forEach((cell, source) => {
    if (cell?.kind !== 'power') return
    if (cell.axis === 'h' ? sameRow(source, shrineIndex) : sameColumn(source, shrineIndex)) {
      supplies.push({ source, strength: cell.strength, multiplier: shrine.rank, value: cell.strength * shrine.rank, axis: cell.axis })
    }
  })
  return supplies
}

/** Scores are recomputed from the current board, never accumulated by turn. */
export function score(state: RealmState): Record<Player, number> {
  const totals = { asura: 0, deva: 0 }
  state.board.forEach((cell, at) => {
    if (cell?.kind === 'shrine') {
      for (const supply of supplyBreakdown(state, at)) totals[cell.owner] += supply.value
    }
  })
  return totals
}

function isLegal(state: RealmState, action: RealmAction): boolean {
  if (state.status !== 'playing' || state.remaining[state.turn] <= 0 || !action || typeof action !== 'object') return false
  const inventory = state.inventory[state.turn]
  switch (action.type) {
    case 'build':
      return inBounds(action.at) && state.board[action.at] === null
        && (action.rank === 1 ? inventory.small > 0 : action.rank === 2 && inventory.big > 0)
    case 'channel':
      return inBounds(action.at) && state.board[action.at] === null
        && (action.axis === 'h' || action.axis === 'v') && inventory.powers.includes(action.strength)
    case 'reverse': {
      if (!inBounds(action.sacrifice) || !inBounds(action.power)) return false
      const shrine = state.board[action.sacrifice]
      return shrine?.kind === 'shrine' && shrine.owner === state.turn
        && state.board[action.power]?.kind === 'power' && aligned(action.sacrifice, action.power)
    }
    default: return false
  }
}

/** Enumeration and application use exactly the same legality predicate. */
export function legalActions(state: RealmState): RealmAction[] {
  if (state.status !== 'playing' || state.remaining[state.turn] <= 0) return []
  const actions: RealmAction[] = []
  const append = (action: RealmAction) => { if (isLegal(state, action)) actions.push(action) }
  for (let at = 0; at < 16; at++) {
    if (state.board[at] === null) {
      append({ type: 'build', at, rank: 1 }); append({ type: 'build', at, rank: 2 })
      for (const strength of new Set(state.inventory[state.turn].powers)) {
        append({ type: 'channel', at, strength, axis: 'h' })
        append({ type: 'channel', at, strength, axis: 'v' })
      }
    } else if (state.board[at]?.kind === 'shrine') {
      for (let power = 0; power < 16; power++) append({ type: 'reverse', sacrifice: at, power })
    }
  }
  return actions
}

/** Used by both previews and committed moves. No objects from the input are mutated. */
export function applyAction(state: RealmState, action: RealmAction): RealmState {
  if (!isLegal(state, action)) throw new Error('這個行動不合法')
  const next: RealmState = {
    ...state,
    board: state.board.map(cell => cell === null ? null : { ...cell }),
    remaining: { ...state.remaining },
    inventory: {
      asura: { ...state.inventory.asura, powers: [...state.inventory.asura.powers] },
      deva: { ...state.inventory.deva, powers: [...state.inventory.deva.powers] },
    },
    ply: state.ply + 1,
  }
  const inventory = next.inventory[state.turn]
  if (action.type === 'build') {
    next.board[action.at] = { kind: 'shrine', owner: state.turn, rank: action.rank }
    if (action.rank === 1) inventory.small--
    else inventory.big--
  } else if (action.type === 'channel') {
    next.board[action.at] = { kind: 'power', strength: action.strength, axis: action.axis }
    inventory.powers.splice(inventory.powers.indexOf(action.strength), 1)
  } else {
    const source = next.board[action.power] as Extract<Cell, { kind: 'power' }>
    next.board[action.sacrifice] = { kind: 'rubble' }
    source.axis = source.axis === 'h' ? 'v' : 'h'
  }
  next.remaining[state.turn]--
  if (next.remaining.asura === 0 && next.remaining.deva === 0) {
    next.status = 'finished'
    const totals = score(next)
    next.winner = totals.asura === totals.deva ? 'draw' : totals.asura > totals.deva ? 'asura' : 'deva'
  } else {
    const other = opponent(state.turn)
    next.turn = next.remaining[other] > 0 ? other : state.turn
  }
  return next
}
