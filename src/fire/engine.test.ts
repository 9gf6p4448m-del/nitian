import { describe, expect, it } from 'vitest'
import { applyAction, cellName, createGame, currentSide, goalCell, legalActions } from './engine'
import type { Action, FireState } from './engine'

function fixture(changes: Partial<FireState> = {}): FireState {
  return { ...createGame('B'), ...changes }
}
function setUnits(s: FireState, positions: number[], hp = [3, 3, 3, 3]) {
  s.units.forEach((u, i) => { u.cell = positions[i]; u.hp = hp[i] })
  return s
}
function act(s: FireState, action: Action) { return applyAction(s, action).state }
function wait(s: FireState) { return act(s, legalActions(s).find(a => a.type === 'wait' || a.type === 'pass')!) }

describe('奪火開局與啟用', () => {
  it('固定開局、座標與兩版祭壇', () => {
    const s = createGame('A')
    expect(s.units.map(u => [u.id, u.cell, u.hp, u.used])).toEqual([
      ['a1', 21, 3, false], ['a2', 23, 3, false], ['d1', 1, 3, false], ['d2', 3, 3, false],
    ])
    expect(s.fire).toEqual({ holder: null, cell: 12 })
    expect([cellName(0), cellName(24)]).toEqual(['A1', 'E5'])
    expect([goalCell('A', 'asura'), goalCell('A', 'deva'), goalCell('B', 'asura'), goalCell('B', 'deva')]).toEqual([22, 2, 2, 22])
    expect(Object.values(s.repetitions)).toEqual([1])
  })
  it('每輪甲乙甲乙，不能重複啟用，輪界不連走', () => {
    let s = createGame('A')
    const sides = []
    for (let i = 0; i < 8; i++) { sides.push(currentSide(s)); s = wait(s) }
    expect(sides).toEqual(['asura', 'deva', 'asura', 'deva', 'asura', 'deva', 'asura', 'deva'])
    expect(s.result).toEqual({ winner: null, reason: 'repetition' })
    s = act(createGame('A'), { type: 'wait', unitId: 'a1' })
    s = act(s, { type: 'wait', unitId: 'd1' })
    expect(() => act(s, { type: 'wait', unitId: 'a1' })).toThrow()
    expect(legalActions(s).every(a => a.unitId === 'a2')).toBe(true)
  })
  it('剩一人每輪只能動一次，其第二時槽強制略過', () => {
    let s = setUnits(fixture(), [21, 23, 1, 3], [3, 0, 3, 3])
    s = wait(wait(s))
    expect(legalActions(s)).toEqual([{ type: 'pass' }])
    expect(act(s, { type: 'pass' }).slot).toBe(3)
    expect(() => act(createGame('A'), { type: 'pass' })).toThrow()
  })
  it('非法行動不污染原局面，合法行動也保留輸入', () => {
    const s = createGame('A'); const before = JSON.stringify(s)
    expect(() => act(s, { type: 'move', unitId: 'a1', target: 0 })).toThrow()
    act(s, { type: 'move', unitId: 'a1', target: 16 })
    expect(JSON.stringify(s)).toBe(before)
  })
})

describe('移動、拾火與阻擋', () => {
  it('可正交轉彎兩步，但不能穿人', () => {
    const s = setUnits(fixture(), [20, 23, 15, 3]); s.fire.cell = 12
    const moves = legalActions(s).filter(a => a.type === 'move' && a.unitId === 'a1').map(a => a.target)
    expect(moves).toContain(16)
    expect(moves).not.toContain(10)
    expect(moves).not.toContain(15)
  })
  it('走到火立即停，不能第二步穿火而不拾取', () => {
    const s = setUnits(fixture(), [20, 23, 1, 3]); s.fire.cell = 15
    expect(legalActions(s)).not.toContainEqual({ type: 'move', unitId: 'a1', target: 10 })
    const next = act(s, { type: 'move', unitId: 'a1', target: 15 })
    expect(next.fire).toEqual({ holder: 'a1', cell: null })
  })
  it('有繞行合法路徑的兩步落點仍可到達', () => {
    const s = setUnits(fixture(), [20, 23, 1, 3]); s.fire.cell = 15
    expect(legalActions(s)).toContainEqual({ type: 'move', unitId: 'a1', target: 16 })
  })
  it('持火出發只能一步；腳下火需另花動作拾取', () => {
    const s = setUnits(fixture(), [12, 23, 1, 3]); s.fire = { holder: 'a1', cell: null }
    expect(legalActions(s)).not.toContainEqual({ type: 'move', unitId: 'a1', target: 2 })
    s.fire = { holder: null, cell: 12 }
    expect(act(s, { type: 'pickup', unitId: 'a1' }).fire.holder).toBe('a1')
  })
})

