import { describe, expect, it } from 'vitest'
import { chooseAction } from './ai'
import { applyAction, createRealm, domainAt, domainCount, domains, legalActions, outcome, score } from './engine'
import type { RealmAction, RealmState, VictoryRule } from './engine'

/** Real four-move trial, replayable through the UI without state injection. */
const comparisonMoves: RealmAction[] = [
  { type: 'channel', at: 13, strength: 3, axis: 'h' },
  { type: 'channel', at: 9, strength: 3, axis: 'h' },
  { type: 'build', at: 6, rank: 1 },
  { type: 'build', at: 15, rank: 1 },
]

function comparisonGame(victory: VictoryRule, moves = comparisonMoves): RealmState {
  return moves.reduce(applyAction, createRealm('trial', 'asura', victory))
}

function empty(): RealmState {
  return { ...createRealm('full', 'asura', 'domains'), board: Array(16).fill(null) }
}

describe('爭域制共用判定', () => {
  it('舊呼叫與缺欄位狀態維持總分制，新局明設規則且拒絕未知規則', () => {
    expect(createRealm('full').victory).toBe('power')
    expect(createRealm('trial', 'deva', 'domains').victory).toBe('domains')
    expect(() => createRealm('full', 'asura', 'bad' as VictoryRule)).toThrow('未知勝利規則')
    const legacy = comparisonGame('domains')
    delete legacy.victory
    expect(outcome(legacy)).toEqual({ winner: 'asura', reason: 'power' })
  })

  it('十六格逐一歸入四個2×2區，越界拒絕', () => {
    expect(Array.from({ length: 16 }, (_, index) => domainAt(index)))
      .toEqual([0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3])
    for (const index of [-1, 16, 1.5, NaN]) expect(() => domainAt(index)).toThrow()
    expect(domains(empty()).map(({ id, name }) => [id, name]))
      .toEqual([[0, '西北'], [1, '東北'], [2, '西南'], [3, '東南']])
  })

  it('跨區神力只算受益神壇所在區，多源、大壇、穿越殘骸沿用原供應', () => {
    const state = empty()
    state.board[1] = { kind: 'power', strength: 3, axis: 'v' }
    state.board[4] = { kind: 'power', strength: 2, axis: 'h' }
    state.board[5] = { kind: 'shrine', owner: 'asura', rank: 2 }
    state.board[6] = { kind: 'rubble' }
    state.board[7] = { kind: 'shrine', owner: 'deva', rank: 1 }
    state.board[9] = { kind: 'shrine', owner: 'asura', rank: 1 }
    expect(domains(state).map(domain => domain.scores)).toEqual([
      { asura: 10, deva: 0 }, { asura: 0, deva: 2 },
      { asura: 3, deva: 0 }, { asura: 0, deva: 0 },
    ])
    expect(domainCount(state)).toEqual({ asura: 2, deva: 1 })
    expect(score(state)).toEqual({ asura: 13, deva: 2 })
    const rotated = applyAction(state, { type: 'reverse', sacrifice: 9, power: 1 })
    expect(rotated.board[9]).toEqual({ kind: 'rubble' })
    expect(domains(rotated).map(domain => domain.scores)).toEqual([
      { asura: 4, deva: 0 }, { asura: 0, deva: 2 },
      { asura: 0, deva: 0 }, { asura: 0, deva: 0 },
    ])
    expect(domainCount(rotated)).toEqual({ asura: 1, deva: 1 })
  })

  it('0:0及非零同分無主，不把神壇數量當控制權', () => {
    const state = empty()
    expect(domains(state).map(domain => domain.controller)).toEqual([null, null, null, null])
    state.board[0] = { kind: 'shrine', owner: 'asura', rank: 1 }
    state.board[1] = { kind: 'shrine', owner: 'deva', rank: 1 }
    state.board[2] = { kind: 'power', strength: 3, axis: 'h' }
    expect(domains(state)[0]).toEqual({ id: 0, name: '西北', scores: { asura: 3, deva: 3 }, controller: null })
    expect(domainCount(state)).toEqual({ asura: 0, deva: 0 })
    expect(outcome(state)).toEqual({ winner: 'draw', reason: 'draw' })
  })

  it('相同合法四手在兩制得不同贏家，區數領先者即使總分落後仍獲勝', () => {
    const domainGame = comparisonGame('domains')
    const powerGame = comparisonGame('power')
    expect(domainGame.board).toEqual(powerGame.board)
    expect(domainGame.inventory).toEqual(powerGame.inventory)
    expect(domainGame.remaining).toEqual({ asura: 0, deva: 0 })
    expect(domainGame.status).toBe('finished')
    expect(score(domainGame)).toEqual({ asura: 13, deva: 12 })
    expect(domainCount(domainGame)).toEqual({ asura: 1, deva: 2 })
    expect(domains(domainGame).map(domain => domain.scores)).toEqual([
      { asura: 3, deva: 0 }, { asura: 5, deva: 6 },
      { asura: 0, deva: 0 }, { asura: 5, deva: 6 },
    ])
    expect(outcome(domainGame)).toEqual({ winner: 'deva', reason: 'domains' })
    expect(domainGame.winner).toBe('deva')
    expect(outcome(powerGame)).toEqual({ winner: 'asura', reason: 'power' })
    expect(powerGame.winner).toBe('asura')
  })

  it('區數相同才比總神力，再相同為平手；預估及最終判定一致', () => {
    const state = createRealm('full', 'asura', 'domains')
    expect(domainCount(state)).toEqual({ asura: 1, deva: 1 })
    expect(outcome(state)).toEqual({ winner: 'draw', reason: 'draw' })
    state.board[13] = { kind: 'power', strength: 3, axis: 'h' }
    expect(domainCount(state)).toEqual({ asura: 1, deva: 1 })
    expect(outcome(state)).toEqual({ winner: 'asura', reason: 'power' })
    state.remaining = { asura: 1, deva: 0 }
    const final = applyAction(state, { type: 'build', at: 8, rank: 1 })
    expect(outcome(final)).toEqual(outcome(state))
    expect(final.winner).toBe('asura')
    state.board[13] = { kind: 'power', strength: 2, axis: 'h' }
    expect(applyAction(state, { type: 'build', at: 8, rank: 1 }).winner).toBe('draw')
  })

  it('預覽、區域計分及回傳資料沒有可變引用污染，規則隨局保留', () => {
    const state = createRealm('trial', 'asura', 'domains')
    const before = JSON.stringify(state)
    const preview = applyAction(state, comparisonMoves[0])
    expect(preview.victory).toBe('domains')
    expect(applyAction(state, comparisonMoves[0])).toEqual(preview)
    const result = domains(state)
    result[0].scores.asura = 999
    result[0].controller = 'deva'
    const count = domainCount(state)
    count.asura = 999
    outcome(state)
    expect(domains(state)[0].scores.asura).toBe(3)
    expect(JSON.stringify(state)).toBe(before)
  })
})

