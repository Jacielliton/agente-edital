import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
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
  // pega a primeira ocorrência de A-F em qualquer formato (ex.: "Alternativa C", "Letra: D", "C)")
  const m = raw.toUpperCase().match(/[A-F]/);
  return m ? m[0] : null;
}

function normalizeWrongReasons(v) {
  // aceita objeto {B:".."} ou lista ["B: ..", "C: .."] etc.
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

export default function QuizCard({ question, index }) {
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
  };

  const reset = () => {
    setSelected(null);
    setShowExplanation(false);
    setShowFullExplanation(false);
  };

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        padding: "1.25rem",
        marginBottom: "1.25rem",
        background: "white",
        boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "10px",
          flexWrap: "wrap",
          marginBottom: "0.75rem",
        }}
      >
        <h4
          style={{
            margin: 0,
            color: "#1e293b",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <HelpCircle size={20} color="#2563eb" />
          Questão {index + 1}
        </h4>

        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          {!!topicoRelacionado && (
            <span
              title="Tópico relacionado"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.85rem",
                color: "#475569",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                padding: "6px 10px",
                borderRadius: "999px",
                maxWidth: "520px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              <Target size={16} color="#475569" />
              {topicoRelacionado}
            </span>
          )}

          {(!!nivel || !!habilidade) && (
            <span
              title="Metadados da questão"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.85rem",
                color: "#0f172a",
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                padding: "6px 10px",
                borderRadius: "999px",
              }}
            >
              <Sparkles size={16} color="#0f172a" />
              {nivel ? `Nível: ${nivel}` : "Nível: —"}
              {habilidade ? ` • ${habilidade}` : ""}
            </span>
          )}

          <button
            type="button"
            onClick={reset}
            disabled={selected === null}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: selected === null ? "#f8fafc" : "white",
              border: "1px solid #cbd5e1",
              color: "#0f172a",
              padding: "8px 10px",
              borderRadius: "8px",
              cursor: selected === null ? "not-allowed" : "pointer",
              fontWeight: 600,
              opacity: selected === null ? 0.65 : 1,
            }}
            title="Refazer questão"
          >
            <RotateCcw size={16} />
            Refazer
          </button>
        </div>
      </div>

      <div style={{ marginBottom: "1rem", fontSize: "1.05rem" }}>
        <ReactMarkdown>{safeString(question?.enunciado ?? "")}</ReactMarkdown>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {alternativas.map((alt, i) => {
          const currentLetter = LETTERS[i] ?? String(i + 1);
          const isSelected = selected === currentLetter;
          const isCorrect = !!correctLetter && currentLetter === correctLetter;

          let bgColor = "#f8fafc";
          let borderColor = "#e2e8f0";

          if (showExplanation && correctLetter) {
            if (isCorrect) {
              bgColor = "#dcfce7";
              borderColor = "#22c55e";
            } else if (isSelected && !isCorrect) {
              bgColor = "#fee2e2";
              borderColor = "#ef4444";
            }
          }

          const displayAlt = normalizeAlternativeText(alt, i);

          return (
            <div
              key={i}
              onClick={() => handleSelect(i)}
              style={{
                padding: "12px 14px",
                border: `2px solid ${borderColor}`,
                borderRadius: "10px",
                background: bgColor,
                cursor: selected ? "default" : "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
              }}
            >
              <span
                style={{
                  fontWeight: 800,
                  color: "#64748b",
                  minWidth: "28px",
                }}
              >
                {currentLetter})
              </span>

              <div style={{ flex: 1, color: "#0f172a" }}>
                <ReactMarkdown>{displayAlt}</ReactMarkdown>
              </div>

              {showExplanation && isCorrect && <Check size={20} color="#15803d" />}
              {showExplanation && isSelected && !isCorrect && <X size={20} color="#b91c1c" />}
            </div>
          );
        })}
      </div>

      {showExplanation && (
        <div
          style={{
            marginTop: "1rem",
            padding: "1rem",
            background: "#eff6ff",
            borderRadius: "10px",
            borderLeft: "4px solid #2563eb",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <strong style={{ color: "#1e40af" }}>
              Resposta correta: {correctLetter ?? "—"}
            </strong>

            {hasFullBreakdown && (
              <button
                type="button"
                onClick={() => setShowFullExplanation((v) => !v)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "white",
                  border: "1px solid #cbd5e1",
                  color: "#0f172a",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                {showFullExplanation ? (
                  <>
                    Ocultar explicação completa <ChevronUp size={16} />
                  </>
                ) : (
                  <>
                    Ver explicação completa <ChevronDown size={16} />
                  </>
                )}
              </button>
            )}
          </div>

          {!!trechoAula && (
            <div
              style={{
                marginTop: "10px",
                padding: "10px 12px",
                background: "white",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
              }}
            >
              <strong style={{ color: "#1e40af" }}>Trecho da aula:</strong>
              <div style={{ marginTop: "6px", color: "#334155" }}>
                <ReactMarkdown>{trechoAula}</ReactMarkdown>
              </div>
            </div>
          )}

          <div style={{ marginTop: "10px", color: "#334155", lineHeight: 1.6 }}>
            <strong style={{ color: "#1e40af" }}>Comentário:</strong>
            <div style={{ marginTop: "6px" }}>
              <ReactMarkdown>{comentarioCorreta || "_Sem explicação disponível._"}</ReactMarkdown>
            </div>
          </div>

          {showFullExplanation && hasFullBreakdown && (
            <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #cbd5e1" }}>
              <strong style={{ color: "#1e40af" }}>Por que as outras estão erradas:</strong>

              <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {LETTERS.slice(0, alternativas.length)
                  .filter((ltr) => ltr && ltr !== correctLetter)
                  .map((ltr) => {
                    const reason = explicacoesErradas?.[ltr];
                    if (!reason) return null;
                    return (
                      <div
                        key={ltr}
                        style={{
                          background: "white",
                          border: "1px solid #e2e8f0",
                          borderRadius: "10px",
                          padding: "10px 12px",
                        }}
                      >
                        <div style={{ fontWeight: 900, color: "#0f172a", marginBottom: "6px" }}>
                          {ltr})
                        </div>
                        <div style={{ color: "#334155", lineHeight: 1.6 }}>
                          <ReactMarkdown>{safeString(reason)}</ReactMarkdown>
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