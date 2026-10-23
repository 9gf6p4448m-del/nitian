export type Side = 'xiu' | 'tian'
export type CardKind = 'spear' | 'blade' | 'spring' | 'shift'
export type UnitKind = 'spear' | 'blade'
export type Direction = 'N' | 'E' | 'S' | 'W' | 'NE' | 'SE' | 'SW' | 'NW'
export interface Card { id: string; kind: CardKind }

export const CARD_COUNTS: Record<CardKind, number> = { spear: 4, blade: 4, spring: 2, shift: 2 }
export const CARD_NAMES: Record<CardKind, string> = { spear: '槍將', blade: '刃將', spring: '雷泉', shift: '變陣' }
export const SIDE_NAMES: Record<Side, string> = { xiu: '修', tian: '天' }
export const DIRECTION_NAMES: Record<Direction, string> = { N: '↑', E: '→', S: '↓', W: '←', NE: '↗', SE: '↘', SW: '↙', NW: '↖' }
export const DIRECTIONS: Record<UnitKind, readonly Direction[]> = { spear: ['N', 'E', 'S', 'W'], blade: ['NE', 'SE', 'SW', 'NW'] }
export const VECTORS: Record<Direction, readonly [number, number]> = {
  N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0], NE: [1, -1], SE: [1, 1], SW: [-1, 1], NW: [-1, -1],
}

export function createDeck(side: Side): Card[] {
  return (Object.keys(CARD_COUNTS) as CardKind[]).flatMap(kind =>
    Array.from({ length: CARD_COUNTS[kind] }, (_, index) => ({ id: `${side}-${kind}-${index + 1}`, kind })))
}
