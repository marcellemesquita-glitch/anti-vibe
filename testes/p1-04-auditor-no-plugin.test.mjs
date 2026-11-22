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

const criados = []

// Projeto de exemplo numa pasta temporária, fora deste repositório. O `node_modules`
// é um atalho para o deste repositório, para o Vitest rodar lá dentro.
function criarProjeto(arquivos, { git = false } = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'anti-vibe-p1-04-'))
  criados.push(raiz)
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    const destino = path.join(raiz, rel)
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    fs.writeFileSync(destino, conteudo)
  }
  atalho(path.join(RAIZ, 'node_modules'), path.join(raiz, 'node_modules'))
  if (git) {
    fs.writeFileSync(path.join(raiz, '.gitignore'), 'node_modules\n')
    spawnSync('git', ['init', '-q'], { cwd: raiz })
  }
  return raiz
}

// Junction: no Windows não precisa de permissão de administrador.
const atalhos = []
function atalho(alvo, onde) {
  fs.symlinkSync(alvo, onde, 'junction')
  atalhos.push(onde)
}

// Desfaz os atalhos antes de apagar as pastas, para nunca seguir um deles.
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

function auditor(raiz, ...args) {
  const r = spawnSync(process.execPath, [AUDITOR, ...args], { cwd: raiz, encoding: 'utf8' })
  return { status: r.status, saida: `${r.stdout}\n${r.stderr}`, stdout: r.stdout }
}

function spec(serie, criterios) {
  return [
    `# Spec: exemplo ${serie}`,
    '',
    `> série: ${serie}`,
    '',
    '## Módulos',
    '',
    ...criterios.map(([codigo, prova]) => `#### ${codigo} — critério de exemplo · prova: ${prova}\n`),
    '## Suposições',
    '',
    'Nenhuma.',
    '',
    '## Perguntas em aberto',
    '',
    'Nenhuma.',
    '',
  ].join('\n')
}

function issue(titulo, criterios, { suposicoes = 'Nenhuma.' } = {}) {
  return [
    `# ${titulo}`,
    '',
    '## Critérios de aceite',
    '',
    ...criterios.map(([codigo, prova]) => `- **${codigo}** (${prova}) — critério de exemplo.`),
    '',
    '## Suposições',
    '',
    suposicoes,
    '',
    '## Perguntas em aberto',
    '',
    'Nenhuma.',
    '',
  ].join('\n')
}

function teste(codigo, passa = true) {
  return `import { it, expect } from 'vitest'\nit('${codigo}: exemplo', () => { expect(${passa}).toBe(true) })\n`
}

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