describe('爭域兩層AI', () => {
  it('同合法行動，放棄貪總分以確保對手回應後的控制區數優勢', () => {
    const state = createRealm('trial', 'asura', 'domains')
    const before = JSON.stringify(state)
    const powerState = { ...state, victory: 'power' as const }
    expect(legalActions(state)).toEqual(legalActions(powerState))
    const greedy = chooseAction(powerState)
    expect(greedy).toEqual({ type: 'build', at: 6, rank: 2 })
    const tactical = chooseAction(state)
    expect(tactical).toEqual({ type: 'channel', at: 6, strength: 3, axis: 'v' })
    const greedyNext = applyAction(state, greedy!)
    const tacticalNext = applyAction(state, tactical!)
    expect(score(greedyNext)).toEqual({ asura: 15, deva: 6 })
    expect(score(tacticalNext)).toEqual({ asura: 8, deva: 6 })
    expect(domainCount(applyAction(greedyNext, { type: 'channel', at: 3, strength: 3, axis: 'v' })))
      .toEqual({ asura: 1, deva: 2 })
    for (const reply of legalActions(tacticalNext)) {
      const counts = domainCount(applyAction(tacticalNext, reply))
      expect(counts.asura).toBeGreaterThan(counts.deva)
    }
    // The worst power margin is still -8, so this cannot be a total-score choice.
    expect(score(applyAction(tacticalNext, { type: 'build', at: 2, rank: 2 })))
      .toEqual({ asura: 8, deva: 16 })
    expect(chooseAction(state)).toEqual(tactical)
    expect(JSON.stringify(state)).toBe(before)
  })

  it('終局遵守共用勝負，區數相同時再挑總分', () => {
    const state = comparisonGame('domains', comparisonMoves.slice(0, 3))
    const chosen = chooseAction(state)
    expect(chosen).toEqual({ type: 'build', at: 15, rank: 2 })
    const final = applyAction(state, chosen!)
    expect(final.winner).toBe('deva')
    expect(outcome(final)).toEqual({ winner: 'deva', reason: 'domains' })
    const power = chooseAction({ ...state, victory: 'power' })
    expect(power).toEqual({ type: 'build', at: 8, rank: 2 })
    expect(outcome(applyAction(state, power!))).toEqual({ winner: 'deva', reason: 'power' })
  })

  it.each(['full', 'trial'] as const)('爭域%s雙先手可合法自走終局', mode => {
    for (const first of ['asura', 'deva'] as const) {
      let state = createRealm(mode, first, 'domains')
      while (state.status === 'playing') {
        const action = chooseAction(state)
        expect(legalActions(state)).toContainEqual(action)
        state = applyAction(state, action!)
        expect(state.victory).toBe('domains')
      }
      expect(state.ply).toBe(mode === 'full' ? 12 : 4)
      expect(state.winner).toBe(outcome(state).winner)
      expect(chooseAction(state)).toBeNull()
    }
  })
})
