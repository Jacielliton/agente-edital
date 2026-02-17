import React from "react";
import ReactMarkdown from "react-markdown";
import QuizCard from "../QuizCard"; // Ajuste o caminho conforme necessário

const safeArray = (v) => (Array.isArray(v) ? v : []);
const safeString = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));

export default function LessonContent({ result }) {
  if (!result) return null;

  const aulas = safeArray(result?.aulas);

  return (
    <div className="result-content">
      <div className="summary">
        <div className="summaryItem">
          <div className="summaryLabel">Área</div>
          <div className="summaryValue">{safeString(result?.area_identificada)}</div>
        </div>
        <div className="summaryItem">
          <div className="summaryLabel">Resumo direto</div>
          <div className="summaryValue">
            <ReactMarkdown>{safeString(result?.resumo_cargo)}</ReactMarkdown>
          </div>
        </div>
      </div>

      {!!safeString(result?.plano_estudo) && (
        <details className="details" open>
          <summary className="summaryTitle">Plano de estudo</summary>
          <div className="md">
            <ReactMarkdown>{safeString(result?.plano_estudo)}</ReactMarkdown>
          </div>
        </details>
      )}

      {aulas.map((aula, idx) => {
                  const topicos = safeArray(aula?.topicos_explicados);
                  const glossario = safeArray(aula?.glosario);
                  const quiz = safeArray(aula?.quiz);
      
                  const porQueFunciona = safeArray(aula?.por_que_funciona);
                  const microMecanismos = safeArray(aula?.micro_mecanismos);
                  const criterios = safeArray(aula?.criterios_de_decisao);
                  const validacoes = safeArray(aula?.validacoes_e_checkpoints);
                  const confusoes = safeArray(aula?.confusoes_classicas_de_prova);
                  const erros = safeArray(aula?.erros_comuns);
                  const checklist = safeArray(aula?.checklist_de_revisao);
                  const limites = safeArray(aula?.limites_do_escopo);
      
                  const metaResearch = aula?.meta_research || {};
                  const mapaEstrutural = safeArray(metaResearch?.mapa_estrutural);
                  const correlacoes = safeArray(metaResearch?.correlacoes_entre_partes);
      
                  const aulaTeorica = aula?.aula_teorica || {};
                  const definicaoChave = safeString(aulaTeorica?.definicao_chave);
                  const comoFunciona = safeString(aulaTeorica?.como_funciona);
                  const comparativo = safeString(aulaTeorica?.comparativo);
                  const exemploPratico = safeString(aulaTeorica?.exemplo_pratico);
      
                  return (
                    <article className="card" key={`${safeString(aula?.titulo)}-${idx}`}>
                      <div className="cardHeader">
                        <h2 className="cardTitle">{safeString(aula?.titulo) || `Módulo ${idx + 1}`}</h2>
                        {!!safeString(aula?.visao_geral) && (
                          <div className="md">
                            <ReactMarkdown>{safeString(aula?.visao_geral)}</ReactMarkdown>
                          </div>
                        )}
                      </div>
      
                      <details className="details" open>
                        <summary className="summaryTitle">Aula teórica</summary>
      
                        {!!definicaoChave && (
                          <div className="block">
                            <div className="blockTitle">Definição-chave</div>
                            <div className="md">
                              <ReactMarkdown>{definicaoChave}</ReactMarkdown>
                            </div>
                          </div>
                        )}
      
                        {!!comoFunciona && (
                          <div className="block">
                            <div className="blockTitle">Como funciona</div>
                            <div className="md">
                              <ReactMarkdown>{comoFunciona}</ReactMarkdown>
                            </div>
                          </div>
                        )}
      
                        {!!comparativo && (
                          <div className="block">
                            <div className="blockTitle">Comparativo</div>
                            <div className="md">
                              <ReactMarkdown>{comparativo}</ReactMarkdown>
                            </div>
                          </div>
                        )}
      
                        {!!exemploPratico && (
                          <div className="block">
                            <div className="blockTitle">Exemplos práticos</div>
                            <div className="md">
                              <ReactMarkdown>{exemploPratico}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </details>
      
                      <details className="details">
                        <summary className="summaryTitle">Painel avançado (aprofundamento)</summary>
      
                        {(mapaEstrutural.length > 0 || correlacoes.length > 0) && (
                          <div className="block">
                            <div className="blockTitle">Estrutura & correlação entre partes</div>
      
                            {mapaEstrutural.length > 0 && (
                              <>
                                <div className="subTitle">Mapa estrutural</div>
                                <ul className="list">
                                  {mapaEstrutural.map((c, i) => (
                                    <li key={i}>
                                      <strong>{safeString(c?.componente)}</strong>{" "}
                                      <span className="muted">({safeString(c?.origem)})</span>
                                      {!!safeString(c?.papel) && <div className="muted">{safeString(c?.papel)}</div>}
                                      {safeArray(c?.conecta_com).length > 0 && (
                                        <div className="muted">Conecta com: {safeArray(c?.conecta_com).join(", ")}</div>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </>
                            )}
      
                            {correlacoes.length > 0 && (
                              <>
                                <div className="subTitle">Correlações</div>
                                <ul className="list">
                                  {correlacoes.map((t, i) => (
                                    <li key={i}>{safeString(t)}</li>
                                  ))}
                                </ul>
                              </>
                            )}
                          </div>
                        )}
      
                        {porQueFunciona.length > 0 && (
                          <div className="block">
                            <div className="blockTitle">Por que funciona</div>
                            <ul className="list">
                              {porQueFunciona.map((t, i) => (
                                <li key={i}>{safeString(t)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
      
                        {microMecanismos.length > 0 && (
                          <div className="block">
                            <div className="blockTitle">Micro-mecanismos</div>
                            <ul className="list">
                              {microMecanismos.map((t, i) => (
                                <li key={i}>{safeString(t)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
      
                        {criterios.length > 0 && (
                          <div className="block">
                            <div className="blockTitle">Critérios de decisão</div>
                            <div className="grid">
                              {criterios.map((c, i) => (
                                <div className="miniCard" key={i}>
                                  <div className="miniTitle">{safeString(c?.decisao)}</div>
                                  {safeArray(c?.criterios).length > 0 && (
                                    <ul className="list">
                                      {safeArray(c?.criterios).map((x, j) => (
                                        <li key={j}>{safeString(x)}</li>
                                      ))}
                                    </ul>
                                  )}
                                  {!!safeString(c?.risco_de_erro) && (
                                    <div className="muted">
                                      <strong>Risco:</strong> {safeString(c?.risco_de_erro)}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
      
                        {validacoes.length > 0 && (
                          <div className="block">
                            <div className="blockTitle">Validações & checkpoints</div>
                            <div className="grid">
                              {validacoes.map((v, i) => (
                                <div className="miniCard" key={i}>
                                  <div className="miniTitle">{safeString(v?.checkpoint)}</div>
                                  <ul className="list">
                                    {safeArray(v?.como_validar).map((x, j) => (
                                      <li key={j}>{safeString(x)}</li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
      
                        {confusoes.length > 0 && (
                          <div className="block">
                            <div className="blockTitle">Confusões clássicas de prova</div>
                            <ul className="list">
                              {confusoes.map((t, i) => (
                                <li key={i}>{safeString(t)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
      
                        {erros.length > 0 && (
                          <div className="block">
                            <div className="blockTitle">Erros comuns</div>
                            <ul className="list">
                              {erros.map((t, i) => (
                                <li key={i}>{safeString(t)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
      
                        {checklist.length > 0 && (
                          <div className="block">
                            <div className="blockTitle">Checklist de revisão</div>
                            <ul className="list">
                              {checklist.map((t, i) => (
                                <li key={i}>{safeString(t)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
      
                        {!!safeString(aula?.ponto_focal_prova) && (
                          <div className="block">
                            <div className="blockTitle">Ponto focal de prova</div>
                            <div className="md">
                              <ReactMarkdown>{safeString(aula?.ponto_focal_prova)}</ReactMarkdown>
                            </div>
                          </div>
                        )}
      
                        {limites.length > 0 && (
                          <div className="block">
                            <div className="blockTitle">Limites do escopo</div>
                            <ul className="list">
                              {limites.map((t, i) => (
                                <li key={i}>{safeString(t)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </details>
      
                      {topicos.length > 0 && (
                        <details className="details">
                          <summary className="summaryTitle">Tópicos explicados</summary>
                          <div className="grid">
                            {topicos.map((t, i) => (
                              <div className="miniCard" key={i}>
                                <div className="miniTitle">{safeString(t?.topico)}</div>
                                {!!safeString(t?.explicacao) && (
                                  <div className="md">
                                    <ReactMarkdown>{safeString(t?.explicacao)}</ReactMarkdown>
                                  </div>
                                )}
                                {!!safeString(t?.exemplo_pratico) && (
                                  <div className="muted">
                                    <strong>Exemplo:</strong> {safeString(t?.exemplo_pratico)}
                                  </div>
                                )}
                                {!!safeString(t?.pegadinha_tipica) && (
                                  <div className="muted">
                                    <strong>Pegadinha:</strong> {safeString(t?.pegadinha_tipica)}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
      
                      {glossario.length > 0 && (
                        <details className="details">
                          <summary className="summaryTitle">Glossário</summary>
                          <div className="grid">
                            {glossario.map((g, i) => (
                              <div className="miniCard" key={i}>
                                <div className="miniTitle">{safeString(g?.termo)}</div>
                                {!!safeString(g?.definicao) && <div className="muted">{safeString(g?.definicao)}</div>}
                                {!!safeString(g?.trecho_origem) && (
                                  <div className="muted">
                                    <strong>Origem:</strong> {safeString(g?.trecho_origem)}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
      
                      {quiz.length > 0 && (
                        <details className="details" open>
                          <summary className="summaryTitle">Questões</summary>
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