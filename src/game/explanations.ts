import { BALANCE, CARDS } from './data'
import { createDuel, previewDuel } from './duel'
import type { DuelResolution, DuelState, DuelTimelineCard } from './duel'
import type { CardId, CombatEvent, Side } from './types'

export interface TimelineExplanation {
  index: number
  side: Side
  cardId: CardId
  title: string
  detail: string
  tone: 'normal' | 'good' | 'warning'
}
export type LessonKind = 'before' | 'after' | 'blocked' | 'evaded'

const sides: Side[] = ['player', 'enemy']
const who = (side: Side | 'system' | 'both') => side === 'player' ? '你' : side === 'enemy' ? '對手' : side === 'both' ? '雙方' : '系統'
const possessive = (side: Side) => side === 'player' ? '你的' : '對手'
const hpLoss = (event: CombatEvent, side: Side) => Math.max(0, event.before[side].hp - event.after[side].hp)
const shieldLoss = (event: CombatEvent, side: Side) => Math.max(0, event.before[side].shield - event.after[side].shield)
const isDamage = (event: CombatEvent) => event.effect === 'attack' || event.effect === 'reflect'

function damageDetail(event: CombatEvent): string {
  if (event.target === 'both') return ''
  const target = event.target
  const loss = hpLoss(event, target)
  const blocked = shieldLoss(event, target)
  if (event.effect === 'attack' && event.before[target].evade && !event.after[target].evade) return '避鋒取消攻擊／護盾擋0／實傷0，不觸發倒刺'
  // A lethal snapshot contains only the remaining HP, not the attack's overkill.
  // Keep that distinction instead of reconstructing power from reason text.
  const attack = event.effect === 'reflect' ? '反傷6' : event.after[target].hp > 0 ? `攻擊${blocked + loss}` : '致命攻擊'
  return `${attack}／護盾擋${blocked}／實傷${loss}`
}

function unchangedResourcesDetail(event: CombatEvent): string {
  if (event.actor === 'system') return '資源沒有變化'
  const own = event.before[event.actor]
  if ((event.label === CARDS.channel.name || event.label === CARDS.draw_thunder.name) && own.thunder === BALANCE.thunderCap) return '自身雷量已滿，雷量沒有增加'
  const opponent = event.before[event.actor === 'player' ? 'enemy' : 'player']
  if (event.label === CARDS.draw_thunder.name && opponent.thunder === 0) return '對手當下沒有雷量，轉移為零'
  if (event.label === CARDS.steal_armor.name && opponent.shield === 0) return '對手當下沒有護盾，轉移為零'
  return '資源沒有變化'
}

/** Explain recorded state changes; reason and amount are never used as damage data. */
export function explainEvent(event: CombatEvent): { title: string; detail: string } {
  const changes: string[] = []
  for (const side of sides) {
    for (const [key, label] of [['hp', '生命'], ['shield', '護盾'], ['thunder', '雷量']] as const) {
      if (event.before[side][key] !== event.after[side][key]) changes.push(`${possessive(side)}${label}${event.before[side][key]}→${event.after[side][key]}`)
    }
  }
  let detail: string
  if (isDamage(event)) detail = `${damageDetail(event)}${event.effect === 'reflect' ? '；同回合接續觸發，不耗新牌' : ''}`
  else if (event.effect === 'defeat') detail = '死亡即停止後續招式；戰鬥資源清除'
  else if (event.effect === 'discard') detail = '回合結束；雙方手牌全部棄置，雷量保留；護盾、倒刺與避鋒下回合清除'
  else if (event.effect === 'thorns') detail = '倒刺待命；同回合下次未閃避的攻擊後，存活才反傷；完全格擋仍觸發'
  else if (event.effect === 'evade') detail = '避鋒待命；取消同回合下一次敵方攻擊，不觸發倒刺'
  else if (!changes.length) detail = unchangedResourcesDetail(event)
  else detail = '依本次結算的實際資源變化'
  if (changes.length) detail += `；${changes.join('／')}`
  return { title: `${who(event.actor)} → ${who(event.target)} · ${event.label}`, detail }
}

interface ShieldGrant { index: number | null; amount: number }

