---
name: auditor
description: Roda o auditor do fluxo com prova — o conferidor mecânico que diz se uma issue ou uma série está alinhada (cada critério de aceite tem teste com o código dele e o teste passou, suposições e perguntas fechadas, seções presentes, escopo e regras por script). Use quando a pessoa pedir para auditar uma issue ou série, perguntar "qual critério não tem teste?", "o que estamos assumindo?", "o que falta de teste manual?", ou quiser registrar que um teste manual foi feito.
argument-hint: issue <id> | serie <série> | iniciar <id> | antes <id> | suposicoes | regras | licao ... | confirmar <id> <CA-...> --por <nome>
---

# Auditor — a prova que não depende de leitura

O auditor é um script. Ele não julga: lê a spec, a issue e os testes, roda os testes da
issue e devolve problemas ou nenhum. **Quem diz que a issue está alinhada é ele, não
você.** Nunca apresente uma conferência feita por leitura como se fosse o auditor.

**Pedido:** $ARGUMENTS

O script mora no plugin e roda **a partir da raiz do projeto**, só com o Node do
ambiente:

```bash
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" issue <id|caminho> [--sem-rodar] [--json | --linha]
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" serie <série> [--sem-rodar] [--json]
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" esteira-lista <série|id> [--json | --linha]
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" estado <id> [--json | --linha]
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" metricas [série] [--json]
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" metricas defeito <id> --texto "..."
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" iniciar <id|caminho> [--esteira]
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" antes <id|caminho> [--json]
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" suposicoes
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" regras
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" licao listar
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" licao adicionar <issue> --falha <código|revisildo|teste-manual> --texto "..." [--evidencia "..."]
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" licao recorreu <L-nn> <issue>
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" licao remover <L-nn>
node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" confirmar <id> <CA-...> --por <nome> [--dia dd/mm/aaaa]
```

| Pergunta | Comando |
|---|---|
| Esta issue está alinhada? | `issue S1-02` |
| Qual critério não tem teste? | `issue S1-02` ou `serie S1` |
| Posso arquivar a spec? | `serie S1` (tem que dar **alinhada**) |
| Os testes falham antes do código? | `antes S1-02` (logo depois de escrever os testes) |
| O que a esteira vai rodar, e o que poderia rodar junto? | `esteira-lista S1` (campo `lotes`) |
| Quantas tentativas a issue já gastou? | `estado S1-02` |
| Como a esteira está indo? | `metricas S1` |
| Achei um defeito depois do veredito verde | `metricas defeito S1-02 --texto "..."` |
| O que estamos assumindo? | `suposicoes` |
| O que cada regra acha no projeto hoje? | `regras` |
| A pessoa fez o teste manual | `confirmar S1-03 CA-S1-04 --por <nome>` |

`--sem-rodar` confere só a estrutura, sem executar os testes. Serve para uma olhada
rápida; nunca libera commit.

## Configuração

Sem configuração no projeto, o auditor usa a padrão do plugin:

| Campo | Padrão |
|---|---|
| `pastaSpecs` | `pre-desenvolvimento` |
| `pastaIssues` | `pre-desenvolvimento/issues` |
| `pastaSpecsArquivadas` | `docs/specs-arquivadas` |
| `arquivoLicoes` | `pre-desenvolvimento/licoes.md` |
| `pastasTestes` | `src`, `test`, `tests`, `__tests__` |
| `sufixosTeste` | `.test.ts`, `.test.tsx`, `.test.js`, `.test.jsx`, `.test.mjs`, `.spec.ts`, `.spec.tsx`, `.spec.js`, `.py` (só `test_*.py` e `*_test.py`) |
| `comandoTeste` | `npx vitest run {arquivos} --reporter=json --outputFile={saida}` |
| `comandoTestePython` | `python -B -m pytest {arquivos} -q -p no:cacheprovider -o junit_family=xunit1 --junitxml={saida}` |
| `aprovadores` | qualquer nome preenchido |
| `foraDoEscopo` | `pre-desenvolvimento/**` |
| `configDeTeste` | `vitest.config.*`, `vitest.workspace.*`, `vite.config.*`, `jest.config.*`, `playwright.config.*`, `cypress.config.*`, `pytest.ini`, `.pytest.ini`, `pytest.toml`, `.pytest.toml`, `tox.ini`, `**/conftest.py`, `.github/workflows/**`, `.gitlab-ci.yml`, `.circleci/**` |
| `limiteDeTentativas` | `3` |

Para mudar, crie `.claude/auditor.json` no projeto só com os campos que mudam: os dele
vencem os padrão. A exceção é `configDeTeste`: a lista do projeto se soma à padrão, nunca a
substitui, e a configuração do próprio auditor (`.claude/auditor.json` e
`.claude/auditor-regras.json`) é sempre conferida. Tudo o que o auditor grava (lições,
sinais, confirmações, registro) fica no projeto, nunca no plugin.

