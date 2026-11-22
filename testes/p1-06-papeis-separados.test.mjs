import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN = path.join(RAIZ, 'plugins', 'anti-vibe')
const AGENTES = path.join(PLUGIN, 'agents')
const AUDITOR = path.join(PLUGIN, 'auditor', 'auditor.mjs')
const PORTAO = path.join(PLUGIN, 'hooks', 'portao.mjs')
const PAPEIS = path.join(PLUGIN, 'hooks', 'papeis.mjs')

const criados = []
const atalhos = []

// Projeto de exemplo numa pasta temporária, com o `node_modules` deste repositório por
// atalho (junction), para o Vitest rodar lá dentro.
function criarProjeto(arquivos) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'anti-vibe-p1-06-'))
  criados.push(raiz)
  escrever(raiz, arquivos)
  fs.symlinkSync(path.join(RAIZ, 'node_modules'), path.join(raiz, 'node_modules'), 'junction')
  atalhos.push(path.join(raiz, 'node_modules'))
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
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    fs.writeFileSync(destino, conteudo)
  }
}

function ler(caminho) {
  return fs.readFileSync(caminho, 'utf8').replace(/\r\n/g, '\n')
}

function frontmatter(texto) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(texto)
  if (!m) return {}
  return Object.fromEntries(
    m[1]
      .split('\n')
      .map((l) => /^([A-Za-z-]+):\s*(.*)$/.exec(l))
      .filter(Boolean)
      .map(([, chave, valor]) => [chave, valor.trim()])
  )
}

function agente(nome) {
  const texto = ler(path.join(AGENTES, `${nome}.md`))
  return { texto, fm: frontmatter(texto), corpo: texto.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/\s+/g, ' ') }
}

function auditor(raiz, ...args) {
  const r = spawnSync(process.execPath, [AUDITOR, ...args], { cwd: raiz, encoding: 'utf8' })
  return { status: r.status, saida: `${r.stdout}\n${r.stderr}`, stdout: r.stdout }
}

