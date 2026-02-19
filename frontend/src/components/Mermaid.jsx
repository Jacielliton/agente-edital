import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

// Configuração global do Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default', // Você pode trocar para 'dark', 'forest', ou 'neutral'
  securityLevel: 'loose',
});

export default function Mermaid({ chart }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const renderMermaid = async () => {
      if (containerRef.current && chart) {
        try {
          // Limpa o container antes de renderizar
          containerRef.current.innerHTML = '';
          
          const id = `mermaid-svg-${Math.random().toString(36).substring(2, 9)}`;
          
          // --- CORREÇÃO CRÍTICA AQUI ---
          // Limpa caracteres problemáticos gerados pela IA:
          // 1. Converte Non-Breaking Spaces (\u00A0) para espaços normais
          // 2. Remove Zero-Width Spaces que quebram a sintaxe
          const cleanChart = chart
            .replace(/\u00A0/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim();
          
          // O Mermaid pega o texto limpo e transforma em SVG mágico
          const { svg } = await mermaid.render(id, cleanChart);
          containerRef.current.innerHTML = svg;
        } catch (error) {
          console.error("Erro ao renderizar o Mapa Mental:", error);
          // Fallback de segurança: se a IA gerar um código quebrado, mostra o texto
          containerRef.current.innerHTML = `<p style="color: red; font-size: 0.8em;">⚠️ Erro de sintaxe no diagrama.</p><pre style="font-size: 0.8em; overflow-x: auto;">${chart}</pre>`;
        }
      }
    };

    renderMermaid();
  }, [chart]);

  return <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center' }} />;
}