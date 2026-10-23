import { describe, expect, it } from 'vitest'
import { applyDuelMove, chooseDuelMove, createDuel, nextDuelRound, passDuel, placeDuelCard, previewDuel, resolveDuel } from './duel'
import type { DuelState } from './duel'
import type { CardId, Side } from './types'

const sides: Side[] = ['player', 'enemy']
function fixture(player: CardId[], enemy: CardId[], first: Side = 'player'): DuelState {
  const s = createDuel('fixture', first)
  for (const side of sides) {
    s.decks[side].hand = (side === 'player' ? player : enemy).map((cardId, i) => ({ cardId, instanceId: `${side}-${i}` }))
    s.decks[side].drawPile = []; s.decks[side].discardPile = []
  }
  return s
}
function put(s: DuelState, side: Side, id: CardId, index = s.timeline.length): DuelState {
  const c = s.decks[side].hand.find(c => c.cardId === id && !s.timeline.some(p => p.instanceId === c.instanceId))!
  return placeDuelCard(s, side, c.instanceId, index)
}
function ready(state: DuelState): DuelState {
  let s = state
  while (s.status === 'placing') s = passDuel(s, s.activeSide!)
  return s
}
const identities = (s: DuelState) => sides.flatMap(side => {
  const d = s.decks[side]
  return [...d.hand, ...d.drawPile, ...d.discardPile].map(c => c.instanceId)
}).sort()

describe('公平交手編排規則', () => {
  it('雙方45生命、相同10張組成，各抽5，先手不影響牌序', () => {
    const s = createDuel('fair')
    expect(s.player).toEqual(s.enemy)
    expect(s.player.hp).toBe(45)
    for (const side of sides) {
      expect(s.decks[side].hand).toHaveLength(5)
      expect([...s.decks[side].hand, ...s.decks[side].drawPile].map(c => c.cardId).sort()).toEqual([...s.decks.player.hand, ...s.decks.player.drawPile].map(c => c.cardId).sort())
    }
    expect(new Set(identities(s)).size).toBe(20)
    expect(createDuel('fair', 'enemy').decks).toEqual(s.decks)
  })
  it('每次插一張、既有相對順序鎖定，牌留在手中但不能重出', () => {
    let s = fixture(['channel', 'return'], ['draw_thunder'])
    s = put(s, 'player', 'channel')
    s = put(s, 'enemy', 'draw_thunder')
    s = put(s, 'player', 'return', 1)
    expect(s.timeline.map(c => c.cardId)).toEqual(['channel', 'return', 'draw_thunder'])
    expect(s.decks.player.hand).toHaveLength(2)
    const r = resolveDuel(s)
    expect(r.events.find(e => e.label === '奉還' && e.effect === 'attack')?.reason).toContain('10')
    expect(r.events.find(e => e.label === '引雷印')?.amount).toBe(0)
    expect(r.nextState.enemy.hp).toBe(35)
    let t = fixture(['strike', 'guard'], ['guard', 'strike'])
    t = put(t, 'player', 'strike'); t = put(t, 'enemy', 'guard')
    expect(() => placeDuelCard(t, 'player', 'player-0', 0)).toThrow()
    expect(t.timeline.map(c => c.instanceId)).toEqual(['player-0', 'enemy-0'])
  })
  it('拒絕錯方、非法索引、不在手牌與第四張', () => {
    let s = fixture(['guard', 'guard', 'guard', 'guard'], ['guard', 'guard', 'guard', 'guard'])
    expect(() => placeDuelCard(s, 'enemy', 'enemy-0', 0)).toThrow()
    expect(() => placeDuelCard(s, 'player', 'missing', 0)).toThrow()
    for (const index of [-1, 1, 0.5, NaN]) expect(() => placeDuelCard(s, 'player', 'player-0', index)).toThrow()
    s = passDuel(s, 'player')
    expect(() => passDuel(s, 'player')).toThrow()
    for (let i = 0; i < 3; i++) s = put(s, 'enemy', 'guard')
    expect(s.status).toBe('ready')
    expect(() => put(s, 'enemy', 'guard')).toThrow()
  })
  it('雙方pass或空手自動ready，單方停止後另一方仍可連出', () => {
    expect(ready(createDuel('pass')).status).toBe('ready')
    let s = fixture([], ['guard', 'strike'])
    s = passDuel(s, 'player')
    s = put(s, 'enemy', 'guard'); expect(s.activeSide).toBe('enemy')
    s = put(s, 'enemy', 'strike'); expect(s.status).toBe('ready')
    const empty = fixture([], [])
    expect(passDuel(empty, 'player').status).toBe('ready')
  })
  it('兩方各自最多三張，第7回合後也不單方增傷', () => {
    let s = fixture(['strike', 'strike', 'strike', 'strike'], ['strike', 'strike', 'strike', 'strike'])
    s.round = 8
    for (let i = 0; i < 3; i++) { s = put(s, 'player', 'strike'); s = put(s, 'enemy', 'strike') }
    expect(s.status).toBe('ready')
    expect(s.timeline.filter(c => c.side === 'player')).toHaveLength(3)
    expect(s.timeline.filter(c => c.side === 'enemy')).toHaveLength(3)
    const r = resolveDuel(s)
    expect(r.nextState.player.hp).toBe(27); expect(r.nextState.enemy.hp).toBe(27)
  })
})

