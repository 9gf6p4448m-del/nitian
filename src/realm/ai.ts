import { applyAction, domainCount, legalActions, opponent, outcome, score } from './engine'
import type { Player, RealmAction, RealmState } from './engine'

type Evaluation = readonly [result: number, domains: number, power: number]

function compare(a: Evaluation, b: Evaluation): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

function evaluate(state: RealmState, player: Player): Evaluation {
  const totals = score(state)
  const other = opponent(player)
  const margin = totals[player] - totals[other]
  let result = 0
  if (state.status === 'finished') {
    const winner = outcome(state).winner
    result = winner === 'draw' ? 0 : winner === player ? 1 : -1
  }
  const count = state.victory === 'domains' ? domainCount(state) : null
  // Lexicographic values keep domain control primary without a magic score cap.
  return [result, count ? count[player] - count[other] : 0, margin]
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
  let bestValue: Evaluation | null = null
  for (const action of legalActions(state)) {
    const next = applyAction(state, action)
    let value = evaluate(next, player)
    if (next.status === 'playing' && next.turn !== player) {
      const replies = legalActions(next)
      if (replies.length > 0) {
        let worstReply: Evaluation | null = null
        for (const reply of replies) {
          const replyValue = evaluate(applyAction(next, reply), player)
          if (worstReply === null || compare(replyValue, worstReply) < 0) worstReply = replyValue
          // This branch cannot beat the current best, even before more replies.
          if (bestValue !== null && compare(worstReply, bestValue) <= 0) break
        }
        value = worstReply!
      }
    }
    if (bestValue === null || compare(value, bestValue) > 0) { best = action; bestValue = value }
  }
  return best
}
