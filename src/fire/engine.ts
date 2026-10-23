export type Side = 'asura' | 'deva'
export type Variant = 'A' | 'B'
export interface FireUnit { id: string; side: Side; cell: number; hp: number; used: boolean }
export interface FireState {
  variant: Variant
  round: number
  slot: number
  units: FireUnit[]
  fire: { holder: string | null; cell: number | null }
  result: { winner: Side | null; reason: 'offering' | 'elimination' | 'repetition' } | null
  repetitions: Record<string, number>
}
export interface Action {
  type: 'move' | 'strike' | 'throw' | 'offer' | 'wait' | 'pickup' | 'pass'
  unitId?: string
  target?: number
  push?: boolean
}
export interface FireEvent { type: string; message: string; from?: number; to?: number; unitId?: string; amount?: number }

export const cellName = (cell: number): string => `${'ABCDE'[cell % 5]}${Math.floor(cell / 5) + 1}`
export const currentSide = (state: FireState): Side => state.slot % 2 === 0 ? 'asura' : 'deva'
export const goalCell = (variant: Variant, side: Side): number => (variant === 'A') === (side === 'asura') ? 22 : 2
const alive = (state: FireState, cell: number) => state.units.find(u => u.hp > 0 && u.cell === cell)
const distance = (a: number, b: number) => Math.abs(a % 5 - b % 5) + Math.abs(Math.floor(a / 5) - Math.floor(b / 5))
const neighbours = (cell: number) => [cell - 5, cell + 1, cell + 5, cell - 1].filter(c => c >= 0 && c < 25 && distance(cell, c) === 1)
const sideName = (side: Side) => side === 'asura' ? '修羅' : '天人'
const unitName = (unit: FireUnit) => `${sideName(unit.side)}${unit.id.endsWith('1') ? '一' : '二'}`

