---
name: break
description: Quebra uma spec aprovada em issues, uma por entrega que dá para ver funcionando, cada uma com os critérios de aceite que entrega, as dependências e se é de risco. Use depois que a spec foi aprovada, ou quando a pessoa pedir para quebrar a spec em issues.
argument-hint: <caminho da spec>
---

Você vai quebrar a spec fornecida em issues pequenas e gerenciáveis.

**Spec:** $ARGUMENTS

Antes de qualquer coisa, leia o `AGENTS.md` da raiz do projeto: é a página de
princípios, com as regras sempre ativas, a arquitetura e o fluxo. Se ele não existir,
leia o `CLAUDE.md` da raiz.

> Se o projeto tem a própria versão desta etapa (um command ou skill de mesmo nome no
> `.claude/` do projeto), siga aquela no lugar desta.

**Pastas.** As issues ficam na `pastaIssues` de `.claude/auditor.json` do projeto. Sem
esse arquivo: `pre-desenvolvimento/issues/`.

## O critério de quebra

Cada issue é **uma entrega que dá para ver funcionando** — algo que, pronto, pode ser
aberto, usado ou testado de ponta a ponta.

Não quebre por comportamento isolado. Validar campo, enviar formulário e redirecionar
depois do envio não são três entregas: são três partes de "o formulário funciona".
Quebrar assim multiplica ciclos de agente sem reduzir risco — cada pedaço volta a exigir
o contexto inteiro para ser implementado.

Teste rápido: se a issue, sozinha e pronta, não deixa nada visivelmente melhor para quem
usa o sistema, ela não é uma issue — é um passo dentro de outra.

## O que você deve fazer

1. Leia o arquivo de spec fornecido, incluindo a série (`> série:`), os critérios de
   aceite, as suposições e as perguntas em aberto.
2. Liste as entregas verificáveis que a spec descreve.
3. Para cada página/módulo que precise existir antes, crie uma issue de protótipo.
4. Para cada entrega, crie uma issue de implementação.
5. Distribua os critérios de aceite da spec entre as issues.
6. Marque em cada issue de quais outras ela depende e se é de risco.
7. Salve cada issue como um arquivo `.md` separado dentro de `<pastaIssues>/`.
8. Faça a conferência final (veja "Conferência") e mostre a lista (veja "A lista").

## Nomenclatura dos arquivos

- Protótipos: `<pastaIssues>/[série]-[numero]-prototype-[nome-da-pagina].md`
- Implementações: `<pastaIssues>/[série]-[numero]-[nome-da-entrega].md`

Use a série da spec e números sequenciais com zero à esquerda. Protótipos primeiro.

Exemplos:
- `S3-01-prototype-login.md`
- `S3-02-fazer-login.md`
- `S3-03-recuperar-senha.md`

## Estrutura de cada issue

Crie cada arquivo com este conteúdo:

```markdown
# [Série-Número]: [Título da Issue]

**Tipo:** Protótipo | Implementação
**Página:** [A qual página esta issue pertence]
**Spec:** `[caminho da spec]`
**Depende de:** [issues desta série que precisam estar prontas antes, ou "nenhuma"]
**Risco:** sim | não

## Descrição

[O que precisa ser feito em 1-2 frases diretas]

## Pronto quando

[O que dá para ver funcionando quando esta issue terminar]

## Critérios de aceite

- **CA-[série]-01** (automática) — [título]. Dado [...], quando [...], então [...].
- **CA-[série]-02** (manual) — [título]. Dado [...], quando [...], então [...].

## Suposições

| ID | Suposição | Status | Resolução |
|---|---|---|---|

## Perguntas em aberto

| ID | Pergunta | Status | Resposta |
|---|---|---|---|
```

## Dependências e risco

- **Depende de:** só o que precisa estar pronto antes para esta issue funcionar. Duas
  issues que não dependem uma da outra são **independentes**.
- **Risco:** `sim` quando a issue mexe em autenticação, pagamento, dados sensíveis ou
  migração de banco. Antes do commit de uma issue de risco, a pessoa vê as mudanças.

## Critérios, suposições e perguntas

- Copie o código, o tipo de prova e o texto do critério **como estão na spec**. Não
  crie código novo nem mude a numeração.
- Cada critério de aceite é entregue por **uma única issue**.
- Leve para a issue só as suposições e perguntas da spec que afetam aquela entrega, com
  o mesmo código e o status atual. Sem nenhuma, escreva só `Nenhuma.` na seção.
- Issue de protótipo recebe apenas critérios de prova manual. Sem nenhum, escreva só
  `Nenhum.` na seção Critérios de aceite.
- Um critério que não cabe em nenhuma entrega é sinal de corte errado ou de critério
  mal escrito: avise a pessoa. Não crie uma issue só para ele.

## Conferência

Antes de terminar, confira e mostre o resultado:

- Todo critério de aceite da spec está em exatamente uma issue. Liste os que sobraram
  ou os que apareceram em duas. **Se sobrou critério, o break não terminou.**
- Toda suposição e toda pergunta em aberto da spec está em ao menos uma issue, ou é
  geral demais para uma só e continua valendo pela spec.

Para conferir pelo auditor, rode da raiz do projeto:

```bash
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" serie <série> --sem-rodar
```

Logo depois do break nenhum teste existe ainda, então o veredito sai "não alinhada" por
critério sem teste — é esperado e não se corrige agora. Olhe só critério fora de issue,
critério em duas issues, seção ausente e suposição ou pergunta que deveria ter ido para
alguma issue.

## A lista

Mostre a lista das issues, **só para informar** — não peça aprovação. A pessoa aprovou a
spec; a lista é consequência dela.

| Issue | Entrega | Depende de | Risco |
|---|---|---|---|
| S3-02 | [o que fica funcionando] | nenhuma | não |

Termine dizendo qual é a primeira issue a rodar, com `/anti-vibe:issue <id>`.

## Ordem de criação

1. Todas as issues de **protótipo** primeiro (uma por página/módulo)
2. Depois todas as issues de **implementação** (uma por entrega)

## Regras

- Uma issue = uma entrega verificável, com uma responsabilidade única
- Se a issue não couber num "pronto quando" claro, ela está mal cortada — junte com a
  vizinha ou corte noutro lugar
- Se parecer grande demais para um ciclo, quebre em duas entregas — nunca em fatias que
  só fazem sentido juntas
- Não pule nada da spec: todo comportamento tem que estar dentro de alguma entrega
- Não comece a implementar — apenas crie os arquivos de issue
