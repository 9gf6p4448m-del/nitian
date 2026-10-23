import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Arena, Icon } from './Art'
import { CARDS } from './game/data'
import { applyDuelMove, chooseDuelMove, createDuel, nextDuelRound, passDuel, placeDuelCard, previewDuel, resolveDuel, type DuelResolution, type DuelState } from './game/duel'
import type { CombatEvent, Fighter, Side } from './game/types'
import { loadDuelPreferences, loadDuelRecords, saveDuelPreferences, saveDuelRecords, type DuelPreferences, type DuelRecord, type DuelTurnRecord } from './duel-storage'
import { usePwa } from './pwa'
import { explainEvent, explainTimeline } from './game/explanations'
import { EventExplanation, ResolutionLesson, RoundReplay, RoundSummary } from './ResolutionHelp'
import './style.css'
import './duel.css'

declare const __BUILD_TIME__: string
const NAMES = { player: '阿修羅', enemy: '雷衛' }
const randomSeed = () => `SUMERU-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const opener = document.activeElement
    const dialog = ref.current
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])
  return <dialog ref={ref} aria-label={title} onCancel={onClose}>
    <div className="modal-heading"><h2>{title}</h2><button aria-label="關閉視窗" onClick={onClose}>✕</button></div>{children}
  </dialog>
}

function Vitals({ fighter, side, expired = false }: { fighter: Fighter; side: Side; expired?: boolean }) {
  return <div className={`vitals ${side === 'enemy' ? 'enemy-vitals' : ''}`}>
    <div className="vitals-line"><span>{side === 'player' ? '我方 · 阿修羅' : '對方 · 雷衛'}</span><strong><b data-testid={`${side}-hp`}>{fighter.hp}</b><small> / {fighter.maxHp}</small></strong></div>
    <div className="hp-track" role="meter" aria-label={`${NAMES[side]}生命`} aria-valuemin={0} aria-valuemax={fighter.maxHp} aria-valuenow={fighter.hp}><i style={{ width: `${fighter.hp / fighter.maxHp * 100}%` }}/></div>
    <div className="resources"><span><Icon name="shield"/>盾 {fighter.shield}</span><span className="thunder-resource"><Icon name="bolt"/>雷 {fighter.thunder} / 6</span>{fighter.evade && <span>{expired ? '避鋒未用到・下回清除' : '避鋒待命・本回合'}</span>}{fighter.thorns && <span>{expired ? '倒刺未觸發・下回清除' : '倒刺待反擊・本回合'}</span>}</div>
  </div>
}

function exportJson(value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = `nitian-duel-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function DuelApp() {
  const [loaded] = useState(() => ({ preferences: loadDuelPreferences(), records: loadDuelRecords() }))
  const [preferences, setPreferences] = useState(loaded.preferences.value)
  const preferencesRef = useRef(preferences)
  const [records, setRecords] = useState(loaded.records.value)
  const recordsRef = useRef(records)
  const [storageProblem, setStorageProblem] = useState(!loaded.preferences.ok || !loaded.records.ok)
  const [game, setGame] = useState(() => createDuel(preferences.seed, preferences.firstSide))
  const gameRef = useRef(game)
  const [view, setView] = useState<'home' | 'battle' | 'result'>('home')
  const [selected, setSelected] = useState<string | null>(null)
  const [gap, setGap] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const [aiError, setAiError] = useState(false)
  const [aiAttempt, setAiAttempt] = useState(0)
  const [modal, setModal] = useState<'rules' | 'settings' | 'history' | 'restart' | 'install' | 'lesson' | 'replay' | null>(null)
  const [animation, setAnimation] = useState<{ result: DuelResolution; turn: DuelTurnRecord; index: number } | null>(null)
  const [paused, setPaused] = useState(false)
  const [lastEvents, setLastEvents] = useState<CombatEvent[]>([])
  const [resultRecord, setResultRecord] = useState<DuelRecord | null>(null)
  const [feedback, setFeedback] = useState('')
  const [offline, setOffline] = useState(!navigator.onLine)
  const [systemReduced, setSystemReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const runId = useRef(''), initialFirstSide = useRef<Side>(preferences.firstSide)
  const turns = useRef<DuelTurnRecord[]>([]), startedAt = useRef(performance.now())
  const settled = useRef(new Set<number>()), resolutionLock = useRef(false)
  const timelineRef = useRef<HTMLDivElement>(null)
  const pwa = usePwa()
  const reduced = preferences.reducedMotion || systemReduced
  const frame = animation?.result.events[animation.index]
  const display = frame?.after ?? game
  const canAct = view === 'battle' && game.status === 'placing' && game.activeSide === 'player' && !animation
  const thinking = view === 'battle' && game.status === 'placing' && game.activeSide === 'enemy' && !animation
  const used = (side: Side) => game.timeline.filter(card => card.side === side).length
  const selectedCard = game.decks.player.hand.find(card => card.instanceId === selected)
  const draft = useMemo(() => {
    if (!canAct || selected === null || gap === null) return null
    return placeDuelCard(game, 'player', selected, gap)
  }, [game, canAct, selected, gap])
  const preview = useMemo(() => ['placing', 'ready'].includes(game.status) && !animation ? previewDuel(draft ?? game) : null, [game, draft, animation])
  const events = animation ? animation.result.events.slice(0, animation.index + 1) : lastEvents
  const fatalEvent = view === 'result' ? [...lastEvents].reverse().find(event => (event.effect === 'attack' || event.effect === 'reflect') && event.target !== 'both' && event.after[event.target].hp === 0) : undefined
  const explanationTimeline = draft?.timeline ?? game.timeline
  const explanationEvents = preview?.events ?? events
  const explanations = useMemo(() => new Map(explainTimeline(explanationTimeline, explanationEvents, !animation).map(explanation => [explanationTimeline[explanation.index].instanceId, explanation])), [explanationTimeline, explanationEvents, animation])

  function updatePreferences(patch: Partial<DuelPreferences>) {
    const next = { ...preferencesRef.current, ...patch }
    preferencesRef.current = next; setPreferences(next)
    if (!saveDuelPreferences(next)) setStorageProblem(true)
  }
  function accept(next: DuelState) { gameRef.current = next; setGame(next) }
  function persist(next: DuelRecord[]) {
    recordsRef.current = next.slice(0, 20); setRecords(recordsRef.current)
    if (!saveDuelRecords(recordsRef.current)) setStorageProblem(true)
  }
  function start(seed = preferencesRef.current.seed, firstSide = preferencesRef.current.firstSide) {
    const next = createDuel(seed, firstSide)
    updatePreferences({ seed: next.seed, firstSide })
    accept(next); setView('battle'); setSelected(null); setGap(null); setNotice(''); setModal(null)
    setAnimation(null); setPaused(false); setLastEvents([]); setResultRecord(null); setFeedback(''); setAiError(false)
    initialFirstSide.current = firstSide; turns.current = []; settled.current = new Set()
    runId.current = crypto.randomUUID(); startedAt.current = performance.now(); resolutionLock.current = false
  }
  function place() {
    const current = gameRef.current
    if (current.status !== 'placing' || current.activeSide !== 'player' || selected === null || gap === null) return
    try {
      accept(placeDuelCard(current, 'player', selected, gap))
      setSelected(null); setGap(null); setNotice('已落牌鎖定。後續新牌仍可插入它前後。')
    } catch (error) { setNotice(error instanceof Error ? error.message : '落牌未成立，請重新選擇。') }
  }
  function stop() {
    const current = gameRef.current
    if (current.status !== 'placing' || current.activeSide !== 'player') return
    accept(passDuel(current, 'player')); setSelected(null); setGap(null)
    setNotice('你已停手，本回合不能再出牌；雷衛仍可用完三張額度。')
  }
  function finish(result: DuelResolution, turn: DuelTurnRecord) {
    if (settled.current.has(turn.round)) return
    settled.current.add(turn.round); turns.current = [...turns.current, turn]
    accept(result.nextState); setAnimation(null); setLastEvents(result.events)
    if (result.nextState.status === 'won' || result.nextState.status === 'lost') {
      const record: DuelRecord = {
        variant: 'alternating-v1', id: runId.current, seed: result.nextState.seed,
        initialFirstSide: initialFirstSide.current, completedAt: new Date().toISOString(),
        outcome: result.nextState.status, hp: result.nextState.player.hp, turns: turns.current, feedback: '',
      }
      setResultRecord(record); persist([record, ...recordsRef.current]); setView('result')
    }
  }
  function resolve() {
    const current = gameRef.current
    if (current.status !== 'ready' || resolutionLock.current) return
    resolutionLock.current = true
    const result = resolveDuel(current)
    const turn: DuelTurnRecord = {
      round: current.round, firstSide: current.firstSide,
      hands: structuredClone({ player: current.decks.player.hand, enemy: current.decks.enemy.hand }),
      timeline: structuredClone(current.timeline), moves: structuredClone(current.moves), events: result.events,
      decisionMs: Math.round(performance.now() - startedAt.current),
      after: { player: { ...result.nextState.player }, enemy: { ...result.nextState.enemy } },
    }
    setSelected(null); setGap(null); setNotice('')
    setPaused(false)
    if (reduced || !result.events.length) finish(result, turn)
    else setAnimation({ result, turn, index: 0 })
  }
  function advance() {
    if (gameRef.current.status !== 'resolved' || animation) return
    accept(nextDuelRound(gameRef.current)); setSelected(null); setGap(null); setLastEvents([])
    setNotice('先手交換。護盾清除，雷量保留。'); startedAt.current = performance.now()
    resolutionLock.current = false; setAiError(false)
  }
  function stepAnimation() {
    if (!animation || !paused) return
    if (animation.index + 1 >= animation.result.events.length) finish(animation.result, animation.turn)
    else setAnimation({ ...animation, index: animation.index + 1 })
  }

  useEffect(() => {
    if (!thinking || aiError || modal) return
    const current = game
    const timer = setTimeout(() => {
      if (gameRef.current !== current) return
      try {
        const move = chooseDuelMove(current)
        const next = applyDuelMove(current, move)
        gameRef.current = next; setGame(next)
        setNotice(move.kind === 'pass' ? '雷衛本回合停手。' : `雷衛已落牌，軌道新增一招。`)
      } catch (error) {
        setAiError(true); setNotice(`雷衛落牌失敗：${error instanceof Error ? error.message : '請重試。'}`)
      }
    }, 320)
    return () => clearTimeout(timer)
  }, [thinking, game, aiError, aiAttempt, modal])
  useEffect(() => {
    if (!animation) return
    if (paused || modal) return
    if (reduced) { finish(animation.result, animation.turn); return }
    const timer = setTimeout(() => {
      if (animation.index + 1 >= animation.result.events.length) finish(animation.result, animation.turn)
      else setAnimation({ ...animation, index: animation.index + 1 })
    }, 1000 / preferences.speed)
    return () => clearTimeout(timer)
  }, [animation, reduced, preferences.speed, paused, modal])
  useEffect(() => {
    const container = timelineRef.current
    if (!animation || !container || !frame) return
    if (animation.index === 0) container.scrollIntoView({ block: 'center', behavior: 'auto' })
    const active = container.querySelector<HTMLElement>(`[data-main-index="${frame.mainIndex}"]`)
    if (!active) return
    const outer = container.getBoundingClientRect(), inner = active.getBoundingClientRect()
    if (inner.top < outer.top) container.scrollTop += inner.top - outer.top
    else if (inner.bottom > outer.bottom) container.scrollTop += inner.bottom - outer.bottom
    if (inner.left < outer.left) container.scrollLeft += inner.left - outer.left
    else if (inner.right > outer.right) container.scrollLeft += inner.right - outer.right
  }, [animation?.index, frame?.mainIndex])
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const motion = () => setSystemReduced(media.matches)
    const network = () => setOffline(!navigator.onLine)
    media.addEventListener('change', motion); window.addEventListener('online', network); window.addEventListener('offline', network)
    return () => { media.removeEventListener('change', motion); window.removeEventListener('online', network); window.removeEventListener('offline', network) }
  }, [])

  return <div className={`app alternating-app ${reduced ? 'reduced-motion' : ''} ${animation ? 'is-resolving' : game.status === 'resolved' ? 'is-resolved' : ''}`}>
    <header className="site-header"><a className="brand" href={import.meta.env.BASE_URL} aria-disabled={!!animation} onClick={event => { event.preventDefault(); if (view === 'home' || animation) return; setModal('restart') }}><span className="brand-mark">逆</span><span>逆天<small>N I T I A N</small></span></a><div className="header-actions"><button onClick={() => setModal('lesson')}>教學</button><button onClick={() => setModal('rules')}>玩法</button><button onClick={() => setModal('history')}>交手紀錄</button><button onClick={() => setModal('settings')}>設定</button></div></header>
    <main className={`shell ${view === 'home' ? 'home-shell' : ''}`}>
      {storageProblem && <div className="banner" data-testid="storage-warning">本機保存無法使用或資料損壞；仍可交手，結束後可匯出紀錄。</div>}
      {offline && <div className="banner offline-banner">離線交手 · 遊戲與本機紀錄仍可使用</div>}
      {pwa.updateAvailable && <div className="banner">新版本已備妥。<button onClick={pwa.update}>更新並重開</button><small>未結束的交手不會保存。</small></div>}
      {pwa.error && <div className="banner">離線版本尚未備妥；目前可線上遊玩，請連線重試。</div>}
      {view === 'home' ? <>
        <section className="opening"><span className="eyebrow">須 彌 山 門 ／ 雙 方 交 手</span><h1>一招落定，<br/><em>天命未定。</em></h1><p>你一張，他一張。把招式插進彼此的布局。<br/>落牌即承諾，六招共同結算。</p></section>
        <Arena home/>
        <section className="start-panel" aria-label="交手設定">
          <div className="duel-promises"><span>雙方 45 生命</span><span>相同十張牌</span><span>各出最多三張</span></div>
          <div className="start-options"><label className="seed-label">交手種子<input aria-label="交手種子" value={preferences.seed} maxLength={80} onChange={event => updatePreferences({ seed: event.target.value })} spellCheck={false}/></label><label className="seed-label">首回合先手<select aria-label="首回合先手" value={preferences.firstSide} onChange={event => updatePreferences({ firstSide: event.target.value as Side })}><option value="player">我方先手</option><option value="enemy">雷衛先手</option></select></label><button className="primary begin" onClick={() => start()}>開始交手 <span aria-hidden="true">→</span></button></div>
          <p className="quiet">雙方手牌公開 · 每回合交換先手 · 相同種子可對照</p>
          <div className="lesson-invitation"><div><strong>第一次交手？先看三招怎麼結算。</strong><p>落牌還沒發動。倒刺先執行，之後挨打才會在同回合反擊。</p></div><button onClick={() => setModal('lesson')}>先學倒刺與順序</button></div>
          <a className="legacy-link" href="?legacy=1">進入原版借招對照 →</a>
        </section>
      </> : <>
        <section className="duel duel-stage" aria-label="對峙舞台"><div className="duel-vitals"><Vitals fighter={display.player} side="player" expired={game.status === 'resolved' && !animation}/><div className="round-emblem"><span>回合</span><b data-testid="round">{game.round}</b><small>{NAMES[game.firstSide]}先手</small></div><Vitals fighter={display.enemy} side="enemy" expired={game.status === 'resolved' && !animation}/></div><Arena event={frame}/><div className="duel-foot"><span>輪流插牌</span><span>種子 <code data-testid="run-seed">{game.seed}</code></span><button onClick={() => setModal('restart')} disabled={!!animation}>重新開始</button></div></section>
        {view === 'result' && fatalEvent && <section className="result-cause" data-testid="final-cause" aria-label="最後一擊"><strong>最後一擊：{explainEvent(fatalEvent).title}</strong><p>{explainEvent(fatalEvent).detail}。後面的招式不再執行。</p></section>}
        {view === 'battle' ? <>
          <div className="duel-turn-row"><h1 data-testid="duel-turn" data-side={animation ? 'resolving' : game.status === 'placing' ? game.activeSide : game.status}>{animation ? '沿軌道，共同出手。' : game.status === 'resolved' ? '這回合，已落定。' : game.status === 'ready' ? '雙方落定，準備交手。' : thinking ? '雷衛正在落牌' : '輪到你，落下一招。'}</h1><span>我 {used('player')}/3 · 敵 {used('enemy')}/3</span></div>
          <div className="enemy-hand-row"><strong>雷衛手牌 · 公開</strong><div className="duel-enemy-hand" data-testid="enemy-hand">{game.decks.enemy.hand.map(card => <span key={card.instanceId} title={CARDS[card.cardId].description} className={game.timeline.some(placed => placed.instanceId === card.instanceId) ? 'used' : ''}>{CARDS[card.cardId].name}{game.timeline.some(placed => placed.instanceId === card.instanceId) ? ' · 鎖' : ''}</span>)}</div></div>
          <section className="duel-track-section" aria-label="共同軌道"><div className="duel-track-caption"><strong>共同軌道 <small>依序執行 →</small></strong><span>{game.timeline.length} / 6 招已鎖定</span></div>
            <div ref={timelineRef} className={`duel-timeline ${selected ? 'has-selection' : ''}`} data-testid="duel-timeline" tabIndex={0} aria-label="共同軌道，可捲動查看所有招式">
              {Array.from({ length: game.timeline.length + 1 }, (_, index) => <Fragment key={index}>
                <button className={`duel-gap ${gap === index ? 'chosen' : ''}`} aria-label={`插入位置 ${index}`} aria-pressed={gap === index} disabled={!canAct || !selected} onClick={() => { setGap(index); setNotice('位置已選擇；確認後才會鎖定落牌。') }}><span>＋</span><small>{index === 0 ? '最前' : index === game.timeline.length ? '最後' : `間隙 ${index}`}</small></button>
                {index < game.timeline.length && <div className={`duel-locked ${game.timeline[index].side} ${frame?.mainIndex === index ? 'executing' : ''}`} data-testid="duel-card" data-main-index={index} data-side={game.timeline[index].side} data-card-id={game.timeline[index].cardId} data-instance-id={game.timeline[index].instanceId}>
                  <span className="duel-card-order">{index + 1} · {NAMES[game.timeline[index].side]}</span><Icon name={CARDS[game.timeline[index].cardId].icon}/><strong>{CARDS[game.timeline[index].cardId].name}</strong><small>已鎖定</small>
                  {explanations.get(game.timeline[index].instanceId) && <span className="action-explanation" data-testid="action-explanation"><b>{preview ? '試算：' : ''}{explanations.get(game.timeline[index].instanceId)!.title}</b><small>{explanations.get(game.timeline[index].instanceId)!.detail}</small></span>}
                </div>}
              </Fragment>)}
              {!game.timeline.length && <p className="duel-track-empty">選一張牌，再選「最前」的位置。<br/>落定後，對手也能插入你的前後。</p>}
            </div>
          </section>
          <section className="duel-forecast" aria-label="目前軌道試算"><div className="forecast">
            <div><span>我方 HP</span><strong data-testid="preview-player">{preview?.nextState.player.hp ?? game.player.hp}</strong><small>盾 {preview?.nextState.player.shield ?? game.player.shield} · 雷 {preview?.nextState.player.thunder ?? game.player.thunder}</small></div>
            <div><span>敵方 HP</span><strong data-testid="preview-enemy">{preview?.nextState.enemy.hp ?? game.enemy.hp}</strong><small>盾 {preview?.nextState.enemy.shield ?? game.enemy.shield} · 雷 {preview?.nextState.enemy.thunder ?? game.enemy.thunder}</small></div>
          </div><p>{draft ? '含待確認的一張牌。' : '僅依目前軌道試算。'}{game.status === 'ready' ? '雙方已停止，可共同結算。' : game.status === 'resolved' ? '本回合已結算。' : '後續插牌仍可能改變結果。'}</p></section>
          <section className="hand-section" aria-label="你的手牌"><div className="hand-heading"><h2>你的招式</h2><span>牌庫 {game.decks.player.drawPile.length} · 棄牌 {game.decks.player.discardPile.length}{game.passed.player && ' · 已停手'}</span></div>
            <div className="hand duel-player-hand" data-testid="player-hand">{game.decks.player.hand.map(card => {
              const data = CARDS[card.cardId], locked = game.timeline.some(placed => placed.instanceId === card.instanceId)
              return <button key={card.instanceId} aria-label={`手牌 ${data.name} ${locked ? '已鎖定' : '未落牌'}`} aria-pressed={selected === card.instanceId} className={`hand-card tag-${data.tag} ${selected === card.instanceId ? 'selected' : ''} ${locked ? 'placed' : ''}`} disabled={!canAct || locked} onClick={() => { setSelected(card.instanceId); setGap(null); setNotice('選好插入位置，再確認落牌。') }}><span className="card-top"><small>{data.tag}</small><span>{locked ? '鎖定' : '◇'}</span></span><span className="card-face"><Icon name={data.icon}/><strong>{data.name}</strong></span><span className="card-bottom">{data.short}</span></button>
            })}</div>
            <div className="card-detail">{selectedCard ? <div><strong>{CARDS[selectedCard.cardId].name}</strong><p>{CARDS[selectedCard.cardId].description.replace('對雷衛', '對對手').replace('應在敵人架盾後使用。', '按執行時的對手護盾轉移。')}</p><small>落牌後不能撤回；對手仍可在它前後插入新牌。</small></div> : <p className="quiet">{game.status === 'resolved' ? '下一回合清除雙方護盾與暫時狀態；雷量保留。' : thinking ? '雷衛與你使用相同牌組、額度與卡牌效果。' : '選手牌 → 點軌道間隙 → 確認落牌。每次只下一張。'}</p>}</div>
          </section>
          {aiError && <div className="banner">本次AI行動未成立。<button onClick={() => { setAiError(false); setAiAttempt(value => value + 1) }}>重試雷衛落牌</button></div>}
        </> : <section className="result-panel"><span className="eyebrow">須 彌 山 門 ／ 雙 方 交 手</span><h1>{game.status === 'won' ? '雷霆，已奉還。' : '這一戰，留待再借。'}</h1><p>{game.status === 'won' ? '這次布局，由你拿下。換個先手，再試一次。' : '回看落牌順序，找出下一次能借走的機會。'}</p><div className="result-numbers"><div><strong data-testid="result-hp">{game.player.hp}</strong><span>我方剩餘生命</span></div><div><strong data-testid="result-rounds">{game.round}</strong><span>經歷回合</span></div></div><div className="result-actions"><button className="primary" onClick={() => start(game.seed, initialFirstSide.current)}>同種子再戰</button><button onClick={() => start(game.seed, initialFirstSide.current === 'player' ? 'enemy' : 'player')}>交換首手再戰</button><button onClick={() => start(randomSeed(), initialFirstSide.current)}>換種子再戰</button></div><label className="feedback-label">這場交手，有哪些值得再試？<textarea aria-label="試玩感受" value={feedback} maxLength={600} rows={2} placeholder="最後出牌太強？有沒有誘招、借勢或難以理解的地方？" onChange={event => setFeedback(event.target.value)}/></label><div className="feedback-actions"><button onClick={() => { if (!resultRecord) return; const next = { ...resultRecord, feedback: feedback.trim() }; setResultRecord(next); persist(recordsRef.current.map(record => record.id === next.id ? next : record)); setNotice('感受已保留；本機保存狀態見上方提示。') }}>儲存感受</button><button onClick={() => resultRecord && exportJson(resultRecord)}>匯出交手紀錄 JSON</button></div><p className="quiet">這是規則對等的實驗版本，尚未證明先後手平衡或真人覺得好玩。</p></section>}
        {!animation && !!lastEvents.length && <RoundSummary events={lastEvents} timeline={game.timeline} onReplay={() => setModal('replay')}/>}
        {!!events.length && <details className="event-log"><summary>結算紀錄 · {events.length} 個事件</summary><ol>{events.map(event => <li key={event.index}><span>{event.index + 1}</span><div><strong>{event.actor === 'system' ? '戰局' : NAMES[event.actor]} · {event.label}</strong><p>{event.reason}</p><small>我 HP {event.before.player.hp}→{event.after.player.hp}／盾 {event.before.player.shield}→{event.after.player.shield}／雷 {event.before.player.thunder}→{event.after.player.thunder} · 敵 HP {event.before.enemy.hp}→{event.after.enemy.hp}／盾 {event.before.enemy.shield}→{event.after.enemy.shield}／雷 {event.before.enemy.thunder}→{event.after.enemy.thunder}</small></div></li>)}</ol></details>}
      </>}
      <div className="notice" role="status" aria-live="polite">{notice}</div>
      <footer><span>逆天 · 輪流插牌 S0.2</span><button onClick={() => { if (pwa.install) void pwa.install().catch(() => setNotice('安裝未成立，可從瀏覽器選單加入主畫面。')); else setModal('install') }}>安裝到手機</button><small title={__BUILD_TIME__}>版本 {__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC</small></footer>
    </main>
    {view === 'battle' && <div className="action-dock duel-action-dock"><div className="dock-inner">{frame && animation ? <EventExplanation event={frame} index={animation.index} total={animation.result.events.length} testId="resolution-explanation"/> : <p aria-live="polite"><strong>{game.status === 'resolved' ? '回合結算完畢' : game.status === 'ready' ? '雙方已落定' : thinking ? '雷衛正在落牌' : selectedCard ? `${CARDS[selectedCard.cardId].name}${gap !== null ? ` · 位置 ${gap}` : ' · 請選位置'}` : '輪到你落牌'}</strong><span>{game.status === 'placing' ? '落牌只是排順序，結算走到那張牌才生效。' : '護盾、倒刺、避鋒下回合清除；雷量保留。'}</span></p>}
      {animation ? <div className="resolution-controls"><button onClick={() => setPaused(value => !value)}>{paused ? '繼續結算' : '暫停結算'}</button><button onClick={stepAnimation} disabled={!paused}>下一個事件</button><button className="primary" onClick={() => finish(animation.result, animation.turn)}>略過演出</button></div> : game.status === 'resolved' ? <button className="primary" onClick={advance}>下一回合</button> : game.status === 'ready' ? <div className="duel-dock-buttons"><button disabled>確認落牌</button><button className="primary" onClick={resolve}>共同結算</button></div> : <div className="duel-dock-buttons"><button onClick={stop} disabled={!canAct}>本回合停手</button><button className="primary" onClick={place} disabled={!canAct || !draft}>確認落牌</button></div>}
    </div></div>}
    {modal === 'rules' && <Dialog title="輪流借招之道" onClose={() => setModal(null)}><div className="rules"><p>雙方45生命、相同十張牌，手牌公開。每回合各抽五張、最多出三張，輪流把一張牌插進共同軌道。</p><ol><li>選手牌，點間隙，再確認落牌。落下後不能移動或撤回。</li><li>新牌可插在既有牌的前後；軌道上每一招依序執行。</li><li>選「本回合停手」後不能再出；對手仍可用完額度。雙方停止或各出滿三張後共同結算。</li><li>下回合首手交換、護盾與暫時狀態清除，雷量保留。全部手牌棄置重抽。</li></ol><p>目前試算只計算軌道與待確認牌；對手未出的牌不包含在內。雙方八種卡效果完全相同；雷量上限6，倒刺全擋可反擊、閃避與死亡不反擊，反傷不遞迴。一方死亡立即停止後續招式。</p><p>雷衛依公開手牌及當前軌道做有限前瞻，不讀未來牌序；與你使用相同合法落牌入口。相同規則不代表已證明先後手平衡。</p><p>原版借招與舊紀錄保留在<a href="?legacy=1">原版對照</a>。本輪不加入擋傷轉雷、遺物、保留手牌或三場流程。</p></div></Dialog>}
    {modal === 'settings' && <Dialog title="交手設定" onClose={() => setModal(null)}><label className="setting-row"><span>減少動態效果<small>直接提交結算，關閉雷光與震動</small></span><input type="checkbox" aria-label="減少動態效果" checked={preferences.reducedMotion} onChange={event => updatePreferences({ reducedMotion: event.target.checked })}/></label>{systemReduced && <p className="quiet">系統減少動態效果已啟用。</p>}<label className="setting-row"><span>演出速度</span><select aria-label="演出速度" value={preferences.speed} onChange={event => updatePreferences({ speed: Number(event.target.value) as 1 | 2 })}><option value={1}>標準</option><option value={2}>兩倍速</option></select></label><p className="quiet">設定與最近20場已結束交手保存在此瀏覽器；不會上傳。不儲存中途進度。</p></Dialog>}
    {modal === 'history' && <Dialog title="交手紀錄" onClose={() => setModal(null)}>{records.length ? <><ul className="history-list">{records.map(record => <li key={record.id}><div><strong>{record.outcome === 'won' ? '勝利' : '敗北'} · 輪流插牌</strong><span>{record.turns.length} 回合 · {record.hp} HP · {record.seed}</span><small>{NAMES[record.initialFirstSide]}首手 · {new Date(record.completedAt).toLocaleString('zh-TW')}</small>{record.feedback && <p>{record.feedback}</p>}</div><button onClick={() => exportJson(record)}>匯出</button></li>)}</ul><button onClick={() => exportJson(records)}>匯出全部交手紀錄 JSON</button></> : <p>尚無已結束的交手；原版紀錄在原版對照中保留。</p>}</Dialog>}
    {modal === 'restart' && <Dialog title="重新交手" onClose={() => setModal(null)}><p>未結束的交手將捨棄。交換首手會保留相同種子與雙方起始牌序。</p><div className="modal-actions"><button className="primary" onClick={() => start(game.seed, initialFirstSide.current)}>同種子重開</button><button onClick={() => start(game.seed, initialFirstSide.current === 'player' ? 'enemy' : 'player')}>交換首手重開</button><button onClick={() => start(randomSeed(), initialFirstSide.current)}>換種子重開</button><button onClick={() => { setView('home'); setModal(null); setNotice('') }}>返回山門</button></div></Dialog>}
    {modal === 'install' && <Dialog title="把山門放進手機" onClose={() => setModal(null)}><p>iPhone／iPad：用 Safari 開啟，點「分享」→「加入主畫面」。Android：用 Chrome 選「安裝應用程式」或「加入主畫面」。系統安裝確認需由你本人操作。</p><p>首次連線載入後可離線試玩。更新時連線開啟，看到「新版本已備妥」後更新重開。</p><p className="quiet">目前網址：{location.href.split('?')[0]}</p></Dialog>}
    {modal === 'lesson' && <Dialog title="三招看懂結算" onClose={() => setModal(null)}><ResolutionLesson onClose={() => setModal(null)}/></Dialog>}
    {modal === 'replay' && <Dialog title="重看本回合" onClose={() => setModal(null)}><RoundReplay events={lastEvents} timeline={game.timeline}/></Dialog>}
  </div>
}
