import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN = path.join(RAIZ, 'plugins', 'anti-vibe')
const AUDITOR = path.join(PLUGIN, 'auditor', 'auditor.mjs')
const PORTAO = path.join(PLUGIN, 'hooks', 'portao.mjs')

const criados = []
const atalhos = []

// Projeto de exemplo numa pasta temporária. O `node_modules` é um atalho (junction)
// para o deste repositório, para o Vitest rodar lá dentro.
function criarProjeto(arquivos, { git = false } = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'anti-vibe-p1-05-'))
  criados.push(raiz)
  escrever(raiz, arquivos)
  fs.symlinkSync(path.join(RAIZ, 'node_modules'), path.join(raiz, 'node_modules'), 'junction')
  atalhos.push(path.join(raiz, 'node_modules'))
  if (git) {
    fs.writeFileSync(path.join(raiz, '.gitignore'), 'node_modules\n')
    rodarGit(raiz, 'init', '-q')
    commitar(raiz)
  }
  return raiz
}

afterAll(() => {
  for (const onde of atalhos) {
    try {
      fs.unlinkSync(onde)
    } catch {}
  }
  for (const raiz of criados) {
    try {
      fs.rmSync(raiz, { recursive: true, force: true })
    } catch {}
  }
})

function escrever(raiz, arquivos) {
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    const destino = path.join(raiz, rel)
    if (conteudo === null) {
      fs.rmSync(destino, { force: true })
      continue
    }
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    fs.writeFileSync(destino, conteudo)
  }
}

function rodarGit(raiz, ...args) {
  const r = spawnSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd: raiz, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout
}

function commitar(raiz) {
  rodarGit(raiz, 'add', '-A')
  rodarGit(raiz, '-c', 'user.name=Teste', '-c', 'user.email=teste@exemplo.invalid', 'commit', '-q', '-m', 'base')
}

function auditor(raiz, ...args) {
  const r = spawnSync(process.execPath, [AUDITOR, ...args], { cwd: raiz, encoding: 'utf8' })
  return { status: r.status, saida: `${r.stdout}\n${r.stderr}`, stdout: r.stdout }
}

function problemasDa(raiz, { rodar = false } = {}) {
  const r = auditor(raiz, 'issue', 'S1-01', '--json', ...(rodar ? [] : ['--sem-rodar']))
  return JSON.parse(r.stdout).problemas
}

function doCodigo(problemas, codigo) {
  return problemas.filter((p) => p.codigo === codigo)
}

// Sem CLAUDE_PROJECT_DIR herdado: quem roda os testes pode estar dentro do Claude Code.
function portao(raiz, entrada) {
  const env = { ...process.env }
  delete env.CLAUDE_PROJECT_DIR
  const r = spawnSync(process.execPath, [PORTAO], {
    cwd: os.tmpdir(),
    env,
    input: JSON.stringify({ cwd: raiz, ...entrada }),
    encoding: 'utf8',
  })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
}

const FIM_DO_EXECUTOR = { hook_event_name: 'SubagentStop', agent_type: 'anti-vibe:executor', agent_id: 'a1' }
const ENTREGA_DO_EXECUTOR = {
  hook_event_name: 'PreToolUse',
  agent_type: 'anti-vibe:executor',
  agent_id: 'a1',
  tool_name: 'SubagentHandback',
  tool_input: { message: 'pronto' },
}

const SPEC = (criterios) =>
  [
    '# Spec: exemplo',
    '',
    '> série: S1',
    '',
    ...criterios.map((c) => `#### ${c} — critério de exemplo · prova: automática\n`),
    '## Suposições',
    '',
    'Nenhuma.',
    '',
    '## Perguntas em aberto',
    '',
    'Nenhuma.',
    '',
  ].join('\n')

function issue(criterios, { arquivos = ['src/app.mjs'], excecoes = [] } = {}) {
  return [
    '# S1-01: Exemplo',
    '',
    '## Critérios de aceite',
    '',
    ...criterios.map((c) => `- **${c}** (automática) — critério de exemplo.`),
    '',
    '## Suposições',
    '',
    'Nenhuma.',
    '',
    '## Perguntas em aberto',
    '',
    'Nenhuma.',
    '',
    '## Arquivos',
    '',
    ...arquivos.map((a) => `- **Modificar:** \`${a}\``),
    '',
    '## Checklist',
    '',
    '- [x] feito',
    '',
    ...(excecoes.length
      ? ['## Exceções', '', '| Problema | Alvo | Motivo | Quem aprovou | Dia |', '|---|---|---|---|---|', ...excecoes, '']
      : []),
  ].join('\n')
}

