import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import LessonContent from "../components/LessonContent";

export default function SingleLesson() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`http://localhost:8000/plans/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Erro ao carregar");
        return res.json();
      })
      .then((json) => setData(json))
      .catch((e) => setError("Aula não encontrada ou erro de conexão."));
  }, [id]);

  if (error) return <div className="container"><div className="error">{error}</div></div>;
  if (!data) return <div className="container"><div className="status">Carregando conteúdo...</div></div>;

  return (
    <div className="container">
      <div style={{ marginBottom: "1rem" }}>
        <Link to="/dashboard" className="btn small">← Voltar para Dashboard</Link>
      </div>
      <LessonContent result={data} />
    </div>
  );
}