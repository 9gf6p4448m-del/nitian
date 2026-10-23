import { describe, expect, it } from 'vitest'
import { applyAction, controlled, createMatch, damageBreakdown, legalActions, opponent, type Action, type CardId, type MatchState, type Side } from './engine'

const make = () => createMatch({ seed: 'test' })
const has = (state: MatchState, action: Action) => legalActions(state).some(candidate => JSON.stringify(candidate) === JSON.stringify(action))
function place(state: MatchState, own: number, enemy: number, weapon: 'unarmed' | 'spear' | 'blade' = 'unarmed') {
  state.players.asura.pos = own; state.players.deva.pos = enemy; state.players.asura.weapon = weapon
  return state
}
function give(state: MatchState, id: CardId, side: Side = state.turn) {
  const player = state.players[side], cards = [...player.hand, ...player.deck, ...player.discard]
  const card = cards.find(item => item.id === id)!
  player.hand = player.hand.filter(item => item.instanceId !== card.instanceId)
  player.deck = player.deck.filter(item => item.instanceId !== card.instanceId)
  player.discard = player.discard.filter(item => item.instanceId !== card.instanceId)
  player.hand.push(card)
  return card.instanceId
}
const end = (state: MatchState) => applyAction(state, { type: 'end' })

describe('weapon geometry and shared damage', () => {
  it.each([
    ['unarmed', 5, 6, true], ['unarmed', 5, 7, false], ['unarmed', 5, 10, false],
    ['spear', 5, 7, true], ['spear', 5, 13, true], ['spear', 5, 10, false], ['spear', 3, 4, false],
    ['blade', 5, 10, true], ['blade', 5, 6, false], ['blade', 3, 4, false],
  ] as const)('%s from %i to %i legal=%s', (weapon, own, enemy, allowed) => {
    expect(has(place(make(), own, enemy, weapon), { type: 'attack', to: enemy })).toBe(allowed)
  })
  it('blocks spear rays with spring or fog, but shrines do not block', () => {
    const state = place(make(), 5, 7, 'spear')
    for (const kind of ['spring', 'fog'] as const) { state.board[6] = { kind }; expect(has(state, { type: 'attack', to: 7 })).toBe(false) }
    state.board[6] = { kind: 'shrine', owner: null }; expect(has(state, { type: 'attack', to: 7 })).toBe(true)
    state.board[7] = { kind: 'fog' }; expect(has(state, { type: 'attack', to: 7 })).toBe(false)
    state.players.asura.pos = 6; expect(has(state, { type: 'attack', to: 7 })).toBe(true)
  })
  it('does not stack springs and reports base, spring, blood', () => {
    const state = place(make(), 5, 6, 'spear'); state.board[1] = { kind: 'spring' }; state.board[9] = { kind: 'spring' }; state.players.asura.blood = 2
    expect(damageBreakdown(state, 'asura')).toEqual({ base: 2, spring: 1, blood: 2, total: 5 })
    expect(applyAction(state, { type: 'attack', to: 6 }).players.deva.hp).toBe(1)
  })
  it('matches the reference lesson without duplicating cards', () => {
    const state = createMatch({ seed: 'lesson', scenario: 'lesson' })
    expect(state.players.asura.hand.map(card => card.id)).toEqual(['dash', 'fog', 'blade', 'blood'])
    expect(has(state, { type: 'attack', to: 11 })).toBe(true)
    expect(damageBreakdown(state, 'asura').total).toBe(3)
    state.turn = 'deva'; expect(legalActions(state).some(action => action.type === 'attack')).toBe(false)
    state.players.deva.pos = 7; expect(has(state, { type: 'attack', to: 10 })).toBe(true)
    expect(new Set([...state.players.asura.hand, ...state.players.asura.deck].map(card => card.instanceId)).size).toBe(12)
  })
})
describe('movement, cards, and action budget', () => {
  it('walks on shrine and fog, never wraps or crosses a spring/enemy', () => {
    const state = place(make(), 4, 8); state.board[5] = { kind: 'spring' }; state.board[0] = { kind: 'fog' }
    expect(legalActions(state).filter(action => action.type === 'move')).toEqual([{ type: 'move', to: 0 }])
    state.board[0] = { kind: 'shrine', owner: null }; expect(has(state, { type: 'move', to: 0 })).toBe(true)
    expect(applyAction(state, { type: 'move', to: -1 })).toBe(state)
  })
  it('dash turns but cannot jump over blockers', () => {
    const state = place(make(), 0, 4), id = give(state, 'dash'); state.board[1] = { kind: 'spring' }
    expect(legalActions(state).filter(action => action.type === 'card' && action.instanceId === id)).toEqual([])
    state.board[1] = null
    expect(has(state, { type: 'card', instanceId: id, to: 5 })).toBe(true)
    expect(has(state, { type: 'card', instanceId: id, to: 2 })).toBe(true)
    expect(has(state, { type: 'card', instanceId: id, to: 4 })).toBe(false)
    expect(has(state, { type: 'card', instanceId: id, to: 6 })).toBe(false)
  })
  it('allows at most one attack per turn and automatically advances at zero AP', () => {
    let state = place(make(), 5, 6)
    state = applyAction(state, { type: 'attack', to: 6 })
    expect(state.ap).toBe(1); expect(legalActions(state).some(action => action.type === 'attack')).toBe(false)
    state = applyAction(state, { type: 'move', to: 1 })
    expect(state.turn).toBe('deva'); expect(state.ap).toBe(2); expect(state.turnNumber).toBe(2)
  })
  it.each(['spring', 'fog'] as const)('places %s only on completely empty squares and never repeats current equipment', terrain => {
    const state = make(), id = give(state, terrain)
    expect(has(state, { type: 'card', instanceId: id, to: 12 })).toBe(false)
    expect(has(state, { type: 'card', instanceId: id, to: 13 })).toBe(false)
    expect(has(state, { type: 'card', instanceId: id, to: 6 })).toBe(true)
    const next = applyAction(state, { type: 'card', instanceId: id, to: 6 })
    expect(next.board[6]).toEqual({ kind: terrain }); expect(next.players.asura.discard.some(card => card.instanceId === id)).toBe(true)
    const spear = give(state, 'spear'); state.players.asura.weapon = 'spear'
    expect(has(state, { type: 'card', instanceId: spear })).toBe(false)
  })
  it('replaces weapons rather than combining geometry', () => {
    let state = place(make(), 5, 6, 'spear'); const id = give(state, 'blade')
    state = applyAction(state, { type: 'card', instanceId: id })
    expect(state.players.asura.weapon).toBe('blade'); expect(has(state, { type: 'attack', to: 6 })).toBe(false)
  })
})
describe('shrines, blood, and knockouts', () => {
  it('requires proximity and prohibits guarded or already owned shrines', () => {
    const state = place(make(), 4, 15)
    expect(has(state, { type: 'claim', at: 0 })).toBe(true)
    expect(has(state, { type: 'claim', at: 3 })).toBe(false)
    state.players.deva.pos = 1; expect(has(state, { type: 'claim', at: 0 })).toBe(false)
    state.players.deva.pos = 15; state.board[0] = { kind: 'shrine', owner: 'asura' }
    expect(has(state, { type: 'claim', at: 0 })).toBe(false)
  })
  it('blood surrenders a real owned shrine and is consumed by attack or turn end', () => {
    let state = place(make(), 5, 6); const id = give(state, 'blood')
    state = applyAction(state, { type: 'card', instanceId: id, to: 12 })
    expect(controlled(state).asura).toBe(0); expect(state.players.asura.blood).toBe(2)
    const attacked = applyAction(state, { type: 'attack', to: 6 })
    expect(attacked.players.deva.hp).toBe(2); expect(attacked.players.asura.blood).toBe(0)
    expect(end(state).players.asura.blood).toBe(0)
    const second = give(state, 'blood'); expect(has(state, { type: 'card', instanceId: second, to: 12 })).toBe(false)
  })
  it('respawns at nearest legal square, clears blood, and restores AP after the one-AP penalty', () => {
    let state = place(make(), 1, 5, 'spear')
    state.players.deva.hp = 2; state.players.deva.blood = 2; state.board[2] = { kind: 'spring' }
    const weapon = state.players.deva.weapon, hand = state.players.deva.hand
    state = applyAction(state, { type: 'attack', to: 5 })
    expect(state.players.asura.knockouts).toBe(1); expect(state.players.deva.pos).toBe(3)
    expect(state.players.deva.hp).toBe(6); expect(state.players.deva.blood).toBe(0)
    expect(state.players.deva.weapon).toBe(weapon); expect(state.players.deva.hand).toEqual(hand)
    expect(legalActions(state).some(action => action.type === 'attack')).toBe(false)
    state = end(state); expect(state.turn).toBe('deva'); expect(state.ap).toBe(1)
    state = end(end(state)); expect(state.turn).toBe('deva'); expect(state.ap).toBe(2)
  })
})
describe('seeded cards, purity, and ending', () => {
  it.each(['asura', 'deva'] as const)('starts %s at round 1, draws four, and skips both first-turn extra draws', first => {
    let state = createMatch({ seed: 'same', first }); expect(state.round).toBe(1); expect(state.turnNumber).toBe(1)
    expect(state.players[first].hand).toHaveLength(4)
    state = end(state); expect(state.players[opponent(first)].hand).toHaveLength(4)
    state = end(state); expect(state.players[first].hand).toHaveLength(5)
    expect(state.round).toBe(2)
  })
  it('does not draw or consume deck/RNG at the hand limit', () => {
    let state = make(); const player = state.players.asura
    player.hand.push(...player.deck.splice(0, 2)); const deck = [...player.deck], rng = state.rng
    state = end(end(state)); expect(state.players.asura.hand).toHaveLength(6); expect(state.players.asura.deck).toEqual(deck); expect(state.rng).toBe(rng)
  })
  it('reshuffles discard reproducibly, preserving all 24 unique instances', () => {
    const state = make(); const p = state.players.asura
    p.discard = [...p.deck, ...p.hand.splice(0, 2)]; p.deck = []
    const next = end(end(state)); expect(next).toEqual(end(end(structuredClone(state))))
    for (const side of ['asura', 'deva'] as const) {
      const all = [...next.players[side].hand, ...next.players[side].deck, ...next.players[side].discard]
      expect(all).toHaveLength(12); expect(new Set(all.map(card => card.instanceId)).size).toBe(12)
      for (const id of ['spear', 'blade', 'dash', 'fog', 'spring', 'blood']) expect(all.filter(card => card.id === id)).toHaveLength(2)
    }
  })
  it('preview is pure including RNG and identical actions/seeds reproduce identical games', () => {
    const state = make(), original = structuredClone(state)
    const action = legalActions(state)[0], result = applyAction(state, action)
    expect(state).toEqual(original); expect(result).not.toBe(state); expect(result).toEqual(applyAction(make(), action))
    expect(make()).toEqual(make()); expect(createMatch({ seed: 'different' }).players.asura.hand).not.toEqual(state.players.asura.hand)
  })
  it.each(['shrines', 'knockouts', 'draw'] as const)('resolves %s at exactly the sixteenth turn', condition => {
    let state = make()
    if (condition === 'shrines') state.board[0] = { kind: 'shrine', owner: 'deva' }
    if (condition === 'knockouts') state.players.asura.knockouts = 1
    for (let i = 0; i < 15; i++) state = end(state)
    expect(state.status).toBe('playing'); expect(state.turnNumber).toBe(16)
    state = end(state); expect(state.status).toBe('finished'); expect(state.ap).toBe(0)
    expect(state.winner).toBe(condition === 'shrines' ? 'deva' : condition === 'knockouts' ? 'asura' : 'draw')
    expect(legalActions(state)).toEqual([]); expect(end(state)).toBe(state)
  })
})
