---
name: novo-projeto
description: Prepara o projeto atual para o fluxo anti-vibe — cria AGENTS.md (princípios), CLAUDE.md (descrição do projeto, que importa o AGENTS.md), a configuração do auditor e a tabela de séries, sem sobrescrever nada que já exista, e mostra como ligar o plugin num Project da nuvem. Use quando a pessoa quiser começar um projeto novo no fluxo ou preparar um projeto existente.
argument-hint: "[git] [regras]"
---

# Projeto novo no fluxo anti-vibe

**Pedido:** $ARGUMENTS

Você vai preparar a pasta atual (a raiz do projeto) para o fluxo. Nada que já existe é
sobrescrito: o script pula o que encontrar.

## Passo 1 — Opcionais

Se a pessoa não disse no pedido, pergunte, numa pergunta só, se ela quer:

- **regras de git**: branch principal protegido, trabalho em branch próprio, pull request
  revisado pela pessoa (vai como seção do `AGENTS.md`);
- **regras por script de exemplo**: arquivo gerado só muda junto da fonte; componente pronto
  no lugar do elemento cru (vira `.claude/auditor-regras.json`, para ela adaptar).

## Passo 2 — Aplicar os modelos

Na raiz do projeto:

```bash
node "${CLAUDE_PLUGIN_ROOT}/modelos/aplicar.mjs" [--git] [--regras]
```

O script diz o que criou, o que pulou (já existia e não foi mexido), o que não conseguiu
criar e os avisos. Não crie nem edite nenhum desses arquivos à mão. Se ele sair com código
diferente de 0, mostre à pessoa o que não deu para criar, com o motivo, antes de seguir.

## Passo 3 — Conferir com o auditor

```bash
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" suposicoes
```

Ele lê a configuração e as pastas do projeto. Tem que sair sem erro (num projeto novo, sem
nenhuma suposição em aberto).

## Passo 4 — Resultado

Mostre à pessoa:

1. **Criados**, **pulados** (com a frase "já existia e não foi mexido" para cada pulado), o
   que **não deu para criar** (com o motivo) e todos os **avisos** do script. O aviso de
   `CLAUDE.md` sem `@AGENTS.md` é importante: sem essa linha, as regras e o fluxo não são
   carregados.
2. O que preencher agora: o `CLAUDE.md` (o que é o projeto, stack, pastas, comandos e regras
   próprias) e, se ela pediu, as regras de exemplo em `.claude/auditor-regras.json`, que
   precisam ter os caminhos e o elemento ajustados ao projeto; até lá, o comando `regras` do
   auditor avisa que elas não conferem nenhum arquivo.
3. Como ligar o plugin num **Project da nuvem** (thread do Claude Code no navegador):
   - faça commit e push dos arquivos criados, porque a thread da nuvem trabalha sobre o
     repositório remoto;
   - na conta do claude.ai, em Plugins, adicione o marketplace a partir do repositório do
     plugin, `marcellemesquita-glitch/anti-vibe` (Adicionar marketplace → Adicionar de um
     repositório), e ative o `anti-vibe`;
   - numa thread nova, rode `/anti-vibe:diagnostico`.
   Instalar pelo terminal deixa o plugin só no computador.
4. O próximo passo: `/anti-vibe:triagem` com a primeira tarefa.
