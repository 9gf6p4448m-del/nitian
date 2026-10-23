import type { CombatEvent } from './game/types'

const paths: Record<string, string> = {
  blade: 'M7 27 24 7l4-3-2 7L10 28m-5-7 10 10M3 31l5-5',
  shield: 'M17 3 29 8v9c0 8-12 14-12 14S5 25 5 17V8Zm0 7v15m-6-8h12',
  bolt: 'M21 2 8 19h9l-3 13 14-19h-9Z',
  sun: 'M17 3v4m0 20v4M3 17h4m20 0h4M7 7l3 3m14 14 3 3M7 27l3-3m14-14 3-3M17 10l6 7-6 7-6-7Z',
  mirror: 'M17 3 28 10v13l-11 8L6 23V10Zm0 6v16m-6-13 12 10',
  thorns: 'm5 28 8-15 4 7 7-15 5 23M8 21l-5-5m12 1-5-9m12 9 8-5',
  wind: 'M4 12h18c7 0 7-9 0-9m-18 16h24c7 0 7 10 0 10M4 26h12',
  vessel: 'm10 5 4 5v7L7 29h21l-7-12v-7l4-5M13 23h9M7 3h20',
}
export function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <svg className={`icon ${className}`} viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.bolt}/></svg>
}

function Warrior({ deva = false }: { deva?: boolean }) {
  const skin = deva ? '#e8dec4' : '#a94a35'
  const armor = deva ? '#ab8b51' : '#6e6a66'
  const dark = deva ? '#4c6063' : '#3d3e50'
  return <svg viewBox="0 0 300 340" className={`warrior ${deva ? 'deva' : 'asura'}`} aria-hidden="true">
    <ellipse cx="150" cy="325" rx="97" ry="9" fill="#040b10" opacity=".5"/>
    <circle cx="150" cy="92" r="69" fill="none" stroke={armor} strokeWidth="1" opacity=".6"/>
    <circle cx="150" cy="92" r="60" fill="none" stroke={armor} strokeDasharray="2 8" opacity=".5"/>
    <g fill={skin} stroke={armor} strokeWidth="2">
      <path d="M122 122 88 105 54 57 42 64 68 119l44 35ZM119 148 68 141 37 111 27 124 61 163l57 15ZM118 173l-48 23-42-3-2 16 52 5 54-20Z" opacity={deva ? '.18' : '.65'}/>
      <path d="m178 122 34-17 34-48 12 7-26 55-44 35ZM181 148l51-7 31-30 10 13-34 39-57 15ZM182 173l48 23 42-3 2 16-52 5-54-20Z" opacity={deva ? '.18' : '.65'}/>
      <path d="m120 129-40 37-16 62 15 6 25-53 31-15M180 129l40 37 16 62-15 6-25-53-31-15"/>
    </g>
    <path d="m119 224-10 53-16 39 34 3 23-75 22 75 34-3-15-39-10-53Z" fill={skin} stroke={armor} strokeWidth="2"/>
    <path d="m116 193-18 49 29 20 23-17 23 17 29-20-18-49Z" fill={dark} stroke={armor} strokeWidth="3"/>
    <path d="m117 132 12-14h42l12 14-6 61-27 17-27-17Z" fill={skin}/>
    <path d="m112 131 24-10 14 16 14-16 24 10-8 39-30 13-30-13Z" fill={dark} stroke={armor} strokeWidth="3"/>
    <path d="m150 141 15 18-15 17-15-17Z" fill={armor}/>
    <path d="M116 193h68l-5 14h-58Z" fill={armor}/>
    <path d="m150 194 8 8-8 15-8-15Z" fill={deva ? '#b4edee' : '#e3b466'}/>
    <path d="M127 65q23-16 46 0v34l-12 20h-22l-12-20Z" fill={skin} stroke={armor} strokeWidth="2"/>
    <path d="m124 73-4-15 11-9 4-27 15 17 15-17 4 27 11 9-4 15-26-9Z" fill={dark} stroke={armor} strokeWidth="3"/>
    <path d="m128 78 14 5m16 0 14-5" stroke={deva ? '#bffbff' : '#ffe2a0'} strokeWidth="4"/>
    <path d="m145 101 5 3 5-3" fill="none" stroke={dark} strokeWidth="2"/>
    <g fill="none" stroke={armor} strokeWidth="3"><path d="m94 316 30 2m51 0 30-2M67 225l16 6m134 0 16-6"/></g>
    {deva && <g stroke="#c9bc87" strokeWidth="4"><path d="M248 43v259"/><path d="m248 18-12 37 12-9 12 9Z" fill="#beeef2"/></g>}
  </svg>
}

export function Arena({ event, home = false }: { event?: CombatEvent; home?: boolean }) {
  const hit = event && (event.effect === 'attack' || event.effect === 'reflect') && event.amount > 0
  const transfer = event?.effect === 'transfer' && event.amount > 0
  const broken = event && (['player', 'enemy'] as const).some(side => event.before[side].shield > 0 && event.after[side].shield === 0)
  return <div className={`arena ${home ? 'arena-home' : ''} ${hit ? `impact-${event.target}` : ''} ${broken ? 'shield-break' : ''}`} data-effect={event?.effect}>
    <svg className="temple" viewBox="0 0 1200 330" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs><radialGradient id="sky"><stop stopColor="#52616a" stopOpacity=".6"/><stop offset="1" stopColor="#14232b" stopOpacity="0"/></radialGradient></defs>
      <ellipse cx="600" cy="150" rx="500" ry="230" fill="url(#sky)"/>
      <g fill="none" stroke="#a58a54" opacity=".2"><circle cx="600" cy="190" r="145"/><circle cx="600" cy="190" r="131"/><circle cx="600" cy="190" r="105" strokeDasharray="2 9"/><path d="M600 20v300M440 190h320M490 80l220 220m0-220L490 300"/></g>
      <path d="M0 259 99 200l72 35 73-100 82 105 101-38 71 61 104-126 118 112 75-77 82 55 110-80 70 112 143-54v125H0Z" fill="#0a1820" opacity=".7"/>
      <g fill="#263035" stroke="#8a744b" strokeOpacity=".25"><path d="M41 0h30v287H41ZM1129 0h30v287h-30Z"/><path d="M21 0h70v19H21Zm1088 0h70v19h-70Z"/></g>
      <path d="M0 300h1200v30H0Z" fill="#111e25"/><path d="M0 299h1200M380 310h440m-385 10h330" stroke="#b09359" opacity=".3"/>
    </svg>
    <div className="fighter-art fighter-player"><Warrior/></div>
    <div className="arena-center"><span>須彌山門</span><div className="versus">⟡</div><small>阿修羅 · 雷衛</small></div>
    <div className="fighter-art fighter-enemy"><Warrior deva/></div>
    {transfer && <div className={`thunder-beam ${event.label === '借甲' ? 'armor-beam' : ''}`} key={event.index}><i/><i/><b>{event.label === '借甲' ? '借甲' : '引雷'} +{event.amount}</b></div>}
    {event?.label === '奉還' && <div className="return-flash" key={event.index}>奉 還</div>}
    {hit && <div className={`damage-float damage-${event.target}`} key={event.index}>−{event.amount}</div>}
  </div>
}
