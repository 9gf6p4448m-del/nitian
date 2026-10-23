import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { applyAction, cellName, createGame, currentSide, goalCell, legalActions } from './fire/engine'
import type { Action, FireState, Side } from './fire/engine'
import { chooseAction } from './fire/ai'
import FirePawn, { SacredFire } from './fire/FirePawn'
import { loadHistory, loadSettings, saveCompleted, saveFeedback, saveSettings } from './fire/storage'
import type { FireRecord, FireSettings, FireTurn } from './fire/storage'
import { usePwa } from './pwa'
import './fire.css'

declare const __BUILD_TIME__: string

const names: Record<Side, string> = { asura: '阿修羅', deva: '天眾' }
const actionNames: Record<Action['type'], string> = { move: '移動', strike: '攻擊', throw: '投火', offer: '奉獻', wait: '待機', pickup: '拾火', pass: '略過' }
const unitName = (id: string) => `${id.startsWith('a') ? '阿修羅' : '天眾'}${id.endsWith('1') ? '一' : '二'}`
const resultReason = { offering: '神火已奉獻於祭壇', elimination: '全滅結束', repetition: '輪首完整局面第三次重複' }
type ModalName = 'rules' | 'new' | 'history' | 'install' | 'update' | null

function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
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
  return <dialog ref={ref} className="fire-dialog" aria-label={title} onCancel={event => { event.preventDefault(); close() }}>
    <div className="fire-dialog-heading"><h2>{title}</h2><button onClick={close} aria-label="關閉視窗">關閉</button></div>{children}
  </dialog>
}

