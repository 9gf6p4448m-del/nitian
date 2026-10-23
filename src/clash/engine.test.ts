import { describe, expect, it } from 'vitest'
import { applyAction, createGame, getControl, getView, legalActions, posLabel, previewAction, roundOrder, type Action, type Direction, type GameState, type Piece, type Side } from './engine'
import { CARD_COUNTS, DIRECTIONS, createDeck } from './cards'
import { chooseAction } from './ai'

const piece = (id: string, side: Side, pos: number, direction: Direction = 'E', kind: Piece['kind'] = 'spear', hp = 3): Piece => ({ id, side, pos, direction, kind, hp })
function fixture(pieces: Piece[], springs: number[] = []): GameState {
  return { ...createGame({ seed: 'fixture', scenario: 'study' }), pieces, springs }
}
function play(state: GameState, kind: string, extra: Partial<Extract<Action, { type: 'play' }>>): Action {
  const card = state.hands[state.turn].find(c => c.kind === kind)!
  return { type: 'play', cardId: card.id, direction: 'E', ...extra }
}
function totalCards(state: GameState, side: Side) {
  return [...state.hands[side], ...state.decks[side], ...state.discards[side]]
}
function prepare(state: GameState): GameState {
  return applyAction(state, { type: 'prepare', cardId: state.hands[state.turn][0].id })
}

describe('奪勢固定規則與實體牌', () => {
  it('每方12張唯一實體；試局起手來自同一副牌，seed可重現', () => {
    expect(CARD_COUNTS).toEqual({ spear: 4, blade: 4, spring: 2, shift: 2 })
    expect(createDeck('xiu')).toHaveLength(12)
    const a = createGame({ seed: 'repeat' })
    expect(a).toEqual(createGame({ seed: 'repeat' }))
    expect(a.decks).not.toEqual(createGame({ seed: 'different' }).decks)
    expect(a.pieces.map(p => [p.side, p.pos, p.direction])).toEqual([['xiu', 8, 'E'], ['tian', 7, 'W']])
    const study = createGame({ seed: 'repeat', scenario: 'study', first: 'tian' })
    expect(study.turn).toBe('xiu')
    expect(study.maxRounds).toBe(2)
    expect(study.pieces.map(p => p.pos)).toEqual([8, 9, 6, 10])
    for (const side of ['xiu', 'tian'] as const) {
      expect(study.hands[side].map(c => c.kind)).toEqual(['spear', 'blade', 'spring', 'shift'])
      expect(new Set(totalCards(study, side).map(c => c.id)).size).toBe(12)
    }
    expect(posLabel(0)).toBe('A1')
    expect(posLabel(15)).toBe('D4')
  })

  it('有效手後換人，第二手前抽1；輪末與次輪先手可連動', () => {
    let state = createGame({ seed: 'draw', scenario: 'study' })
    state = prepare(state)
    expect(state.turn).toBe('tian')
    expect(state.hands.xiu).toHaveLength(3)
    expect(state.hands.tian).toHaveLength(4)
    state = prepare(state)
    expect(state.round).toBe(2)
    expect(state.turn).toBe('tian')
    expect(state.hands.tian).toHaveLength(4)
    expect(state.decks.tian).toHaveLength(7)
    state = prepare(state)
    expect(state.turn).toBe('xiu')
    expect(state.hands.xiu).toHaveLength(4)
    expect(state.decks.xiu).toHaveLength(7)
    for (const side of ['xiu', 'tian'] as const) expect(totalCards(state, side)).toHaveLength(12)
  })

  it('兩輪與六輪都在輪末依當下控制加分，平分和局，終局不可再行動', () => {
    let state = fixture([piece('a', 'xiu', 0), piece('b', 'tian', 15)])
    expect(getControl(state).map(c => c.owner)).toEqual(['xiu', 'tian'])
    state = prepare(state)
    expect(state.scores).toEqual({ xiu: 0, tian: 0 })
    state = prepare(state)
    expect(state.scores).toEqual({ xiu: 1, tian: 1 })
    state = prepare(prepare(state))
    expect(state.status).toBe('finished')
    expect(state.winner).toBe('draw')
    expect(state.scores).toEqual({ xiu: 2, tian: 2 })
    expect(prepare(state)).toBe(state)
    let full = { ...createGame({ seed: 'full', first: 'tian' }), pieces: [piece('a', 'xiu', 0)] }
    const order: Side[] = []
    while (full.status === 'playing') { order.push(full.turn); full = prepare(full) }
    expect(order).toEqual(['tian', 'xiu', 'xiu', 'tian', 'tian', 'xiu', 'xiu', 'tian', 'tian', 'xiu', 'xiu', 'tian'])
    expect(full.round).toBe(6)
    expect(full.scores.xiu).toBe(6)
    expect(full.winner).toBe('xiu')
    expect(roundOrder(2, 'xiu')).toEqual(['tian', 'xiu'])
  })

  it('相同兵力祭壇中立；祭壇不是可進入的格', () => {
    const state = fixture([piece('a', 'xiu', 0), piece('b', 'tian', 5)])
    expect(getControl(state)[0]).toMatchObject({ owner: null, xiu: 1, tian: 1 })
    expect(applyAction(state, play(state, 'spear', { to: 4 }))).toBe(state)
    expect(applyAction(state, play(state, 'blade', { to: 11, direction: 'NE' }))).toBe(state)
  })
})

