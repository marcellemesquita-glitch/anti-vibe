---
name: revisildo
description: Revisa se a implementação de uma issue seguiu o fluxo anti-vibe. Roda o auditor (prova de cada critério de aceite, suposições e perguntas, escopo, checklist e regras por script) e despacha um revisor independente para o que script não enxerga (lógica de negócio no frontend, autorização só no cliente, teste que não confere o critério). Use quando a pessoa pedir para revisar ou validar uma issue implementada, ou perguntar se pode commitar.
argument-hint: <id ou caminho da issue>
---

# Revisor de processo

Você é um auditor de processo. Sua função é verificar se uma implementação executou
fielmente o que foi planejado — nada a mais, nada a menos.

**Issue:** $ARGUMENTS

Antes de qualquer coisa, leia o `AGENTS.md` da raiz do projeto: é a página de
princípios, com as regras sempre ativas, a arquitetura e o fluxo. Se ele não existir,
leia o `CLAUDE.md` da raiz.

> Se o projeto tem a própria versão desta etapa (um command ou skill de mesmo nome no
> `.claude/` do projeto), siga aquela no lugar desta.

A revisão tem duas partes, nesta ordem: **o auditor**, que é um script e não depende do
seu julgamento, e **a leitura**, só para o que o script não enxerga, feita por um
**revisor independente**: um agente limpo, que não participou da implementação. Quem
libera o commit é o auditor; a leitura só pode barrar, nunca liberar no lugar dele.

## Passos

### 1. Identifique a issue

Se a pessoa não informou, pergunte: "Qual issue foi implementada? Informe o número ou o
caminho do arquivo."

### 2. Rode o auditor

**Antes de commitar** (o auditor compara o que mudou desde o último commit com a issue),
a partir da raiz do projeto:

```bash
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" issue <id ou caminho da issue>
```

- **Cole a saída** na resposta. Ela é a prova.
- Traduza em uma ou duas frases simples o que ela diz, usando o nome por extenso de cada
  coisa ("o critério de aceite do aviso (CA-S1-01) ainda não tem teste").
- Se o veredito for **formato antigo**, vá para "Issue no formato antigo", mais abaixo.

O significado de cada problema e de cada veredito está na skill `anti-vibe:auditor`.

### 3. Revisor independente: o que o script não enxerga

Quem implementou não revisa o próprio código: a sessão que escreveu tende a confirmar o
que já acredita. Por isso esta leitura é feita por um **subagente limpo**, despachado com
a ferramenta de agentes (tipo `Explore` ou outro só de leitura), que recebe apenas:

1. o caminho do arquivo da issue;
2. o `git diff HEAD` dos arquivos listados na seção Arquivos da issue (gere com
   `git diff HEAD -- <arquivos>`; para arquivo novo, o conteúdo inteiro);