export default function FireApp() {
  const [loaded] = useState(loadSettings)
  const [settings, setSettings] = useState<FireSettings>(loaded.value)
  const [form, setForm] = useState<FireSettings>(loaded.value)
  const [game, setGame] = useState<FireState>(() => createGame(loaded.value.variant))
  const gameRef = useRef(game)
  const [turns, setTurns] = useState<FireTurn[]>([])
  const turnsRef = useRef<FireTurn[]>([])
  const [history, setHistory] = useState(() => loadHistory())
  const [storageError, setStorageError] = useState(loaded.error)
  const [modal, setModal] = useState<ModalName>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [actionType, setActionType] = useState<Action['type']>('move')
  const [push, setPush] = useState(true)
  const [draft, setDraft] = useState<Action | null>(null)
  const [notice, setNotice] = useState('點選我方角色，再選動作與目標；確認前都可取消。')
  const [aiError, setAiError] = useState('')
  const [retry, setRetry] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [feedbackNotice, setFeedbackNotice] = useState('')
  const locked = useRef(false)
  const startedAt = useRef(new Date().toISOString())
  const recordId = useRef(`fire-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  const decisionStart = useRef(performance.now())
  const pwa = usePwa()
  const side = currentSide(game)
  const humanTurn = settings.opponent === 'local' || side === settings.humanSide
  const available = useMemo(() => game.result ? [] : legalActions(game), [game])
  const selectedUnit = game.units.find(unit => unit.id === selected && unit.hp > 0)
  const selectedActions = available.filter(action => action.unitId === selected)
  const actionOptions = (['move', 'strike', 'throw', 'pickup', 'offer', 'wait'] as const)
  const preview = useMemo(() => {
    if (!draft) return null
    try { return applyAction(game, draft) } catch { return null }
  }, [game, draft])
  const targets = new Set(selectedActions.filter(action => action.type === actionType).map(action => action.target))
  const lastTurn = turns.at(-1)
  const flight = lastTurn?.events.find(event => event.type === 'throw' && event.from !== undefined && event.to !== undefined)

  useEffect(() => { locked.current = false }, [game])
  const execute = useCallback((action: Action, actor: FireTurn['actor'], decisionMs: number) => {
    if (locked.current || gameRef.current.result) return
    locked.current = true
    try {
      const before = gameRef.current
      const outcome = applyAction(before, action)
      const turn: FireTurn = { index: turnsRef.current.length + 1, actor, side: currentSide(before), action, before, after: outcome.state, events: outcome.events, decisionMs: Math.max(0, Math.round(decisionMs)) }
      const nextTurns = [...turnsRef.current, turn]
      turnsRef.current = nextTurns
      gameRef.current = outcome.state
      setTurns(nextTurns); setGame(outcome.state); setSelected(null); setDraft(null); setActionType('move'); setAiError('')
      setNotice(outcome.events.map(event => event.message).join('；'))
      decisionStart.current = performance.now()
      if (outcome.state.result) {
        const record: FireRecord = { id: recordId.current, startedAt: startedAt.current, completedAt: new Date().toISOString(), settings: { ...settings }, turns: nextTurns, outcome: outcome.state.result, feedback: '' }
        const saved = saveCompleted(record)
        setHistory(saved); if (saved.error) setStorageError(true)
      }
    } catch (error) {
      locked.current = false
      const message = error instanceof Error ? error.message : '動作無法結算'
      if (actor === 'ai') setAiError(`對手暫停：${message}`)
      else setNotice(`動作未送出：${message}。請重新選擇。`)
    }
  }, [settings])

  useEffect(() => {
    if (game.result || modal || aiError) return
    const pass = available.length === 1 && available[0].type === 'pass'
    if (humanTurn && !pass) return
    let active = true
    const timer = window.setTimeout(() => {
      if (!active || gameRef.current !== game) return
      try {
        const before = performance.now()
        const action = pass ? available[0] : chooseAction(game)
        if (active) execute(action, pass ? 'system' : 'ai', performance.now() - before)
      } catch (error) { if (active) setAiError(`對手暫停：${error instanceof Error ? error.message : '無法選擇動作'}`) }
    }, pass && humanTurn ? 200 : 650)
    return () => { active = false; window.clearTimeout(timer) }
  }, [game, modal, humanTurn, available, execute, aiError, retry])

  function start(next: FireSettings) {
    const state = createGame(next.variant)
    gameRef.current = state; turnsRef.current = []; locked.current = false
    setSettings({ ...next }); setForm({ ...next }); setGame(state); setTurns([]); setSelected(null); setDraft(null); setActionType('move'); setAiError(''); setModal(null); setFeedback(''); setFeedbackNotice('')
    startedAt.current = new Date().toISOString(); recordId.current = `fire-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; decisionStart.current = performance.now()
    setNotice('新局開始。阿修羅先行；每名角色每輪僅能啟用一次。')
    if (!saveSettings(next)) setStorageError(true)
  }
  function pickType(type: Action['type']) {
    setActionType(type)
    const action = selectedActions.find(item => item.type === type && item.target === undefined)
    setDraft(action ?? null)
  }
  function clickCell(cell: number) {
    if (!humanTurn || game.result || locked.current || aiError) return
    if (selected && targets.has(cell)) {
      const matches = selectedActions.filter(action => action.type === actionType && action.target === cell)
      const action = matches.find(item => actionType !== 'strike' || Boolean(item.push) === push) ?? matches[0]
      if (action) { setDraft(action); return }
    }
    const unit = game.units.find(item => item.cell === cell && item.hp > 0)
    if (unit?.side === side && !unit.used) { setSelected(unit.id); setActionType('move'); setDraft(null); setNotice(`${unitName(unit.id)}：選擇一項行動。攻擊不能附帶移動。`) }
    else if (unit?.side === side && unit.used) setNotice(`${unitName(unit.id)}本輪已動；接火也不能再啟用。`)
    else setNotice('請先點選己方尚未啟用的角色，再選動作與合法目標。')
  }
  function changePush(value: boolean) {
    setPush(value)
    if (draft?.type === 'strike') {
      setDraft(selectedActions.find(action => action.type === 'strike' && action.target === draft.target && Boolean(action.push) === value) ?? null)
    }
  }
  function exportJson(record?: FireRecord) {
    const content = record ? { schema: 'nitian.fire.v1', status: 'completed', ...record, variant: record.settings.variant, opponent: record.settings.opponent, humanSide: record.settings.humanSide } : {
      schema: 'nitian.fire.v1', status: game.result ? 'completed' : 'in-progress', id: recordId.current, startedAt: startedAt.current,
      completedAt: game.result ? history.value.find(record => record.id === recordId.current)?.completedAt ?? null : null,
      variant: settings.variant, opponent: settings.opponent, humanSide: settings.humanSide, initialState: createGame(settings.variant), turns, outcome: game.result, feedback,
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `nitian-${record?.id ?? recordId.current}.json`
    document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('已匯出紀錄；未完局會標為 in-progress，沒有完成結果。')
  }
  function storeFeedback() {
    const completed = history.value.find(record => record.id === recordId.current)
    const saved = completed ? saveCompleted({ ...completed, feedback }) : saveFeedback(recordId.current, feedback)
    setHistory(saved)
    if (saved.error) { setStorageError(true); setFeedbackNotice('回饋尚未存入本機；仍可連同本局紀錄匯出。') }
    else setFeedbackNotice('回饋已存入這局紀錄。')
  }
  const fireLocation = game.fire.holder ? `${unitName(game.fire.holder)}持火` : game.fire.cell !== null ? `神火在 ${cellName(game.fire.cell)}` : '神火待結算'
  const resultTitle = !game.result ? '' : !game.result.winner ? '和局' : settings.opponent === 'local' ? `${names[game.result.winner]}勝利` : game.result.winner === settings.humanSide ? '勝利 · 破壇' : '敗北 · 再戰'

  return <div className="fire-app" data-testid="fire-app" data-state={JSON.stringify(game)} onClickCapture={event => {
    // Safari does not focus buttons on pointer click. Focus before opening any
    // dialog so its saved opener is also correct for touch and pointer input.
    if (event.target instanceof Element) event.target.closest('button')?.focus({ preventScroll: true })
  }}>
    <header className="fire-header"><h1><span>逆天</span><small>奪火破壇</small></h1><nav aria-label="遊戲選單"><button onClick={() => setModal('rules')}>玩法</button><button onClick={() => { setForm({ ...settings }); setModal('new') }}>新局</button></nav></header>
    <main className="fire-shell">
      {pwa.updateAvailable && <div className="fire-banner">有新版本可更新。<button onClick={() => setModal('update')}>查看更新</button></div>}
      {pwa.error && <p className="fire-warning">離線功能暫時無法確認；目前連線仍可繼續遊玩。</p>}
      {(storageError || history.error) && <p className="fire-warning" role="status">本機儲存無法使用或資料損壞；可繼續遊玩，請匯出紀錄保存。</p>}
      <section className="fire-status" aria-label="對局狀態"><div><span>{settings.variant} 版 · {settings.variant === 'B' ? '對方祭壇' : '己方祭壇'}</span><strong>第 {game.round} 輪 <small>· {game.slot + 1}/4</small></strong></div><div className={`fire-turn fire-tone-${side}`}><span>{game.result ? '對局結束' : humanTurn ? settings.opponent === 'local' ? '同機輪替' : '我方行動' : '對手思考中'}</span><strong>{game.result ? '神火已定' : `${names[side]}行動`}</strong></div></section>
      <div className="fire-play-layout"><section className="fire-arena" aria-label="奪火棋盤">
        <div className="fire-altar-direction">↑ C1 天眾祭壇 <span>{settings.variant === 'B' ? '阿修羅的奉獻目標' : '天眾的奉獻目標'}</span></div>
        <div className="fire-board" role="group" aria-label="五乘五棋盤，1列在上，5列在下">
          {Array.from({ length: 25 }, (_, cell) => {
            const unit = game.units.find(item => item.cell === cell && item.hp > 0)
            const holder = !!unit && game.fire.holder === unit.id
            const groundFire = game.fire.holder === null && game.fire.cell === cell
            const goal = cell === 2 || cell === 22
            const isTarget = !!selected && targets.has(cell)
            const label = `${cellName(cell)}${goal ? ' 祭壇' : ''}${unit ? ` ${unitName(unit.id)} HP ${unit.hp} ${holder ? '持火 ' : ''}${unit.used ? '已動不可用' : '可用未動'}` : ' 空格'}${groundFire ? ' 地上神火' : ''}${isTarget ? ` 可${actionNames[actionType]}` : ''}`
            return <button key={cell} data-testid={`fire-cell-${cell}`} aria-label={label} aria-pressed={!!unit && selected === unit.id} onClick={() => clickCell(cell)} className={`fire-cell ${(Math.floor(cell / 5) + cell % 5) % 2 ? 'fire-cell-alt' : ''} ${goal ? 'fire-altar' : ''} ${isTarget ? 'fire-target' : ''} ${draft?.target === cell ? 'fire-draft-target' : ''} ${unit?.id === selected ? 'fire-cell-selected' : ''}`}>
              <span className="fire-coordinate">{cellName(cell)}</span>{goal && <svg className="fire-altar-art" viewBox="0 0 80 80" aria-hidden="true"><path d="M12 62H68L61 51H19ZM20 49H60L55 39H25ZM29 37H51L47 29H33Z" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="40" cy="26" r="15" fill="none" stroke="currentColor"/><path d="M40 7V14M22 14L27 19M58 14L53 19" stroke="currentColor" strokeWidth="2"/></svg>}
              {unit && <FirePawn unit={unit} holder={holder} selected={selected === unit.id}/>}{groundFire && <SacredFire className="fire-ground-flame"/>}{isTarget && !unit && <span className="fire-target-dot"/>}
              {lastTurn?.events.some(event => event.type === 'damage' && event.to === cell) && <span key={`hit-${lastTurn.index}`} className="fire-hit-flash" aria-hidden="true">−1</span>}
              {lastTurn?.events.some(event => ['move', 'push', 'pickup'].includes(event.type) && event.to === cell) && <span key={`arrival-${lastTurn.index}`} className="fire-arrival-flash" aria-hidden="true"/>}
            </button>
          })}
          {flight && <svg key={lastTurn!.index} className="fire-flight" viewBox="0 0 500 500" aria-hidden="true"><path d={`M${(flight.from! % 5) * 100 + 50} ${Math.floor(flight.from! / 5) * 100 + 50} L${(flight.to! % 5) * 100 + 50} ${Math.floor(flight.to! / 5) * 100 + 50}`}/></svg>}
        </div>
        <div className="fire-altar-direction">↓ C5 阿修羅祭壇 <span>{settings.variant === 'B' ? '天眾的奉獻目標' : '阿修羅的奉獻目標'}</span></div>
        <div className="fire-location"><SacredFire/><strong>{fireLocation}</strong><span>{settings.opponent === 'ai' ? `你是${names[settings.humanSide]} · ${settings.humanSide === 'asura' ? '先手' : '後手'}` : '同機雙人 · 交替操作'}</span></div>
      </section>
      <aside className="fire-controls">
        <div className="fire-rosters">{(['asura', 'deva'] as const).map(team => <section key={team} className={`fire-roster fire-tone-${team}`} aria-label={`${names[team]}角色狀態`}><h2>{names[team]} <small>{team === 'asura' ? '甲 · 先手' : '乙 · 後手'}</small></h2>{['1', '2'].map(number => {
          const id = `${team === 'asura' ? 'a' : 'd'}${number}`; const unit = game.units.find(item => item.id === id && item.hp > 0)
          return <div key={id}><span>{number === '1' ? '一' : '二'}</span><strong>{unit ? `${unit.hp}/3 HP` : '退場'}</strong><small>{unit ? `${unit.used ? '已動' : '可用'}${game.fire.holder === id ? ' · 持火' : ''}` : '—'}</small></div>
        })}</section>)}</div>
        {game.result ? <section className="fire-result" data-testid="fire-result" aria-live="polite"><span>終局 · {settings.variant} 版</span><h2>{resultTitle}</h2><p>{resultReason[game.result.reason]}{game.result.winner && ` · ${names[game.result.winner]}勝利，${names[game.result.winner === 'asura' ? 'deva' : 'asura']}落敗。`}</p><div className="fire-result-actions"><button className="fire-primary" onClick={() => start(settings)}>同設定重開</button><button onClick={() => start({ ...settings, humanSide: settings.humanSide === 'asura' ? 'deva' : 'asura' })}>交換角色重開</button></div><label className="fire-feedback">這局的轉折／規則疑問<textarea maxLength={2000} value={feedback} onChange={event => setFeedback(event.target.value)} placeholder="哪一手打斷了你的計畫？還想試什麼？"/></label><button onClick={storeFeedback}>儲存回饋</button><p role="status">{feedbackNotice}</p></section> : <section className="fire-action-panel" aria-label="本次行動">
          <div className="fire-action-heading"><strong>{selectedUnit ? unitName(selectedUnit.id) : humanTurn ? '選擇角色' : '對手正在行動'}</strong><small>{selectedUnit ? `${cellName(selectedUnit.cell)} · ${selectedUnit.hp} HP` : '每輪每人一次'}</small></div>
          <div className="fire-action-buttons">{actionOptions.map(type => <button key={type} aria-pressed={actionType === type && !!selected} disabled={!humanTurn || !!aiError || !selectedActions.some(action => action.type === type)} onClick={() => pickType(type)}>{actionNames[type]}</button>)}</div>
          {selected && actionType === 'strike' && <div className="fire-push-options" aria-label="攻擊推退選項"><button data-testid="fire-push-yes" aria-pressed={push} onClick={() => changePush(true)}>推退</button><button data-testid="fire-push-no" aria-pressed={!push} onClick={() => changePush(false)}>不推</button><small>撞人／界外只扣血，不推。</small></div>}
          <div className="fire-preview" data-testid="fire-preview" aria-live="polite">{preview && draft ? <><strong>本步預覽 · {actionNames[draft.type]}</strong><ul>{preview.events.map((event, index) => <li key={index}>{event.message}</li>)}</ul><p>{preview.state.fire.holder ? `${unitName(preview.state.fire.holder)}持火` : `神火落在 ${preview.state.fire.cell !== null ? cellName(preview.state.fire.cell) : '—'}`}{preview.state.result ? ` · ${preview.state.result.winner ? `${names[preview.state.result.winner]}獲勝` : '和局'}` : ` · 接著${names[currentSide(preview.state)]}行動`}</p></> : <p>{selected ? ['wait', 'pickup', 'offer'].includes(actionType) ? '選擇下方確認後結算。' : `點選亮起的格子${actionType === 'throw' ? '，第一位角色會攔截' : '作為目標'}。` : humanTurn ? '點選棋盤上的己方未動角色。' : '稍候片刻，將顯示對手的實際行動。'}</p>}</div>
          <div className="fire-confirm-row"><button onClick={() => { setSelected(null); setDraft(null); setNotice('已取消選擇，棋盤未改變。') }} disabled={!selected}>取消選擇</button><button className="fire-primary" disabled={!draft || !preview || !humanTurn || !!aiError} onClick={() => { if (draft && preview) execute(draft, 'human', performance.now() - decisionStart.current) }}>確認{draft ? actionNames[draft.type] : '行動'}</button></div>
          <p className="fire-rule-hint">接火不消耗接手者啟用；已動者也能接火。移動與攻擊擇一。</p>
        </section>}
        {aiError && <div className="fire-error" role="alert"><p>{aiError}。棋盤保留於上一步，沒有代替對手待機。</p><button onClick={() => { setAiError(''); setRetry(value => value + 1) }}>重試對手行動</button><button onClick={() => { setForm({ ...settings }); setModal('new') }}>設定新局</button></div>}
        <div className="fire-last-events" data-testid="fire-last-events" role="status"><span>{lastTurn ? `第 ${lastTurn.index} 手 · ${names[lastTurn.side]}` : '初入須彌'}</span><p>{notice}</p></div>
      </aside></div>
      <section className="fire-record-tools"><details className="fire-log"><summary>逐步紀錄（{turns.length} 手）</summary>{turns.length ? <ol>{turns.map(turn => <li key={turn.index}><strong>{turn.index}. {names[turn.side]} · {actionNames[turn.action.type]}</strong><span>{turn.actor === 'ai' ? 'AI 計算' : turn.actor === 'human' ? '玩家決策' : '強制略過'} {turn.decisionMs} ms</span>{turn.events.map((event, index) => <p key={index}>{event.message}</p>)}</li>)}</ol> : <p>尚未行動。</p>}</details><div><button onClick={() => exportJson()}>匯出紀錄</button><button onClick={() => setModal('history')}>完成紀錄（{history.value.length}）</button></div></section>
      <footer className="fire-footer"><span>奪火 0.2 · {__BUILD_TIME__}</span><div><button onClick={() => setModal('install')}>安裝到手機</button><a href="?mode=duel">輪流插牌</a><a href="?legacy=1">原版借招</a></div></footer>
    </main>
    {modal && <Modal title={modal === 'new' ? '開始新局' : modal === 'rules' ? '奪火玩法' : modal === 'history' ? '完成紀錄' : modal === 'update' ? '更新奪火' : '安裝到手機'} close={() => setModal(null)}>
      {modal === 'new' && <form onSubmit={event => { event.preventDefault(); start(form) }}><p>阿修羅固定先手。開始新局會捨棄目前未完局；可先關閉視窗匯出。</p><label>規則版本<select aria-label="規則版本" value={form.variant} onChange={event => setForm({ ...form, variant: event.target.value as FireSettings['variant'] })}><option value="A">A · 送回己方祭壇</option><option value="B">B · 送入對方祭壇</option></select></label><label>對手<select aria-label="對手" value={form.opponent} onChange={event => setForm({ ...form, opponent: event.target.value as FireSettings['opponent'] })}><option value="ai">AI · 同規則對手</option><option value="local">同機雙人</option></select></label><label>我方角色<select aria-label="我方角色" value={form.humanSide} onChange={event => setForm({ ...form, humanSide: event.target.value as Side })}><option value="asura">阿修羅 · 甲方先手</option><option value="deva">天眾 · 乙方後手</option></select></label><p className="fire-muted">同機雙人由兩人交替操作；交換角色時，也請交換操作者。</p><button className="fire-primary fire-full" type="submit">開始奪火</button></form>}
      {modal === 'rules' && <div className="fire-rules"><p>兩名阿修羅對兩名天眾，爭奪 C3 神火。每人 3 HP，所有資訊公開。</p><h3>勝利：持火，另花一手奉獻</h3><p>A 版送回己方祭壇；B 版送入對方祭壇。阿修羅目標 {cellName(goalCell(settings.variant, 'asura'))}，天眾目標 {cellName(goalCell(settings.variant, 'deva'))}。到達、接火或投到祭壇都不自動得分。對方全滅也可獲勝。</p><h3>每輪：甲、乙、甲、乙</h3><p>一個時槽選一名未動角色做一項行動。每人每輪僅一次；四個時槽後重置。無可用角色自動略過。接火、受傷、被推都不消耗被動方啟用。</p><ul><li>移動：正交一至兩步，可轉彎、不能穿人。持火最多一步。走入地上火立即拾取並停步；腳下有火可原地拾火。</li><li>攻擊：相鄰敵人 1 傷；持火目標先掉火。存活可選沿攻擊方向推一格，撞人或界外不推。被推上火不會自動拾取。</li><li>投火：正交一至三格，第一位角色攔截，敵我皆受 1 傷；存活接火，死亡落地。接火者已動也不會恢復啟用。</li><li>奉獻、拾火或待機也花一次啟用。不能移動後再攻擊。</li></ul><p>角色 0 HP 退場；一方全滅立刻落敗。輪首完整局面第三次重複則和局。AI 使用相同合法動作與結算，有限搜尋不代表最佳解。</p><button className="fire-primary fire-full" onClick={() => setModal(null)}>回到棋盤</button></div>}
      {modal === 'history' && <div className="fire-history"><p>僅存最近 20 局完成對局，資料留在這台裝置。</p>{history.value.length ? history.value.map(record => <article key={record.id}><strong>{record.settings.variant} 版 · {record.outcome.winner ? `${names[record.outcome.winner]}勝` : '和局'}</strong><p>{new Date(record.completedAt).toLocaleString('zh-TW')} · {record.turns.length} 手</p>{record.feedback && <p>{record.feedback}</p>}<button onClick={() => exportJson(record)}>匯出此局</button></article>) : <p>尚無完成紀錄。</p>}</div>}
      {modal === 'install' && <div><p>安裝後從主畫面開啟奪火。初次請保持連線，等離線資源下載完成。</p>{pwa.install && <button className="fire-primary" onClick={() => { void pwa.install?.().catch(() => setNotice('安裝未成功，可從瀏覽器選單加入主畫面。')) }}>安裝奪火</button>}<p>iPhone／iPad：使用 Safari 開啟本頁 →「分享」→「加入主畫面」。Android：瀏覽器選單 →「安裝應用程式」或「新增至主畫面」。</p></div>}
      {modal === 'update' && <div><p>更新會重新載入，捨棄目前未完成的對局。完成紀錄仍保留；需要這局紀錄時請先匯出。</p><button onClick={() => exportJson()}>匯出紀錄</button><button className="fire-primary" onClick={() => pwa.update()}>捨棄未完局並更新</button></div>}
    </Modal>}
  </div>
}
