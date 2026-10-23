import { BALANCE, CARDS, STARTING_DECK } from './data'
import { seedHash, shuffle } from './rng'
import type { Card, CardId, CombatEvent, Fighter, Resources, Side } from './types'

export type { Side } from './types'
export interface DuelDeck { hand: Card[]; drawPile: Card[]; discardPile: Card[]; rng: number }
export interface DuelTimelineCard { side: Side; instanceId: string; cardId: CardId }
export type DuelMove = { side: Side; kind: 'place'; instanceId: string; index: number } | { side: Side; kind: 'pass' }
export interface DuelState {
  player: Fighter; enemy: Fighter; decks: Record<Side, DuelDeck>; timeline: DuelTimelineCard[]
  round: number; seed: string; firstSide: Side; activeSide: Side | null
  status: 'placing' | 'ready' | 'resolved' | 'won' | 'lost'
  passed: Record<Side, boolean>; moves: DuelMove[]
}
export interface DuelResolution { nextState: DuelState; events: CombatEvent[] }

const sides: Side[] = ['player', 'enemy']
const other = (side: Side): Side => side === 'player' ? 'enemy' : 'player'
const fighter = (): Fighter => ({ hp: 45, maxHp: 45, shield: 0, thunder: 0, evade: false, thorns: false })
const snapshot = (s: DuelState): Resources => ({ player: { ...s.player }, enemy: { ...s.enemy } })
const available = (s: DuelState, side: Side): Card[] => s.decks[side].hand.filter(c => !s.timeline.some(p => p.side === side && p.instanceId === c.instanceId))

function draw(deck: DuelDeck): void {
  while (deck.hand.length < BALANCE.handSize) {
    if (!deck.drawPile.length) {
      if (!deck.discardPile.length) break
      const shuffled = shuffle(deck.discardPile, deck.rng)
      deck.rng = shuffled.rng; deck.drawPile = shuffled.items; deck.discardPile = []
    }
    deck.hand.push(deck.drawPile.shift()!)
  }
}

function updateActive(s: DuelState, preferred: Side): void {
  for (const side of sides) {
    if (s.timeline.filter(c => c.side === side).length >= BALANCE.maxCards || available(s, side).length === 0) s.passed[side] = true
  }
  if (s.passed.player && s.passed.enemy) {
    s.status = 'ready'; s.activeSide = null
  } else s.activeSide = s.passed[preferred] ? other(preferred) : preferred
}

export function createDuel(inputSeed: string, firstSide: Side = 'player'): DuelState {
  const seed = inputSeed.trim().slice(0, 80) || 'SUMERU'
  function deck(side: Side): DuelDeck {
    const cards = STARTING_DECK.map((cardId, i) => ({ cardId, instanceId: `${side}-${i}` }))
    const shuffled = shuffle(cards, seedHash(`${seed}:${side}`))
    const d = { hand: [], drawPile: shuffled.items, discardPile: [], rng: shuffled.rng }
    draw(d)
    return d
  }
  return {
    player: fighter(), enemy: fighter(), decks: { player: deck('player'), enemy: deck('enemy') },
    timeline: [], round: 1, seed, firstSide, activeSide: firstSide, status: 'placing',
    passed: { player: false, enemy: false }, moves: [],
  }
}

function assertActive(s: DuelState, side: Side): void {
  if (s.status !== 'placing' || s.activeSide !== side || s.passed[side]) throw new Error('目前不是此方的落牌時機。')
}

export function placeDuelCard(state: DuelState, side: Side, instanceId: string, index: number): DuelState {
  assertActive(state, side)
  if (!Number.isInteger(index) || index < 0 || index > state.timeline.length) throw new Error('插入位置超出目前時間軌道。')
  if (state.timeline.filter(c => c.side === side).length >= BALANCE.maxCards) throw new Error('每方每回合最多三張牌。')
  const card = available(state, side).find(c => c.instanceId === instanceId)
  if (!card) throw new Error('此實體牌不在可用手牌中，或已經落牌。')
  const s = structuredClone(state)
  s.timeline.splice(index, 0, { side, ...card })
  s.moves.push({ side, kind: 'place', instanceId, index })
  updateActive(s, other(side))
  return s
}

