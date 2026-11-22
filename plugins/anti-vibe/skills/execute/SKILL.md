---
name: execute
description: Implementa exatamente o que está descrito numa issue planejada — só os arquivos da seção Arquivos, seguindo os cenários e marcando o checklist, sem inventar nada. Use depois do plan, ou quando a pessoa pedir para implementar uma issue.
argument-hint: <caminho da issue>
---

Você vai implementar exatamente o que está descrito na issue fornecida.

**Issue:** $ARGUMENTS

Antes de qualquer coisa, leia o `AGENTS.md` da raiz do projeto: é a página de
princípios, com as regras sempre ativas, a arquitetura e o fluxo. Se ele não existir,
leia o `CLAUDE.md` da raiz.

> Se o projeto tem a própria versão desta etapa (um command ou skill de mesmo nome no
> `.claude/` do projeto), siga aquela no lugar desta.

## O que você deve fazer

1. Leia a issue completamente antes de escrever uma linha de código
2. Implemente APENAS o que está listado na seção "Arquivos" da issue
3. Siga os cenários descritos: happy path, edge cases e cenário de erro
4. Marque cada item do checklist com `[x]` conforme for concluindo

## Regras obrigatórias

- **Não mexa em arquivos não listados na issue** — se precisar de algo que não está listado, pare e informe a pessoa
- **Não adicione funcionalidades não descritas** — sem "melhorias" não pedidas
- **Não expanda o escopo** — se perceber que falta algo, sinalize para a próxima issue
- **Siga as regras de arquitetura da página de princípios em tudo** — thin client, isolamento, segurança
- **Reutilize código existente** — não duplique o que já existe no projeto
- **Lógica de negócio sempre no backend** — nunca no frontend

## Se encontrar algo não previsto

Pare a implementação e informe a pessoa:
- Descreva o que encontrou
- Explique por que é um problema
- Sugira como resolver (mas não implemente sem confirmação)

## Se tomar uma decisão que a issue não previa

Nem todo imprevisto justifica parar. Quando você decidir algo pequeno que a issue não
dizia (um texto de mensagem, um valor padrão, a ordem de uma lista), **registre**:
acrescente uma linha na seção **Suposições** da issue, com o próximo código livre da
série e status `aberta`, e a mesma linha na spec, se a issue tiver spec. A pessoa
confirma ou invalida depois.

Isso não vale para arquivo fora da lista nem para funcionalidade nova: nesses casos,
pare e pergunte. Em issue no formato antigo (sem a seção Suposições), informe a decisão
no resumo final.

## Ao finalizar

Informe:
1. Quais arquivos foram criados
2. Quais arquivos foram modificados
3. Se todos os itens do checklist foram concluídos
4. Se algo ficou fora do escopo (para a próxima issue)
