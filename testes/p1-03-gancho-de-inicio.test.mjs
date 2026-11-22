import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN = path.join(RAIZ, 'plugins', 'anti-vibe')
const GANCHO = path.join(PLUGIN, 'hooks', 'sessao.mjs')
const AUDITOR = path.join(PLUGIN, 'auditor', 'auditor.mjs')

const REGRAS = [
  'Só são mexidos os arquivos listados na tarefa atual.',
  'Nenhuma funcionalidade além do que foi pedido é adicionada.',
  'Código existente é reutilizado',
  'Lógica de negócio fica no backend, nunca no frontend.',
  'Chaves de API, segredos e tokens nunca ficam no frontend.',
]
const TRIAGEM = 'Toda tarefa começa pela triagem (/anti-vibe:triagem)'

const criados = []
afterAll(() => {
  for (const raiz of criados) {
    try {
      fs.rmSync(raiz, { recursive: true, force: true })
    } catch {}
  }
})

function pastaTemporaria() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'anti-vibe-p1-03-'))
  criados.push(raiz)
  return raiz
}

function escrever(raiz, rel, texto) {
  const arquivo = path.join(raiz, rel)
  fs.mkdirSync(path.dirname(arquivo), { recursive: true })
  fs.writeFileSync(arquivo, texto)
}

// Sem CLAUDE_PROJECT_DIR herdado: quem roda os testes pode estar dentro do Claude Code.
function ambiente(extra = {}) {
  const env = { ...process.env, ...extra }
  if (!('CLAUDE_PROJECT_DIR' in extra)) delete env.CLAUDE_PROJECT_DIR
  return env
}

function rodarGancho(cwd, extra) {
  return spawnSync(process.execPath, [GANCHO], { cwd, env: ambiente(extra), encoding: 'utf8' })
}

function licoes(lista) {
  return [
    '# Lições aprendidas',
    '',
    '| ID | Lição | Origem | Falha | Voltou a acontecer em |',
    '|---|---|---|---|---|',
    ...lista.map(([id, texto]) => `| ${id} | ${texto} | S1-01 | CRITERIO_SEM_TESTE | — |`),
    '',
  ].join('\n')
}

function projetoDeExemplo({ issues = 2, listaDeLicoes = null } = {}) {
  const raiz = pastaTemporaria()
  escrever(raiz, 'pre-desenvolvimento/spec-cadastro.md', '# Spec: Cadastro de clientes\n\n> série: S1\n')
  for (let n = 1; n <= issues; n++) {
    const id = `S1-${String(n).padStart(2, '0')}`
    escrever(raiz, `pre-desenvolvimento/issues/${id}-exemplo.md`, `# ${id}: Entrega número ${n} do cadastro\n`)
  }
  escrever(raiz, 'pre-desenvolvimento/issues/README.md', '# issues\n')
  escrever(raiz, 'pre-desenvolvimento/issues/concluidas_S1/S1-00-feita.md', '# S1-00: Entrega já concluída\n')
  escrever(
    raiz,
    'pre-desenvolvimento/licoes.md',
    licoes(listaDeLicoes || [['L-01', 'Confira o valor gravado no banco, não só o retorno da ação.']])
  )
  return raiz
}

