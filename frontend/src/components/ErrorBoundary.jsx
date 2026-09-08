import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "./ui";
import "./ErrorBoundary.css";

/**
 * O conteúdo da aula vem de JSON gerado por IA. Um campo com o formato
 * inesperado (uma string onde se espera lista, um objeto onde se espera texto)
 * derruba a árvore inteira do React e o aluno vê uma tela branca, sem nem saber
 * que houve erro. Aqui a falha fica contida: a navegação continua de pé e o
 * aluno tem para onde ir.
 *
 * Precisa ser classe — só componentes de classe recebem componentDidCatch.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    console.error("Erro não tratado na interface:", erro, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Ao trocar de rota, a tentativa recomeça: um erro numa aula não deve
    // manter as outras telas bloqueadas.
    if (this.state.erro && prevProps.chaveDeReset !== this.props.chaveDeReset) {
      this.setState({ erro: null });
    }
  }

  render() {
    if (!this.state.erro) return this.props.children;

    return (
      <div className="eb">
        <span className="eb__icone"><AlertTriangle size={26} /></span>
        <h1>Esta tela não pôde ser exibida</h1>
        <p>
          Alguma coisa no conteúdo desta página quebrou a exibição. O seu progresso, as suas aulas
          e o seu histórico não foram afetados — o erro é só de exibição.
        </p>
        <div className="eb__acoes">
          <Button variant="primary" icon={<RefreshCw size={15} />} onClick={() => window.location.reload()}>
            Recarregar a página
          </Button>
          <Button to="/" icon={<Home size={15} />} onClick={() => this.setState({ erro: null })}>
            Voltar para as minhas aulas
          </Button>
        </div>
        <details className="eb__detalhe">
          <summary>Detalhes técnicos</summary>
          <p>Se o erro se repetir, envie este texto no suporte.</p>
          <pre>{String(this.state.erro?.stack || this.state.erro)}</pre>
        </details>
      </div>
    );
  }
}
