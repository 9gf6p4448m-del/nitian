import { createRoot } from 'react-dom/client'
import App from './App'
import DuelApp from './DuelApp'
import FireApp from './FireApp'

const params = new URLSearchParams(location.search)
const legacy = params.get('legacy') === '1'
createRoot(document.getElementById('root')!).render(legacy ? <App /> : params.get('mode') === 'fire' ? <FireApp /> : <DuelApp />)