describe('P1-03 — Regras e estado do trabalho no início da sessão', () => {
  it('CA-P1-37: o gancho escreve as cinco regras, a triagem, a spec ativa, as issues abertas e as lições, com menos de 10.000 caracteres', () => {
    const raiz = projetoDeExemplo()
    // O gancho roda de outra pasta: o projeto vem de CLAUDE_PROJECT_DIR.
    const r = rodarGancho(pastaTemporaria(), { CLAUDE_PROJECT_DIR: raiz })
    expect(r.status).toBe(0)
    const saida = r.stdout
    for (const regra of REGRAS) expect(saida).toContain(regra)
    expect(saida).toContain(TRIAGEM)
    expect(saida).toContain('pre-desenvolvimento/spec-cadastro.md (série S1): Spec: Cadastro de clientes')
    expect(saida).toContain('S1-01: Entrega número 1 do cadastro')
    expect(saida).toContain('S1-02: Entrega número 2 do cadastro')
    expect(saida).not.toContain('S1-00')
    expect(saida).toContain('L-01: Confira o valor gravado no banco, não só o retorno da ação.')
    expect(saida.length).toBeLessThan(10000)

    // Projeto grande: 200 issues e lições longas continuam abaixo do limite, com as regras.
    const longo = 'Uma lição comprida que repete a mesma ideia para ocupar espaço. '.repeat(15)
    const grande = projetoDeExemplo({
      issues: 200,
      listaDeLicoes: Array.from({ length: 15 }, (_, i) => [`L-${String(i + 1).padStart(2, '0')}`, longo]),
    })
    const g = rodarGancho(grande, { CLAUDE_PROJECT_DIR: grande })
    expect(g.status).toBe(0)
    expect(g.stdout.length).toBeLessThan(10000)
    for (const regra of REGRAS) expect(g.stdout).toContain(regra)
    expect(g.stdout).toContain(TRIAGEM)
    expect(g.stdout).toContain('Issues abertas (200)')
    expect(g.stdout).toContain('S1-20: Entrega número 20 do cadastro')
    expect(g.stdout).not.toContain('S1-21:')
    expect(g.stdout).toContain('... e mais 180')
  })

  it('CA-P1-38: numa pasta vazia, o gancho termina com sucesso e escreve só as regras e a triagem', () => {
    const vazia = pastaTemporaria()
    const r = rodarGancho(vazia)
    expect(r.status).toBe(0)
    for (const regra of REGRAS) expect(r.stdout).toContain(regra)
    expect(r.stdout).toContain(TRIAGEM)
    expect(r.stdout).not.toMatch(/Estado do trabalho|Spec ativa|Issues abertas|Lições|veredito|Não deu para ler/i)
  })

  it('o gancho mostra o último veredito do auditor e não quebra com configuração ilegível', () => {
    const raiz = projetoDeExemplo()
    expect(rodarGancho(raiz).stdout).not.toContain('Último veredito')
    spawnSync(process.execPath, [AUDITOR, 'issue', 'S1-01', '--sem-rodar'], { cwd: raiz, encoding: 'utf8' })
    expect(rodarGancho(raiz).stdout).toMatch(/Último veredito do auditor: S1-01 — formato antigo \(\d{2}\/\d{2}\/\d{4}\)/)
    spawnSync(process.execPath, [AUDITOR, 'serie', 'S1', '--sem-rodar'], { cwd: raiz, encoding: 'utf8' })
    expect(rodarGancho(raiz).stdout).toContain('Último veredito do auditor: série S1 — não alinhada')

    // Registro do veredito corrompido: some só a linha do veredito.
    escrever(raiz, '.claude/auditor-ultimo.json', '{ "alvo": "S1-0')
    const corrompido = rodarGancho(raiz)
    expect(corrompido.status).toBe(0)
    expect(corrompido.stdout).not.toContain('Último veredito')
    expect(corrompido.stdout).toContain('S1-01: Entrega número 1 do cadastro')
    expect(corrompido.stdout).toContain('L-01:')

    // Issue cujo título não traz o código: o código vem do nome do arquivo.
    escrever(raiz, 'pre-desenvolvimento/issues/S1-03-sem-codigo.md', '# Cadastro sem código no título\n')
    expect(rodarGancho(raiz).stdout).toContain('- S1-03: Cadastro sem código no título')

    escrever(raiz, '.claude/auditor.json', '{ isto não é json')
    const r = rodarGancho(raiz)
    expect(r.status).toBe(0)
    for (const regra of REGRAS) expect(r.stdout).toContain(regra)
    expect(r.stdout).toContain('Não deu para ler o estado do trabalho')
  })
})
