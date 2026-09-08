import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
/* Tema e tamanho da letra ANTES de montar: senao a tela pisca no tema
   errado a cada carregamento. */
import { aplicarPreferenciasSalvas } from './preferencias'

aplicarPreferenciasSalvas()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