function basico(criterios = ['CA-S1-01'], opcoes) {
  return {
    'pre-desenvolvimento/spec-exemplo.md': SPEC(criterios),
    'pre-desenvolvimento/issues/S1-01-exemplo.md': issue(criterios, opcoes),
    'src/app.mjs': 'export const app = 1\n',
  }
}

const CADASTRO = [
  "import { describe, it, expect } from 'vitest'",
  '',
  "describe('cadastro', () => {",
  "  it('recusa e-mail vazio', () => {",
  '    expect(1).toBe(1)',
  '  })',
  '',
  "  it('aceita e-mail válido', () => {",
  '    expect(2).toBe(2)',
  '  })',
  '',
  "  it('guarda o nome', () => {",
  '    expect(3).toBe(3)',
  '  })',
  '})',
  '',
].join('\n')

// Cada pasta e o conteúdo de cada arquivo, para comparar antes e depois.
function retrato(pasta) {
  const mapa = {}
  const andar = (p) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const caminho = path.join(p, e.name)
      if (e.isDirectory()) {
        mapa[`${path.relative(pasta, caminho)}${path.sep}`] = 'pasta'
        andar(caminho)
      } else mapa[path.relative(pasta, caminho)] = crypto.createHash('sha256').update(fs.readFileSync(caminho)).digest('hex')
    }
  }
  andar(pasta)
  return mapa
}

