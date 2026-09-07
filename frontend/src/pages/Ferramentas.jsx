import React from "react";
import { Link } from "react-router-dom";
import { PenTool, Wrench, Lock, Brain, Calculator, FileText, Scale, Type, Coffee } from "lucide-react";

export default function Ferramentas() {
  return (
    <div className="container">
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: 'var(--heading-color)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Wrench size={32} color="var(--primary)" /> Central de Ferramentas
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
          Explore utilitários baseados em IA para otimizar os seus estudos e produtividade.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        
        {/* FERRAMENTA 1: DISCURSIVA */}
        <Link to="/treino" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div 
            style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column' }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ background: 'var(--primary-light)', padding: '12px', borderRadius: '10px', width: 'fit-content', marginBottom: '15px' }}>
              <PenTool size={28} color="var(--primary)" />
            </div>
            <h3 style={{ margin: '0 0 10px 0', color: 'var(--heading-color)' }}>Simulador de Discursivas</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', flex: 1 }}>
              Gere cenários inéditos e treine a sua escrita adaptada a diferentes bancas e cargos com correção automática via IA.
            </p>
          </div>
        </Link>

        {/* FERRAMENTA 2: GABARITE CESPE */}
        <Link to="/gabarite-cespe" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div 
            style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column' }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ background: 'var(--primary-light)', padding: '12px', borderRadius: '10px', width: 'fit-content', marginBottom: '15px' }}>
              <Brain size={28} color="var(--primary)" />
            </div>
            <h3 style={{ margin: '0 0 10px 0', color: 'var(--heading-color)' }}>Gabarite Português CESPE | IA</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', flex: 1 }}>
              Simulador de questões inéditas no padrão CEBRASPE. Crie textos-base e assertivas para treinar com análise detalhada e aulas de revisão.
            </p>
          </div>
        </Link>

        {/* FERRAMENTA 3: GABARITE LÓGICA */}
        <Link to="/gabarite-logica" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div 
            style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column' }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ background: 'var(--primary-light)', padding: '12px', borderRadius: '10px', width: 'fit-content', marginBottom: '15px' }}>
              <Calculator size={28} color="var(--primary)" />
            </div>
            <h3 style={{ margin: '0 0 10px 0', color: 'var(--heading-color)' }}>Gabarite Lógica CESPE | IA</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', flex: 1 }}>
              Treino direcionado de Raciocínio Lógico (Tabelas-verdade, Negações, Equivalências) com correção passo-a-passo.
            </p>
          </div>
        </Link>

        {/* FERRAMENTA 4: GABARITE SINTAXE (NOVA) */}
        <Link to="/gabarite-sintaxe" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div 
            style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column' }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ background: 'var(--primary-light)', padding: '12px', borderRadius: '10px', width: 'fit-content', marginBottom: '15px' }}>
              <FileText size={28} color="var(--primary)" />
            </div>
            <h3 style={{ margin: '0 0 10px 0', color: 'var(--heading-color)' }}>Sintaxe para Concursos CESPE</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', flex: 1 }}>
              Aprenda a teoria gramatical e gere simulados de múltipla escolha para validar seu conhecimento com pegadinhas de bancas.
            </p>
          </div>
        </Link>

        {/* FERRAMENTA 5: GABARITE DIREITO (NOVA) */}
        <Link to="/gabarite-direito" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div 
            style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column' }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ background: 'var(--primary-light)', padding: '12px', borderRadius: '10px', width: 'fit-content', marginBottom: '15px' }}>
              <Scale size={28} color="var(--primary)" />
            </div>
            <h3 style={{ margin: '0 0 10px 0', color: 'var(--heading-color)' }}>Noções de Direito CESPE</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', flex: 1 }}>
              Casos hipotéticos envolvendo Constitucional, Penal, Processual Penal e Administrativo embasados na lei seca e jurisprudência dominante do STF/STJ.
            </p>
          </div>
        </Link>

        {/* FERRAMENTA 6: GABARITE INGLÊS (NOVA) */}
        <Link to="/gabarite-ingles" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div 
            style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column' }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ background: 'var(--primary-light)', padding: '12px', borderRadius: '10px', width: 'fit-content', marginBottom: '15px' }}>
              <Type size={28} color="var(--primary)" />
            </div>
            <h3 style={{ margin: '0 0 10px 0', color: 'var(--heading-color)' }}>Gabarite Inglês CESPE</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', flex: 1 }}>
              Treino focado em Compreensão Textual, Vocabulário e Coesão Pronominal no padrão da banca CEBRASPE.
            </p>
          </div>
        </Link>

        {/* FERRAMENTA 7: GABARITE JAVA (NOVA) */}
        <Link to="/gabarite-java" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div 
            style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column' }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ background: 'var(--primary-light)', padding: '12px', borderRadius: '10px', width: 'fit-content', marginBottom: '15px' }}>
              <Coffee size={28} color="var(--primary)" />
            </div>
            <h3 style={{ margin: '0 0 10px 0', color: 'var(--heading-color)' }}>Gabarite Java CESPE</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', flex: 1 }}>
              Treine POO, Streams, Coleções e JPA com trechos de código e cenários inéditos focados em Editais de TI.
            </p>
          </div>
        </Link>

        {/* SLOT FUTURO */}
        <div style={{ background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: '12px', padding: '20px', opacity: 0.7, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'var(--hover-bg)', padding: '12px', borderRadius: '10px', width: 'fit-content', marginBottom: '15px' }}>
              <Lock size={28} color="var(--text-muted)" />
            </div>
            <h3 style={{ margin: '0 0 10px 0', color: 'var(--text-muted)' }}>Nova Ferramenta</h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem', flex: 1 }}>
              Novos recursos de inteligência artificial estão em desenvolvimento e serão adicionados aqui em breve.
            </p>
        </div>

      </div>
    </div>
  );
}