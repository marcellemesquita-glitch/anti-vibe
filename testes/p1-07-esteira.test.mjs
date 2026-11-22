import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const criados = []
afterAll(() => {
  for (const raiz of criados) {
    try {
      fs.rmSync(raiz, { recursive: true, force: true })
    } catch {}
  }
})

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN = path.join(RAIZ, 'plugins', 'anti-vibe')
const WORKFLOW = path.join(PLUGIN, 'workflows', 'esteira.js')

function ler(caminho) {
  return fs.readFileSync(caminho, 'utf8').replace(/\r\n/g, '\n')
}

// ------------------------------------------------ esteira com agentes simulados

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

// Roda o script do workflow com agent/phase/log simulados. `cena` decide a resposta
// de cada passo; devolve o resultado e a lista de chamadas (rótulo, tipo, pedido).
async function rodarEsteira(cena, args = { alvo: 'S1', raizDoPlugin: '/plugin' }) {
  const corpo = ler(WORKFLOW).replace('export const meta =', 'const meta =')
  const chamadas = []
  const agent = async (pedido, opcoes = {}) => {
    const rotulo = opcoes.label || ''
    chamadas.push({ rotulo, tipo: opcoes.agentType || null, pedido })
    const [passo, id] = rotulo.split(':')
    return cena(passo, id, pedido, opcoes)
  }
  const fn = new AsyncFunction('agent', 'phase', 'log', 'args', corpo)
  const resultado = await fn(agent, () => {}, () => {}, args)
  return { resultado, chamadas, rotulos: chamadas.map((c) => c.rotulo) }
}

function issueDaLista(id, extra = {}) {
  return {
    id,
    caminho: `pre-desenvolvimento/issues/${id}-exemplo.md`,
    titulo: `${id}: Entrega de exemplo`,
    serie: 'S1',
    avulsa: false,
    risco: false,
    automaticos: 1,
    arquivos: ['src/app.mjs', `tests/${id}.test.mjs`],
    suposicoesAbertas: [],
    perguntasAbertas: [],
    concluida: false,
    commitada: false,
    ...extra,
  }
}

// Cena padrão: tudo dá certo. `muda` troca o comportamento de passos específicos.
function cena(issues, muda = {}) {
  const lista = { alvo: 'S1', serie: 'S1', pastaIssues: 'pre-desenvolvimento/issues', pastaSpecs: 'pre-desenvolvimento', issues }
  const saida = (obj) => ({ codigo: 0, saida: JSON.stringify(obj) })
  return (passo, id, pedido, opcoes) => {
    if (muda[`${passo}:${id}`]) return muda[`${passo}:${id}`](pedido, opcoes)
    if (muda[passo]) return muda[passo](pedido, opcoes, id)
    switch (passo) {
      case 'descoberta':
      case 'lista':
        return saida(lista)
      case 'relida':
        return saida({ ...lista, issues: issues.filter((i) => i.id === id) })
      case 'branch-existe':
      case 'branch':
      case 'iniciar':
        return { codigo: 0, saida: '' }
      case 'estado-testes':
        return saida({ issue: id, tentativas: 0, precisaDecisao: false, antes: { criterios: { 'CA-S1-01': 'falhou' } } })
      case 'auditor':
        return saida({ veredito: 'alinhada', problemas: [] })
      case 'estado':
        return saida({ issue: id, tentativas: 1, precisaDecisao: false })
      case 'revisor':
        return { nenhumProblema: true, apontamentos: '' }
      case 'commit':
        return { commit: 'abc1234', movidaParaConcluidas: true, erro: '' }
      default:
        return 'RACIOCINIO-DE-QUEM-FEZ' // planejador, escritor, executor, correcao
    }
  }
}

