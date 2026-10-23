import { useEffect, useState } from 'react'

interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
export function usePwa() {
  const [worker, setWorker] = useState<ServiceWorker | null>(null)
  const [prompt, setPrompt] = useState<InstallEvent | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
    let live = true
    let registration: ServiceWorkerRegistration | undefined
    const onInstall = (e: Event) => { e.preventDefault(); setPrompt(e as InstallEvent) }
    const check = () => { void registration?.update().catch(() => { if (live && navigator.onLine) setError(true) }) }
    window.addEventListener('beforeinstallprompt', onInstall); window.addEventListener('online', check)
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then(reg => {
      registration = reg
      if (live && reg.waiting) setWorker(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing
        installing?.addEventListener('statechange', () => {
          if (live && installing.state === 'installed' && navigator.serviceWorker.controller) setWorker(installing)
          if (live && installing.state === 'redundant') setError(true)
        })
      })
    }).catch(() => { if (live) setError(true) })
    return () => { live = false; window.removeEventListener('beforeinstallprompt', onInstall); window.removeEventListener('online', check) }
  }, [])
  return {
    error, updateAvailable: !!worker,
    update: () => {
      if (!worker) return
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true })
      worker.postMessage('SKIP_WAITING')
    },
    install: prompt ? async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null) } : null,
  }
}
