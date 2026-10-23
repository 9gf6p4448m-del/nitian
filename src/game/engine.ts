import { BALANCE, MODES, STARTING_DECK, TUTORIAL_HAND } from './data'
import { seedHash, shuffle } from './rng'
import type { Card, CombatEvent, CombatState, Fighter, Intent, Mode, PlannedCard, Resolution, Resources, Side } from './types'

const fighter = (hp: number): Fighter => ({ hp, maxHp: hp, shield: 0, thunder: 0, evade: false, thorns: false })
const snapshot = (s: CombatState): Resources => ({ player: { ...s.player }, enemy: { ...s.enemy } })

function draw(s: CombatState): void {
  while (s.hand.length < BALANCE.handSize) {
    if (!s.drawPile.length) {
      if (!s.discardPile.length) break
      const shuffled = shuffle(s.discardPile, s.rng)
      s.rng = shuffled.rng
      // This named scenario intentionally uses a fixture, never advertised as a PRNG seed.
      s.drawPile = s.mode === 'paper'
        ? shuffled.items.sort((a, b) => Number(a.instanceId.split('-').at(-1)) - Number(b.instanceId.split('-').at(-1)))
        : shuffled.items
      s.discardPile = []
    }
    s.hand.push(s.drawPile.shift()!)
  }
}

export function createGame(options: { seed: string; mode: Mode; tutorial: boolean }): CombatState {
  const seed = options.seed.trim().slice(0, 80) || 'SUMERU'
  const deck: Card[] = STARTING_DECK.map((cardId, i) => ({ cardId, instanceId: `card-${i}` }))
  const shuffled = shuffle(deck, seedHash(seed))
  const s: CombatState = {
    player: fighter(BALANCE.playerHp), enemy: fighter(MODES[options.mode].hp), round: 1,
    seed, rng: shuffled.rng, hand: [], drawPile: shuffled.items, discardPile: [],
    status: 'planning', mode: options.mode, tutorial: options.tutorial,
  }
  if (options.mode === 'paper') s.drawPile = [...deck]
  else if (options.tutorial) {
    for (const id of TUTORIAL_HAND) {
      const i = s.drawPile.findIndex(c => c.cardId === id)
      s.hand.push(s.drawPile.splice(i, 1)[0])
    }
  }
  draw(s)
  return s
}

export function getIntents(round: number): Intent[] {
  const enrage = round >= 7 ? 3 : 0
  return round % 2 === 1 ? [
    { kind: 'charge', value: 3, label: '聚雷', description: '雷量 +3，上限 6' },
    { kind: 'lightning', value: 4 + enrage, label: '雷擊', description: `${4 + enrage}＋2×執行時雷量，之後清空` },
    { kind: 'shield', value: 4, label: '架盾', description: '護盾 +4' },
  ] : [
    { kind: 'shield', value: 4, label: '架盾', description: '護盾 +4' },
    { kind: 'attack', value: 6 + enrage, label: '震擊', description: `攻擊 ${6 + enrage}` },
    { kind: 'charge', value: 2, label: '聚雷', description: '雷量 +2，上限 6' },
  ]
}

export function nextRound(state: CombatState): CombatState {
  if (state.status !== 'planning' || state.hand.length) throw new Error('須先結算本回合，且戰鬥仍在進行。')
  const s = structuredClone(state)
  s.round++
  for (const side of [s.player, s.enemy]) {
    side.shield = 0; side.evade = false; side.thorns = false
  }
  draw(s)
  return s
}

