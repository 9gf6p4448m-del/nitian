import { getControl, legalActions, otherSide, previewView, traceAttack, type Action, type ClashView } from './engine'

/** Heuristic for this move and public threats only; never searches hypothetical opponent cards. */
export function chooseAction(view: ClashView): Action | null {
  if (view.status !== 'playing' || view.turn !== view.player) return null
  const actions = legalActions(view)
  let best: Action | null = null
  let bestScore = -Infinity
  for (const action of actions) {
    const result = previewView(view, action)
    if (!result) continue
    const side = view.player
    const opponent = otherSide(side)
    let score = 0
    for (const piece of result.pieces) score += (piece.side === side ? 1 : -1) * (5 + piece.hp)
    for (const altar of getControl(result)) {
      if (altar.owner === side) score += view.turnInRound === 1 ? 14 : 10
      if (altar.owner === opponent) score -= view.turnInRound === 1 ? 14 : 10
      score += Math.max(-2, Math.min(2, altar[side] - altar[opponent]))
    }
    // Visible unit directions estimate exposure. This does not assume the opponent owns a reactivation card.
    for (const piece of result.pieces) {
      const threat = traceAttack(result, piece)
      if (threat.targetId) {
        const target = result.pieces.find(p => p.id === threat.targetId)!
        score += (piece.side === side ? 1 : -1) * (target.hp <= threat.damage ? 2 : 0.5)
      }
    }
    if (action.type === 'prepare') score -= 0.25
    if (score > bestScore) { bestScore = score; best = action }
  }
  return best
}
