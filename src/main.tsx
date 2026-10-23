import { createRoot } from 'react-dom/client'
import App from './App'
import DuelApp from './DuelApp'
import FireApp from './FireApp'
import RealmApp from './RealmApp'
import TacticsApp from './TacticsApp'
import ClashApp from './ClashApp'

const params = new URLSearchParams(location.search)
const legacy = params.get('legacy') === '1'
if (!legacy && ['tactics', 'clash'].includes(params.get('mode') || '')) {
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  if (manifest) manifest.href = `${import.meta.env.BASE_URL}${params.get('mode') === 'clash' ? 'clash' : 'tactics'}.webmanifest`
}
createRoot(document.getElementById('root')!).render(legacy ? <App /> : params.get('mode') === 'clash' ? <ClashApp /> : params.get('mode') === 'tactics' ? <TacticsApp /> : params.get('mode') === 'realm' ? <RealmApp /> : params.get('mode') === 'fire' ? <FireApp /> : <DuelApp />)
