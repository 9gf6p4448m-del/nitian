import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Arena, Icon } from './Art'
import { CARDS, MODES } from './game/data'
import { createGame, getIntents, nextRound, resolveTurn } from './game/engine'
import type { CombatEvent, CombatState, Fighter, Mode, PlannedCard, Resolution, RunRecord, TurnRecord } from './game/types'
import { loadRecords, loadSettings, saveRecords, saveSettings, type Settings } from './storage'
import { usePwa } from './pwa'
import './style.css'

declare const __BUILD_TIME__: string
const SLOT_NAMES = ['第一招前', '第一、二招間', '第二、三招間', '第三招後']
const newSeed = () => `SUMERU-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} onCancel={onClose} aria-label={title}>
    <div className="modal-heading"><h2>{title}</h2><button onClick={onClose} aria-label="關閉視窗">✕</button></div>{children}
  </dialog>
}

function Vitals({ fighter, enemy = false }: { fighter: Fighter; enemy?: boolean }) {
  return <div className={`vitals ${enemy ? 'enemy-vitals' : ''}`}>
    <div className="vitals-line"><span>{enemy ? '天眾 · 雷衛' : '行者 · 阿修羅'}</span><strong><b data-testid={enemy ? 'enemy-hp' : 'player-hp'}>{fighter.hp}</b><small> / {fighter.maxHp}</small></strong></div>
    <div className="hp-track" role="meter" aria-label={enemy ? '雷衛生命' : '阿修羅生命'} aria-valuemin={0} aria-valuemax={fighter.maxHp} aria-valuenow={fighter.hp}><i style={{ width: `${fighter.hp / fighter.maxHp * 100}%` }}/></div>
    <div className="resources"><span><Icon name="shield"/>盾 {fighter.shield}</span><span className="thunder-resource"><Icon name="bolt"/>雷 <b>{fighter.thunder}</b><small>/6</small><span className="pips" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i className={i < fighter.thunder ? 'filled' : ''} key={i}/>)}</span></span>{fighter.evade && <span>避鋒</span>}{fighter.thorns && <span>倒刺</span>}</div>
  </div>
}

function download(record: RunRecord | RunRecord[]) {
  const blob = new Blob([JSON.stringify({ schema: 'nitian.s0.v1', records: Array.isArray(record) ? record : [record] }, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `nitian-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function App() {
  const [initial] = useState(() => ({ settings: loadSettings(), records: loadRecords() }))
  const [settings, setSettings] = useState(initial.settings.value)
  const [records, setRecords] = useState(initial.records.value)
  const [storageProblem, setStorageProblem] = useState(!initial.settings.ok || !initial.records.ok)
  const [view, setView] = useState<'ready' | 'battle' | 'result'>('ready')
  const [game, setGame] = useState<CombatState>(() => createGame(initial.settings.value))
  const [phase, setPhase] = useState<'planning' | 'playing' | 'review' | 'ended'>('planning')
  const [planned, setPlanned] = useState<PlannedCard[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState<'settings' | 'rules' | 'history' | 'restart' | 'install' | null>(null)
  const [lastEvents, setLastEvents] = useState<CombatEvent[]>([])
  const [animation, setAnimation] = useState<{ result: Resolution; turn: TurnRecord; index: number } | null>(null)
  const [resultRecord, setResultRecord] = useState<RunRecord | null>(null)
  const [feedback, setFeedback] = useState('')
  const [guideDismissed, setGuideDismissed] = useState(false)
  const [systemReduced, setSystemReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [offline, setOffline] = useState(!navigator.onLine)
  const lock = useRef(false), zeroWarned = useRef(false), startedAt = useRef(performance.now()), withdrawals = useRef(0)
  const turns = useRef<TurnRecord[]>([]), runId = useRef(''), audio = useRef<AudioContext | null>(null)
  const pwa = usePwa(), reduced = settings.reducedMotion || systemReduced
  const frame = animation?.result.events[animation.index], display = frame?.after ?? game
  const canPlan = view === 'battle' && phase === 'planning'
  const preview = useMemo(() => canPlan ? resolveTurn(game, planned) : null, [game, planned, canPlan])
  const selectedCard = game.hand.find(c => c.instanceId === selected)
  const selectedPlan = planned.find(c => c.instanceId === selected)
  const sameSlot = selectedPlan ? planned.filter(p => p.slot === selectedPlan.slot) : []
  const selectedPosition = sameSlot.findIndex(p => p.instanceId === selected)
  const intents = getIntents(game.round)

  function updateSettings(patch: Partial<Settings>) {
    const next = { ...settings, ...patch }; setSettings(next)
    if (!saveSettings(next)) setStorageProblem(true)
  }
  function persist(next: RunRecord[]) {
    const limited = next.slice(0, 20); setRecords(limited)
    if (!saveRecords(limited)) setStorageProblem(true)
  }
  function start(seed = settings.seed, mode = settings.mode, tutorial = settings.tutorial) {
    const next = createGame({ seed, mode, tutorial })
    updateSettings({ seed: next.seed, mode })
    setGame(next); setPlanned([]); setSelected(null); setLastEvents([]); setAnimation(null)
    setView('battle'); setPhase('planning'); setNotice(''); setModal(null); setFeedback('')
    setResultRecord(null); setGuideDismissed(false)
    lock.current = false; zeroWarned.current = false; turns.current = []; withdrawals.current = 0
    startedAt.current = performance.now(); runId.current = crypto.randomUUID()
  }
  function insert(slot: number) {
    if (!canPlan) return
    if (!selected) { setNotice('先選一張手牌，再點插入區。'); return }
    if (!selectedPlan && planned.length >= 3) { setNotice('每回合最多三張；可先撤回，或移動已編排的牌。'); return }
    setPlanned([...planned.filter(p => p.instanceId !== selected), { instanceId: selected, slot }]); setNotice('')
  }
  function withdraw() {
    if (!canPlan || !selectedPlan) return
    setPlanned(planned.filter(p => p.instanceId !== selected)); withdrawals.current++
  }
  function reorder(direction: number) {
    if (!canPlan || !selectedPlan) return
    const from = planned.findIndex(p => p.instanceId === selected), neighbor = sameSlot[selectedPosition + direction]
    if (!neighbor) return
    const to = planned.findIndex(p => p.instanceId === neighbor.instanceId)
    const next = [...planned]; [next[from], next[to]] = [next[to], next[from]]; setPlanned(next)
  }
  function finish(result: Resolution, turn: TurnRecord) {
    turns.current = [...turns.current, turn]
    setGame(result.nextState); setLastEvents(result.events); setAnimation(null); setPlanned([]); setSelected(null)
    if (game.round === 1 && game.tutorial) updateSettings({ tutorial: false })
    if (result.nextState.status === 'planning') setPhase('review')
    else {
      setPhase('ended'); setView('result')
      const record: RunRecord = { id: runId.current, seed: game.seed, mode: game.mode, tutorial: game.tutorial, completedAt: new Date().toISOString(), outcome: result.nextState.status, hp: result.nextState.player.hp, turns: turns.current, feedback: '' }
      setResultRecord(record); persist([record, ...records])
    }
  }
  function commit() {
    if (!canPlan || lock.current) return
    lock.current = true
    if (!planned.length && !zeroWarned.current) { setNotice('本回合未安排卡牌，將直接承受敵招。'); zeroWarned.current = true }
    const result = resolveTurn(game, planned)
    const turn: TurnRecord = { round: game.round, hand: structuredClone(game.hand), plan: structuredClone(planned), events: result.events, decisionMs: Math.round(performance.now() - startedAt.current), withdrawals: withdrawals.current }
    if (reduced) finish(result, turn)
    else {
      if (settings.sound) {
        try { audio.current ??= new AudioContext(); void audio.current.resume().catch(() => setNotice('音效無法啟用，仍可繼續遊玩。')) }
        catch { setNotice('瀏覽器無法播放音效，仍可繼續遊玩。') }
      }
      setPhase('playing'); setAnimation({ result, turn, index: 0 })
    }
  }
  function advance() {
    if (phase !== 'review') return
    setGame(nextRound(game)); setPhase('planning'); setNotice(''); lock.current = false
    withdrawals.current = 0; startedAt.current = performance.now()
  }
  useEffect(() => {
    if (!animation) return
    if (reduced) { finish(animation.result, animation.turn); return }
    const timer = setTimeout(() => {
      if (animation.index + 1 >= animation.result.events.length) finish(animation.result, animation.turn)
      else setAnimation({ ...animation, index: animation.index + 1 })
    }, (animation.result.events[animation.index + 1]?.mainIndex === frame?.mainIndex ? 170 : 350) / settings.speed)
    return () => clearTimeout(timer)
  }, [animation, reduced, settings.speed])
  useEffect(() => {
    if (!frame || !settings.sound || reduced || !audio.current) return
    try {
      const ctx = audio.current, osc = ctx.createOscillator(), gain = ctx.createGain()
      osc.type = 'sine'; osc.frequency.value = frame.effect === 'transfer' ? 660 : frame.effect === 'attack' ? 110 : 280
      gain.gain.setValueAtTime(0.035, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.12)
    } catch { setNotice('音效中斷，仍可繼續遊玩。') }
  }, [frame, settings.sound, reduced])
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setSystemReduced(media.matches), network = () => setOffline(!navigator.onLine)
    media.addEventListener('change', change); window.addEventListener('online', network); window.addEventListener('offline', network)
    return () => { media.removeEventListener('change', change); window.removeEventListener('online', network); window.removeEventListener('offline', network); void audio.current?.close() }
  }, [])

  const sequence: string[] = []
  for (let i = 0; i < 4; i++) { sequence.push(...planned.filter(p => p.slot === i).map(p => p.instanceId)); if (i < 3) sequence.push(`enemy-${i}`) }
  const selectedEvents = selectedPlan && preview ? preview.events.filter(e => e.mainIndex === sequence.indexOf(selectedPlan.instanceId) && e.effect !== 'discard') : []

  return <div className={`app ${reduced ? 'reduced-motion' : ''}`}>
    <header className="site-header"><a href="#" className="brand" onClick={e => { e.preventDefault(); if (view !== 'ready') setModal('restart') }} aria-label="逆天首頁"><span className="brand-mark">逆</span><span>逆天<small>N I T I A N</small></span></a><div className="header-actions"><button onClick={() => setModal('rules')}>玩法</button><button onClick={() => setModal('history')}>試煉紀錄</button><button onClick={() => setModal('settings')}>設定</button></div></header>
    <main className={`shell ${view === 'ready' ? 'home-shell' : ''}`}>
      {storageProblem && <div className="banner" data-testid="storage-warning">本機保存無法使用或資料損壞；仍可遊玩，結束後請匯出紀錄。</div>}
      {offline && <div className="banner offline-banner">離線試煉 · 遊戲可繼續，本機紀錄仍保留</div>}
      {pwa.updateAvailable && <div className="banner">新版本已備妥。<button onClick={pwa.update}>更新並重開</button><small>本局進度不會保留。</small></div>}
      {pwa.error && <div className="banner">離線版本尚未備妥；目前仍可線上遊玩，請保持連線後重試。</div>}
      {view === 'ready' ? <>
        <section className="opening"><span className="eyebrow">須 彌 山 下 ／ 第 一 道 天 門</span><h1>借天之力，<br/><em>逆天而行。</em></h1><p>看穿天神的出招，把你的招式插入其中。<br/>借走他的雷霆，再親手奉還。</p></section>
        <Arena home/>
        <section className="start-panel" aria-label="開始設定">
          <div className="mode-choices">{(Object.keys(MODES) as Mode[]).map(mode => <button key={mode} className={settings.mode === mode ? 'chosen' : ''} aria-pressed={settings.mode === mode} onClick={() => updateSettings({ mode })}><span>{MODES[mode].title}</span><small>{MODES[mode].subtitle}</small></button>)}</div>
          <div className="start-options"><label className="seed-label">試煉種子<input value={settings.seed} maxLength={80} onChange={e => updateSettings({ seed: e.target.value })} spellCheck={false}/></label><label className="check-label"><input type="checkbox" checked={settings.tutorial} onChange={e => updateSettings({ tutorial: e.target.checked })}/>首回合引導</label><button className="primary begin" onClick={() => start()}>開始借招 <span aria-hidden="true">→</span></button></div>
          <p className="quiet">單場試煉 · 十張牌 · 每回合最多三招{settings.mode === 'paper' ? '｜固定牌序，供對照推演' : ''}</p>
        </section>
      </> : <>
        <section className="duel" aria-label="對峙舞台"><div className="duel-vitals"><Vitals fighter={display.player}/><div className="round-emblem"><span>回合</span><b data-testid="round">{game.round}</b><small>{game.round % 2 ? '雷陣 A' : '守陣 B'}</small></div><Vitals fighter={display.enemy} enemy/></div><Arena event={frame}/><div className="duel-foot"><span>{MODES[game.mode].title}</span><span>種子 <code data-testid="run-seed">{game.seed}</code></span><button onClick={() => setModal('restart')} disabled={phase === 'playing'}>重新開始</button></div></section>
        {view === 'battle' ? <>
          <div className="battle-heading"><div><span className="eyebrow">共 同 行 動 軌 道</span><h1>{phase === 'planning' ? '把招式，插進天命。' : phase === 'playing' ? '借勢，正在發生。' : '這一回合，已落定。'}</h1></div><span className="limit">已排 <b>{planned.length}</b> / 3 招</span></div>
          {game.round === 1 && game.tutorial && !guideDismissed && phase === 'planning' && <div className="guide"><Icon name="bolt"/><p><strong>先看三招，再選時機。</strong>選「引雷印」，點聚雷後的插入區。剩餘兩招由你安排。</p><button onClick={() => { setGuideDismissed(true); updateSettings({ tutorial: false }) }}>略過引導</button></div>}
          <div className="forecast" aria-label="本回合預估"><div><span>我方生命</span><strong data-testid="preview-player">{game.player.hp} <i>→</i> {preview?.nextState.player.hp ?? game.player.hp}</strong></div><div><span>敵方生命</span><strong data-testid="preview-enemy">{game.enemy.hp} <i>→</i> {preview?.nextState.enemy.hp ?? game.enemy.hp}</strong></div><div><span>雷量結餘</span><strong>我 {preview?.nextState.player.thunder ?? game.player.thunder}<i> / </i>敵 {preview?.nextState.enemy.thunder ?? game.enemy.thunder}</strong></div></div>
          <section className="track" aria-label="行動編排">{Array.from({ length: 4 }, (_, slot) => <div className="track-pair" key={slot}>
            <div className={`insertion ${selected ? 'insertion-ready' : ''}`}><span className="slot-order">{String(slot + 1).padStart(2, '0')}</span>{planned.filter(p => p.slot === slot).map(p => { const card = game.hand.find(c => c.instanceId === p.instanceId)!; const data = CARDS[card.cardId]; return <button key={p.instanceId} data-testid="planned-card" className={`planned-card ${selected === p.instanceId ? 'selected' : ''} ${frame?.mainIndex === sequence.indexOf(p.instanceId) ? 'executing' : ''}`} onClick={() => setSelected(p.instanceId)} disabled={!canPlan}><Icon name={data.icon}/><span>{data.name}</span></button> })}<button className="insert-button" aria-label={`插入區 ${slot} ${SLOT_NAMES[slot]}`} onClick={() => insert(slot)} disabled={!canPlan}><span aria-hidden="true">＋</span><small>{SLOT_NAMES[slot]}</small></button></div>
            {slot < 3 && <div className={`enemy-action ${frame?.mainIndex === sequence.indexOf(`enemy-${slot}`) ? 'executing' : ''}`}><span className="enemy-order">天招 {slot + 1}</span><Icon name={intents[slot].kind === 'shield' ? 'shield' : intents[slot].kind === 'attack' ? 'blade' : 'bolt'}/><strong>{intents[slot].label}</strong><small>{intents[slot].description}</small></div>}
          </div>)}</section>
          <div className="turn-hint">{game.round >= 7 ? '天威已起：敵方攻擊基礎值 +3，不再累加。' : `第 7 回合起天威：攻擊基礎值 +3。下回合為${game.round % 2 ? '架盾 → 震擊 → 聚雷' : '聚雷 → 雷擊 → 架盾'}。`}</div>
          <section className="hand-section" aria-label="手牌"><div className="hand-heading"><h2>你的招式</h2><span>牌庫 {game.drawPile.length} · 棄牌 {game.discardPile.length}<button onClick={() => { if (!canPlan) return; withdrawals.current += planned.length; setPlanned([]) }} disabled={!canPlan || !planned.length}>清空編排</button></span></div>
            <div className="hand">{game.hand.map(card => { const data = CARDS[card.cardId], placed = planned.find(p => p.instanceId === card.instanceId); return <button key={card.instanceId} aria-label={`手牌 ${data.name} ${placed ? '已編排' : '未編排'}`} aria-pressed={selected === card.instanceId} className={`hand-card tag-${data.tag} ${selected === card.instanceId ? 'selected' : ''} ${placed ? 'placed' : ''}`} onClick={() => setSelected(card.instanceId)} disabled={!canPlan}><span className="card-top"><small>{data.tag}</small><span>{placed ? `已排 ${placed.slot + 1}` : '◇'}</span></span><span className="card-face"><Icon name={data.icon}/><strong>{data.name}</strong></span><span className="card-bottom">{data.short}</span></button> })}</div>
            <div className="card-detail">{selectedCard ? <><div><strong>{CARDS[selectedCard.cardId].name}</strong><p>{CARDS[selectedCard.cardId].description}</p>{selectedPlan ? <small>{selectedEvents.length ? selectedEvents.map(e => e.reason).join(' ') : '前面已有一方死亡，此牌不會執行。'}</small> : <small>點插入區安排；選到已編排的牌，可移到另一區。</small>}</div>{selectedPlan && <div className="edit-controls"><button aria-label="同區向前" onClick={() => reorder(-1)} disabled={!canPlan || selectedPosition === 0}>同區 ↑</button><button aria-label="同區向後" onClick={() => reorder(1)} disabled={!canPlan || selectedPosition === sameSlot.length - 1}>同區 ↓</button><button onClick={withdraw} disabled={!canPlan}>撤回此牌</button></div>}</> : <p className="quiet">選一張牌，查看效果，再點軌道插入區。</p>}</div>
          </section>
        </> : <section className="result-panel"><span className="eyebrow">{game.status === 'won' ? '須 彌 山 門 ／ 已 破' : '須 彌 山 門 ／ 未 破'}</span><h1>{game.status === 'won' ? '雷霆，已奉還。' : '再借一次天光。'}</h1><p>{game.status === 'won' ? '你借走了天神的力量。下一次，試試另一種時機。' : '天命尚未改寫。留意敵方雷量，以及倒刺前能否活下來。'}</p><div className="result-numbers"><div><strong data-testid="result-hp">{game.player.hp}</strong><span>剩餘生命</span></div><div><strong data-testid="result-rounds">{game.round}</strong><span>經歷回合</span></div></div><div className="result-actions"><button className="primary" onClick={() => start(game.seed, game.mode, game.tutorial)}>同種子再戰</button><button onClick={() => start(newSeed(), game.mode, false)}>換種子再戰</button><button onClick={() => { setView('ready'); setNotice('') }}>返回山門</button></div><label className="feedback-label">這次借勢，有感嗎？<textarea aria-label="試玩感受" value={feedback} maxLength={600} onChange={e => setFeedback(e.target.value)} placeholder="哪個時機有趣？哪裡像在填答案？" rows={2}/></label><div className="feedback-actions"><button onClick={() => { if (!resultRecord) return; const next = { ...resultRecord, feedback: feedback.trim() }; setResultRecord(next); persist(records.map(r => r.id === next.id ? next : r)); setNotice('感受已保留在本頁；本機保存狀態見上方提示。') }}>儲存感受</button><button onClick={() => resultRecord && download(resultRecord)}>匯出局內紀錄 JSON</button></div><p className="quiet">單場玩法驗證；勝利不代表平衡或趣味已獲驗證。</p></section>}
        {(lastEvents.length > 0 || frame) && <details className="event-log"><summary>結算紀錄 · {animation?.result.events.length ?? lastEvents.length} 個事件</summary><ol>{(animation ? animation.result.events.slice(0, animation.index + 1) : lastEvents).map(e => <li key={e.index}><span>{String(e.index + 1).padStart(2, '0')}</span><div><strong>{e.actor === 'enemy' ? '雷衛' : e.actor === 'player' ? '阿修羅' : '戰局'} · {e.label}</strong><p>{e.reason}</p><small>我 HP {e.before.player.hp}→{e.after.player.hp}／盾 {e.before.player.shield}→{e.after.player.shield}／雷 {e.before.player.thunder}→{e.after.player.thunder} · 敵 HP {e.before.enemy.hp}→{e.after.enemy.hp}／盾 {e.before.enemy.shield}→{e.after.enemy.shield}／雷 {e.before.enemy.thunder}→{e.after.enemy.thunder}</small></div></li>)}</ol></details>}
      </>}
      <div className="notice" role="status" aria-live="polite">{notice}</div>
      <footer><span>逆天 · 單場原型 S0</span><button onClick={() => { if (pwa.install) void pwa.install(); else setModal('install') }}>安裝到手機</button><small title={__BUILD_TIME__}>版本 {__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC</small></footer>
    </main>
    {view === 'battle' && <div className="action-dock"><div className="dock-inner"><p aria-live="polite">{frame ? <><strong>{frame.label}</strong><span>{frame.reason}</span></> : phase === 'review' ? <><strong>回合結算完畢</strong><span>下回合清除護盾，雷量保留。</span></> : <><strong>{planned.length ? `${planned.length} 招，準備借勢。` : '看穿順序，再出手。'}</strong><span>未出與已出手牌皆於回合結束棄置。</span></>}</p>{phase === 'playing' && animation ? <button className="primary" onClick={() => finish(animation.result, animation.turn)}>略過演出</button> : phase === 'review' ? <button className="primary" onClick={advance}>下一回合 <span aria-hidden="true">→</span></button> : <button className="primary" onClick={commit} disabled={!canPlan}>出手</button>}</div></div>}
    {modal === 'settings' && <Modal title="試煉設定" onClose={() => setModal(null)}><label className="setting-row"><span>減少動態效果<small>直接提交結算，關閉震動及雷光演出</small></span><input type="checkbox" aria-label="減少動態效果" checked={settings.reducedMotion} onChange={e => updateSettings({ reducedMotion: e.target.checked })}/></label>{systemReduced && <p className="quiet">系統已開啟減少動態效果，遊戲會一併遵循。</p>}<label className="setting-row"><span>合成音效<small>預設關閉；出手後啟用</small></span><input type="checkbox" aria-label="合成音效" checked={settings.sound} onChange={e => updateSettings({ sound: e.target.checked })}/></label><label className="setting-row"><span>演出速度</span><select aria-label="演出速度" value={settings.speed} onChange={e => updateSettings({ speed: Number(e.target.value) as 1 | 2 })}><option value={1}>標準</option><option value={2}>兩倍速</option></select></label><p className="quiet">設定與最近20局紀錄只保存在此瀏覽器；不會上傳。</p></Modal>}
    {modal === 'rules' && <Modal title="借招之道" onClose={() => setModal(null)}><div className="rules"><p>雷衛先公開三招，你把最多三張牌插入四個空隙。同區由上到下／由左到右執行，敵招順序不變。</p><ol><li>點選手牌，再點插入區。可隨時移動、撤回、調序。</li><li>同時看生命與雷量預估，再按出手。沒有能量費用。</li><li>回合結束全部手牌棄置；下一回合護盾清零，雷量保留。</li></ol><h3>兩種陣式交替</h3><p>奇數回合：聚雷3 → 雷擊4＋2×當時雷量並清空 → 架盾4。</p><p>偶數回合：架盾4 → 攻擊6 → 聚雷2。</p><p>第7回合起，攻擊基礎值固定+3。雷量上限6；任何一方死亡，立即停止後續事件。</p><h3>反擊的條件</h3><p>倒刺在完全格擋時仍反傷6；避鋒取消攻擊時不反擊；被打死不反擊。反傷受敵盾抵扣。避鋒及倒刺不疊加。</p><h3>三種試煉</h3><p>須彌山門48生命，用來觀察跨回合選擇；初見雷衛30生命保留原版對照；紙上試煉使用指定牌序，並非隨機種子產生的範例。</p><h3>原創神話奇幻</h3><p>受古印度神話與佛教傳承啟發，不宣稱宗教還原。阿修羅不是邪惡種族。此次只有山門雷衛，尚未登上帝釋天的天宮。</p></div></Modal>}
    {modal === 'history' && <Modal title="試煉紀錄" onClose={() => setModal(null)}>{records.length ? <><ul className="history-list">{records.map(r => <li key={r.id}><div><strong>{r.outcome === 'won' ? '破關' : '敗北'} · {MODES[r.mode].title}</strong><span>{r.turns.length} 回合 · {r.hp} HP · {r.seed}</span><small>{new Date(r.completedAt).toLocaleString('zh-TW')}</small>{r.feedback && <p>{r.feedback}</p>}</div><button onClick={() => download(r)}>匯出</button></li>)}</ul><button onClick={() => download(records)}>匯出全部紀錄 JSON</button></> : <p>尚無已結束的試煉。中途進度不會保存。</p>}</Modal>}
    {modal === 'restart' && <Modal title="重新挑戰山門" onClose={() => setModal(null)}><p>本局尚未完成的編排與紀錄將捨棄。</p><div className="modal-actions"><button className="primary" onClick={() => start(game.seed, game.mode, game.tutorial)}>同種子重開</button><button onClick={() => start(newSeed(), game.mode, false)}>換種子重開</button><button onClick={() => { setView('ready'); setModal(null); setNotice('') }}>返回山門</button></div></Modal>}
    {modal === 'install' && <Modal title="把山門放進手機" onClose={() => setModal(null)}><p>安裝須由手機瀏覽器及你本人確認，網頁無法代按系統的安裝確認。</p><p><strong>iPhone／iPad：</strong>用 Safari 開啟，點「分享」→「加入主畫面」。</p><p><strong>Android：</strong>用 Chrome 開啟，選選單中的「安裝應用程式」或「加入主畫面」。</p><p>首次連線開啟並載入後，可以離線試玩。更新時請連線開啟；看到版本更新提示再更新。</p><p className="quiet">目前網址：{location.href.split('?')[0]}</p></Modal>}
  </div>
}
