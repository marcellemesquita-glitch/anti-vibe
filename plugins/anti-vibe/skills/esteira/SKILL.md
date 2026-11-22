---
name: esteira
description: Inicia (ou retoma) a esteira automática do anti-vibe sobre uma série inteira ou uma issue avulsa — cada issue passa por planejador, escritor de testes, executor, auditor e revisor e vira um commit no branch da série, sem parar para aprovação; a esteira só para quando um gatilho dispara. Use depois do break, depois de a triagem gravar uma issue avulsa, ou quando a pessoa pedir para rodar ou retomar a esteira.
argument-hint: <série ou id da issue>
---

# Esteira automática

**Alvo:** $ARGUMENTS

Antes de qualquer coisa, leia o `AGENTS.md` da raiz do projeto: é a página de
princípios, com as regras sempre ativas, a arquitetura e o fluxo. Se ele não existir,
leia o `CLAUDE.md` da raiz.

A esteira leva cada issue aberta do alvo do plano ao commit, uma por vez, no branch
`esteira/<série>`. Quem decide o caminho é o workflow; os papéis são os agentes do plugin;
quem diz se a issue está pronta é o auditor. **A esteira nunca junta branches nem envia
nada ao remoto**: isso é da pessoa.

## Passo 1 — Alvo e estado do repositório

1. O alvo é uma série (ex.: `S1`) ou uma issue (ex.: `S1-03`). Sem alvo, pergunte qual.
2. Rode `git status --short`. Os documentos do fluxo (a spec e as issues, na pasta de specs
   do `.claude/auditor.json`, por padrão `pre-desenvolvimento/`) não contam: logo depois do
   break ou da triagem eles ainda não foram commitados, e vão no commit da primeira issue.
   Havendo outra mudança não commitada, mostre a lista e pergunte à pessoa o que fazer antes
   de seguir (guardar, descartar ou commitar à parte). Não descarte nada sem o sim dela.
   Numa retomada depois de interrupção, essas costumam ser as mudanças da issue que estava
   em andamento.

## Passo 2 — Rodar o workflow

Rode o workflow `anti-vibe:esteira` pela ferramenta Workflow, pelo nome, com estes args:

```json
{ "alvo": "<série ou issue>", "raizDoPlugin": "${CLAUDE_PLUGIN_ROOT}" }
```

Passe `raizDoPlugin` com barras normais (`/`): no Windows, troque as barras invertidas do
caminho por `/`.

Espere o resultado. Não interfira no meio: o workflow para sozinho quando precisa de você.

## Passo 3 — Resumo para a pessoa

Mostre, em linguagem simples:

- **Concluídas agora** (`concluidas`) e **já feitas antes** (`jaFeitas`), com o branch (`ramo`).
- Se parou (`parou` verdadeiro): em qual issue (`parouEm`; vazio quando parou antes de
  começar as issues), o **motivo** (ou o `erro`), os **detalhes** (critérios que faltam,
  apontamentos do revisor, pergunta em aberto) e, havendo, quantas **tentativas** foram
  feitas. Termine com o que a pessoa precisa decidir (`proximosPassos`).
- Se não parou (`parou` falso): lembre que push, pull request e merge do branch são com
  ela.

## Passo 4 — Issue de risco (`aguardaSim`)

A issue já passou pelo auditor e pelo revisor; falta só o sim da pessoa para o commit.

1. Mostre as mudanças (`git diff` dos `arquivos` do resumo) e pergunte se pode commitar.
2. Com o sim, faça o commit como a esteira faria: adicione um a um os `arquivos` mexidos e
   os documentos do fluxo mexidos (nunca tudo de uma vez); se o `veredito` do resumo for
   "alinhada", mova a issue para `concluidas_<série>/` com `git mv` (com teste manual
   pendente, ela fica aberta); mensagem com a primeira linha `feat(<id>): <título>` e,
   depois de uma linha em branco, `Esteira-Issue: <id>`.
3. Volte ao passo 2 para seguir com as próximas issues (se não houver mais nenhuma, a
   esteira termina na hora, com todas como já feitas).

## Retomar

Depois de a pessoa decidir (responder a pergunta, confirmar a suposição, ajustar a issue),
ou depois de a sessão ter sido interrompida, rode esta skill de novo com o mesmo alvo. A
esteira pula as issues já commitadas por ela (linha `Esteira-Issue` no histórico do
branch) e as concluídas, e segue da que parou.

## Regras

- Não peça aprovação entre as issues: a esteira só para nos gatilhos.
- Não contorne um gatilho: quando a esteira para, a decisão é da pessoa.
- Nunca registre teste manual como feito, nem escreva exceção, por conta própria.
