import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN = path.join(RAIZ, 'plugins', 'anti-vibe')
const SKILLS = path.join(PLUGIN, 'skills')

const ETAPAS = ['triagem', 'spec', 'break', 'plan', 'execute', 'testes', 'revisildo', 'issue']
const TODAS = [...ETAPAS, 'auditor']

// Termos que só existem no CRM, guardados por hash para nem este teste publicá-los.
// Ordem: o nome do sistema de tarefas, o banco, a coluna de isolamento, o nome da outra
// pessoa, o repositório do CRM, o comando de limpeza do banco e o aparelho de teste.
const HASHES_DO_CRM = new Set([
  'c0d67255424148d869b8c00b4e7c27645b97147e36aaf9538a661a3d87883098',
  '4d7594e57f7d03f35ede2d316cda4cdb7df66b28963738e836a2f16d9fc9eb4d',
  '98608ef93fc8ae9aeae45f80e214cfab75b37fb38538b7e4d08ad3e90df5f77e',
  '22783f0252bcaaefacf263eacb5ec3603e66b4ce318cdcae0e3db9e624e3b014',
  '38617b6df033561e1b3d6486680c2b399bd2f2afbc602aac271778da285f346c',
  'd354bbdc0becc39d056816bfcfd93ec9e3bb3e1f7087c9049d3cce25018fe058',
  'd7cea7305a333d5c9cebd7891abbee78960632bbb1fa5dd24122b940ff823ace',
])

function sha256(texto) {
  return crypto.createHash('sha256').update(texto).digest('hex')
}

function arquivosDoPlugin(pasta = PLUGIN) {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const caminho = path.join(pasta, e.name)
    return e.isDirectory() ? arquivosDoPlugin(caminho) : [caminho]
  })
}

function ler(caminho) {
  return fs.readFileSync(caminho, 'utf8').replace(/\r\n/g, '\n')
}

function rel(caminho) {
  return path.relative(RAIZ, caminho).split(path.sep).join('/')
}

// Palavras em minúsculas; com hífen, entram inteiras, por parte e em pares vizinhos.
function palavras(texto) {
  const saida = new Set()
  for (const bruta of texto.toLowerCase().match(/[a-z0-9_]+(?:-[a-z0-9_]+)*/g) || []) {
    const partes = bruta.split('-')
    saida.add(bruta)
    partes.forEach((p, i) => {
      saida.add(p)
      if (i > 0) saida.add(`${partes[i - 1]}-${p}`)
    })
  }
  return saida
}

function frontmatter(texto) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(texto)
  if (!m) return {}
  return Object.fromEntries(
    m[1]
      .split('\n')
      .map((l) => /^([a-z-]+):\s*(.*)$/.exec(l))
      .filter(Boolean)
      .map(([, chave, valor]) => [chave, valor.trim()])
  )
}

// Skills do plugin pelo nome do frontmatter, que é o que vira o comando
// `/anti-vibe:<nome>` (a pasta pode ter outro nome).
function skillsPorNome() {
  const mapa = new Map()
  for (const e of fs.readdirSync(SKILLS, { withFileTypes: true })) {
    const arquivo = path.join(SKILLS, e.name, 'SKILL.md')
    if (!e.isDirectory() || !fs.existsSync(arquivo)) continue
    const fm = frontmatter(ler(arquivo))
    mapa.set(fm.name || e.name, { arquivo, fm })
  }
  return mapa
}

const criados = []
afterAll(() => {
  for (const raiz of criados) {
    try {
      fs.rmSync(raiz, { recursive: true, force: true })
    } catch {}
  }
})

