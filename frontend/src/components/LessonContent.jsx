import React from "react";
import ReactMarkdown from "react-markdown";
import QuizCard from "../QuizCard"; // Ajuste o caminho se necessário

const safeArray = (v) => (Array.isArray(v) ? v : []);
const safeString = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));

export default function LessonContent({ result }) {
  if (!result) return null;

  const aulas = safeArray(result?.aulas);

  return (
    <div className="result-content">
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
                
                {/* Introdução Contextual */}
                {!!aulaTeorica.introducao_contextual && (
                  <div style={{ marginBottom: '1.5rem', fontStyle: 'italic', color: '#555', borderLeft: '3px solid #ccc', paddingLeft: '10px' }}>
                    {aulaTeorica.introducao_contextual}
                  </div>
                )}

                {/* Termos Técnicos Essenciais */}
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

                {/* --- CORREÇÃO AQUI: USANDO REACT MARKDOWN PARA O MECANISMO --- */}
                <h3>3. Como Funciona (Mecanismo)</h3>
                <div className="mechanism-box" style={{ 
                    background: '#fff', 
                    border: '1px solid #e0e0e0', 
                    borderRadius: '8px', 
                    padding: '20px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}>
                   <ReactMarkdown 
                     components={{
                       // Estiliza os títulos dos passos (ex: **1. Coleta**)
                       strong: ({node, ...props}) => <span style={{color: '#d63384', fontWeight: 'bold'}} {...props} />,
                       // Estiliza a lista para ficar mais limpa
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
                      <div className="miniTitle" style={{ color: '#6f42c1', fontSize: '1.1em' }}>
                        {safeString(item.subtema)} 
                      </div>
                      <div style={{fontSize:'0.85em', color:'#666', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                        {safeString(item.natureza)}
                      </div>
                      
                      <div className="md" style={{ margin: '10px 0', lineHeight: '1.6' }}>
                        <ReactMarkdown>{safeString(item.conteudo_denso)}</ReactMarkdown>
                      </div>

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

                      {safeArray(item.pontos_de_atencao).length > 0 && (
                        <div style={{ marginTop: '15px', fontSize: '0.9em', color: '#c2185b', background: '#fce4ec', padding: '10px', borderRadius: '4px' }}>
                          <strong>⚠️ Pontos de Atenção:</strong>
                          <ul style={{ paddingLeft: '20px', margin: '5px 0 0 0' }}>
                            {safeArray(item.pontos_de_atencao).map((p, k) => (
                              <li key={k}>{p}</li>
                            ))}
                          </ul>
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
                      {!!safeString(g?.trecho_origem) && (
                        <div className="muted" style={{ fontSize: '0.8em', marginTop: '5px', borderTop: '1px solid #eee', paddingTop: '5px' }}>
                          <strong>Origem:</strong> "{safeString(g?.trecho_origem)}"
                        </div>
                      )}
                    </div>
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
          </article>
        );
      })}
    </div>
  );
}