import type { FireUnit } from './engine'

export function SacredFire({ className = '' }: { className?: string }) {
  return <svg className={`fire-flame ${className}`} viewBox="0 0 36 44" aria-hidden="true"><path fill="#d64c23" d="M18 1C22 14 34 17 32 29C30 45 5 45 3 30C1 20 12 15 12 8C18 15 11 22 16 24C22 19 23 12 18 1Z"/><path fill="#ffc45c" d="M18 15C22 25 29 25 26 34C23 43 10 41 9 33C8 27 15 24 18 15Z"/><path fill="#fff0b0" d="M18 28C19 33 23 35 20 39C15 42 12 36 18 28Z"/></svg>
}
export default function FirePawn({ unit, holder, selected }: { unit: FireUnit; holder: boolean; selected: boolean }) {
  const asura = unit.side === 'asura'
  return <span className={`fire-pawn ${asura ? 'fire-asura' : 'fire-deva'} ${unit.used ? 'fire-used' : ''} ${selected ? 'fire-selected-pawn' : ''}`}>
    <svg viewBox="0 0 80 78" aria-hidden="true">
      <ellipse cx="40" cy="70" rx="27" ry="5" fill="#080c0f" opacity=".5"/>
      {asura ? <>
        <circle cx="40" cy="37" r="30" fill="#6d2923" stroke="#e59358" strokeWidth="1.5"/>
        <path d="M26 41L12 30M25 48L9 48M29 54L17 65M54 41L68 30M55 48L71 48M51 54L63 65" fill="none" stroke="#dd7a55" strokeWidth="7" strokeLinecap="round"/>
        <path d="M27 66L30 43Q40 36 50 43L54 66Z" fill="#b5503d" stroke="#f0a56d"/>
        <path d="M29 28Q20 16 30 14L33 23M51 28Q60 16 50 14L47 23" fill="#e7ac70"/>
        <ellipse cx="40" cy="31" rx="12" ry="13" fill="#e28b63"/>
        <path d="M31 29L37 31M43 31L49 29M37 38Q40 40 43 38" fill="none" stroke="#53201f" strokeWidth="2"/>
        <path d="M31 50L49 50M40 43L40 61" stroke="#efb96e" strokeWidth="2"/>
      </> : <>
        <path d="M13 13H67V64L40 74L13 64Z" fill="#44463e" stroke="#cfbd7b" strokeWidth="1.5"/>
        <path d="M23 64L28 41L40 37L52 41L57 64Z" fill="#e0d6b6" stroke="#b79c54"/>
        <path d="M29 43L17 56M51 43L63 56" stroke="#e3d8b4" strokeWidth="7" strokeLinecap="round"/>
        <ellipse cx="40" cy="30" rx="11" ry="13" fill="#f0e7cd"/>
        <path d="M27 24L25 12L34 17L40 6L46 17L55 12L53 24Z" fill="#c3a85b" stroke="#f2dfa3"/>
        <path d="M33 30H37M43 30H47M37 37H43" stroke="#676048" strokeWidth="1.5"/>
        <path d="M40 42L32 61H48Z" fill="#ac9456"/>
      </>}
      <circle cx="64" cy="13" r="10" fill={asura ? '#9e4938' : '#ece0b9'} stroke="#e3c48e"/>
      <text x="64" y="17" textAnchor="middle" fontSize="12" fontWeight="700" fill={asura ? '#fff0dc' : '#33382f'}>{unit.id.endsWith('1') ? '一' : '二'}</text>
    </svg>
    <span className="fire-hp" aria-hidden="true">{[1, 2, 3].map(hp => <i key={hp} className={hp <= unit.hp ? 'fire-hp-full' : ''}/>)}</span>
    {holder && <SacredFire className="fire-held-flame"/>}
    {unit.used && <span className="fire-used-label">已動</span>}
  </span>
}
