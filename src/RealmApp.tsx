import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { applyAction, coord, createRealm, domainCount, domains, outcome, score, supplyBreakdown } from './realm/engine'
import type { Cell, Player, RealmAction, RealmState, VictoryRule } from './realm/engine'
import { chooseAction } from './realm/ai'
import { defaults, readHistory, recordVictory, writeRecord } from './realm/storage'
import type { RealmRecord, RealmSettings, RealmTurn } from './realm/storage'
import { usePwa } from './pwa'
import './realm.css'

declare const __BUILD_TIME__: string
const names: Record<Player, string> = { asura: '阿修羅', deva: '天眾' }
const ruleNames: Record<VictoryRule, string> = { power: '總分制', domains: '爭域制' }
type Tool = 'small' | 'big' | 'power' | 'reverse' | 'inspect'
type ModalName = 'intro' | 'rules' | 'new' | 'history' | 'install' | null
const label = (cell: Cell): string => !cell ? '空格' : cell.kind === 'rubble' ? '殘骸，不能建造' : cell.kind === 'power' ? `${cell.axis === 'h' ? '橫向' : '縱向'}神力${cell.strength}` : `${names[cell.owner]}${cell.rank === 2 ? '大壇' : '普通壇'}`
function actionLabel(action: RealmAction): string {
  if (action.type === 'build') return `${coord(action.at)}建立${action.rank === 2 ? '大壇' : '普通壇'}`
  if (action.type === 'channel') return `${coord(action.at)}引入${action.axis === 'h' ? '橫向' : '縱向'}神力${action.strength}`
  return `燃毀${coord(action.sacrifice)}，逆轉${coord(action.power)}神力`
}
function Shrine({ owner, rank }: { owner: Player; rank: number }) {
  return <svg className={`realm-shrine ${owner}`} viewBox="0 0 80 70" aria-hidden="true">
    <path d="M10 62h60M17 55h46L58 45H22z" fill="currentColor" opacity=".4" />
    {owner === 'asura' ? <><path d="M22 42 10 30l8-12 7 16 9 4M58 42l12-12-8-12-7 16-9 4M26 46l-12 2-7-8m47 6 12 2 7-8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /><path d="m30 24-3-14 10 7h6l10-7-3 14v14l-10 9-10-9z" fill="currentColor" /><path d="m32 28 5 2m6 0 5-2" stroke="var(--realm-bg)" strokeWidth="3" /></> : <><path d="m15 31 25-20 25 20-25-7zM21 43l19-13 19 13z" fill="currentColor" /><path d="M30 39v13m20-13v13M40 6v8" stroke="currentColor" strokeWidth="5" /></>}
    {rank === 2 && <path d="m33 5 7-5 7 5-7 5z" fill="currentColor" />}
  </svg>
}
function RealmDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const opener = document.activeElement
    const dialog = ref.current
    dialog?.showModal()
    return () => { dialog?.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus() }
  }, [])
  return <dialog ref={ref} className="realm-dialog" aria-label={title} onKeyDown={event => {
    if (event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')]
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }} onCancel={e => { e.preventDefault(); close() }}><header><h2>{title}</h2><button onClick={close}>關閉</button></header>{children}</dialog>
}

