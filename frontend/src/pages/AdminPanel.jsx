import React, { useEffect, useState } from "react";
import { Trash2, Eye, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

export default function AdminPanel() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPlans = () => {
    setLoading(true);
    fetch("http://localhost:8000/plans")
      .then((res) => res.json())
      .then((data) => setPlans(data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm("Tem certeza que deseja deletar esta aula permanentemente?")) return;

    try {
      const res = await fetch(`http://localhost:8000/plans/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPlans(plans.filter((p) => p.id !== id));
      } else {
        alert("Erro ao deletar");
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Painel Administrativo</h1>
        <p>Gerencie todo o conteúdo da plataforma.</p>
      </div>

      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h3>Aulas Cadastradas ({plans.length})</h3>
          <button className="btn small" onClick={fetchPlans}><RefreshCw size={14}/> Atualizar</button>
        </div>

        {loading ? (
          <div>Carregando...</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Título</th>
                <th>Área</th>
                <th>Data Criação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td>#{plan.id}</td>
                  <td>
                    <strong>{plan.title}</strong>
                  </td>
                  <td>{plan.area}</td>
                  <td>{new Date(plan.created_at).toLocaleString()}</td>
                  <td>
                    <div className="actions-cell">
                      <Link to={`/aula/${plan.id}`} className="btn small" title="Ver">
                        <Eye size={16} />
                      </Link>
                      <button 
                        className="btn small error-btn" 
                        onClick={() => handleDelete(plan.id)}
                        title="Deletar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}