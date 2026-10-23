import { applyAction, legalActions, opponent, score } from './engine'
import type { Player, RealmAction, RealmState } from './engine'

function evaluate(state: RealmState, player: Player): number {
  const totals = score(state)
  const margin = totals[player] - totals[opponent(player)]
  if (state.status === 'finished' && state.winner !== 'draw') {
    return margin + (state.winner === player ? 10_000 : -10_000)
  }
  return margin
}

/**
 * Deterministic two-ply minimax over public legal actions, with alpha pruning.
 * No hidden information, random choice, time budget or third-ply simulation.
 * Stable enumeration order breaks ties. The upper bound is 16×8 + 16×16
 * candidates per ply; the real board/inventories make the set much smaller.
 */
export function chooseAction(state: RealmState): RealmAction | null {
  const player = state.turn
  let best: RealmAction | null = null
  let bestValue = -Infinity
  for (const action of legalActions(state)) {
    const next = applyAction(state, action)
    let value = evaluate(next, player)
    if (next.status === 'playing' && next.turn !== player) {
      const replies = legalActions(next)
      if (replies.length > 0) {
        value = Infinity
        for (const reply of replies) {
          value = Math.min(value, evaluate(applyAction(next, reply), player))
          // This branch cannot beat the current best, even before more replies.
          if (value <= bestValue) break
        }
      }
    }
    if (value > bestValue) { best = action; bestValue = value }
  }
  return best
}