export function resolveTurn(state: CombatState, planned: readonly PlannedCard[]): Resolution {
  if (state.status !== 'planning') throw new Error('戰鬥已結束。')
  if (planned.length > BALANCE.maxCards) throw new Error('每回合最多安排三張牌。')
  const instances = new Set<string>()
  for (const p of planned) {
    if (!Number.isInteger(p.slot) || p.slot < 0 || p.slot > 3) throw new Error('插入區須介於0至3。')
    if (instances.has(p.instanceId)) throw new Error('不能重複使用同一張實體牌。')
    if (!state.hand.some(c => c.instanceId === p.instanceId)) throw new Error('此牌不在手牌中。')
    instances.add(p.instanceId)
  }
  const s = structuredClone(state)
  const events: CombatEvent[] = []
  let mainIndex = -1
  function event(actor: Side | 'system', target: Side | 'both', effect: CombatEvent['effect'], label: string, reason: string, amount: number, change: () => void) {
    const before = snapshot(s)
    change()
    events.push({ index: events.length, mainIndex, actor, target, effect, label, reason, amount, before, after: snapshot(s) })
  }
  function checkDeath(): boolean {
    if (s.player.hp > 0 && s.enemy.hp > 0) return false
    s.status = s.player.hp === 0 ? 'lost' : 'won'
    event('system', 'both', 'defeat', s.status === 'won' ? '雷衛敗退' : '阿修羅倒下', '死亡即停止後續事件；戰鬥資源歸零。', 0, () => {
      for (const f of [s.player, s.enemy]) { f.thunder = 0; f.shield = 0; f.evade = false; f.thorns = false }
    })
    return true
  }
  function damage(actor: Side, power: number, label: string, reflection = false) {
    const target: Side = actor === 'player' ? 'enemy' : 'player'
    const f = s[target]
    const canceled = !reflection && f.evade
    const blocked = canceled ? 0 : Math.min(f.shield, power)
    const hpLoss = canceled ? 0 : Math.min(f.hp, power - blocked)
    event(actor, target, reflection ? 'reflect' : 'attack', label,
      canceled ? `攻擊 ${power}；避鋒取消傷害，不觸發倒刺。`
        : `${reflection ? '反傷' : '攻擊'} ${power}，護盾抵扣 ${blocked}，失去 ${hpLoss} 生命。`, hpLoss, () => {
        if (canceled) f.evade = false
        else { f.shield -= blocked; f.hp -= hpLoss }
      })
    if (checkDeath()) return
    if (!reflection && actor === 'enemy' && !canceled && f.thorns) {
      f.thorns = false
      damage('player', 6, '倒刺反擊', true)
    }
  }
  function play(card: Card) {
    mainIndex++
    switch (card.cardId) {
      case 'strike': damage('player', 6, '破勢'); break
      case 'guard': event('player', 'player', 'shield', '護身', '取得 6 護盾；下回合開始清除。', 6, () => { s.player.shield += 6 }); break
      case 'draw_thunder': {
        const amount = Math.min(3, s.enemy.thunder, BALANCE.thunderCap - s.player.thunder)
        const reason = amount ? `轉移 ${amount} 雷；降低後續雷擊。` : s.player.thunder === 6 ? '自身雷量已滿，沒有轉移，也不扣敵雷。' : '敵人當下沒有雷量，轉移為零。'
        event('player', 'both', 'transfer', '引雷印', reason, amount, () => { s.enemy.thunder -= amount; s.player.thunder += amount })
        break
      }
      case 'return': {
        const spent = s.player.thunder
        event('player', 'player', 'thunder', '奉還蓄勢', `消耗 ${spent} 雷，攻擊力 ${4 + 3 * spent}。`, spent, () => { s.player.thunder = 0 })
        damage('player', 4 + 3 * spent, '奉還')
        break
      }
      case 'steal_armor': {
        const amount = Math.min(6, s.enemy.shield)
        event('player', 'both', 'transfer', '借甲', amount ? `轉移 ${amount} 護盾，敵盾減少，自身護盾增加。` : '敵人當下沒有護盾，轉移為零。', amount,
          () => { s.enemy.shield -= amount; s.player.shield += amount })
        break
      }
      case 'thorns': event('player', 'player', 'thorns', '倒刺', '準備單次反傷 6；完全格擋仍觸發，閃避及死亡不觸發。', 6, () => { s.player.thorns = true }); break
      case 'evade': event('player', 'player', 'evade', '避鋒', '取消下一次敵方攻擊；不疊加。', 1, () => { s.player.evade = true }); break
      case 'channel': {
        const amount = Math.min(2, BALANCE.thunderCap - s.player.thunder)
        event('player', 'player', 'thunder', '汲能', amount ? `取得 ${amount} 雷，跨回合保留。` : '雷量已滿，本次增加為零。', amount, () => { s.player.thunder += amount })
        break
      }
    }
  }
  function enemy(intent: Intent) {
    mainIndex++
    switch (intent.kind) {
      case 'charge': {
        const amount = Math.min(intent.value, BALANCE.thunderCap - s.enemy.thunder)
        event('enemy', 'enemy', 'thunder', '聚雷', `聚雷 +${intent.value}`, amount, () => { s.enemy.thunder += amount }); break
      }
      case 'shield': event('enemy', 'enemy', 'shield', '架盾', '雷衛取得 4 護盾。', intent.value, () => { s.enemy.shield += intent.value }); break
      case 'attack': damage('enemy', intent.value, '震擊'); break
      case 'lightning': {
        const spent = s.enemy.thunder
        event('enemy', 'enemy', 'thunder', '雷擊耗雷', `按當下 ${spent} 雷計算 ${intent.value}＋2×${spent}；即使閃避仍耗雷。`, spent, () => { s.enemy.thunder = 0 })
        damage('enemy', intent.value + 2 * spent, '雷擊'); break
      }
    }
  }
  const intents = getIntents(s.round)
  for (let slot = 0; slot < 4; slot++) {
    for (const p of planned.filter(p => p.slot === slot)) {
      if (s.status !== 'planning') break
      play(s.hand.find(c => c.instanceId === p.instanceId)!)
    }
    if (s.status !== 'planning') break
    if (slot < 3) enemy(intents[slot])
    if (s.status !== 'planning') break
  }
  event('system', 'both', 'discard', '回合結束', '全部手牌進棄牌堆；暫時狀態清除，雷量保留至下回合。', s.hand.length, () => {
    s.discardPile.push(...s.hand); s.hand = []
    s.player.evade = false; s.player.thorns = false; s.enemy.evade = false; s.enemy.thorns = false
  })
  return { nextState: s, events }
}
