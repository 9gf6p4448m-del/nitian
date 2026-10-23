import { describe, expect, it } from 'vitest'
import { createDuel, nextDuelRound, previewDuel } from './duel'
import type { DuelState } from './duel'
import { createLesson, explainEvent, explainTimeline } from './explanations'
import type { CardId, Side } from './types'

const sides: Side[] = ['player', 'enemy']
function fixture(sequence: [Side, CardId][]): DuelState {
  const state = createDuel('explanation-fixture')
  for (const side of sides) {
    const deck = state.decks[side]
    deck.drawPile.push(...deck.hand)
    deck.hand = []
  }
  for (const [side, cardId] of sequence) {
    const deck = state.decks[side]
    const index = deck.drawPile.findIndex(card => card.cardId === cardId)
    if (index < 0) throw new Error('示例牌不足')
    const [card] = deck.drawPile.splice(index, 1)
    deck.hand.push(card)
    state.timeline.push({ side, ...card })
  }
  return state
}
const identities = (state: DuelState) => sides.flatMap(side => {
  const deck = state.decks[side]
  return [...deck.hand, ...deck.drawPile, ...deck.discardPile].map(card => card.instanceId)
}).sort()

describe('倒刺示範使用實際結算', () => {
  it.each([
    ['before', 39, 39, ['thorns', 'strike']],
    ['after', 39, 45, ['strike', 'thorns']],
    ['blocked', 45, 39, ['guard', 'thorns', 'strike']],
    ['evaded', 45, 45, ['thorns', 'evade', 'strike']],
  ] as const)('%s 的生命與順序正確，保留20張實體', (kind, playerHp, enemyHp, order) => {
    const { state, result } = createLesson(kind)
    expect(state.timeline.map(card => card.cardId)).toEqual(order)
    expect(result).toEqual(previewDuel(state))
    expect(result.nextState.player.hp).toBe(playerHp)
    expect(result.nextState.enemy.hp).toBe(enemyHp)
    expect(identities(state)).toHaveLength(20)
    expect(new Set(identities(state)).size).toBe(20)
    expect(identities(result.nextState)).toEqual(identities(state))
    for (const card of state.timeline) expect(state.decks[card.side].hand).toContainEqual({ cardId: card.cardId, instanceId: card.instanceId })
  })
  it('完全格擋仍反擊；閃避取消攻擊且不觸發倒刺', () => {
    const blocked = createLesson('blocked')
    expect(blocked.result.nextState.player.shield).toBe(0)
    const blockedRows = explainTimeline(blocked.state.timeline, blocked.result.events)
    expect(blockedRows[2].detail).toContain('攻擊6／護盾擋6／實傷0')
    expect(blockedRows[1].detail).toContain('同回合已反傷6')
    const evaded = createLesson('evaded')
    const rows = explainTimeline(evaded.state.timeline, evaded.result.events)
    expect(evaded.result.events.some(event => event.effect === 'reflect')).toBe(false)
    expect(rows[1].detail).toContain('避鋒已閃避')
    expect(rows[0].detail).toContain('未等到有效攻擊，下回合清除')
  })
})