## Vereditos

| Veredito | Saída | O que significa |
|---|---|---|
| alinhada | 0 | Pode commitar e pode fechar a issue |
| alinhada com teste manual pendente | 10 | Pode commitar e publicar; a issue **fica aberta** até o teste manual ser confirmado |
| estrutura conferida, testes não rodados | 11 | Rodou com `--sem-rodar`; não vale como prova |
| não alinhada | 1 | Há problema que trava; corrija |
| formato antigo | 0 | Issue sem critérios com código; a prova mecânica não se aplica |

## Problemas que ele aponta

| Problema (código) | O que significa | O que fazer |
|---|---|---|
| critério sem teste (`CRITERIO_SEM_TESTE`) | critério automático sem teste com o código dele | escreva o teste com o código no nome do `it`/`test` |
| critério sem prova (`CRITERIO_SEM_PROVA`) | o teste existe, mas falhou, foi pulado ou não rodou | faça passar; teste pulado não é prova |
| teste órfão (`TESTE_ORFAO`) | teste com código que não existe na spec da série | a spec mudou: atualize ou remova o teste |
| critério fora de issue (`CRITERIO_FORA_DE_ISSUE`) | critério da spec que nenhuma issue entrega | inclua em uma issue |
| critério em duas issues (`CRITERIO_EM_DUAS_ISSUES`) | o mesmo critério em mais de uma issue | deixe em uma só |
| critério fora da spec (`CRITERIO_FORA_DA_SPEC`) | critério na issue que não está na spec | acrescente à spec ou tire da issue |
| suposição aberta (`SUPOSICAO_ABERTA`) | suposição sem confirmação | confirme ou invalide com quem decide |
| pergunta aberta (`PERGUNTA_ABERTA`) | pergunta sem resposta | pergunte e grave a resposta |
| seção ausente (`SECAO_AUSENTE`) | falta Suposições ou Perguntas em aberto | acrescente; sem nenhuma, escreva `Nenhuma.` |
| spec não encontrada (`SPEC_NAO_ENCONTRADA`) | nenhuma spec com a série da issue | confira `> série:` no topo da spec; issue avulsa leva `**Tipo:** Avulsa` |
| exceção inválida (`EXCECAO_INVALIDA`) | exceção sem motivo, aprovador ou dia | complete ou remova |
| arquivo fora da issue (`ARQUIVO_FORA_DA_ISSUE`) | arquivo mexido que não está na seção Arquivos | desfaça, ou pare e pergunte antes de incluir na issue |
| arquivo não tocado (`ARQUIVO_NAO_TOCADO`) | arquivo listado que não foi mexido | implemente o que falta ou tire da issue |
| checklist incompleto (`CHECKLIST_INCOMPLETO`) | item do Checklist ainda `[ ]` | conclua e marque |
| regra violada (`REGRA_VIOLADA`) | uma regra por script foi quebrada, com arquivo e linha | siga o "o que fazer" da regra |
| regra desligada sem motivo (`REGRA_DESLIGADA_SEM_MOTIVO`) | `auditor-desligar` sem o porquê | escreva o motivo |
| teste alterado (`TESTE_ALTERADO`) | um teste que existia no último commit ou no registro `antes` mudou ou sumiu (nomeado por arquivo e nome) | desfaça; mudar teste existente só com exceção escrita na issue |
| testes a menos (`TESTES_A_MENOS`) | há menos `it`/`test` do que no último commit | devolva os testes apagados |
| teste pulado ou isolado (`TESTE_MARCADO`) | linha nova de teste com `.skip`, `.only`, `.todo`, `xit`, `fit`, `xdescribe` ou `fdescribe` | tire a marcação |
| configuração de teste alterada (`CONFIG_DE_TESTE_ALTERADA`) | configuração do executor de testes, do CI ou do auditor mexida sem estar na issue | desfaça; é decisão de quem aprova |
| teste que nunca falhou (`TESTE_NUNCA_FALHOU`) | o teste do critério já passava no registro `antes`, sem o código | reescreva o teste para conferir o "Então" |
| falha antes não registrada (`FALHA_ANTES_NAO_REGISTRADA`) | o critério não tinha teste quando o `antes` rodou | **não trava**; rode o `antes` depois de escrever os testes |
| precisa de decisão humana (`DECISAO_HUMANA`) | o portão reprovou a issue no limite de tentativas | **não trava**; pare e apresente o que falta à pessoa |
| escopo não conferido (`ESCOPO_NAO_CONFERIDO`) | nada mudou desde o último commit | **não trava**; para conferir o escopo, rode antes de commitar |
| teste manual pendente (`TESTE_MANUAL_PENDENTE`) | critério manual sem confirmação | **não trava**; faça o teste e use `confirmar` |
| issue no formato antigo (`FORMATO_ANTIGO`) | issue sem critérios com código | **não trava**; revise do jeito antigo |

