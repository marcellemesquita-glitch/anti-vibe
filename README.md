# anti-vibe

Método de desenvolvimento com IA, empacotado como plugin do Claude Code. Toda tarefa
começa por uma triagem que decide quanta cerimônia ela merece; trabalho grande vira spec
com critérios de aceite, e uma esteira leva cada issue do plano ao commit: testes escritos
antes do código, executor que não pode mexer neles, auditor que confere cada critério e
revisão independente. A pessoa aprova a spec, decide quando a esteira pede e faz o merge.

## Instalar no computador

No terminal:

```
claude plugin marketplace add marcellemesquita-glitch/anti-vibe
claude plugin install anti-vibe@fabrica-anti-vibe
```

Ou, dentro de uma sessão do Claude Code:

```
/plugin marketplace add marcellemesquita-glitch/anti-vibe
/plugin install anti-vibe@fabrica-anti-vibe
```

Para conferir se está funcionando, abra uma sessão nova e rode `/anti-vibe:diagnostico`.

## Ligar num Project da nuvem

Instalar pelo terminal deixa o plugin só no computador. Para as threads do Claude Code no
navegador:

1. Faça commit e push do projeto: a thread da nuvem trabalha sobre o repositório remoto.
2. Na conta do claude.ai, em Plugins, adicione o marketplace a partir do repositório
   `marcellemesquita-glitch/anti-vibe` (Adicionar marketplace → Adicionar de um
   repositório) e ative o `anti-vibe`.
3. Numa thread nova, rode `/anti-vibe:diagnostico`.

## Primeiros passos

1. Na raiz do projeto, rode `/anti-vibe:novo-projeto`. Ele cria o `AGENTS.md` (princípios),
   o `CLAUDE.md` (o que é o projeto, para você preencher), a configuração do auditor e a
   tabela de séries, sem sobrescrever nada que já exista.
2. Para cada tarefa, comece por `/anti-vibe:triagem`. Ela escolhe a marcha:
   - **sonda**: pergunta de viabilidade; responde e para;
   - **delimitada**: mudança num fluxo que já existe; desenho no chat, seu sim, e a esteira
     roda uma issue avulsa;
   - **arquitetural**: `/anti-vibe:spec` (você aprova) e `/anti-vibe:break`, que grava as
     issues e inicia a esteira.
3. A esteira (`/anti-vibe:esteira`) para só quando precisa de você: pergunta em aberto,
   auditor reprovando além do limite, revisor discordando, issue de risco antes do commit.
   Ao final, push, pull request e merge do branch `esteira/<série>` ficam com você.

Outras skills: `/anti-vibe:auditor` (o conferidor, inclusive o relatório de métricas da
esteira), `/anti-vibe:issue` (uma issue com os papéis separados, sem a esteira) e as etapas
avulsas `/anti-vibe:plan`, `/anti-vibe:execute`, `/anti-vibe:testes` e `/anti-vibe:revisildo`.

## Atualizar

No terminal:

```
claude plugin marketplace update fabrica-anti-vibe
claude plugin update anti-vibe@fabrica-anti-vibe
```

Depois, abra uma sessão nova: a linha `anti-vibe <versão> ativo` do início da sessão mostra
a versão em uso. Na nuvem, a atualização chega pela conta do claude.ai.

## Para outra pessoa usar

O repositório é público: basta ela seguir "Instalar no computador" (e, se usar a nuvem,
"Ligar num Project da nuvem") na conta dela. Não há nada a liberar.

## Desenvolver o plugin

O plugin fica em `plugins/anti-vibe/`; o catálogo, em `.claude-plugin/marketplace.json`.

- **Testar sem instalar**, numa pasta de teste:

  ```
  claude --plugin-dir <caminho deste repositório>/plugins/anti-vibe
  ```

- **Validar** o plugin e o catálogo:

  ```
  claude plugin validate --strict plugins/anti-vibe
  claude plugin validate --strict .
  ```

- **Rodar os testes** (Vitest), na raiz deste repositório:

  ```
  npm install
  npx vitest run
  ```

  Cada teste leva no nome o código do critério de aceite que prova. O auditor do plugin
  roda sobre este próprio repositório, com a configuração de `.claude/auditor.json`.

## Licença

[MIT](LICENSE).
