---
name: triagem
description: Classifica uma tarefa em sonda, delimitada ou arquitetural e manda para a marcha certa do fluxo anti-vibe. Use no começo de qualquer tarefa de desenvolvimento, quando a pessoa pedir uma mudança, um recurso novo, uma correção ou perguntar se dá para fazer algo.
argument-hint: <tarefa>
---

Você vai classificar a tarefa e mandá-la para a marcha certa. Nada mais.

**Tarefa:** $ARGUMENTS

Antes de qualquer coisa, leia o `AGENTS.md` da raiz do projeto: é a página de
princípios, com as regras sempre ativas, a arquitetura e o fluxo. Se ele não existir,
leia o `CLAUDE.md` da raiz.

> Se o projeto tem a própria versão desta etapa (um command ou skill de mesmo nome no
> `.claude/` do projeto), siga aquela no lugar desta.

**Pastas.** As issues ficam na `pastaIssues` de `.claude/auditor.json` do projeto. Sem
esse arquivo: `pre-desenvolvimento/issues/`.

## Por que este passo existe

O fluxo completo (spec → break → plan → execute) foi feito para subsistema novo.
Aplicado a tudo, ele vira cerimônia: correção de bug vira quatro issues, ajuste de campo
vira documento. A regra que decide:

> Se a pessoa ficaria irritada com o agente interpretando o requisito diferente do que
> ela quis dizer, escreva a spec. Se daria para consertar no prompt seguinte, não
> escreva.

## O que você deve fazer

1. Leia a tarefa.
2. Olhe o repositório o suficiente para saber se o fluxo que ela muda **já existe
   aqui**. Não é sobre você conhecer esse tipo de app — é sobre o código estar no
   repositório para ser lido.
3. Classifique em uma das três marchas e **diga a classificação em voz alta**, com o
   motivo, antes de qualquer outra coisa. A pessoa pode discordar.
4. Siga o caminho da marcha escolhida.

## As três marchas

### Sonda
Pergunta de viabilidade: "dá pra fazer X?", "isso é possível?", "quero saber se
compensa". O resultado é uma **resposta**, não código que fica.

- Apresente em 2–3 frases o que vai testar.
- Investigue do jeito mais barato que ainda dê resposta confiável.
- Relate a conclusão como recomendação. O que foi construído é descartável e você diz
  isso.
- **Sem spec, sem issue, sem plano.**

### Delimitada
Mudança bem definida em código que já existe no repositório: um campo novo, um endpoint
pequeno, uma correção, um ajuste de regra.

1. Faça as perguntas que importam, uma por vez.
2. Apresente o desenho **no chat**: abordagem, arquivos que serão tocados e os
   **critérios de aceite**, cada um com título, "Dado / Quando / Então" e o tipo de prova
   (`automática` se um teste confere, `manual` se só uma pessoa confere). Alguns
   parágrafos, não um documento.
3. **Pare e espere o sim.** Apresentar e já começar é pular o portão.
4. Com o sim, grave a **issue avulsa** (veja abaixo). É ela que dá ao auditor o que
   conferir.
5. Siga com `/anti-vibe:issue <série>-01` sobre a issue avulsa (plan → execute → testes
   → revisildo).

**Sem spec.**

#### A issue avulsa

1. **Série.** Leia a tabela de séries em `<pastaIssues>/README.md` e as pastas
   `<pastaIssues>/concluidas_*`. Escolha a próxima série livre e acrescente a linha dela
   na tabela **agora**, com a spec `— (issue avulsa)`. Sem o README, crie-o com a tabela
   `| Série | Spec | Pasta de concluídas |` e comece pela série `S1`.
2. **Arquivo.** Grave `<pastaIssues>/<série>-01-<nome-curto>.md`:

```markdown
# <série>-01: [Título]

**Tipo:** Avulsa
**Spec:** nenhuma (issue avulsa, combinada na triagem)
**Depende de:** nenhuma
**Risco:** sim | não

## Descrição

[O que muda, em 1-2 frases]

## Pronto quando

[O que dá para ver funcionando]

## Critérios de aceite

- **CA-<série>-01** (automática) — [título]. Dado [...], quando [...], então [...].

## Suposições

Nenhuma.

## Perguntas em aberto

Nenhuma.
```

3. Copie os critérios **como foram combinados no chat**, com o tipo de prova de cada um.
4. **Risco:** `sim` se a mudança mexe em autenticação, pagamento, dados sensíveis ou
   migração de banco; senão, `não`.
5. O que você assumiu sem a pessoa confirmar vira linha em Suposições, com status
   `aberta`.

### Arquitetural
Projeto novo, subsistema novo, mudança que altera como as peças se encaixam ou mexe em
interface da qual outras coisas dependem.

- Aí sim: `/anti-vibe:spec` → `/anti-vibe:break` → `/anti-vibe:issue` em cada issue.

## Regras

- **Na dúvida entre duas marchas, escolha a mais pesada.** Procurar um rótulo para pular
  trabalho já é o sinal de que a dúvida é real.
- **A catraca é de mão única.** Complexidade escondida que aparece no meio do caminho
  sobe a marcha: pare, diga que subiu, e recomece dali. Nada desce.
- **Toda marcha termina em aprovação antes de implementar.** O que muda com a
  simplicidade é o tamanho do desenho, nunca a existência do portão.
- Conhecer o tipo de aplicação não torna a tarefa delimitada. Se não há fluxo existente
  para mudar, ela é arquitetural.
