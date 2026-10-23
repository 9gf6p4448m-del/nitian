import { applyAction, controlled, legalActions, opponent, type Action, type MatchState, type Side } from './engine'

const distance = (a: number, b: number) => Math.abs(a % 4 - b % 4) + Math.abs(Math.floor(a / 4) - Math.floor(b / 4))

/** Only current own hand and public board/equipment enter planning. No future shuffle or hidden card can affect it. */
function publicPosition(source: MatchState, side: Side): MatchState {
  const state = structuredClone(source)
  state.rng = 1
  state.seed = ''
  state.players[opponent(side)].hand = []
  for (const owner of [side, opponent(side)]) {
    state.players[owner].deck = []
    state.players[owner].discard = []
  }
  return state
}

function evaluate(state: MatchState, side: Side): number {
  const enemySide = opponent(side), own = state.players[side], enemy = state.players[enemySide], shrines = controlled(state)
  if (state.status === 'finished') return state.winner === side ? 10000 : state.winner === 'draw' ? 0 : -10000
  let value = (shrines[side] - shrines[enemySide]) * 14 + (own.knockouts - enemy.knockouts) * 18 + (own.hp - enemy.hp) * 2.5
  value += own.weapon === 'unarmed' ? 0 : 1.5
  // Closing in matters when combat is useful, while nearby undefended shrines offer a second objective.
  const attack = legalActions({ ...state, turn: side, ap: 2, attacked: false }).some(action => action.type === 'attack')
  value += attack ? 2.8 : -Math.min(5, distance(own.pos, enemy.pos)) * 0.5
  const threatened = legalActions({ ...state, turn: enemySide, ap: 2, attacked: false }).some(action => action.type === 'attack')
  if (threatened) value -= own.hp <= 3 ? 3 : 0.8
  let nearest = 8
  state.board.forEach((tile, at) => {
    if (tile?.kind === 'shrine' && tile.owner !== side && distance(enemy.pos, at) > 1) nearest = Math.min(nearest, distance(own.pos, at))
  })
  value -= nearest * 1.1
  // Blood has value only until this turn ends; a nearby spring matters only when it creates an attack.
  if (attack) {
    value += own.blood * 1.2
    const spring = state.board.some((tile, at) => tile?.kind === 'spring' && distance(at, own.pos) === 1)
    if (spring) value += 1.2
  }
  return value
}

/** Deterministic, bounded two-action planning; this is a heuristic opponent, not an optimal solver. */
export function chooseAIAction(source: MatchState, side: Side = source.turn): Action | null {
  if (source.status !== 'playing' || source.turn !== side) return null
  const state = publicPosition(source, side), actions = legalActions(state)
  let best: Action | null = null, bestValue = -Infinity
  for (const action of actions) {
    const next = applyAction(state, action)
    const immediate = evaluate(next, side)
    let value = immediate
    if (next.status === 'playing' && next.turn === side) {
      let continuation = -Infinity
      for (const follow of legalActions(next)) continuation = Math.max(continuation, evaluate(applyAction(next, follow), side) - (follow.type === 'end' ? 0.03 : 0))
      value = immediate * 0.12 + continuation * 0.88
    }
    // Preserve deterministic stable ordering; spend an action only when it offers some board value.
    if (action.type === 'card') value -= 0.08
    if (action.type === 'end') value -= 0.03
    if (value > bestValue + 1e-9) { bestValue = value; best = action }
  }
  return best
}
