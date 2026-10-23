import { useMemo, useState } from 'react'
import type { CombatEvent, Resources } from './game/types'
import type { DuelTimelineCard } from './game/duel'
import { CARDS } from './game/data'
import { createLesson, explainEvent, explainTimeline } from './game/explanations'

const names = { player: '我方・阿修羅', enemy: '對方・雷衛', system: '戰局' }
type LessonKind = 'before' | 'after' | 'blocked' | 'evaded'

export function EventExplanation({ event, index, total, testId }: { event: CombatEvent; index: number; total: number; testId: string }) {
  const explanation = explainEvent(event)
  return <div className={`resolution-explanation effect-${event.effect}`} data-testid={testId} aria-live="polite">
    <span className="resolution-position">事件 {index + 1} / {total}{event.effect !== 'discard' && ` · 軌道第 ${event.mainIndex + 1} 招`}{event.effect === 'reflect' && ' · 接續反擊'}</span>
    <strong>{explanation.title}</strong><p>{explanation.detail}</p>
    <div className="event-resources">{(['player', 'enemy'] as const).map(side => <div key={side}><b>{names[side]}</b><span>生命 {event.before[side].hp} → <em>{event.after[side].hp}</em></span><span>盾 {event.before[side].shield} → {event.after[side].shield} · 雷 {event.before[side].thunder} → {event.after[side].thunder}</span></div>)}</div>
  </div>
}

function LearningVitals({ resources, prefix, ended = false }: { resources: Resources; prefix: 'lesson' | 'replay'; ended?: boolean }) {
  return <div className="learning-vitals">{(['player', 'enemy'] as const).map(side => <div key={side}><span>{names[side]}</span><strong>生命 <b data-testid={`${prefix}-${side}-hp`}>{resources[side].hp}</b></strong><small>盾 {resources[side].shield} · 雷 {resources[side].thunder}{resources[side].thorns ? ended ? ' · 倒刺本回合未觸發' : ' · 倒刺待命' : ''}{resources[side].evade ? ended ? ' · 避鋒本回合未用到' : ' · 避鋒待命' : ''}</small></div>)}</div>
}

function LearningTimeline({ timeline, active }: { timeline: DuelTimelineCard[]; active?: number }) {
  return <ol className="learning-timeline" data-testid="lesson-timeline">{timeline.map((card, index) => <li key={card.instanceId} className={`${card.side} ${active === index ? 'active' : ''}`}><span>{index + 1}</span><b>{card.side === 'player' ? '我方' : '對方'} · {CARDS[card.cardId].name}</b>{active === index && <small>正在執行</small>}</li>)}</ol>
}