export function passDuel(state: DuelState, side: Side): DuelState {
  assertActive(state, side)
  const s = structuredClone(state)
  s.passed[side] = true
  s.moves.push({ side, kind: 'pass' })
  updateActive(s, other(side))
  return s
}

/** The only card resolver, shared by live commits, previews and AI evaluation. */
function resolveTimeline(state: DuelState): DuelResolution {
  const s = structuredClone(state)
  s.status = 'resolved'; s.activeSide = null
  const events: CombatEvent[] = []
  let mainIndex = -1
  function event(actor: Side | 'system', target: Side | 'both', effect: CombatEvent['effect'], label: string, reason: string, amount: number, change: () => void): void {
    const before = snapshot(s)
    change()
    events.push({ index: events.length, mainIndex, actor, target, effect, label, reason, amount, before, after: snapshot(s) })
  }
  function checkDeath(): boolean {
    if (s.player.hp > 0 && s.enemy.hp > 0) return false
    s.status = s.player.hp === 0 ? 'lost' : 'won'
    event('system', 'both', 'defeat', s.status === 'won' ? '對手敗退' : '你已倒下', '死亡即停止後續事件；戰鬥資源歸零。', 0, () => {
      for (const side of sides) Object.assign(s[side], { thunder: 0, shield: 0, evade: false, thorns: false })
    })
    return true
  }
  function damage(actor: Side, power: number, label: string, reflection = false): void {
    const target = other(actor)
    const defender = s[target]
    const canceled = !reflection && defender.evade
    const blocked = canceled ? 0 : Math.min(defender.shield, power)
    const loss = canceled ? 0 : Math.min(defender.hp, power - blocked)
    event(actor, target, reflection ? 'reflect' : 'attack', label,
      canceled ? `攻擊 ${power}；避鋒取消傷害，不觸發倒刺。`
        : `${reflection ? '反傷' : '攻擊'} ${power}，護盾抵扣 ${blocked}，失去 ${loss} 生命。`, loss, () => {
        if (reflection) s[actor].thorns = false
        if (canceled) defender.evade = false
        else { defender.shield -= blocked; defender.hp -= loss }
      })
    if (checkDeath()) return
    if (!reflection && !canceled && defender.thorns) damage(target, 6, '倒刺反擊', true)
  }
  for (const card of s.timeline) {
    if (s.status !== 'resolved') break
    mainIndex++
    const actor = card.side
    const target = other(actor)
    const own = s[actor], opponent = s[target]
    const label = CARDS[card.cardId].name
    switch (card.cardId) {
      case 'strike': damage(actor, 6, label); break
      case 'guard': event(actor, actor, 'shield', label, '取得 6 護盾；下回合開始清除。', 6, () => { own.shield += 6 }); break
      case 'draw_thunder': {
        const amount = Math.min(3, opponent.thunder, BALANCE.thunderCap - own.thunder)
        event(actor, 'both', 'transfer', label, amount ? `轉移 ${amount} 雷。` : own.thunder === BALANCE.thunderCap ? '自身雷量已滿，不轉移也不扣敵雷。' : '對手當下沒有雷量，轉移為零。', amount, () => {
          opponent.thunder -= amount; own.thunder += amount
        })
        break
      }
      case 'return': {
        const spent = own.thunder
        event(actor, actor, 'thunder', '奉還蓄勢', `消耗 ${spent} 雷，攻擊力 ${4 + 3 * spent}。`, spent, () => { own.thunder = 0 })
        damage(actor, 4 + 3 * spent, label)
        break
      }
      case 'steal_armor': {
        const amount = Math.min(6, opponent.shield)
        event(actor, 'both', 'transfer', label, amount ? `轉移 ${amount} 護盾。` : '對手當下沒有護盾，轉移為零。', amount, () => { opponent.shield -= amount; own.shield += amount })
        break
      }
      case 'thorns': event(actor, actor, 'thorns', label, '下次未閃避的攻擊後，存活則反傷 6；不疊加。', 6, () => { own.thorns = true }); break
      case 'evade': event(actor, actor, 'evade', label, '取消下一次敵方攻擊傷害；不疊加。', 1, () => { own.evade = true }); break
      case 'channel': {
        const amount = Math.min(2, BALANCE.thunderCap - own.thunder)
        event(actor, actor, 'thunder', label, amount ? `取得 ${amount} 雷，跨回合保留。` : '雷量已滿，增加為零。', amount, () => { own.thunder += amount })
        break
      }
    }
  }
  const discard = () => {
    for (const side of sides) {
      s.decks[side].discardPile.push(...s.decks[side].hand)
      s.decks[side].hand = []
    }
  }
  if (s.status === 'resolved') event('system', 'both', 'discard', '回合結束', '雙方已出及未出手牌全部棄置；雷量跨回合保留。', s.decks.player.hand.length + s.decks.enemy.hand.length, discard)
  else discard() // Card conservation is bookkeeping, not a post-death combat event.
  return { nextState: s, events }
}