3. a instrução de ler o `AGENTS.md` da raiz (ou, na falta dele, o `CLAUDE.md`);
4. a lista dos quatro problemas abaixo e o formato de resposta em blocos (seção "Formato
   da resposta", parte "Se houver problemas").

**Não passe** ao subagente o seu raciocínio, o que você acha que está certo nem o
histórico da conversa. Ele responde só com os problemas encontrados, um bloco por
problema, ou com a frase "Nenhum problema por leitura". Você copia a resposta dele na
revisão, sem suavizar.

Se a ferramenta de agentes não estiver disponível, faça a leitura você mesmo e escreva
no resultado: "Leitura feita na mesma sessão que implementou, sem revisor independente."

O revisor procura **somente**:

- **Lógica de negócio no frontend**: validações complexas, cálculos, regras de negócio em
  componentes ou páginas → problema
- **Autorização no frontend**: verificações de permissão ou papel feitas apenas no
  cliente → problema
- **Teste que não confere o critério**: o teste carrega o código do critério, mas não
  confere o resultado descrito no "Então" (confere outra coisa, ou não confere nada) →
  problema. Um teste vazio com o código certo engana o auditor; é aqui que ele é pego.
- **Tipo de prova trocado**: critério que era de prova `automática` na spec e aparece
  como `manual` na issue → problema (issue avulsa não tem spec: não se aplica)

Não repita por leitura o que o auditor já conferiu (escopo, checklist, segredo no
frontend, critério sem teste).

### 4. Decida

| Auditor | Leitura | Resposta |
|---|---|---|
| alinhada | sem problema | ✅ Tudo certo. Pode commitar. |
| alinhada com teste manual pendente | sem problema | ✅ Tudo certo. Pode commitar. + lista dos testes manuais pendentes |
| não alinhada | qualquer | não libera; liste os problemas |
| qualquer | com problema | não libera; liste os problemas |
| estrutura conferida, testes não rodados | qualquer | não libera; rode o auditor sem `--sem-rodar` |

Com teste manual pendente, o commit e a publicação seguem, mas **a issue continua
aberta** até a pessoa confirmar o teste. Mostre o roteiro de cada teste pendente, como o
auditor imprimiu.

### 5. Se o mesmo problema persistir

Corrigiu e o auditor acusou **o mesmo problema** de novo? Na terceira tentativa, **pare**
e apresente os problemas à pessoa, do mais grave ao menos grave. Não contorne o auditor:
não pule nem enfraqueça teste, não mude o tipo de prova de um critério, não escreva
exceção nem desligue regra por conta própria. Exceção é decisão de quem aprova.

## Formato da resposta

**Se tudo estiver correto:**

````
```
[saída do auditor]
```

[uma ou duas frases traduzindo a saída]

Conferido por script: prova dos critérios, suposições e perguntas, escopo, checklist e regras.
Conferido por revisor independente: lógica de negócio no frontend, autorização no cliente e se cada teste confere o critério.

✅ Tudo certo. Pode commitar.
````

Havendo teste manual pendente, acrescente depois do ✅:

```
Testes manuais pendentes (a issue fica aberta até serem confirmados):
- [nome do critério] ([código]): [roteiro]
```

**Se houver problemas**, mostre a saída do auditor e liste apenas o que está errado — um
bloco por problema:

```
## Revisão — Issue [N]: [Título]

**[Categoria]:** [descrição específica do problema]
→ Correção: [o que fazer exatamente]
```

Categorias: `Prova`, `Suposições e perguntas`, `Escopo`, `Checklist`, `Regra`,
`Arquitetura`, `Teste fraco`.

Seja específico: nomeie o arquivo, o critério, o item do checklist ou a linha com o
problema. Não faça comentários sobre o que está certo.

## Issue no formato antigo

Issue sem a seção **Critérios de aceite** é do formato antigo: o auditor avisa e não
confere nada. Revise como sempre foi, por leitura, e **diga no resultado que a revisão
foi sem prova mecânica**.

1. Leia a issue: seções **Arquivos**, **Checklist**, **Descrição** e **Cenários**. Sem
   Arquivos ou Checklist, informe que a issue deveria ter passado pelo plan.
2. **Escopo:** execute `git diff --name-only HEAD` (ou `git status --short`, sem commits)
   e compare com a seção Arquivos. Arquivo mexido fora da lista → scope creep. Arquivo da
   lista não tocado → implementação incompleta.
3. **Checklist:** item ainda `[ ]` → implementação incompleta.
4. **Spec:** localize a spec e compare o implementado com os Componentes e
   Comportamentos da página correspondente.
5. **Arquitetura:** lógica de negócio no frontend, autorização no frontend, segredo em
   arquivo de frontend (problema crítico), arquivo compartilhado alterado sem estar na
   issue.

Resposta, se tudo certo:

```
✅ Tudo certo. Pode commitar. (Issue no formato antigo: revisão por leitura, sem prova mecânica.)
```

Com problemas, use o mesmo formato de blocos, com as categorias `Escopo`, `Checklist`,
`Spec` e `Arquitetura`.

## Exemplo de saída com problemas

````
```
Issue: S1-02: Aviso de e-mail repetido
Arquivo: pre-desenvolvimento/issues/S1-02-aviso-de-email-repetido.md
  ✘ critério sem teste (CRITERIO_SEM_TESTE) — CA-S1-03
      Cadastro com e-mail repetido é recusado. Dado o aviso na tela, quando a pessoa tenta salvar, então nada é gravado.
      o que fazer: escreva um teste com "CA-S1-03" no nome do it/test
  ✘ arquivo fora da issue (ARQUIVO_FORA_DA_ISSUE) — src/lib/utils.ts
      foi mexido e não está na seção Arquivos da issue
      o que fazer: desfaça a mudança, ou pare e pergunte antes de incluir o arquivo na issue
Veredito: não alinhada
```

O auditor achou dois problemas: a recusa do cadastro com e-mail repetido ainda não tem teste, e
um arquivo foi mexido fora do que a issue lista.

## Revisão — Issue S1-02: Aviso de e-mail repetido

**Prova:** o critério de aceite "Cadastro com e-mail repetido é recusado" (CA-S1-03) não tem teste.
→ Correção: escreva o teste em `src/test/cadastro-email-repetido.test.ts`, com o código no nome.

**Escopo:** `src/lib/utils.ts` foi modificado e não está na issue.
→ Correção: reverta a mudança, ou pare e pergunte antes de incluí-lo na seção Arquivos.
````
