import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { applyAction, controlled, coord, createMatch, damageBreakdown, legalActions, opponent } from './tactics/engine'
import type { Action, CardId, MatchState, Side, Weapon } from './tactics/engine'
import { CARDS } from './tactics/cards'
import { chooseAIAction } from './tactics/ai'
import { DEFAULT_SETTINGS, exportMatch, loadHistory, loadSettings, saveRecord, saveSettings } from './tactics/storage'
import type { Settings } from './tactics/storage'
import { usePwa } from './pwa'
import './tactics.css'

const NAMES: Record<Side, string> = { asura: '阿修羅', deva: '天眾' }
const WEAPONS: Record<Weapon, string> = { unarmed: '徒手', spear: '長槍', blade: '月刃' }
const PATTERNS: Record<Weapon, string> = { unarmed: '↑ ↓ ← → · 相鄰', spear: '↑ ↓ ← → · 1–2格', blade: '↖ ↗ ↙ ↘ · 相鄰' }
const CARD_INFO: Record<CardId, { icon: string; tag: string; short: string }> = {
  spear: { icon: '♜', tag: '裝備', short: '直向1–2格 · 傷害2' },
  blade: { icon: '☽', tag: '裝備', short: '四斜角相鄰 · 傷害3' },
  dash: { icon: '➶', tag: '戰技', short: '正交移動最多兩格' },
  fog: { icon: '≋', tag: '地形', short: '阻擋隔格攻擊，可通行' },
  spring: { icon: 'ϟ', tag: '神力', short: '相鄰攻擊＋1，雙方共用' },
  blood: { icon: '♨', tag: '誓約', short: '獻出己方壇，本回合攻擊＋2' },
}
type Mode = 'move' | 'attack' | 'claim' | 'card'
type Modal = 'rules' | 'new' | 'log' | 'help' | 'result' | 'handoff' | null

function initialSettings(): Settings {
  const saved = loadSettings()
  const query = new URLSearchParams(location.search)
  if (query.get('scenario') === 'lesson') saved.scenario = 'lesson'
  if (query.get('scenario') === 'full') saved.scenario = 'full'
  if (query.get('seed')) saved.seed = query.get('seed')!.slice(0, 80)
  if (query.get('opponent') === 'local') saved.opponent = 'local'
  return saved
}

function Sprite({ kind, className = '' }: { kind: Side | 'asura-shrine' | 'deva-shrine'; className?: string }) {
  return <span aria-hidden="true" className={`tk-sprite tk-sprite-${kind} ${className}`} />
}

function actionTitle(action: Action | null): string {
  if (!action) return '選擇目標'
  if (action.type === 'move') return '確認移動'
  if (action.type === 'attack') return '確認攻擊'
  if (action.type === 'claim') return '確認占壇'
  if (action.type === 'card') return '確認出牌'
  return '結束回合'
}

