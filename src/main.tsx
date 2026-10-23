import { createRoot } from 'react-dom/client'
import App from './App'
import DuelApp from './DuelApp'
import FireApp from './FireApp'
import RealmApp from './RealmApp'
import TacticsApp from './TacticsApp'

const params = new URLSearchParams(location.search)
const legacy = params.get('legacy') === '1'
if (!legacy && params.get('mode') === 'tactics') {
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  if (manifest) manifest.href = `${import.meta.env.BASE_URL}tactics.webmanifest`
}
createRoot(document.getElementById('root')!).render(legacy ? <App /> : params.get('mode') === 'tactics' ? <TacticsApp /> : params.get('mode') === 'realm' ? <RealmApp /> : params.get('mode') === 'fire' ? <FireApp /> : <DuelApp />)