export function ResolutionLesson({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<LessonKind>('before')
  const [index, setIndex] = useState(-1)
  const lesson = useMemo(() => createLesson(kind), [kind])
  const event = lesson.result.events[index]
  const complete = index === lesson.result.events.length - 1
  const resources = event?.after ?? lesson.state
  const captions: Record<LessonKind, string> = {
    before: '倒刺先執行 → 對方破勢 → 我方存活，立刻反傷。全都在同一回合。',
    after: '對方先打完，倒刺才待命。之後沒有攻擊，就不會反傷，也不會留到下一回合。',
    blocked: '護盾擋住全部傷害，仍算受到未閃避的攻擊，所以同一回合會反傷。',
    evaded: '避鋒把攻擊取消，這次不觸發倒刺。兩者不是同一次攻擊可以疊加的防守收益。',
  }
  return <div className="resolution-lesson">
    <p className="lesson-intro"><strong>落牌只是排順序，結算走到那張牌才生效。</strong><br/>倒刺會反擊本回合之後的攻擊，不會等到下回合。這是獨立示範，不影響你的交手或戰績。</p>
    <div className="lesson-options" aria-label="教學情境">{([
      ['before', '倒刺在攻擊前'], ['after', '倒刺在攻擊後'], ['blocked', '先護身再倒刺'], ['evaded', '倒刺加避鋒'],
    ] as const).map(([value, label]) => <button key={value} aria-pressed={kind === value} onClick={() => { setKind(value); setIndex(-1) }}>{label}</button>)}</div>
    <LearningTimeline timeline={lesson.state.timeline} active={event?.mainIndex}/>
    <LearningVitals resources={resources} prefix="lesson" ended={complete}/>
    {event ? <EventExplanation event={event} index={index} total={lesson.result.events.length} testId="lesson-explanation"/> : <p className="lesson-prompt" data-testid="lesson-explanation">現在只有排好牌，生命與資源還沒改變。按「教學下一步」，開始依序執行。</p>}
    {complete && <p className="lesson-conclusion">{captions[kind]}</p>}
    <div className="lesson-controls"><button className="primary" onClick={() => setIndex(value => Math.min(value + 1, lesson.result.events.length - 1))} disabled={complete}>教學下一步</button><button onClick={() => setIndex(-1)}>從頭示範</button><button onClick={onClose}>我懂了，回到交手</button><button onClick={onClose}>略過教學</button></div>
    <p className="quiet">記住：倒刺先待命、挨打後還活著才反擊；被閃避取消的攻擊不反擊，未觸發的倒刺下回合清除。</p>
  </div>
}

export function RoundReplay({ events, timeline }: { events: CombatEvent[]; timeline: DuelTimelineCard[] }) {
  const [index, setIndex] = useState(-1)
  if (!events.length) return <p>這回合沒有可重看的事件。</p>
  const event = events[index]
  return <div className="round-replay">
    <p>獨立重看，不會再次扣血或保存戰績。</p>
    <LearningTimeline timeline={timeline} active={event?.mainIndex}/>
    <LearningVitals resources={event?.after ?? events[0].before} prefix="replay" ended={index === events.length - 1}/>
    {event ? <EventExplanation event={event} index={index} total={events.length} testId="replay-explanation"/> : <p data-testid="replay-explanation">這是結算前的狀態。按下一步查看第一個事件。</p>}
    <div className="lesson-controls"><button className="primary" onClick={() => setIndex(value => Math.min(value + 1, events.length - 1))} disabled={index >= events.length - 1}>重看下一步</button><button onClick={() => setIndex(value => Math.max(-1, value - 1))} disabled={index < 0}>重看上一步</button><button onClick={() => setIndex(-1)}>從頭重看</button></div>
  </div>
}

export function RoundSummary({ events, timeline, onReplay }: { events: CombatEvent[]; timeline: DuelTimelineCard[]; onReplay: () => void }) {
  if (!events.length) return null
  const first = events[0].before, last = events[events.length - 1].after
  const explanations = explainTimeline(timeline, events)
  const death = events.find(event => event.effect === 'defeat')
  return <section className="round-summary" data-testid="round-summary" aria-label="本回合發生了什麼">
    <div className="round-summary-heading"><h2>這回合，發生了什麼？</h2><button onClick={onReplay}>重看本回合</button></div>
    <p className="round-damage">我方生命 <strong>{first.player.hp} → {last.player.hp}</strong> · 對方生命 <strong>{first.enemy.hp} → {last.enemy.hp}</strong></p>
    {death && <p className="death-explanation">{death.before.player.hp === 0 ? '我方倒下' : '對方倒下'}，後面的牌不再執行。可重看最後一次攻擊與接續反擊。</p>}
    <ol className="action-result-list">{explanations.map(explanation => <li key={explanation.index} className={explanation.tone}><span>{explanation.index + 1} · {explanation.side === 'player' ? '我方' : '對方'} · {CARDS[explanation.cardId].name}</span><strong>{explanation.title}</strong><p>{explanation.detail}</p></li>)}</ol>
    <p className="round-expiry">護盾、倒刺、避鋒都不帶入下一回合；雷量才會保留。</p>
  </section>
}