describe('雙方同效與事件因果', () => {
  it.each(['strike', 'guard', 'draw_thunder', 'return', 'steal_armor', 'thorns', 'evade', 'channel'] as CardId[])('%s鏡像同效', id => {
    const left = fixture([id], []); left.player.thunder = 2; left.enemy.thunder = 3; left.enemy.shield = 4
    const right = fixture([], [id], 'enemy'); right.enemy.thunder = 2; right.player.thunder = 3; right.player.shield = 4
    const a = resolveDuel(ready(put(left, 'player', id))).nextState
    const b = resolveDuel(ready(put(right, 'enemy', id))).nextState
    expect(a.player).toEqual(b.enemy); expect(a.enemy).toEqual(b.player)
  })
  it.each(sides)('%s全擋仍倒刺，反傷受盾抵扣且不被閃避取消、不遞迴', side => {
    const attacker: Side = side === 'player' ? 'enemy' : 'player'
    let s = fixture(['strike'], ['strike'], attacker)
    s[side].shield = 6; s[side].thorns = true
    s[attacker].shield = 4; s[attacker].evade = true; s[attacker].thorns = true
    s = put(s, attacker, 'strike')
    const r = resolveDuel(ready(s))
    expect(r.nextState[side].hp).toBe(45)
    expect(r.nextState[attacker].hp).toBe(43)
    expect(r.events.filter(e => e.effect === 'reflect')).toHaveLength(1)
    expect(r.events.find(e => e.effect === 'reflect')?.after[attacker].evade).toBe(true)
    for (let i = 1; i < r.events.length; i++) expect(r.events[i].before).toEqual(r.events[i - 1].after)
  })
  it.each(sides)('%s閃避不觸發倒刺，奉還先耗雷', side => {
    const attacker: Side = side === 'player' ? 'enemy' : 'player'
    let s = fixture(['return'], ['return'], attacker)
    s[side].evade = true; s[side].thorns = true; s[attacker].thunder = 6
    s = put(s, attacker, 'return')
    const r = resolveDuel(ready(s))
    expect(r.nextState[side].hp).toBe(45)
    expect(r.nextState[attacker].thunder).toBe(0)
    expect(r.events.filter(e => e.effect === 'reflect')).toHaveLength(0)
    expect(r.events[0].effect).toBe('thunder')
  })
  it.each(sides)('%s死亡不倒刺，停止其後卡與任何敵方事件', side => {
    const attacker: Side = side === 'player' ? 'enemy' : 'player'
    let s = fixture(['strike', 'channel'], ['strike', 'channel'], attacker)
    s[side].hp = 1; s[side].thorns = true
    s = put(s, attacker, 'strike'); s = put(s, side, 'channel')
    const r = resolveDuel(ready(s))
    expect(r.nextState.status).toBe(side === 'player' ? 'lost' : 'won')
    expect(r.events.filter(e => e.effect === 'reflect')).toHaveLength(0)
    expect(r.events.some(e => e.label === '汲能')).toBe(false)
    expect(r.events.at(-1)?.effect).toBe('defeat')
  })
  it('反傷致死立即停止，保留20張實體且終局不得再抽牌', () => {
    let s = createDuel('reflect-death')
    const card = s.decks.player.hand[0]
    card.cardId = 'strike'; s.enemy.thorns = true; s.player.hp = 5
    const original = identities(s)
    s = placeDuelCard(s, 'player', card.instanceId, 0)
    const r = resolveDuel(ready(s))
    expect(r.nextState.status).toBe('lost')
    expect(r.events.map(e => e.effect)).toEqual(['attack', 'reflect', 'defeat'])
    expect(identities(r.nextState)).toEqual(original)
    expect(() => nextDuelRound(r.nextState)).toThrow()
  })
  it('借甲最多六盾，重複避鋒與倒刺不疊加', () => {
    let s = fixture(['steal_armor', 'evade', 'evade'], [])
    s.enemy.shield = 10
    s = put(s, 'player', 'steal_armor'); s = put(s, 'player', 'evade'); s = put(s, 'player', 'evade')
    const r = resolveDuel(s)
    expect(r.events[0].amount).toBe(6)
    expect(r.nextState.player).toMatchObject({ shield: 6, evade: true })
    expect(r.nextState.enemy.shield).toBe(4)
    let t = fixture(['thorns', 'thorns'], ['strike', 'strike'])
    t = put(t, 'player', 'thorns'); t = put(t, 'enemy', 'strike')
    t = put(t, 'player', 'thorns', 0); t = put(t, 'enemy', 'strike')
    const result = resolveDuel(t)
    expect(result.events.filter(e => e.effect === 'reflect')).toHaveLength(1)
    expect(result.nextState.player.hp).toBe(33)
    expect(result.nextState.enemy.hp).toBe(39)
  })
  it('引雷只轉容量內實際雷、滿雷零效；無資源轉移與無雷奉還合法', () => {
    let s = fixture(['draw_thunder', 'channel', 'return'], [])
    s.player.thunder = 5; s.enemy.thunder = 3
    s = put(s, 'player', 'draw_thunder'); s = put(s, 'player', 'channel'); s = put(s, 'player', 'return')
    const r = resolveDuel(s)
    expect(r.events.find(e => e.label === '引雷印')?.amount).toBe(1)
    expect(r.events.find(e => e.label === '汲能')?.amount).toBe(0)
    expect(r.nextState.enemy).toMatchObject({ hp: 23, thunder: 2 })
    const noResource = resolveDuel(ready(put(fixture(['draw_thunder'], []), 'player', 'draw_thunder')))
    expect(noResource.events[0].amount).toBe(0)
    expect(resolveDuel(ready(put(fixture(['return'], []), 'player', 'return'))).nextState.enemy.hp).toBe(41)
    const full = fixture(['draw_thunder'], []); full.player.thunder = 6; full.enemy.thunder = 3
    expect(resolveDuel(ready(put(full, 'player', 'draw_thunder'))).nextState.enemy.thunder).toBe(3)
  })
})

