import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command }) => ({
  /* -----------------------------------------------------------------------
     Em DESENVOLVIMENTO a API passa a ser /api, na mesma origem do front.
     Isto sobrepõe o VITE_API_URL do .env — e SÓ no `npm run dev`
     (command === 'serve'). No `npm run build` nada disto existe e o
     VITE_API_URL do .env continua mandando, como sempre.
     ----------------------------------------------------------------------- */
  define:
    command === 'serve'
      ? { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') }
      : {},

  server: {
    // Libera o acesso do LocalTunnel/Ngrok
    allowedHosts: true,

    /* ---------------------------------------------------------------------
       PROXY DE DESENVOLVIMENTO

       Sem isto, o front (5173) e a API (8000) são DUAS origens diferentes, e
       toda chamada depende de CORS. Funciona no Chrome comum, mas quebra em
       qualquer navegador ou painel que isole origens — foi exatamente o que
       impediu o login no painel embutido em 13/09/2026: a página de 5173
       carregava, e todo fetch para 8000 morria em "Failed to fetch".

       Com o proxy, o navegador só fala com 5173; o Vite repassa para o
       backend. Uma origem só, CORS nenhum.

       Vale APENAS no `npm run dev`. O `npm run build` não usa esta seção.
       --------------------------------------------------------------------- */
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        // /api/auth/login  ->  /auth/login
        rewrite: (caminho) => caminho.replace(/^\/api/, ''),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // Atualiza o app automaticamente quando houver nova versão
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'AgenteIA Edital',
        short_name: 'AgenteIA',
        description: 'Plataforma inteligente de estudos para concursos',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone', // Faz abrir como um App nativo (sem barra de URL)
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
}))
