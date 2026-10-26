import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startSession } from './gateway/session'
import './styles.css'
import { App } from './views/App'

void startSession()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
