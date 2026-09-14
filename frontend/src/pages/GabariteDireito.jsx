import React, { useState, useEffect } from "react";
import {
  BookOpen, Cpu, CheckCircle, ArrowLeft, Scale, BarChart2, BookOpenCheck, SlidersHorizontal,
} from "lucide-react";
// Markdown único da plataforma: bloco de código, inline, tabelas e fórmulas.
import Md from "../components/Markdown";
import { Modal, ConfirmDialog, Notice, Toast} from "../components/ui";
import { AiKeyBar, AiKeyPanel, useAiKey, getAuthToken } from "../components/AiKeyConfig";
import { registrarSimulado } from "../desempenho";
import { QuestaoCard, PainelErros, HistoricoModal } from "../components/simulador";

// ==========================================
// BASE DE DADOS: MAPAS MENTAIS E JURISPRUDÊNCIA
// ==========================================
const direitoData = [
  // ==========================================
  // DIREITO CONSTITUCIONAL
  // ==========================================
  {
    id: "const_01",
    area: "Direito Constitucional",
    title: "Poder Constituinte",
    descricao: "Originário, Derivado e Decorrente: características e limites.",
    def: "O Poder Constituinte é a manifestação soberana da vontade popular capaz de criar (Originário) ou modificar (Derivado) a Constituição do Estado.",
    deep: `
**1. Conceito:** Força política que estrutura e organiza o Estado através da Constituição.
**2. Classificações Principais:**
* **Originário:** Cria uma nova CF. É inicial, ilimitado, autônomo, incondicionado e permanente.
* **Derivado Reformador:** Altera a CF (Emendas). É subordinado, condicionado e limitado (cláusulas pétreas).
* **Derivado Decorrente:** Capacidade dos Estados-membros de elaborar suas próprias Constituições Estaduais (não se aplica aos Municípios nem aos Territórios).
* **Derivado Revisor:** Art. 3º do ADCT (revisão após 5 anos, sessão unicameral, maioria absoluta). Já exaurido.
**3. Exceções e Limites:** Municípios organizam-se por Lei Orgânica (não exercem poder constituinte decorrente). 
**4. STF/Súmulas:** O STF admite a tese da "inconstitucionalidade de emenda constitucional" se violar cláusula pétrea (Art. 60, §4º). Não existe inconstitucionalidade de norma constitucional originária.
**5. Palavras-chave:** Inicial, Ilimitado, Subordinado, Cláusula Pétrea, Mutação Constitucional (Poder Difuso).
    `,
    examples: [
      "**Caso Prático:** Uma Emenda Constitucional que tente abolir o voto direto, secreto, universal e periódico será declarada inconstitucional pelo STF por violar limitação material (cláusula pétrea).",
      "**Poder Decorrente:** A Assembleia Legislativa do Estado de São Paulo promulgando a Constituição Estadual de SP."
    ],
    cespeTip: "O CESPE adora trocar as características do Poder Originário com o Derivado. Lembre-se: apenas o Originário é ILIMITADO juridicamente. O Derivado é sempre LIMITADO e SUBORDINADO.",
    trap: "Achar que o DF não tem Poder Constituinte Decorrente. O DF possui, e o exerce ao elaborar sua Lei Orgânica (que tem status de Constituição Estadual)."
  },
  {
    id: "const_02",
    area: "Direito Constitucional",
    title: "Aplicabilidade das Normas Constitucionais",
    descricao: "Teoria de José Afonso da Silva: Eficácia Plena, Contida e Limitada.",
    def: "Grau de capacidade de uma norma constitucional produzir efeitos imediatos a partir de sua promulgação, dependendo ou não de regulamentação infraconstitucional.",
    deep: `
**1. Conceito:** Classificação quanto à suficiência da norma para produzir efeitos fáticos.
**2. Classificações (José Afonso da Silva):**
* **Eficácia Plena:** Autoaplicáveis, diretas, integrais. Não precisam de lei e não podem ser restringidas. Ex: Remédios constitucionais, imunidade material parlamentar.
* **Eficácia Contida:** Autoaplicáveis, diretas, MAS NÃO integrais. Podem sofrer restrição por lei posterior, conceitos jurídicos indeterminados ou estado de sítio/defesa. Ex: Livre exercício profissional (Art. 5º, XIII).
* **Eficácia Limitada:** NÃO autoaplicáveis, indiretas, reduzidas. Dependem de lei para surtir seus efeitos principais. Dividem-se em *Princípio Institutivo* (criação de órgãos) e *Princípio Programático* (metas sociais).
**3. Jurisprudência:** O Mandado de Injunção e a ADO são os instrumentos para combater a síndrome de inefetividade das normas de eficácia limitada.
**4. Palavras-chave:** Autoaplicabilidade, Restringibilidade, Mandado de Injunção, Programáticas.
    `,
    examples: [
      "**Eficácia Contida:** O direito de greve no setor privado (Art. 9º). A lei define os serviços essenciais (restrição), mas o direito já existe e é aplicável.",
      "**Eficácia Limitada:** A lei disporá sobre a criação e extinção de Ministérios. Sem a lei, a norma não produz seu efeito primário."
    ],
    cespeTip: "Normas de eficácia LIMITADA possuem, desde a promulgação, eficácia negativa (paralisam leis contrárias) e eficácia vinculativa (obrigam o legislador a regulamentar).",
    trap: "Afirmar que a norma de eficácia contida não produz efeitos até que a lei restritiva seja criada. É o inverso! Ela produz 100% dos efeitos até que a lei venha para cortar/restringir."
  },
  {
    id: "const_03",
    area: "Direito Constitucional",
    title: "Remédios Constitucionais",
    descricao: "HC, HD, MS, MI e Ação Popular. Requisitos e cabimento.",
    def: "Garantias instrumentais previstas no Art. 5º para proteger os direitos fundamentais contra abusos, ilegalidades ou omissões do Poder Público.",
    deep: `
**1. Habeas Corpus (HC):** Protege a liberdade de locomoção contra violência ou coação (ilegalidade/abuso). Gratuito, não exige advogado.
**2. Habeas Data (HD):** Assegura conhecimento e retificação de informações relativas À PESSOA DO IMPETRANTE, em bancos de dados governamentais ou de caráter público. Gratuito. Exige recusa prévia na via administrativa (Súmula 2 STJ).
**3. Mandado de Segurança (MS):** Protege direito líquido e certo não amparado por HC ou HD. Prazo decadencial de 120 dias. Pode ser individual ou coletivo.
**4. Mandado de Injunção (MI):** Combate a mora legislativa que inviabiliza o exercício de direitos e liberdades constitucionais. O STF adota a teoria concretista (decisão já viabiliza o direito).
**5. Ação Popular (AP):** Anular ato lesivo ao patrimônio público, moralidade administrativa, meio ambiente e patrimônio histórico. Qualquer CIDADÃO (eleitor) é parte legítima.
**6. Palavras-chave:** Locomoção, Informação Pessoal, Direito Líquido e Certo, Omissão Legislativa, Cidadão, Isenção de Custas.
    `,
    examples: [
      "**Habeas Data:** Indivíduo tem seu acesso negado a anotações sobre ele mesmo nos sistemas da ABIN e impetra HD após a negativa administrativa.",
      "**Ação Popular:** Um jovem de 16 anos, com título de eleitor, ajuíza AP para anular uma licitação fraudulenta na prefeitura."
    ],
    cespeTip: "Estrangeiro pode impetrar HC e MS. Porém, APENAS O CIDADÃO (quem tem título de eleitor) pode ajuizar Ação Popular. Português equiparado pode.",
    trap: "Impetrar Habeas Data para obter certidões ou obter informações sobre terceiros. Para certidões negadas, o remédio é o Mandado de Segurança."
  },
  {
    id: "const_04",
    area: "Direito Constitucional",
    title: "Segurança Pública (Art. 144)",
    descricao: "Órgãos do sistema de segurança, guardas municipais e polícias penais.",
    def: "A segurança pública é dever do Estado, direito e responsabilidade de todos, exercida para a preservação da ordem pública e da incolumidade das pessoas e do patrimônio.",
    deep: `
**1. Órgãos (Rol Taxativo):** PF, PRF, PFF, Polícias Civis, Polícias Militares, Corpos de Bombeiros Militares e Polícias Penais (Federal, Estadual e Distrital).
**2. Polícia Federal:** Investigação de crimes contra a União, tráfico internacional, contrabando, polícia marítima, aeroportuária e de fronteiras. Exerce exclusividade da polícia judiciária da União.
**3. Polícia Civil:** Função de polícia judiciária estadual e apuração de infrações penais, exceto as militares. Dirigida por delegado de polícia de carreira.
**4. Polícias Militares e Bombeiros:** Polícia ostensiva e preservação da ordem pública. Forças auxiliares e reserva do Exército.
**5. Guardas Municipais:** NÃO estão no rol do caput do 144, mas integram o SUSP. Destinam-se à proteção de bens, serviços e instalações do Município. O STF (ADPF 995) reconheceu que as GMs integram a segurança pública.
**6. Jurisprudência (STF):** O ciclo completo de polícia não é adotado no Brasil como regra geral, mas TCO pode ser lavrado por PRF e PM.
    `,
    examples: [
      "**Atuação da PF:** Investigar fraude contra a Caixa Econômica Federal (Empresa Pública Federal).",
      "**Atuação da Civil:** Investigar fraude contra o Banco do Brasil (Sociedade de Economia Mista), pois foge da competência federal."
    ],
    cespeTip: "Pegadinha clássica do CESPE: A Polícia Federal exerce EXCLUSIVIDADE de polícia judiciária da União. A Polícia Civil exerce a polícia judiciária estadual, mas a CF NÃO usa o termo 'exclusividade' para a Civil.",
    trap: "Considerar Força Nacional de Segurança ou ABIN como órgãos da Segurança Pública no rol do Art. 144. Eles não estão no rol taxativo da CF."
  },

  // ==========================================
  // DIREITO ADMINISTRATIVO
  // ==========================================
  {
    id: "admin_01",
    area: "Direito Administrativo",
    title: "Atos Administrativos",
    descricao: "Atributos (PATI), Elementos (COFIMOB) e Extinção (Anulação x Revogação).",
    def: "Declaração do Estado ou de quem o represente, que produz efeitos jurídicos imediatos, com observância da lei, sob regime jurídico de direito público e sujeita a controle judicial.",
    deep: `
**1. Elementos/Requisitos (Vinculados):** CO-FI-MO-B (Competência, Finalidade, Forma, Motivo, Objeto).
* *Motivo:* É a situação de fato e de direito que enseja o ato (não confundir com motivação, que é a exposição escrita). Teoria dos Motivos Determinantes vincula o ato aos motivos declarados.
**2. Atributos (Características):** P-A-T-I
* *Presunção de Legitimidade/Veracidade:* Até prova em contrário (juris tantum), o ato é legal e verdadeiro.
* *Autoexecutoriedade:* Meios diretos de execução sem prévia ordem judicial (multa não tem autoexecutoriedade para cobrança, mas o guincho tem).
* *Tipicidade:* O ato deve estar previsto em lei.
* *Imperatividade:* Impõe obrigações a terceiros independente de concordância.
**3. Extinção:**
* *Anulação:* Ato ILEGAL. Efeito *ex tunc* (retroage). Pode ser feita pela Administração (autotutela) ou Judiciário. Prazo decadencial de 5 anos (boa-fé).
* *Revogação:* Ato LEGAL, mas inoportuno/inconveniente. Efeito *ex nunc* (não retroage). Só a própria Administração que praticou pode revogar. Judiciário não revoga ato de outro poder.
    `,
    examples: [
      "**Revogação:** O Prefeito decide fechar uma rua para feira livre aos domingos. Meses depois, o trânsito piora e ele revoga o ato (mérito administrativo).",
      "**Teoria dos Motivos Determinantes:** Servidor é exonerado 'por falta de verba'. Se houver prova de que havia verba de sobra, o ato é nulo, pois o motivo declarado era falso."
    ],
    cespeTip: "Decore: O Poder Judiciário PODE anular atos do Poder Executivo (controle de legalidade). Mas NUNCA pode revogar atos do Executivo, pois revogação é análise de mérito (conveniência e oportunidade).",
    trap: "Achar que a Multa tem autoexecutoriedade. A aplicação da multa é imperativa, mas a COBRANÇA FORÇADA exige ida ao Judiciário (Execução Fiscal)."
  },
  {
    id: "admin_02",
    area: "Direito Administrativo",
    title: "Poder de Polícia",
    descricao: "Conceito, atributos, delegação e ciclo do poder de polícia.",
    def: "Prerrogativa do Estado para restringir ou condicionar bens, direitos e liberdades individuais em prol do interesse público.",
    deep: `
**1. Conceito:** Condicionamento de direitos individuais.
**2. Ciclo de Polícia:**
* **Ordem (Legislação):** Cria a restrição na lei (Indelegável a particulares).
* **Consentimento:** Concessão de alvarás/licenças.
* **Fiscalização:** Verificação do cumprimento da ordem.
* **Sanção:** Aplicação de multas.
**3. Delegação (Tese STF - RE 633.782):** É CONSTITUCIONAL a delegação do poder de polícia (fases de consentimento, fiscalização e sanção) a Pessoas Jurídicas de DIREITO PRIVADO integrantes da Administração Indireta, de capital social majoritariamente público (EP e SEM), que prestem serviços públicos de atuação própria do Estado e em regime não concorrencial.
**4. Polícia Administrativa x Judiciária:**
* *Administrativa:* Incide sobre BENS, DIREITOS e ATIVIDADES (órgãos diversos). Ilícitos administrativos.
* *Judiciária:* Incide sobre PESSOAS (Civil e PF). Ilícitos penais.
    `,
    examples: [
      "**Delegação Válida:** Uma Empresa Pública Municipal como a BHTrans ou CET (capital público) multando motoristas (fases de fiscalização e sanção).",
      "**Polícia Administrativa:** Vigilância sanitária apreendendo carne estragada em um supermercado."
    ],
    cespeTip: "O examinador vai dizer que a fase de SANÇÃO não pode ser delegada a empresas estatais de direito privado. Errado! O STF pacificou que consentimento, fiscalização e SANÇÃO podem ser delegados. Apenas a ORDEM não pode.",
    trap: "Confundir polícia administrativa com judiciária afirmando que a Polícia Militar exerce apenas polícia judiciária. A PM atua preeminentemente na polícia administrativa (ostensiva, preventiva)."
  },
  {
    id: "admin_03",
    area: "Direito Administrativo",
    title: "Responsabilidade Civil do Estado",
    descricao: "Teoria do Risco Administrativo, causas excludentes e omissão estatal.",
    def: "Obrigação do Estado de reparar danos causados a terceiros por seus agentes, independentemente de dolo ou culpa, baseada no Art. 37, § 6º da CF.",
    deep: `
**1. Teoria Adotada:** Risco Administrativo (Responsabilidade Objetiva).
**2. Requisitos:** Conduta (ação do agente), Dano (material ou moral) e Nexo Causal. NÃO se exige prova de dolo/culpa do Estado.
**3. Sujeitos:** Pessoas Jurídicas de Direito Público (União, Estados, Municípios, Autarquias) e PJs de Direito Privado PRESTADORAS de serviço público (Concessionárias, Permissionárias, Empresas Públicas prestadoras). EP e SEM que exploram atividade econômica respondem de forma subjetiva.
**4. Excludentes do Nexo Causal:** Culpa/fato EXCLUSIVO da vítima, força maior e caso fortuito. Afastam a responsabilidade objetiva. Atenção: culpa *concorrente* apenas atenua a indenização.
**5. Responsabilidade por Omissão:** * *Regra:* Omissão Genérica = Responsabilidade Subjetiva (Teoria da Culpa do Serviço / Faute du service).
* *Exceção:* Omissão Específica (Pessoas sob custódia, presos, alunos de escola pública) = Responsabilidade Objetiva. O Estado é garante.
**6. Ação de Regresso:** O Estado condena o agente público apenas se comprovado DOLO ou CULPA (Responsabilidade Subjetiva do agente perante o Estado). Dupla garantia (o particular só pode processar o Estado, não o agente diretamente - RE 327.904).
    `,
    examples: [
      "**Omissão Específica:** Preso é assassinado dentro da penitenciária por outro detento. O Estado responde objetivamente, pois tinha o dever específico de guarda.",
      "**Risco Administrativo:** Viatura policial persegue bandido, ultrapassa sinal vermelho e bate em carro de civil. O Estado paga o conserto independentemente de provar imperícia do policial."
    ],
    cespeTip: "Concessionárias de serviço público (ex: empresas de ônibus urbano) respondem OBJETIVAMENTE pelos danos causados tanto aos usuários (passageiros) quanto aos NÃO USUÁRIOS (pedestre atropelado).",
    trap: "Achar que a responsabilidade estatal é baseada na Teoria do Risco Integral. O Risco Integral (que não aceita excludentes) só é aplicado no Brasil em casos excepcionais: danos nucleares, terrorismo em aeronaves e dano ambiental."
  },

  // ==========================================
  // DIREITO PENAL
  // ==========================================
  {
    id: "penal_01",
    area: "Direito Penal",
    title: "Aplicação da Lei Penal (Tempo e Espaço)",
    descricao: "Conflito de leis, LUTA, Extraterritorialidade.",
    def: "Regras que definem quando e onde a lei penal brasileira será aplicada, baseadas nos princípios da legalidade e territorialidade.",
    deep: `
**1. Tempo do Crime (Art. 4º):** Teoria da ATIVIDADE. Considera-se o momento da AÇÃO ou OMISSÃO, ainda que outro seja o momento do resultado. Importante para imputabilidade (maioridade) e lei mais benéfica.
**2. Lugar do Crime (Art. 6º):** Teoria da UBIQUIDADE (Mista). Tanto onde ocorreu a ação/omissão quanto onde se produziu ou deveria produzir o resultado. Mnemônico: LUTA (Lugar=Ubiquidade; Tempo=Atividade).
**3. Lei Penal no Tempo:** * *Novatio Legis in Mellius / Abolitio Criminis:* Lei mais benéfica retroage sempre, alcançando fatos passados com trânsito em julgado (competência do Juízo da Execução Penal - Súmula 611 STF).
* *Crimes Permanentes/Continuados:* Aplica-se a lei NOVA, mesmo que mais gravosa, se ela entrou em vigor antes da cessação da permanência/continuidade (Súmula 711 STF).
**4. Territorialidade (Art. 5º):** Aplica-se a lei brasileira a crimes no território nacional (Territorialidade Temperada/Mitigada, pois respeita convenções internacionais).
**5. Extraterritorialidade Incondicionada (Art. 7º, I):** Aplica-se a lei do BRASIL mesmo se o agente for julgado/absolvido no exterior:
* Contra vida/liberdade do Presidente da República.
* Contra o patrimônio/fé pública da União, Estados, Municípios, Adm. Indireta.
* Contra administração pública, por quem está a seu serviço.
* Genocídio (se o agente for brasileiro ou domiciliado no Brasil).
    `,
    examples: [
      "**Tempo do Crime:** A atira em B no dia que A tem 17 anos e 364 dias. B morre um mês depois. A responderá pelo ECA (ato infracional), pois no momento da ação (atividade) era inimputável.",
      "**Súmula 711:** Sequestrador mantém vítima por 3 anos. No meio do sequestro, nova lei aumenta a pena base. Ele responderá pela nova lei mais dura, pois o crime estava ocorrendo."
    ],
    cespeTip: "Foque na Extraterritorialidade INCONDICIONADA contra o PR: protege apenas a VIDA e LIBERDADE do Presidente. Crime contra a HONRA do Presidente atrai extraterritorialidade CONDICIONADA.",
    trap: "Acreditar que a 'Abolitio Criminis' apaga também os efeitos CIVIS da condenação. Ela apaga todos os efeitos PENAIS (primariedade volta, etc), mas o dever de indenizar a vítima (efeito civil) permanece intacto."
  },
  {
    id: "penal_02",
    area: "Direito Penal",
    title: "Teoria do Crime: Fato Típico e Ilicitude",
    descricao: "Elementos do crime, erro de tipo, excludentes de ilicitude.",
    def: "O Brasil adota o conceito analítico tripartite: Crime é o fato Típico, Ilícito (Antijurídico) e Culpável.",
    deep: `
**1. FATO TÍPICO (Requisitos):**
* **Conduta:** Ação ou omissão, dolosa ou culposa, voluntária e consciente. Coação *física* irresistível (vis absoluta) exclui a conduta; coação *moral* (vis compulsiva) exclui a culpabilidade.
* **Nexo Causal:** Liga a conduta ao resultado (Adota-se a Teoria da Equivalência dos Antecedentes - *conditio sine qua non*). Concausa superveniente relativamente independente que *por si só* produz o resultado quebra o nexo (Art. 13, §1º).
* **Resultado:** Naturalístico (necessário nos crimes materiais) e Jurídico (lesão ao bem).
* **Tipicidade:** Formal (adequação à lei) e Conglobante/Material (relevância da lesão - Princípio da Insignificância).
**2. ILICITUDE (Excludentes - Art. 23):**
* **Estado de Perigo:** Salvar direito próprio/alheio de perigo ATUAL, que não provocou, nem podia evitar, sacrifício inviável do bem.
* **Legítima Defesa:** Repelir agressão injusta, ATUAL ou IMINENTE, a direito próprio/alheio, usando moderadamente os meios necessários.
* **Estrito Cumprimento do Dever Legal:** Ex: Policial que prende em flagrante (priva liberdade sob dever da lei).
* **Exercício Regular de Direito:** Ex: Lesões em lutas de boxe regulamentadas.
**3. Excesso Punível:** O agente responderá pelo excesso doloso ou culposo em QUALQUER das excludentes.
    `,
    examples: [
      "**Concausa Superveniente:** A dá facada em B. B vai de ambulância e, no caminho, o teto do hospital desaba matando B. O desabamento produziu o resultado por si só. A responde apenas por tentativa de homicídio.",
      "**Legítima Defesa Sucessiva:** A agride B. B se defende validamente, mas após dominar A, B passa a torturar A. Neste momento de excesso, B age ilicitamente, e A pode agir em legítima defesa sucessiva."
    ],
    cespeTip: "Estado de Necessidade só admite perigo ATUAL (CP). Legítima defesa admite agressão ATUAL ou IMINENTE. O CESPE frequentemente tenta encaixar 'perigo iminente' no Estado de Necessidade para tornar a questão incorreta.",
    trap: "Aceitar a aplicação do Princípio da Insignificância de forma irrestrita. STF e STJ dizem que NÃO se aplica a crimes com violência/grave ameaça, crimes contra a fé pública (moeda falsa), Maria da Penha (Súmula 589 STJ) e a crimes contra a administração pública praticados por servidor (Súmula 599 STJ - com mitigações recentes no descaminho)."
  },
  {
    id: "penal_03",
    area: "Direito Penal",
    title: "Crimes Contra a Administração Pública",
    descricao: "Peculato, Concussão, Corrupção e Prevaricação.",
    def: "Delitos praticados por funcionários públicos (Art. 327 CP) contra a Administração em Geral (Arts. 312 a 326), tutelando a probidade administrativa.",
    deep: `
**1. Funcionário Público por Equiparação (Art. 327, §1º):** Quem exerce cargo, emprego ou função em EP, SEM, autarquias ou fundações, OU quem trabalha para empresa prestadora de serviço contratada/conveniada para atividade TÍPICA da administração.
* **Aumento de 1/3 (§2º):** Se ocupante de cargo em comissão ou função de direção/assessoramento.
**2. Peculato (Art. 312):** * *Apropriação/Desvio:* O funcionário tem a POSSE do dinheiro/bem em razão do cargo.
* *Furto (Peculato-furto):* Não tem a posse, mas a subtrai VALENDO-SE da facilidade do cargo.
* *Culposo:* Único que admite culpa. Se repara o dano ANTES de sentença irrecorrível = extingue punibilidade. Se APÓS = reduz pena pela metade.
**3. Concussão (Art. 316) x Corrupção Passiva (Art. 317):**
* *Concussão:* O verbo é **EXIGIR** (imposição, intimidação).
* *Corrupção Passiva:* Os verbos são **SOLICITAR**, **RECEBER** ou **ACEITAR PROMESSA**.
**4. Prevaricação (Art. 319) x Corrupção Privilegiada (Art. 317, §2º):**
* *Prevaricação:* Retardar/deixar de praticar ato para satisfazer interesse ou SENTIMENTO PESSOAL (ódio, amor, pena).
* *Corrupção Privilegiada:* Cede a PEDIDO OU INFLUÊNCIA de outrem.
    `,
    examples: [
      "**Peculato Desvio:** Policial Civil usa a viatura caracterizada para fazer mudança de móveis de sua própria casa nos fins de semana.",
      "**Corrupção Passiva x Ativa:** O policial multa o motorista. O motorista oferece suborno (Corrupção Ativa). O policial aceita (Corrupção Passiva). Exceção à teoria monista: respondem por crimes diferentes."
    ],
    cespeTip: "Se o funcionário público EXIGE vantagem indevida, ele comete Concussão. O particular que paga a vantagem EXIGIDA NÃO comete corrupção ativa (pois foi extorquido).",
    trap: "Confundir Extorsão (Art. 158) com Concussão (Art. 316). Se o funcionário público usa violência ou GRAVE AMEAÇA (ex: aponta arma), o crime é Extorsão. A Concussão é exigência baseada no TEMOR inerente ao cargo público, sem ameaça direta à integridade física."
  },

  // ==========================================
  // DIREITO PROCESSUAL PENAL
  // ==========================================
  {
    id: "cpp_01",
    area: "Direito Processual Penal",
    title: "Inquérito Policial",
    descricao: "Natureza, Prazos, Características e Arquivamento.",
    def: "Procedimento administrativo de caráter investigatório, pré-processual, presidido pelo Delegado de Polícia para apurar infrações penais (autoria e materialidade).",
    deep: `
**1. Características (EEIDOSS):** * **E**scrito (reduzido a termo).
* **E**x Oficialidade (órgãos oficiais do Estado).
* **I**nquisitivo (Não há contraditório e ampla defesa plenos, defesa é mitigada).
* **I**ndisponível (Delegado NUNCA pode arquivar o IP, Art. 17).
* **D**ispensável (Se o MP já tem justa causa, entra com a Ação Penal direto).
* **O**ficioso (Crimes de Ação Pública Incondicionada, o Delegado age de ofício).
* **S**igiloso (Garantia ao sucesso das diligências e intimidade do suspeito).
**2. Súmula Vinculante 14:** O advogado tem amplo acesso APENAS aos elementos de prova JÁ DOCUMENTADOS que digam respeito ao direito de defesa. Diligências em andamento (interceptação rolando) são ocultas.
**3. Prazos (Regra do CP e Pacote Anticrime):**
* *Justiça Estadual:* 10 dias (Preso) / 30 dias (Solto). (Prisão temporária não altera os 10 dias da regra geral, só prolonga o status de preso).
* *Justiça Federal:* 15 dias (Preso - prorrogável por +15) / 30 dias (Solto).
* *Drogas:* 30 dias (Preso - dobra) / 90 dias (Solto - dobra).
**4. Arquivamento (Nova Redação do Art. 28):** Realizado pelo MINISTÉRIO PÚBLICO (internamente), não mais pelo Juiz. A vítima pode recorrer ao órgão superior do MP em 30 dias se não concordar. (STF declarou constitucional o novo formato em 2023).
    `,
    examples: [
      "**Indisponibilidade:** O Delegado indicia Tício. Uma semana depois, descobre vídeo provando que Tício estava em outro país. O Delegado relata o inquérito opinando pela inocência, mas quem vai promover o arquivamento é o Promotor de Justiça.",
      "**Sigilo mitigado:** Defesa de alvo de operação policial tenta acessar laudo pericial já juntado aos autos físicos na Delegacia. O Delegado não pode negar."
    ],
    cespeTip: "Vícios e nulidades do Inquérito Policial NÃO contaminam a Ação Penal subsequente, pois o IP é mera peça de informação.",
    trap: "Achar que o Inquérito é condição de procedibilidade para a Ação Penal. É FALSO. Ele é dispensável. Se o MP tiver vídeos e documentos suficientes trazidos pela vítima, já oferece a denúncia."
  },
  {
    id: "cpp_02",
    area: "Direito Processual Penal",
    title: "Prisões Cautelares (Flagrante e Preventiva)",
    descricao: "Espécies de flagrante e requisitos da prisão preventiva.",
    def: "Modalidades de restrição de liberdade antes do trânsito em julgado, com finalidade assecuratória ou instrumental.",
    deep: `
**1. Prisão em Flagrante (Art. 302):**
* *Próprio/Real:* Está cometendo ou acaba de cometer (I e II).
* *Impróprio/Quase-flagrante:* É PERSEGUIDO logo após, em situação que faça presumir ser autor (III). Exige perseguição ininterrupta.
* *Presumido/Ficto:* É ENCONTRADO logo depois, com armas/objetos que o façam presumir ser o autor (IV). Não exige perseguição, apenas encontro imediato.
* *Ilegal:* Flagrante preparado (Súmula 145 STF - crime impossível) e flagrante forjado. Flagrante ESPERADO é perfeitamente válido.
**2. Audiência de Custódia:** Ocorre em até 24 HORAS após a prisão. Finalidade é checar a legalidade do ato e integridade do preso. A não realização em 24h não anula a prisão automaticamente se for justificada, mas exige controle imediato judicial.
**3. Prisão Preventiva (Art. 312):**
* *Requisitos (Fumus comissi delicti):* Prova da materialidade e indícios SUFICIENTES de autoria + perigo gerado pelo estado de liberdade do imputado.
* *Fundamentos (Periculum libertatis):* Garantia da ordem pública, ordem econômica, conveniência da instrução criminal ou para assegurar a aplicação da lei penal.
* *Revisão (Art. 316, PU):* O emissor da decisão deve revisar a necessidade a cada 90 DIAS. O STF pacificou que o atraso não gera soltura automática.
**4. Iniciativa:** JUIZ NÃO PODE DECRETAR PRISÃO PREVENTIVA DE OFÍCIO, nem durante o inquérito, nem na ação penal (Pacote Anticrime).
    `,
    examples: [
      "**Flagrante Esperado:** A polícia recebe denúncia anônima que haverá um roubo ao banco. Ficam de campana e prendem os assaltantes no ato. Válido.",
      "**Prisão Preventiva:** Chefe de milícia coagindo testemunhas de homicídio (Conveniência da instrução criminal)."
    ],
    cespeTip: "Memorize: Qualquer do povo PODERÁ e as autoridades policiais DEVERÃO prender quem quer que se encontre em flagrante. Particular tem faculdade; polícia tem dever legal.",
    trap: "Acreditar que a prisão temporária tem os mesmos requisitos da preventiva. Temporária possui lei própria (Lei 7.960), prazo fechado (5 ou 30 dias), SÓ cabe na fase de inquérito e abrange um rol taxativo de crimes."
  },
  {
    id: "cpp_03",
    area: "Direito Processual Penal",
    title: "Teoria das Provas",
    descricao: "Corpo de delito, Provas Ilícitas e Cadeia de Custódia.",
    def: "Meios legais e moralmente legítimos destinados a influenciar o convencimento do juiz a respeito da verdade dos fatos na instrução processual.",
    deep: `
**1. Sistema de Valoração:** Livre convencimento motivado (ou persuasão racional). O juiz decide livremente com base nos autos, mas DEVE fundamentar.
**2. Vedação (Art. 155):** O juiz não pode fundamentar sua decisão EXCLUSIVAMENTE nos elementos colhidos na investigação, RESSALVADAS as provas cautelares, não repetíveis e antecipadas.
**3. Exame de Corpo de Delito (Art. 158):** Indispensável quando a infração deixar VESTÍGIOS (crimes materiais). A confissão do acusado NÃO supre a falta do laudo. Mas se os vestígios desaparecerem, a prova testemunhal pode suprir (Art. 167).
**4. Provas Ilícitas x Ilegítimas:**
* *Ilícitas:* Violam normas de Direito MATERIAL (CF e CP). Ex: Tortura, interceptação sem ordem. Devem ser desentranhadas dos autos.
* *Ilegítimas:* Violam normas de Direito PROCESSUAL. Ex: Perícia feita por leigo não compromissado. Gera nulidade que pode ser sanada.
**5. Árvore dos Frutos Envenenados:** Prova ilícita por derivação também é nula. Exceções: Fonte independente ou descoberta inevitável (Art. 157, §1º).
**6. Cadeia de Custódia (Art. 158-A):** Conjunto de procedimentos para registrar a história cronológica do vestígio, garantindo sua rastreabilidade e integridade. Quebra de cadeia gera valoração menor, mas STJ diz que não torna a prova ilícita automaticamente se o perito atestar a integridade no laudo.
    `,
    examples: [
      "**Prova não repetível:** Exame de dosagem alcoólica no bafômetro no dia do crime. Não dá para repetir no julgamento dois anos depois. O juiz pode condenar baseado nela.",
      "**Suprimento do Corpo de Delito:** Vítima de homicídio tem o corpo jogado no mar (sumiu). A polícia usa o vídeo da câmera de segurança e testemunhas oculares para comprovar a morte material."
    ],
    cespeTip: "Admite-se prova ilícita *pro reo*! Se a única forma do réu inocente provar que não cometeu o crime é interceptando uma ligação ilegalmente, o STF admite pela ponderação (Princípio da Proporcionalidade).",
    trap: "Achar que a falta do laudo de exame de corpo de delito direto sempre anula o processo. Se os vestígios sumiram (o assassino limpou a cena de sangue e queimou o corpo), o exame INDIRETO (testemunhal) supre validamente a lacuna."
  },

  // ==========================================
  // DIREITO CIVIL
  // ==========================================
  {
    id: "civil_01",
    area: "Direito Civil",
    title: "Lei de Introdução às Normas do Direito Brasileiro (LINDB)",
    descricao: "Vigência, revogação e integração da norma (analogia, costumes e princípios).",
    def: "A LINDB é uma 'norma de sobredireito' (Lex legum), pois regula a aplicação, interpretação e a eficácia de outras leis no tempo e no espaço.",
    deep: `
**1. Vigência da Lei:** Salvo disposição em contrário, a lei começa a vigorar em todo o país 45 dias depois de oficialmente publicada (Vacatio Legis). Nos Estados estrangeiros, o prazo é de 3 meses.
**2. Princípio da Continuidade:** A lei vigora até que outra a modifique ou revogue (Art. 2º). 
* *Ab-rogação:* Revogação total.
* *Derrogação:* Revogação parcial.
* *Atenção:* A lei nova geral NÃO revoga a lei velha especial (e vice-versa), salvo incompatibilidade.
**3. Repristinação:** O Brasil NÃO adota a repristinação tácita (lei revogada não volta à vida se a lei revogadora for revogada). Exige-se previsão expressa. A única exceção tácita é na Declaração de Inconstitucionalidade pelo STF (efeito repristinatório).
**4. Integração (Art. 4º):** Quando a lei for omissa, o juiz NÃO PODE deixar de julgar (vedação ao *non liquet*). Ele usará, NA ORDEM SUCESSIVA:
1º Analogia;
2º Costumes;
3º Princípios Gerais de Direito.
*(Equidade não está no Art. 4º, só é usada quando a lei expressamente autorizar).*
    `,
    examples: [
      "**Repristinação Expressa:** A Lei A proíbe uso de fogos. Lei B revoga a Lei A e libera os fogos. Lei C revoga a Lei B, e no seu artigo final diz: 'A Lei A volta a vigorar'. Isso é repristinação expressa válida.",
      "**Integração:** Diante de contratos via WhatsApp sem previsão legal específica, o juiz aplica as regras gerais dos contratos tradicionais (Analogia)."
    ],
    cespeTip: "Cuidado com o prazo no exterior! A banca costuma colocar 45 dias, 60 dias ou 90 dias. A lei diz expressamente '3 meses' (o que pode ser diferente de 90 dias no calendário civil).",
    trap: "Achar que a jurisprudência e a doutrina são meios formais de integração previstos no Art. 4º da LINDB. Não são! Apenas Analogia, Costumes e PGD."
  },
  {
    id: "civil_02",
    area: "Direito Civil",
    title: "Pessoas Naturais e Capacidade",
    descricao: "Nascimento, emancipação e Estatuto da Pessoa com Deficiência (EPD).",
    def: "O estudo das pessoas naturais envolve o início da personalidade jurídica, os graus de capacidade para atuar no mundo civil e o fim da pessoa (morte).",
    deep: `
**1. Personalidade Jurídica:** Adquire-se com o NASCIMENTO COM VIDA (respiração), mas a lei põe a salvo os direitos do nascituro desde a concepção (Teoria Natalista adotada pelo CC).
**2. Capacidade de Direito:** Inerente a toda pessoa viva.
**3. Capacidade de Fato (Exercício):**
* **Absolutamente Incapazes (Art. 3º):** APENAS OS MENORES DE 16 ANOS. Precisam ser *representados*. Atos praticados por eles sozinhos são NULOS.
* **Relativamente Incapazes (Art. 4º):** Maiores de 16 e menores de 18; ébrios habituais; viciados em tóxicos; pródigos; que por causa transitória não puderem exprimir vontade. Precisam ser *assistidos*. Atos solitários são ANULÁVEIS.
**4. Impacto do EPD (Lei 13.146/15):** A deficiência mental/intelectual NÃO AFETA MAIS A CAPACIDADE CIVIL PLENA. A pessoa com deficiência é plenamente capaz para casar, trabalhar e exercer direitos sexuais. A curatela (quando necessária) afeta APENAS os aspectos patrimoniais.
**5. Emancipação:** Antecipação da capacidade plena antes dos 18 anos.
* *Voluntária:* Concedida pelos PAIS, por escritura pública, jovem deve ter 16 anos completos. Independe de homologação judicial.
* *Legal:* Casamento, emprego público efetivo, colação de grau em curso superior, economia própria.
    `,
    examples: [
      "**Nascituro:** Pai morre durante a gestação. A criança nasce e respira por 1 minuto, vindo a falecer. Ela herdou e transmitiu a herança para a mãe (comoriência não aplicável).",
      "**EPD:** Jovem com Síndrome de Down profunda quer se casar. O oficial do cartório não pode impedir, pois ele é absolutamente capaz para atos existenciais."
    ],
    cespeTip: "Fique de olho na emancipação voluntária. Ela é irrevogável. Se os pais emancipam o jovem de 16 anos, mas ele comete atos ilícitos no trânsito, a jurisprudência (STJ) entende que os pais AINDA respondem solidariamente.",
    trap: "Considerar idosos ou doentes mentais como absolutamente incapazes. Desde 2015, os únicos absolutamente incapazes no Direito Civil brasileiro são os menores de 16 anos."
  },

  // ==========================================
  // DIREITO PROCESSUAL CIVIL
  // ==========================================
  {
    id: "cpc_01",
    area: "Direito Processual Civil",
    title: "Tutelas Provisórias (Urgência e Evidência)",
    descricao: "Divisão, requisitos e o fenômeno da Estabilização da Tutela.",
    def: "Decisões precárias que adiantam os efeitos do processo (satisfativa) ou protegem os bens para o resultado futuro (cautelar).",
    deep: `
**1. Divisão Geral:** O gênero "Tutela Provisória" divide-se em Tutela de URGÊNCIA e Tutela de EVIDÊNCIA.
**2. Tutela de Urgência (Art. 300):**
* *Requisitos:* Fumus boni iuris (probabilidade do direito) + Periculum in mora (perigo de dano ou risco ao resultado útil).
* *Subdivisão:* Antecipada (antecipa o mérito - ex: dar o remédio logo) ou Cautelar (assegura o mérito - ex: bloquear conta bancária para evitar fuga de capital).
* *Limitação:* A tutela ANTECIPADA não será concedida se houver perigo de irreversibilidade dos efeitos da decisão.
**3. Tutela de Evidência (Art. 311):** INDEPENDE da demonstração de perigo (periculum in mora). É concedida por alta probabilidade ou abuso do réu. Hipóteses:
* I. Abuso do direito de defesa/procrastinação do réu.
* II. Alegações baseadas em Súmula Vinculante ou julgamento de repetitivos.
* III. Pedido reipersecutório baseado em contrato de depósito.
* IV. Petição inicial com prova documental suficiente não oposta pelo réu.
**4. Estabilização da Tutela (Art. 304):** Aplica-se EXCLUSIVAMENTE à Tutela Antecipada Requerida em Caráter ANTECEDENTE. Se deferida e o réu NÃO interpuser o recurso cabível (Agravo de Instrumento), a decisão se estabiliza e o processo é extinto sem resolução de mérito. Reversão pode ocorrer por ação própria em até 2 anos.
    `,
    examples: [
      "**Evidência:** Autor entra com ação mostrando contrato assinado e Súmula Vinculante exata sobre o caso. O juiz já dá a liminar sem precisar provar que há risco de dano grave iminente.",
      "**Estabilização:** Autor pede liminarmente para o plano de saúde autorizar a internação, avisando que é tutela antecedente. O juiz defere. O plano de saúde paga e não recorre. O autor não precisa formar o pedido principal, a medida estabiliza."
    ],
    cespeTip: "Bancas trocam: A Tutela Cautelar NÃO sofre estabilização. A Tutela de Evidência NÃO sofre estabilização. Só a Tutela Antecipada Antecedente.",
    trap: "Achar que a estabilização da tutela faz coisa julgada material. O NCPC deixa claro (Art. 304, §6º): A decisão estabilizada NÃO FAZ COISA JULGADA material, mas torna-se imutável se não ajuizarem ação de revisão em 2 anos."
  },

  // ==========================================
  // DIREITOS HUMANOS
  // ==========================================
  {
    id: "dh_01",
    area: "Direitos Humanos",
    title: "Teoria Geral e Incorporação de Tratados",
    descricao: "Características, Gerações e a Hierarquia dos Tratados no Brasil.",
    def: "Conjunto de prerrogativas e garantias inerentes a todo ser humano, com proteção em plano internacional e internalização no direito doméstico.",
    deep: `
**1. Características Essenciais:**
* *Universalidade:* Para todos, sem distinção.
* *Inerência:* Nascem com a pessoa, não são "dados" pelo Estado.
* *Indivisibilidade:* Os direitos civis, políticos e sociais formam um bloco único; a violação de um afeta o outro.
* *Imprescritibilidade:* Não se perdem pelo não uso no tempo.
* *Vedação ao Retrocesso (Efeito Cliquét):* Conquistas alcançadas não podem ser suprimidas sem equivalência.
**2. Gerações (ou Dimensões) dos DH (Karel Vasak):**
* *1ª Geração (Liberdade):* Direitos Civis e Políticos. Exigem abstenção do Estado (direitos negativos). Séc XVIII/XIX.
* *2ª Geração (Igualdade):* Direitos Sociais, Econômicos e Culturais. Exigem prestação do Estado (direitos positivos). Séc XX.
* *3ª Geração (Fraternidade/Solidariedade):* Direitos Difusos (Meio ambiente, paz, desenvolvimento, autodeterminação dos povos).
**3. Incorporação de Tratados (Art. 5º, CF):**
* *Regra de Ouro da CF:* Qualquer tratado de DH aprovado pelo rito de Emenda (2 Casas, 2 turnos, 3/5 dos votos) entra com *Status Constitucional*. (Ex: Tratado de Nova York/Pessoas com Deficiência e Tratado de Marraqueche).
* *Tratados de DH aprovados pelo rito ordinário:* *Status Supralegal* (acima da lei, abaixo da CF). (Ex: Pacto de San José da Costa Rica - STF RE 466.343).
* *Tratados Comuns (não-DH):* Status de Lei Ordinária.
    `,
    examples: [
      "**Controle de Convencionalidade:** O STF declarou ilícita a prisão do depositário infiel. A Constituição previa (Art. 5º), mas o Pacto de San José (supralegal) proibia. A supralegalidade paralisou as leis infraconstitucionais que operavam a prisão, esvaziando a norma constitucional.",
      "**Efeito Cliquét:** Um país retira da sua constituição a obrigatoriedade do ensino fundamental gratuito, ofendendo a vedação ao retrocesso de direitos de 2ª geração."
    ],
    cespeTip: "Fique atento: A DUDH (Declaração Universal dos Direitos Humanos de 1948) NÃO É UM TRATADO! É uma Resolução da Assembleia Geral da ONU. Portanto, não foi submetida ao quórum de 3/5 do Congresso brasileiro para ter status de emenda constitucional.",
    trap: "Afirmar que não existem Direitos Humanos absolutos. Como regra, não existem (Princípio da Relatividade). Porém, o STF e a doutrina consideram a *Proibição da Tortura e Escravidão* como direitos absolutos no ordenamento internacional (jus cogens)."
  }
];