/** Each reflection is attached to the attack's mainIndex, while its actor is the defender. */
export function explainTimeline(timeline: DuelTimelineCard[], events: CombatEvent[], complete = true): TimelineExplanation[] {
  const thornsSource: Partial<Record<Side, number>> = {}
  const evadeSource: Partial<Record<Side, number>> = {}
  const reflections = new Map<number, number>()
  const evades = new Set<number>()
  const shieldUsed = new Map<number, number>()
  const grants: Record<Side, ShieldGrant[]> = { player: [], enemy: [] }
  for (const side of sides) {
    const initial = events[0]?.before[side].shield ?? 0
    if (initial) grants[side].push({ index: null, amount: initial })
  }
  for (const event of events) {
    if (event.effect === 'thorns' && event.actor !== 'system') thornsSource[event.actor] = event.mainIndex
    if (event.effect === 'evade' && event.actor !== 'system') evadeSource[event.actor] = event.mainIndex
    if (event.effect === 'reflect' && event.actor !== 'system') {
      const source = thornsSource[event.actor]
      if (source !== undefined) reflections.set(source, (reflections.get(source) ?? 0) + 6)
      delete thornsSource[event.actor]
    }
    if (event.effect === 'attack' && event.target !== 'both' && event.before[event.target].evade && !event.after[event.target].evade) {
      const source = evadeSource[event.target]
      if (source !== undefined) evades.add(source)
      delete evadeSource[event.target]
    }
    for (const side of sides) {
      const gained = event.after[side].shield - event.before[side].shield
      if (gained > 0) grants[side].push({ index: event.mainIndex, amount: gained })
      let removed = Math.max(0, -gained)
      while (removed > 0 && grants[side].length) {
        const grant = grants[side][0]
        const spent = Math.min(removed, grant.amount)
        if (isDamage(event) && grant.index !== null) shieldUsed.set(grant.index, (shieldUsed.get(grant.index) ?? 0) + spent)
        grant.amount -= spent
        removed -= spent
        if (grant.amount === 0) grants[side].shift()
      }
    }
  }
  const death = events.some(event => event.effect === 'defeat')
  return timeline.map((card, index) => {
    const own = events.filter(event => event.mainIndex === index && event.actor === card.side && event.effect !== 'reflect')
    const row: TimelineExplanation = { index, side: card.side, cardId: card.cardId, title: CARDS[card.cardId].name, detail: '', tone: 'normal' }
    if (!own.length) {
      row.detail = complete && death ? '前面死亡，此招未執行' : '尚未執行'
      return row
    }
    if (card.cardId === 'thorns') {
      const reflected = reflections.get(index)
      const killed = events.some(event => event.mainIndex > index && event.effect === 'attack' && event.target === card.side && event.after[card.side].hp === 0)
      if (reflected) row.detail = `同回合已反傷${reflected}；反擊在受擊後立即接續，不耗新牌`
      else if (killed) row.detail = '受擊死亡，未能反擊；戰鬥結束時清除倒刺'
      else if (!complete) row.detail = '倒刺待命'
      else if (death) row.detail = '未等到有效攻擊；戰鬥結束時清除倒刺'
      else row.detail = '倒刺待命；未等到有效攻擊，下回合清除'
      row.tone = reflected ? 'good' : complete ? 'warning' : 'normal'
    } else if (card.cardId === 'evade') {
      const used = evades.has(index)
      const late = events.some(event => event.mainIndex < index && event.effect === 'attack' && event.target === card.side)
      row.detail = used ? '避鋒已閃避；此次攻擊取消，不觸發倒刺' : !complete ? '避鋒待命' : `${late ? '放在攻擊後，本回合未用到' : '本回合未用到'}；避鋒${death ? '戰鬥結束時' : '下回合'}清除`
      row.tone = used ? 'good' : complete ? 'warning' : 'normal'
    } else if (card.cardId === 'guard') {
      const used = shieldUsed.get(index) ?? 0
      const remaining = grants[card.side].filter(grant => grant.index === index).reduce((sum, grant) => sum + grant.amount, 0)
      row.detail = used ? `本回合護盾擋${used}${remaining ? `；剩餘${remaining}盾，下回合清除` : ''}` : !complete ? '護盾待命' : remaining ? '護盾未擋到傷害，下回合清除' : '護盾未擋到傷害；已被移走或在戰鬥結束時清除'
      row.tone = used ? 'good' : complete ? 'warning' : 'normal'
    } else {
      row.detail = own.map(event => explainEvent(event).detail).join('；')
    }
    const reflected = events.filter(event => event.mainIndex === index && event.effect === 'reflect' && event.target === card.side)
    if (reflected.length) {
      row.detail += `；觸發對方倒刺，受到反傷6（護盾擋${reflected.reduce((sum, event) => sum + shieldLoss(event, card.side), 0)}／實傷${reflected.reduce((sum, event) => sum + hpLoss(event, card.side), 0)}）`
      row.tone = 'warning'
    }
    return row
  })
}

/** Teaching fixtures move existing physical cards; they never copy or invent cards. */
export function createLesson(kind: LessonKind): { state: DuelState; result: DuelResolution } {
  const sequence: Record<LessonKind, [Side, CardId][]> = {
    before: [['player', 'thorns'], ['enemy', 'strike']],
    after: [['enemy', 'strike'], ['player', 'thorns']],
    blocked: [['player', 'guard'], ['player', 'thorns'], ['enemy', 'strike']],
    evaded: [['player', 'thorns'], ['player', 'evade'], ['enemy', 'strike']],
  }
  const state = createDuel(`lesson-${kind}`)
  for (const side of sides) {
    const deck = state.decks[side]
    deck.drawPile.push(...deck.hand)
    deck.hand = []
  }
  for (const [side, cardId] of sequence[kind]) {
    const deck = state.decks[side]
    const index = deck.drawPile.findIndex(card => card.cardId === cardId)
    if (index < 0) throw new Error(`教學牌組缺少 ${cardId}`)
    const [card] = deck.drawPile.splice(index, 1)
    deck.hand.push(card)
    state.timeline.push({ side, ...card })
  }
  state.status = 'ready'
  state.activeSide = null
  state.passed = { player: true, enemy: true }
  return { state, result: previewDuel(state) }
}
