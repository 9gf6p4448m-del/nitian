import type { CardId } from './types'

export const BALANCE = { playerHp: 45, enemyHp: 48, classicHp: 30, thunderCap: 6, maxCards: 3, handSize: 5 } as const
export const CARDS: Record<CardId, { name: string; tag: string; description: string; short: string; icon: string }> = {
  strike: { name: '破勢', tag: '攻擊', description: '對雷衛攻擊 6。敵方護盾先抵扣。', short: '攻擊 6', icon: 'blade' },
  guard: { name: '護身', tag: '防守', description: '獲得 6 護盾。護盾於下回合開始清除。', short: '護盾 +6', icon: 'shield' },
  draw_thunder: { name: '引雷印', tag: '借勢', description: '轉移敵人最多 3 雷量給自己；容量 6，只扣除實際轉移量。', short: '借取最多 3 雷', icon: 'bolt' },
  return: { name: '奉還', tag: '攻擊', description: '消耗全部自身雷量，攻擊 4＋3×消耗雷量。無雷仍攻擊 4。', short: '攻擊 4＋3×雷', icon: 'sun' },
  steal_armor: { name: '借甲', tag: '借勢', description: '轉移敵人最多 6 護盾給自己。應在敵人架盾後使用。', short: '借取最多 6 盾', icon: 'mirror' },
  thorns: { name: '倒刺', tag: '借勢', description: '下次未被閃避的敵方攻擊後，存活則反傷 6。完全格擋仍觸發，反傷受敵盾抵扣；不疊加。', short: '下次受擊反傷 6', icon: 'thorns' },
  evade: { name: '避鋒', tag: '防守', description: '取消下一次敵方攻擊傷害。雷擊仍會耗雷；閃避不觸發倒刺，不疊加。', short: '閃避一次攻擊', icon: 'wind' },
  channel: { name: '汲能', tag: '蓄雷', description: '自己獲得 2 雷量，上限 6。雷量跨回合保留。', short: '雷量 +2', icon: 'vessel' },
}
export const STARTING_DECK: CardId[] = ['draw_thunder', 'return', 'guard', 'strike', 'evade', 'steal_armor', 'thorns', 'guard', 'strike', 'channel']
export const TUTORIAL_HAND: CardId[] = ['draw_thunder', 'return', 'guard', 'strike', 'evade']
export const MODES = {
  standard: { title: '須彌山門', subtitle: '48 生命 · 種子牌序', hp: 48 },
  classic: { title: '初見雷衛', subtitle: '30 生命 · 原版對照', hp: 30 },
  paper: { title: '紙上試煉', subtitle: '48 生命 · 固定牌序', hp: 48 },
} as const