// Only living pieces affect the round-start position; round counters and dead cells do not.
function positionKey(state: FireState): string {
  return JSON.stringify([
    state.units.filter(u => u.hp > 0).map(u => [u.id, u.side, u.cell, u.hp]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    state.fire.holder, state.fire.cell, currentSide(state),
  ])
}

export function createGame(variant: Variant): FireState {
  const state: FireState = {
    variant, round: 1, slot: 0,
    units: [
      { id: 'a1', side: 'asura', cell: 21, hp: 3, used: false },
      { id: 'a2', side: 'asura', cell: 23, hp: 3, used: false },
      { id: 'd1', side: 'deva', cell: 1, hp: 3, used: false },
      { id: 'd2', side: 'deva', cell: 3, hp: 3, used: false },
    ],
    fire: { holder: null, cell: 12 }, result: null, repetitions: {},
  }
  state.repetitions[positionKey(state)] = 1
  return state
}

function moveTargets(state: FireState, unit: FireUnit): number[] {
  const targets = new Set<number>()
  const limit = state.fire.holder === unit.id ? 1 : 2
  function walk(cell: number, steps: number) {
    if (steps === limit) return
    for (const next of neighbours(cell)) {
      if (next === unit.cell || alive(state, next)) continue
      targets.add(next)
      if (state.fire.holder !== null || next !== state.fire.cell) walk(next, steps + 1)
    }
  }
  walk(unit.cell, 0)
  return [...targets].sort((a, b) => a - b)
}

export function legalActions(state: FireState): Action[] {
  if (state.result) return []
  const available = state.units.filter(u => u.side === currentSide(state) && u.hp > 0 && !u.used)
  if (!available.length) return [{ type: 'pass' }]
  const actions: Action[] = []
  for (const unit of available) {
    const unitId = unit.id
    if (state.fire.holder === unitId && unit.cell === goalCell(state.variant, unit.side)) actions.push({ type: 'offer', unitId })
    if (state.fire.holder === null && state.fire.cell === unit.cell) actions.push({ type: 'pickup', unitId })
    for (const target of moveTargets(state, unit)) actions.push({ type: 'move', unitId, target })
    for (const target of neighbours(unit.cell)) {
      const enemy = alive(state, target)
      if (enemy && enemy.side !== unit.side) {
        actions.push({ type: 'strike', unitId, target, push: false }, { type: 'strike', unitId, target, push: true })
      }
    }
    if (state.fire.holder === unitId) {
      for (let target = 0; target < 25; target++) {
        if (target === unit.cell || (target % 5 !== unit.cell % 5 && Math.floor(target / 5) !== Math.floor(unit.cell / 5))) continue
        if (distance(target, unit.cell) <= 3) actions.push({ type: 'throw', unitId, target })
      }
    }
    actions.push({ type: 'wait', unitId })
  }
  return actions
}

function sameAction(a: Action, b: Action): boolean {
  return a.type === b.type && a.unitId === b.unitId && a.target === b.target && (a.push ?? false) === (b.push ?? false)
}

export function applyAction(original: FireState, action: Action): { state: FireState; events: FireEvent[] } {
  if (!action || !legalActions(original).some(candidate => sameAction(candidate, action))) throw new Error('非法行動：角色、時槽或目標不符合規則。')
  const state: FireState = {
    ...original, units: original.units.map(u => ({ ...u })), fire: { ...original.fire },
    repetitions: { ...original.repetitions }, result: original.result ? { ...original.result } : null,
  }
  const events: FireEvent[] = []
  const unit = state.units.find(u => u.id === action.unitId)
  if (unit) unit.used = true
  const emit = (type: string, message: string, details: Omit<FireEvent, 'type' | 'message'> = {}) => events.push({ type, message, ...details })
  function elimination(): boolean {
    const loser = (['asura', 'deva'] as Side[]).find(side => !state.units.some(u => u.side === side && u.hp > 0))
    if (!loser) return false
    state.result = { winner: loser === 'asura' ? 'deva' : 'asura', reason: 'elimination' }
    emit('elimination', `${sideName(state.result.winner!)}殲滅對方，獲勝。`)
    return true
  }
  function hurt(victim: FireUnit) {
    victim.hp = Math.max(0, victim.hp - 1)
    emit('damage', `${unitName(victim)}受傷，剩 ${victim.hp} 血。`, { unitId: victim.id, amount: 1, to: victim.cell })
    if (victim.hp === 0) emit('death', `${unitName(victim)}退場。`, { unitId: victim.id, from: victim.cell })
  }
  if (action.type === 'pass') emit('pass', `${sideName(currentSide(state))}無可啟用角色，略過。`)
  if (unit) {
    const from = unit.cell
    switch (action.type) {
      case 'move': {
        unit.cell = action.target!
        emit('move', `${unitName(unit)}從 ${cellName(from)} 移至 ${cellName(unit.cell)}。`, { unitId: unit.id, from, to: unit.cell })
        if (state.fire.holder === null && state.fire.cell === unit.cell) {
          state.fire = { holder: unit.id, cell: null }
          emit('pickup', `${unitName(unit)}拾起火。`, { unitId: unit.id, to: unit.cell })
        }
        break
      }
      case 'pickup':
        state.fire = { holder: unit.id, cell: null }
        emit('pickup', `${unitName(unit)}原地拾起火。`, { unitId: unit.id, to: unit.cell })
        break
      case 'strike': {
        const victim = alive(state, action.target!)!
        emit('strike', `${unitName(unit)}攻擊 ${unitName(victim)}。`, { unitId: unit.id, from, to: victim.cell })
        if (state.fire.holder === victim.id) {
          state.fire = { holder: null, cell: victim.cell }
          emit('drop', `火掉在 ${cellName(victim.cell)}。`, { unitId: victim.id, to: victim.cell })
        }
        hurt(victim)
        if (elimination()) return { state, events }
        const next = victim.cell + (victim.cell - unit.cell)
        if (action.push && victim.hp > 0 && neighbours(victim.cell).includes(next) && !alive(state, next)) {
          const oldCell = victim.cell
          victim.cell = next
          emit('push', `${unitName(victim)}被推至 ${cellName(next)}。`, { unitId: victim.id, from: oldCell, to: next })
        }
        break
      }
      case 'throw': {
        const target = action.target!
        const step = target % 5 === from % 5 ? (target > from ? 5 : -5) : (target > from ? 1 : -1)
        let landing = from + step
        while (landing !== target && !alive(state, landing)) landing += step
        const victim = alive(state, landing)
        state.fire = { holder: null, cell: landing }
        emit('throw', `${unitName(unit)}投火，${victim ? `由 ${unitName(victim)}在` : '落在'} ${cellName(landing)}${victim ? '攔截' : ''}。`, { unitId: unit.id, from, to: landing })
        if (victim) {
          hurt(victim)
          if (victim.hp > 0) {
            state.fire = { holder: victim.id, cell: null }
            emit('catch', `${unitName(victim)}接火。`, { unitId: victim.id, to: landing })
          }
          if (elimination()) return { state, events }
        }
        break
      }
      case 'offer':
        state.result = { winner: unit.side, reason: 'offering' }
        emit('offering', `${unitName(unit)}在 ${cellName(unit.cell)}奉獻，${sideName(unit.side)}獲勝。`, { unitId: unit.id, to: unit.cell })
        return { state, events }
      case 'wait': emit('wait', `${unitName(unit)}待機。`, { unitId: unit.id, to: unit.cell }); break
    }
  }
  state.slot++
  if (state.slot === 4) {
    state.slot = 0; state.round++
    state.units.forEach(u => { u.used = false })
    const key = positionKey(state)
    state.repetitions[key] = (state.repetitions[key] ?? 0) + 1
    emit('round', `第 ${state.round} 輪開始，修羅先行動。`)
    if (state.repetitions[key] >= 3) {
      state.result = { winner: null, reason: 'repetition' }
      emit('repetition', '相同完整輪首局面第三次出現，和局。')
    }
  }
  return { state, events }
}