describe('近攻、推擊與死亡', () => {
  it('持火者先掉火原格，推擊不讓火跟走，也不耗被動方啟用', () => {
    const s = setUnits(fixture(), [12, 23, 7, 3]); s.fire = { holder: 'd1', cell: null }
    const next = act(s, { type: 'strike', unitId: 'a1', target: 7, push: true })
    expect(next.units[2]).toMatchObject({ hp: 2, cell: 2, used: false })
    expect(next.fire).toEqual({ holder: null, cell: 7 })
  })
  it('被推上地面火不自動拾取', () => {
    const s = setUnits(fixture(), [12, 23, 7, 3]); s.fire.cell = 2
    const next = act(s, { type: 'strike', unitId: 'a1', target: 7, push: true })
    expect(next.units[2].cell).toBe(2)
    expect(next.fire).toEqual({ holder: null, cell: 2 })
  })
  it.each([[3, 4, 1], [12, 7, 2]])('推向界外或占格仍扣血 (%s)', (attacker, victim, blocker) => {
    const s = setUnits(fixture(), [attacker, 23, victim, blocker]); s.fire.cell = 10
    const next = act(s, { type: 'strike', unitId: 'a1', target: victim, push: true })
    expect(next.units[2]).toMatchObject({ hp: 2, cell: victim })
  })
  it('死亡不推，任一方全滅立即終止', () => {
    const s = setUnits(fixture(), [12, 23, 7, 3], [3, 3, 1, 0]); s.fire = { holder: 'd1', cell: null }
    const next = act(s, { type: 'strike', unitId: 'a1', target: 7, push: true })
    expect(next.units[2]).toMatchObject({ hp: 0, cell: 7 })
    expect(next.result).toEqual({ winner: 'asura', reason: 'elimination' })
    expect(legalActions(next)).toEqual([])
    expect(() => wait(next)).toThrow()
  })
  it('不能攻擊友方或斜角敵人', () => {
    const s = setUnits(fixture(), [12, 13, 6, 3])
    expect(() => act(s, { type: 'strike', unitId: 'a1', target: 13 })).toThrow()
    expect(() => act(s, { type: 'strike', unitId: 'a1', target: 6 })).toThrow()
  })
})

describe('投火與祭壇', () => {
  it('友方也受傷接火，已啟用者接火不再次啟用', () => {
    const s = setUnits(fixture(), [12, 7, 1, 3]); s.units[1].used = true; s.fire = { holder: 'a1', cell: null }
    const next = act(s, { type: 'throw', unitId: 'a1', target: 2 })
    expect(next.units[1]).toMatchObject({ hp: 2, used: true })
    expect(next.fire.holder).toBe('a2')
  })
  it('第一人攔截，事件必須記錄實際落點', () => {
    const s = setUnits(fixture(), [2, 12, 1, 3]); s.fire = { holder: 'a1', cell: null }
    const result = applyAction(s, { type: 'throw', unitId: 'a1', target: 17 })
    expect(result.state.fire.holder).toBe('a2')
    expect(result.events.find(e => e.type === 'throw')).toMatchObject({ from: 2, to: 12 })
  })
  it('空格投火落地、不能斜投或超三格', () => {
    const s = setUnits(fixture(), [12, 23, 1, 3]); s.fire = { holder: 'a1', cell: null }
    expect(act(s, { type: 'throw', unitId: 'a1', target: 10 }).fire).toEqual({ holder: null, cell: 10 })
    expect(() => act(s, { type: 'throw', unitId: 'a1', target: 6 })).toThrow()
    s.units[0].cell = 0
    expect(() => act(s, { type: 'throw', unitId: 'a1', target: 4 })).toThrow()
  })
  it('擊殺守衛落火，存活守衛接火可清走：紙測1血/2血案例', () => {
    for (const hp of [1, 2]) {
      let s = setUnits(fixture(), [12, 3, 2, 24], [3, 3, hp, 3]); s.fire = { holder: 'a1', cell: null }
      s = act(s, { type: 'throw', unitId: 'a1', target: 2 })
      if (hp === 1) {
        expect(s.fire).toEqual({ holder: null, cell: 2 })
        s = act(s, { type: 'wait', unitId: 'd2' })
        s = act(s, { type: 'move', unitId: 'a2', target: 2 })
        expect(s.fire.holder).toBe('a2')
        expect(legalActions(s)).toEqual([{ type: 'pass' }])
        s = act(s, { type: 'pass' })
        expect(act(s, { type: 'offer', unitId: 'a2' }).result?.winner).toBe('asura')
      } else {
        expect(s.fire.holder).toBe('d1')
        s = act(s, { type: 'throw', unitId: 'd1', target: 0 })
        expect(s.fire).toEqual({ holder: null, cell: 0 })
      }
    }
  })
  it.each(['A', 'B'] as const)('%s版雙方必須持火站對壇另花動作奉獻', variant => {
    for (const side of ['asura', 'deva'] as const) {
      const s = createGame(variant); s.slot = side === 'asura' ? 0 : 1
      const u = s.units.find(v => v.side === side)!; u.cell = goalCell(variant, side)
      s.fire = { holder: u.id, cell: null }
      expect(act(s, { type: 'offer', unitId: u.id }).result).toEqual({ winner: side, reason: 'offering' })
      u.cell = 12
      expect(() => act(s, { type: 'offer', unitId: u.id })).toThrow()
    }
  })
  it('移入祭壇不自動得分', () => {
    const s = setUnits(createGame('A'), [21, 23, 1, 3]); s.fire = { holder: 'a1', cell: null }
    expect(act(s, { type: 'move', unitId: 'a1', target: 22 }).result).toBeNull()
  })
})

describe('完整輪首重複', () => {
  it('死者座標不影響等價，但血量影響', () => {
    let s = setUnits(createGame('A'), [21, 23, 1, 3], [3, 0, 3, 3])
    s.repetitions = {}
    for (let round = 0; round < 3; round++) {
      s.units[1].cell = round
      for (let i = 0; i < 4; i++) s = wait(s)
    }
    expect(s.result?.reason).toBe('repetition')
    s = createGame('A')
    for (let i = 0; i < 4; i++) s = wait(s)
    s.units[0].hp = 2
    for (let i = 0; i < 4; i++) s = wait(s)
    expect(s.result).toBeNull()
  })
})