// Sem CLAUDE_PROJECT_DIR herdado: quem roda os testes pode estar dentro do Claude Code.
function gancho(script, raiz, entrada) {
  const env = { ...process.env }
  delete env.CLAUDE_PROJECT_DIR
  const r = spawnSync(process.execPath, [script], { cwd: os.tmpdir(), env, input: JSON.stringify({ cwd: raiz, ...entrada }), encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
}

function edicao(raiz, agentType, arquivo, { ferramenta = 'Edit' } = {}) {
  const absoluto = path.isAbsolute(arquivo) ? arquivo : path.join(raiz, arquivo)
  const r = gancho(PAPEIS, raiz, {
    hook_event_name: 'PreToolUse',
    agent_type: agentType,
    agent_id: 'x1',
    tool_name: ferramenta,
    tool_input: ferramenta === 'NotebookEdit' ? { notebook_path: absoluto, new_source: 'x' } : { file_path: absoluto, old_string: 'a', new_string: 'b' },
  })
  expect(r.status).toBe(0)
  if (!r.stdout.trim()) return 'permite'
  return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision === 'deny' ? 'nega' : 'permite'
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

function issue(criterios) {
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
    '- **Modificar:** `src/mat.mjs`',
    '',
    '## Checklist',
    '',
    '- [x] feito',
    '',
  ].join('\n')
}

function projeto(testes) {
  return criarProjeto({
    'pre-desenvolvimento/spec-exemplo.md': SPEC(['CA-S1-01', 'CA-S1-02']),
    'pre-desenvolvimento/issues/S1-01-exemplo.md': issue(['CA-S1-01', 'CA-S1-02']),
    'src/mat.mjs': 'export const soma = (a, b) => a + b\n',
    'tests/mat.test.mjs': ["import { it, expect } from 'vitest'", "import * as mat from '../src/mat.mjs'", ...testes, ''].join('\n'),
  })
}

const FIM_DO_ESCRITOR = { hook_event_name: 'SubagentStop', agent_type: 'anti-vibe:escritor-de-testes', agent_id: 'e1' }
const TESTE_DO_DOBRO = "it('CA-S1-01: dobro', () => { expect(mat.dobro?.(2)).toBe(4) })"
const TESTE_DO_TRIPLO = "it('CA-S1-02: triplo', () => { expect(mat.triplo?.(2)).toBe(6) })"

describe('P1-06 — Papéis separados', () => {
  it('CA-P1-13: o plugin tem os agentes planejador, escritor de testes, executor e revisor, cada um com descrição, ferramentas e modelo', () => {
    const modelos = { planejador: 'opus', 'escritor-de-testes': 'sonnet', executor: 'sonnet', revisor: 'opus' }
    for (const [nome, modelo] of Object.entries(modelos)) {
      const { fm } = agente(nome)
      expect(fm.name, `nome do ${nome}`).toBe(nome)
      expect((fm.description || '').length, `descrição do ${nome}`).toBeGreaterThan(40)
      expect((fm.tools || '').split(',').map((t) => t.trim()).filter(Boolean).length, `ferramentas do ${nome}`).toBeGreaterThan(0)
      expect(fm.model, `modelo do ${nome}`).toBe(modelo)
    }
    const doRevisor = agente('revisor').fm.tools.split(',').map((t) => t.trim())
    expect(doRevisor.filter((t) => ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(t))).toEqual([])
  })

  it('CA-P1-14: o executor não pode escrever testes e o escritor de testes não pode alterar código que não seja de teste', () => {
    expect(agente('executor').corpo).toContain('Você não cria, não altera e não apaga teste.')
    expect(agente('escritor-de-testes').corpo).toContain('Você não altera código que não seja de teste.')

    // O gancho de papéis garante o que as definições dizem.
    const raiz = projeto([TESTE_DO_DOBRO])
    const executor = 'anti-vibe:executor'
    const escritor = 'anti-vibe:escritor-de-testes'
    expect(edicao(raiz, executor, 'tests/mat.test.mjs')).toBe('nega')
    expect(edicao(raiz, executor, 'tests/mat.test.mjs', { ferramenta: 'MultiEdit' })).toBe('nega')
    expect(edicao(raiz, executor, 'tests/analise.ipynb', { ferramenta: 'NotebookEdit' })).toBe('nega')
    expect(edicao(raiz, executor, 'src/__tests__/apoio.mjs')).toBe('nega')
    expect(edicao(raiz, executor, 'vitest.config.mjs')).toBe('nega')
    expect(edicao(raiz, executor, '.claude/auditor.json')).toBe('nega')
    expect(edicao(raiz, executor, '.claude/auditor-registro.json')).toBe('nega')
    expect(edicao(raiz, executor, '.git/auditor-registro.json')).toBe('nega')
    expect(edicao(raiz, executor, path.join(PLUGIN, 'auditor', 'auditor.mjs'))).toBe('nega')
    expect(edicao(raiz, executor, 'src/mat.mjs')).toBe('permite')
    // Na issue, só o checklist e as suposições (critérios e arquivos o auditor protege).
    expect(edicao(raiz, executor, 'pre-desenvolvimento/issues/S1-01-exemplo.md')).toBe('permite')
    if (process.platform !== 'linux') {
      // Disco sem diferença de maiúsculas: a caixa não fura o gancho.
      expect(edicao(raiz, executor, 'TESTS/Mat.TEST.mjs')).toBe('nega')
      expect(edicao(raiz, executor, 'Vitest.Config.mjs')).toBe('nega')
      expect(edicao(raiz, executor, '.Claude/Auditor.json')).toBe('nega')
      expect(edicao(raiz, 'anti-vibe:planejador', 'Pre-Desenvolvimento/issues/S1-01-exemplo.md')).toBe('permite')
    }
    expect(edicao(raiz, escritor, 'tests/mat.test.mjs')).toBe('permite')
    expect(edicao(raiz, escritor, 'src/__tests__/apoio.mjs')).toBe('permite')
    expect(edicao(raiz, escritor, 'src/mat.mjs')).toBe('nega')
    expect(edicao(raiz, escritor, '.claude/auditor-registro.json')).toBe('nega')
    expect(edicao(raiz, 'anti-vibe:planejador', 'pre-desenvolvimento/issues/S1-01-exemplo.md')).toBe('permite')
    expect(edicao(raiz, 'anti-vibe:planejador', 'src/mat.mjs')).toBe('nega')
    expect(edicao(raiz, escritor, path.join(os.tmpdir(), 'fora', 'x.test.mjs'))).toBe('nega')
    expect(edicao(raiz, 'anti-vibe:revisor', 'src/mat.mjs')).toBe('nega')
    // Fora dos agentes da esteira, o gancho não opina.
    expect(edicao(raiz, undefined, 'tests/mat.test.mjs')).toBe('permite')
  }, 60_000)

  it('CA-P1-15: ao fim da etapa de testes há um teste por critério automático e o auditor registra que eles falham antes da implementação', () => {
    const raiz = projeto([TESTE_DO_DOBRO, TESTE_DO_TRIPLO])
    expect(auditor(raiz, 'iniciar', 'S1-01').status).toBe(0)
    const fim = gancho(PORTAO, raiz, FIM_DO_ESCRITOR)
    expect(fim.status, fim.stderr).toBe(0)
    const registro = JSON.parse(fs.readFileSync(path.join(raiz, '.claude', 'auditor-registro.json'), 'utf8'))
    expect(registro.ativa).toBe('S1-01')
    expect(registro.issues['S1-01'].antes.criterios).toEqual({ 'CA-S1-01': 'falhou', 'CA-S1-02': 'falhou' })
    expect(registro.issues['S1-01'].tentativas).toBe(0)

    // Faltando o teste de um critério, o escritor não encerra.
    const faltando = projeto([TESTE_DO_DOBRO])
    auditor(faltando, 'iniciar', 'S1-01')
    const r1 = gancho(PORTAO, faltando, FIM_DO_ESCRITOR)
    expect(r1.status).toBe(2)
    expect(r1.stderr).toContain('critério sem teste (CRITERIO_SEM_TESTE) — CA-S1-02')

    // Com um teste que já passa sem o código, também não.
    escrever(faltando, {
      'tests/mat.test.mjs': ["import { it, expect } from 'vitest'", "import * as mat from '../src/mat.mjs'", TESTE_DO_DOBRO, "it('CA-S1-02: soma', () => { expect(mat.soma(1, 1)).toBe(2) })", ''].join('\n'),
    })
    const r2 = gancho(PORTAO, faltando, FIM_DO_ESCRITOR)
    expect(r2.status).toBe(2)
    expect(r2.stderr).toContain('teste que nunca falhou (TESTE_NUNCA_FALHOU) — CA-S1-02')
    expect(r2.stderr).toContain('tentativa 2 de 3')
  }, 120_000)

  it('o portão do executor reprova a issue ativa sem registro antes', () => {
    const raiz = projeto([TESTE_DO_DOBRO, TESTE_DO_TRIPLO])
    auditor(raiz, 'iniciar', 'S1-01')
    const r = gancho(PORTAO, raiz, { hook_event_name: 'SubagentStop', agent_type: 'anti-vibe:executor', agent_id: 'x1' })
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('FALHA_ANTES_NAO_REGISTRADA')

    // Sem critério automático não há teste a registrar: o executor não fica preso.
    const soManual = projeto([])
    escrever(soManual, {
      'pre-desenvolvimento/issues/S1-01-exemplo.md': issue(['CA-S1-01', 'CA-S1-02']).replace(/\(automática\)/g, '(manual)'),
      'pre-desenvolvimento/spec-exemplo.md': SPEC(['CA-S1-01', 'CA-S1-02']).replace(/automática/g, 'manual'),
    })
    auditor(soManual, 'iniciar', 'S1-01')
    const r2 = gancho(PORTAO, soManual, { hook_event_name: 'SubagentStop', agent_type: 'anti-vibe:executor', agent_id: 'x1' })
    expect(r2.stderr).not.toContain('FALHA_ANTES_NAO_REGISTRADA')
    expect(r2.status).toBe(0)
  }, 60_000)

  it('CA-P1-16: o revisor recebe o caminho da issue, as mudanças e a página de princípios, e não o raciocínio nem a conversa de quem implementou', () => {
    const revisor = agente('revisor').corpo
    for (const trecho of ['o caminho da issue', 'as mudanças', 'página de princípios', 'Você não recebe o raciocínio nem a conversa de quem implementou']) {
      expect(revisor.replace(/\*\*/g, '')).toContain(trecho)
    }
    // O trecho que o chama (o revisildo) passa só isso.
    const revisildo = ler(path.join(PLUGIN, 'skills', 'revisildo', 'SKILL.md')).replace(/\s+/g, ' ')
    const passo = revisildo.slice(revisildo.indexOf('### 3. Revisor independente'), revisildo.indexOf('O revisor procura'))
    expect(passo).toContain('despache, com a ferramenta de agentes, o agente **`anti-vibe:revisor`** do plugin')
    expect(passo).toContain('Passe a ele apenas: 1. o caminho do arquivo da issue; 2. as mudanças:')
    expect(passo).toContain('3. a página de princípios:')
    expect(passo).not.toMatch(/ 4\. /)
    expect(passo).toContain('**Não passe** ao revisor o seu raciocínio, o que você acha que está certo nem a conversa de quem implementou.')
  })

  it('a skill issue despacha os papéis na ordem da spec: planejador, escritor de testes, executor e revisildo', () => {
    const texto = ler(path.join(PLUGIN, 'skills', 'issue', 'SKILL.md'))
    const posicoes = ['iniciar <id>', '`anti-vibe:planejador`', '`anti-vibe:escritor-de-testes`', '`anti-vibe:executor`', '`anti-vibe:revisildo`'].map((t) => texto.indexOf(t))
    expect(posicoes.every((p) => p >= 0)).toBe(true)
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes)
  })
})