describe('方向、邊界與第一個阻擋物', () => {
  it.each([
    ['N', 1], ['E', 6], ['S', 9], ['W', 4],
  ] as const)('槍將朝%s只射該向且傷害2', (direction, target) => {
    // B2向左為祭壇，另以C3向左個案檢驗西向。
    const origin = direction === 'W' ? 10 : 5
    const pos = direction === 'W' ? 9 : target
    const state = fixture([piece('victim', 'tian', pos)])
    const next = applyAction(state, play(state, 'spear', { to: origin, direction }))
    expect(next.pieces.find(p => p.id === 'victim')?.hp).toBe(1)
  })
  it.each([['NE', 2], ['SE', 10], ['SW', 8], ['NW', 0]] as const)('刃將%s只打斜相鄰', (direction, target) => {
    const state = fixture([piece('victim', 'tian', target)])
    const next = applyAction(state, play(state, 'blade', { to: 5, direction }))
    expect(next.pieces.find(p => p.id === 'victim')?.hp).toBe(1)
  })
  it('槍可打第二格，第三格不行；刃不能打兩格；邊界不能繞列', () => {
    let state = fixture([piece('v', 'tian', 2)])
    expect(applyAction(state, play(state, 'spear', { to: 0, direction: 'E' })).pieces.find(p => p.id === 'v')?.hp).toBe(1)
    state = fixture([piece('v', 'tian', 3)])
    expect(applyAction(state, play(state, 'spear', { to: 0, direction: 'E' })).pieces.find(p => p.id === 'v')?.hp).toBe(3)
    state = fixture([piece('v', 'tian', 10)])
    expect(applyAction(state, play(state, 'blade', { to: 0, direction: 'SE' })).pieces.find(p => p.id === 'v')?.hp).toBe(3)
    state = fixture([piece('v', 'tian', 8)])
    expect(applyAction(state, play(state, 'spear', { to: 7, direction: 'E' })).pieces.find(p => p.id === 'v')?.hp).toBe(3)
  })
  it('第一名敵人截停；友軍、祭壇、雷泉都阻擋', () => {
    let state = fixture([piece('front', 'tian', 1), piece('back', 'tian', 2)])
    let next = applyAction(state, play(state, 'spear', { to: 0, direction: 'E' }))
    expect(next.pieces.map(p => [p.id, p.hp]).slice(0, 2)).toEqual([['front', 1], ['back', 3]])
    state = fixture([piece('friend', 'xiu', 1), piece('back', 'tian', 2)])
    expect(previewAction(state, play(state, 'spear', { to: 0, direction: 'E' })).attack?.reason).toBe('friend')
    expect(applyAction(state, play(state, 'spear', { to: 0, direction: 'E' })).pieces.find(p => p.id === 'back')?.hp).toBe(3)
    state = fixture([piece('back', 'tian', 8)])
    expect(previewAction(state, play(state, 'spear', { to: 0, direction: 'S' })).attack?.reason).toBe('altar')
    state = fixture([piece('back', 'tian', 2)], [1])
    next = applyAction(state, play(state, 'spear', { to: 0, direction: 'E' }))
    expect(next.pieces.find(p => p.id === 'back')?.hp).toBe(3)
    expect(previewAction(state, play(state, 'spear', { to: 0, direction: 'E' })).attack?.reason).toBe('spring')
  })
  it('槍拒絕斜向、刃拒絕直向、越界部署拒絕', () => {
    const state = fixture([])
    expect(applyAction(state, play(state, 'spear', { to: 0, direction: 'NE' }))).toBe(state)
    expect(applyAction(state, play(state, 'blade', { to: 0, direction: 'E' }))).toBe(state)
    expect(applyAction(state, play(state, 'spear', { to: 16 }))).toBe(state)
  })
})