export function previewDuel(state: DuelState): DuelResolution {
  if (state.status !== 'placing' && state.status !== 'ready') throw new Error('只能試算尚未結算的回合。')
  return resolveTimeline(state)
}

export function resolveDuel(state: DuelState): DuelResolution {
  if (state.status !== 'ready') throw new Error('雙方都結束落牌後才能結算。')
  return resolveTimeline(state)
}

export function nextDuelRound(state: DuelState): DuelState {
  if (state.status !== 'resolved') throw new Error('須先結算，且戰鬥仍在進行。')
  const s = structuredClone(state)
  s.round++; s.firstSide = other(s.firstSide); s.status = 'placing'
  s.timeline = []; s.moves = []; s.passed = { player: false, enemy: false }
  for (const side of sides) {
    Object.assign(s[side], { shield: 0, evade: false, thorns: false })
    draw(s.decks[side])
  }
  updateActive(s, s.firstSide)
  return s
}

export function applyDuelMove(state: DuelState, move: DuelMove): DuelState {
  return move.kind === 'pass' ? passDuel(state, move.side) : placeDuelCard(state, move.side, move.instanceId, move.index)
}

function legalMoves(s: DuelState): DuelMove[] {
  if (s.status !== 'placing' || !s.activeSide) return []
  const side = s.activeSide
  const moves: DuelMove[] = []
  for (const card of available(s, side)) {
    if (s.timeline.filter(c => c.side === side).length >= BALANCE.maxCards) break
    for (let index = 0; index <= s.timeline.length; index++) moves.push({ side, kind: 'place', instanceId: card.instanceId, index })
  }
  moves.push({ side, kind: 'pass' })
  return moves
}

function score(s: DuelState, side: Side): number {
  const a = s[side], b = s[other(side)]
  if (a.hp <= 0) return -10000
  if (b.hp <= 0) return 10000
  const value = (f: Fighter) => f.hp + 0.8 * f.thunder + 0.15 * f.shield + 0.6 * Number(f.evade) + 0.6 * Number(f.thorns)
  return value(a) - value(b)
}

/** Deterministic, bounded two-ply search. It evaluates every insertion and one
 * adversarial reply, not the full game tree. Future deck order and PRNG state
 * are deliberately excluded from the search's input. */
export function chooseDuelMove(state: DuelState): DuelMove {
  if (state.status !== 'placing' || !state.activeSide) throw new Error('目前沒有可決策的落牌方。')
  const side = state.activeSide
  const publicDeck = (who: Side): DuelDeck => ({ hand: state.decks[who].hand.map(c => ({ ...c })), drawPile: [], discardPile: [], rng: 0 })
  const visible: DuelState = {
    player: { ...state.player }, enemy: { ...state.enemy }, decks: { player: publicDeck('player'), enemy: publicDeck('enemy') },
    timeline: state.timeline.map(c => ({ ...c })), round: state.round, seed: '', firstSide: state.firstSide,
    activeSide: side, status: state.status, passed: { ...state.passed }, moves: [],
  }
  const candidates = legalMoves(visible)
  let best = candidates[0], bestScore = -Infinity
  for (const move of candidates) {
    const next = applyDuelMove(visible, move)
    let value: number
    if (next.status === 'placing' && next.activeSide === other(side)) {
      value = Infinity
      for (const reply of legalMoves(next)) value = Math.min(value, score(previewDuel(applyDuelMove(next, reply)).nextState, side))
    } else value = score(previewDuel(next).nextState, side)
    if (value > bestScore) { best = move; bestScore = value }
  }
  return best
}
