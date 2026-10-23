import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createGame, applyAction, legalActions, previewAction, getControl, getView, posLabel, roundOrder, type GameState, type Side, type Direction, type Action } from './clash/engine'
import { chooseAction } from './clash/ai'
import { usePwa } from './pwa'
import { loadSettings, saveSettings, loadHistory, saveCompletedGame } from './clash/storage'
import './clash.css'

const NAMES: Record<Side, string> = { xiu: '阿修羅', tian: '天眾' }
const LABELS = { spear: '槍將', blade: '刃將', spring: '雷泉', shift: '變陣' }
const DESCRIPTIONS = { spear: '落子後沿直向1–2格攻擊。', blade: '落子後攻擊斜向相鄰一格。', spring: '放共享雷泉，啟動相鄰一名友軍；雙方相鄰攻擊＋1。', shift: '一名友軍原地、移一格或與鄰兵換位，然後攻擊。' }
const ARROWS: Record<Direction, string> = { N: '↑', E: '→', S: '↓', W: '←', NE: '↗', SE: '↘', SW: '↙', NW: '↖' }
type Options = { seed: string; scenario: 'study' | 'full'; opponent: 'ai' | 'local'; first: Side; reduced: boolean }
function initialOptions(): Options {
  const old = loadSettings().value
  const queryScenario = new URLSearchParams(location.search).get('scenario')
  return { seed: old.seed.trim() || 'nitian-06', scenario: queryScenario === 'study' || queryScenario === 'full' ? queryScenario : old.scenario, opponent: old.mode === 'hotseat' ? 'local' : 'ai', first: old.first, reduced: old.reduced || matchMedia('(prefers-reduced-motion: reduce)').matches }
}
function Dialog({ title, children, close, fixed = false }: { title: string; children: React.ReactNode; close: () => void; fixed?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!, opener = document.activeElement as HTMLElement | null
    dialog.showModal()
    dialog.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
    dialog.scrollTop = 0
    return () => { dialog.close(); if (opener?.isConnected) opener.focus() }
  }, [])
  return <dialog ref={ref} className="cl-dialog" aria-label={title} onCancel={event => { event.preventDefault(); if (!fixed) close() }}>
    <h2 tabIndex={-1}>{title}</h2>{children}{!fixed && <button className="cl-secondary" onClick={close}>關閉</button>}
  </dialog>
}
export default function ClashApp() {
  const [options, setOptions] = useState<Options>(initialOptions)
  const [draftOptions, setDraftOptions] = useState(options)
  const [game, setGame] = useState(() => createGame({ seed: options.seed, scenario: options.scenario, first: options.first }))
  const gameRef = useRef(game), lock = useRef(false), unlock = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [busy, setBusy] = useState(false)
  const [cardId, setCardId] = useState<string | null>(null)
  const [pieceId, setPieceId] = useState<string | null>(null)
  const [target, setTarget] = useState<number | null>(null)
  const [direction, setDirection] = useState<Direction>('E')
  const [modal, setModal] = useState<'help' | 'settings' | 'log' | 'feedback' | null>(null)
  const [handoff, setHandoff] = useState(options.opponent === 'local')
  const [notice, setNotice] = useState('')
  const [storageError, setStorageError] = useState('')
  const [readWarning] = useState(() => loadSettings().error || '')
  const [feedback, setFeedback] = useState('')
  const saved = useRef<GameState | null>(null)
  const pwa = usePwa()
  const human = options.opponent === 'local' || game.turn === 'xiu'
  const playable = human && !busy && !handoff && !modal && game.status === 'playing'
  const card = game.hands[game.turn].find(c => c.id === cardId)
  const actions = legalActions(game)
  const plays = actions.filter((a): a is Extract<Action, { type: 'play' }> => a.type === 'play' && a.cardId === cardId)
  const piece = game.pieces.find(p => p.id === pieceId)
  const activeKind = card?.kind === 'spear' || card?.kind === 'blade' ? card.kind : piece?.kind
  const directions: Direction[] = activeKind === 'blade' ? ['NW', 'NE', 'SW', 'SE'] : ['N', 'E', 'S', 'W']
  const action = plays.find(a => a.to === target && (a.pieceId || null) === pieceId && a.direction === direction)
  const preview = action ? previewAction(game, action) : null
  const controls = getControl(game)
  const nextControls = preview ? getControl(preview.state) : controls
  const selectedIndex = game.pieces.find(p => p.id === pieceId)?.pos
  const enabledCells = new Set(plays.filter(a => card?.kind !== 'shift' || !pieceId || a.pieceId === pieceId).map(a => a.to))
  const order = roundOrder(game.round, game.initialFirst), nextOrder = roundOrder(game.round + 1, game.initialFirst)
  function clearDraft() { setCardId(null); setPieceId(null); setTarget(null); setNotice('') }
  function commit(chosen: Action) {
    if (lock.current || gameRef.current.status !== 'playing') return
    const source = gameRef.current, next = applyAction(source, chosen)
    if (next === source) { setNotice('局面已改變，請重新選擇。'); return }
    lock.current = true; setBusy(true); gameRef.current = next; setGame(next); clearDraft()
    if (options.opponent === 'local' && next.status === 'playing') setHandoff(true)
    unlock.current = setTimeout(() => { lock.current = false; setBusy(false) }, options.reduced ? 0 : 320)
  }
  useEffect(() => () => { if (unlock.current) clearTimeout(unlock.current) }, [])
  useEffect(() => {
    if (options.opponent !== 'ai' || game.turn !== 'tian' || game.status !== 'playing' || busy || modal || handoff) return
    const snapshot = game
    const timer = setTimeout(() => {
      if (gameRef.current !== snapshot || lock.current) return
      const choice = chooseAction(getView(snapshot, 'tian'))
      if (choice) commit(choice)
    }, options.reduced ? 120 : 750)
    return () => clearTimeout(timer)
    // commit reads the current state ref; a state/options change cancels this timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, options, busy, modal, handoff])
  function saveFinished(text = feedback): boolean {
    const state = gameRef.current
    if (state.status !== 'finished') return false
    const result = saveCompletedGame(state, text)
    if (!result.ok) setStorageError(result.error || '這局無法保存，仍可下載紀錄。')
    return result.ok
  }
  useEffect(() => {
    if (game.status === 'finished' && saved.current !== game) { saved.current = game; saveFinished() }
    // Completion is saved once; editing feedback is saved explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game])
  function start(next: Options) {
    if (gameRef.current.status === 'playing' && gameRef.current.history.length && !confirm('開始新局會放棄這局，繼續嗎？')) return
    if (unlock.current) clearTimeout(unlock.current)
    lock.current = false; setBusy(false); saved.current = null
    const normalized = { ...next, seed: next.seed.trim() || 'nitian-06' }
    const fresh = createGame({ seed: normalized.seed, scenario: normalized.scenario, first: normalized.first })
    gameRef.current = fresh; setGame(fresh); setOptions(normalized); setDraftOptions(normalized)
    setHandoff(normalized.opponent === 'local'); setModal(null); setFeedback(''); clearDraft()
    const result = saveSettings({ seed: normalized.seed, reduced: normalized.reduced, mode: normalized.opponent === 'local' ? 'hotseat' : 'ai', humanSide: 'xiu', first: normalized.first, scenario: normalized.scenario })
    if (!result.ok) setStorageError(result.error || '設定無法保存，這次仍可遊玩。')
  }
  function selectCard(id: string) {
    if (!playable) return
    const selected = game.hands[game.turn].find(c => c.id === id)!
    setCardId(id); setPieceId(null); setTarget(null); setDirection(selected.kind === 'blade' ? 'NE' : 'E'); setNotice('')
  }
  function selectCell(at: number) {
    if (!playable) return
    const occupant = game.pieces.find(p => p.pos === at)
    if (!card) { setNotice(occupant ? `${NAMES[occupant.side]}・${LABELS[occupant.kind]} ${occupant.hp}/3生命；${ARROWS[occupant.direction]}是下次啟動方向，沒有自動反擊。` : '先選一張手牌，再選棋盤上的亮格。'); return }
    if (card.kind === 'shift' && !pieceId) {
      if (occupant?.side !== game.turn) { setNotice('變陣：先點一名自己的棋子。'); return }
      setPieceId(occupant.id); setTarget(at); setDirection(occupant.direction); setNotice(''); return
    }
    if (card.kind === 'spring' && target !== null && occupant?.side === game.turn && plays.some(a => a.to === target && a.pieceId === occupant.id)) {
      setPieceId(occupant.id); setDirection(occupant.direction); setNotice(''); return
    }
    if (!enabledCells.has(at)) { setNotice([4, 11].includes(at) ? '祭壇不能放牌；周圍的兵力決定控制。' : card.kind === 'shift' ? '只能留原地、移動或換位到正交相鄰一格。' : '這格不能放這張牌，請選亮格。'); return }
    setTarget(at); setNotice('')
    if (card.kind === 'spring') {
      const choices = [...new Set(plays.filter(a => a.to === at).map(a => a.pieceId))]
      if (choices.length === 1) { const next = game.pieces.find(p => p.id === choices[0])!; setPieceId(next.id); setDirection(next.direction) }
      else setPieceId(null)
    }
  }
  function exportGame() {
    const history = loadHistory()
    if (!history.ok) setStorageError(history.error || '歷史紀錄無法讀取；下載仍包含當前對局。')
    const exportState = game.status === 'finished' ? game : getView(game, options.opponent === 'ai' ? 'xiu' : game.turn)
    const blob = new Blob([JSON.stringify({ game: '逆天・奪勢', version: '0.6', completed: game.status === 'finished', exportedAt: new Date().toISOString(), options, feedback, state: exportState, history: history.value, historyError: history.error || null }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob), anchor = document.createElement('a')
    anchor.href = url; anchor.download = `nitian-clash-${new Date().toISOString().slice(0, 10)}.json`; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const prompt = !human ? '天眾正在佈陣…' : !card ? '先選一張牌。每手一張，出牌才攻擊。' : card.kind === 'shift' && !pieceId ? '① 點一名友軍，準備變陣。' : card.kind === 'spring' && target !== null && !pieceId ? '② 點亮起的相鄰友軍，讓他出手。' : target === null ? '① 點亮格，選擇落點。' : '② 選攻擊方向，再確認這一手。'
  const assetStyle = { '--cl-units': `url("${import.meta.env.BASE_URL}art/tactics-units.png")`, '--cl-cards': `url("${import.meta.env.BASE_URL}art/tactics-cards.png")` } as CSSProperties
  return <main className={`clash-app ${options.reduced ? 'cl-reduced' : ''}`} style={assetStyle} data-testid="clash-app" data-state={JSON.stringify(game)}>
    <header className="cl-header"><div><span className="cl-eyebrow">NITIAN · 佈陣試驗 0.6</span><h1>逆天<span>奪勢</span></h1></div><nav><button onClick={() => setModal('help')}>玩法</button><button aria-label="設定新局" onClick={() => { setDraftOptions(options); setModal('settings') }}>新局</button></nav></header>
    {(storageError || readWarning || pwa.error) && <p className="cl-error" role="alert">{storageError || readWarning || '離線快取註冊失敗，連網仍可遊玩。'}</p>}
    {pwa.updateAvailable && <button className="cl-update" onClick={() => { if (game.status === 'finished' || confirm('更新會重開此局，繼續嗎？')) pwa.update() }}>新版已備妥・更新並重開</button>}
    <section className="cl-score" aria-label="累計分數"><div className="cl-xiu"><small>阿修羅</small><strong>{game.scores.xiu}</strong></div><div className="cl-round"><b>第 {game.round}／{game.maxRounds} 輪</b><span>{game.scenario === 'study' ? '兩輪試局' : '六輪交鋒'} · 累計分高者勝</span></div><div className="cl-tian"><small>天眾</small><strong>{game.scores.tian}</strong></div></section>
    <p className="cl-order">本輪 {order.map(s => NAMES[s]).join(' → ')}<span>{game.round < game.maxRounds ? `下一輪 ${nextOrder.map(s => NAMES[s]).join(' → ')}` : '最後一輪'}</span></p>
    <div className="cl-playgrid">
      <section className="cl-arena" aria-label="戰場">
        {game.history.length > 0 && <div className="cl-recent" aria-live="polite">{game.history.slice(-2).map((turn, i) => <p key={i}><b>{NAMES[turn.side]}：</b>{turn.events.filter(e => ['damage', 'death'].includes(e.type)).map(e => e.text).join(' ') || turn.events.find(e => ['deploy', 'spring', 'move', 'prepare', 'pass'].includes(e.type))?.text}</p>)}</div>}
        <div className="cl-altars">{controls.map((control, index) => <div key={index}><b>{index ? 'D3' : 'A2'}壇</b><span>修 {control.xiu} : {control.tian} 天</span><em>{control.owner ? `${NAMES[control.owner]}控制` : '中立'}{preview && nextControls[index].owner !== control.owner ? ` → ${nextControls[index].owner ? NAMES[nextControls[index].owner!] : '中立'}` : ''}</em></div>)}</div>
        <div className="cl-board" role="group" aria-label="四乘四共享棋盤">{Array.from({ length: 16 }, (_, at) => {
          const unit = game.pieces.find(p => p.pos === at), shrine = [4, 11].includes(at), spring = game.springs.includes(at)
          const active = selectedIndex === at || target === at
          const springBuddy = card?.kind === 'spring' && target !== null && plays.some(a => a.to === target && a.pieceId === unit?.id)
          const shiftBuddy = card?.kind === 'shift' && !pieceId && unit?.side === game.turn
          const legal = !!card && (enabledCells.has(at) || springBuddy || shiftBuddy)
          return <button key={at} data-testid={`cl-cell-${posLabel(at)}`} aria-label={`${posLabel(at)} ${unit ? NAMES[unit.side] + LABELS[unit.kind] + '生命' + unit.hp + ARROWS[unit.direction] : shrine ? '祭壇' : spring ? '雷泉' : '空格'}`} aria-pressed={active} className={`cl-cell ${unit ? 'cl-' + unit.side : ''} ${legal ? 'cl-legal' : ''} ${active ? 'cl-selected' : ''}`} onClick={() => selectCell(at)} disabled={!playable}>
            <span className="cl-coord">{posLabel(at)}</span>
            {unit ? <><span className={`cl-unit cl-unit-${unit.side}`} /><b className="cl-unit-name">{unit.side === 'xiu' ? '修' : '天'}·{LABELS[unit.kind]}</b><span className="cl-unit-dir">{ARROWS[unit.direction]}</span><span className="cl-hp">{'●'.repeat(unit.hp)}{'○'.repeat(3 - unit.hp)}</span></> : shrine ? <span className="cl-shrine">♜<small>祭壇</small></span> : spring ? <span className="cl-spring">ϟ<small>雙方＋1</small></span> : <span className="cl-empty">{target === at ? '落點' : '·'}</span>}
          </button>
        })}{preview?.attack && preview.attack.path.length > 0 && <svg className="cl-ray" viewBox="0 0 400 400" aria-label="預覽攻擊路徑"><defs><marker id="cl-ray-tip" markerWidth="8" markerHeight="8" refX="4" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="#ffd687" strokeWidth="1.6" /></marker></defs><line x1={(preview.attack.from % 4) * 100 + 50} y1={Math.floor(preview.attack.from / 4) * 100 + 50} x2={(preview.attack.path.at(-1)! % 4) * 100 + 50} y2={Math.floor(preview.attack.path.at(-1)! / 4) * 100 + 50} markerEnd="url(#cl-ray-tip)" />{preview.attack.targetId && <text x={(preview.attack.path.at(-1)! % 4) * 100 + 50} y={Math.floor(preview.attack.path.at(-1)! / 4) * 100 + 75}>傷害 {preview.attack.damage}</text>}</svg>}</div>
        <p className="cl-board-note">祭壇四周兵多者控制 · 輪末每壇＋1分<br />箭頭是下次攻擊方向，棋子不會自動反擊。</p>
      </section>
      <aside className="cl-command">
        <div className="cl-turn" aria-live="polite">{game.status === 'finished' ? '本局結束' : `${NAMES[game.turn]}這一手`}<span>手牌 {game.hands[game.turn].length} · 牌庫 {game.decks[game.turn].length}</span></div>
        {game.status === 'finished' ? <section className="cl-result"><h2>{game.winner === 'draw' ? '雙方平手' : options.opponent === 'local' ? `${NAMES[game.winner!]}獲勝` : game.winner === 'xiu' ? '阿修羅勝利' : '天眾獲勝，你落敗'}</h2><p>累計祭壇分 {game.scores.xiu}：{game.scores.tian}</p><button onClick={() => start(options)}>相同種子重開</button><button className="cl-secondary" onClick={() => start({ ...options, seed: `nitian-${Date.now().toString(36)}` })}>新種子重開</button><button className="cl-secondary" onClick={() => setModal('feedback')}>這局感覺如何</button></section> : <>
          <p className="cl-prompt" aria-live="polite">{prompt}</p>
          <div className="cl-hand" aria-label="本方手牌">{!handoff && human ? game.hands[game.turn].map(item => <button key={item.id} data-testid={`cl-card-${item.kind}`} aria-pressed={cardId === item.id} disabled={!playable} onClick={() => selectCard(item.id)} className={`cl-card cl-card-${item.kind} ${cardId === item.id ? 'cl-chosen' : ''}`}><span className="cl-card-art" /><b>{LABELS[item.kind]}</b></button>) : <p className="cl-hidden">對手手牌隱藏</p>}</div>
          {card && <p className="cl-description">{DESCRIPTIONS[card.kind]}{card.kind === 'shift' && pieceId && <button onClick={() => { setPieceId(null); setTarget(null) }}>重選棋子</button>}</p>}
          {card && <div className="cl-directions" aria-label="攻擊方向">{directions.map(d => <button key={d} aria-label={`朝${ARROWS[d]}`} aria-pressed={direction === d} disabled={!playable || !activeKind} onClick={() => setDirection(d)}>{ARROWS[d]}</button>)}</div>}
          <section className="cl-preview" aria-label="這一手預覽" aria-live="polite">{preview ? <><b>預覽 · 確認後才生效</b><p>{preview.attack?.targetId ? `傷害 ${preview.attack.damage}＝基礎2${preview.attack.springBonus ? '＋雷泉1' : ''}。` : preview.attack ? ({ friend: '友軍擋住攻擊。', altar: '祭壇擋住攻擊。', spring: '雷泉擋住攻擊。', edge: '此方向沒有命中敵人。', range: '射程內沒有敵人。', enemy: '' }[preview.attack.reason]) : '這手不造成傷害。'}{preview.events.filter(e => e.type === 'death').map(e => e.text).join(' ')}</p><p>{game.turnInRound === 1 ? `輪末加分：修＋${preview.state.scores.xiu - game.scores.xiu}／天＋${preview.state.scores.tian - game.scores.tian}。` : '尚未輪末，對手還能改變祭壇控制。'}{preview.state.status === 'finished' ? '這手後結束本局。' : `下手：${NAMES[preview.state.turn]}。`}</p></> : <p>{notice || (card ? '選擇落點與方向，這裡會顯示實際結果。' : '先選牌，再看這一手如何改變爭奪。')}</p>}</section>
          {notice && preview && <p role="status">{notice}</p>}
        </>}
        <div className="cl-tools"><button onClick={() => setModal('log')}>逐手紀錄</button><button onClick={exportGame}>下載JSON</button>{pwa.install && <button onClick={() => void pwa.install?.()}>安裝到手機</button>}</div>
      </aside>
    </div>
    {game.status === 'playing' && <footer className="cl-footer"><button className="cl-secondary" disabled={!playable || !card} onClick={clearDraft}>取消</button><button className="cl-confirm" disabled={!playable || !action} onClick={() => action && commit(action)}>確認這一手</button><button className="cl-secondary" disabled={!playable || !card} onClick={() => card && commit({ type: 'prepare', cardId: card.id })}>棄牌整備</button>{!game.hands[game.turn].length && <button disabled={!playable} onClick={() => commit({ type: 'pass' })}>無牌・過手</button>}</footer>}
    <p className="cl-version">0.6候選原型 · 程式驗證不代表已確認好玩<br /><a href="?mode=tactics">對照0.5走格版</a> · <a href="?mode=realm">對照0.4共享神域</a></p>
    {modal === 'help' && <Dialog title="一張牌，改變一場爭奪" close={() => setModal(null)}><p>每手出一張牌。每輪雙方各一手後，A2與D3祭壇各由周圍兵多者得1分；平兵中立。最後比累計分。</p><p>槍將直線1–2格、刃將斜向1格，基礎傷害2；棋子3生命，死亡移除。友軍、祭壇與雷泉都擋住槍的射線。</p><p>雷泉放下就讓相鄰一名友軍出手；相鄰雷泉攻擊＋1，雙方都能借，且不疊加。</p><p>變陣把一名友軍移一格或與鄰兵換位，再攻擊；也能原地再打。被交換的人不出手。</p><p>棋子不自動反擊。每輪先手交換，所以輪末與下一輪初可能同一方連續行動。手牌留著，每方第二手起抽1張。</p><p>棄牌整備也用掉一手。箭頭表示下次啟動的方向，不代表敵人已鎖定下一手。</p><p>手機Safari可用分享選單「加入主畫面」。</p></Dialog>}
    {modal === 'settings' && <Dialog title="開始一場奪勢" close={() => setModal(null)}><label>局型<select value={draftOptions.scenario} onChange={e => setDraftOptions({ ...draftOptions, scenario: e.target.value as Options['scenario'] })}><option value="full">六輪交鋒</option><option value="study">兩輪試局・固定起手</option></select></label><label>對手<select value={draftOptions.opponent} onChange={e => setDraftOptions({ ...draftOptions, opponent: e.target.value as Options['opponent'] })}><option value="ai">天眾AI</option><option value="local">同一手機輪流</option></select></label><label>第一輪先手<select disabled={draftOptions.scenario === 'study'} value={draftOptions.first} onChange={e => setDraftOptions({ ...draftOptions, first: e.target.value as Side })}><option value="xiu">阿修羅</option><option value="tian">天眾</option></select></label><label>種子<input value={draftOptions.seed} maxLength={80} onChange={e => setDraftOptions({ ...draftOptions, seed: e.target.value })} /></label><label className="cl-checkbox"><input type="checkbox" checked={draftOptions.reduced} onChange={e => setDraftOptions({ ...draftOptions, reduced: e.target.checked })} />減少動態</label><button onClick={() => start(draftOptions)}>開始新局</button></Dialog>}
    {modal === 'log' && <Dialog title="逐手紀錄" close={() => setModal(null)}>{game.history.length ? game.history.map((turn, i) => <article key={i}><b>第{i + 1}手</b>{turn.events.map((event, j) => <p key={j}>{event.text}</p>)}</article>) : <p>尚未出牌。</p>}</Dialog>}
    {modal === 'feedback' && <Dialog title="留下這局感受" close={() => setModal(null)}><label>哪一手有意思，或哪裡仍無聊？<textarea value={feedback} maxLength={1000} onChange={e => setFeedback(e.target.value)} /></label><button onClick={() => { if (saveFinished()) { setNotice('已保存回饋，可隨JSON下載。'); setModal(null) } }}>保存回饋</button></Dialog>}
    {handoff && game.status === 'playing' && <Dialog title={`交給${NAMES[game.turn]}`} fixed close={() => {}}><p>請將手機交給{NAMES[game.turn]}，準備好再顯示手牌。</p><button onClick={() => setHandoff(false)}>準備好了・顯示手牌</button></Dialog>}
  </main>
}