describe('純預覽、回合與有限前瞻AI', () => {
  it('preview與正式結算共用結果、不改輸入或RNG；只ready可提交且不得二次提交', () => {
    let s = fixture(['channel'], ['strike'])
    s = put(s, 'player', 'channel')
    const before = structuredClone(s)
    expect(previewDuel(s).nextState.status).toBe('resolved')
    expect(() => resolveDuel(s)).toThrow()
    expect(s).toEqual(before)
    s = ready(s)
    expect(previewDuel(s)).toEqual(resolveDuel(s))
    expect(resolveDuel(s).nextState.decks.player.rng).toBe(s.decks.player.rng)
    expect(() => resolveDuel(resolveDuel(s).nextState)).toThrow()
    expect(() => nextDuelRound(before)).toThrow()
  })
  it('跨回合20張守恆、先手交換、盾避刺清除雷保留、seed重現', () => {
    const run = () => {
      let s = createDuel('replay')
      const cards = identities(s)
      s.player.thunder = 2; s.enemy.thunder = 3
      for (let i = 0; i < 5; i++) {
        const r = resolveDuel(ready(s)).nextState
        for (const side of sides) expect(r.decks[side].hand).toHaveLength(0)
        expect(identities(r)).toEqual(cards)
        r.player.shield = 10; r.player.evade = true; r.enemy.thorns = true
        s = nextDuelRound(r)
        expect(s.firstSide).toBe(i % 2 === 0 ? 'enemy' : 'player')
        expect(s.activeSide).toBe(s.firstSide)
        expect(s.player).toMatchObject({ shield: 0, evade: false, thunder: 2 })
        expect(s.enemy).toMatchObject({ thorns: false, thunder: 3 })
        expect(identities(s)).toEqual(cards)
      }
      return s
    }
    expect(run()).toEqual(run())
  })
  it('同seed相同逐手決策可重播多輪，獨立牌庫各自守恆10張', () => {
    const run = () => {
      let s = createDuel('ai-replay')
      for (let round = 0; round < 4 && s.status === 'placing'; round++) {
        while (s.status === 'placing') s = applyDuelMove(s, chooseDuelMove(s))
        s = resolveDuel(s).nextState
        for (const side of sides) {
          const d = s.decks[side]
          expect([...d.hand, ...d.drawPile, ...d.discardPile]).toHaveLength(10)
        }
        if (s.status === 'resolved') s = nextDuelRound(s)
      }
      return s
    }
    expect(run()).toEqual(run())
  })
  it('AI合法、重現、不讀未來牌序及RNG，能處理pass與用完牌', () => {
    const s = createDuel('ai', 'enemy')
    const before = structuredClone(s)
    const move = chooseDuelMove(s)
    expect(() => applyDuelMove(s, move)).not.toThrow()
    expect(chooseDuelMove(s)).toEqual(move)
    const hidden = structuredClone(s)
    for (const side of sides) { hidden.decks[side].drawPile.reverse(); hidden.decks[side].rng = 0 }
    expect(chooseDuelMove(hidden)).toEqual(move)
    expect(s).toEqual(before)
    expect(chooseDuelMove(fixture([], ['guard']))).toEqual({ side: 'player', kind: 'pass' })
    expect(() => chooseDuelMove(ready(s))).toThrow()
    let t = s
    for (let i = 0; i < 8 && t.status === 'placing'; i++) t = applyDuelMove(t, chooseDuelMove(t))
    expect(t.status).toBe('ready')
  })
  it('AI有回應前瞻：對手有借甲時不盲目先放護盾', () => {
    const s = fixture(['guard', 'strike'], ['steal_armor'])
    expect(chooseDuelMove(s)).toMatchObject({ kind: 'place', instanceId: 'player-1' })
  })
})