## Antes do código e portão de conclusão

- **`iniciar <id>`** marca a issue como a **ativa** do portão, com a contagem de
  tentativas zerada. A skill `issue` o roda antes do planejador.
- **`antes <id>`** roda logo depois de escrever os testes e antes de implementar. Ele
  registra, por critério, se o teste falhou (o certo), já passava ou não existe, e guarda a
  impressão de todos os testes do projeto. Também torna a issue a **ativa** do portão e
  recomeça a contagem de tentativas. Saída 0: todos os testes falham, como devem.
- Depois dele, o auditor acusa o teste que já passava antes (`TESTE_NUNCA_FALHOU`) e
  qualquer teste mudado desde o registro (`TESTE_ALTERADO`). Sem registro `antes` da
  issue, essas duas conferências não se aplicam.
- **O portão** vigia o fim de dois agentes do plugin. No **escritor de testes**, ele roda
  o `antes` e barra enquanto faltar teste para um critério automático ou algum teste já
  passar. No **executor**, ele roda o auditor sobre a issue ativa (e reprova se não houver
  `antes`); com problema que trava, impede o encerramento e devolve a lista do que falta. Cada
  reprovação conta uma tentativa; no limite (`limiteDeTentativas`), ele deixa parar com o
  aviso de que a issue precisa de decisão humana. Rodar o auditor à mão não conta
  tentativa.
- O registro fica em `auditor-registro.json`, dentro da pasta do git (fora de git, em
  `.claude/`). Só o auditor o escreve: não edite à mão.

## Métricas

Cada issue que passa pela esteira (iniciada com `iniciar --esteira`) deixa registro em `metricas.json`, na pasta das lições
(configurável em `arquivoMetricas`): início (`iniciar`), tentativas no portão do executor,
se passou de primeira, escalonamentos com o gatilho (`pendencia`, `testes`, `auditor`,
`revisor`, `risco`, `falha`), intervenções humanas (cada escalonamento resolvido) e fim (o
commit). A esteira registra sozinha; defeito achado depois do veredito, a pessoa registra com
`metricas defeito`. O relatório `metricas <série>` mostra a taxa de aprovação de primeira, as
tentativas médias, os escalonamentos por gatilho, as intervenções e os defeitos.

## Issue avulsa

A issue que a triagem grava na marcha delimitada tem `**Tipo:** Avulsa` e nenhuma spec.
O auditor a confere pelos próprios critérios: não cobra spec nem acusa critério fora da
spec. Todo o resto vale igual (testes, suposições, escopo, regras).

## Como falar com a pessoa

- **Cole a saída do auditor** e depois traduza em uma ou duas frases simples o que ela
  diz e qual é o próximo passo. A saída é a prova; a tradução é para ela não precisar
  decifrar.
- Use o nome por extenso: "o critério de aceite do aviso (CA-S1-01) ainda não tem
  teste", nunca só o código.
- Havendo teste manual pendente, mostre o roteiro que o auditor imprimiu.

## Regras

- **Nunca pule, enfraqueça ou apague um teste para o auditor passar.** Nem mude o tipo
  de prova de um critério de `automática` para `manual` por conta própria.
- **Nunca escreva uma exceção por conta própria.** Exceção é decisão de quem aprova.
- Se o mesmo problema persistir depois de três tentativas de correção, pare e apresente
  os problemas à pessoa. Não contorne o auditor.
- Não use `confirmar` sem a pessoa ter dito que fez o teste. O nome em `--por` é o de
  quem conferiu, nunca o seu.

## Formatos que o auditor lê e escreve na issue

**Testes manuais** (o `confirmar` escreve):

```markdown
## Testes manuais

| Critério | Conferido por | Dia |
|---|---|---|
| CA-S1-04 | [nome] | 12/10/2026 |
```

**Exceções** (só com aprovação de quem pode aprovar; a lista fica em `aprovadores`, na
configuração):

```markdown
## Exceções

| Problema | Alvo | Motivo | Aprovado por | Dia |
|---|---|---|---|---|
| CRITERIO_SEM_PROVA | CA-S1-02 | Depende de um serviço externo que está fora do ar | [nome] | 12/10/2026 |
```

A coluna **Problema** leva o código do problema; **Alvo**, o código do critério ou da
suposição. Toda exceção aceita aparece no relatório com `⚑`, para nunca ficar escondida.

## Escopo e regras por script

O auditor compara o que mudou **desde o último commit** com a seção Arquivos da issue.
Por isso ele confere o escopo antes do commit; depois do commit, só avisa que não
conferiu. Documentos do fluxo nunca contam como fora da issue; a lista está em
`foraDoEscopo`, na configuração.

