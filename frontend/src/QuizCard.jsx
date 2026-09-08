import { useMemo, useState } from "react";
// Mesmo markdown da aula: bloco de código com cabeçalho de linguagem, código
// inline, tabelas e fórmulas. Antes o simulado usava o renderizador cru, sem
// plugins nem componentes, e por isso o código saía como texto corrido.
import Md from "./components/Markdown";
import "./QuizCard.css";
import {
  Check,
  X,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Target,
  Sparkles,
} from "lucide-react";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function safeString(v) {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function normalizeAlternativeText(alt, idx) {
  if (typeof alt !== "string") return "";
  const ltr = LETTERS[idx] || "[A-F]";
  const re = new RegExp(`^\\s*${ltr}\\s*[\\)\\.\\-:]\\s*`, "i");
  return alt.replace(re, "").trim();
}

function parseCorrectLetter(rawValue) {
  const raw = safeString(rawValue).trim();
  if (!raw) return null;
  const m = raw.toUpperCase().match(/[A-F]/);
  return m ? m[0] : null;
}

function normalizeWrongReasons(v) {
  if (!v) return null;

  if (Array.isArray(v)) {
    const out = {};
    for (const item of v) {
      const s = safeString(item).trim();
      const m = s.toUpperCase().match(/^([A-F])\s*[\)\.\-:]\s*(.*)$/);
      if (m) out[m[1]] = m[2]?.trim() || "";
    }
    return Object.keys(out).length ? out : null;
  }

  if (typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      const key = safeString(k).toUpperCase().match(/[A-F]/)?.[0];
      if (!key) continue;
      out[key] = safeString(val).trim();
    }
    return Object.keys(out).length ? out : null;
  }

  return null;
}

export default function QuizCard({ question, index, onAnswer }) {
  const [selected, setSelected] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [showFullExplanation, setShowFullExplanation] = useState(false);

  const correctLetter = useMemo(
    () => parseCorrectLetter(question?.resposta_correta),
    [question]
  );

  const topicoRelacionado = safeString(question?.topico_relacionado || "");
  const nivel = safeString(question?.nivel || "");
  const habilidade = safeString(question?.habilidade_cobrada || "");
  const trechoAula = safeString(question?.trecho_da_aula_que_sustenta || "");

  const comentarioCorreta = safeString(
    question?.comentario_da_correta ?? question?.comentario ?? ""
  );

  const alternativas = Array.isArray(question?.alternativas)
    ? question.alternativas
    : [];

  const explicacoesErradas = useMemo(
    () => normalizeWrongReasons(question?.por_que_as_outras_estao_erradas),
    [question]
  );

  const hasFullBreakdown =
    explicacoesErradas && Object.keys(explicacoesErradas).length > 0;

  const handleSelect = (optionIndex) => {
    if (selected !== null) return;
    const chosen = LETTERS[optionIndex] ?? null;
    setSelected(chosen);
    setShowExplanation(true);
    setShowFullExplanation(false);

    if (onAnswer) {
      const isCorrect = !!correctLetter && chosen === correctLetter;
      onAnswer(isCorrect, false); 
    }
  };

  const reset = () => {
    const wasCorrect = !!correctLetter && selected === correctLetter;
    
    setSelected(null);
    setShowExplanation(false);
    setShowFullExplanation(false);

    if (onAnswer && wasCorrect) {
      onAnswer(false, true); 
    }
  };

  return (
    <div className="quiz-card-container">
      <div className="quiz-header">
        <h4 className="quiz-title">
          <HelpCircle size={20} color="var(--primary)" />
          Questão {index + 1}
        </h4>

        <div className="quiz-meta">
          {!!topicoRelacionado && (
            <span className="quiz-tag" title="Tópico relacionado">
              <Target size={16} color="var(--fg-2)" />
              {topicoRelacionado}
            </span>
          )}

          {(!!nivel || !!habilidade) && (
            <span className="quiz-tag meta" title="Metadados da questão">
              <Sparkles size={16} color="var(--fg)" />
              {nivel ? `Nível: ${nivel}` : "Nível: —"}
              {habilidade ? ` • ${habilidade}` : ""}
            </span>
          )}

          <button
            type="button"
            onClick={reset}
            disabled={selected === null}
            className={`quiz-reset-btn ${selected === null ? "disabled" : ""}`}
            title="Refazer questão"
          >
            <RotateCcw size={16} />
            Refazer
          </button>
        </div>
      </div>

      <div className="quiz-enunciado">
        <Md>{safeString(question?.enunciado ?? "")}</Md>
      </div>

      <div className="quiz-options">
        {alternativas.map((alt, i) => {
          const currentLetter = LETTERS[i] ?? String(i + 1);
          const isSelected = selected === currentLetter;
          const isCorrect = !!correctLetter && currentLetter === correctLetter;

          // Lógica de classes dinâmicas para gerir as cores verde/vermelho automaticamente
          let optionClass = "quiz-option";
          if (selected) optionClass += " cursor-default";
          if (showExplanation && correctLetter) {
            if (isCorrect) optionClass += " correct";
            else if (isSelected && !isCorrect) optionClass += " incorrect";
          }

          const displayAlt = normalizeAlternativeText(alt, i);

          return (
            <div
              key={i}
              onClick={() => handleSelect(i)}
              className={optionClass}
            >
              <span className="option-letter">{currentLetter})</span>
              <div className="option-text">
                <Md inline>{displayAlt}</Md>
              </div>

              {showExplanation && isCorrect && <Check size={20} color="var(--success-text)" />}
              {showExplanation && isSelected && !isCorrect && <X size={20} color="var(--error-text)" />}
            </div>
          );
        })}
      </div>

      {showExplanation && (
        <div className="quiz-explanation">
          <div className="explanation-header">
            <strong className="correct-answer-label">
              Resposta correta: {correctLetter ?? "—"}
            </strong>

            {hasFullBreakdown && (
              <button
                type="button"
                onClick={() => setShowFullExplanation((v) => !v)}
                className="toggle-explanation-btn"
              >
                {showFullExplanation ? (
                  <>Ocultar explicação completa <ChevronUp size={16} /></>
                ) : (
                  <>Ver explicação completa <ChevronDown size={16} /></>
                )}
              </button>
            )}
          </div>

          {!!trechoAula && (
            <div className="explanation-snippet">
              <strong className="snippet-label">Trecho da aula:</strong>
              <div className="snippet-content">
                <Md>{trechoAula}</Md>
              </div>
            </div>
          )}

          <div className="explanation-comment">
            <strong className="comment-label">Comentário:</strong>
            <div className="comment-text">
              <Md>{comentarioCorreta || "_Sem explicação disponível._"}</Md>
            </div>
          </div>

          {showFullExplanation && hasFullBreakdown && (
            <div className="full-breakdown">
              <strong className="breakdown-label">Por que as outras estão erradas:</strong>

              <div className="breakdown-list">
                {LETTERS.slice(0, alternativas.length)
                  .filter((ltr) => ltr && ltr !== correctLetter)
                  .map((ltr) => {
                    const reason = explicacoesErradas?.[ltr];
                    if (!reason) return null;
                    return (
                      <div key={ltr} className="breakdown-item">
                        <div className="breakdown-letter">{ltr})</div>
                        <div className="breakdown-text">
                          <Md>{safeString(reason)}</Md>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}