// Helper para ler token unificado
// getAuthToken vive em components/AiKeyConfig.jsx — uma cópia só para todas as telas.

// Função Anti-Erro e Limpeza de Resposta da IA com suporte a Streams e Fallback Supremo
const fetchStreamAsJson = async (url, options, onProgress = null) => {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`Erro do servidor: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let rawText = "";
  let bytesReceived = 0;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesReceived += value.length;
    if (onProgress) onProgress(bytesReceived);
    rawText += decoder.decode(value, { stream: true });
  }
  
  // Limpeza inicial de tags de raciocínio (DeepSeek/Thinking models)
  let cleanText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim(); 
  
  // Tenta isolar o bloco estruturado do JSON
  const jsonMatch = cleanText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) cleanText = jsonMatch[0];

  try {
    // 1. Tenta o parse direto (caso o JSON venha perfeito)
    return JSON.parse(cleanText);
  } catch (e) {
    try {
      // 2. Segunda tentativa limpando quebras de linha literais e vírgulas órfãs
      let processedText = cleanText.replace(/[\n\r\t]+/g, ' ').replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(processedText);
    } catch (secondError) {
      
      // 3. FALLBACK SUPREMO: Ignora JSON corrompido com aspas soltas (Ex: O "Jogo" da CESPE)
      if (cleanText.includes("lesson_markdown")) {
        // Captura TUDO depois de "lesson_markdown": " até o final do texto
        const match = cleanText.match(/"lesson_markdown"\s*:\s*"([\s\S]*)/);
        
        if (match && match[1]) {
          let extractedText = match[1];
          
          // Limpa o fechamento do JSON no final da string ("} ou só ")
          extractedText = extractedText.replace(/"\s*\}\s*$/, '').replace(/"\s*$/, '');
          
          // Restaura quebras de linha e aspas escapadas da IA
          extractedText = extractedText
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"');
          
          return { lesson_markdown: extractedText };
        }
      }
      
      // Se não for aula e falhar mesmo assim, exibe no console e lança o erro padrão
      console.error("TEXTO COM ERRO COMPLETO DA IA:", rawText);
      throw new Error("A IA gerou um formato inválido de dados.");
    }
  }
};

export default function GabariteDireito() {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // --- ESTADOS DA CONFIGURAÇÃO DA IA ---
  const [showConfig, setShowConfig] = useState(false);
  const { userApiKey, userModel, setUserApiKey, setUserModel, ia } = useAiKey();
  const [aviso, setAviso] = useState(null);
  const [confirmarEntrega, setConfirmarEntrega] = useState(false);

  // --- ESTADOS DA APLICAÇÃO ---
  const [viewState, setViewState] = useState("topics");
  const [currentTopic, setCurrentTopic] = useState(null);
  const [currentQuestions, setCurrentQuestions] = useState([]);
  const [userAnswers, setUserAnswers] = useState({});
  const [loadingMsg, setLoadingMsg] = useState("");
  const [isExamFinished, setIsExamFinished] = useState(false);

  // --- ESTADOS DE AULA GERADA SOBRE ERROS ---
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [lessonContent, setLessonContent] = useState("");

  // --- ESTADOS DE CONFIGURAÇÃO DO SIMULADO ---
  const [configFormato, setConfigFormato] = useState("Certo/Errado");
  const [configExamMode, setConfigExamMode] = useState(false);
  const [configAmount, setConfigAmount] = useState(10);
  
  // --- ESTADOS DE ESTATÍSTICAS ---
  const [stats, setStats] = useState({ total: 0, correct: 0, wrong: 0, topics: {} });
  const [showStatsModal, setShowStatsModal] = useState(false);

  useEffect(() => {
    const savedStats = localStorage.getItem('cespe_direito_stats');
    if (savedStats) {
      try { setStats(JSON.parse(savedStats)); } catch (e) { console.error(e); }
    }
  }, []);

  const saveStats = (newStats) => {
    setStats(newStats);
    localStorage.setItem('cespe_direito_stats', JSON.stringify(newStats));
  };

  const handleConnectAI = () => {
    const callbackUrl = encodeURIComponent(`${window.location.origin}/callback`);
    window.location.href = `https://openrouter.ai/auth?callback_url=${callbackUrl}`;
  };

  const selectTopic = (topicId) => {
    const topic = direitoData.find(a => a.id === topicId);
    setCurrentTopic(topic);
    setViewState("lesson");
    window.scrollTo(0, 0);
  };

  const generateQuiz = async () => {
    /* COMENTADO PARA UTILIZAÇÃO DA CHAVE GLOBAL DO USUÁRIO
    if (!userApiKey) {
      setAviso({ tone: "err", texto: "Por favor, configure sua Chave API do OpenRouter ou AI Studio nas configurações." });
      setShowConfig(true);
      return;
    }
      */

    setViewState("loading");

    try {
      const token = getAuthToken();
      let todasQuestoes = [];
      const batchSize = 5; 
      const batches = Math.ceil(configAmount / batchSize);

      for (let i = 0; i < batches; i++) {
        setLoadingMsg(`Processando jurisprudência e doutrina... (Lote ${i + 1} de ${batches})`);
        const currentBatchSize = Math.min(batchSize, configAmount - (i * batchSize));

        const regrasDaAula = `
          Área: ${currentTopic.area} | 
          Definição base: ${currentTopic.def} | 
          Dica CESPE: ${currentTopic.cespeTip} | 
          Pegadinhas: ${currentTopic.trap}
        `.replace(/[\n\r]+/g, " ");

        // 1. Descobre se a chave é do Google (não começa com sk-or-)
        const isGoogleKey = userApiKey && !userApiKey.startsWith("sk-or-");
        // 2. Define o modelo de segurança compatível
        const defaultModel = isGoogleKey ? "gemini-2.5-flash-lite" : "deepseek/deepseek-v4-flash";

        const payload = {
          subject: currentTopic.area,
          focus: `Foco estrito no tópico: ${currentTopic.title}. ATENÇÃO EXAMINADOR: OBRIGATÓRIO embasar em Lei Seca e Jurisprudência STF/STJ predominante. Crie casos hipotéticos usando estas regras: ${regrasDaAula}`, 
          difficulty: "dificil", 
          amount: currentBatchSize,
          generate_text: true,
          formato: configFormato,
          model: userModel || defaultModel,
          api_key: userApiKey || null
        };

        let data = null;
        let tentativas = 0;

        while (tentativas < 2) {
          try {
            data = await fetchStreamAsJson(`${API_URL}/generate-simulado-cespe`, {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                "Authorization": token ? `Bearer ${token}` : ""
              },
              body: JSON.stringify(payload)
            });
            
            // NOVO: Aborta na hora se o backend repassar um erro da API
            if (data && data.error) {
              throw new Error(`Erro da API: ${data.error}`);
            }

            if (data && data.questoes && data.questoes.length > 0) break;
            throw new Error("O lote veio vazio.");
          } catch (e) {
            tentativas++;
            // Se o erro for da API, não repete o laço, apenas repassa o erro para a tela
            if (e.message.includes("Erro da API")) throw e; 
            
            if (tentativas >= 2) throw new Error(e.message || "A IA falhou em formatar as opções.");
            setLoadingMsg(`Reajustando os vereditos da IA... (A repetir Lote ${i + 1})`);
          }
        }

        const questoesCorrigidas = data.questoes.map((q, idx) => ({
          ...q,
          id: `q_direito_${i}_${idx}`,
          // ADICIONE ESTA LINHA: Anexa o texto base apenas à primeira questão do lote
          textoBase: idx === 0 ? (data.textoBase || data.texto_base || "") : null
        }));

        todasQuestoes = [...todasQuestoes, ...questoesCorrigidas];
      }

      setCurrentQuestions(todasQuestoes);
      setUserAnswers({});
      setIsExamFinished(false);
      setViewState("quiz");
      window.scrollTo(0, 0);

    } catch (err) {
      console.error(err);
      setAviso({ tone: "err", texto: err.message || "Falha ao comunicar com a IA. Tente novamente." });
      setViewState("lesson");
    }
  };

  const handleAnswerSelect = (qId, answer) => {
    if (isExamFinished) return;
    
    if (!configExamMode) {
      if (userAnswers[qId]) return; 
      const newAnswers = { ...userAnswers, [qId]: answer };
      setUserAnswers(newAnswers);
      processSingleAnswer(qId, answer);
    } else {
      const newAnswers = { ...userAnswers };
      if (newAnswers[qId] === answer) delete newAnswers[qId];
      else newAnswers[qId] = answer;
      setUserAnswers(newAnswers);
    }
  };

  const processSingleAnswer = (qId, answer) => {
    const q = currentQuestions.find(x => x.id === qId);
    const isCorrect = answer === q.gabarito;
    
    let newStats = { ...stats };
    newStats.total++;
    if (isCorrect) newStats.correct++; else newStats.wrong++;

    if (!newStats.topics[currentTopic.title]) newStats.topics[currentTopic.title] = { correct: 0, wrong: 0 };
    if (isCorrect) newStats.topics[currentTopic.title].correct++; 
    else newStats.topics[currentTopic.title].wrong++;

    saveStats(newStats);
  };

  const submitQuiz = () => {
    if (isExamFinished) return;
    if (configExamMode && Object.keys(userAnswers).length < currentQuestions.length) {
      setConfirmarEntrega(true);
      return;
    }
    finalizarProva();
  };

  const finalizarProva = () => {
    setConfirmarEntrega(false);
    setIsExamFinished(true);

    if (configExamMode) {
      let newStats = { ...stats };
      currentQuestions.forEach(q => {
        const ans = userAnswers[q.id];
        if (ans) {
          newStats.total++;
          if (ans === q.gabarito) newStats.correct++; else newStats.wrong++;
          
          if (!newStats.topics[currentTopic.title]) newStats.topics[currentTopic.title] = { correct: 0, wrong: 0 };
          if (ans === q.gabarito) newStats.topics[currentTopic.title].correct++;
          else newStats.topics[currentTopic.title].wrong++;
        }
      });
      saveStats(newStats);
    }

    // Além do painel local, o resultado da sessão vai para o servidor: sem
    // isto, o Meu Desempenho e o ranking ignoram esta ferramenta inteira.
    const respondidas = currentQuestions.filter((q) => userAnswers[q.id]);
    registrarSimulado({
      ferramenta: "direito",
      foco: currentTopic?.title || "",
      acertos: respondidas.filter((q) => userAnswers[q.id] === q.gabarito).length,
      respondidas: respondidas.length,
      formato: configFormato,
    });

    setViewState("results");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getWrongQuestions = () => {
    if (!currentQuestions) return [];
    return currentQuestions.filter(q => {
      const ans = userAnswers[q.id];
      return ans && ans !== q.gabarito;
    });
  };

  const generateLesson = async (wrongQuestions) => {
    setViewState("loading");
    setLoadingMsg("O Professor IA está montando a análise textual e traduções para os seus erros...");

    try {
      const token = getAuthToken();
      
      // 1. Resolve o problema de roteamento do modelo (anti-404)
      const isGoogleKey = userApiKey && !userApiKey.startsWith("sk-or-");
      const defaultModel = isGoogleKey ? "gemini-2.5-flash-lite" : "deepseek/deepseek-v4-flash";

      // 2. SUBSTITUI o fetch normal pela sua função blindada fetchStreamAsJson
      const data = await fetchStreamAsJson(`${API_URL}/generate-lesson-cespe`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          wrong_questions: wrongQuestions,
          model: userModel || defaultModel,
          api_key: userApiKey || null
        })
      });

      // 3. Captura possíveis erros que a API possa retornar
      if (data && data.error) {
        throw new Error(`Erro da API: ${data.error}`);
      }

      setLessonContent(data.lesson_markdown || data.text || "Conteúdo não disponível.");
      setViewState("exam"); 
      setShowLessonModal(true);

    } catch (err) {
      console.error(err);
      setAviso({ tone: "err", texto: err.message || "Falha ao gerar a aula explicativa." });
      setViewState("exam");
    }
  };

  const wrongCount = getWrongQuestions().length;
  const showLessonAction = (isExamFinished || (!configExamMode && Object.keys(userAnswers).length === currentQuestions?.length)) && wrongCount > 0;

  return (
    <div className="gab">
      {/* HEADER PRINCIPAL */}
      <header className="gab__topo" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ color: 'var(--fg)', margin: '0 0 5px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Scale size={32} color="var(--primary)" /> Gabarite Direito <span style={{ color: 'var(--primary)' }}>CESPE</span>
          </h1>
          <p style={{ color: 'var(--fg-2)', margin: 0 }}>Constitucional, Penal, Administrativo e Processual focado em jurisprudência.</p>
        </div>
        <button onClick={() => setShowStatsModal(true)} className="ui-btn" style={{ fontWeight: 'bold' }}>
          <BarChart2 size={20} /> O meu Desempenho
        </button>
      </header>

      <AiKeyBar
        ia={ia}
        userApiKey={userApiKey}
        userModel={userModel}
        onConfigurar={() => setShowConfig(true)}
        label="IA das Noções de Direito"
      />

      {/* VIEW: GRID DE TÓPICOS */}
      {viewState === "topics" && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {direitoData.map(aula => (
            <div 
              key={aula.id}
              onClick={() => selectTopic(aula.id)}
              className="ui-card ui-card--pad"
              style={{ cursor: 'pointer', borderLeft: '5px solid var(--primary)', transition: 'transform 0.2s, box-shadow 0.2s' }}
              onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
            >
              <div style={{ fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--fg-2)', marginBottom: '8px' }}>
                {aula.area}
              </div>
              <h2 style={{ fontSize: '1.3rem', color: 'var(--primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BookOpen size={20} /> {aula.title}
              </h2>
              <p style={{ color: 'var(--fg-2)' }}>{aula.descricao}</p>
            </div>
          ))}
        </div>
      )}

      {/* VIEW: AULA INDIVIDUAL */}
      {viewState === "lesson" && currentTopic && (
        <div className="ui-card ui-card--pad" style={{ padding: '2.5rem' }}>
          <button 
            onClick={() => setViewState("topics")}
            style={{ background: 'transparent', border: 'none', color: 'var(--fg-2)', fontSize: '1rem', cursor: 'pointer', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}
          >
            <ArrowLeft size={18} /> Voltar para os institutos
          </button>
          
          <div style={{ marginBottom: '2rem', borderBottom: '2px solid var(--border)', paddingBottom: '1rem' }}>
            <span style={{ display: 'inline-block', padding: '4px 8px', background: 'var(--hover-bg)', color: 'var(--fg-2)', fontSize: '0.85rem', borderRadius: '4px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '10px' }}>
              {currentTopic.area}
            </span>
            <h2 style={{ fontSize: '2rem', color: 'var(--primary)', margin: 0 }}>{currentTopic.title}</h2>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--fg)', fontSize: '1.3rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>📖 1. Base Doutrinária</h3>
            <div style={{ color: 'var(--fg)', lineHeight: '1.6' }}><Md>{currentTopic.def}</Md></div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--fg)', fontSize: '1.3rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>🔍 2. Análise Jurisprudencial</h3>
            <div style={{ color: 'var(--fg)', lineHeight: '1.6' }}><Md>{currentTopic.deep}</Md></div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--fg)', fontSize: '1.3rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>📝 3. Casos Concretos</h3>
            {currentTopic.examples.map((ex, i) => (
              <div key={i} style={{ background: 'var(--hover-bg)', borderLeft: '4px solid var(--fg-2)', padding: '1rem', marginBottom: '1rem', borderRadius: '0 8px 8px 0', color: 'var(--fg)' }}>
                <Md>{ex}</Md>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--fg)', fontSize: '1.3rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>🎯 4. Visão do Examinador (CESPE)</h3>
            <div style={{ background: 'var(--primary-light)', border: '1px solid var(--primary)', padding: '1.5rem', borderRadius: '8px', color: 'var(--fg)' }}>
              <strong>Estratégia de Prova:</strong> <Md>{currentTopic.cespeTip}</Md>
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--fg)', fontSize: '1.3rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>⚠️ 5. Pegadinhas Clássicas</h3>
            <div style={{ background: 'var(--error-bg)', border: '1px solid var(--danger)', padding: '1.5rem', borderRadius: '8px', color: 'var(--error-text)' }}>
              <strong>Alerta Jurisprudencial:</strong> <Md>{currentTopic.trap}</Md>
            </div>
          </div>

          {/* PAINEL DE CONFIGURAÇÃO DE QUESTÕES */}
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem', marginTop: '2rem' }}>
             <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--fg)' }}>
                <SlidersHorizontal size={20} color="var(--primary)" /> Simular Fatos e Fundamentos
             </h3>
             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                <div style={{ flex: '1 1 200px' }}>
                   <label className="ui-field__label">Formato de Julgamento</label>
                   <select className="ui-input" value={configFormato} onChange={e => setConfigFormato(e.target.value)} style={{ width: '100%', padding: '10px' }}>
                     <option value="Certo/Errado">Certo / Errado (Padrão CESPE)</option>
                     <option value="Múltipla Escolha">Múltipla Escolha</option>
                   </select>
                </div>
                <div style={{ flex: '1 1 200px' }}>
                   <label className="ui-field__label">Extensão da Prova</label>
                   <select className="ui-input" value={configAmount} onChange={e => setConfigAmount(Number(e.target.value))} style={{ width: '100%', padding: '10px' }}>
                     <option value={5}>5 Situações Hipotéticas</option>
                     <option value={10}>10 Situações Hipotéticas</option>
                     <option value={15}>15 Situações Hipotéticas</option>
                   </select>
                </div>
                <div style={{ flex: '1 1 200px', display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setConfigExamMode(!configExamMode)}>
                   <div style={{ flex: 1 }}>
                     <span style={{ fontSize: '0.95rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--fg)' }}>
                       <BookOpenCheck size={18} /> Modo Prova Real
                     </span>
                     <span style={{ fontSize: '0.75rem', color: 'var(--fg-3)' }}>Julgue tudo e corrija no final</span>
                   </div>
                   <div style={{ width: '40px', height: '22px', background: configExamMode ? 'var(--primary)' : 'var(--border)', borderRadius: '20px', position: 'relative', transition: '0.3s' }}>
                     <div style={{ width: '18px', height: '18px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: configExamMode ? '20px' : '2px', transition: '0.3s' }}></div>
                   </div>
                </div>
             </div>
             
             <button onClick={generateQuiz} className="ui-btn ui-btn--primary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', marginTop: '20px' }}>
               👉 Gerar Casos e Questões Inéditas com IA
             </button>
          </div>
        </div>
      )}

      {/* VIEW: LOADING */}
      {viewState === "loading" && (
        <div className="ui-card ui-card--pad" style={{ textAlign: 'center', padding: '3rem' }}>
          <Cpu className="spin" size={48} color="var(--primary)" style={{ margin: '0 auto 20px auto' }} />
          <p style={{ color: 'var(--fg-2)', fontSize: '1.1rem', fontWeight: 'bold' }}>{loadingMsg}</p>
        </div>
      )}

      {/* VIEW: QUIZ & RESULTADOS */}
      {(viewState === "quiz" || viewState === "results") && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {viewState === "results" && (
            <div style={{ background: 'var(--primary)', color: 'white', padding: '2rem', borderRadius: '12px', textAlign: 'center', boxShadow: 'var(--shadow-md)' }}>
              <h3 style={{ fontSize: '2rem', margin: '0 0 10px 0' }}>Simulado Finalizado!</h3>
              <p style={{ fontSize: '1.1rem', margin: 0, opacity: 0.9 }}>Verifique a fundamentação legal e doutrinária dos seus erros.</p>
              <button onClick={() => setViewState("topics")} style={{ marginTop: '1.5rem', background: 'white', color: 'var(--primary)', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                Voltar aos Institutos
              </button>
            </div>
          )}

          {configExamMode && !isExamFinished && (
            <div style={{ background: 'var(--primary-light)', padding: '15px 20px', borderRadius: '12px', border: '1px solid var(--primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 'bold' }}>
                <BookOpenCheck size={20} /> Modo Prova Ativado
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--fg-2)' }}>Respostas ocultadas. Entregue a prova para analisar.</span>
            </div>
          )}

          {currentQuestions.map((q, index) => {
                const uAns = userAnswers[q.id];
                const showExp = Boolean(isExamFinished || (!configExamMode && uAns));
                return (
                  <React.Fragment key={q.id}>
                    <QuestaoCard
                      numero={index + 1}
                      assunto={q.assunto}
                      enunciado={q.enunciado}
                      alternativas={q.alternativas}
                      gabarito={q.gabarito}
                      explicacao={q.explicacao}
                      resposta={uAns}
                      mostrarGabarito={showExp}
                      travado={showExp && !configExamMode}
                      onResponder={(letra) => handleAnswerSelect(q.id, letra)}
                    />
                  </React.Fragment>
                );
              })}

          {!isExamFinished && (
            <button onClick={submitQuiz} className="ui-btn ui-btn--primary" style={{ padding: '15px', fontSize: '1.1rem', margin: '20px auto', display: 'block', maxWidth: '400px', width: '100%', gap: '10px' }}>
              <CheckCircle size={20} /> {configExamMode ? "Entregar Resolução" : "Finalizar Julgamento"}
            </button>
          )}

          {/* GERADOR DE AULA SOBRE OS ERROS */}
          {showLessonAction && (
                <PainelErros
                  titulo="Desembargador de IA"
                  descricao={`Você errou ${wrongCount} questão(ões). Quer um parecer detalhado sobre os institutos que derrubaram você?`}
                  rotuloBotao="Gerar parecer detalhado"
                  onGerar={() => generateLesson(getWrongQuestions())}
                />
              )}
        </div>
      )}

      {/* MODAL DA AULA DE REVISÃO DA IA */}
      <Modal
        open={showLessonModal}
        onClose={() => setShowLessonModal(false)}
        title="Parecer sobre os seus erros"
        subtitle="Gerada a partir das questões que você errou."
        wide
      >
        <Md>{lessonContent}</Md>
      </Modal>

      {/* MODAL DE CONFIGURAÇÃO DE IA COM ABAS (OPENROUTER / AISTUDIO) */}
      {/* MODAL DE ESTATÍSTICAS */}
      <HistoricoModal
        aberto={showStatsModal}
        titulo="Histórico de Noções de Direito"
        materia="Noções de Direito"
        stats={stats}
        onFechar={() => setShowStatsModal(false)}
        onLimpar={() => { saveStats({ total: 0, correct: 0, wrong: 0, topics: {} }); setShowStatsModal(false); }}
      />

      {/* FOOTER DE CRÉDITO DO DESENVOLVEDOR */}
      <div style={{ textAlign: 'center', marginTop: '3rem', paddingBottom: '1rem', color: 'var(--fg-3)', fontSize: '0.85rem' }}>
        Foco na aprovação!
      </div>
      {/* CONFIGURAÇÃO DE IA — painel único, compartilhado com as demais telas */}
      <Modal
        open={showConfig}
        onClose={() => setShowConfig(false)}
        title="Conectar a sua inteligência artificial"
        subtitle="A chave fica na sua conta e vale para todas as ferramentas da plataforma."
      >
        <AiKeyPanel
          userApiKey={userApiKey}
          userModel={userModel}
          onChange={({ apiKey, model }) => { setUserApiKey(apiKey); setUserModel(model); }}
          onFechar={() => setShowConfig(false)}
        />
      </Modal>

      <ConfirmDialog
        open={confirmarEntrega}
        title="Entregar a prova com questões em branco"
        message="Ainda há questões sem resposta neste caderno."
        detail="Itens em branco contam como não respondidos e não entram no cálculo de acertos. Depois de entregar, não é possível voltar e responder."
        confirmLabel="Entregar mesmo assim"
        onConfirm={finalizarProva}
        onCancel={() => setConfirmarEntrega(false)}
      />

      <Toast aviso={aviso} onFechar={() => setAviso(null)} />

    </div>
  );
}