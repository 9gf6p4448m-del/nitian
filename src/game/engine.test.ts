import { describe, expect, it } from 'vitest'
import { createGame, nextRound, resolveTurn, getIntents } from './engine'
import { CARDS } from './data'
import { shuffle, seedHash } from './rng'
import type { CardId, CombatState, PlannedCard } from './types'

function fixture(ids: CardId[], changes: { hp?: number; enemyHp?: number; thunder?: number; enemyThunder?: number; round?: number; shield?: number; enemyShield?: number } = {}) {
  const s = createGame({ seed: 'test', mode: 'classic', tutorial: false })
  s.hand = ids.map((cardId, i) => ({ cardId, instanceId: `fixture-${i}` }))
  s.drawPile = []; s.discardPile = []
  s.player.hp = changes.hp ?? 45; s.player.thunder = changes.thunder ?? 0
  s.player.shield = changes.shield ?? 0
  s.enemy.hp = changes.enemyHp ?? 30; s.enemy.thunder = changes.enemyThunder ?? 0
  s.enemy.shield = changes.enemyShield ?? 0; s.round = changes.round ?? 1
  return s
}
function plan(s: CombatState, placements: [CardId, number][]): PlannedCard[] {
  const used = new Set<string>()
  return placements.map(([id, slot]) => {
    const card = s.hand.find(c => c.cardId === id && !used.has(c.instanceId))!
    used.add(card.instanceId)
    return { instanceId: card.instanceId, slot }
  })
}
const count = (s: CombatState) => [...s.hand, ...s.drawPile, ...s.discardPile].map(c => c.instanceId).sort()

describe('權威人工驗算與紙上案例', () => {
  it.each([[2, 17, 4], [3, 21, 0]])('奉還插入區%s → 敵%sHP／%s盾', (slot, hp, shield) => {
    const s = createGame({ seed: 'tutorial', mode: 'classic', tutorial: true })
    const r = resolveTurn(s, plan(s, [['draw_thunder', 1], ['guard', 1], ['return', slot]]))
    expect(r.nextState.player).toMatchObject({ hp: 45, shield: 2, thunder: 0 })
    expect(r.nextState.enemy).toMatchObject({ hp, shield, thunder: 0 })
  })
  it('48 HP固定合法牌序，四回合43 HP勝利', () => {
    let s = createGame({ seed: 'paper', mode: 'paper', tutorial: false })
    const rounds: [CardId, number][][] = [
      [['draw_thunder', 1], ['guard', 1], ['strike', 2]],
      [['guard', 0], ['thorns', 0], ['strike', 0]],
      [['draw_thunder', 1], ['return', 1], ['evade', 1]],
      [['steal_armor', 1], ['thorns', 1], ['strike', 1]],
    ]
    const expected = [[45, 42, 3, 0], [45, 34, 3, 2], [45, 12, 0, 0], [43, 0, 0, 0]]
    rounds.forEach((cards, i) => {
      s = resolveTurn(s, plan(s, cards)).nextState
      expect([s.player.hp, s.enemy.hp, s.player.thunder, s.enemy.thunder]).toEqual(expected[i])
      expect(new Set(count(s)).size).toBe(10)
      if (i < 3) s = nextRound(s)
    })
    expect(s.status).toBe('won')
  })
})

