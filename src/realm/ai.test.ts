import { describe, expect, it } from 'vitest'
import { chooseAction } from './ai'
import { applyAction, createRealm, legalActions, score } from './engine'
import type { RealmState } from './engine'

const empty = (): RealmState => ({ ...createRealm('full'), board: Array(16).fill(null) })

describe('共享神域公開兩層 AI', () => {
  it('看對手一手：放棄立即加6分，預佔轉向後供應而強制獲勝', () => {
    const s = empty()
    s.remaining = { asura: 1, deva: 1 }
    s.inventory.asura = { small: 0, big: 1, powers: [] }
    s.inventory.deva = { small: 0, big: 0, powers: [] }
    s.board[0] = { kind: 'shrine', owner: 'asura', rank: 1 }
    s.board[3] = { kind: 'shrine', owner: 'deva', rank: 1 }
    s.board[1] = { kind: 'power', strength: 3, axis: 'h' }
    const greedy = applyAction(s, { type: 'build', at: 2, rank: 2 })
    expect(score(greedy)).toEqual({ asura: 9, deva: 3 })
    expect(applyAction(greedy, { type: 'reverse', sacrifice: 3, power: 1 }).winner).toBe('draw')
    const action = chooseAction(s)
    expect(action).toEqual({ type: 'build', at: 5, rank: 2 })
    const tactical = applyAction(s, action!)
    expect(score(tactical)).toEqual({ asura: 3, deva: 3 })
    expect(legalActions(tactical)).toEqual([{ type: 'reverse', sacrifice: 3, power: 1 }])
    expect(applyAction(tactical, legalActions(tactical)[0]).winner).toBe('asura')
  })

  it('平手穩定選第一個合法行動，無可用行動或已終局回傳null', () => {
    const s = empty()
    s.remaining = { asura: 1, deva: 0 }
    expect(chooseAction(s)).toEqual({ type: 'build', at: 0, rank: 1 })
    const end = applyAction(s, chooseAction(s)!)
    expect(end.winner).toBe('draw'); expect(chooseAction(end)).toBeNull()
    s.remaining.asura = 0
    expect(chooseAction(s)).toBeNull()
    s.remaining.asura = 1
    s.inventory.asura = { small: 0, big: 0, powers: [] }
    expect(chooseAction(s)).toBeNull()
  })

  it('對手無庫存可回應及對手步數耗盡仍提供合法行動', () => {
    const s = empty()
    s.inventory.deva = { small: 0, big: 0, powers: [] }
    expect(legalActions(applyAction(s, legalActions(s)[0]))).toEqual([])
    expect(legalActions(s)).toContainEqual(chooseAction(s))
    s.remaining.deva = 0
    expect(legalActions(s)).toContainEqual(chooseAction(s))
  })

  it('即使終局必敗也回傳合法行動，依實際分數選擇', () => {
    const s = empty()
    s.remaining = { asura: 1, deva: 0 }
    s.inventory.asura = { small: 1, big: 0, powers: [] }
    s.board[0] = { kind: 'power', strength: 3, axis: 'h' }
    s.board[1] = { kind: 'shrine', owner: 'deva', rank: 2 }
    expect(chooseAction(s)).toEqual({ type: 'build', at: 2, rank: 1 })
    expect(applyAction(s, chooseAction(s)!).winner).toBe('deva')
  })

  it('雙模式雙先手可合法自走終局，決定性且不修改輸入，記錄桌面耗時', () => {
    const times: number[] = []
    const lengths: number[] = []
    for (const mode of ['full', 'trial'] as const) {
      for (const first of ['asura', 'deva'] as const) {
        let s = createRealm(mode, first)
        let steps = 0
        while (s.status === 'playing' && steps < 12) {
          const original = JSON.stringify(s)
          const start = performance.now()
          const action = chooseAction(s)
          times.push(performance.now() - start)
          expect(chooseAction(s)).toEqual(action)
          expect(JSON.stringify(s)).toBe(original)
          expect(legalActions(s)).toContainEqual(action)
          s = applyAction(s, action!); steps++
        }
        expect(s.status).toBe('finished')
        expect(s.winner).not.toBeNull()
        expect(s.remaining).toEqual({ asura: 0, deva: 0 })
        lengths.push(steps)
      }
    }
    const sorted = [...times].sort((a, b) => a - b)
    console.info('REALM_AI_DESKTOP', JSON.stringify({ games: lengths.length, steps: lengths,
      decisions: times.length, maxMs: Math.round(Math.max(...times) * 100) / 100,
      p95Ms: Math.round(sorted[Math.floor(times.length * 0.95)] * 100) / 100 }))
  })
})