describe('雷泉、換位與傷害', () => {
  it('雷泉落地同手啟動相鄰友軍，加成擊殺且移除棋子', () => {
    const state = fixture([piece('a', 'xiu', 5), piece('b', 'tian', 6)])
    const action = play(state, 'spring', { to: 1, pieceId: 'a', direction: 'E' })
    const preview = previewAction(state, action)
    expect(preview.attack).toMatchObject({ attackerId: 'a', targetId: 'b', damage: 3, springBonus: 1, path: [6] })
    expect(preview.state.springs).toContain(1)
    expect(preview.state.pieces.map(p => p.id)).toEqual(['a'])
    expect(preview.events.some(e => e.type === 'death')).toBe(true)
  })
  it('共享泉對天方也加成，兩泉不疊；無相鄰友軍的置泉拒絕', () => {
    const state = fixture([piece('a', 'xiu', 5), piece('b', 'tian', 6)], [1, 9])
    const next = applyAction(state, play(state, 'shift', { pieceId: 'a', to: 5, direction: 'E' }))
    expect(next.pieces.some(p => p.id === 'b')).toBe(false)
    const enemyTurn = { ...fixture([piece('a', 'xiu', 6), piece('b', 'tian', 5)], [1, 9]), turn: 'tian' as const }
    expect(previewAction(enemyTurn, play(enemyTurn, 'shift', { pieceId: 'b', to: 5, direction: 'E' })).attack?.damage).toBe(3)
    const noFriend = fixture([piece('a', 'xiu', 0)])
    expect(applyAction(noFriend, play(noFriend, 'spring', { to: 6, pieceId: 'a', direction: 'E' }))).toBe(noFriend)
    expect(applyAction(noFriend, play(noFriend, 'spring', { to: 1, pieceId: 'missing', direction: 'E' }))).toBe(noFriend)
  })
  it('變陣可留原格、移一格、與敵友換位；只指定者攻擊且生命方向保留', () => {
    const state = fixture([piece('a', 'xiu', 5, 'N', 'spear', 1), piece('b', 'tian', 6, 'W'), piece('c', 'tian', 2)])
    const next = applyAction(state, play(state, 'shift', { pieceId: 'a', to: 6, direction: 'N' }))
    expect(next.pieces.find(p => p.id === 'a')).toMatchObject({ pos: 6, hp: 1, direction: 'N' })
    expect(next.pieces.find(p => p.id === 'b')).toMatchObject({ pos: 5, hp: 3, direction: 'W' })
    expect(next.pieces.find(p => p.id === 'c')?.hp).toBe(1)
    expect(previewAction(state, play(state, 'shift', { pieceId: 'a', to: 5, direction: 'E' })).attack?.targetId).toBe('b')
    expect(applyAction(state, play(state, 'shift', { pieceId: 'a', to: 1, direction: 'N' })).pieces.find(p => p.id === 'a')?.pos).toBe(1)
    const friends = fixture([piece('a', 'xiu', 5), piece('b', 'xiu', 6, 'W', 'spear', 1)])
    expect(applyAction(friends, play(friends, 'shift', { pieceId: 'a', to: 6, direction: 'S' })).pieces.find(p => p.id === 'b')).toMatchObject({ pos: 5, hp: 1, direction: 'W' })
    expect(applyAction(state, play(state, 'shift', { pieceId: 'a', to: 10, direction: 'N' }))).toBe(state)
    expect(applyAction(state, play(state, 'shift', { pieceId: 'b', to: 6, direction: 'N' }))).toBe(state)
    expect(applyAction(state, play(state, 'shift', { pieceId: 'a', to: 4, direction: 'N' }))).toBe(state)
  })
  it('損傷永久保留且無自動反擊/全場連鎖', () => {
    const state = fixture([piece('a', 'tian', 6, 'W'), piece('b', 'xiu', 2, 'S')])
    const next = applyAction(state, play(state, 'spear', { to: 5, direction: 'E' }))
    expect(next.pieces.find(p => p.pos === 5)?.hp).toBe(3)
    expect(next.pieces.find(p => p.id === 'a')?.hp).toBe(1)
    expect(next.pieces.find(p => p.id === 'b')?.hp).toBe(3)
  })
})

