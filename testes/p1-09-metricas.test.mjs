import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN = path.join(RAIZ, 'plugins', 'anti-vibe')
const AUDITOR = path.join(PLUGIN, 'auditor', 'auditor.mjs')
const PORTAO = path.join(PLUGIN, 'hooks', 'portao.mjs')
const WORKFLOW = path.join(PLUGIN, 'workflows', 'esteira.js')

const criados = []
afterAll(() => {
  for (const raiz of criados) {
    try {
      fs.rmSync(raiz, { recursive: true, force: true })
    } catch {}
  }
})

function projeto(arquivos) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'anti-vibe-p1-09-'))
  criados.push(raiz)
  escrever(raiz, arquivos)
  return raiz
}

function escrever(raiz, arquivos) {
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true })
    fs.writeFileSync(path.join(raiz, rel), conteudo)
  }
}

function auditor(raiz, ...args) {
  const r = spawnSync(process.execPath, [AUDITOR, ...args], { cwd: raiz, encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout, saida: `${r.stdout}\n${r.stderr}` }
}

function portao(raiz) {
  const env = { ...process.env }
  delete env.CLAUDE_PROJECT_DIR
  return spawnSync(process.execPath, [PORTAO], {
    cwd: os.tmpdir(),
    env,
    input: JSON.stringify({ cwd: raiz, hook_event_name: 'SubagentStop', agent_type: 'anti-vibe:executor', agent_id: 'x1' }),
    encoding: 'utf8',
  })
}

function issueSoManual(checklist) {
  return [
    '# S1-01: Exemplo',
    '',
    '## Critérios de aceite',
    '',
    '- **CA-S1-01** (manual) — critério conferido por uma pessoa.',
    '',
    '## Suposições',
    '',
    'Nenhuma.',
    '',
    '## Perguntas em aberto',
    '',
    'Nenhuma.',
    '',
    '## Checklist',
    '',
    `- [${checklist}] feito`,
    '',
  ].join('\n')
}

const SPEC = '# Spec: exemplo\n\n> série: S1\n\n#### CA-S1-01 — critério · prova: manual\n\n## Suposições\n\nNenhuma.\n\n## Perguntas em aberto\n\nNenhuma.\n'

function metricas(raiz) {
  return JSON.parse(fs.readFileSync(path.join(raiz, 'pre-desenvolvimento', 'metricas.json'), 'utf8'))
}

describe('P1-09 — Métricas da esteira', () => {
  it('CA-P1-39: a issue que passou pelo auditor duas vezes até ficar alinhada deixa registro com início, fim, duas tentativas, "não passou de primeira" e nenhum escalonamento', () => {
    const raiz = projeto({
      'pre-desenvolvimento/spec-exemplo.md': SPEC,
      'pre-desenvolvimento/issues/S1-01-exemplo.md': issueSoManual(' '),
    })
    expect(auditor(raiz, 'iniciar', 'S1-01', '--esteira').status).toBe(0)
    // Primeira conferência: checklist aberto, reprova.
    expect(portao(raiz).status).toBe(2)
    escrever(raiz, { 'pre-desenvolvimento/issues/S1-01-exemplo.md': issueSoManual('x') })
    // Segunda: alinhada (com teste manual pendente, que não trava).
    expect(portao(raiz).status).toBe(0)
    expect(auditor(raiz, 'metricas', 'fim', 'S1-01').status).toBe(0)

    const registro = metricas(raiz).issues['S1-01']
    expect(registro.inicio).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(registro.fim).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(new Date(registro.fim) >= new Date(registro.inicio)).toBe(true)
    expect(registro.tentativas).toBe(2)
    expect(registro.passouDePrimeira).toBe(false)
    expect(registro.escalonamentos).toEqual([])
    expect(registro.intervencoes).toBe(0)
  }, 60_000)

  it('CA-P1-40: o relatório da série mostra a aprovação de primeira, as tentativas médias, os escalonamentos por gatilho, as intervenções humanas e os defeitos', () => {
    const raiz = projeto({ 'pre-desenvolvimento/issues/S1-01-a.md': '# S1-01: a\n' })
    // Registros pelos mesmos caminhos da esteira: iniciar, conferência do portão
    // (a função que ele chama), escalonamento e fim. Três issues: S1-01 de primeira; S1-02 parou por pendência, a pessoa decidiu e a
    // esteira retomou, e precisou de três conferências; S1-03 de risco, commitada depois do sim.
    for (const id of ['S1-01', 'S1-02', 'S1-03']) {
      escrever(raiz, { [`pre-desenvolvimento/issues/${id}-x.md`]: `# ${id}: x\n` })
      auditor(raiz, 'iniciar', id, '--esteira')
    }
    const conferir = (id, aprovada) =>
      spawnSync(process.execPath, ['-e', `import(${JSON.stringify(new URL(`file:///${AUDITOR.replace(/\\/g, '/')}`).href)}).then(a => a.metricaTentativa(process.cwd(), a.carregarConfig(process.cwd()), '${id}', ${aprovada}))`], { cwd: raiz })
    conferir('S1-01', true)
    auditor(raiz, 'metricas', 'fim', 'S1-01')
    auditor(raiz, 'metricas', 'escalonar', 'S1-02', '--gatilho', 'pendencia')
    const inicioDaS102 = metricas(raiz).issues['S1-02'].inicio
    auditor(raiz, 'iniciar', 'S1-02', '--esteira')
    // Retomar não muda o início.
    expect(metricas(raiz).issues['S1-02'].inicio).toBe(inicioDaS102)
    conferir('S1-02', false)
    conferir('S1-02', false)
    conferir('S1-02', true)
    auditor(raiz, 'metricas', 'fim', 'S1-02')
    conferir('S1-03', true)
    auditor(raiz, 'metricas', 'escalonar', 'S1-03', '--gatilho', 'risco')
    auditor(raiz, 'metricas', 'fim', 'S1-03')
    expect(auditor(raiz, 'metricas', 'defeito', 'S1-01', '--texto', 'o aviso some no celular').status).toBe(0)
    // Defeito numa issue sem registro (feita fora da esteira) não cria issue no relatório.
    auditor(raiz, 'metricas', 'defeito', 'S1-09', '--texto', 'outro')
    // Uma quarta, iniciada e parada por pendência ainda sem decisão: sem conferência, não
    // entra na taxa nem nas tentativas, e o escalonamento ainda não é intervenção.
    escrever(raiz, { 'pre-desenvolvimento/issues/S1-04-x.md': '# S1-04: x\n' })
    auditor(raiz, 'iniciar', 'S1-04', '--esteira')
    auditor(raiz, 'metricas', 'escalonar', 'S1-04', '--gatilho', 'pendencia')
    // Outra série não entra no relatório da S1.
    auditor(raiz, 'metricas', 'escalonar', 'S2-01', '--gatilho', 'falha')

    const rel = JSON.parse(auditor(raiz, 'metricas', 'S1', '--json').stdout)
    expect(rel).toMatchObject({
      serie: 'S1',
      issues: 4,
      concluidas: 3,
      conferidas: 3,
      dePrimeira: 2,
      escalonamentosPorGatilho: { pendencia: 2, risco: 1 },
      intervencoes: 2,
    })
    expect(rel.taxaDePrimeira).toBeCloseTo(2 / 3)
    expect(rel.tentativasMedias).toBeCloseTo(5 / 3)
    expect(rel.defeitos.map((d) => [d.issue, d.texto])).toEqual([
      ['S1-01', 'o aviso some no celular'],
      ['S1-09', 'outro'],
    ])

    const texto = auditor(raiz, 'metricas', 'S1').stdout
    expect(texto).toContain('Métricas da série S1 (4 issues, 3 concluídas)')
    expect(texto).toContain('Aprovação de primeira: 67% (2 de 3)')
    expect(texto).toContain('Tentativas médias: 1,7')
    expect(texto).toContain('Escalonamentos por gatilho: pendencia 2, risco 1')
    expect(texto).toContain('Intervenções humanas: 2')
    expect(texto).toContain('Defeitos depois do veredito: 2')
    expect(texto).toContain('S1-01: o aviso some no celular')
  }, 60_000)

  it('gatilho desconhecido é recusado, e arquivo de métricas ilegível não derruba o auditor nem some calado', () => {
    const raiz = projeto({ 'pre-desenvolvimento/issues/S1-01-a.md': '# S1-01: a\n' })
    expect(auditor(raiz, 'metricas', 'escalonar', 'S1-01', '--gatilho', 'cansaço').status).toBe(2)
    escrever(raiz, { 'pre-desenvolvimento/metricas.json': '{ quebrado' })
    const r = auditor(raiz, 'metricas', 'S1')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('ilegível')
    expect(auditor(raiz, 'iniciar', 'S1-01', '--esteira').status).toBe(0)
    // Depois de gravar por cima, a cópia fica e o relatório continua avisando.
    expect(fs.readFileSync(path.join(raiz, 'pre-desenvolvimento', 'metricas.json.ilegivel'), 'utf8')).toBe('{ quebrado')
    expect(auditor(raiz, 'metricas', 'S1').stdout).toContain('o registro recomeçou em')
  })

  it('só a issue iniciada pela esteira entra nas métricas, e o portão do escritor de testes não conta tentativa', () => {
    const raiz = projeto({
      'pre-desenvolvimento/spec-exemplo.md': SPEC,
      'pre-desenvolvimento/issues/S1-01-exemplo.md': issueSoManual('x'),
    })
    // Fluxo manual (/issue): iniciar sem --esteira e conferência do portão: nada registrado.
    auditor(raiz, 'iniciar', 'S1-01')
    portao(raiz)
    expect(fs.existsSync(path.join(raiz, 'pre-desenvolvimento', 'metricas.json'))).toBe(false)

    // Pela esteira: o fim antigo some quando a issue é iniciada de novo.
    auditor(raiz, 'iniciar', 'S1-01', '--esteira')
    auditor(raiz, 'metricas', 'fim', 'S1-01')
    expect(metricas(raiz).issues['S1-01'].fim).not.toBeNull()
    auditor(raiz, 'iniciar', 'S1-01', '--esteira')
    expect(metricas(raiz).issues['S1-01'].fim).toBeNull()

    // O portão do escritor de testes não é tentativa do executor.
    const env = { ...process.env }
    delete env.CLAUDE_PROJECT_DIR
    spawnSync(process.execPath, [PORTAO], {
      cwd: os.tmpdir(),
      env,
      input: JSON.stringify({ cwd: raiz, hook_event_name: 'SubagentStop', agent_type: 'anti-vibe:escritor-de-testes', agent_id: 'e1' }),
      encoding: 'utf8',
    })
    expect(metricas(raiz).issues['S1-01'].tentativas).toBe(0)
    // Já a conferência do executor conta, mesmo reprovando sem auditoria (issue sumida).
    fs.rmSync(path.join(raiz, 'pre-desenvolvimento', 'issues', 'S1-01-exemplo.md'))
    expect(portao(raiz).status).toBe(2)
    expect(metricas(raiz).issues['S1-01']).toMatchObject({ tentativas: 1, passouDePrimeira: false })
  }, 60_000)

  it('a esteira registra o escalonamento com o gatilho quando para, e o fim depois do commit', async () => {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    const corpo = fs.readFileSync(WORKFLOW, 'utf8').replace('export const meta =', 'const meta =')
    const issue = (id, extra = {}) => ({ id, caminho: `p/issues/${id}.md`, titulo: `${id}: x`, serie: 'S1', risco: false, automaticos: 0, arquivos: ['src/a.mjs'], suposicoesAbertas: [], perguntasAbertas: [], concluida: false, commitada: false, dependeDe: [], ...extra })
    const lista = { serie: 'S1', pastaIssues: 'p/issues', pastaSpecs: 'p', arquivoMetricas: 'p/metricas.json', lotes: [], issues: [issue('S1-01'), issue('S1-02', { risco: true })] }
    const comandos = []
    const passos = []
    let pedidoDoCommit = ''
    const agent = async (pedido, { label }) => {
      const comando = pedido.split('\n').pop()
      passos.push(label)
      if (label.startsWith('metricas') || label.startsWith('iniciar')) comandos.push(comando)
      if (label.startsWith('commit')) pedidoDoCommit = pedido
      if (['descoberta', 'lista'].includes(label)) return { codigo: 0, saida: JSON.stringify(lista) }
      if (label.startsWith('relida')) return { codigo: 0, saida: JSON.stringify({ ...lista, issues: lista.issues.filter((i) => label.endsWith(i.id)) }) }
      if (label.startsWith('auditor')) return { codigo: 0, saida: JSON.stringify({ veredito: 'alinhada', problemas: [] }) }
      if (label.startsWith('revisor')) return { nenhumProblema: true, apontamentos: '' }
      if (label.startsWith('commit')) return { commit: 'abc', movidaParaConcluidas: true, erro: '' }
      if (label.startsWith('planejador') || label.startsWith('executor')) return 'ok'
      return { codigo: 0, saida: '' }
    }
    const resumo = await new AsyncFunction('agent', 'phase', 'log', 'args', corpo)(agent, () => {}, () => {}, { alvo: 'S1', raizDoPlugin: '/p' })
    expect(resumo.parouEm).toBe('S1-02')
    expect(resumo.gatilho).toBe('risco')
    expect(comandos).toEqual([
      'node "/p/auditor/auditor.mjs" iniciar S1-01 --esteira',
      'node "/p/auditor/auditor.mjs" metricas fim S1-01',
      'node "/p/auditor/auditor.mjs" iniciar S1-02 --esteira',
      'node "/p/auditor/auditor.mjs" metricas escalonar S1-02 --gatilho risco',
    ])
    // O fim entra antes do commit, e o arquivo de métricas vai no commit.
    expect(passos.indexOf('metricas:fim')).toBeLessThan(passos.indexOf('commit:S1-01'))
    expect(pedidoDoCommit).toContain('p/metricas.json')
  })
})