describe('P1-02 — Etapas do fluxo como skills do plugin', () => {
  it('CA-P1-07: o plugin tem as skills triagem, spec, break, plan, execute, testes, revisildo, auditor e issue, cada uma com nome e descrição', () => {
    const skills = skillsPorNome()
    for (const etapa of TODAS) {
      const skill = skills.get(etapa)
      expect(skill, `falta a skill ${etapa}`).toBeDefined()
      expect(skill.fm.name, `nome da skill ${etapa}`).toBe(etapa)
      expect((skill.fm.description || '').length, `descrição da skill ${etapa}`).toBeGreaterThan(40)
    }
  })

  it('CA-P1-08: nenhum texto do plugin traz termos que só existem no CRM', () => {
    const achados = []
    for (const arquivo of arquivosDoPlugin()) {
      const texto = ler(arquivo)
      const termos = [...palavras(texto)].filter((p) => HASHES_DO_CRM.has(sha256(p)))
      if (termos.length) achados.push(`${rel(arquivo)}: termo do CRM`)
      const modulo = /m[óo]dulo[\s_-]*[0-7]\b/i.exec(texto)
      if (modulo) achados.push(`${rel(arquivo)}: "${modulo[0]}"`)
    }
    expect(achados).toEqual([])
  })

  it('CA-P1-09: nenhum texto do plugin cita a pasta pessoal nem o auditor dentro do projeto, e toda chamada a script aponta para a pasta do plugin', () => {
    const proibidos = [
      /\$\{?HOME\}?[\\/]\.claude/,
      /\$env:(USERPROFILE|HOME)/i,
      /~[\\/]\.claude/,
      /%USERPROFILE%/i,
      /\b[A-Za-z]:[\\/]Users[\\/]/,
      /(^|[\s"'`(])\/(Users|home)\/[a-z]/m,
      /\.claude[\\/]skills[\\/]auditor/,
    ]
    const achados = []
    const chamadas = []
    for (const arquivo of arquivosDoPlugin()) {
      const texto = ler(arquivo)
      for (const re of proibidos) if (re.test(texto)) achados.push(`${rel(arquivo)}: ${re}`)

      // Toda menção ao script do auditor em texto de skill, agente ou gancho vem do plugin.
      // Em código .mjs do plugin vale também o caminho montado a partir da pasta do
      // plugin (SUP-P1-38): `path.join(raizDoPlugin, 'auditor', 'auditor.mjs')`, com
      // raizDoPlugin calculada a partir do próprio arquivo, uma pasta acima.
      if (!arquivo.endsWith('auditor.mjs')) {
        const raizDoPluginNoCodigo =
          arquivo.endsWith('.mjs') &&
          path.dirname(path.dirname(arquivo)) === PLUGIN &&
          texto.includes("const raizDoPlugin = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')")
        for (const m of texto.matchAll(/(\S*)auditor\.mjs/g)) {
          const montadoDoPlugin =
            raizDoPluginNoCodigo &&
            texto.slice(Math.max(0, m.index - 40), m.index + m[0].length + 2).includes("path.join(raizDoPlugin, 'auditor', 'auditor.mjs')")
          if (m[1].endsWith('${CLAUDE_PLUGIN_ROOT}/auditor/') || montadoDoPlugin) chamadas.push(m[0])
          else achados.push(`${rel(arquivo)}: ${m[0]}`)
        }
      }
      // Todo script chamado com `node` nas instruções sai da pasta do plugin.
      if (arquivo.endsWith('.md')) {
        for (const m of texto.matchAll(/\bnode\s+"?([^\s"`]+\.[cm]?js)\b/g)) {
          if (!m[1].startsWith('${CLAUDE_PLUGIN_ROOT}/')) achados.push(`${rel(arquivo)}: node ${m[1]}`)
        }
      }
      // Todo caminho a partir da raiz do plugin existe.
      for (const m of texto.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+[\w])/g)) {
        if (!fs.existsSync(path.join(PLUGIN, m[1]))) achados.push(`${rel(arquivo)}: \${CLAUDE_PLUGIN_ROOT}/${m[1]} não existe`)
      }
    }
    expect(achados).toEqual([])
    expect(chamadas.length).toBeGreaterThan(0)
  })

  it('CA-P1-10: as skills de etapa mandam ler o AGENTS.md da raiz e, na falta dele, o CLAUDE.md', () => {
    const skills = skillsPorNome()
    for (const etapa of ETAPAS) {
      expect(skills.get(etapa), `falta a skill ${etapa}`).toBeDefined()
      const texto = ler(skills.get(etapa).arquivo)
      // Antes da primeira seção: é a primeira coisa que a etapa manda fazer.
      const abertura = texto.split(/\n## /)[0].replace(/\s+/g, ' ')
      const agents = abertura.indexOf('leia o `AGENTS.md` da raiz do projeto')
      const claude = abertura.indexOf('Se ele não existir, leia o `CLAUDE.md` da raiz')
      expect(agents, `${etapa}: falta mandar ler o AGENTS.md`).toBeGreaterThanOrEqual(0)
      expect(claude, `${etapa}: falta o CLAUDE.md na falta do AGENTS.md`).toBeGreaterThan(agents)
    }
  })

  it('o auditor confere a issue avulsa sem cobrar spec, e continua cobrando da issue comum', () => {
    const issue = (tipo) =>
      [
        '# S1-01: Exemplo',
        '',
        `**Tipo:** ${tipo}`,
        '',
        '## Critérios de aceite',
        '',
        '- **CA-S1-01** (automática) — critério de exemplo.',
        '',
        '## Suposições',
        '',
        'Nenhuma.',
        '',
        '## Perguntas em aberto',
        '',
        'Nenhuma.',
        '',
      ].join('\n')
    // Spec da série S1 com outro critério: a issue que se diz avulsa não escapa dela.
    const spec = '# Spec: exemplo\n\n> série: S1\n\n#### CA-S1-09 — outro · prova: automática\n\n## Suposições\n\nNenhuma.\n\n## Perguntas em aberto\n\nNenhuma.\n'
    const auditar = (tipo, { comando = 'issue', comSpec = false } = {}) => {
      const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'anti-vibe-p1-02-'))
      criados.push(raiz)
      fs.mkdirSync(path.join(raiz, 'pre-desenvolvimento', 'issues'), { recursive: true })
      fs.writeFileSync(path.join(raiz, 'pre-desenvolvimento', 'issues', 'S1-01-exemplo.md'), issue(tipo))
      if (comSpec) fs.writeFileSync(path.join(raiz, 'pre-desenvolvimento', 'spec-exemplo.md'), spec)
      fs.mkdirSync(path.join(raiz, 'tests'))
      fs.writeFileSync(path.join(raiz, 'tests', 's1.test.mjs'), "it('CA-S1-01: exemplo', () => {})\n")
      const alvo = comando === 'issue' ? 'S1-01' : 'S1'
      const r = spawnSync(process.execPath, [path.join(PLUGIN, 'auditor', 'auditor.mjs'), comando, alvo, '--sem-rodar', '--json'], {
        cwd: raiz,
        encoding: 'utf8',
      })
      const rel = JSON.parse(r.stdout)
      return [...rel.problemas, ...(rel.issues || []).flatMap((i) => i.problemas)].map((p) => p.codigo)
    }
    expect(auditar('Avulsa')).toEqual(['PROVA_NAO_CONFERIDA'])
    expect(auditar('Avulsa', { comando: 'serie' })).toEqual(['PROVA_NAO_CONFERIDA'])
    expect(auditar('Implementação')).toContain('SPEC_NAO_ENCONTRADA')
    expect(auditar('Implementação', { comando: 'serie' })).toContain('SPEC_NAO_ENCONTRADA')
    expect(auditar('Avulsa', { comSpec: true })).toContain('CRITERIO_FORA_DA_SPEC')
  })
})
