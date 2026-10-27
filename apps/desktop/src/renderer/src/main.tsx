import { LucideProvider } from 'lucide-react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startAppearance } from './domains/appearance'
import { startSession } from './gateway/session'
import { startLocale } from './i18n/locale'
import './styles.css'
import { App } from './views/App'

startLocale()
startAppearance()
void startSession()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LucideProvider strokeWidth={1.75}>
      <App />
    </LucideProvider>
  </StrictMode>,
)