export default function RealmApp() {
  const [initial] = useState<RealmSettings>(() => ({ ...defaults, victory: new URLSearchParams(location.search).get('victory') === 'power' ? 'power' : 'domains' }))
  const [settings, setSettings] = useState<RealmSettings>(initial)
  const [form, setForm] = useState<RealmSettings>(initial)
  const [game, setGame] = useState(() => createRealm(initial.mode, initial.first, initial.victory))
  const gameRef = useRef(game)
  const [history, setHistory] = useState(readHistory)
  const [storageError, setStorageError] = useState(false)
  const [modal, setModal] = useState<ModalName>(() => { try { return localStorage.getItem('nitian.realm.seen') ? null : 'intro' } catch { return 'intro' } })
  const [tool, setTool] = useState<Tool>('small')
  const [strength, setStrength] = useState(3)
  const [axis, setAxis] = useState<'h' | 'v'>('h')
  const [sacrifice, setSacrifice] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [draft, setDraft] = useState<RealmAction | null>(null)
  const [notice, setNotice] = useState('先選下方行動，再點棋盤。確認前都能取消。')
  const [aiError, setAiError] = useState('')
  const [retry, setRetry] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [feedbackSaved, setFeedbackSaved] = useState(false)
  const [turns, setTurns] = useState<RealmTurn[]>([])
  const turnsRef = useRef<RealmTurn[]>([])
  const record = useRef<RealmRecord | null>(null)
  const started = useRef(new Date().toISOString())
  const decisionStart = useRef(performance.now())
  const locked = useRef(false)
  const pwa = usePwa()
  const humanTurn = settings.opponent === 'local' || game.turn === settings.humanSide
  const playable = humanTurn && game.status === 'playing' && !modal
  const totals = score(game)
  const counts = domainCount(game)
  const victory = game.victory ?? 'power'
  const decision = outcome(game)
  const winningReason = decision.reason === 'domains' ? '控制區數' : decision.reason === 'power' ? '總神力' : '平手'
  const preview = useMemo(() => { if (!draft) return null; try { return applyAction(game, draft) } catch { return null } }, [game, draft])
  const shown = preview ?? game
  const afterTotals = preview ? score(preview) : null
  const afterCounts = preview ? domainCount(preview) : null
  const areas = domains(shown)
  const inventory = game.inventory[game.turn]
  const sourceDetails = selected === null ? [] : supplyBreakdown(shown, selected)

  useEffect(() => { locked.current = false }, [game])
  const execute = useCallback((action: RealmAction, expected: RealmState) => {
    if (locked.current || gameRef.current !== expected || expected.status !== 'playing') return
    locked.current = true
    try {
      const next = applyAction(expected, action)
      const turn: RealmTurn = { side: expected.turn, action, before: expected, after: next, decisionMs: Math.max(0, Math.round(performance.now() - decisionStart.current)) }
      const log = [...turnsRef.current, turn]
      turnsRef.current = log; gameRef.current = next
      setGame(next); setTurns(log); setDraft(null); setSacrifice(null); setSelected(null)
      setNotice(`${names[expected.turn]}：${actionLabel(action)}。${next.status === 'finished' ? '行動結束，神域結算。' : `輪到${names[next.turn]}。`}`)
      decisionStart.current = performance.now()
      if (next.status === 'finished') {
        const item: RealmRecord = { schema: 'nitian.realm.v1', id: `realm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, startedAt: started.current, completedAt: new Date().toISOString(), settings: { ...settings, victory: next.victory ?? 'power' }, turns: log, outcome: { winner: next.winner!, scores: score(next), rule: next.victory ?? 'power', reason: outcome(next).reason, domains: domainCount(next) }, feedback: '' }
        record.current = item
        const saved = writeRecord(item); setHistory(saved); if (saved.error) setStorageError(true)
      }
    } catch (error) { locked.current = false; setNotice(error instanceof Error ? error.message : '行動無法執行，請重新選擇。') }
  }, [settings])

  useEffect(() => {
    if (game.status !== 'playing' || humanTurn || modal || aiError) return
    const timer = setTimeout(() => {
      try { const action = chooseAction(game); if (!action) throw Error('AI沒有找到合法行動'); execute(action, game) }
      catch { setAiError('AI暫時無法出手，請重試或開新局。') }
    }, 600)
    return () => clearTimeout(timer)
  }, [game, humanTurn, modal, execute, aiError, retry])

  function closeModal() {
    if (modal === 'intro') { try { localStorage.setItem('nitian.realm.seen', '1') } catch { setStorageError(true) } }
    setModal(null); decisionStart.current = performance.now()
  }
  function start(next: RealmSettings) {
    const initial = createRealm(next.mode, next.first, next.victory ?? 'power')
    gameRef.current = initial; turnsRef.current = []; record.current = null; started.current = new Date().toISOString(); locked.current = false
    setSettings({ ...next }); setForm({ ...next }); setGame(initial); setTurns([]); setDraft(null); setSacrifice(null); setSelected(null); setTool('small'); setStrength(3); setAxis('h'); setAiError(''); setFeedback(''); setFeedbackSaved(false); setModal(null)
    setNotice(`${next.mode === 'trial' ? '四手試局：雙方各兩步' : '完整局：雙方各六步'}。${next.victory === 'domains' ? '先比控制區數，相同才比總神力。' : '最後總神力高者勝。'}`); decisionStart.current = performance.now()
  }
  function selectTool(next: Tool, value?: number) { setTool(next); if (value !== undefined) setStrength(value); setDraft(null); setSacrifice(null); setSelected(null); setNotice(next === 'reverse' ? '先點要燃毀的己方神壇，再點同列或同欄的神力。' : next === 'inspect' ? '點神壇查每一股供應；點神力查它供應的方向。' : '點一個空格預覽，再按確認落子。') }
  function clickCell(at: number) {
    setSelected(at)
    if (!playable || tool === 'inspect') return
    if (tool !== 'reverse' && game.board[at]) { setDraft(null); setNotice(`${coord(at)}已有${label(game.board[at])}，請選空格。`); return }
    let action: RealmAction | null = null
    if (tool === 'reverse') {
      const cell = game.board[at]
      if (cell?.kind === 'shrine' && cell.owner === game.turn) { setSacrifice(at); setDraft(null); setNotice(`將燃毀${coord(at)}，現在點同列或同欄的神力。`); return }
      if (sacrifice !== null) {
        if (cell?.kind !== 'power') { setDraft(null); setNotice('接著請點有箭頭的神力格，不能逆轉神壇或空格。'); return }
        if (Math.floor(sacrifice / 4) !== Math.floor(at / 4) && sacrifice % 4 !== at % 4) { setDraft(null); setNotice(`${coord(at)}不在${coord(sacrifice)}的同列或同欄，請選對齊的神力。`); return }
        action = { type: 'reverse', sacrifice, power: at }
      }
      else { setNotice('先選自己的神壇；不能燃毀對方神壇。'); return }
    } else if (tool === 'power') action = { type: 'channel', at, strength, axis }
    else action = { type: 'build', at, rank: tool === 'big' ? 2 : 1 }
    try { applyAction(game, action); setDraft(action); setNotice(`預覽：${actionLabel(action)}。尚未出手。`) }
    catch (error) { setDraft(null); setNotice(error instanceof Error ? error.message : '這裡不能放置。') }
  }
  function changeAxis(next: 'h' | 'v') { setAxis(next); if (draft?.type === 'channel') setDraft({ ...draft, axis: next }) }
  function exportRecord() {
    const data = record.current ?? { schema: 'nitian.realm.v1', id: 'realm-current', startedAt: started.current, completedAt: null, settings, turns, outcome: null, feedback }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `nitian-realm-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function saveFeedback() {
    if (!record.current) return
    const next = { ...record.current, feedback }; record.current = next
    const saved = writeRecord(next); setHistory(saved); setFeedbackSaved(!saved.error); if (saved.error) setStorageError(true)
  }
  const selectedCell = selected === null ? null : shown.board[selected]
  const selectedPower = selectedCell?.kind === 'power' ? selected : draft?.type === 'reverse' ? draft.power : draft?.type === 'channel' ? draft.at : null
  const flows = shown.board.flatMap((cell, at) => cell?.kind === 'power' ? [{ at, ...cell }] : [])
  const last = turns.at(-1)

  return <main className="realm-app" onClickCapture={event => { const button = event.target instanceof Element ? event.target.closest('button') : null; button?.focus({ preventScroll: true }) }}>
    <header className="realm-header"><div><span className="realm-eyebrow">逆天 · {ruleNames[victory]}</span><h1>共享神域</h1><p>{victory === 'domains' ? '爭奪四域，燃壇逆轉。' : '建壇借力，燃壇逆轉。'}</p></div><div className="realm-nav"><button onClick={() => setModal('rules')}>玩法</button><button onClick={() => { setForm(settings); setModal('new') }}>新局</button></div></header>
    <section className="realm-scores" data-victory={victory} aria-label="目前控制區數與神力">
      {(['asura', 'deva'] as const).map(player => <div key={player} className={`${player} ${game.turn === player && game.status === 'playing' ? 'active' : ''}`}><span>{names[player]}{settings.opponent === 'ai' && settings.humanSide === player ? ' · 你' : ''}</span><span className="realm-domain-total"><strong data-testid={`domain-score-${player}`}>{counts[player]}</strong> 區{victory === 'power' && <small>（參考）</small>}{afterCounts && <small> → {afterCounts[player]}區</small>}</span><span className="realm-power-total">神力 <strong data-testid={`realm-score-${player}`}>{totals[player]}</strong></span>{afterTotals && <span className="realm-delta">→ 神力{afterTotals[player]}（{afterTotals[player] - totals[player] >= 0 ? '+' : ''}{afterTotals[player] - totals[player]}）</span>}<small>剩 {game.remaining[player]} 步</small></div>)}
    </section>
    <div className="realm-turn" data-testid="realm-result" role="status">{game.status === 'finished' ? `${game.winner === 'draw' ? '平手' : `${game.winner === settings.humanSide ? '勝利' : '敗北'} · ${names[game.winner!]}獲勝`} · ${winningReason}判定${victory === 'domains' ? ` · 控制區數 修${counts.asura}：天${counts.deva}` : ''} · 總神力 ${totals.asura}：${totals.deva}` : `${names[game.turn]}${!humanTurn ? '正在思考…' : '行動'} · ${settings.mode === 'full' ? '雙方各六步' : '四手試局'} · ${victory === 'domains' ? '先比區數，同區才比神力' : '結束時總神力高者勝'}`}</div>
    <div className="realm-layout"><section className="realm-battlefield" aria-label="須彌山神域">
      <section className="realm-domain-map" aria-label={preview ? '四域控制預覽' : '四域控制'}><h3 className="realm-domain-label">{preview ? '四域預覽 · 尚未落子' : '目前四域'}{victory === 'power' ? ' · 區數僅供對照，總神力決勝' : ''}</h3>{areas.map(area => <div key={area.id} data-testid={`domain-${area.id}`} data-controller={area.controller ?? 'none'} data-asura={area.scores.asura} data-deva={area.scores.deva}><b>{area.name}</b><span>修{area.scores.asura}：天{area.scores.deva}</span><small>{area.controller ? `${names[area.controller]}控制` : '同分無主'}</small></div>)}</section>
      <div className="realm-col-labels" aria-hidden="true"><span>A</span><span>B</span><span>C</span><span>D</span></div>
      <div className={`realm-board with-domains ${preview ? 'is-preview' : ''}`} data-testid="realm-board" data-state={JSON.stringify(game)} data-preview={preview ? JSON.stringify(preview) : ''}>
        <svg className="realm-dividers" viewBox="0 0 400 400" aria-hidden="true"><path d="M200 0V400M0 200H400" /></svg>
        <svg className="realm-flows" viewBox="0 0 400 400" aria-hidden="true">{flows.map(flow => {
          const x = (flow.at % 4) * 100 + 50, y = Math.floor(flow.at / 4) * 100 + 50
          const focus = selectedPower === flow.at || sourceDetails.some(s => s.source === flow.at)
          return <g key={flow.at} className={focus ? 'focused' : ''}><line x1={flow.axis === 'h' ? 5 : x} y1={flow.axis === 'v' ? 5 : y} x2={flow.axis === 'h' ? 395 : x} y2={flow.axis === 'v' ? 395 : y} /><circle cx={x} cy={y} r="22" /></g>
        })}</svg>
        {shown.board.map((cell, at) => <button key={at} data-testid={`realm-cell-${at}`} data-kind={cell?.kind ?? 'empty'} data-owner={cell?.kind === 'shrine' ? cell.owner : ''} aria-label={`${coord(at)} ${label(cell)}`} aria-pressed={selected === at || sacrifice === at} className={`realm-cell ${cell?.kind ?? 'empty'} ${cell?.kind === 'shrine' ? cell.owner : ''} ${sacrifice === at ? 'sacrifice' : ''}`} onClick={() => clickCell(at)}><span className="realm-coord">{coord(at)}</span>{cell?.kind === 'shrine' ? <><Shrine owner={cell.owner} rank={cell.rank} /><span className="realm-cell-name">{cell.owner === 'asura' ? '修' : '天'}・{cell.rank === 2 ? '大壇' : '普壇'}</span><span className="realm-cell-value">{supplyBreakdown(shown, at).reduce((n, source) => n + source.value, 0)}</span></> : cell?.kind === 'power' ? <><span className="realm-power-mark">{cell.axis === 'h' ? '↔' : '↕'}</span><span className="realm-cell-name">神力 {cell.strength}</span></> : cell?.kind === 'rubble' ? <><span className="realm-rubble-mark">⋀</span><span className="realm-cell-name">殘骸</span></> : <span className="realm-empty-mark">＋</span>}</button>)}
      </div>
      <div className="realm-reading" data-testid="realm-supply" aria-live="polite">{selected !== null ? <><strong>{coord(selected)} · {label(selectedCell)}</strong><span>{selectedCell?.kind === 'shrine' ? sourceDetails.length ? sourceDetails.map(s => `${coord(s.source)}${s.axis === 'h' ? '橫' : '縱'}${s.strength} × ${s.multiplier} = ${s.value}`).join('；') : '尚無神力供應。' : selectedCell?.kind === 'power' ? `供應這一${selectedCell.axis === 'h' ? '橫列' : '縱欄'}的所有神壇，敵我都能借力。` : selectedCell?.kind === 'rubble' ? '燃毀後永久占格，不再接收神力。' : '可建立神壇或放入神力。'}</span></> : <span>點「查看供應」，再點任一神壇，就能看到分數來源。</span>}</div>
    </section><section className="realm-command" aria-label="選擇行動">
      <div className="realm-command-heading"><h2>{game.status === 'finished' ? '這一局的選擇' : `${names[game.turn]}的行動`}</h2><button aria-pressed={tool === 'inspect'} onClick={() => selectTool('inspect')}>查看供應</button></div>
      <div className="realm-tools"><button aria-label="普通壇" disabled={!playable || !inventory.small} aria-pressed={tool === 'small'} onClick={() => selectTool('small')}>普通壇<small>一倍 · 剩{inventory.small}</small></button><button aria-label="大壇" disabled={!playable || !inventory.big} aria-pressed={tool === 'big'} onClick={() => selectTool('big')}>大壇<small>兩倍 · 剩{inventory.big}</small></button><button aria-label="犧牲逆轉" disabled={!playable || !game.board.some(c => c?.kind === 'shrine' && c.owner === game.turn)} aria-pressed={tool === 'reverse'} onClick={() => selectTool('reverse')}>犧牲逆轉<small>燃己壇，轉神力</small></button></div>
      <div className="realm-power-tools">{[1, 2, 3].map(value => <button key={value} aria-label={`神力${value}`} disabled={!playable || !inventory.powers.includes(value)} aria-pressed={tool === 'power' && strength === value} onClick={() => selectTool('power', value)}>神力{value}<small>{inventory.powers.includes(value) ? '可用' : '已用完'}</small></button>)}</div>
      {tool === 'power' && <div className="realm-axis" aria-label="神力方向"><button disabled={!playable} aria-pressed={axis === 'h'} onClick={() => changeAxis('h')}>橫向</button><button disabled={!playable} aria-pressed={axis === 'v'} onClick={() => changeAxis('v')}>縱向</button></div>}
      <p className="realm-notice" aria-live="polite">{notice}</p>
      {aiError && <div role="alert">{aiError}<button onClick={() => { setAiError(''); setRetry(x => x + 1) }}>重試AI</button></div>}
      {game.status === 'finished' && <div className="realm-result"><p>這是當前神力的結算，不是逐回合累積。</p><button onClick={() => start(settings)}>再玩一局</button><button onClick={() => start({ ...settings, humanSide: settings.humanSide === 'asura' ? 'deva' : 'asura', first: settings.first === 'asura' ? 'deva' : 'asura' })}>換邊再玩</button><label>哪一步有意思，或哪裡看不懂？<textarea aria-label="試玩回饋" maxLength={2000} value={feedback} onChange={e => { setFeedback(e.target.value); setFeedbackSaved(false) }} /></label><button onClick={saveFeedback}>儲存回饋</button>{feedbackSaved && <span role="status">回饋已存在此裝置。</span>}</div>}
      {last && <details className="realm-log"><summary>結算紀錄（{turns.length}手）</summary><ol>{turns.map((turn, i) => <li key={i}>{names[turn.side]}：{actionLabel(turn.action)} · {score(turn.before).asura}：{score(turn.before).deva} → {score(turn.after).asura}：{score(turn.after).deva}</li>)}</ol></details>}
      <div className="realm-secondary"><button onClick={() => start({ ...settings, victory: victory === 'domains' ? 'power' : 'domains' })}>{victory === 'domains' ? '切換總分制重開' : '切換爭域制重開'}</button><button onClick={exportRecord}>匯出紀錄</button><button onClick={() => setModal('history')}>紀錄</button><button onClick={() => setModal('install')}>安裝到手機</button></div>
      {(storageError || history.error) && <p role="alert">本機儲存失敗或紀錄損壞；仍可遊玩，請匯出紀錄保留結果。</p>}
      {pwa.updateAvailable && <button onClick={() => { if (game.ply === 0 || game.status === 'finished' || confirm('更新會重新開始本局，是否繼續？')) pwa.update() }}>有新版，立即更新</button>}{pwa.error && <p>離線快取暫時無法更新，請連網重新整理。</p>}
      <footer className="realm-meta">原創神話奇幻 · {ruleNames[victory]}<br /><a href="?mode=fire">奪火舊版</a> · <a href="?mode=duel">對決舊版</a><br />版本 0.4 · {new Date(__BUILD_TIME__).toLocaleString('zh-TW')}</footer>
    </section></div>
    <div className="realm-confirm"><div><strong>{draft && afterTotals && afterCounts ? victory === 'domains' ? `預覽 · 修${counts.asura}→${afterCounts.asura}區 ｜ 天${counts.deva}→${afterCounts.deva}區` : `預覽 · 修 ${totals.asura}→${afterTotals.asura} ｜ 天 ${totals.deva}→${afterTotals.deva}` : game.status === 'finished' ? '戰局結束' : humanTurn ? '選擇你這一步' : '等待對手'}</strong><span>{draft ? `${actionLabel(draft)}${victory === 'domains' && afterTotals ? ` · 神力修${totals.asura}→${afterTotals.asura}／天${totals.deva}→${afterTotals.deva}` : ''}` : `${victory === 'domains' ? `控制 修${counts.asura}：天${counts.deva}區 · ` : ''}神力 修${totals.asura}：天${totals.deva}`}</span></div><button disabled={!draft} onClick={() => { setDraft(null); setSacrifice(null); setSelected(null); setNotice('已取消，未消耗行動或配件。') }}>取消預覽</button><button className="realm-primary" disabled={!draft || !playable} onClick={() => { if (draft) execute(draft, game) }}>確認落子</button></div>
    {modal && <RealmDialog title={modal === 'intro' ? '神域怎麼玩' : modal === 'rules' ? '共享神域玩法' : modal === 'new' ? '開始新局' : modal === 'history' ? '本機試玩紀錄' : '安裝到手機'} close={closeModal}>
      {(modal === 'intro' || modal === 'rules') && <><p>{ruleNames[victory]}：{game.mode === 'trial' ? '試局雙方各兩步' : '完整局雙方各六步'}。{victory === 'domains' ? '四個2×2區域各自比較神壇收益，較高者控制該區，同分無人控制。最後先比控制區數，相同才比總神力，再相同為平手。' : '最後總神力較高者勝，同分為平手。'}每步從三種行動選一種。</p><div className="realm-rule"><b>① 立壇</b><p>普通壇收一倍，大壇收兩倍。棋盤上神壇下方的數字就是當前收益。</p><b>② 引力</b><p>把神力放在空格，選橫或縱。光流供應整條線所有神壇，不受區界阻擋；收益歸接收神壇所在的區。</p><b>③ 逆轉</b><p>先點自己的神壇，再點同列或同欄的神力。確認後神壇燃毀、神力轉90度，永久留下殘骸。</p></div><p>分數只計當前供應，不逐手累積；多股神力相加。先點行動，再點棋盤，預覽後確認。「查看供應」可查每一分從哪裡來。「新局」可選爭域制或原總分制。</p><button className="realm-primary" onClick={closeModal}>開始試玩</button><button onClick={() => { closeModal(); start({ ...settings, mode: 'trial' }) }}>先試四手局面</button></>}
      {modal === 'new' && <form onSubmit={e => { e.preventDefault(); start(form) }}><label>勝利規則<select aria-label="勝利規則" value={form.victory ?? 'power'} onChange={e => setForm({ ...form, victory: e.target.value as VictoryRule })}><option value="domains">爭域制 · 先比控制區數</option><option value="power">總分制 · 比總神力</option></select></label><label>試玩局面<select aria-label="試玩局面" value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value as RealmSettings['mode'] })}><option value="full">完整局 · 雙方各六步</option><option value="trial">四手試局 · 5比6的抉擇</option></select></label><label>對手<select aria-label="對手" value={form.opponent} onChange={e => setForm({ ...form, opponent: e.target.value as RealmSettings['opponent'] })}><option value="ai">AI對手</option><option value="local">同機雙人</option></select></label><label>我的陣營<select aria-label="我的陣營" value={form.humanSide} onChange={e => setForm({ ...form, humanSide: e.target.value as Player })}><option value="asura">阿修羅</option><option value="deva">天眾</option></select></label><label>先手<select aria-label="先手" value={form.first} onChange={e => setForm({ ...form, first: e.target.value as Player })}><option value="asura">阿修羅</option><option value="deva">天眾</option></select></label><p>兩制只改勝利判定，棋盤、配件與行動相同。AI使用相同規則；可換先手比較。</p><button className="realm-primary" type="submit">開始新局</button></form>}
      {modal === 'history' && <>{history.records.length === 0 ? <p>尚無已完成紀錄。正在進行的局面可用「匯出紀錄」保留。</p> : <ol>{history.records.map(item => <li key={item.id}>{new Date(item.completedAt!).toLocaleString('zh-TW')} · {ruleNames[recordVictory(item)]} · {item.outcome?.winner === 'draw' ? '平手' : `${names[item.outcome!.winner as Player]}獲勝`} · 神力{item.outcome?.scores.asura}：{item.outcome?.scores.deva}{item.outcome?.domains && <span> · 控制{item.outcome.domains.asura}：{item.outcome.domains.deva}區</span>}<p>{item.feedback}</p></li>)}</ol>}<p>只存在此裝置，最多保留20局；不會傳送到伺服器。舊紀錄以總分制顯示。重新整理會開始新局。</p></>}
      {modal === 'install' && <><p>iPhone：用 Safari 開啟此網址，點分享 → 加入主畫面。Android：瀏覽器選單 → 安裝應用程式／加入主畫面。</p><p>首次連網載入後可離線重開。關閉或重新整理不保留未完成局面，已完成紀錄保留於本機。</p>{pwa.install && <button onClick={() => { void pwa.install?.() }}>安裝應用程式</button>}</>}
    </RealmDialog>}
  </main>
}
