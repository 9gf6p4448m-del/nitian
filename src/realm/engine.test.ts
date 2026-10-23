import { describe, expect, it } from 'vitest'
import { applyAction, coord, createRealm, legalActions, opponent, score, supplyBreakdown } from './engine'
import type { RealmAction, RealmState } from './engine'

function empty(): RealmState {
  return { ...createRealm('full'), board: Array(16).fill(null) }
}

describe('共享神域純引擎', () => {
  it('完整局公開配置、庫存、先手及座標', () => {
    const s = createRealm('full', 'deva')
    expect(score(s)).toEqual({ asura: 2, deva: 2 })
    expect(s.turn).toBe('deva')
    expect(s.first).toBe('deva')
    expect(s.remaining).toEqual({ asura: 6, deva: 6 })
    expect(s.inventory.asura).toEqual({ small: 3, big: 2, powers: [1, 2, 3] })
    expect(s.inventory.asura).not.toBe(s.inventory.deva)
    expect([coord(0), coord(15)]).toEqual(['A1', 'D4'])
    expect(opponent('deva')).toBe('asura')
    expect(() => coord(16)).toThrow()
    expect(() => createRealm('bad' as 'full')).toThrow()
    expect(() => createRealm('full', 'bad' as 'asura')).toThrow()
  })

  it('試局人工分數與逆轉不限原神力方向', () => {
    const s = createRealm('trial')
    expect(score(s)).toEqual({ asura: 5, deva: 6 })
    expect(s.remaining).toEqual({ asura: 2, deva: 2 })
    expect(s.inventory.asura).toEqual({ small: 1, big: 1, powers: [3] })
    const reversed = applyAction(s, { type: 'reverse', sacrifice: 4, power: 5 })
    expect(score(reversed)).toEqual({ asura: 8, deva: 0 })
    expect(reversed.board[4]).toEqual({ kind: 'rubble' })
    expect(reversed.remaining).toEqual({ asura: 1, deva: 2 })
    expect(reversed.inventory).toEqual(s.inventory)
    expect(score(applyAction(s, { type: 'channel', at: 9, strength: 3, axis: 'v' })))
      .toEqual({ asura: 11, deva: 6 })
    // Original C2 expectation 9 omitted its second direct source: (3 + 2) × 2.
    expect(score(applyAction(s, { type: 'build', at: 6, rank: 2 })))
      .toEqual({ asura: 15, deva: 6 })
    expect(score(applyAction(s, { type: 'build', at: 2, rank: 2 })))
      .toEqual({ asura: 9, deva: 6 })
    // A vertical source may be selected through its row, then rotated horizontal.
    const cross = empty()
    cross.board[8] = { kind: 'shrine', owner: 'asura', rank: 1 }
    cross.board[10] = { kind: 'power', strength: 2, axis: 'v' }
    expect(applyAction(cross, { type: 'reverse', sacrifice: 8, power: 10 }).board[10])
      .toEqual({ kind: 'power', strength: 2, axis: 'h' })
  })

  it('橫縱供應穿透所有格、不遞迴，並依每座壇倍率相加', () => {
    const s = empty()
    s.board[1] = { kind: 'power', strength: 3, axis: 'v' }
    s.board[4] = { kind: 'power', strength: 2, axis: 'h' }
    s.board[5] = { kind: 'shrine', owner: 'asura', rank: 2 }
    s.board[6] = { kind: 'rubble' }
    s.board[7] = { kind: 'shrine', owner: 'deva', rank: 1 }
    s.board[9] = { kind: 'shrine', owner: 'asura', rank: 1 }
    expect(score(s)).toEqual({ asura: 13, deva: 2 })
    expect(supplyBreakdown(s, 5)).toEqual([
      { source: 1, strength: 3, multiplier: 2, value: 6, axis: 'v' },
      { source: 4, strength: 2, multiplier: 2, value: 4, axis: 'h' },
    ])
    expect(supplyBreakdown(s, 6)).toEqual([])
    expect(supplyBreakdown(s, -1)).toEqual([])
    expect(supplyBreakdown(s, 1)).toEqual([])
  })

  it('立壇及引力只扣對應庫存並輪流，零供應不會自動死亡', () => {
    let s = empty()
    s = applyAction(s, { type: 'build', at: 0, rank: 1 })
    expect(s.board[0]).toEqual({ kind: 'shrine', owner: 'asura', rank: 1 })
    expect(s.inventory.asura.small).toBe(2)
    expect(s.inventory.asura.big).toBe(2)
    s = applyAction(s, { type: 'build', at: 1, rank: 2 })
    expect(s.inventory.deva.big).toBe(1)
    s = applyAction(s, { type: 'channel', at: 4, strength: 2, axis: 'v' })
    expect(s.inventory.asura.powers).toEqual([1, 3])
    expect(score(s)).toEqual({ asura: 2, deva: 0 })
    expect(s.board[1]?.kind).toBe('shrine')
    expect(s.ply).toBe(3)
    expect(s.turn).toBe('deva')
  })

  it.each<RealmAction>([
    { type: 'build', at: -1, rank: 1 }, { type: 'build', at: 16, rank: 1 },
    { type: 'build', at: 0.5, rank: 1 }, { type: 'build', at: NaN, rank: 1 },
    { type: 'build', at: 1, rank: 1 }, { type: 'build', at: 0, rank: 3 as 1 },
    { type: 'channel', at: 0, strength: 2, axis: 'h' },
    { type: 'channel', at: 5, strength: 3, axis: 'h' },
    { type: 'channel', at: 0, strength: 3, axis: 'x' as 'h' },
    { type: 'reverse', sacrifice: 7, power: 5 },
    { type: 'reverse', sacrifice: 0, power: 5 },
    { type: 'reverse', sacrifice: 4, power: 1 },
    { type: 'reverse', sacrifice: 4, power: 10 },
    { type: 'reverse', sacrifice: 4, power: 99 },
    { type: 'reverse', sacrifice: -1, power: 5 },
  ])('拒絕非法輸入且原局完全不變：%j', action => {
    const s = createRealm('trial'); const before = JSON.stringify(s)
    expect(() => applyAction(s, action)).toThrow()
    expect(JSON.stringify(s)).toBe(before)
  })

  it('拒絕耗盡庫存、殘骸犧牲、錯誤行動及無剩餘步數', () => {
    const s = createRealm('trial')
    s.inventory.asura.small = 0; s.inventory.asura.big = 0
    s.board[0] = { kind: 'rubble' }
    for (const a of [
      { type: 'build', at: 2, rank: 1 }, { type: 'build', at: 2, rank: 2 },
      { type: 'reverse', sacrifice: 0, power: 5 }, { type: 'bad' }, null,
    ]) expect(() => applyAction(s, a as RealmAction)).toThrow()
    s.remaining.asura = 0
    expect(legalActions(s)).toEqual([])
    expect(() => applyAction(s, { type: 'build', at: 2, rank: 1 })).toThrow()
  })

  it('所有列出的行動可執行、輸出與原局無可變引用共享', () => {
    const s = createRealm('trial'); const before = JSON.stringify(s)
    const actions = legalActions(s)
    expect(actions).toContainEqual({ type: 'reverse', sacrifice: 4, power: 5 })
    expect(actions).not.toContainEqual({ type: 'reverse', sacrifice: 4, power: 10 })
    for (const action of actions) expect(applyAction(s, action).ply).toBe(1)
    const next = applyAction(s, actions[0])
    next.inventory.deva.powers.push(99); next.remaining.deva = 99
    const shrine = next.board[1]
    if (shrine?.kind === 'shrine') shrine.rank = 1
    expect(JSON.stringify(s)).toBe(before)
  })

  it.each(['asura', 'deva', 'draw'] as const)('最後步依當前分數判定%s，禁止再動', result => {
    const s = empty(); s.remaining = { asura: 1, deva: 0 }
    s.board[0] = { kind: 'power', strength: 1, axis: 'h' }
    if (result !== 'draw') s.board[1] = { kind: 'shrine', owner: result, rank: 1 }
    const end = applyAction(s, { type: 'build', at: 15, rank: 1 })
    expect(end.status).toBe('finished'); expect(end.winner).toBe(result)
    expect(end.turn).toBe('asura')
    expect(legalActions(end)).toEqual([])
    expect(() => applyAction(end, { type: 'build', at: 14, rank: 1 })).toThrow()
  })

  it('對手已無步時可走自己的剩餘步，完整十二步自然終局', () => {
    const s = empty(); s.remaining.deva = 0
    expect(applyAction(s, { type: 'build', at: 0, rank: 1 }).turn).toBe('asura')
    let game = createRealm('full')
    for (let i = 0; i < 12; i++) game = applyAction(game, legalActions(game)[0])
    expect(game.status).toBe('finished')
    expect(game.remaining).toEqual({ asura: 0, deva: 0 })
  })
})