describe('即時資源、護盾與倒刺', () => {
  it('引雷容量滿時不吞敵雷', () => {
    const s = fixture(['draw_thunder', 'evade'], { thunder: 6 })
    const r = resolveTurn(s, plan(s, [['draw_thunder', 1], ['evade', 1]]))
    const transfer = r.events.find(e => e.effect === 'transfer')!
    expect(transfer.amount).toBe(0)
    expect(transfer.after.enemy.thunder).toBe(3)
    expect(r.nextState.player.hp).toBe(45)
    expect(r.nextState.enemy.thunder).toBe(0)
  })
  it('剩一格只轉一雷，雷擊按剩餘二雷打8', () => {
    const s = fixture(['draw_thunder'], { thunder: 5 })
    const r = resolveTurn(s, plan(s, [['draw_thunder', 1]]))
    expect(r.nextState.player).toMatchObject({ hp: 37, thunder: 6 })
    expect(r.events.find(e => e.effect === 'transfer')?.amount).toBe(1)
  })
  it('汲能上限6，無雷奉還仍打4', () => {
    const s = fixture(['channel', 'return'], { thunder: 5 })
    expect(resolveTurn(s, plan(s, [['channel', 0], ['return', 0]])).nextState.enemy.hp).toBe(8)
    const empty = fixture(['return'])
    expect(resolveTurn(empty, plan(empty, [['return', 0]])).nextState.enemy.hp).toBe(26)
  })
  it('借甲僅轉實際護盾，先放為零', () => {
    const s = fixture(['steal_armor'], { round: 2 })
    expect(resolveTurn(s, plan(s, [['steal_armor', 0]])).nextState.player.hp).toBe(39)
    const r = resolveTurn(s, plan(s, [['steal_armor', 1]]))
    expect(r.nextState.player.hp).toBe(43)
    expect(r.events.find(e => e.effect === 'transfer')?.amount).toBe(4)
  })
  it('借甲最多6，護盾先吸收傷害', () => {
    const s = fixture(['steal_armor', 'strike'], { enemyShield: 10 })
    const r = resolveTurn(s, plan(s, [['steal_armor', 0], ['strike', 0]]))
    expect(r.events.find(e => e.effect === 'transfer')?.amount).toBe(6)
    expect(r.nextState.enemy.hp).toBe(28)
    expect(r.nextState.player.hp).toBe(41)
  })
  it('完全格擋仍觸發倒刺，反傷受敵盾吸收', () => {
    const s = fixture(['guard', 'thorns'], { round: 2 })
    const r = resolveTurn(s, plan(s, [['guard', 0], ['thorns', 0]]))
    expect(r.nextState.player.hp).toBe(45)
    expect(r.nextState.enemy.hp).toBe(28)
    expect(r.events.filter(e => e.effect === 'reflect')).toHaveLength(1)
  })
  it('閃避取消攻擊，不觸發倒刺，但雷量清空', () => {
    const s = fixture(['thorns', 'evade'])
    const r = resolveTurn(s, plan(s, [['thorns', 0], ['evade', 0]]))
    expect(r.nextState.player.hp).toBe(45)
    expect(r.nextState.enemy.thunder).toBe(0)
    expect(r.events.filter(e => e.effect === 'reflect')).toHaveLength(0)
  })
  it('玩家死亡不反擊，後續奉還也不執行', () => {
    const s = fixture(['thorns', 'return'], { hp: 5, thunder: 6 })
    const r = resolveTurn(s, plan(s, [['thorns', 0], ['return', 2]]))
    expect(r.nextState).toMatchObject({ status: 'lost', player: { hp: 0 }, enemy: { hp: 30 } })
    expect(r.events.some(e => e.effect === 'reflect')).toBe(false)
    expect(r.events.some(e => e.label === '奉還')).toBe(false)
  })
  it('反傷不遞迴，敵死中止最後聚雷', () => {
    const s = fixture(['steal_armor', 'strike', 'thorns'], { round: 2, enemyHp: 11 })
    s.enemy.thorns = true
    const r = resolveTurn(s, plan(s, [['steal_armor', 1], ['strike', 1], ['thorns', 1]]))
    expect(r.nextState.status).toBe('won')
    expect(r.events.filter(e => e.effect === 'reflect')).toHaveLength(1)
    expect(r.events.some(e => e.reason === '聚雷 +2')).toBe(false)
  })
  it.each(['evade', 'thorns'] as CardId[])('%s重複使用不疊加', (id) => {
    const s = fixture([id, id])
    const r = resolveTurn(s, plan(s, [[id, 0], [id, 0]]))
    expect(r.events.filter(e => e.effect === 'reflect').length).toBe(id === 'thorns' ? 1 : 0)
    expect(r.nextState.player.hp).toBe(id === 'evade' ? 45 : 35)
    expect(r.nextState.player.evade).toBe(false)
    expect(r.nextState.player.thorns).toBe(false)
  })
  it('玩家先擊殺會中止所有敵方動作，生命不為負', () => {
    const s = fixture(['strike'], { enemyHp: 2 })
    const r = resolveTurn(s, plan(s, [['strike', 0]]))
    expect(r.nextState).toMatchObject({ status: 'won', player: { hp: 45 }, enemy: { hp: 0 } })
    expect(r.events.filter(e => e.actor === 'enemy')).toHaveLength(0)
    expect(r.events.find(e => e.effect === 'attack')?.amount).toBe(2)
  })
  it('第7回合基礎攻擊只增加3，不逐回合成長', () => {
    expect(getIntents(7)[1].value).toBe(7)
    expect(getIntents(9)[1].value).toBe(7)
    expect(getIntents(8)[1].value).toBe(9)
    expect(getIntents(2)[1].value).toBe(6)
  })
})

