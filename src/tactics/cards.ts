export type CardId = 'spear' | 'blade' | 'dash' | 'fog' | 'spring' | 'blood'
export type Card = { instanceId: string; id: CardId }

export const CARD_IDS: readonly CardId[] = ['spear', 'blade', 'dash', 'fog', 'spring', 'blood']
export const CARDS: Record<CardId, { name: string; description: string }> = {
  spear: { name: '長槍', description: '更換武器：正交距離 1–2，基礎傷害 2。' },
  blade: { name: '月刃', description: '更換武器：斜角相鄰，基礎傷害 3。' },
  dash: { name: '疾步', description: '正交移動最多兩格，可轉彎；不能穿越雷泉與敵將。' },
  fog: { name: '迷霧', description: '在無地物、無主將的空格放迷霧，阻擋距離 2 的攻擊。' },
  spring: { name: '雷泉', description: '在無地物、無主將的空格放共享雷泉；相鄰攻擊 +1。' },
  blood: { name: '血誓', description: '交還一座己方壇，本回合下一次攻擊 +2，不疊加。' },
}
