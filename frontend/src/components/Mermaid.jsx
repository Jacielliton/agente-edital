import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

export default function Mermaid({ chart }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const renderMermaid = async () => {
      if (containerRef.current && chart) {
        try {
          // 1. Deteta dinamicamente se o Modo Noturno está ativo
          const isDarkMode = document.documentElement.classList.contains('dark');
          
          // 2. Inicializa o Mermaid com o tema correto
          mermaid.initialize({
            startOnLoad: false,
            theme: isDarkMode ? 'dark' : 'default',
            securityLevel: 'loose',
            fontFamily: 'system-ui, sans-serif'
          });

          // Limpa o container antes de renderizar
          containerRef.current.innerHTML = '';
          
          const id = `mermaid-svg-${Math.random().toString(36).substring(2, 9)}`;
          
          // Limpa caracteres problemáticos gerados pela IA
          const cleanChart = chart
            .replace(/\u00A0/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim();
          
          // Transforma o texto limpo em SVG
          const { svg } = await mermaid.render(id, cleanChart);
          containerRef.current.innerHTML = svg;
        } catch (error) {
          console.error("Erro ao renderizar o Mapa Mental:", error);
          // Fallback de segurança atualizado para Modo Noturno
          containerRef.current.innerHTML = `
            <p style="color: var(--error-text); font-size: 0.9em; font-weight: bold;">
              ⚠️ Erro de sintaxe na geração do diagrama pela IA.
            </p>
            <pre style="font-size: 0.8em; overflow-x: auto; color: var(--text-main); background: var(--bg); padding: 10px; border-radius: 8px;">${chart}</pre>
          `;
        }
      }
    };

    renderMermaid();
  }, [chart]);

  return <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center', width: '100%' }} />;
}