describe('P1-04 — Auditor rodando de dentro do plugin em qualquer projeto', () => {
  it('CA-P1-30: sem configuração no projeto, o auditor do plugin acha spec e issue em pre-desenvolvimento/ e dá o veredito', () => {
    const raiz = criarProjeto({
      'pre-desenvolvimento/spec-exemplo.md': spec('X1', [['CA-X1-01', 'automática']]),
      'pre-desenvolvimento/issues/X1-01-exemplo.md': issue('X1-01: Exemplo', [['CA-X1-01', 'automática']]),
      'tests/x1.test.mjs': teste('CA-X1-01'),
    })
    expect(fs.existsSync(path.join(raiz, '.claude'))).toBe(false)

    const r = auditor(raiz, 'issue', 'X1-01', '--json')
    expect(r.status, r.saida).toBe(0)
    const rel = JSON.parse(r.stdout)
    expect(rel.issue).toBe('pre-desenvolvimento/issues/X1-01-exemplo.md')
    expect(rel.problemas.map((p) => p.codigo)).not.toContain('SPEC_NAO_ENCONTRADA')
    expect(rel.problemas.map((p) => p.codigo)).toEqual([])
    expect(rel.veredito).toBe('alinhada')
  }, 60_000)

  it('o auditor roda e reprova também quando chamado por um atalho para a pasta do plugin', () => {
    const raiz = criarProjeto({
      'pre-desenvolvimento/spec-exemplo.md': spec('X1', [['CA-X1-01', 'automática']]),
      'pre-desenvolvimento/issues/X1-01-exemplo.md': issue('X1-01: Exemplo', [['CA-X1-01', 'automática']]),
    })
    const pelaPorta = path.join(raiz, 'plugin-por-atalho')
    atalho(PLUGIN, pelaPorta)
    const r = spawnSync(process.execPath, [path.join(pelaPorta, 'auditor', 'auditor.mjs'), 'issue', 'X1-01'], { cwd: raiz, encoding: 'utf8' })
    expect(r.stdout).toContain('CRITERIO_SEM_TESTE')
    expect(r.status).toBe(1)
  }, 60_000)

  it('CA-P1-31: com configuração no projeto, o auditor usa as pastas do projeto e ignora as padrão', () => {
    const raiz = criarProjeto({
      '.claude/auditor.json': JSON.stringify({
        pastaIssues: 'docs/planos/tarefas',
        pastaSpecs: 'docs/planos',
        pastasTestes: ['verificacoes'],
        arquivoLicoes: 'docs/planos/licoes.md',
      }),
      'docs/planos/spec-planos.md': spec('X1', [['CA-X1-01', 'automática']]),
      'docs/planos/tarefas/X1-01-de-verdade.md': issue('X1-01: A issue do projeto', [['CA-X1-01', 'automática']]),
      'verificacoes/x1.test.mjs': teste('CA-X1-01'),
      // Iscas nas pastas padrão: se o auditor olhar para elas, o veredito muda.
      'pre-desenvolvimento/spec-isca.md': spec('X1', [['CA-X1-09', 'automática']]),
      'pre-desenvolvimento/issues/X1-01-isca.md': issue('X1-01: Isca', [['CA-X1-01', 'automática']], {
        suposicoes: '| ID | Suposição | Status | Resolução |\n|---|---|---|---|\n| SUP-X1-01 | isca | aberta | — |',
      }),
      'tests/isca.test.mjs': teste('CA-X1-01', false),
    })

    const r = auditor(raiz, 'issue', 'X1-01', '--json')
    expect(r.status, r.saida).toBe(0)
    const rel = JSON.parse(r.stdout)
    expect(rel.issue).toBe('docs/planos/tarefas/X1-01-de-verdade.md')
    expect(rel.titulo).toBe('X1-01: A issue do projeto')
    expect(rel.problemas.map((p) => p.codigo)).toEqual([])
    expect(rel.veredito).toBe('alinhada')
  }, 60_000)

  it('CA-P1-32: lição, sinais e confirmação de teste manual ficam no projeto e nenhum arquivo do plugin muda', () => {
    const antes = retrato(PLUGIN)
    const arquivos = {
      'pre-desenvolvimento/spec-exemplo.md': spec('X1', [['CA-X1-01', 'automática'], ['CA-X1-02', 'manual']]),
      'pre-desenvolvimento/issues/X1-01-exemplo.md': issue('X1-01: Exemplo', [['CA-X1-01', 'automática'], ['CA-X1-02', 'manual']]),
    }

    for (const git of [true, false]) {
      const raiz = criarProjeto(arquivos, { git })

      // CA-X1-01 não tem teste: o auditor reprova e guarda o sinal.
      expect(auditor(raiz, 'issue', 'X1-01').status).toBe(1)
      const sinais = git ? path.join(raiz, '.git', 'auditor-sinais.json') : path.join(raiz, '.claude', 'auditor-sinais.json')
      expect(JSON.parse(fs.readFileSync(sinais, 'utf8')).map((s) => s.codigo)).toContain('CRITERIO_SEM_TESTE')

      const licao = auditor(raiz, 'licao', 'adicionar', 'X1-01', '--falha', 'CRITERIO_SEM_TESTE', '--texto', 'Todo critério automático nasce com teste.')
      expect(licao.status, licao.saida).toBe(0)
      expect(fs.readFileSync(path.join(raiz, 'pre-desenvolvimento', 'licoes.md'), 'utf8')).toContain('| L-01 | Todo critério automático nasce com teste.')

      const confirmar = auditor(raiz, 'confirmar', 'X1-01', 'CA-X1-02', '--por', 'Pessoa', '--dia', '21/11/2026')
      expect(confirmar.status, confirmar.saida).toBe(0)
      expect(fs.readFileSync(path.join(raiz, 'pre-desenvolvimento', 'issues', 'X1-01-exemplo.md'), 'utf8')).toContain('| CA-X1-02 | Pessoa | 21/11/2026 |')
    }

    expect(retrato(PLUGIN)).toEqual(antes)
  }, 60_000)

  it('CA-P1-33: o plugin traz só a regra genérica de segredo no frontend, sem nomes de chave de um projeto', () => {
    // Além das regras do auditor, só o modelo opcional que o novo-projeto copia para o
    // projeto quando a pessoa pede (SUP-P1-80), com as duas regras de exemplo e sem
    // nenhum nome de chave.
    const MODELO = path.join('modelos', 'opcionais', 'auditor-regras.json')
    const arquivosDeRegra = Object.keys(retrato(PLUGIN)).filter((a) => /regras.*\.json$/.test(path.basename(a)))
    expect(arquivosDeRegra.sort()).toEqual([path.join('auditor', 'regras.json'), MODELO].sort())
    // O modelo inteiro, campo por campo: qualquer conteúdo de projeto derruba o teste.
    expect(JSON.parse(fs.readFileSync(path.join(PLUGIN, MODELO), 'utf8'))).toEqual([
      {
        id: 'arquivo-gerado',
        nome: 'arquivo gerado mexido sem mexer na fonte dele',
        origem: 'exemplo do anti-vibe: arquivo gerado por ferramenta só muda quando a fonte muda (ajuste os caminhos ao projeto)',
        tipo: 'intocavel',
        arquivos: ['**/generated/**'],
        salvoSeMudar: ['**/schema/**'],
        oQueFazer: 'mude a fonte do arquivo gerado e gere de novo; não edite o arquivo gerado à mão',
      },
      {
        id: 'componente-pronto',
        nome: 'elemento cru no lugar do componente pronto do projeto',
        origem: 'exemplo do anti-vibe: reuso de código, regra 3 das regras sempre ativas (ajuste os caminhos e o elemento ao projeto)',
        tipo: 'conteudo',
        arquivos: ['**/*.{tsx,jsx}'],
        excluir: ['**/components/**', '**/*.test.{tsx,jsx}'],
        padrao: '<button\\b',
        oQueFazer: 'use o componente pronto do projeto para esse elemento, em vez do elemento cru',
      },
    ])

    const regras = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'auditor', 'regras.json'), 'utf8'))
    expect(regras.map((r) => r.id)).toEqual(['segredo-no-frontend'])
    const [regra] = regras
    expect(regra.tipo).toBe('conteudo')
    expect(new RegExp(regra.somenteSe, 'm').test("'use client'\n")).toBe(true)

    // Os nomes de chave citados no padrão são só os genéricos.
    const nomes = new Set(regra.padrao.match(/_?[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_?/g) || [])
    expect([...nomes].sort()).toEqual(['NEXT_PUBLIC_', 'NODE_ENV', 'SERVICE_ROLE_KEY', '_SECRET'])

    // E o padrão pega segredo de qualquer projeto, deixando passar o que é público.
    const padrao = new RegExp(regra.padrao)
    expect(padrao.test('const k = process.env.QUALQUER_CHAVE')).toBe(true)
    expect(padrao.test('const k = process.env.NEXT_PUBLIC_URL')).toBe(false)
    expect(padrao.test('if (process.env.NODE_ENV === "test")')).toBe(false)
  })
})
