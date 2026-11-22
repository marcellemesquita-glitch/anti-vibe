---
name: testes
description: Escreve e roda os testes automatizados de uma issue a partir da tabela Prova dela, com o código do critério de aceite no nome de cada teste. Use quando a pessoa disser "testes da issue X", "escrever testes para a issue X", ou quando o fluxo execute → testes → revisildo chegar nesta etapa.
argument-hint: <id ou caminho da issue>
---

# Implementador de testes

Você vai implementar os testes automatizados da issue informada, exatamente os que a
tabela Prova dela mapeia.

**Issue:** $ARGUMENTS

Antes de qualquer coisa, leia o `AGENTS.md` da raiz do projeto: é a página de
princípios, com as regras sempre ativas, a arquitetura e o fluxo. Se ele não existir,
leia o `CLAUDE.md` da raiz.

> Se o projeto tem a própria versão desta etapa (um command ou skill de mesmo nome no
> `.claude/` do projeto), siga aquela no lugar desta.

**Pastas.** As issues ficam na `pastaIssues` de `.claude/auditor.json` do projeto, e os
testes que o auditor procura, nas `pastasTestes` dele. Sem esse arquivo:
`pre-desenvolvimento/issues/` e as pastas `src`, `test`, `tests` e `__tests__`.

## Passo 1 — Ler a issue

Localize o arquivo da issue (em `<pastaIssues>/`, pelo padrão `{identificador}-*.md`) e
leia as seções **Critérios de aceite** e **Prova**.

- Issue de protótipo, ou só com critérios de prova `manual`: informe que não há teste a
  escrever e encerre.
- Critério de prova `automática` sem linha na tabela Prova: pare e avise. A issue deveria
  ter passado pelo plan.
- Issue sem a seção Critérios de aceite (formato antigo): escreva os testes dos
  **Cenários** da issue, um `describe` com o identificador e o título dela, sem inventar
  códigos de critério.

## Passo 2 — Escrever os testes

1. Para cada linha de prova `automática`, escreva ao menos um teste no arquivo indicado na
   coluna **Onde**. Arquivo já existe: acrescente, sem mexer nos testes de outras issues.
2. **O código do critério vai no nome do `it`/`test`**, no começo:
   ```typescript
   it('CA-S1-01: avisa quando o e-mail já está cadastrado', async () => { ... })
   ```
   Código só no `describe` não conta: o auditor lê o nome do teste.
3. O teste confere **o resultado descrito no critério** (o "Então"), não o formato do
   código.
4. Siga o padrão de testes que o projeto já usa (ferramenta, pastas, preparação e limpeza
   de dados). Cada teste cria o que precisa e limpa o que criou.

## Passo 3 — Executar

Rode só os arquivos de teste da issue, com o comando de testes do projeto. Se algum
falhar, corrija o código (ou o teste, se ele estiver errado em relação ao critério) antes
de continuar. Não avance com teste falhando.

## Passo 4 — Reportar

```
## Testes — Issue [N]: [Título]

**Arquivo:** [caminho]
**Resultado:** ✅ todos passando  (ou ❌ [N] falhando)

Critérios cobertos:
- ✅ [nome do critério] ([código]) — [o que o teste confere]
```

## Regras

- Nunca invente testes além do que a tabela Prova mapeia para a issue
- **Nunca pule (`skip`, `todo`), enfraqueça ou apague um teste para a issue passar.** Teste
  pulado não é prova e o auditor acusa
- Nunca modifique testes de outras issues no mesmo arquivo
- Não mude o tipo de prova de um critério por conta própria
