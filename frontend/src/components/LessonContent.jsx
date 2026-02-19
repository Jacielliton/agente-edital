import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import QuizCard from "../QuizCard"; // Ajuste o caminho se necessário
import Mermaid from "./Mermaid";

const safeArray = (v) => (Array.isArray(v) ? v : []);
const safeString = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));

export default function LessonContent({ result }) {
  const [selectedMap, setSelectedMap] = useState(null);

  // --- NOVA FUNÇÃO: Faz o download do SVG gerado pelo Mermaid ---
  const handleDownloadSVG = (titulo) => {
    // Procura o elemento SVG gerado dentro do modal
    const svgElement = document.querySelector('.mermaid-wrapper svg');
    
    if (!svgElement) {
      alert("O mapa ainda está sendo gerado. Tente novamente em um segundo.");
      return;
    }

    // Pega o código do SVG e serializa para texto
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svgElement);

    // Garante que a imagem tenha o namespace do SVG (necessário para abrir no Windows/Mac)
    if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgString = svgString.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    }

    // Cria um arquivo virtual em formato Blob
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Cria um link invisível, clica nele para baixar e depois destrói o link
    const link = document.createElement('a');
    link.href = url;
    // Formata o nome do arquivo (ex: Mapa-Mental-Fluxo-CI-CD.svg)
    link.download = `Mapa-Mental-${safeString(titulo).replace(/\s+/g, '-')}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!result) return null;

  const aulas = safeArray(result?.aulas);

  return (
    <div className="result-content" style={{ position: 'relative' }}>
      {/* --- CABEÇALHO DO PLANO --- */}
      <div className="summary">
        <div className="summaryItem">
          <div className="summaryLabel">Área</div>
          <div className="summaryValue">{safeString(result?.area_identificada)}</div>
        </div>
        <div className="summaryItem">
          <div className="summaryLabel">Resumo do Cargo/Objetivo</div>
          <div className="summaryValue">
            <ReactMarkdown>{safeString(result?.resumo_cargo)}</ReactMarkdown>
          </div>
        </div>
      </div>

      {/* --- PLANO DE ESTUDO GERAL --- */}
      {!!safeString(result?.plano_estudo) && (
        <details className="details" open>
          <summary className="summaryTitle">📅 Plano de Estudo Estratégico</summary>
          <div className="md">
            <ReactMarkdown>{safeString(result?.plano_estudo)}</ReactMarkdown>
          </div>
        </details>
      )}

      {/* --- LISTA DE AULAS (MÓDULOS) --- */}
      {aulas.map((aula, idx) => {
        const topicos = safeArray(aula?.topicos_explicados);
        const glossario = safeArray(aula?.glosario);
        const quiz = safeArray(aula?.quiz);
        const aprofundamento = safeArray(aula?.subtemas_aprofundados);
        const flashcards = safeArray(aula?.flashcards);
        const mapaMental = aula?.mapa_mental || {};
        const aulaTeorica = aula?.aula_teorica || {};
        const termosTecnicos = safeArray(aulaTeorica?.termos_tecnicos);

        return (
          <article className="card" key={idx}>
            <h2 className="lessonTitle">
              {idx + 1}. {safeString(aula?.titulo)}
            </h2>

            <div className="section">
              <p><strong>Visão Geral:</strong> {safeString(aula?.visao_geral)}</p>
              {!!aula?.referencia_bibliografica && (
                 <p className="muted" style={{marginTop: '0.5rem'}}>
                   📚 <strong>Fonte:</strong> {safeString(aula?.referencia_bibliografica)}
                 </p>
              )}
            </div>

            {/* AULA TEÓRICA COMPLETA */}
            <details className="details" open>
              <summary className="summaryTitle">🎓 Aula Teórica</summary>
              <div className="md">
                {!!aulaTeorica.introducao_contextual && (
                  <div style={{ marginBottom: '1.5rem', fontStyle: 'italic', color: '#555', borderLeft: '3px solid #ccc', paddingLeft: '10px' }}>
                    {aulaTeorica.introducao_contextual}
                  </div>
                )}

                {termosTecnicos.length > 0 && (
                  <div style={{ background: '#f0f4f8', padding: '15px', borderRadius: '8px', marginBottom: '20px', borderLeft: '5px solid #007bff' }}>
                    <h4 style={{margin: '0 0 10px 0', color: '#0056b3'}}>🧠 Termos Técnicos Essenciais</h4>
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      {termosTecnicos.map((t, k) => (
                        <li key={k} style={{marginBottom: '5px'}}>
                          <strong>{t.termo}:</strong> {t.definicao}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <h3>1. Conceito Simplificado (Analogia)</h3>
                <p>{safeString(aulaTeorica?.conceito_simplificado)}</p>

                <h3>2. Definição Técnica</h3>
                <p>{safeString(aulaTeorica?.conceito_tecnico)}</p>

                <h3>3. Como Funciona (Mecanismo)</h3>
                <div className="mechanism-box" style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                   <ReactMarkdown 
                     components={{
                       strong: ({node, ...props}) => <span style={{color: '#d63384', fontWeight: 'bold'}} {...props} />,
                       ul: ({node, ...props}) => <ul style={{paddingLeft: '20px', marginBottom: '15px'}} {...props} />,
                       li: ({node, ...props}) => <li style={{marginBottom: '5px', lineHeight: '1.6'}} {...props} />
                     }}
                   >
                     {safeString(aulaTeorica?.como_funciona)}
                   </ReactMarkdown>
                </div>

                {!!aulaTeorica?.comparativo && (
                  <>
                    <h3>4. Comparativo</h3>
                    <p>{safeString(aulaTeorica?.comparativo)}</p>
                  </>
                )}
                
                {!!aulaTeorica?.exemplo_pratico && (
                  <>
                    <h3>5. Exemplo Prático Resolvido</h3>
                    <div className="code-block" style={{background: '#2d2d2d', color: '#f8f8f2', padding: '15px', borderRadius: '6px', overflowX: 'auto'}}>
                      <ReactMarkdown>{safeString(aulaTeorica?.exemplo_pratico)}</ReactMarkdown>
                    </div>
                  </>
                )}
              </div>
            </details>
            
            {/* TÓPICOS EXPLICADOS */}
            <details className="details">
              <summary className="summaryTitle">📌 Tópicos Detalhados</summary>
              {topicos.map((t, i) => (
                <div key={i} className="subCard">
                  <div className="subCardTitle">{safeString(t?.topico)}</div>
                  <div className="subCardContent">{safeString(t?.explicacao)}</div>
                  {!!t?.exemplo_pratico && (
                    <div className="subCardEx">
                      <strong>Exemplo:</strong> {safeString(t?.exemplo_pratico)}
                    </div>
                  )}
                  {!!t?.pegadinha_tipica && (
                    <div className="warningBox">
                      ⚠️ <strong>Cuidado:</strong> {safeString(t?.pegadinha_tipica)}
                    </div>
                  )}
                </div>
              ))}
            </details>

            {/* PAINEL DE APROFUNDAMENTO */}
            {aprofundamento.length > 0 && (
              <details className="details" style={{ borderColor: '#6f42c1' }}>
                <summary className="summaryTitle" style={{ color: '#6f42c1', backgroundColor: '#f3e5f5' }}>
                  🚀 Painel Avançado (Aprofundamento)
                </summary>
                <div className="grid">
                  {aprofundamento.map((item, i) => (
                    <div className="miniCard" key={i} style={{ borderLeft: '4px solid #6f42c1' }}>
                      <div className="miniTitle" style={{ color: '#6f42c1', fontSize: '1.1em' }}>{safeString(item.subtema)}</div>
                      <div style={{fontSize:'0.85em', color:'#666', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px'}}>{safeString(item.natureza)}</div>
                      <div className="md" style={{ margin: '10px 0', lineHeight: '1.6' }}><ReactMarkdown>{safeString(item.conteudo_denso)}</ReactMarkdown></div>
                      {item.laboratorio_pratico && (
                        <div style={{ background: '#fff', border: '1px solid #e9ecef', padding: '10px', borderRadius: '6px', marginTop: '10px' }}>
                          <strong style={{color: '#28a745'}}>🧪 Laboratório Prático:</strong>
                          <div style={{marginTop:'5px', fontSize: '0.95em'}}>
                            <div style={{marginBottom:'4px'}}><b>🎯 Cenário:</b> {safeString(item.laboratorio_pratico.cenario)}</div>
                            <div style={{marginBottom:'4px'}}><b>🛠️ Resolução:</b> {safeString(item.laboratorio_pratico.resolucao)}</div>
                            <div><b>✅ Resultado:</b> {safeString(item.laboratorio_pratico.resultado_esperado)}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* GLOSSÁRIO */}
            {glossario.length > 0 && (
              <details className="details">
                <summary className="summaryTitle">📖 Glossário</summary>
                <div className="grid">
                  {glossario.map((g, i) => (
                    <div className="miniCard" key={i}>
                      <div className="miniTitle">{safeString(g?.termo)}</div>
                      {!!safeString(g?.definicao) && <div className="muted">{safeString(g?.definicao)}</div>}
                    </div>
                  ))}
                </div>
              </details>
            )}
            

            {/* FLASHCARDS */}
            {flashcards.length > 0 && (
              <details className="details" style={{ borderColor: '#ffc107' }}>
                <summary className="summaryTitle" style={{ color: '#b28605', backgroundColor: '#fff8e1' }}>
                  🃏 Flashcards (Revisão Ativa)
                </summary>
                <div style={{ padding: '10px' }}>
                  <p style={{fontSize: '0.9em', color: '#666', marginBottom: '15px'}}>Clique na pergunta para virar a carta e ver a resposta.</p>
                  {flashcards.map((card, i) => (
                    <details 
                      key={i} 
                      style={{ background: '#fff', border: '1px solid #ddd', borderLeft: '4px solid #ffc107', borderRadius: '6px', padding: '15px', marginBottom: '10px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                    >
                      <summary style={{ fontWeight: 'bold', outline: 'none', color: '#333', fontSize: '1.05em' }}>
                        ❓ {safeString(card.frente)}
                      </summary>
                      <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed #ccc', color: '#198754' }}>
                        <strong>💡 Resposta: </strong> 
                        <span style={{color: '#333'}}>{safeString(card.verso)}</span>
                        {!!safeString(card.dica) && (
                          <div style={{ marginTop: '10px', fontSize: '0.9em', color: '#666', background: '#f8f9fa', padding: '8px', borderRadius: '4px' }}>
                            <em>📌 <strong>Dica:</strong> {safeString(card.dica)}</em>
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            )}

            {/* QUESTÕES */}
            {quiz.length > 0 && (
              <details className="details" open>
                <summary className="summaryTitle">📝 Questões de Fixação</summary>
                {quiz.map((q, i) => (
                  <QuizCard key={i} question={q} index={i} />
                ))}
              </details>
            )}


            {/* MAPA MENTAL (BOTÃO QUE ABRE O MODAL) */}
            {!!mapaMental.codigo_mermaid && (
              <div style={{ marginBottom: '1rem' }}>
                <button 
                  onClick={() => setSelectedMap({ titulo: mapaMental.titulo, codigo: mapaMental.codigo_mermaid })}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '100%', padding: '15px', 
                    backgroundColor: '#e0f8fd', color: '#057a93', 
                    border: '1px solid #0dcaf0', borderRadius: '8px', 
                    fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transition: 'background-color 0.2s'
                  }}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#cff4fc'}
                  onMouseOut={(e) => e.target.style.backgroundColor = '#e0f8fd'}
                >
                  🧠 Visualizar Mapa Mental: {safeString(mapaMental.titulo)}
                </button>
              </div>
            )}
            
          </article>
        );
      })}

      {/* ========================================= */}
      {/* MODAL DO MAPA MENTAL COM BOTÃO DOWNLOAD   */}
      {/* ========================================= */}
      {selectedMap && (
        <div 
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '20px'
          }} 
          onClick={() => setSelectedMap(null)}
        >
          <div 
            style={{
              backgroundColor: '#fff', borderRadius: '12px', padding: '20px',
              width: '100%', maxWidth: '1000px', maxHeight: '90vh',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
            }} 
            onClick={(e) => e.stopPropagation()}
          >
            {/* CABEÇALHO DO MODAL */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '15px' }}>
              <h3 style={{ margin: 0, color: '#057a93', fontSize: '1.3rem' }}>
                {selectedMap.titulo}
              </h3>
              
              <div style={{ display: 'flex', gap: '10px' }}>
                {/* BOTÃO DE DOWNLOAD */}
                <button 
                  onClick={() => handleDownloadSVG(selectedMap.titulo)}
                  style={{
                    background: '#198754', color: '#fff', border: 'none', 
                    borderRadius: '6px', padding: '8px 15px',
                    fontSize: '0.95rem', fontWeight: 'bold', cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                  onMouseOver={(e) => e.target.style.background = '#157347'}
                  onMouseOut={(e) => e.target.style.background = '#198754'}
                >
                  ⬇️ Baixar SVG
                </button>

                {/* BOTÃO FECHAR */}
                <button 
                  onClick={() => setSelectedMap(null)}
                  style={{ 
                    background: '#f8d7da', color: '#842029', border: 'none', 
                    borderRadius: '6px', padding: '8px 15px',
                    fontSize: '0.95rem', fontWeight: 'bold', cursor: 'pointer',
                  }}
                  onMouseOver={(e) => e.target.style.background = '#f5c2c7'}
                  onMouseOut={(e) => e.target.style.background = '#f8d7da'}
                >
                  ✕ Fechar
                </button>
              </div>
            </div>
            
            {/* CORPO DO MODAL (ONDE FICA O GRÁFICO) */}
            <div className="mermaid-wrapper" style={{ 
              flex: 1, overflow: 'auto', border: '1px solid #eee', 
              borderRadius: '8px', padding: '15px', background: '#fafafa',
              display: 'flex', justifyContent: 'center'
            }}>
              <Mermaid chart={selectedMap.codigo} />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}