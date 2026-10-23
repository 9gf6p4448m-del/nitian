import { describe, expect, it } from 'vitest'
import { chooseAIAction } from './ai'
import { applyAction, createMatch, legalActions, opponent, type MatchState } from './engine'

function play(seed: string): MatchState {
  let state = createMatch({ seed })
  for (let step = 0; state.status === 'playing' && step < 64; step++) {
    const action = chooseAIAction(state)
    expect(action).not.toBeNull(); expect(legalActions(state)).toContainEqual(action)
    const next = applyAction(state, action!)
    expect(next).not.toBe(state)
    for (const side of ['asura', 'deva'] as const) {
      const player = next.players[side], cards = [...player.hand, ...player.deck, ...player.discard]
      expect(cards).toHaveLength(12); expect(new Set(cards.map(card => card.instanceId)).size).toBe(12)
      expect(player.hand.length).toBeLessThanOrEqual(6)
      expect(next.board[player.pos]?.kind).not.toBe('spring')
    }
    expect(next.players.asura.pos).not.toBe(next.players.deva.pos)
    state = next
  }
  expect(state.status).toBe('finished'); expect(state.turnNumber).toBe(16)
  return state
}
describe('public-information bounded AI', () => {
  it.each(['asura', 'deva'] as const)('%s is unchanged by hidden opponent hand, both future decks, seed, or RNG', side => {
    for (const scenario of ['full', 'lesson'] as const) {
      const state = createMatch({ seed: 'hidden', scenario, first: side }), masked = structuredClone(state)
      masked.players[opponent(side)].hand = [{ id: 'blood', instanceId: 'hidden-fake' }]
      masked.players.asura.deck.reverse(); masked.players.deva.deck.reverse()
      masked.rng = 987654321; masked.seed = 'unrelated secret'
      expect(chooseAIAction(masked)).toEqual(chooseAIAction(state))
    }
  })
  it('uses public attacks and shrine claims', () => {
    const state = createMatch({ seed: 'attack', scenario: 'lesson' })
    // Isolate combat: no neutral shrine can be claimed instead of attacking.
    for (const tile of state.board) if (tile?.kind === 'shrine') tile.owner = 'asura'
    expect(chooseAIAction(state)?.type).toBe('attack')
    state.board[0] = { kind: 'shrine', owner: null }
    state.players.asura.pos = 4; state.players.deva.pos = 15; state.players.asura.hand = []
    expect(chooseAIAction(state)).toEqual({ type: 'claim', at: 0 })
  })
  it('uses equipment when it enables an attack and pursues reachable objectives', () => {
    const state = createMatch({ seed: 'equip' })
    for (const tile of state.board) if (tile?.kind === 'shrine') tile.owner = 'asura'
    const player = state.players.asura, cards = [...player.hand, ...player.deck]
    player.pos = 5; state.players.deva.pos = 10
    player.hand = [cards.find(card => card.id === 'blade')!]
    expect(chooseAIAction(state)).toEqual({ type: 'card', instanceId: player.hand[0].instanceId })
    state.board[0] = { kind: 'shrine', owner: null }
    player.hand = []; player.pos = 9; state.players.deva.pos = 2
    expect(chooseAIAction(state)?.type).toBe('move')
  })
  it('returns null for the wrong side or a completed game', () => {
    const state = createMatch({ seed: 'null' }); expect(chooseAIAction(state, 'deva')).toBeNull()
    state.status = 'finished'; expect(chooseAIAction(state)).toBeNull()
  })
  it.each(['one', 'two', 'three'])('completes a legal automatic game for seed %s', seed => { play(seed) })
  it('reproduces every decision and final log for the same seed', () => { expect(play('repeat')).toEqual(play('repeat')) })
})
