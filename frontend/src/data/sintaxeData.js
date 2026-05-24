// frontend/src/data/sintaxeData.js

export const aulasData = [
  {
    id: 1,
    categoria: "Sintaxe da Oração (Período Simples)",
    frequencia: 4,
    title: "Sujeito e Predicado",
    descricao: "Os termos essenciais da oração. Entenda a base da sintaxe e suas inversões.",
    ia_focus: "Foque em sujeitos pospostos ao verbo (ordem inversa), sujeitos oracionais e distinção entre partícula apassivadora 'se' e índice de indeterminação do sujeito.",
    def: "O **Sujeito** é o termo sobre o qual se faz uma declaração. O **Predicado** é a declaração feita sobre o sujeito (tudo o que resta na frase quando tiramos o sujeito e o vocativo).\n\n*Exemplo Prático:* Em 'O sistema travou', **'O sistema'** é o sujeito (de quem se fala) e **'travou'** é o predicado (o que se declara sobre ele).",
    deep: "Na análise sintática, a relação entre esses termos segue regras estritas:\n\n- **Concordância Obrigatória:** O verbo (que fica no predicado) deve SEMPRE concordar em número e pessoa com o núcleo do sujeito.\n- **Núcleo do Sujeito:** É a palavra principal, geralmente um substantivo ou pronome, sem preposição.\n- **A Estrutura do Predicado:** Obrigatoriamente contém um verbo ou locução verbal. Se o verbo for impessoal (como chover), a oração inteira será apenas predicado.",
    examples: [
      "A **auditoria** do código-fonte (Sujeito) **revelou** vulnerabilidades (Predicado). \n\n*Comentário:* O verbo **'revelou'** concorda diretamente com o núcleo do sujeito **'auditoria'** (singular).",
      "**Ocorreram falhas críticas** de segurança durante o teste de intrusão. \n\n*Comentário:* Ordem inversa comum no CESPE. O predicado (**Ocorreram**) vem antes do sujeito (**falhas críticas**). O verbo vai ao plural para concordar com 'falhas'."
    ],
    cespeTip: "O CESPE adora colocar o **sujeito no final da frase** (ordem inversa) ou separá-lo do verbo por várias vírgulas e adjuntos adverbiais longos para confundir a concordância.",
    trap: "Cuidado com o pronome 'SE'. Na passiva sintética ('Executaram-se os processos'), 'os processos' é o sujeito e obriga o verbo ao plural. Já no índice de indeterminação ('Precisa-se de analistas'), o verbo fica sempre no singular!"
  },
  {
    id: 2,
    categoria: "Sintaxe da Oração (Período Simples)",
    frequencia: 5,
    title: "Verbos (Transitividade e Ligação)",
    descricao: "Aprenda a analisar a exigência do verbo (regência básica e mudanças de sentido).",
    ia_focus: "Foque na mudança de transitividade e semântica de verbos clássicos de prova: assistir, aspirar, visar, implicar e proceder em contextos formais e administrativos.",
    def: "A transitividade verbal indica se o verbo exige ou não complemento para ter sentido completo. O verbo de ligação serve apenas para unir o sujeito a um estado ou característica.\n\n*Exemplo Prático:* Em 'O erro **permaneceu** oculto', temos um estado (Verbo de Ligação). Já em 'O analista **corrigiu** o erro', temos uma ação que exige alvo (Verbo Transitivo).",
    deep: "A classificação dos verbos dita a estrutura dos complementos da oração:\n\n- **Verbos Intransitivos (VI):** Têm sentido completo por si sós (ex: O servidor *caiu*).\n- **Verbos Transitivos Diretos (VTD):** Exigem complemento SEM preposição (ex: *Comprar* equipamentos).\n- **Verbos Transitivos Indiretos (VTI):** Exigem complemento COM preposição obrigatória (ex: *Precisar* de foco).\n- **Verbos Transitivos Diretos e Indiretos (VTDI):** Pedem dois alvos ao mesmo tempo (ex: *Entregar* o relatório ao chefe).\n- **Verbos de Ligação (VL):** Indicam apenas estado (ex: ser, estar, parecer, permanecer).",
    examples: [
      "O servidor do banco de dados **caiu**. (VI) \n\n*Comentário:* O verbo **'caiu'** encerra o sentido da ação. Não há 'caiu o quê?'.",
      "A falha na rede **implicou perda** de dados. (VTD) \n\n*Comentário:* No sentido de acarretar/gerar, **'implicou'** é VTD e exige objeto direto (**perda**). O uso da preposição 'em' (implicou *na* perda) é um ERRO crasso.",
      "O analista **assistiu ao treinamento** de forense digital. (VTI) \n\n*Comentário:* No sentido de ver/presenciar, o verbo **'assistiu'** exige a preposição **'a'**, ligando-se ao objeto indireto (**ao treinamento**)."
    ],
    cespeTip: "O CESPE explora a dupla transitividade. O verbo 'assistir' no sentido de ajudar é VTD (O técnico assistiu o usuário). No sentido de ver, é VTI (Assistiu ao monitoramento).",
    trap: "Verbos que tradicionalmente indicam estado podem virar intransitivos se indicarem localização ou ação circunstancial. Ex: 'O backup está no servidor.' (Aqui 'estar' não é ligação, e sim intransitivo com adjunto adverbial de lugar)."
  },
  {
    id: 3,
    categoria: "Sintaxe da Oração (Período Simples)",
    frequencia: 4,
    title: "Objeto Direto e Indireto",
    descricao: "Os complementos verbais que fecham o sentido da oração e a substituição pronominal.",
    ia_focus: "Cobre fortemente a substituição pronominal correta (o/a/os/as vs lhe/lhes) e a identificação de objetos diretos preposicionados em estruturas complexas.",
    def: "São os termos que completam o sentido dos verbos transitivos. O **Objeto Direto (OD)** liga-se ao verbo sem preposição. O **Objeto Indireto (OI)** liga-se ao verbo com preposição obrigatória.\n\n*Exemplo Prático:* Em 'Instalou **o software** (OD)', o alvo não tem preposição. Em 'Respondeu **ao chamado** (OI)', o alvo exige a preposição 'a'.",
    deep: "Os complementos verbais são fundamentais para o uso correto dos pronomes oblíquos:\n\n- **Objeto Direto (OD):** Sofre a ação verbal diretamente. Responde às perguntas 'o quê?' ou 'quem?'.\n- **Objeto Indireto (OI):** Completa o verbo mediado por preposição. Responde a 'a quê?', 'de quem?', 'para quem?'.\n- **Substituição Pronominal Padrão:** O pronome **o/a/os/as** substitui exclusivamente Objetos Diretos. Os pronomes **lhe/lhes** substituem exclusivamente Objetos Indiretos (geralmente pessoas).",
    examples: [
      "O script de automação substituiu **as rotinas** manuais. (OD) \n\n*Comentário:* Substituiu o quê? O complemento **'as rotinas'** se liga sem preposição (o 'as' aqui é apenas artigo). Para substituir por pronome: O script substituiu-**as**.",
      "O sistema obedeceu **aos novos protocolos** de criptografia. (OI) \n\n*Comentário:* Quem obedece, obedece 'a' algo. O complemento **'aos novos protocolos'** possui a preposição 'a' exigida pela regência do verbo.",
      "O administrador concedeu **permissão (OD)** **ao usuário (OI)**. \n\n*Comentário:* Verbo que exige dois complementos. Concedeu o quê? **permissão**. A quem? **ao usuário**."
    ],
    cespeTip: "Substituição pronominal é questão certa. CESPE vai tentar te induzir ao erro sugerindo: 'O script substituiu-lhes' (ERRADO, pois 'rotinas' é OD. O certo é 'O script substituiu-as').",
    trap: "Objeto Direto Preposicionado. Às vezes o OD ganha preposição por clareza ou estilo. Ex: 'Enganou a todos com o phishing.' ('a todos' é OD preposicionado. O CESPE dirá que é Objeto Indireto para te enganar)."
  },
  {
    id: 4,
    categoria: "Sintaxe da Oração (Período Simples)",
    frequencia: 5,
    title: "Adjunto Adnominal e Adverbial",
    descricao: "Os termos acessórios que detalham nomes e as circunstâncias das ações (vírgula obrigatória).",
    ia_focus: "Foque estritamente no deslocamento do adjunto adverbial, obrigatoriedade da vírgula e na alteração de sentido versus manutenção da correção gramatical.",
    def: "**Adjunto Adnominal** caracteriza, determina ou restringe um substantivo. **Adjunto Adverbial** modifica um verbo, adjetivo ou advérbio, indicando circunstância.\n\n*Exemplo Prático:* Em 'O **novo** firewall bloqueou o ataque **rapidamente**', a palavra 'novo' detalha a máquina (Adnominal), e 'rapidamente' mostra o modo como a ação ocorreu (Adverbial).",
    deep: "As bancas cobram a distinção entre a natureza destes dois termos acessórios:\n\n- **Regras do Adjunto Adnominal:** SEMPRE se refere a um substantivo. Tem natureza interna ao grupo nominal. Pode ter valor ativo (pratica a ação) ou indicar posse.\n- **Regras do Adjunto Adverbial:** Exprime circunstâncias (tempo, modo, lugar, causa). Possui alta mobilidade na frase. Quando deslocado para o início da oração, exige regras estritas de pontuação (vírgula).",
    examples: [
      "**Dois** desenvolvedores **sêniores** corrigiram a falha. \n\n*Comentário:* As palavras **'Dois'** e **'sêniores'** limitam e qualificam diretamente o substantivo central 'desenvolvedores' (são adjuntos adnominais).",
      "Eles compilaram o código **ontem** **no servidor de produção**. \n\n*Comentário:* **'ontem'** indica a circunstância de tempo, e **'no servidor de produção'** a circunstância de lugar. Modificam a ação de compilar (são adjuntos adverbiais).",
      "A perícia **do especialista** foi rápida. \n\n*Comentário:* O termo **'do especialista'** indica posse/agente (a perícia pertence ou foi feita por ele). Logo, é um adjunto adnominal."
    ],
    cespeTip: "O CESPE ama deslocar adjuntos adverbiais de tempo e lugar para o início da frase e perguntar sobre a vírgula. Adjuntos adverbiais longos (3 ou mais palavras) deslocados têm vírgula obrigatória. Curtos (1 a 2 palavras) a vírgula é facultativa.",
    trap: "Confundir Adjunto Adnominal com Complemento Nominal. A banca sempre inverte os conceitos. Lembre-se: Se o termo preposicionado pratica a ação (valor ativo) ou tem ideia de posse, é Adnominal."
  },
  {
    id: 5,
    categoria: "Sintaxe da Oração (Período Simples)",
    frequencia: 5,
    title: "Complemento Nominal e Predicativo",
    descricao: "O alvo da ação dos nomes abstratos e as características de estado.",
    ia_focus: "Foque na diferença sutil entre Adjunto Adnominal e Complemento Nominal usando substantivos abstratos derivados de verbos (ex: construção, combate, invenção). Exija a identificação de valor ativo vs passivo.",
    def: "**Complemento Nominal (CN)** completa o sentido de um substantivo abstrato, adjetivo ou advérbio, sempre COM preposição. **Predicativo** é a característica/estado.\n\n*Exemplo Prático:* Em 'A leitura **do disco**', o disco sofre a leitura (Complemento Nominal, passivo). Em 'O disco está **corrompido**', atribui-se um estado a ele (Predicativo).",
    deep: "Para não perder pontos com classificações avançadas:\n\n- **Complemento Nominal (Alvo Passivo):** Apenas se liga a substantivos abstratos (derivados de ação), adjetivos e advérbios. Ele NUNCA pratica a ação, ele é o alvo (Ex: A construção *do prédio* - o prédio foi construído).\n- **Predicativo do Sujeito:** Atribui qualidade/estado ao sujeito, geralmente acompanhando verbos de ligação.\n- **Predicativo do Objeto:** Atribui qualidade/estado ao objeto (Ex: O juiz julgou o réu *inocente*).",
    examples: [
      "A corporação manteve a confiança **no sistema de criptografia**. (CN) \n\n*Comentário:* Completa o sentido do substantivo abstrato 'confiança'. O sistema **sofre a ação** de ser o alvo da confiança (paciente).",
      "O juiz considerou o laudo técnico **inconclusivo**. (Predicativo do Objeto) \n\n*Comentário:* A palavra **'inconclusivo'** é uma característica momentânea atribuída pelo juiz ao objeto direto 'o laudo técnico'.",
      "Os policiais retornaram da diligência **exauridos**. (Predicativo do Sujeito) \n\n*Comentário:* **'exauridos'** caracteriza o estado do sujeito (policiais), mas ligado por um verbo de ação (retornaram). Forma-se um predicado verbo-nominal."
    ],
    cespeTip: "Quando o termo preposicionado estiver ligado a um Adjetivo ou Advérbio, marque Complemento Nominal sem medo. Ex: 'O software é compatível COM WINDOWS' (CN do adjetivo). 'Agiu favoravelmente AO RÉU' (CN do advérbio).",
    trap: "A pegadinha mortal do CESPE: 'A investigação DA POLÍCIA' (Adjunto Adnominal, pois a polícia investiga = ativo) vs 'A investigação DOS FATOS' (Complemento Nominal, pois os fatos são investigados = passivo)."
  },
  {
    id: 6,
    categoria: "Sintaxe do Período (Período Composto)",
    frequencia: 5,
    title: "Orações: Principal e Subordinadas",
    descricao: "Análise sintática e pontuação do período composto por subordinação.",
    ia_focus: "Foque pesadamente na diferença entre orações adjetivas restritivas e explicativas, alteração de sentido com a retirada da vírgula, e no uso do 'que' como conjunção integrante vs pronome relativo.",
    def: "A **Oração Principal** é a base do período que possui dois ou mais verbos. As **Subordinadas** dependem sintaticamente dela, funcionando como um bloco (substantivo, adjetivo ou advérbio).\n\n*Exemplo Prático:* Em '[O perito afirmou] (Principal) [que o arquivo era falso] (Subordinada)', a segunda oração atua inteira como o objeto direto da primeira.",
    deep: "A subordinação é a base para a interpretação de textos complexos:\n\n- **Subordinadas Substantivas:** Assumem funções de sujeito ou objeto da principal. Dica de ouro: podem ser inteiramente substituídas pela palavra **'ISSO'**.\n- **Subordinadas Adjetivas:** Caracterizam termos anteriores. Introduzidas por pronomes relativos (que, o qual). Dividem-se em *Explicativas* (com vírgula) e *Restritivas* (sem vírgula).\n- **Subordinadas Adverbiais:** Indicam circunstâncias (Causa, Condição, Tempo, Concessão). Introduzidas por conjunções subordinativas (embora, se, porque).",
    examples: [
      "É fundamental **que os backups sejam criptografados**. (Substantiva Subjetiva) \n\n*Comentário:* É fundamental **ISSO**. Toda a oração atua como o sujeito do verbo 'É'.",
      "O servidor, **que estava com defeito**, foi substituído. (Adjetiva Explicativa) \n\n*Comentário:* **Com vírgulas**. Explica uma característica única (dá a entender que só havia um servidor, e ele estava com defeito).",
      "O servidor **que estava com defeito** foi substituído. (Adjetiva Restritiva) \n\n*Comentário:* **Sem vírgulas**. Restringe o sentido do grupo (dentre vários servidores, apenas o defeituoso foi trocado)."
    ],
    cespeTip: "Retirar as vírgulas de uma oração subordinada adjetiva explicativa mantém a correção gramatical do texto, mas ALTERA O SENTIDO original. O CESPE faz essa exata afirmação em quase todas as provas.",
    trap: "Confundir o 'QUE' conjunção integrante com o 'QUE' pronome relativo. Tente trocar a oração toda por 'ISSO' (se der certo = conjunção integrante). Tente trocar o 'QUE' por 'o qual / os quais' (se der certo = pronome relativo)."
  },
  {
    id: 7,
    categoria: "Sintaxe e Semântica",
    frequencia: 5,
    title: "Concordância e Regência",
    descricao: "A harmonia de flexão e a subordinação de preposições entre os termos.",
    ia_focus: "Exija análises de concordância com sujeito partitivo, verbos impessoais (haver/fazer indicando tempo), sujeito composto posposto ao verbo e regência com pronomes relativos (a que, de que, com que).",
    def: "**Concordância** é a adaptação de número e pessoa entre termos. **Regência** é a exigência de preposição feita por um termo.\n\n*Exemplo Prático:* Concordância: 'Os logs **indicam**' (plural com plural). Regência: 'Ter acesso **ao** sistema' (o nome 'acesso' exige a preposição 'a').",
    deep: "Estas regras representam o maior volume de erros em provas de redação:\n\n- **Regra Geral de Concordância Verbal:** O verbo concorda sempre com o NÚCLEO do sujeito. Atenção absoluta aos verbos impessoais (fazer/haver indicando tempo ou existir), que não têm sujeito e ficam estagnados na 3ª pessoa do singular.\n- **Regra Geral de Regência:** A preposição exigida pelo termo regente não pode ser suprimida, mesmo em frases longas ou quando mediada por pronomes relativos (ex: A lei *a que* me referi).",
    examples: [
      "Fazem dez dias que o acesso foi bloqueado. (ERRO) -> **Faz** dez dias. \n\n*Comentário:* Verbo **'fazer'** indicando tempo decorrido é impessoal, devendo ficar estritamente no singular.",
      "A maior parte dos usuários **acessou / acessaram** a rede. \n\n*Comentário:* Sujeito partitivo (a maioria de, parte de). O verbo pode concordar com o núcleo **'parte' (acessou)** ou com o especificador plural **'usuários' (acessaram)**.",
      "O framework **a que** me referi foi descontinuado. \n\n*Comentário:* Regência do verbo referir: quem se refere, se refere **'a'** algo. A preposição deve, obrigatoriamente, ser deslocada para antes do pronome relativo."
    ],
    cespeTip: "Sujeito composto posposto ao verbo: 'Falhou o banco de dados e o firewall'. Quando o sujeito vem depois, o verbo pode concordar atrativamente com o mais próximo (Falhou) ou ir para o plural lógico (Falharam). A banca sempre cobra essa dupla possibilidade.",
    trap: "Na regência verbal, o CESPE engole preposições antes de pronomes relativos na escrita para testar sua leitura dinâmica. 'Os relatórios QUE o diretor precisa estão prontos'. (ERRADO! Quem precisa, precisa DE algo. Correto: Os relatórios DE QUE o diretor precisa...)"
  }
];