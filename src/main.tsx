import { createRoot } from 'react-dom/client'
import App from './App'
import DuelApp from './DuelApp'

const legacy = new URLSearchParams(location.search).get('legacy') === '1'
createRoot(document.getElementById('root')!).render(legacy ? <App /> : <DuelApp />)
