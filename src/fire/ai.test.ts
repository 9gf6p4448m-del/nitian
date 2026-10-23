import { describe, expect, it } from 'vitest'
import { chooseAction } from './ai'
import { applyAction, createGame, goalCell, legalActions } from './engine'
import type { FireState, Side } from './engine'

function fixture(side: Side): FireState {
  const s = createGame('B'); s.slot = side === 'asura' ? 0 : 1
  return s
}

describe('公平公開局面的奪火 AI', () => {
  it.each(['asura', 'deva'] as const)('%s能立即奉獻，不改輸入局面', side => {
    const s = fixture(side); const u = s.units.find(u => u.side === side)!
    u.cell = goalCell('B', side); s.fire = { holder: u.id, cell: null }
    const before = JSON.stringify(s)
    expect(chooseAction(s)).toEqual({ type: 'offer', unitId: u.id })
    expect(JSON.stringify(s)).toBe(before)
  })
  it.each(['asura', 'deva'] as const)('%s避免可見的對手下一手奉獻', side => {
    const s = fixture(side)
    const attacker = s.units.find(u => u.side === side)!
    const carrier = s.units.find(u => u.side !== side)!
    carrier.cell = goalCell('B', carrier.side)
    attacker.cell = carrier.cell === 2 ? 7 : 17
    s.fire = { holder: carrier.id, cell: null }
    const action = chooseAction(s)
    expect(action.type).toBe('strike')
    const next = applyAction(s, action).state
    expect(legalActions(next).some(a => a.type === 'offer')).toBe(false)
  })
  it('全滅一擊必選，無可啟用者回傳唯一pass，終局不繼續下', () => {
    const s = fixture('asura'); s.units[0].cell = 12; s.units[2].cell = 7
    s.units[2].hp = 1; s.units[3].hp = 0
    const next = applyAction(s, chooseAction(s)).state
    expect(next.result).toEqual({ winner: 'asura', reason: 'elimination' })
    expect(() => chooseAction(next)).toThrow()
    s.units[0].used = true; s.units[1].hp = 0
    expect(chooseAction(s)).toEqual({ type: 'pass' })
  })
  it('雙版鏡像開局與局部戰局均合法，8局自走可終局，單步小於200ms', () => {
    const times: number[] = []; const results: string[] = []; const lengths: number[] = []
    for (let game = 0; game < 8; game++) {
      let s = createGame(game % 2 === 0 ? 'A' : 'B')
      // Replay the real API so custom positions retain a valid round-start history.
      const setupMoves: (number | null)[][][] = [
        [], [[20, 0, 24, 4]], [[15, 5, 19, 9]], [[15, 0, 19, 4], [10, null, 14, null]],
      ]
      const order = ['a1', 'd1', 'a2', 'd2']
      for (const round of setupMoves[Math.floor(game / 2)]) {
        for (let slot = 0; slot < 4; slot++) {
          const target = round[slot]
          s = applyAction(s, target === null ? { type: 'wait', unitId: order[slot] } : { type: 'move', unitId: order[slot], target }).state
        }
      }
      expect(new Set(s.units.map(u => u.cell)).size).toBe(4)
      let steps = 0
      while (!s.result && steps < 320) {
        const before = JSON.stringify(s)
        const start = performance.now()
        const action = chooseAction(s)
        times.push(performance.now() - start)
        expect(legalActions(s)).toContainEqual(action)
        expect(JSON.stringify(s)).toBe(before)
        s = applyAction(s, action).state; steps++
        const living = s.units.filter(u => u.hp > 0)
        expect(new Set(living.map(u => u.cell)).size).toBe(living.length)
        expect(living.every(u => u.cell >= 0 && u.cell < 25 && u.hp <= 3)).toBe(true)
        if (s.fire.holder !== null) {
          expect(s.fire.cell).toBeNull()
          expect(living.some(u => u.id === s.fire.holder)).toBe(true)
        } else {
          expect(s.fire.cell).toBeGreaterThanOrEqual(0)
          expect(s.fire.cell).toBeLessThan(25)
        }
      }
      expect(s.result, `game ${game} did not finish at round ${s.round}`).not.toBeNull()
      results.push(s.result!.reason); lengths.push(steps)
    }
    const sorted = [...times].sort((a, b) => a - b)
    const stats = { games: results.length, results, actions: times.length, steps: lengths, maxMs: Math.round(Math.max(...times) * 100) / 100, p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 100) / 100 }
    console.log('AI_BENCHMARK', JSON.stringify(stats))
    expect(Math.max(...times)).toBeLessThan(200)
  }, 30000)
})
