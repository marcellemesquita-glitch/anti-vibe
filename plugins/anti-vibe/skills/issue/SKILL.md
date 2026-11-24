---
name: issue
description: "Executa o fluxo completo de uma issue com os papéis separados — planejador → escritor de testes → executor → revisildo — a partir do identificador dela, e move a issue para as concluídas quando o auditor der \"alinhada\". Use quando a pessoa disser só o identificador (ex.: \"issue S1-01\", \"/anti-vibe:issue S1-01\")."
argument-hint: "<id da issue>"
---

# Fluxo completo de issue (planejador → escritor de testes → executor → revisildo)

**Issue:** $ARGUMENTS

Antes de qualquer coisa, leia o `AGENTS.md` da raiz do projeto: é a página de
princípios, com as regras sempre ativas, a arquitetura e o fluxo. Se ele não existir,
leia o `CLAUDE.md` da raiz.

> Se o projeto tem a própria versão desta etapa (um command ou skill de mesmo nome no
> `.claude/` do projeto), siga aquela no lugar desta.

**Pastas.** As issues ficam na `pastaIssues` de `.claude/auditor.json` do projeto. Sem
esse arquivo: `pre-desenvolvimento/issues/`.

O auditor roda sempre da raiz do projeto, com:

```bash
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" <comando>
```

### Passo 1 — Resolver o caminho

Localize o arquivo da issue em `<pastaIssues>/`, pelo padrão `{identificador}-*.md` (ex.:
`S1-01-*.md`). Aceite variações de caixa. Se não encontrar, diga em qual pasta procurou e
pare.

Cada papel roda num **agente do plugin, com contexto limpo**, despachado com a ferramenta
de agentes. Passe a cada um só o caminho da issue (e nada do que os outros pensaram). Os
ganchos do plugin garantem o papel: cada agente só edita o que é dele, e o escritor de
testes e o executor só encerram quando o auditor deixa.

### Passo 2 — Marcar a issue como ativa

```bash
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" iniciar <id>
```

### Passo 3 — Planejador

Despache o agente `anti-vibe:planejador` com o caminho da issue. Aguarde. Se ele relatar
suposição ou pergunta aberta, pare e leve à pessoa antes de seguir.

### Passo 4 — Escritor de testes

Se a issue tem critério de prova `automática`, despache o agente
`anti-vibe:escritor-de-testes` com o caminho da issue. Os testes têm de **falhar**: o
portão só deixa o escritor encerrar quando há um teste para cada critério automático e
todos falham, e aí o auditor registra isso (`antes`). Se ele encerrar no limite de
tentativas, com o aviso de que a issue precisa de decisão humana, **pare aqui** e
apresente o que falta à pessoa: não despache o executor.

### Passo 5 — Executor

Despache o agente `anti-vibe:executor` com o caminho da issue. Ele implementa sem tocar nos
testes; o portão só o deixa encerrar quando o auditor não acusa nada, ou no limite de
tentativas, com o aviso de que a issue precisa de decisão humana. Nesse caso, pare e
apresente o que falta à pessoa.

Sem ferramenta de agentes, faça as etapas nesta mesma sessão, na mesma ordem: a skill
`anti-vibe:plan`; a skill `anti-vibe:testes`, mas parando com os testes **falhando**, sem
escrever código; `node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" antes <id>` (tem que
sair com 0); e a skill `anti-vibe:execute`. Diga no resultado que os papéis não ficaram
separados.

### Passo 6 — revisildo

Invoque a skill `anti-vibe:revisildo` com o mesmo caminho. Ela roda o auditor e o revisor
independente. Reporte o resultado à pessoa e guarde o **veredito do auditor**:

- **alinhada**: a issue pode ser fechada.
- **alinhada com teste manual pendente**: o código pode ser commitado e publicado, mas
  **a issue fica aberta** até a pessoa confirmar o teste manual.
- **formato antigo**: vale o resultado do revisildo por leitura.

### Passo 7 — Mover a issue para a pasta de concluídas

Somente se o revisildo não encontrou problemas **e o veredito do auditor é "alinhada"**
(ou a issue é do formato antigo), mova o arquivo para `<pastaIssues>/concluidas_<série>/`,
criando a pasta se não existir.

Com **teste manual pendente, não mova**. Diga à pessoa quais testes faltam, com o roteiro
de cada um, e como registrar depois:

```bash
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" confirmar <id> <CA-...> --por <nome de quem conferiu>
```

Quando a pessoa disser que fez o teste, registre com o nome dela, rode o auditor de novo
e, com "alinhada", mova a issue.

### Passo 8 — Lições (só se algo deu errado no caminho)

Uma lição é uma regra geral, em uma frase, que teria evitado uma falha **que aconteceu de
verdade** nesta issue.

1. O auditor acusou algum problema antes de dar "alinhada"? O revisildo achou algo por
   leitura? Um teste manual revelou erro?
2. **Caminho limpo → nenhuma lição.**
3. Falha igual à de uma lição que já existe (`licao listar`), em outra série: marque a
   recorrência com `node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" licao recorreu <L-nn> <id>`.
4. Senão, registre **no máximo duas**:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" licao adicionar <id> --falha <CODIGO_DO_PROBLEMA> --texto "regra geral em uma frase"
   node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" licao adicionar <id> --falha revisildo --evidencia "o que deu errado" --texto "regra geral"
   node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" licao adicionar <id> --falha teste-manual --evidencia "o que deu errado" --texto "regra geral"
   ```
5. Se o auditor recusar a lição, ela não existe. Não force nem edite o arquivo à mão.

A lição descreve a regra, não o caso: "Confira o valor gravado no banco, não só o retorno
da ação", e não "o teste da S1-02 estava errado".

## Regras

- Issues de protótipo nunca têm testes automáticos — não invente testes para elas.
- Se o revisildo encontrar problemas, corrija-os antes de encerrar.
- Nunca mova para concluídas uma issue com teste manual pendente.
- Nunca registre um teste manual como confirmado sem a pessoa ter dito que o fez.
- Não peça confirmação entre os passos — execute tudo em sequência.
- Se qualquer passo falhar ou encontrar algo inesperado, pare e informe a pessoa.