export default function TacticsApp() {
  const [settings, setSettings] = useState<Settings>(initialSettings)
  const [draft, setDraft] = useState<Settings>(settings)
  const [game, setGame] = useState<MatchState>(() => createMatch(settings))
  const gameRef = useRef(game)
  const [mode, setMode] = useState<Mode>('move')
  const [card, setCard] = useState<string | null>(null)
  const [pending, setPending] = useState<Action | null>(null)
  const [modal, setModal] = useState<Modal>(settings.opponent === 'local' ? 'handoff' : null)
  const [handoff, setHandoff] = useState(settings.opponent === 'local')
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [notice, setNotice] = useState('先移動靠近界壇；點祭壇可查看守護與占領條件。')
  const [storageError, setStorageError] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [helpStep, setHelpStep] = useState(0)
  const dialogRef = useRef<HTMLElement | null>(null)
  const recordedGame = useRef<MatchState | null>(null)
  const pwa = usePwa()
  const actor = game.players[game.turn]
  const viewer: Side = settings.opponent === 'local' ? game.turn : settings.player
  const humanTurn = settings.opponent === 'local' || game.turn === settings.player
  const interactive = game.status === 'playing' && humanTurn && !busy && !modal && !handoff
  const legal = useMemo(() => legalActions(game), [game])
  const selectedCard = actor.hand.find(c => c.instanceId === card)
  const candidates = legal.filter(a => mode === 'card' ? a.type === 'card' && a.instanceId === card : a.type === mode)
  const targetOf = (a: Action) => a.type === 'move' || a.type === 'attack' ? a.to : a.type === 'claim' ? a.at : a.type === 'card' ? a.to : undefined
  const targets = new Set(candidates.map(targetOf).filter((at): at is number => at !== undefined))
  const preview = pending ? applyAction(game, pending) : null
  const previewText = preview && preview !== game ? preview.log.slice(game.log.length).filter(e => e.type !== 'draw' && e.type !== 'turn').map(e => e.text).join(' · ') : ''
  const counts = controlled(game)
  const damage = damageBreakdown(game, game.turn)
  const hand = handoff ? [] : game.players[viewer].hand
  const closeModal = useCallback(() => setModal(handoff ? 'handoff' : null), [handoff])

  const commit = useCallback((action: Action) => {
    if (locked.current || gameRef.current.status !== 'playing') return
    const previous = gameRef.current
    const next = applyAction(previous, action)
    if (next === previous) { setNotice('目前無法執行這個行動，請重新選擇。'); return }
    locked.current = true
    setBusy(true)
    gameRef.current = next
    setGame(next)
    setPending(null)
    setCard(null)
    setMode('move')
    if (settings.opponent === 'local' && next.turnNumber !== previous.turnNumber && next.status === 'playing') { setHandoff(true); setModal('handoff') }
    setNotice(next.log.slice(previous.log.length).map(e => e.text).join(' · '))
    releaseTimer.current = setTimeout(() => { locked.current = false; setBusy(false) }, 280)
  }, [settings.opponent])

  useEffect(() => () => { if (releaseTimer.current) clearTimeout(releaseTimer.current) }, [])
  useEffect(() => { const previous = document.title; document.title = '逆天｜神壇交鋒 0.5'; return () => { document.title = previous } }, [])

  useEffect(() => {
    if (game.status !== 'playing' || busy || modal || settings.opponent !== 'ai' || game.turn === settings.player) return
    const snapshot = game
    const timer = setTimeout(() => {
      if (gameRef.current !== snapshot || locked.current) return
      const action = chooseAIAction(snapshot)
      if (action) commit(action)
    }, settings.reduced ? 180 : 650)
    return () => clearTimeout(timer)
  }, [game, busy, modal, settings.opponent, settings.player, settings.reduced, commit])

  useEffect(() => {
    if (!modal || !dialogRef.current) return
    const previous = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    const items = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]'))
    items()[0]?.focus()
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modal !== 'handoff') { e.preventDefault(); closeModal() }
      if (e.key !== 'Tab') return
      const list = items(), first = list[0], last = list[list.length - 1]
      if (!first) { e.preventDefault(); return }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [modal, closeModal])

  useEffect(() => {
    if (game.status !== 'finished' || recordedGame.current === game) return
    recordedGame.current = game
    setStorageError(!saveRecord(game, settings))
    setModal('result')
  }, [game, settings])

  function start(next: Settings) {
    if (releaseTimer.current) clearTimeout(releaseTimer.current)
    locked.current = false
    setBusy(false)
    const fresh = createMatch(next)
    gameRef.current = fresh
    setGame(fresh)
    setSettings(next)
    setDraft(next)
    setStorageError(!saveSettings(next))
    setPending(null)
    setCard(null)
    setMode('move')
    setFeedback('')
    recordedGame.current = null
    setHandoff(next.opponent === 'local')
    setModal(next.opponent === 'local' ? 'handoff' : null)
    setNotice(next.scenario === 'lesson' ? '練習盤：長槍直向攻擊。選「攻擊」，再點D3查看傷害來源。' : '八輪爭奪四座界壇。先移動，再占壇；神力要從手牌施放。')
  }

  function selectMode(next: Mode) {
    setMode(next); setCard(null); setPending(null)
    setNotice(next === 'move' ? '亮起的格子可移動，一步花一行動。' : next === 'attack' ? `武器：${WEAPONS[actor.weapon]}。${PATTERNS[actor.weapon]}；每回合最多攻擊一次。` : '站在壇上或正交相鄰可占壇；敵將貼身守護時，先逼退或擊倒。')
  }

  function selectCard(instanceId: string) {
    if (!interactive) return
    const found = actor.hand.find(c => c.instanceId === instanceId)
    if (!found) return
    setMode('card'); setCard(instanceId); setPending(null)
    setNotice(`${CARDS[found.id].name}：${CARDS[found.id].description}`)
    const ready = legal.find(a => a.type === 'card' && a.instanceId === instanceId && a.to === undefined)
    if (ready) setPending(ready)
    else if (!legal.some(a => a.type === 'card' && a.instanceId === instanceId)) setNotice(`${CARDS[found.id].name}目前沒有合法目標。${CARDS[found.id].description}`)
  }

  function inspectCell(at: number) {
    const tile = game.board[at]
    const unit = (['asura', 'deva'] as Side[]).find(side => game.players[side].pos === at)
    const content = [coord(at), unit && `${NAMES[unit]}・生命${game.players[unit].hp}・${WEAPONS[game.players[unit].weapon]}`, tile?.kind === 'shrine' ? `${tile.owner ? NAMES[tile.owner] : '中立'}界壇` : tile?.kind === 'spring' ? '雷泉：正交相鄰雙方攻擊＋1，不疊加；阻擋移動。' : tile?.kind === 'fog' ? '迷霧：可通行，阻擋隔格攻擊。' : '空地'].filter(Boolean).join(' · ')
    setNotice(content)
  }

  function clickCell(at: number) {
    if (!interactive) { inspectCell(at); return }
    const action = candidates.find(a => targetOf(a) === at)
    if (action) setPending(action)
    else { setPending(null); inspectCell(at) }
  }

  function download() {
    if (game.status !== 'finished') return
    const blob = new Blob([exportMatch(game, settings, feedback)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `nitian-tactics-${game.seed.replace(/[^a-z0-9_-]/gi, '_')}.json`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function openNew() { setDraft({ ...settings }); setModal('new') }
  const chosenTarget = pending ? targetOf(pending) : undefined
  const lastEvent = [...game.log].reverse().find(e => e.type === 'attack' || e.type === 'move' || e.type === 'claim' || e.type === 'card')

  return <main className={`tactics-app ${settings.reduced ? 'tk-reduced' : ''}`} style={{ '--tk-unit-atlas': `url("${import.meta.env.BASE_URL}art/tactics-units.png")`, '--tk-card-atlas': `url("${import.meta.env.BASE_URL}art/tactics-cards.png")` } as CSSProperties} data-testid="tactics-app" data-turn={game.turn} data-serial={game.serial} data-status={game.status}>
    <div className="tk-clouds" aria-hidden="true" />
    <div className="tk-surface" inert={!!modal}>
    <header className="tk-header">
      <a className="tk-logo" href="?mode=tactics">逆天 <small>NITIAN · 神壇交鋒</small></a>
      <nav aria-label="遊戲選單"><button onClick={() => { setHelpStep(0); setModal('help') }}>教學</button><button onClick={() => setModal('log')}>紀錄</button><button onClick={openNew}>新局</button></nav>
    </header>
    {(pwa.updateAvailable || pwa.error || storageError) && <div className="tk-system" role="status">
      {pwa.updateAvailable && <button onClick={() => { if (game.status === 'finished' || confirm('更新會重新開始目前對局，確定更新？')) pwa.update() }}>有新版，立即更新</button>}
      {pwa.error && <span>離線更新暫不可用，連網後重試。</span>}
      {storageError && <span>本機儲存不可用，仍可繼續玩；終局可匯出紀錄。</span>}
    </div>}
    <div className="tk-layout">
      <section className="tk-battle" aria-label="神壇戰場">
        <div className="tk-opponent-bar">
          <Sprite kind={opponent(viewer)} className="tk-portrait" />
          <div><strong>{NAMES[opponent(viewer)]}</strong><span className="tk-hp"><i style={{ width: `${game.players[opponent(viewer)].hp / 6 * 100}%` }} /></span><small>生命 {game.players[opponent(viewer)].hp}/6 · {WEAPONS[game.players[opponent(viewer)].weapon]} · 手牌 {game.players[opponent(viewer)].hand.length}</small></div>
          <div className="tk-round"><strong>第 {game.round} 輪</strong><small>{game.scenario === 'lesson' ? '練習盤' : '完整局'} · 共8輪</small></div>
        </div>
        <div className="tk-scoreline"><span className="tk-score-asura">修羅界壇 <b>{counts.asura}</b></span><span>{game.status === 'finished' ? '對局結束' : `${NAMES[game.turn]}${humanTurn ? '行動' : '思考中…'}`}</span><span className="tk-score-deva"><b>{counts.deva}</b> 天眾界壇</span></div>
        <div className={`tk-board-frame ${busy ? 'tk-resolving' : ''}`}>
          <div className="tk-column-labels" aria-hidden="true">{'ABCD'.split('').map(c => <span key={c}>{c}</span>)}</div>
          <div className="tk-row-labels" aria-hidden="true">{[1, 2, 3, 4].map(c => <span key={c}>{c}</span>)}</div>
          <div className="tk-board" role="group" aria-label="四乘四棋盤">
            {game.board.map((tile, at) => {
              const unit = (['asura', 'deva'] as Side[]).find(side => game.players[side].pos === at)
              const label = `${coord(at)} ${unit ? `${NAMES[unit]}主將 ` : ''}${tile?.kind === 'shrine' ? `${tile.owner ? NAMES[tile.owner] : '中立'}界壇` : tile?.kind === 'spring' ? '共用雷泉' : tile?.kind === 'fog' ? '迷霧' : '空地'}`
              const targeted = chosenTarget === at
              return <button key={at} className={`tk-cell tk-domain-${Math.floor(at / 8) * 2 + Math.floor(at % 4 / 2)} ${unit ? `tk-unit-${unit}` : ''} ${targets.has(at) && interactive ? 'tk-legal' : ''} ${targeted ? 'tk-targeted' : ''} ${unit === game.turn ? 'tk-actor' : ''} ${busy && lastEvent?.to === at ? 'tk-impact' : ''}`} aria-label={label} aria-pressed={targeted} data-testid={`tactics-cell-${coord(at)}`} data-legal={targets.has(at) && interactive} onClick={() => clickCell(at)}>
                <span className="tk-cell-coordinate">{coord(at)}</span>
                {tile?.kind === 'shrine' && (tile.owner ? <Sprite kind={`${tile.owner}-shrine`} className={unit ? 'tk-under-unit' : ''} /> : <span className="tk-neutral-shrine" aria-hidden="true">♜</span>)}
                {tile?.kind === 'spring' && <span className="tk-spring" aria-hidden="true"><span>ϟ</span></span>}
                {tile?.kind === 'fog' && <span className="tk-fog" aria-hidden="true">≋</span>}
                {unit && <><Sprite kind={unit} /><span className="tk-unit-badge">{unit === 'asura' ? '修' : '天'} · {game.players[unit].hp}♥</span></>}
                {!unit && tile && <span className="tk-tile-label">{tile.kind === 'shrine' ? tile.owner ? `${tile.owner === 'asura' ? '修' : '天'}壇` : '中立壇' : tile.kind === 'spring' ? '雷泉' : '迷霧'}</span>}
                {targets.has(at) && interactive && !unit && !tile && <span className="tk-target-dot" aria-hidden="true">◇</span>}
                {targeted && <span className="tk-reticle" aria-hidden="true" />}
              </button>
            })}
          </div>
          {pending?.type === 'attack' && <svg className="tk-attack-line" viewBox="0 0 400 400" aria-hidden="true"><defs><marker id="tk-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="#ffe3a0" strokeWidth="2" /></marker></defs><line x1={actor.pos % 4 * 100 + 50} y1={Math.floor(actor.pos / 4) * 100 + 50} x2={pending.to % 4 * 100 + 50} y2={Math.floor(pending.to / 4) * 100 + 50} stroke="#ffe3a0" strokeWidth="3" strokeDasharray="7 5" markerEnd="url(#tk-arrow)" /></svg>}
        </div>
        <div className="tk-domain-key" aria-label="四壇歸屬">{[0, 3, 12, 15].map(at => { const tile = game.board[at]; return <span key={at} data-owner={tile?.kind === 'shrine' ? tile.owner || 'neutral' : 'neutral'}>{coord(at)} <b>{tile?.kind === 'shrine' && tile.owner ? tile.owner === 'asura' ? '修' : '天' : '無主'}</b></span> })}</div>
      </section>
      <section className="tk-command" aria-label="主將與手牌">
        <div className="tk-own-bar"><Sprite kind={viewer} className="tk-portrait" /><div><strong>{NAMES[viewer]}</strong><small>生命 {game.players[viewer].hp}/6 · 擊倒 {game.players[viewer].knockouts}</small></div><div className="tk-weapon-info"><strong>{WEAPONS[game.players[viewer].weapon]}</strong><small>{PATTERNS[game.players[viewer].weapon]}</small></div></div>
        <div className="tk-action-heading"><span>{humanTurn ? '本回合行動' : '等待對手'} <b className="tk-ap" aria-label={`剩餘${game.ap}行動`}>{Array.from({ length: 2 }, (_, i) => <i key={i} className={i < game.ap ? 'tk-ap-lit' : ''}>◆</i>)}</b></span><button className="tk-rule-link" onClick={() => setModal('rules')}>規則</button></div>
        <div className="tk-modes" role="group" aria-label="基本行動">
          {([['move', '➶', '移動'], ['attack', '⚔', '攻擊'], ['claim', '⚑', '占壇']] as const).map(([key, icon, label]) => <button key={key} disabled={!interactive || !legal.some(a => a.type === key)} aria-pressed={mode === key} onClick={() => selectMode(key)}><span aria-hidden="true">{icon}</span>{label}</button>)}
        </div>
        <div className="tk-instruction" role="status" aria-live="polite">{pending ? previewText || '確認後使用一個行動。' : notice}</div>
        <div className="tk-hand-label"><span>{settings.opponent === 'local' ? `${NAMES[viewer]}手牌` : '你的手牌'} <b>{hand.length}/6</b></span><span>牌庫 {game.players[viewer].deck.length} · 棄牌 {game.players[viewer].discard.length}</span></div>
        <div className="tk-hand" aria-label="手牌">
          {hand.map(c => <button key={c.instanceId} className={`tk-card tk-card-${c.id} ${card === c.instanceId ? 'tk-card-selected' : ''}`} disabled={!interactive || game.turn !== viewer} aria-pressed={card === c.instanceId} aria-label={`${CARDS[c.id].name}：${CARD_INFO[c.id].short}`} data-testid={`tactics-card-${c.id}`} onClick={() => selectCard(c.instanceId)}>
            <small>{CARD_INFO[c.id].tag}<span>◆ 1</span></small><span className="tk-card-art" aria-hidden="true">{CARD_INFO[c.id].icon}</span><strong>{CARDS[c.id].name}</strong><span className="tk-card-desc">{CARD_INFO[c.id].short}</span>
          </button>)}
          {!hand.length && <p className="tk-muted">{modal === 'handoff' ? '換手後顯示手牌。' : '暫無手牌。移動、攻擊與占壇仍可使用。'}</p>}
        </div>
        <div className="tk-turn-foot"><button disabled={!interactive} onClick={() => { setPending({ type: 'end' }); setNotice('提早結束會放棄剩餘行動。') }}>結束回合</button><span>{selectedCard ? CARDS[selectedCard.id].name : '占壇優先 · 擊倒為次判定'}</span></div>
        <p className="tk-prototype">試玩版 0.5 · 神壇交鋒 <button onClick={() => setModal('help')}>先學一手</button> <a href="?mode=realm">回共享神域0.4</a></p>
      </section>
    </div>
    <footer className="tk-confirm-bar"><div className="tk-confirm-summary"><strong>{pending?.type === 'attack' ? `預估傷害 ${damage.total}` : pending ? actionTitle(pending).replace('確認', '') : `${NAMES[game.turn]} · ${game.ap}行動`}</strong><small>{pending?.type === 'attack' ? `${WEAPONS[actor.weapon]}${damage.base}${damage.spring ? '＋雷泉1' : ''}${damage.blood ? `＋血誓${damage.blood}` : ''}` : pending?.type === 'end' ? '放棄剩餘行動，輪到對手' : '確認前可取消；每步即時生效'}</small></div><button disabled={!pending || !interactive} onClick={() => { setPending(null); setNotice('已取消預覽，沒有消耗行動或卡牌。') }}>取消</button><button className="tk-primary" disabled={!pending || !interactive} onClick={() => pending && commit(pending)}>{busy ? '結算中…' : actionTitle(pending)}</button></footer>
    </div>
    {modal && <div className="tk-modal-backdrop" onClick={() => modal !== 'handoff' && closeModal()}><section ref={dialogRef} className={`tk-modal tk-modal-${modal}`} role="dialog" aria-modal="true" aria-labelledby="tk-modal-title" onClick={e => e.stopPropagation()}>
      <header><h2 id="tk-modal-title">{modal === 'new' ? '踏入新的神域' : modal === 'rules' ? '神壇交鋒・規則' : modal === 'log' ? '本局紀錄' : modal === 'result' ? '神域已有歸屬' : modal === 'handoff' ? `請交給${NAMES[game.turn]}` : '先學一手'}</h2>{modal !== 'handoff' && <button aria-label="關閉視窗" onClick={closeModal}>×</button>}</header>
      {modal === 'help' && <><div className="tk-help-art"><Sprite kind="asura" /><span>{['看懂武器，找出角度', '先預覽，再親手出招', '打退主將，才能占壇'][helpStep]}</span></div><p>{['長槍打上下左右1–2格；月刃只打相鄰斜角。先看方向，不用背整個牌庫。', '選動作或卡牌，再點亮起的格子。確認前只是在預覽；雷泉使相鄰的雙方攻擊＋1。', '靠近四角祭壇後，選「占壇」。敵將在壇上或貼身守護時，先用走位與交戰逼退對方。'][helpStep]}</p><div className="tk-help-steps">{[0, 1, 2].map(i => <button key={i} aria-label={`教學第${i + 1}步`} aria-pressed={helpStep === i} onClick={() => setHelpStep(i)}>{i + 1}</button>)}</div><button className="tk-primary" onClick={() => start({ ...settings, scenario: 'lesson', first: 'asura', player: 'asura', opponent: 'ai' })}>載入練習盤 · 試打傷害3</button><button onClick={() => setModal(null)}>回到目前對局</button><small>載入練習會重開目前對局；不是要求照唯一解出牌。</small></>}
      {modal === 'rules' && <div className="tk-rule-copy"><p><b>目標：</b>雙方各八回合。終局先比四角界壇控制數，再比擊倒次數，仍相同則平手。</p><p><b>行動：</b>每回合兩行動，移動、攻擊、占壇或出牌各用一個。每回合只能攻擊一次，沒有自動反擊。</p><p><b>占壇：</b>站在壇上或正交相鄰可以占領；敵將在壇上或正交相鄰時不可占領。壇與迷霧可走，雷泉不可走。</p><p><b>武器：</b>徒手直向相鄰傷害2；長槍直向1–2格傷害2；月刃斜向相鄰傷害3。新武器取代舊武器。</p><p><b>雷泉與迷霧：</b>雷泉讓正交相鄰主將攻擊＋1，雙方共用、不疊加，也阻擋移動與隔格攻擊。迷霧可通行，隔格攻擊不能穿霧或打進霧中；相鄰攻擊不受影響。</p><p><b>血誓：</b>交出一座己方壇，換本回合下一次攻擊＋2。回合結束消失，不疊加。</p><p><b>擊倒：</b>生命歸零立即回出生區並回滿生命，下一個自己的回合只有一行動。不是擊殺即勝。</p><p><b>抽牌：</b>六種卡各兩張，開局抽四，每個後續自己的回合抽一；棄牌會洗回，最多六張，手牌可保留。沒有抽到神力仍能移動、攻擊與占壇。</p><p><b>公平AI：</b>使用同樣行動與牌組，不讀你的手牌或未來牌序。預估只保證本步，不預測對手下一手。</p><label className="tk-check"><input type="checkbox" checked={settings.reduced} onChange={e => { const next = { ...settings, reduced: e.target.checked }; setSettings(next); setStorageError(!saveSettings(next)) }} />減少動態效果</label>{pwa.install && <button onClick={() => void pwa.install?.()}>加入手機主畫面</button>}<small>iPhone：Safari分享 → 加入主畫面。首次連網載入後可離線遊玩。未完成局不保存。</small></div>}
      {modal === 'new' && <form onSubmit={e => { e.preventDefault(); start({ ...draft, seed: draft.seed.trim() || DEFAULT_SETTINGS.seed }) }}><p>目前對局會重新開始；已完成紀錄保留。</p><label>局面<select value={draft.scenario} onChange={e => setDraft({ ...draft, scenario: e.target.value as Settings['scenario'] })}><option value="full">完整局 · 八輪爭壇</option><option value="lesson">練習盤 · 長槍對月刃</option></select></label><label>對手<select value={draft.opponent} onChange={e => setDraft({ ...draft, opponent: e.target.value as Settings['opponent'] })}><option value="ai">人機對局</option><option value="local">同機雙人 · 換手遮牌</option></select></label><label>你的陣營<select value={draft.player} onChange={e => setDraft({ ...draft, player: e.target.value as Side })}><option value="asura">阿修羅</option><option value="deva">天眾</option></select></label><label>先手<select value={draft.first} onChange={e => setDraft({ ...draft, first: e.target.value as Side })}><option value="asura">阿修羅先手</option><option value="deva">天眾先手</option></select></label><label>種子<input value={draft.seed} maxLength={80} onChange={e => setDraft({ ...draft, seed: e.target.value })} /></label><button type="submit" className="tk-primary">開始新局</button></form>}
      {modal === 'handoff' && <><Sprite kind={game.turn} className="tk-handoff-art" /><p>請讓另一位玩家移開視線，再開啟自己的手牌。</p><button className="tk-primary" onClick={() => { setHandoff(false); setModal(null) }}>我是{NAMES[game.turn]}，開始行動</button><button onClick={openNew}>更換對局</button></>}
      {modal === 'log' && <><p className="tk-muted">每步立即生效；本頁開啟時AI暫停。本機已完成紀錄 {loadHistory().length}/20 局。</p><ol className="tk-log">{game.log.map(e => <li key={e.id}><small>第{e.round}輪 · {NAMES[e.side]}</small>{e.text}</li>)}</ol><button disabled={game.status !== 'finished'} onClick={download}>匯出本局JSON</button><small>終局後可匯出完整牌序與紀錄；進行中不公開隱藏手牌。</small></>}
      {modal === 'result' && <><div className="tk-result-emblem">{game.winner === 'draw' ? '平' : game.winner === 'asura' ? '修' : '天'}</div><h3>{game.winner === 'draw' ? '雙方勢均力敵' : `${NAMES[game.winner!]}取得神域`}</h3><p>界壇 {counts.asura}：{counts.deva} · 擊倒 {game.players.asura.knockouts}：{game.players.deva.knockouts}</p><p className="tk-muted">{game.reason}</p><label>這局最有感或最卡的地方？<textarea maxLength={1000} value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="例如：換月刃後真的會想繞路嗎？" /></label><button onClick={() => { setStorageError(!saveRecord(game, settings, feedback)); setNotice('已嘗試保存本局回饋；也可匯出JSON。') }}>儲存回饋</button><button onClick={download}>匯出本局JSON</button><div className="tk-result-actions"><button className="tk-primary" onClick={() => start(settings)}>同種子再戰</button><button onClick={() => start({ ...settings, seed: `nitian-${Date.now().toString(36)}` })}>新種子再戰</button></div><button onClick={() => setModal('log')}>查看完整交鋒紀錄</button><small>程式與瀏覽器驗證不代表真人已確認平衡或耐玩。</small></>}
    </section></div>}
  </main>
}
