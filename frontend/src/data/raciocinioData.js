export const conteudosTeoricosRLM = {
  completo: `
### 📚 Raciocínio Lógico Matemático (CESPE)

Bem-vindo ao material de apoio definitivo! Para dominar o RLM da banca CEBRASPE, você precisa entender a "alma" da banca: o examinador não testa apenas a sua capacidade de memorizar fórmulas, mas sim a sua **interpretação de texto aplicada à lógica estrutural**.

**O Paradigma do CEBRASPE:**
Muitos candidatos reprovam porque tentam analisar as frases usando o "senso comum" ou a "verdade do mundo real". O CESPE explora exatamente essa fraqueza. Na Lógica Formal, não importa o conteúdo da frase, apenas a sua **estrutura**.

**Como usar este guia:**
Selecione um tópico específico no menu lateral do simulado. O resumo focado naquele assunto será carregado aqui, estruturado como uma aula completa contendo:
1. **Conceito & Regra Estrutural:** A matemática fria por trás do tema.
2. **Como a banca cobra:** O vocabulário oculto do examinador.
3. **Macetes e Mnemônicos:** Atalhos mentais para ganhar tempo.
4. **Pegadinhas Clássicas:** Onde a maioria dos candidatos perde o ponto.
5. **Exemplos Práticos:** A aplicação em questões reais.

**Dica de Ouro para Provas Certo/Errado:**
Em RLM, a "Verdade Material" (aquilo que faz sentido na vida real) não importa. Importa a "Verdade Lógica". 
* *Exemplo CESPE:* Se a questão afirmar que "Se o céu é verde, então o mar é feito de café", trate isso como uma estrutura puramente matemática ( P → Q ). Não julgue o mérito da cor do céu. Aceite as premissas como verdades absolutas e julgue a validade da conclusão!
`,

  negacao: `
### 🚫 Negação Lógica (~ ou ¬)

**Conceito:** Negar uma proposição é inverter o seu valor lógico. O que era Verdadeiro vira Falso, e o que era Falso vira Verdadeiro. O CESPE adora pedir para você negar proposições compostas extensas, camuflando os conectivos no meio de textos jurídicos ou policiais.

#### 1. Negação do E ( ∧ ) e do OU ( ∨ ) - Leis de De Morgan
**Regra:** Nega-se TUDO e troca-se o "E" pelo "OU" (e vice-versa).
* **~(P ∧ Q) ≡ ~P ∨ ~Q**
* **~(P ∨ Q) ≡ ~P ∧ ~Q**

> **Como a banca cobra:** Eles usam sinônimos para esconder o "E", como "mas", "porém", "nem" (e não).
> **Pegadinha Clássica:** O CESPE costuma negar a primeira parte, negar a segunda parte, mas **ESQUECE** propositalmente de trocar o conectivo "E" pelo "OU".
> **Exemplo Prático:** > *Proposição:* "O sistema falhou **E** o log foi apagado."
> *Negação Correta:* "O sistema NÃO falhou **OU** o log NÃO foi apagado." 

#### 2. Negação da Condicional ( Se... então → )
**Conceito:** A única forma de provar que uma promessa ("Se... então") é mentira (negá-la) é fazendo a condição acontecer, mas quebrando o resultado.
**Mnemônico:** Regra do **MANÉ** ➔ **MA**ntém a primeira parte **E** **NE**ga a segunda.
* **~(P → Q) ≡ P ∧ ~Q**

> **Pegadinha Clássica:** A banca vai tentar te convencer que a negação de um "Se... então" é outro "Se... então" (ex: Se não P, então não Q). Isso está **ERRADO**. A negação de uma condicional NUNCA mantém o "Se... então". Ela vira um "E".
> **Exemplo Prático:**
> *Proposição:* "Se o servidor trava, então o alarme toca."
> *Negação Correta:* "O servidor trava **E** o alarme NÃO toca."

#### 3. Negação do "OU... OU" (Disjunção Exclusiva) e do "Se e Somente Se" (Bicondicional)
**Regra:** A negação de um é exatamente o outro! Mantenha as frases intactas e apenas troque o conectivo.
* **~(P ⊻ Q) ≡ P ↔ Q** (Negação do Ou... Ou é o Se e Somente Se).

#### 4. Negação de Quantificadores (Todo, Algum, Nenhum)
**Regra de Ouro:** NUNCA se nega um quantificador universal com outro universal (Nunca negue "Todo" com "Nenhum"). Para quebrar uma regra geral, basta **uma exceção**.
* **~(Todo A é B) ≡** Algum A não é B / Pelo menos um A não é B / Existe A que não é B. *(Furar a regra)*
* **~(Algum A é B) ≡** Nenhum A é B / Todo A não é B.
* **~(Nenhum A é B) ≡** Algum A é B / Pelo menos um A é B.

> **Pegadinha Clássica:** Afirmar que a negação de "Todos os policiais são honestos" é "Nenhum policial é honesto". (ERRADO! A negação correta é "Pelo menos um policial não é honesto").
`,

  condicional: `
### ➡️ Condicional (Se... então)

**Conceito:** A condicional (\`P → Q\`) é o conectivo mais cobrado na história do CEBRASPE. Ela estabelece uma relação de causa e efeito, onde a primeira parte (antecedente) é uma condição para que a segunda (consequente) aconteça.

#### A Tabela-Verdade Clássica
Só existe **UMA** situação matemática em que a condicional é FALSA: quando a primeira parte é Verdadeira (a causa aconteceu) e a segunda é Falsa (o efeito falhou).

**Mnemônico:** A famosa **Vera Fischer é Falsa** (V → F = F). Outros usam: **V**ai **F**ugir? **F**errou!

| Condição P (Causa) | Condição Q (Efeito) | Resultado (P → Q) |
| :---: | :---: | :---: |
| V | V | **V** |
| V | F | **F** *(A única Falsa - Vera Fischer)* |
| F | V | **V** |
| F | F | **V** |

> **Análise Didática (A Promessa):**
> Considere a promessa de um pai: *"Se você passar no concurso (P), então te dou um carro (Q)"*.
> * Você passou (V) e ganhou o carro (V) = Ele cumpriu a promessa (**V**).
> * Você passou (V) e NÃO ganhou o carro (F) = Ele quebrou a promessa, mentiu (**F**).
> * Você NÃO passou (F). Como você não cumpriu a sua parte, o pai está livre da obrigação. Se ele te der o carro (V) ou não der (F), ele não quebrou a promessa original, pois a condição de ativação não ocorreu. A promessa continua logicamente válida (**V**).

#### Condição Suficiente vs. Condição Necessária
O CESPE adora remover o "Se... então" e perguntar sobre Suficiência e Necessidade.
**Mnemônico de Posição:** O que vem antes da seta (P) é **S**uficiente. O que vem depois da seta (Q) é **N**ecessário. Lembre-se: **S**eta aponta para o **N**ecessário.
* **P** (O que vem logo após o "Se") = Condição **Suficiente**.
* **Q** (O que vem após o "Então") = Condição **Necessária**.
* *Exemplo:* "Nascer em Fortaleza (Suficiente) é condição para ser Cearense (Necessário)".

#### O Vocabulário Oculto do CESPE (Atenção Máxima!)
A banca quase nunca usa o "Se... então" de forma bonitinha. Ela esconde a seta com sinônimos:
1. **"Sempre que" / "Toda vez que" / "Quando":** Substituem o "Se". (Ex: *Sempre que chove, alaga* = *Se chove, então alaga*).
2. **"Como":** Quando inicia a frase, equivale ao "Se". (Ex: *Como choveu, o chão molhou* = *Se chove, então molha*).
3. **"Pois" / "Porque":** Eles **INVERTEM** a condicional! A causa vem depois. (Ex: *O voo atrasou, pois choveu* = *Se choveu, então o voo atrasou*).
`,

  equivalencia: `
### ⚖️ Equivalência Lógica

**Conceito:** Diferente da Negação (que inverte o valor lógico de V para F), a Equivalência significa dizer **exatamente a mesma coisa**, mas usando palavras ou conectivos diferentes. É como trocar a nota de R$ 10,00 por duas notas de R$ 5,00: a aparência muda, mas o valor é idêntico.

O foco absoluto do CESPE está nas equivalências da Condicional (\`P → Q\`). Dominar as duas regras abaixo garante pelo menos uma questão na sua prova.

#### 1. A Contrapositiva (Cruza Negando)
Esta é a regra top 1 de cobrança em provas do CESPE para carreiras policiais, tribunais e controle.
**Regra:** Mantém-se o conectivo "Se... então". Inverte-se a posição das duas proposições (o que estava no final vai para o começo) e **nega-se ambas**.
* **(P → Q) ≡ (~Q → ~P)**

> **Pegadinha Clássica:** O CESPE costuma apenas inverter as frases, sem negá-las (P → Q vira Q → P). Isso é a "Recíproca" e é um erro lógico brutal! Ou às vezes apenas nega sem inverter. Para estar certo, TEM QUE INVERTER E NEGAR.
> **Exemplo Prático:**
> *Frase Original:* "Se o suspeito fugiu, então ele é culpado." (Fugiu → Culpado)
> *Equivalente Correta:* "Se o suspeito NÃO é culpado, então ele NÃO fugiu." (~Culpado → ~Fugiu)

#### 2. Regra do NEYMAR (Transforma "Se... então" em "OU")
Usada quando a banca pede para transformar uma frase condicional em uma frase com o conectivo "OU" (Disjunção Inclusiva), e vice-versa.
**Mnemônico:** **NE**ga a primeira, troca por **Y** (ou), **MAR**ca (mantém) a segunda.
* **(P → Q) ≡ (~P ∨ Q)**

> **Atenção (Via de Mão Dupla):** O CESPE pode te dar uma frase com "OU" e pedir a equivalência. É só aplicar a regra voltando: Nega a primeira, troca por "Se... então", mantém a segunda. (Ex: *Estudo OU reprovo* ≡ *Se NÃO estudo, então reprovo*).
> **Exemplo Prático:**
> *Frase Original:* "Se estudo muito, então serei nomeado."
> *Equivalente Correta:* "NÃO estudo muito **OU** serei nomeado."

#### 3. Equivalências da Conjunção (E) e Disjunção (OU)
* **Propriedade Comutativa:** A ordem dos fatores não altera o resultado.
* (P ∧ Q) ≡ (Q ∧ P) ➔ "Chove e venta" é o mesmo que "Venta e chove".
* (P ∨ Q) ≡ (Q ∨ P) ➔ "Canto ou danço" é o mesmo que "Danço ou canto".
* *Cuidado:* Isso NÃO vale para o "Se... então"! (Se nasço em SP, sou brasileiro ≠ Se sou brasileiro, nasço em SP).
`,

  diagramas: `
### ⭕ Diagramas Lógicos e Proposições Categóricas

**Conceito:** Diagramas Lógicos (Círculos de Euler) são representações visuais que facilitam a resolução de problemas envolvendo as chamadas "Proposições Categóricas": TODO, ALGUM e NENHUM.

**Dica de Prova (Regra de Ouro):** Na prova do CESPE, **NUNCA tente resolver silogismos apenas lendo**. Seu cérebro vai te trair. Desenhe os círculos no canto da prova. Sempre desenhe o cenário "menos comprometedor" (com menos intersecções possíveis, a não ser que a regra obrigue).

#### 1. O Diagrama do TODO (Inclusão / Subconjunto)
* **Afirmação:** "Todo A é B."
* **Desenho:** O círculo A fica inteiramente dentro do círculo B.
* **Leitura Reversa:** Dizer que "Todo A é B" equivale logicamente a dizer "Se é A, então é B" (P → Q).
* **Pegadinha Clássica:** O CESPE afirma que, já que "Todo Policial é Servidor Público", então "Todo Servidor Público é Policial". ERRADO. A recíproca não é verdadeira.

#### 2. O Diagrama do ALGUM (Intersecção)
* **Afirmação:** "Algum A é B."
* **Sinônimos CESPE:** Pelo menos um A é B / Existe A que é B / Há A que é B.
* **Desenho:** Dois círculos que se cruzam. A área de intersecção é onde a mágica acontece.
* **Propriedade:** O "Algum" é recíproco! Dizer que "Algum A é B" garante 100% que "Algum B é A".

#### 3. O Diagrama do NENHUM (Disjunção / Exclusão)
* **Afirmação:** "Nenhum A é B."
* **Desenho:** Dois círculos completamente separados, em ilhas diferentes.
* **Propriedade:** O "Nenhum" também é recíproco! Dizer que "Nenhum homem é imortal" é idêntico a dizer "Nenhum imortal é homem".

#### Como o CESPE cobra misturando os três:
> **Exemplo de Questão:**
> *Premissa 1:* "Nenhum A é B." (Desenhe A e B separados).
> *Premissa 2:* "Algum B é C." (Desenhe o C cortando o B, mas **evite** cortar o A no desenho).
> *Conclusão da Banca:* "Portanto, é correto afirmar que, obrigatoriamente, Nenhum A é C."
> **Resolução:** ERRADO. Pelo seu desenho, C corta B, mas não sabemos até onde o círculo de C se expande. Ele *pode* encostar em A, ou *pode não* encostar. Como a Lógica exige certeza absoluta (100%), se algo é "apenas possível", a questão é dada como ERRADA no CESPE.
`,

  argumentacao: `
### ⚖️ Argumentação Lógica (Validade)

**Conceito:** Um argumento é um conjunto de frases composto por **Premissas** (informações dadas como ponto de partida) e uma **Conclusão** (o destino final que tentamos provar). 
O CESPE não quer saber se a conclusão é verdadeira na vida real. Ele quer saber se o argumento é **Válido** (se a estrutura lógica sustenta a conclusão) ou **Inválido/Falacioso**.

* **Argumento Válido:** Se assumirmos que todas as premissas são Verdadeiras, a conclusão **obrigatoriamente** (100% das vezes) terá que ser verdadeira.
* **Argumento Inválido (Falácia):** Mesmo que todas as premissas sejam verdadeiras, existe pelo menos UMA possibilidade de a conclusão ser falsa.

#### Método 1: O "Chute da Verdade" (Conclusão Forçada) - O Mais Usado
Ideal para argumentos que têm premissas simples.
1. **Assuma o controle:** Escreva (V) na frente de todas as premissas.
2. **Procure a âncora:** Busque uma proposição simples (ex: "João é investigador") ou uma premissa ligada pelo conectivo "E" (no "E", a única forma de dar Verdade é se ambas as partes forem V).
3. **Efeito Dominó:** Use a verdade que você descobriu no passo 2 para alimentar as outras premissas de baixo para cima. Lembre-se: em condicionais (Se... então), você não pode deixar formar a *Vera Fischer* (V → F)! Se o final da condicional for F, o começo terá que ser F para manter a premissa válida.
4. **O Teste Final:** Pegue os valores descobertos e jogue na Conclusão. Deu (V)? O argumento é Válido. Deu (F)? O argumento é Inválido.

#### Método 2: Redução ao Absurdo (O Hacker do CESPE)
Ideal quando a Conclusão é uma proposição simples (ex: "Portanto, Maria não passou") e não há proposições simples nas premissas para começar o Método 1.
1. **O Desafio:** Force a Conclusão a ser **FALSA** (inverta o que ela diz).
2. **Suba para as premissas:** Mantendo as premissas como (V), substitua os valores usando essa conclusão falsa que você forçou.
3. **Análise do Colapso:** - Se, ao resolver, gerar um conflito/absurdo (ex: uma premissa der Vera Fischer e quebrar a regra de ser V), significa que era IMPOSSÍVEL a conclusão ser falsa. Logo, o argumento é **VÁLIDO**.
   - Se tudo se encaixar perfeitamente sem gerar contradições, significa que a premissa aceita uma conclusão falsa. Logo, o argumento é **INVÁLIDO**.
`,

  probabilidade: `
### 🎲 Probabilidade

**Conceito:** A probabilidade é a mensuração matemática da chance de um evento (aquilo que eu quero) ocorrer dentro de um espaço amostral (tudo que pode acontecer). O CESPE costuma cobrar textos longos misturando probabilidade com análise de tabelas.

#### 1. A Fórmula Clássica ("Quero / Tudo")
**P = Eventos Favoráveis (O que eu quero) / Espaço Amostral (Total de possibilidades)**
> *Exemplo Básico:* Qual a chance de tirar um ÁS num baralho de 52 cartas? 
> Existem 4 ases (Quero). Total de 52 cartas (Tudo). P = 4/52, simplificando = 1/13.

#### 2. Eventos Sucessivos (A Regra do "E" e do "OU")
É aqui que o CESPE separa os aprovados dos reprovados.
* **Regra do "E" (Multiplicação):** Usada quando você quer que o evento A aconteça **E** o evento B aconteça logo em seguida (ou simultaneamente).
  * *Fórmula:* P(A ∩ B) = P(A) × P(B)
  * *Dica:* A preposição "E" significa multiplicar (*vEzes*).
* **Regra do "OU" (Adição):** Usada quando você quer que UM evento aconteça **OU** o outro, não importa qual.
  * *Fórmula:* P(A ∪ B) = P(A) + P(B) - P(Intersecção)
  * *Atenção:* Se for impossível os dois acontecerem juntos (eventos mutuamente exclusivos), a intersecção é zero.

#### 3. A Pegadinha Magna do CESPE: Reposição vs. Sem Reposição
Leia o texto da prova com lupa! Se a questão fala em sortear peças de uma caixa, verificar processos em uma gaveta ou prender suspeitos sucessivamente:
* **Com Reposição (Eventos Independentes):** O total (denominador) continua o mesmo sempre. Se eu devolvi a bola, a caixa continua com 10.
* **Sem Reposição (Eventos Dependentes):** A cada evento, o espaço amostral DIMINUI. 
  * *Exemplo CESPE:* "Ao sortear 2 armas de um lote de 10 onde 2 são defeituosas, sem reposição...". A chance de tirar defeituosa na 1ª é 2/10. Na 2ª tirada, só restaram 9 armas no total e 1 defeituosa. A chance passa a ser 1/9! A chance final é (2/10) * (1/9).

#### 4. O Macete do "Pelo Menos Um"
Sempre que a questão perguntar "Qual a probabilidade de ocorrer **pelo menos um** (acerto, defeito, chuva)...":
* **Caminho Lento:** Calcular a chance de dar 1, depois de dar 2, depois de dar 3... e somar tudo. (Vai acabar o tempo da prova).
* **Caminho Ninja (Complementar):** Calcule a probabilidade de **NÃO OCORRER NENHUM** e subtraia de 100% (ou de 1).
  * *P(Pelo menos um) = 1 - P(Nenhum)*
`,

  combinatoria: `
### 🔢 Análise Combinatória

**Conceito:** A arte de contar agrupamentos sem precisar enumerá-los um a um. O pesadelo de muitos candidatos se resolve com uma única pergunta chave logo após ler a missão que a questão exige: **"A ORDEM DOS ELEMENTOS IMPORTA?"**

#### 1. A ORDEM IMPORTA? ➔ Aham! (ARRANJO / Princípio Fundamental da Contagem)
Se você trocar a ordem dos escolhidos e isso gerar um resultado NOVO/DIFERENTE (ex: senhas bancárias, pódio 1º/2º/3º, placa de carro, presidente e vice), usamos Arranjo.
* **Fórmula:** A(n,p) = n! / (n - p)!
* **Macetão de Prova:** Esqueça a fórmula. Use o **PFC (Tracinhos)**. Desenhe a quantidade de vagas e multiplique as opções.
* *Exemplo:* Senha de 3 dígitos distintos com 10 números disponíveis.
  * _ (10 opções para o 1º dígito) × _ (9 para o 2º) × _ (8 para o 3º) = 720 possibilidades.

#### 2. A ORDEM IMPORTA? ➔ Não! (COMBINAÇÃO)
Se mudar a ordem gera EXATAMENTE O MESMO GRUPO (ex: comissão de 3 pessoas, dupla de plantão, suco de duas frutas, jogo de loteria), usamos Combinação. A banca CESPE ama isso!
* **Fórmula Clássica:** C(n,p) = n! / [ p! × (n - p)! ]
* **Macete Matador do CESPE (Decréscimo):** Para calcular C(5,2) - ou seja, formar duplas com 5 pessoas - não perca tempo com a fórmula gigante. 
  * Passo 1: Olhe para o menor número (2). Ele manda o maior número (5) "cair" duas casas. (Fica 5 × 4).
  * Passo 2: Divida o resultado pelo fatorial do menor número (2! que é 2 × 1).
  * Resultado: (5 × 4) / 2 = 10. Direto ao ponto!
* **Pegadinha da Restrição:** O CESPE costuma dizer: "Em um setor há 5 homens e 4 mulheres. Quantas comissões de 3 pessoas podem ser formadas garantindo que **exatamente 1 seja mulher**?". Você deve quebrar o problema em dois: Combinação de homens (escolher 2 dos 5) "E" Combinação de mulheres (escolher 1 das 4). Multiplique os dois resultados!

#### 3. Permutação (Usando TODOS os elementos disponíveis)
Quando você tem N espaços e N pessoas/letras para preencher TODOS eles. Não há "escolha" de quem entra, apenas troca de lugares (ex: Filas, Anagramas).
* **Permutação Simples:** P(n) = n! (Ex: Fila com 5 pessoas = 5! = 120).
* **Permutação com Repetição (Anagramas CESPE):** Se a palavra tiver letras repetidas (ex: BATATA - 6 letras, três 'A', dois 'T').
  * **Regra:** Divida o total de letras pelo fatorial de CADA repetição: 6! / (3! × 2!).
* **Permutação Circular:** Quando as pessoas sentam ao redor de uma mesa redonda.
  * **Regra:** P = (n - 1)! (Fica 1 a menos porque a mesa não tem início nem fim, alguém precisa ser o referencial "fixo").
`,

  sequencias: `
### 📈 Sequências Lógicas

**Conceito:** No CESPE, questões de sequências não testam apenas a memorização de fórmulas matemáticas, exigem que você seja um verdadeiro investigador buscando o padrão oculto, seja de repetição de figuras, letras ou progressões numéricas.

#### 1. As Progressões Matemáticas Clássicas
* **Progressão Aritmética (PA):** Soma-se (ou subtrai-se) um valor constante, chamado Razão (r).
  * *Ex:* 2, 5, 8, 11... (Razão r = +3)
  * *Termo Geral (Para achar qualquer número lá na frente):* $a_n = a_1 + (n - 1)r$
* **Progressão Geométrica (PG):** Multiplica-se (ou divide-se) um valor constante (q).
  * *Ex:* 3, 6, 12, 24... (Razão q = ×2)
  * *Termo Geral:* $a_n = a_1 \\cdot q^{(n - 1)}$

#### 2. Padrões Ocultos do CEBRASPE (Onde a banca tenta te reprovar)
A banca gosta de criar padrões que não são simples PAs ou PGs, exigindo pensamento lateral.
* **O Salto Duplo (Intercalação):** Se a sequência parece aleatória, sem padrão de soma ou multiplicação claro (ex: 2, 10, 4, 8, 6, 6...), a dica é analisar **pulando um número**. 
  * Analise o 1º, 3º e 5º termos: (2, 4, 6... é uma PA de +2).
  * Analise o 2º, 4º e 6º termos: (10, 8, 6... é uma PA de -2).
* **Sequência de Fibonacci:** O próximo número é a soma dos DOIS anteriores. (Ex: 1, 1, 2, 3, 5, 8, 13...). Tem despencado em provas da PF e PRF.
* **Transformação Letra-Número:** Se a sequência for alfabética (ex: A, C, F, J...), não perca tempo cantando o alfabeto na cabeça. Escreva os números correspondentes: (A=1, C=3, F=6, J=10). O salto visual numérico salta aos olhos (+2, +3, +4).
* **Padrões de Palavras:** Às vezes não é matemática. (Ex: Dois, Tres, Quatro, Cinco, Seis... qual o próximo?). Resposta: A regra é a letra inicial: D, T, Q, C, S (Dias da semana? Não, D S T Q Q S S... são números, os próximos que comecem com Sete, Oito). O CESPE adora relacionar letras iniciais com meses do ano ou dias da semana.

> **Plano de Ação na Hora da Prova:**
> Diante de uma sequência numérica desconhecida, siga esta ordem de ataque rígida para não perder tempo:
> 1. Escreva embaixo de cada par a diferença (subtração) entre eles. Veja se esses resultados formam um padrão (+2, +4, +6...).
> 2. Se a diferença falhar, veja a divisão entre eles (em busca da PG).
> 3. Se crescer e diminuir subitamente, desconfie de sequências intercaladas (salto duplo).
> 4. Se não fizer sentido algum, avalie propriedades dos números (são todos primos? são quadrados perfeitos: 1, 4, 9, 16, 25?).
`
};