describe('P1-07 — Esteira automática', () => {
  it('CA-P1-22: o workflow da esteira, a skill que o inicia e os agentes e skills que ele usa nunca fazem merge nem push', () => {
    const arquivos = [
      WORKFLOW,
      path.join(PLUGIN, 'skills', 'esteira', 'SKILL.md'),
      ...fs.readdirSync(path.join(PLUGIN, 'agents')).map((a) => path.join(PLUGIN, 'agents', a)),
      ...['plan', 'escrever-testes', 'execute', 'revisildo'].map((s) => path.join(PLUGIN, 'skills', s, 'SKILL.md')),
    ]
    const proibidos = /\bgit\s+(?:-\S+\s+)*(push|merge|rebase|pull)\b|\bgh\s+pr\s+merge\b|--force\b|\bpush\s+--/
    const achados = arquivos.filter((a) => proibidos.test(ler(a))).map((a) => path.relative(RAIZ, a))
    expect(achados).toEqual([])
    // E o passo que commita diz que não envia nem junta nada.
    expect(ler(WORKFLOW)).toContain('Não envie nada ao remoto e não junte branches.')
    expect(ler(path.join(PLUGIN, 'skills', 'esteira', 'SKILL.md')).replace(/\s+/g, ' ')).toContain(
      '**A esteira nunca junta branches nem envia nada ao remoto**'
    )
  })

  it('leva duas issues do plano ao commit, na ordem dos papéis, e lista as duas no resumo', async () => {
    const { resultado, rotulos, chamadas } = await rodarEsteira(cena([issueDaLista('S1-01'), issueDaLista('S1-02')]))
    expect(resultado.parou).toBe(false)
    expect(resultado.parouEm).toBeNull()
    expect(resultado.concluidas).toEqual(['S1-01', 'S1-02'])
    expect(resultado.ramo).toBe('esteira/S1')
    // A lista que vale é a tirada já no branch da série.
    expect(rotulos.slice(0, 4)).toEqual(['descoberta', 'branch-existe', 'branch', 'lista'])
    const daPrimeira = rotulos.filter((r) => r.includes('S1-01')).map((r) => r.split(':')[0])
    expect(daPrimeira).toEqual(['iniciar', 'planejador', 'relida', 'escritor', 'estado-testes', 'executor', 'auditor', 'revisor', 'commit'])
    expect(chamadas.find((c) => c.rotulo === 'planejador:S1-01').tipo).toBe('anti-vibe:planejador')
    expect(chamadas.find((c) => c.rotulo === 'escritor:S1-01').tipo).toBe('anti-vibe:escritor-de-testes')
    expect(chamadas.find((c) => c.rotulo === 'executor:S1-01').tipo).toBe('anti-vibe:executor')
    expect(chamadas.find((c) => c.rotulo.startsWith('revisor:S1-01')).tipo).toBe('anti-vibe:revisor')
    // O revisor recebe a issue, as mudanças e a página de princípios, e nada de quem fez.
    const revisor = chamadas.find((c) => c.rotulo.startsWith('revisor:S1-01')).pedido
    expect(revisor).toContain('pre-desenvolvimento/issues/S1-01-exemplo.md')
    expect(revisor).toContain('git diff HEAD -- src/app.mjs tests/S1-01.test.mjs')
    expect(revisor).toContain('AGENTS.md')
    expect(revisor).not.toContain('RACIOCINIO-DE-QUEM-FEZ')
    // O commit: um a um, com a linha da esteira, movendo a issue alinhada.
    const commit = chamadas.find((c) => c.rotulo === 'commit:S1-01').pedido
    expect(commit).toContain('Esteira-Issue: S1-01')
    expect(commit).toContain('feat(S1-01): Entrega de exemplo')
    expect(commit).toContain('git mv pre-desenvolvimento/issues/S1-01-exemplo.md pre-desenvolvimento/issues/concluidas_S1/')
    expect(commit).toContain('Nunca adicione tudo de uma vez')
  })

  it('retoma sem refazer a issue já commitada pela esteira', async () => {
    const { resultado, rotulos } = await rodarEsteira(
      cena([issueDaLista('S1-00', { concluida: true }), issueDaLista('S1-01', { commitada: true }), issueDaLista('S1-02')])
    )
    expect(resultado.jaFeitas).toEqual(['S1-00', 'S1-01'])
    expect(resultado.concluidas).toEqual(['S1-02'])
    expect(rotulos.some((r) => r.includes('S1-01') || r.includes('S1-00'))).toBe(false)

    // Série toda feita: a esteira termina sem erro.
    const toda = await rodarEsteira(cena([issueDaLista('S1-01', { concluida: true })]))
    expect(toda.resultado.parou).toBe(false)
    expect(toda.resultado.jaFeitas).toEqual(['S1-01'])
  })

  it('para antes de implementar quando a issue tem pergunta ou suposição em aberto, ou o plano deixa uma', async () => {
    const pergunta = await rodarEsteira(cena([issueDaLista('S1-01'), issueDaLista('S1-02', { perguntasAbertas: ['PER-S1-01'] })]))
    expect(pergunta.resultado.concluidas).toEqual(['S1-01'])
    expect(pergunta.resultado.parouEm).toBe('S1-02')
    expect(pergunta.resultado.detalhes).toContain('PER-S1-01')
    expect(pergunta.rotulos).not.toContain('planejador:S1-02')

    const doPlano = await rodarEsteira(
      cena([issueDaLista('S1-01')], {
        relida: () => ({ codigo: 0, saida: JSON.stringify({ issues: [issueDaLista('S1-01', { suposicoesAbertas: ['SUP-S1-04'] })] }) }),
      })
    )
    expect(doPlano.resultado.parouEm).toBe('S1-01')
    expect(doPlano.resultado.detalhes).toContain('SUP-S1-04')
    expect(doPlano.rotulos).not.toContain('escritor:S1-01')
  })

  it('para quando o escritor não deixa um teste falhando por critério, sem chamar o executor', async () => {
    const { resultado, rotulos } = await rodarEsteira(
      cena([issueDaLista('S1-01')], {
        'estado-testes': () => ({ codigo: 0, saida: JSON.stringify({ tentativas: 3, precisaDecisao: true, antes: { criterios: { 'CA-S1-01': 'passou' } } }) }),
      })
    )
    expect(resultado.parouEm).toBe('S1-01')
    expect(resultado.detalhes).toContain('CA-S1-01: passou')
    expect(rotulos).not.toContain('executor:S1-01')
  })

  it('para no limite do auditor dizendo a issue, o que falta e as tentativas, sem commitar', async () => {
    const { resultado, rotulos } = await rodarEsteira(
      cena([issueDaLista('S1-01'), issueDaLista('S1-02')], {
        'auditor:S1-01': () => ({
          codigo: 1,
          saida: JSON.stringify({ veredito: 'não alinhada', problemas: [{ codigo: 'CRITERIO_SEM_PROVA', alvo: 'CA-S1-01', detalhe: 'resultado: failed', trava: true }] }),
        }),
        estado: () => ({ codigo: 0, saida: JSON.stringify({ tentativas: 3, precisaDecisao: true }) }),
      })
    )
    expect(resultado.parouEm).toBe('S1-01')
    expect(resultado.motivo).toContain('limite de tentativas')
    expect(resultado.tentativas).toBe(3)
    expect(resultado.detalhes).toContain('CRITERIO_SEM_PROVA — CA-S1-01')
    expect(resultado.concluidas).toEqual([])
    expect(rotulos).not.toContain('commit:S1-01')
    expect(rotulos.some((r) => r.includes('S1-02'))).toBe(false)
  })

  it('corrige uma vez com os apontamentos do revisor e, se ele continuar apontando, para sem commitar', async () => {
    let revisoes = 0
    const duasVezes = await rodarEsteira(
      cena([issueDaLista('S1-01')], {
        revisor: () => ({ nenhumProblema: false, apontamentos: `APONTAMENTO-${++revisoes}` }),
      })
    )
    expect(duasVezes.resultado.parouEm).toBe('S1-01')
    expect(duasVezes.resultado.detalhes).toBe('APONTAMENTO-2')
    expect(duasVezes.chamadas.find((c) => c.rotulo === 'correcao:S1-01').pedido).toContain('APONTAMENTO-1')
    expect(duasVezes.rotulos).not.toContain('commit:S1-01')

    let uma = 0
    const umaVez = await rodarEsteira(
      cena([issueDaLista('S1-01')], {
        revisor: () => (++uma === 1 ? { nenhumProblema: false, apontamentos: 'X' } : { nenhumProblema: true, apontamentos: '' }),
      })
    )
    expect(umaVez.resultado.concluidas).toEqual(['S1-01'])
  })

  it('para antes do commit numa issue de risco, esperando o sim', async () => {
    const { resultado, rotulos } = await rodarEsteira(cena([issueDaLista('S1-01', { risco: true })]))
    expect(resultado.parouEm).toBe('S1-01')
    expect(resultado.aguardaSim).toBe(true)
    expect(resultado.veredito).toBe('alinhada')
    expect(resultado.arquivos).toEqual(['src/app.mjs', 'tests/S1-01.test.mjs'])
    expect(rotulos).toContain('revisor:S1-01:1')
    expect(rotulos).not.toContain('commit:S1-01')
  })

  it('issue só com critérios manuais pula o escritor; com teste manual pendente, é commitada sem ir para as concluídas', async () => {
    const { resultado, rotulos, chamadas } = await rodarEsteira(
      cena([issueDaLista('S1-01', { automaticos: 0 })], {
        auditor: () => ({ codigo: 10, saida: JSON.stringify({ veredito: 'alinhada com teste manual pendente', problemas: [] }) }),
      })
    )
    expect(resultado.concluidas).toEqual(['S1-01'])
    expect(rotulos).not.toContain('escritor:S1-01')
    const commit = chamadas.find((c) => c.rotulo === 'commit:S1-01').pedido
    expect(commit).not.toContain('git mv')
    expect(commit).toContain('Não mova a issue')
  })

  it('o auditor lista para a esteira as issues abertas em ordem, com risco, pendências e as já commitadas, e mostra o estado de uma issue', () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'anti-vibe-p1-07-'))
    criados.push(raiz)
    const issue = (id, { risco = 'não', pergunta = false } = {}) =>
      [
        `# ${id}: Entrega ${id}`,
        '',
        `**Risco:** ${risco}`,
        '',
        '## Critérios de aceite',
        '',
        `- **CA-${id}** (automática) — critério.`,
        '',
        '## Suposições',
        '',
        'Nenhuma.',
        '',
        '## Perguntas em aberto',
        '',
        pergunta ? '| ID | Pergunta | Status | Resposta |\n|---|---|---|---|\n| PER-S1-01 | Qual? | aberta | — |' : 'Nenhuma.',
        '',
        '## Arquivos',
        '',
        '- **Modificar:** `src/app.mjs`',
        '',
      ].join('\n')
    const escrever = (rel, texto) => {
      fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true })
      fs.writeFileSync(path.join(raiz, rel), texto)
    }
    escrever('pre-desenvolvimento/issues/S1-10-dez.md', issue('S1-10'))
    escrever('pre-desenvolvimento/issues/S1-2-dois.md', issue('S1-2', { risco: 'sim', pergunta: true }))
    escrever('pre-desenvolvimento/issues/S1-1-um.md', issue('S1-1'))
    escrever('pre-desenvolvimento/issues/concluidas_S1/S1-0-zero.md', issue('S1-0'))
    escrever('pre-desenvolvimento/issues/S2-1-outra.md', issue('S2-1'))
    const git = (...a) => spawnSync('git', a, { cwd: raiz, encoding: 'utf8' })
    git('init', '-q')
    git('add', '-A')
    git('-c', 'user.name=Teste', '-c', 'user.email=teste@exemplo.invalid', 'commit', '-q', '-m', 'feat(S1-1): um\n\nEsteira-Issue: S1-1')

    const auditor = (...a) => spawnSync(process.execPath, [path.join(PLUGIN, 'auditor', 'auditor.mjs'), ...a], { cwd: raiz, encoding: 'utf8' })
    const lista = JSON.parse(auditor('esteira-lista', 'S1', '--json').stdout)
    expect(lista.serie).toBe('S1')
    expect(lista.issues.map((i) => i.id)).toEqual(['S1-0', 'S1-1', 'S1-2', 'S1-10'])
    const [zero, um, dois, dez] = lista.issues
    expect(zero.concluida).toBe(true)
    expect(um.concluida).toBe(false)
    expect(um).toMatchObject({ commitada: true, risco: false, automaticos: 1, arquivos: ['src/app.mjs'] })
    expect(dois).toMatchObject({ commitada: false, risco: true, perguntasAbertas: ['PER-S1-01'] })
    expect(dez.commitada).toBe(false)

    const avulsa = JSON.parse(auditor('esteira-lista', 'S1-0', '--json').stdout)
    expect(avulsa.issues.map((i) => [i.id, i.concluida])).toEqual([['S1-0', true]])
    expect(auditor('esteira-lista', 'S9').status).toBe(2)

    auditor('iniciar', 'S1-10')
    // O veredito em uma linha, só com o que trava.
    const saidaDaIssue = auditor('issue', 'S1-10', '--sem-rodar', '--linha').stdout.trim()
    expect(saidaDaIssue.split('\n')).toHaveLength(1)
    const daIssue = JSON.parse(saidaDaIssue)
    expect(daIssue.veredito).toBe('não alinhada')
    expect(daIssue.problemas.map((p) => p.codigo)).toContain('SPEC_NAO_ENCONTRADA')
    expect(daIssue.problemas.map((p) => p.codigo)).not.toContain('ESCOPO_NAO_CONFERIDO')
    expect(JSON.parse(auditor('estado', 'S1-10', '--linha').stdout)).toMatchObject({ issue: 'S1-10', ativa: true, tentativas: 0, precisaDecisao: false })
  })

  it('agente que não responde ou comando que falha param a esteira sem commitar e sem fingir que foi o revisor', async () => {
    const revisorMudo = await rodarEsteira(cena([issueDaLista('S1-01')], { revisor: () => null }))
    expect(revisorMudo.resultado.parou).toBe(true)
    expect(revisorMudo.resultado.motivo).toBe('o revisor independente não respondeu')
    expect(revisorMudo.rotulos).not.toContain('correcao:S1-01')
    expect(revisorMudo.rotulos).not.toContain('commit:S1-01')

    const semIniciar = await rodarEsteira(cena([issueDaLista('S1-01')], { iniciar: () => ({ codigo: 1, saida: 'erro' }) }))
    expect(semIniciar.resultado.motivo).toContain('marcar a issue como ativa')
    expect(semIniciar.rotulos).not.toContain('planejador:S1-01')

    for (const papel of ['planejador', 'escritor', 'executor']) {
      const mudo = await rodarEsteira(cena([issueDaLista('S1-01')], { [papel]: () => null }))
      expect(mudo.resultado.parou, papel).toBe(true)
      expect(mudo.rotulos, papel).not.toContain('commit:S1-01')
    }
  })

  it('sem alvo, ou sem conseguir listar, não faz nada', async () => {
    expect((await rodarEsteira(cena([]), {})).resultado.erro).toContain('args.alvo')
    const vazia = await rodarEsteira(cena([], { descoberta: () => ({ codigo: 2, saida: 'nenhuma issue' }) }))
    expect(vazia.resultado.parou).toBe(true)
    expect(vazia.resultado.parouEm).toBeNull()
    expect(vazia.resultado.motivo).toContain('não deu para achar')
    expect(vazia.rotulos).toEqual(['descoberta'])

    const semBranch = await rodarEsteira(cena([issueDaLista('S1-01')], { branch: () => ({ codigo: 1, saida: 'erro' }) }))
    expect(semBranch.resultado.parou).toBe(true)
    expect(semBranch.rotulos).not.toContain('lista')

    const listaVazia = await rodarEsteira(cena([issueDaLista('S1-01')], { lista: () => ({ codigo: 0, saida: JSON.stringify({ serie: 'S1', issues: [] }) }) }))
    expect(listaVazia.resultado.parou).toBe(true)
    expect(listaVazia.rotulos).not.toContain('iniciar:S1-01')
  })
})