describe('解析安全性、預覽與AI資訊界線', () => {
  it('預覽與確認完全相同且原物件與內層牌/棋子不污染', () => {
    const state = createGame({ seed: 'pure', scenario: 'study' })
    const frozen = JSON.stringify(state)
    const action = play(state, 'shift', { pieceId: state.pieces[1].id, to: 9, direction: 'E' })
    const preview = previewAction(state, action)
    expect(preview.legal).toBe(true)
    expect(preview.state).toEqual(applyAction(state, action))
    expect(JSON.stringify(state)).toBe(frozen)
    expect(preview.state.pieces[0]).not.toBe(state.pieces[0])
    expect(preview.state.history[0]).toMatchObject({ action, before: { round: 1 }, after: { round: 1 } })
  })
  it('非法、非己方/已消耗卡、重複實體牌均return原物件；有手牌不可空過', () => {
    const state = createGame({ seed: 'illegal', scenario: 'study' })
    expect(applyAction(state, { type: 'pass' })).toBe(state)
    expect(applyAction(state, { type: 'prepare', cardId: state.hands.tian[0].id })).toBe(state)
    const used = prepare(state)
    expect(applyAction(used, { type: 'prepare', cardId: state.hands.xiu[0].id })).toBe(used)
    const duplicate = structuredClone(state)
    duplicate.decks.xiu[0] = duplicate.hands.xiu[0]
    expect(applyAction(duplicate, legalActions(state)[0])).toBe(duplicate)
  })
  it('牌庫空不抽，無手牌才可空過且仍交接；合法動作都可執行', () => {
    let state = createGame({ seed: 'empty', scenario: 'study' })
    state = { ...state, hands: { ...state.hands, xiu: [] }, decks: { ...state.decks, xiu: [] }, discards: { ...state.discards, xiu: totalCards(state, 'xiu') } }
    expect(legalActions(state)).toEqual([{ type: 'pass' }])
    const next = applyAction(state, { type: 'pass' })
    expect(next.turn).toBe('tian')
    expect(next.discards.xiu).toHaveLength(12)
    const normal = createGame({ seed: 'all', scenario: 'study' })
    for (const action of legalActions(normal)) expect(applyAction(normal, action)).not.toBe(normal)
  })
  it('AI只收到自己的手牌；無seed/deck/敵方手牌，隱藏狀態置換不影響選擇', () => {
    const state = createGame({ seed: 'redacted', scenario: 'study' })
    const view = getView(state, 'xiu')
    expect(Object.keys(view)).not.toContain('seed')
    expect(Object.keys(view)).not.toContain('decks')
    expect(Object.keys(view)).not.toContain('hands')
    expect(view.hand).toEqual(state.hands.xiu)
    expect(view.handCounts).toEqual({ xiu: 4, tian: 4 })
    expect(view.deckCounts).toEqual({ xiu: 8, tian: 8 })
    const hidden = structuredClone(state)
    ;[hidden.hands.tian[0], hidden.decks.tian[0]] = [hidden.decks.tian[0], hidden.hands.tian[0]]
    hidden.decks.xiu.reverse()
    hidden.seed = 'changed'
    expect(getView(hidden, 'xiu')).toEqual(view)
    const choice = chooseAction(view)
    expect(choice).not.toBeNull()
    expect(legalActions(state)).toContainEqual(choice)
    expect(chooseAction(getView(hidden, 'xiu'))).toEqual(choice)
    expect(chooseAction(getView(state, 'tian'))).toBeNull()
  })
  it('AI可完成多seed全局，實體守恆與合法解析全程維持', () => {
    for (let seed = 0; seed < 8; seed++) {
      let state = createGame({ seed: `ai-${seed}` })
      for (let turn = 0; turn < 12; turn++) {
        const action = chooseAction(getView(state, state.turn))!
        const next = applyAction(state, action)
        expect(next).not.toBe(state)
        for (const side of ['xiu', 'tian'] as const) expect(new Set(totalCards(next, side).map(c => c.id)).size).toBe(12)
        state = next
      }
      expect(state.status).toBe('finished')
      expect(state.history).toHaveLength(12)
    }
    expect(DIRECTIONS.spear).toHaveLength(4)
  })
})
