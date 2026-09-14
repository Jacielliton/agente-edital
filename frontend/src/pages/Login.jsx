import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  UserPlus, LogIn, AlertCircle, CheckCircle, Brain, FileText, MessageSquare,
  Sparkles, Zap, Ticket, ArrowRight, ArrowLeft, Check, Moon, Sun, PenTool,
  Calculator, Scale, Type, Coffee, GitBranch, Trophy, ShieldCheck, Smartphone,
  CreditCard, Target,
} from 'lucide-react';
import { Button, Input, Badge } from '../components/ui';
import './Login.css';
import { chamarApi, textoDoErro } from "../api";

// Precos base para o calculo dinamico com cupom.
const PLAN_PRICES = {
  diario_teste: 1.90,
  mensal_simples: 49.90,
  trimestral_simples: 119.90,
  semestral_simples: 199.90,
  mensal_plus: 99.90,
  trimestral_plus: 159.90,
  semestral_plus: 239.90,
  trimestral_pro: 189.90,
  semestral_pro: 269.90,
};

const brl = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`;

// Estrutura dos planos exibida no cadastro (etapa 2).
const PLAN_GROUPS = [
  {
    title: 'Plano Simples · usa a sua chave pessoal',
    icon: null,
    options: [
      { key: 'diario_teste', name: 'Teste Diário', days: '1 dia de acesso' },
      { key: 'mensal_simples', name: 'Simples Mensal', days: '30 dias de acesso' },
      { key: 'trimestral_simples', name: 'Simples Trimestral', days: '90 dias de acesso' },
      { key: 'semestral_simples', name: 'Simples Semestral', days: '180 dias de acesso' },
    ],
  },
  {
    title: 'Plano Plus · IA inclusa, 3M de tokens/mês',
    icon: <Sparkles size={13} />,
    options: [
      { key: 'mensal_plus', name: 'Plus Mensal', days: '30 dias de acesso' },
      { key: 'trimestral_plus', name: 'Plus Trimestral', days: '90 dias de acesso' },
      { key: 'semestral_plus', name: 'Plus Semestral', days: '180 dias de acesso' },
    ],
  },
  {
    title: 'Plano Pro · IA inclusa, 6M de tokens/mês',
    icon: <Zap size={13} />,
    options: [
      { key: 'trimestral_pro', name: 'Pro Trimestral', days: '90 dias de acesso' },
      { key: 'semestral_pro', name: 'Pro Semestral', days: '180 dias de acesso' },
    ],
  },
];

// Ferramentas que a assinatura libera. Cada uma corresponde a uma tela real.
const TOOLS = [
  { icon: FileText, title: 'Gerador de aulas por edital', text: 'Cole o conteúdo programático e receba a aula pronta: teoria, analogias, resumo e bateria de questões inéditas.' },
  { icon: PenTool, title: 'Simulador de discursivas', text: 'Cenários inéditos por banca e cargo, com correção automática apontando o que custaria pontos na prova.' },
  { icon: Brain, title: 'Gabarite Português CESPE', text: 'Texto-base e assertivas no padrão certo/errado do CEBRASPE, com análise item a item.' },
  { icon: Calculator, title: 'Raciocínio lógico', text: 'Tabelas-verdade, negações e equivalências com resolução passo a passo.' },
  { icon: Type, title: 'Sintaxe e inglês', text: 'Teoria gramatical com simulados de múltipla escolha e treino de compreensão textual, vocabulário e coesão.' },
  { icon: Scale, title: 'Noções de direito', text: 'Casos hipotéticos de Constitucional, Penal, Processual Penal e Administrativo com base na lei seca e no entendimento do STF e do STJ.' },
  { icon: Coffee, title: 'Java para editais de TI', text: 'POO, Streams, Coleções e JPA com trechos de código e cenários no formato das provas de tecnologia.' },
  { icon: MessageSquare, title: 'Tutor de IA dentro da aula', text: 'Travou num ponto? Pergunte ali mesmo, sem sair do conteúdo que você está estudando.' },
  { icon: GitBranch, title: 'Mapas mentais automáticos', text: 'Cada aula gera um diagrama da matéria para revisão rápida na véspera.' },
  { icon: Trophy, title: 'Desempenho e ranking', text: 'Acompanhe acertos por tema, veja onde você mais erra e compare seu XP com o de outros candidatos.' },
];

const FAQ = [
  {
    q: 'Existe período gratuito?',
    a: 'Não há plano gratuito, mas existe o Teste Diário por R$ 1,90, com 24 horas de acesso completo à plataforma. É a forma mais barata de conhecer as ferramentas antes de assinar um período maior.',
  },
  {
    q: 'Qual a diferença entre Simples, Plus e Pro?',
    a: 'No plano Simples você conecta a sua própria chave da OpenRouter e usa os modelos que quiser, inclusive os gratuitos — a plataforma não cobra pelo consumo de IA. Nos planos Plus e Pro a inteligência artificial já vem inclusa: 3 milhões de tokens por mês no Plus e 6 milhões no Pro, sem precisar configurar nada.',
  },
  {
    q: 'O que é a chave pessoal e como eu consigo uma?',
    a: 'É uma chave de acesso da OpenRouter, o serviço que dá acesso a vários modelos de IA. Criar a conta é gratuito e a conexão com a plataforma é feita em um clique, dentro da página de Perfil. Existem modelos gratuitos disponíveis, então dá para estudar sem custo adicional de IA.',
  },
  {
    q: 'Funciona no celular?',
    a: 'Sim. A plataforma é um aplicativo web instalável: pelo navegador do celular você adiciona à tela de início e ela abre como um app, em tela cheia. As aulas, os simulados e o histórico ficam sincronizados com o que você usa no computador.',
  },
  {
    q: 'As aulas e questões são confiáveis?',
    a: 'O conteúdo é gerado por inteligência artificial a partir do que você informa do edital, e a IA pode errar. Trate o material como um treino intensivo e um guia de estudo, não como fonte oficial: na dúvida, confirme sempre no edital, na lei seca e na jurisprudência.',
  },
  {
    q: 'Como funciona o pagamento e o cupom de desconto?',
    a: 'O pagamento é processado pelo Mercado Pago e o acesso é liberado assim que o pagamento é compensado. Se você tiver um cupom, aplique-o na etapa de escolha do plano e o desconto aparece no preço antes de finalizar. Toda conta também recebe um código de indicação com comissão sobre quem assinar por ele.',
  },
];

export default function Login() {
  const location = useLocation();
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationStep, setRegistrationStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState('mensal_simples');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const refCodeUrl = new URLSearchParams(location.search).get('ref');
  const [referralCode, setReferralCode] = useState(refCodeUrl || '');

  const [couponCode, setCouponCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState('fixed');
  const [couponMessage, setCouponMessage] = useState({ text: '', type: '' });
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [motivoSaida, setMotivoSaida] = useState('');
  const [loading, setLoading] = useState(false);

  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');

  const { login } = useAuth();
  const navigate = useNavigate();

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  /* Por que o usuário foi desconectado — gravado pelo AuthContext antes de
     redirecionar para cá. Lido uma vez e apagado, para não reaparecer. */
  useEffect(() => {
    try {
      const motivo = sessionStorage.getItem('motivo_saida');
      if (motivo) {
        setMotivoSaida(motivo);
        sessionStorage.removeItem('motivo_saida');
      }
    } catch (e) { /* modo privado */ }
  }, []);

  useEffect(() => {
    const status = new URLSearchParams(location.search).get('status');
    if (status === 'approved') {
      setSuccessMsg('Pagamento aprovado. Estamos liberando o seu acesso — tente entrar em instantes.');
    } else if (status === 'pending') {
      setSuccessMsg('Pagamento pendente de compensação. Assim que ele for confirmado, o acesso é liberado automaticamente.');
    }
  }, [location]);

  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setRegistrationStep(1);
    setError('');
    setSuccessMsg('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setCouponCode('');
    setDiscount(0);
    setCouponMessage({ text: '', type: '' });
  };

  const irParaCadastro = (plano) => {
    setIsRegistering(true);
    setRegistrationStep(1);
    setError('');
    if (plano) setSelectedPlan(plano);
    document.getElementById('acesso')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleNextStep = () => {
    if (!email || !password || !confirmPassword) {
      setError("Preencha e-mail, senha e confirmação antes de continuar.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setError('');
    setRegistrationStep(2);
  };

  const handleApplyCoupon = async () => {
    if (!couponCode) {
      setCouponMessage({ text: 'Digite um código de cupom.', type: 'error' });
      return;
    }
    setIsApplyingCoupon(true);
    setCouponMessage({ text: '', type: '' });
    try {
      const data = await chamarApi(`${API_URL}/coupons/validate/${couponCode}`);
      setDiscount(data.discount_value);
      setDiscountType(data.discount_type || 'fixed');
      setCouponMessage({ text: 'Cupom aplicado. O novo preço já aparece na lista.', type: 'success' });
    } catch (err) {
      setDiscount(0);
      setCouponMessage({ text: textoDoErro(err) || 'Cupom inválido ou expirado.', type: 'error' });
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const precoFinal = (planKey) => {
    const base = PLAN_PRICES[planKey];
    if (discount <= 0) return { base, final: base, off: false };
    const final = discountType === 'percent'
      ? base - (base * (discount / 100))
      : Math.max(0, base - discount);
    return { base, final, off: final < base };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (isRegistering) {
        if (password !== confirmPassword) throw new Error("As senhas não coincidem.");

        await chamarApi(`${API_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, role: "user", referral_code: referralCode }),
        });

        let payData;
        try {
          payData = await chamarApi(`${API_URL}/payments/create-preference`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              plano: selectedPlan,
              coupon_code: discount > 0 ? couponCode : null,
            }),
          });
        } catch (erroDaCobranca) {
          // A conta JÁ foi criada neste ponto. Sem esta distinção a pessoa lê
          // "erro ao criar conta", tenta de novo e recebe "e-mail já
          // cadastrado" — parecendo que o site quebrou duas vezes.
          throw new Error(
            `A sua conta foi criada, mas não consegui gerar a cobrança: ${textoDoErro(erroDaCobranca)} ` +
            `Entre com o seu e-mail e senha e conclua o pagamento pela página de planos.`
          );
        }

        window.location.href = payData.init_point;
        return;
      }

      await login(email, password);
      navigate('/');
    } catch (err) {
      // CONTA_EXPIRADA continua como código: o bloco de aviso abaixo troca de
      // aparência por causa dele e oferece o botão de renovar.
      setError(err?.codigo === "CONTA_EXPIRADA" || err?.message === "CONTA_EXPIRADA"
        ? "CONTA_EXPIRADA"
        : textoDoErro(err));
    } finally {
      setLoading(false);
    }
  };

  const tituloCard = isRegistering
    ? (registrationStep === 1 ? 'Criar sua conta' : 'Escolha o seu plano')
    : 'Entrar na plataforma';
  const subtituloCard = isRegistering
    ? (registrationStep === 1 ? 'Etapa 1 de 2 — seus dados de acesso.' : 'Etapa 2 de 2 — assinatura e pagamento.')
    : 'Bem-vindo de volta. Use o e-mail e a senha da sua conta.';

  return (
    <div className="auth">
      {/* ------------------------------ Topo ------------------------------ */}
      <nav className="auth__nav">
        <span className="auth__brand">
          <span className="auth__brand-mark"><Sparkles size={17} /></span>
          AgenteIA Edital
        </span>
        <span className="auth__nav-links">
          <a href="#ferramentas">Ferramentas</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#planos">Planos</a>
          <a href="#duvidas">Dúvidas</a>
        </span>
        <span className="auth__nav-actions">
          <button
            className="ui-btn ui-btn--ghost"
            onClick={() => setIsDark(!isDark)}
            title={isDark ? 'Usar tema claro' : 'Usar tema escuro'}
            aria-label="Alternar tema"
          >
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Button variant="primary" onClick={() => irParaCadastro()}>Criar conta</Button>
        </span>
      </nav>

      {/* ------------------------------ Hero ------------------------------ */}
      <section className="auth__hero" id="acesso">
        <div>
          <span className="auth__eyebrow"><Target size={14} /> Feito para concurso público</span>

          <h1>Transforme o edital em <em>aula, simulado e correção</em> no mesmo dia.</h1>

          <p className="auth__lead">
            Você cola o conteúdo programático do seu concurso. A plataforma devolve a aula
            explicada, a bateria de questões no padrão da banca e a correção da sua discursiva —
            sem esperar cronograma de curso nem procurar material espalhado.
          </p>

          <div className="auth__points">
            <div className="auth__point">
              <span className="auth__point-icon"><FileText size={19} /></span>
              <span>
                <b>Aulas e questões inéditas do seu edital</b>
                <span>Teoria, analogias, resumo e simulado gerados a partir do conteúdo programático que você informar.</span>
              </span>
            </div>
            <div className="auth__point">
              <span className="auth__point-icon"><PenTool size={19} /></span>
              <span>
                <b>Discursiva corrigida na hora</b>
                <span>Cenários inéditos por banca e cargo, com uma correção que aponta onde a sua resposta perderia pontos.</span>
              </span>
            </div>
            <div className="auth__point">
              <span className="auth__point-icon"><Trophy size={19} /></span>
              <span>
                <b>Você vê onde está errando</b>
                <span>Cada simulado alimenta o painel de desempenho por tema — o ponto fraco aparece antes da prova, não depois.</span>
              </span>
            </div>
          </div>

          <div className="auth__trust">
            <span><ShieldCheck size={14} /> Pagamento pelo Mercado Pago</span>
            <span><Smartphone size={14} /> Instala no celular como aplicativo</span>
            <span><CreditCard size={14} /> Teste de 1 dia por {brl(PLAN_PRICES.diario_teste)}</span>
          </div>
        </div>

        {/* ------------------------ Cartão de acesso ---------------------- */}
        <div className="auth__card">
          <div className="auth__card-head">
            {isRegistering && (
              <div className="auth__steps" aria-hidden="true">
                <i className="is-on" />
                <i className={registrationStep === 2 ? 'is-on' : undefined} />
              </div>
            )}
            <h2>{tituloCard}</h2>
            <p>{subtituloCard}</p>
          </div>

          {motivoSaida && (
            <div className="auth__alert auth__alert--warn">
              <span style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 700 }}>
                <AlertCircle size={17} />
                {motivoSaida === 'CONFLITO_DE_SESSAO' ? 'Você foi desconectado' : 'O seu acesso expirou'}
              </span>
              <span style={{ marginTop: 6 }}>
                {motivoSaida === 'CONFLITO_DE_SESSAO'
                  ? 'A sua conta foi aberta em outro dispositivo. Por segurança, esta sessão foi encerrada — entre de novo para continuar.'
                  : 'O seu período de acesso terminou. Renove para voltar a usar a plataforma.'}
              </span>
              {motivoSaida === 'CONTA_EXPIRADA' && (
                <Button variant="primary" onClick={() => navigate('/planos')} style={{ marginTop: 12 }}>
                  Renovar acesso
                </Button>
              )}
            </div>
          )}

          {successMsg && (
            <div className="auth__alert auth__alert--ok">
              <CheckCircle size={17} /> <span>{successMsg}</span>
            </div>
          )}

          {error === "CONTA_EXPIRADA" ? (
            <div className="auth__alert auth__alert--warn">
              <span style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 700 }}>
                <AlertCircle size={17} /> Conta inativa ou expirada
              </span>
              <span style={{ marginTop: 6 }}>O seu período de acesso terminou. Renove para voltar a usar a plataforma.</span>
              <Button variant="primary" onClick={() => navigate('/planos')} style={{ marginTop: 12 }}>
                Renovar acesso
              </Button>
            </div>
          ) : error ? (
            <div className="auth__alert auth__alert--err">
              <AlertCircle size={17} /> <span>{error}</span>
            </div>
          ) : null}

          <form className="auth__form" onSubmit={handleSubmit}>
            {(!isRegistering || registrationStep === 1) && (
              <>
                <Input
                  label="E-mail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                  autoComplete="email"
                  required
                />
                <Input
                  label="Senha"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={isRegistering ? 'new-password' : 'current-password'}
                  required
                />
                {isRegistering && (
                  <>
                    <Input
                      label="Confirmar senha"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a senha"
                      autoComplete="new-password"
                      required
                    />
                    <Input
                      label="Código de indicação (opcional)"
                      type="text"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                      placeholder="Quem te indicou?"
                    />
                  </>
                )}
              </>
            )}

            {isRegistering && registrationStep === 2 && (
              <>
                <div className="auth__plans">
                  {PLAN_GROUPS.map((grupo) => (
                    <React.Fragment key={grupo.title}>
                      <span className="auth__plan-group">{grupo.icon}{grupo.title}</span>
                      {grupo.options.map((op) => {
                        const { base, final, off } = precoFinal(op.key);
                        const escolhido = selectedPlan === op.key;
                        return (
                          <label className={`auth__plan${escolhido ? ' is-on' : ''}`} key={op.key}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                              <input
                                type="radio"
                                name="plano"
                                value={op.key}
                                checked={escolhido}
                                onChange={(e) => setSelectedPlan(e.target.value)}
                                style={{ margin: 0, cursor: 'pointer', accentColor: 'var(--accent)' }}
                              />
                              <span style={{ minWidth: 0 }}>
                                <span className="auth__plan-name">{op.name}</span>
                                <span className="auth__plan-days">{op.days}</span>
                              </span>
                            </span>
                            <span className="auth__plan-price">
                              {off && <s>{brl(base)}</s>}
                              <b className={off ? 'is-off' : undefined}>{brl(final)}</b>
                            </span>
                          </label>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>

                <div className="auth__coupon">
                  <span className="ui-field__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Ticket size={14} /> Cupom de desconto (opcional)
                  </span>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <Input
                      type="text"
                      value={couponCode}
                      onChange={(e) => {
                        setCouponCode(e.target.value.toUpperCase());
                        if (discount > 0) {
                          setDiscount(0);
                          setCouponMessage({ text: '', type: '' });
                        }
                      }}
                      placeholder="Ex: APROVADO20"
                      style={{ textTransform: 'uppercase' }}
                    />
                    <Button type="button" onClick={handleApplyCoupon} disabled={!couponCode || isApplyingCoupon}>
                      {isApplyingCoupon ? 'Validando…' : 'Aplicar'}
                    </Button>
                  </div>
                  {couponMessage.text && (
                    <span style={{
                      display: 'block',
                      marginTop: 8,
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      color: couponMessage.type === 'success' ? 'var(--ok)' : 'var(--danger)',
                    }}>
                      {couponMessage.text}
                    </span>
                  )}
                </div>
              </>
            )}

            {isRegistering && registrationStep === 1 ? (
              <Button variant="primary" size="lg" block type="button" onClick={handleNextStep}>
                Continuar <ArrowRight size={17} />
              </Button>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                {isRegistering && registrationStep === 2 && (
                  <Button type="button" size="lg" onClick={() => setRegistrationStep(1)} icon={<ArrowLeft size={17} />}>
                    Voltar
                  </Button>
                )}
                <Button variant="primary" size="lg" block type="submit" disabled={loading}>
                  {loading
                    ? 'Processando…'
                    : isRegistering
                      ? `Ir para o pagamento · ${brl(precoFinal(selectedPlan).final)}`
                      : 'Entrar'}
                </Button>
              </div>
            )}

            <div className="auth__divider">OU</div>

            <Button type="button" block onClick={toggleMode}>
              {isRegistering ? 'Já tenho conta — fazer login' : 'Ainda não tenho conta — criar agora'}
            </Button>

            {!isRegistering && (
              <Button type="button" block onClick={() => navigate('/planos')}>
                Renovar uma conta expirada
              </Button>
            )}

            {isRegistering && registrationStep === 2 && (
              <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--fg-3)', textAlign: 'center', lineHeight: 1.5 }}>
                Você será levado ao Mercado Pago para concluir. O acesso é liberado assim que o pagamento é compensado.
              </p>
            )}
          </form>
        </div>
      </section>

      {/* --------------------------- Ferramentas -------------------------- */}
      <section className="auth__section auth__section--alt" id="ferramentas">
        <div className="auth__inner">
          <div className="auth__section-head">
            <span>O que a assinatura libera</span>
            <h2>Dez ferramentas, um edital só</h2>
            <p>
              Não é um banco de questões antigas: cada item abaixo gera conteúdo novo a partir do
              que o seu concurso cobra, no formato que a sua banca usa.
            </p>
          </div>

          <div className="auth__tools">
            {TOOLS.map(({ icon: Icon, title, text }) => (
              <article className="auth__tool" key={title}>
                <span className="auth__tool-icon"><Icon size={19} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------- Como funciona ------------------------- */}
      <section className="auth__section" id="como-funciona">
        <div className="auth__section-head">
          <span>Como funciona</span>
          <h2>Do edital ao primeiro simulado em três passos</h2>
        </div>

        <div className="auth__steps-grid">
          <div className="auth__step">
            <span className="auth__step-n">PASSO 01</span>
            <h3>Informe o seu edital</h3>
            <p>
              Concurso, banca, ano e o conteúdo programático da matéria que você vai estudar.
              É o que a IA usa para calibrar profundidade, estilo de questão e nível de exigência.
            </p>
          </div>
          <div className="auth__step">
            <span className="auth__step-n">PASSO 02</span>
            <h3>Estude a aula gerada</h3>
            <p>
              Teoria explicada, analogias, mapa mental e questões comentadas. Se travar em algum
              ponto, o tutor de IA responde dentro da própria aula.
            </p>
          </div>
          <div className="auth__step">
            <span className="auth__step-n">PASSO 03</span>
            <h3>Treine e acompanhe</h3>
            <p>
              Resolva simulados e discursivas. Cada resultado entra no seu painel de desempenho e
              revela o tema em que você mais erra — o que deve ser revisado primeiro.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------ Planos ---------------------------- */}
      <section className="auth__section auth__section--alt" id="planos">
        <div className="auth__inner">
          <div className="auth__section-head">
            <span>Planos</span>
            <h2>Você escolhe quem paga a inteligência artificial</h2>
            <p>
              No plano Simples, você conecta a sua própria chave e usa os modelos que quiser,
              inclusive os gratuitos. Nos planos Plus e Pro, a IA já vem inclusa e não há nada a configurar.
            </p>
            {/* Esta frase existia só na /planos, ou seja: DEPOIS da decisão de
                compra. Com "/mês" e "Assinar" nos cartões, quem lê entende
                assinatura recorrente — e venda a consumidor exige que a forma
                de cobrança esteja visível ANTES. */}
            <p className="auth__cobranca">
              <ShieldCheck size={15} />
              <span>
                <b>Pagamento único, sem renovação automática.</b> Você paga uma vez pelo período
                escolhido e decide se quer renovar quando ele terminar — não há cobrança recorrente
                no cartão.
              </span>
            </p>
          </div>

          <div className="auth__tiers">
            <div className="auth__tier">
              <div className="auth__tier-top">
                <h3>Simples</h3>
                <Badge outline>chave própria</Badge>
              </div>
              <div className="auth__tier-price">{brl(PLAN_PRICES.mensal_simples)} <small>/mês</small></div>
              <ul>
                <li><Check size={15} /> Acesso a todas as ferramentas da plataforma</li>
                <li><Check size={15} /> Você conecta a sua chave da OpenRouter em um clique</li>
                <li><Check size={15} /> Modelos gratuitos disponíveis — sem custo de IA</li>
                <li><Check size={15} /> Trimestral {brl(PLAN_PRICES.trimestral_simples)} · semestral {brl(PLAN_PRICES.semestral_simples)}</li>
              </ul>
              <Button block onClick={() => irParaCadastro('mensal_simples')}>Assinar o Simples</Button>
              <p className="auth__tier-note">Prefere experimentar antes? O Teste Diário custa {brl(PLAN_PRICES.diario_teste)}.</p>
            </div>

            <div className="auth__tier is-featured">
              <div className="auth__tier-top">
                <h3>Plus</h3>
                <Badge tone="accent" icon={<Sparkles size={11} />}>recomendado</Badge>
              </div>
              <div className="auth__tier-price">{brl(PLAN_PRICES.mensal_plus)} <small>/mês</small></div>
              <ul>
                <li><Check size={15} /> Tudo do plano Simples</li>
                <li><Check size={15} /> IA inclusa: 3 milhões de tokens por mês</li>
                <li><Check size={15} /> Nada para configurar — funciona desde o primeiro acesso</li>
                <li><Check size={15} /> Trimestral {brl(PLAN_PRICES.trimestral_plus)} · semestral {brl(PLAN_PRICES.semestral_plus)}</li>
              </ul>
              <Button variant="primary" block onClick={() => irParaCadastro('mensal_plus')}>Assinar o Plus</Button>
              <p className="auth__tier-note">Indicado para quem estuda todos os dias e gera muito conteúdo.</p>
            </div>

            <div className="auth__tier">
              <div className="auth__tier-top">
                <h3>Pro</h3>
                <Badge outline icon={<Zap size={11} />}>volume alto</Badge>
              </div>
              <div className="auth__tier-price">
                {brl(PLAN_PRICES.trimestral_pro / 3)} <small>/mês</small>
              </div>
              <ul>
                <li><Check size={15} /> Tudo do plano Plus</li>
                <li><Check size={15} /> IA inclusa: 6 milhões de tokens por mês</li>
                <li><Check size={15} /> Folga para simulados longos e turmas de estudo</li>
                {/* O Pro só existe em trimestral e semestral. Mostrar
                    "{brl(trimestral)} /trimestre" entre dois cartões "/mês"
                    deixava a comparação torta; agora a unidade é a mesma nos
                    três e o valor real do pacote vem logo abaixo. */}
                <li><Check size={15} /> Cobrado {brl(PLAN_PRICES.trimestral_pro)} a cada 3 meses · semestral {brl(PLAN_PRICES.semestral_pro)}</li>
              </ul>
              <Button block onClick={() => irParaCadastro('trimestral_pro')}>Assinar o Pro</Button>
              <p className="auth__tier-note">Disponível nos períodos trimestral e semestral.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------ Dúvidas --------------------------- */}
      <section className="auth__section" id="duvidas">
        <div className="auth__section-head">
          <span>Dúvidas frequentes</span>
          <h2>Antes de assinar</h2>
        </div>

        <div className="auth__faq">
          {FAQ.map(({ q, a }) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------------------------- Chamada ----------------------------- */}
      <div className="auth__cta">
        <div>
          <h2>Comece pelo edital que você já tem</h2>
          <p>Crie a conta, informe o conteúdo programático e gere a primeira aula ainda hoje.</p>
        </div>
        <Button variant="primary" size="lg" onClick={() => irParaCadastro()} icon={<ArrowRight size={17} />}>
          Criar minha conta
        </Button>
      </div>
    </div>
  );
}