describe('逐張牌的因果解說', () => {
  it('反傷歸屬觸發攻擊的附屬事件，不把對手倒刺當成玩家的招式', () => {
    const state = fixture([['enemy', 'thorns'], ['player', 'strike'], ['player', 'guard'], ['enemy', 'channel']])
    state.player.hp = 4
    const { events } = previewDuel(state)
    const rows = explainTimeline(state.timeline, events)
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({ index: 0, side: 'enemy', cardId: 'thorns' })
    expect(rows[0].detail).toContain('同回合已反傷6')
    expect(rows[1].detail).toContain('觸發對方倒刺，受到反傷6')
    expect(rows[1].detail).toContain('實傷4')
    expect(rows[1].tone).toBe('warning')
    expect(rows[2].detail).toBe('前面死亡，此招未執行')
    expect(rows[3].detail).toBe('前面死亡，此招未執行')
  })
  it('晚放的倒刺、避鋒及護盾明示本回合沒用到與下回合時效', () => {
    const state = fixture([['enemy', 'strike'], ['player', 'guard'], ['player', 'guard'], ['player', 'thorns'], ['enemy', 'evade']])
    const result = previewDuel(state)
    const rows = explainTimeline(state.timeline, result.events)
    expect(rows[1].detail).toContain('護盾未擋到傷害，下回合清除')
    expect(rows[2].detail).toContain('護盾未擋到傷害，下回合清除')
    expect(rows[3].detail).toContain('未等到有效攻擊，下回合清除')
    expect(rows[4].detail).toContain('本回合未用到')
    const lateEvade = fixture([['enemy', 'strike'], ['player', 'evade']])
    expect(explainTimeline(lateEvade.timeline, previewDuel(lateEvade).events)[1].detail).toContain('放在攻擊後，本回合未用到')
    expect(result.nextState.player.shield).toBe(12)
    expect(nextDuelRound(result.nextState).player.shield).toBe(0)
  })
  it('播放中的事件前綴不提前宣告未觸發或死亡', () => {
    const { state, result } = createLesson('before')
    const empty = explainTimeline(state.timeline, [], false)
    expect(empty.every(row => row.detail === '尚未執行')).toBe(true)
    const prefix = explainTimeline(state.timeline, result.events.slice(0, 1), false)
    expect(prefix[0].detail).toContain('倒刺待命')
    expect(prefix[0].detail).not.toContain('未等到')
    expect(prefix[1].detail).toBe('尚未執行')
    const attackOnly = explainTimeline(state.timeline, result.events.slice(0, 2), false)
    expect(attackOnly[0].detail).toContain('倒刺待命')
    expect(attackOnly[1].detail).not.toContain('反傷')
  })
  it('受擊死亡時無法反擊，不把終局誤說成下回合待命', () => {
    const state = fixture([['player', 'thorns'], ['enemy', 'strike']])
    state.player.hp = 4
    const rows = explainTimeline(state.timeline, previewDuel(state).events)
    expect(rows[0].detail).toContain('受擊死亡，未能反擊')
    expect(rows[0].detail).not.toContain('下回合')
  })
  it('反傷被盾抵扣時分清原威力與實傷', () => {
    const { state } = createLesson('before')
    state.enemy.shield = 4
    const rows = explainTimeline(state.timeline, previewDuel(state).events)
    expect(rows[0].detail).toContain('同回合已反傷6')
    expect(rows[1].detail).toContain('護盾擋4／實傷2')
  })
  it('空事件與空軌道可處理，且分析不改輸入', () => {
    const { state, result } = createLesson('before')
    const original = structuredClone({ state, result })
    expect(explainTimeline([], [])).toEqual([])
    expect(explainTimeline(state.timeline, [])[0].detail).toBe('尚未執行')
    explainTimeline(state.timeline, result.events)
    result.events.forEach(explainEvent)
    expect({ state, result }).toEqual(original)
  })
  it('以快照計算傷害，不信任 amount 與中文 reason', () => {
    const { state, result } = createLesson('blocked')
    const events = structuredClone(result.events)
    for (const event of events) { event.reason = '攻擊999，護盾999'; event.amount = 999 }
    const rows = explainTimeline(state.timeline, events)
    expect(rows[2].detail).toContain('攻擊6／護盾擋6／實傷0')
    expect(rows[2].detail).not.toContain('999')
    expect(explainEvent(events[2]).detail).toContain('實傷0')
  })
  it('護身分別追蹤實際擋傷，晚取得的盾不冒領前面的格擋', () => {
    const state = fixture([['player', 'guard'], ['enemy', 'strike'], ['player', 'guard']])
    const rows = explainTimeline(state.timeline, previewDuel(state).events)
    expect(rows[0].detail).toContain('護盾擋6')
    expect(rows[2].detail).toContain('護盾未擋到傷害，下回合清除')
  })
})

describe('逐事件解說', () => {
  it.each([
    ['draw_thunder', 0, '對手當下沒有雷量'],
    ['steal_armor', 0, '對手當下沒有護盾'],
    ['channel', 6, '自身雷量已滿'],
  ] as const)('%s 零效果說明當下資源原因', (cardId, thunder, reason) => {
    const state = fixture([['player', cardId]])
    state.player.thunder = thunder
    const event = previewDuel(state).events[0]
    event.reason = '不應依賴此文字'
    expect(explainEvent(event).detail).toContain(reason)
    expect(explainTimeline(state.timeline, [event])[0].detail).toContain(reason)
  })
  it('反傷寫明雙方、同回合接續觸發及不耗新牌', () => {
    const { result } = createLesson('before')
    const reflected = result.events.find(event => event.effect === 'reflect')!
    const explanation = explainEvent(reflected)
    expect(explanation.title).toContain('你 → 對手')
    expect(explanation.detail).toContain('同回合接續觸發，不耗新牌')
    expect(explanation.detail).toContain('對手生命45→39')
  })
  it('護盾、雷量轉移與奉還耗雷寫出快照差值', () => {
    const state = fixture([['player', 'channel'], ['enemy', 'draw_thunder'], ['player', 'guard'], ['enemy', 'steal_armor'], ['enemy', 'return']])
    const { events } = previewDuel(state)
    const details = events.map(event => explainEvent(event).detail).join('；')
    expect(details).toContain('你的雷量0→2')
    expect(details).toContain('對手雷量0→2')
    expect(details).toContain('你的護盾6→0')
    expect(details).toContain('對手雷量2→0')
  })
  it('死亡與棄牌等系統事件具明確文字', () => {
    const { result } = createLesson('after')
    expect(explainEvent(result.events.at(-1)!).detail).toContain('回合結束')
    const state = fixture([['player', 'strike']])
    state.enemy.hp = 1
    const death = previewDuel(state).events.at(-1)!
    expect(explainEvent(death).detail).toContain('死亡即停止後續招式')
  })
})
