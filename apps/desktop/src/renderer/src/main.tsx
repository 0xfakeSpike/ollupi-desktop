import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startSession } from './gateway/session'
import { startLocale } from './i18n/locale'
import './styles.css'
import { App } from './views/App'

startLocale()
void startSession()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
