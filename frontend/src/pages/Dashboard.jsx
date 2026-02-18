import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Calendar, ArrowRight } from "lucide-react";

export default function Dashboard() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:8001/plans")
      .then((res) => res.json())
      .then((data) => setPlans(data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container">
      <header className="header" style={{ textAlign: "left", marginBottom: "2rem" }}>
        <h1>Minhas Aulas</h1>
        <p>Acesse todo o conteúdo gerado pela IA e salvo no banco de dados.</p>
      </header>

      {loading ? (
        <div className="status">Carregando biblioteca...</div>
      ) : plans.length === 0 ? (
        <div className="panel">
          <p>Nenhuma aula encontrada. Vá para o Gerador e crie sua primeira aula!</p>
          <Link to="/generator" className="btn primary">Criar Nova Aula</Link>
        </div>
      ) : (
        <div className="grid-dashboard">
          {plans.map((plan) => (
            <div key={plan.id} className="card-dashboard">
              <div className="card-dash-header">
                <span className="badge-area">{plan.area}</span>
                <span className="date-meta">
                  <Calendar size={14} /> {new Date(plan.created_at).toLocaleDateString()}
                </span>
              </div>
              <h3 className="card-dash-title">{plan.title}</h3>
              <div className="card-dash-footer">
                <Link to={`/aula/${plan.id}`} className="btn small primary">
                  Acessar <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}