O plugin traz uma só regra por script, genérica: segredo ou chave de servidor em arquivo
que roda no navegador. Regras do projeto ficam em `.claude/auditor-regras.json` (uma
lista no mesmo formato); regra com o mesmo `id` substitui a do plugin. Há dois tipos:

- `conteudo`: procura um padrão nas **linhas acrescentadas** dos arquivos mexidos (o que
  já existia antes não é cobrado). `somenteSe` restringe a arquivos com certo conteúdo,
  como `'use client'`.
- `intocavel`: acusa quando um arquivo que já existia foi modificado ou apagado.
  `salvoSeMudar` libera quando outro arquivo mudou junto (os tipos do banco podem mudar
  se houver migration nova).

Para **acrescentar uma regra**, inclua um item em `.claude/auditor-regras.json` e rode
`regras`: ele mostra quantos arquivos a regra confere e o que ela acha hoje. Regra que
confere zero arquivos está com o caminho errado.

Para **desligar uma regra em um arquivo**, escreva um comentário no próprio arquivo, com
o motivo: `// auditor-desligar segredo-no-frontend: chave pública por desenho`. Sem
motivo, o auditor recusa. Toda regra desligada aparece no relatório com `⚑`. Só desligue
uma regra com a aprovação da pessoa.

O que script não enxerga continua sendo lido pelo revisildo: lógica de negócio no
frontend e autorização só no cliente.

## Lições aprendidas

O arquivo de lições (`arquivoLicoes`) guarda regras que nasceram de falhas reais. Ele é
versionado, para todo mundo do projeto receber, e **só o auditor escreve nele**.

- Toda vez que o auditor acusa um problema que trava, ele guarda um sinal em
  `auditor-sinais.json`, dentro da pasta `.git` do projeto (nunca é versionado). É o
  lastro: `licao adicionar --falha <CÓDIGO>` só aceita um código que o auditor de fato
  acusou naquela issue.
- Falha que o auditor não vê (achada pelo revisildo por leitura ou em teste manual) entra
  com `--falha revisildo` ou `--falha teste-manual` e a `--evidencia` por escrito.
- No máximo duas lições por issue. Caminho limpo não gera lição.
- `licao recorreu` marca que a mesma falha voltou em **outra série**. Lição recorrente é
  lida primeiro.
- `licao listar` entrega no máximo dez: as recorrentes na frente, depois as mais novas.
  É o que a spec e o plan leem.
- `licao remover` só por decisão da pessoa.

## Limites

- Roda testes do Vitest e do pytest, nas `pastasTestes` da configuração. Roteiro de tela
  não conta como prova automática: critério que só se confere pela tela é de prova `manual`.
- Em Python (`.py`, já nos `sufixosTeste` padrão):
  - só contam `test_*.py` e `*_test.py`;
  - o teste é a função `def test_...` no topo do arquivo ou direto no corpo de uma
    `class Test...` (ou de uma classe de `unittest.TestCase`), que faz o papel do
    `describe`; `def test_` dentro de `if`, de função ou de outra classe não é teste;
  - o código do critério vai no nome da função, com `_` no lugar de `-`
    (`def test_CA_S1_01_...`), que o auditor lê como `CA-S1-01`; o que o `parametrize`
    acrescenta entre colchetes não conta;
  - o resultado do pytest vale só para os testes lidos no arquivo, conferidos pelo nome,
    pelo arquivo e pela linha que o pytest informa (por isso o `-o junit_family=xunit1`
    no comando): teste lido sem resultado próprio deixa o critério sem prova;
  - contam como marcação (teste pulado): `@pytest.mark.skip`, `skipif`, `xfail`,
    `@unittest.skip`, `pytestmark = ...mark.skip` e `__test__ = False` (no topo do
    arquivo ou na classe), reatribuir ou apagar com `del` o nome de um teste, e repetir o
    nome (só a última definição roda);
  - linha nova fora dos testes que mexe no próprio pytest também é marcação: importar
    `_pytest` ou `pluggy`, `pytest_plugins = ...`, atribuir a algo de `pytest`, `_pytest`
    ou `pluggy` e trocar o `__code__` de uma função;
  - se `python` não for o Python certo, troque `comandoTestePython`: `python3 -B -m pytest
    ...` (Linux e macOS), `py -B -m pytest ...` (Windows) ou o Python do ambiente virtual
    do projeto (`.venv/Scripts/python -B -m pytest ...` no Windows,
    `.venv/bin/python -B -m pytest ...` nos outros).
- Vale o código no nome do `it`/`test`. Código só no `describe` não conta.
- Roda apenas os arquivos de teste que carregam os códigos da issue, não a suíte inteira.
