import { applyAction, currentSide, goalCell, legalActions } from './engine'
import type { Action, FireState, Side } from './engine'

const distance = (a: number, b: number) => Math.abs(a % 5 - b % 5) + Math.abs(Math.floor(a / 5) - Math.floor(b / 5))
const WIN = 1_000_000
const ROOT_WIDTH = 12

function evaluate(state: FireState, side: Side): number {
  if (state.result) return state.result.winner === null ? 0 : state.result.winner === side ? WIN : -WIN
  const living = state.units.filter(u => u.hp > 0)
  const carrier = living.find(u => u.id === state.fire.holder)
  const fireCell = carrier?.cell ?? state.fire.cell!
  let score = 0
  for (const unit of living) {
    const sign = unit.side === side ? 1 : -1
    score += sign * (unit.hp * 200 + 450)
    if (unit.id === state.fire.holder) {
      const goalDistance = distance(unit.cell, goalCell(state.variant, unit.side))
      score += sign * (180 + (8 - goalDistance) * 75 + (unit.used ? 0 : 40))
      if (goalDistance === 0) score += sign * 450
      for (const enemy of living.filter(u => u.side !== unit.side)) {
        if (distance(enemy.cell, unit.cell) === 1) score -= sign * (enemy.used ? 30 : 110)
      }
    } else {
      // Position the free piece to recover loose fire, pressure a carrier, or support a pass.
      score += sign * (8 - distance(unit.cell, fireCell)) * (carrier?.side === unit.side ? 7 : 18)
    }
  }
  // At the leaf, a legal offering is a concrete threat on the very next activation.
  if (carrier && !carrier.used && carrier.side === currentSide(state) && carrier.cell === goalCell(state.variant, carrier.side)) {
    score += carrier.side === side ? 50_000 : -50_000
  }
  return score
}

function preference(action: Action): number {
  if (action.type === 'wait') return -14
  if (action.type === 'strike') return 4
  if (action.type === 'pickup') return 3
  return 0
}

/** Bounded two-ply search. Both players use only the public rules API and public state. */
export function chooseAction(state: FireState): Action {
  const actions = legalActions(state)
  if (!actions.length) throw new Error('對局已結束，AI 無合法行動。')
  const offering = actions.find(a => a.type === 'offer')
  if (offering) return offering
  if (actions.length === 1) return actions[0]
  const side = currentSide(state)
  const candidates = actions.map(action => {
    const next = applyAction(state, action).state
    return { action, next, immediate: evaluate(next, side) + preference(action) }
  }).sort((a, b) => b.immediate - a.immediate)
  const win = candidates.find(candidate => candidate.next.result?.winner === side)
  if (win) return win.action

  // Never prune an escape from an immediately visible offering in favour of a tempting loss.
  const safe = candidates.filter(candidate => !legalActions(candidate.next).some(a => a.type === 'offer'))
  const shortlist = (safe.length ? safe : candidates).slice(0, ROOT_WIDTH)
  let best = shortlist[0]
  let bestScore = -Infinity
  for (const candidate of shortlist) {
    const replies = legalActions(candidate.next)
    let worst = candidate.immediate
    if (replies.length) {
      worst = Infinity
      for (const reply of replies) {
        const afterReply = applyAction(candidate.next, reply).state
        worst = Math.min(worst, evaluate(afterReply, side))
        if (worst <= bestScore - preference(candidate.action)) break
      }
      worst += preference(candidate.action)
    }
    if (worst > bestScore) { bestScore = worst; best = candidate }
  }
  return best.action
}