describe('P1-05 — Auditor contra trapaça, como portão de conclusão', () => {
  it('CA-P1-23: teste que já existia e foi alterado na implementação reprova, nomeando o teste', () => {
    const raiz = criarProjeto({ ...basico(), 'tests/cadastro.test.mjs': CADASTRO }, { git: true })
    escrever(raiz, { 'src/app.mjs': 'export const app = 2\n' })

    // Reindentar e acrescentar teste novo não é alterar teste.
    const reindentado = CADASTRO.replace("describe('cadastro', () => {", "describe('tudo', () => {\n  describe('cadastro', () => {")
      .split('\n')
      .map((l, i) => (i > 3 && l.trim() ? `  ${l}` : l))
      .join('\n')
      .replace(/\}\)\n$/, "  it('CA-S1-01: novo', () => {\n      expect(4).toBe(4)\n    })\n  })\n})\n")
    escrever(raiz, { 'tests/cadastro.test.mjs': reindentado })
    expect(doCodigo(problemasDa(raiz), 'TESTE_ALTERADO')).toEqual([])

    // Mudar o corpo de um teste antigo reprova, com o nome dele.
    escrever(raiz, { 'tests/cadastro.test.mjs': reindentado.replace('expect(2).toBe(2)', 'expect(true).toBe(true)') })
    const alterados = doCodigo(problemasDa(raiz), 'TESTE_ALTERADO')
    expect(alterados.map((p) => p.alvo)).toEqual(['tests/cadastro.test.mjs › cadastro › aceita e-mail válido'])
    expect(alterados[0].detalhe).toContain('foi alterado')
    expect(alterados[0].trava).toBe(true)
    expect(auditor(raiz, 'issue', 'S1-01', '--sem-rodar').saida).toContain('Veredito: não alinhada')

    // Teste que ainda não estava no commit, mudado depois do `antes`, também reprova.
    escrever(raiz, { 'tests/apoio.test.mjs': "import { it, expect } from 'vitest'\nit('apoio novo', () => {\n  expect(5).toBe(5)\n})\n" })
    auditor(raiz, 'antes', 'S1-01')
    escrever(raiz, { 'tests/apoio.test.mjs': "import { it, expect } from 'vitest'\nit('apoio novo', () => {\n  expect(6).toBe(6)\n})\n" })
    const depoisDoAntes = doCodigo(problemasDa(raiz), 'TESTE_ALTERADO').find((p) => p.alvo === 'tests/apoio.test.mjs › apoio novo')
    expect(depoisDoAntes.detalhe).toContain('registro antes')

    // Exceção escrita na issue libera aquele teste.
    escrever(raiz, {
      'pre-desenvolvimento/issues/S1-01-exemplo.md': issue(['CA-S1-01'], {
        excecoes: ['| TESTE_ALTERADO | tests/cadastro.test.mjs › cadastro › aceita e-mail válido | a regra mudou | Marcelle | 22/11/2026 |'],
      }),
    })
    expect(doCodigo(problemasDa(raiz), 'TESTE_ALTERADO').map((p) => p.alvo)).toEqual(['tests/apoio.test.mjs › apoio novo'])
  }, 120_000)

  it('CA-P1-23: comentário ou função de apoio entre testes e nomes repetidos em describes diferentes não viram teste alterado; mudar a preparação do arquivo, sim', () => {
    const base = [
      "import { describe, it, expect } from 'vitest'",
      "import { soma } from '../src/app.mjs'",
      '',
      "describe('a', () => {",
      "  it('funciona', () => {",
      '    expect(1).toBe(1)',
      '  })',
      '})',
      "describe('b', () => {",
      "  it('funciona', () => {",
      '    expect(2).toBe(2)',
      '  })',
      '})',
      '',
    ].join('\n')
    const raiz = criarProjeto({ ...basico(), 'tests/repetidos.test.mjs': base }, { git: true })
    const comAcrescimos = base
      // Teste novo de mesmo nome, num describe novo, acima dos antigos.
      .replace("describe('a', () => {", "describe('c', () => {\n  it('funciona', () => {\n    expect(0).toBe(0)\n  })\n})\ndescribe('a', () => {")
      // Comentário e constante entre o teste antigo e um teste novo.
      .replace(/\}\)\n\}\)\n$/, "})\n  // CA-S1-01\n  const dados = { nome: 'x' }\n  it('CA-S1-01: novo', () => {\n    expect(dados).toBeDefined()\n  })\n})\n")
    escrever(raiz, { 'tests/repetidos.test.mjs': comAcrescimos })
    expect(doCodigo(problemasDa(raiz), 'TESTE_ALTERADO')).toEqual([])

    // Trocar o import por uma imitação faz o teste passar sem o código: é alterar o teste.
    escrever(raiz, { 'tests/repetidos.test.mjs': base.replace("import { soma } from '../src/app.mjs'", 'const soma = (a, b) => a + b') })
    expect(doCodigo(problemasDa(raiz), 'TESTE_ALTERADO').map((p) => p.alvo)).toEqual(['tests/repetidos.test.mjs › (preparação)'])
  }, 60_000)

  it('CA-P1-24: apagar um teste reprova, dizendo quantos testes havia e quantos há', () => {
    const raiz = criarProjeto({ ...basico(), 'tests/cadastro.test.mjs': CADASTRO }, { git: true })
    escrever(raiz, { 'tests/cadastro.test.mjs': CADASTRO.replace("  it('guarda o nome', () => {\n    expect(3).toBe(3)\n  })\n", '') })
    const queda = doCodigo(problemasDa(raiz), 'TESTES_A_MENOS')
    expect(queda).toHaveLength(1)
    expect(queda[0].detalhe).toBe('havia 3 testes no último commit; agora há 2')
    expect(queda[0].trava).toBe(true)

    // Com o mesmo número de testes, nada.
    escrever(raiz, { 'tests/cadastro.test.mjs': CADASTRO })
    expect(doCodigo(problemasDa(raiz), 'TESTES_A_MENOS')).toEqual([])

    // Projeto numa subpasta do repositório, com acento no nome do arquivo de teste.
    const arquivos = Object.fromEntries(Object.entries({ ...basico(), 'tests/situação.test.mjs': CADASTRO }).map(([k, v]) => [`app/${k}`, v]))
    const repo = criarProjeto(arquivos, { git: true })
    escrever(repo, {
      'app/tests/situação.test.mjs': CADASTRO.replace("  it('guarda o nome', () => {\n    expect(3).toBe(3)\n  })\n", '').replace(
        "  it('aceita e-mail válido', () => {\n    expect(2).toBe(2)\n  })\n",
        ''
      ),
    })
    escrever(repo, { 'app/tests/novo.test.mjs': "import { it } from 'vitest'\nit.only('isolado na subpasta', () => {})\n" })
    const naSubpasta = problemasDa(path.join(repo, 'app'))
    expect(doCodigo(naSubpasta, 'TESTES_A_MENOS').map((p) => p.detalhe)).toEqual(['havia 3 testes no último commit; agora há 2'])
    expect(doCodigo(naSubpasta, 'TESTE_MARCADO').map((p) => p.alvo)).toEqual(['tests/novo.test.mjs › isolado na subpasta'])
  }, 60_000)

  it('CA-P1-25: teste novo pulado ou isolado reprova, nomeando o teste e a marcação', () => {
    const antigo = "import { it } from 'vitest'\nit.skip('antigo pulado', () => {})\n"
    const raiz = criarProjeto({ ...basico(), 'tests/antigo.test.mjs': antigo }, { git: true })
    escrever(raiz, {
      'tests/antigo.test.mjs': `${antigo}test.skip('novo no arquivo antigo', () => {})\n`,
      'tests/marcados.test.mjs': [
        "import { describe, it, test, expect } from 'vitest'",
        "it.only('isolado', () => {})",
        "it.skip('pulado', () => {})",
        "it.todo('por fazer')",
        "xit('pulado com x', () => {})",
        "describe.only('grupo isolado', () => {",
        "  it('dentro', () => {})",
        '})',
        'it.only(',
        "  'nome na linha de baixo',",
        '  () => {}',
        ')',
        "it.each([1, 2]).skip('cada um', () => {})",
        "it.skipIf(true)('pulado se', () => {})",
        "it('normal', () => {})",
        '',
      ].join('\n'),
    })
    const marcados = doCodigo(problemasDa(raiz), 'TESTE_MARCADO')
    const esperados = [
      'tests/antigo.test.mjs › novo no arquivo antigo | marcado com test.skip',
      'tests/marcados.test.mjs › isolado | marcado com it.only',
      'tests/marcados.test.mjs › pulado | marcado com it.skip',
      'tests/marcados.test.mjs › por fazer | marcado com it.todo',
      'tests/marcados.test.mjs › pulado com x | marcado com xit',
      'tests/marcados.test.mjs › grupo isolado | marcado com describe.only',
      'tests/marcados.test.mjs › nome na linha de baixo | marcado com it.only',
      'tests/marcados.test.mjs › cada um | marcado com it.skip',
      'tests/marcados.test.mjs › pulado se | marcado com it.skipIf',
    ].sort()
    expect(marcados.map((p) => `${p.alvo} | ${p.detalhe.split(' (')[0]}`).sort()).toEqual(esperados)
    expect(marcados.every((p) => p.trava)).toBe(true)

    // Um commit no meio do trabalho não apaga a acusação: a base é o commit do antes.
    const outra = criarProjeto({ ...basico(), 'tests/antigo.test.mjs': antigo }, { git: true })
    auditor(outra, 'antes', 'S1-01')
    escrever(outra, { 'tests/novo.test.mjs': "import { it } from 'vitest'\nit.only('escondido', () => {})\n" })
    commitar(outra)
    expect(doCodigo(problemasDa(outra), 'TESTE_MARCADO').map((p) => p.alvo)).toEqual(['tests/novo.test.mjs › escondido'])
  }, 60_000)

  it('CA-P1-26: mudar a configuração de testes, do CI ou do auditor sem a issue listar o arquivo reprova, nomeando o arquivo', () => {
    const raiz = criarProjeto(
      {
        ...basico(),
        'vitest.config.mjs': 'export default {}\n',
        '.github/workflows/ci.yml': 'on: push\n',
        '.claude/auditor.json': '{}\n',
      },
      { git: true }
    )
    escrever(raiz, {
      'src/app.mjs': 'export const app = 2\n',
      'vitest.config.mjs': 'export default { test: { passWithNoTests: true } }\n',
      '.github/workflows/ci.yml': 'on: workflow_dispatch\n',
      // Tentativa de tirar a própria configuração da conferência e esconder o resto.
      '.claude/auditor.json': '{ "configDeTeste": [], "foraDoEscopo": ["**"] }\n',
    })
    const problemas = problemasDa(raiz)
    expect(doCodigo(problemas, 'CONFIG_DE_TESTE_ALTERADA').map((p) => p.alvo).sort()).toEqual(
      ['.claude/auditor.json', '.github/workflows/ci.yml', 'vitest.config.mjs'].sort()
    )
    expect(doCodigo(problemas, 'CONFIG_DE_TESTE_ALTERADA').every((p) => p.trava)).toBe(true)

    // Listado na issue, não é acusado.
    escrever(raiz, {
      '.claude/auditor.json': '{}\n',
      'pre-desenvolvimento/issues/S1-01-exemplo.md': issue(['CA-S1-01'], {
        arquivos: ['src/app.mjs', 'vitest.config.mjs', '.github/workflows/ci.yml'],
      }),
    })
    expect(doCodigo(problemasDa(raiz), 'CONFIG_DE_TESTE_ALTERADA')).toEqual([])
  }, 60_000)

  it('CA-P1-27: o teste de um critério que já passava antes da implementação não prova o critério', () => {
    const raiz = criarProjeto({
      ...basico(['CA-S1-01', 'CA-S1-02']),
      'src/mat.mjs': 'export const soma = (a, b) => a + b\n',
      'tests/mat.test.mjs': [
        "import { it, expect } from 'vitest'",
        "import * as mat from '../src/mat.mjs'",
        "it('CA-S1-01: soma', () => { expect(mat.soma(1, 2)).toBe(3) })",
        "it('CA-S1-02: dobro', () => { expect(mat.dobro?.(2)).toBe(4) })",
        '',
      ].join('\n'),
    })
    const antes = auditor(raiz, 'antes', 'S1-01', '--json')
    expect(antes.status, antes.saida).toBe(1)
    expect(JSON.parse(antes.stdout).criterios).toEqual({ 'CA-S1-01': 'passou', 'CA-S1-02': 'falhou' })

    escrever(raiz, { 'src/mat.mjs': 'export const soma = (a, b) => a + b\nexport const dobro = (a) => a * 2\n' })
    const problemas = problemasDa(raiz, { rodar: true })
    const nunca = doCodigo(problemas, 'TESTE_NUNCA_FALHOU')
    expect(nunca.map((p) => p.alvo)).toEqual(['CA-S1-01'])
    expect(nunca[0].detalhe).toContain('não prova o critério')
    expect(nunca[0].trava).toBe(true)
    expect(problemas.filter((p) => p.alvo === 'CA-S1-02')).toEqual([])

    // Se o comando de teste nem roda, o antes não registra "falhou" nem sai com sucesso.
    const quebrado = criarProjeto({
      ...basico(),
      '.claude/auditor.json': '{ "comandoTeste": "node -e \\"process.exit(3)\\"" }\n',
      'tests/a.test.mjs': "import { it } from 'vitest'\nit('CA-S1-01: a', () => {})\n",
    })
    const semRodar = auditor(quebrado, 'antes', 'S1-01', '--json')
    expect(semRodar.status).toBe(1)
    expect(JSON.parse(semRodar.stdout).criterios).toEqual({ 'CA-S1-01': 'não rodou' })
  }, 120_000)

  it('CA-P1-28: o portão impede o executor de encerrar e devolve o critério que falta', () => {
    const raiz = criarProjeto(basico())
    // Sem issue ativa, o portão não tem o que conferir.
    expect(portao(raiz, FIM_DO_EXECUTOR).status).toBe(0)

    expect(auditor(raiz, 'antes', 'S1-01').status).toBe(1)
    const fim = portao(raiz, FIM_DO_EXECUTOR)
    expect(fim.status).toBe(2)
    expect(fim.stderr).toContain('critério sem teste (CRITERIO_SEM_TESTE) — CA-S1-01')

    const entrega = portao(raiz, ENTREGA_DO_EXECUTOR)
    expect(entrega.status).toBe(0)
    const decisao = JSON.parse(entrega.stdout).hookSpecificOutput
    expect(decisao.permissionDecision).toBe('deny')
    expect(decisao.permissionDecisionReason).toContain('CA-S1-01')

    // Outro agente, ou outra ferramenta do executor, passa direto.
    const outro = portao(raiz, { ...FIM_DO_EXECUTOR, agent_type: 'anti-vibe:revisor' })
    expect(outro.status).toBe(0)
    expect(outro.stderr).toBe('')
    expect(portao(raiz, { ...ENTREGA_DO_EXECUTOR, tool_name: 'Bash' }).stdout).toBe('')
  }, 60_000)

  it('CA-P1-28: mexer na issue ou quebrar a configuração não faz o portão liberar o critério que falta', () => {
    // Trocar a prova do critério para manual, depois do antes.
    const manual = criarProjeto(basico())
    auditor(manual, 'antes', 'S1-01')
    escrever(manual, {
      'pre-desenvolvimento/issues/S1-01-exemplo.md': issue(['CA-S1-01']).replace('(automática)', '(manual)'),
    })
    const r1 = portao(manual, FIM_DO_EXECUTOR)
    expect(r1.status).toBe(2)
    expect(r1.stderr).toContain('ISSUE_ALTERADA')
    expect(r1.stderr).toContain('Critérios de aceite')

    // Apagar a seção de critérios (a issue viraria "formato antigo").
    const sem = criarProjeto(basico())
    auditor(sem, 'antes', 'S1-01')
    escrever(sem, { 'pre-desenvolvimento/issues/S1-01-exemplo.md': '# S1-01: Exemplo\n\nSó texto.\n' })
    expect(portao(sem, FIM_DO_EXECUTOR).stderr).toContain('ISSUE_ALTERADA')

    // Configuração ilegível: o portão barra em vez de liberar.
    const ilegivel = criarProjeto(basico())
    auditor(ilegivel, 'antes', 'S1-01')
    escrever(ilegivel, { '.claude/auditor.json': '{' })
    const r3 = portao(ilegivel, FIM_DO_EXECUTOR)
    expect(r3.status).toBe(2)
    expect(r3.stderr).toContain('PORTAO_SEM_CONFERENCIA')

    // Issue sumida da pasta: também barra.
    const sumida = criarProjeto(basico())
    auditor(sumida, 'antes', 'S1-01')
    escrever(sumida, { 'pre-desenvolvimento/issues/S1-01-exemplo.md': null })
    expect(portao(sumida, FIM_DO_EXECUTOR).stderr).toContain('a issue ativa não foi encontrada')
  }, 60_000)

  it('CA-P1-29: no limite de reprovações o portão deixa o executor parar e o auditor registra que a issue precisa de decisão humana', () => {
    const raiz = criarProjeto(basico())
    auditor(raiz, 'antes', 'S1-01')
    expect(portao(raiz, FIM_DO_EXECUTOR).stderr).toContain('tentativa 1 de 3')
    expect(portao(raiz, FIM_DO_EXECUTOR).stderr).toContain('tentativa 2 de 3')
    const terceira = portao(raiz, FIM_DO_EXECUTOR)
    expect(terceira.status).toBe(0)
    expect(JSON.parse(terceira.stdout).systemMessage).toContain('precisa de decisão humana')

    const registro = JSON.parse(fs.readFileSync(path.join(raiz, '.claude', 'auditor-registro.json'), 'utf8'))
    expect(registro.issues['S1-01']).toMatchObject({ tentativas: 3, precisaDecisao: true })
    const aviso = doCodigo(problemasDa(raiz), 'DECISAO_HUMANA')
    expect(aviso).toHaveLength(1)
    expect(aviso[0].detalhe).toContain('3 vezes')

    // Depois do limite, continua liberando; um novo `antes` recomeça a contagem.
    expect(portao(raiz, FIM_DO_EXECUTOR).status).toBe(0)
    const depois = JSON.parse(fs.readFileSync(path.join(raiz, '.claude', 'auditor-registro.json'), 'utf8'))
    expect(depois.issues['S1-01'].tentativas).toBe(3)
    auditor(raiz, 'antes', 'S1-01')
    expect(portao(raiz, FIM_DO_EXECUTOR).stderr).toContain('tentativa 1 de 3')
  }, 60_000)

  it('CA-P1-54: o estado dos critérios e as tentativas ficam em arquivos do projeto, e a pasta do plugin não muda', () => {
    const antes = retrato(PLUGIN)
    for (const git of [true, false]) {
      const raiz = criarProjeto(basico(), { git })
      auditor(raiz, 'antes', 'S1-01')
      portao(raiz, FIM_DO_EXECUTOR)
      const onde = git ? path.join(raiz, '.git', 'auditor-registro.json') : path.join(raiz, '.claude', 'auditor-registro.json')
      const registro = JSON.parse(fs.readFileSync(onde, 'utf8'))
      expect(registro.ativa).toBe('S1-01')
      expect(registro.issues['S1-01'].antes.criterios).toEqual({ 'CA-S1-01': 'sem teste' })
      expect(registro.issues['S1-01'].tentativas).toBe(1)
    }
    expect(retrato(PLUGIN)).toEqual(antes)
  }, 60_000)
})