describe('純函式、編排與跨回合', () => {
  it('預覽／正式解析一致，原狀態與RNG完全不變', () => {
    const s = createGame({ seed: 'immutable', mode: 'standard', tutorial: true })
    const p = plan(s, [['draw_thunder', 1], ['guard', 1], ['return', 2]])
    const before = structuredClone(s)
    const preview = resolveTurn(s, p)
    expect(s).toEqual(before)
    expect(resolveTurn(s, p)).toEqual(preview)
    expect(preview.nextState.rng).toBe(s.rng)
    expect(preview.events.length).toBeGreaterThan(3)
    expect(preview.events[0].before.player.hp).toBe(45)
  })
  it('所有已出未出牌一起棄牌，實體守恆', () => {
    const s = createGame({ seed: 'cards', mode: 'standard', tutorial: true })
    const r = resolveTurn(s, []).nextState
    expect(r.hand).toHaveLength(0)
    expect(r.discardPile).toHaveLength(5)
    expect(count(r)).toEqual(count(s))
    expect(count(nextRound(r))).toEqual(count(s))
  })
  it('零張出手合法，清掉上一回合護盾／狀態並保留雷量', () => {
    const s = fixture(['guard', 'evade'], { thunder: 2 })
    const r = resolveTurn(s, plan(s, [['evade', 0], ['guard', 3]])).nextState
    expect(r.player.shield).toBe(6)
    const n = nextRound(r)
    expect(n.player).toMatchObject({ shield: 0, thunder: 2, evade: false, thorns: false })
    expect(n.enemy.shield).toBe(0)
    expect(n.round).toBe(2)
  })
  it('牌庫不足5張時抽至可抽完，空牌庫也可續戰', () => {
    const s = fixture(['guard'])
    const n = nextRound(resolveTurn(s, []).nextState)
    expect(n.hand).toHaveLength(1)
    n.hand = []; n.drawPile = []; n.discardPile = []
    expect(nextRound(n).hand).toHaveLength(0)
  })
  it('同種子相同決策重現，抽洗牌真的發生', () => {
    const play = () => {
      let s = createGame({ seed: 'repeat', mode: 'standard', tutorial: false })
      for (let i = 0; i < 3; i++) s = nextRound(resolveTurn(s, []).nextState)
      return s
    }
    expect(play()).toEqual(play())
    expect(play().round).toBe(4)
    expect(createGame({ seed: 'different', mode: 'standard', tutorial: false }).hand)
      .not.toEqual(createGame({ seed: 'repeat', mode: 'standard', tutorial: false }).hand)
  })
  it('教學從實際牌組取五張，不複製', () => {
    const s = createGame({ seed: 'tutorial', mode: 'classic', tutorial: true })
    expect(s.hand.map(c => c.cardId)).toEqual(['draw_thunder', 'return', 'guard', 'strike', 'evade'])
    expect(new Set(count(s)).size).toBe(10)
    expect(Object.keys(CARDS)).toHaveLength(8)
    expect(createGame({ seed: '', mode: 'standard', tutorial: false }).enemy.maxHp).toBe(48)
  })
  it('死亡後不能再出手或進入下一回合', () => {
    const s = fixture(['strike'], { enemyHp: 1 })
    const dead = resolveTurn(s, plan(s, [['strike', 0]])).nextState
    expect(() => resolveTurn(dead, [])).toThrow()
    expect(() => nextRound(dead)).toThrow()
  })
  it('未結算就不能直接抽下一回合', () => {
    expect(() => nextRound(createGame({ seed: 'a', mode: 'standard', tutorial: false }))).toThrow()
  })
  it('拒絕重複實體、四張、不存在的卡及非法插槽', () => {
    const s = createGame({ seed: 'invalid', mode: 'standard', tutorial: true })
    const one = { instanceId: s.hand[0].instanceId, slot: 0 }
    expect(() => resolveTurn(s, [one, one])).toThrow()
    expect(() => resolveTurn(s, s.hand.slice(0, 4).map(c => ({ instanceId: c.instanceId, slot: 0 })))).toThrow()
    expect(() => resolveTurn(s, [{ instanceId: 'absent', slot: 0 }])).toThrow()
    for (const slot of [-1, 4, 1.5, NaN]) expect(() => resolveTurn(s, [{ ...one, slot }])).toThrow()
  })
  it('種子與洗牌是決定性的，不修改輸入', () => {
    const a = [1, 2, 3, 4, 5, 6]
    const copy = [...a]
    const first = shuffle(a, seedHash('seed'))
    expect(first).toEqual(shuffle(a, seedHash('seed')))
    expect(a).toEqual(copy)
    expect(first.rng).not.toBe(seedHash('seed'))
    expect([...first.items].sort()).toEqual(a)
  })
})
