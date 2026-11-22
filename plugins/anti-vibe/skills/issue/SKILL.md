---
name: issue
description: Executa o fluxo completo de uma issue — plan → execute → testes → revisildo — a partir do identificador dela, e move a issue para as concluídas quando o auditor der "alinhada". Use quando a pessoa disser só o identificador (ex.: "issue S1-01", "/anti-vibe:issue S1-01").
argument-hint: <id da issue>
---

# Fluxo completo de issue (plan → execute → testes → revisildo)

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

### Passo 2 — plan

Invoque a skill `anti-vibe:plan` com o caminho completo do arquivo da issue. Aguarde a
conclusão.

### Passo 3 — execute

Invoque a skill `anti-vibe:execute` com o mesmo caminho. Aguarde a conclusão.

### Passo 4 — Testes

Invoque a skill `anti-vibe:testes` com o identificador da issue. Aguarde a conclusão.

### Passo 5 — revisildo

Invoque a skill `anti-vibe:revisildo` com o mesmo caminho. Ela roda o auditor e o revisor
independente. Reporte o resultado à pessoa e guarde o **veredito do auditor**:

- **alinhada**: a issue pode ser fechada.
- **alinhada com teste manual pendente**: o código pode ser commitado e publicado, mas
  **a issue fica aberta** até a pessoa confirmar o teste manual.
- **formato antigo**: vale o resultado do revisildo por leitura.

### Passo 6 — Mover a issue para a pasta de concluídas

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

### Passo 7 — Lições (só se algo deu errado no caminho)

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
