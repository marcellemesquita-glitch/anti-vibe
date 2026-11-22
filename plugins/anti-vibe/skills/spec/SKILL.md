---
name: spec
description: Cria a spec de uma mudança arquitetural, com série, comportamentos, critérios de aceite com código e tipo de prova, suposições e perguntas em aberto. Use depois que a triagem classificou a tarefa como arquitetural, ou quando a pessoa pedir para escrever uma spec.
argument-hint: <descrição da mudança>
---

Você é especialista em arquitetura de software. Sua tarefa é criar uma spec detalhada
da mudança descrita abaixo.

**Projeto:** $ARGUMENTS

Antes de qualquer coisa, leia o `AGENTS.md` da raiz do projeto: é a página de
princípios, com as regras sempre ativas, a arquitetura e o fluxo. Se ele não existir,
leia o `CLAUDE.md` da raiz.

> Se o projeto tem a própria versão desta etapa (um command ou skill de mesmo nome no
> `.claude/` do projeto), siga aquela no lugar desta.

**Pastas.** Specs ficam na `pastaSpecs` e issues na `pastaIssues` de
`.claude/auditor.json` do projeto. Sem esse arquivo: `pre-desenvolvimento/` e
`pre-desenvolvimento/issues/`.

## O que você deve fazer

1. Leia a descrição acima
2. Leia as lições do projeto (veja "Lições")
3. Escolha e reserve a série (veja "Série")
4. Crie o arquivo `<pastaSpecs>/spec-[nome-curto].md` com a estrutura abaixo
5. Pergunte na hora o que depender de decisão da pessoa e grave a resposta na spec

A spec descreve **a mudança**, não o estado final do sistema. Quando a mudança entra no
ar, a spec vai para a `pastaSpecsArquivadas` da configuração (sem ela,
`docs/specs-arquivadas/`).

## Lições

Antes de escrever, rode, da raiz do projeto:

```bash
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" licao listar
```

São no máximo dez regras que nasceram de falhas reais de séries anteriores, as
recorrentes na frente. Aplique as que tocam esta mudança ao escrever os critérios de
aceite e as suposições. Não cite a lição na spec; só não repita o erro.

## Série

Toda spec tem uma série (ex.: `S3`), que dá nome às issues e aos códigos.

1. Leia a tabela de `<pastaIssues>/README.md` e as pastas `<pastaIssues>/concluidas_*`.
2. Escolha a próxima série livre. Se a que você ia usar já existe, pule para a seguinte
   e diga qual escolheu.
3. Acrescente a linha da série na tabela do README **agora**, antes de escrever a spec.
   É isso que reserva o número e impede duas séries iguais.

Projeto ainda sem `<pastaIssues>/README.md`: crie-o com uma tabela
`| Série | Spec | Pasta de concluídas |` e comece pela série `S1`.

## Códigos de rastreio

| Código | Nome | O que é |
|---|---|---|
| `CA-<série>-<nn>` | critério de aceite | Resultado que dá para observar e conferir |
| `SUP-<série>-<nn>` | suposição | Lacuna preenchida sem confirmação de quem decide |
| `PER-<série>-<nn>` | pergunta em aberto | Decisão que falta alguém tomar |

- A numeração é contínua dentro da série, com dois dígitos.
- Um código nunca é reaproveitado, nem depois de a spec ser arquivada.
- Na conversa, use sempre o nome por extenso; o código vai entre parênteses. Diga "o
  critério de aceite do aviso de atraso (CA-S3-03)", nunca só "o CA-S3-03".

## Estrutura da spec

```markdown
# Spec: [Nome da Mudança]

> série: [S3]
> estado: rascunho

## Visão Geral
[O que a mudança faz, para quem é e qual problema resolve]

## Páginas / Módulos

### [Nome da Página ou Módulo]

**Descrição:** [O que essa página/módulo faz]

**Componentes:**
- [Componente 1]: [O que é e o que exibe]

**Comportamentos:**
- [Comportamento 1]: [Ação específica que o usuário pode realizar]

**Critérios de aceite:**

#### CA-[série]-01 — [título que uma pessoa entende] · prova: automática

- **Dado** [estado inicial]
- **Quando** [ação]
- **Então** [resultado que dá para observar]

[Repita a seção acima para cada página ou módulo]

## Fora de escopo

- [O que esta mudança explicitamente não faz]

## Suposições

| ID | Suposição | Status | Resolução |
|---|---|---|---|
| SUP-[série]-01 | [o que foi assumido sem confirmação] | aberta | — |

## Perguntas em aberto

| ID | Pergunta | Status | Resposta |
|---|---|---|---|
| PER-[série]-01 | [o que falta alguém decidir] | aberta | — |
```

## Critérios de aceite

- Todo comportamento tem ao menos um critério de aceite.
- O critério precisa ser **observável**: algo que um teste ou uma pessoa confere. "Deve
  ser rápido" não é critério; "responde em menos de 2 segundos" é. Se a descrição só
  permitir um critério vago, não o escreva: registre uma pergunta em aberto.
- Escreva para gente: o título e o **Então** descrevem o que a pessoa vê ("a tela avisa
  que o número já existe"). O detalhe técnico pode ir entre parênteses.
- Todo critério diz o tipo de prova:
  - `automática`: um teste automático confere.
  - `manual`: só uma pessoa confere (ex.: teste com aparelho real, aprovação visual).

## Suposições e perguntas em aberto

- Preencheu uma lacuna sem confirmar? É uma **suposição**, com status `aberta`.
- Faltou uma decisão que é da pessoa? É uma **pergunta em aberto**, com status `aberta`.
- Com a pessoa presente, pergunte na hora, com opções concretas, e grave a resposta:
  suposição vira `confirmada` ou `invalidada`; pergunta vira `respondida`. Na coluna de
  resolução, escreva quem respondeu e o dia.
- As duas seções são obrigatórias. Sem nenhum item, escreva só `Nenhuma.` e desconfie:
  quase toda mudança esconde uma.
- Não decida sozinho o que cabe a quem decide o produto.

## Regras

- Seja específico e detalhado: quanto mais claro, melhor será a implementação
- Liste TODOS os comportamentos possíveis do usuário, mesmo os óbvios
- Não mencione tecnologias ou implementação: foque no QUE, não no COMO
- Cada comportamento deve ser atômico: uma ação específica, não um conjunto de ações
- Ao terminar, mostre à pessoa as suposições e perguntas ainda abertas e peça a
  aprovação da spec. Com a aprovação, troque `estado: rascunho` por
  `estado: aprovada em [dia]`
