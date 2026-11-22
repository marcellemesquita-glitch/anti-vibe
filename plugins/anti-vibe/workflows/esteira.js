export const meta = {
  name: 'esteira',
  description: 'Esteira anti-vibe: leva as issues de uma série (ou uma issue avulsa) do plano ao commit no branch da série, parando nos gatilhos de escalonamento',
  whenToUse: 'Chamado pela skill esteira, depois do break ou sobre uma issue avulsa, com args { alvo, raizDoPlugin }',
  phases: [
    { title: 'Preparação', detail: 'descobre a série, vai para o branch dela e lista as issues' },
    { title: 'Issues', detail: 'planejador, escritor de testes, executor, auditor, revisor e commit, uma issue por vez' },
  ],
}

// Quem decide o caminho é este script. Os agentes fazem os papéis (os do plugin) e os
// passos mecânicos (rodar um comando e devolver a saída crua). A esteira nunca junta
// branches nem envia nada ao remoto: isso é da pessoa.

const COMANDO = {
  type: 'object',
  properties: { codigo: { type: 'number' }, saida: { type: 'string' } },
  required: ['codigo', 'saida'],
}
const REVISAO = {
  type: 'object',
  properties: { nenhumProblema: { type: 'boolean' }, apontamentos: { type: 'string' } },
  required: ['nenhumProblema', 'apontamentos'],
}
const COMMIT = {
  type: 'object',
  properties: { commit: { type: 'string' }, movidaParaConcluidas: { type: 'boolean' }, erro: { type: 'string' } },
  required: ['commit', 'movidaParaConcluidas', 'erro'],
}

const alvo = args && args.alvo
// A pasta do plugin, que a skill esteira passa (lá o Claude Code a substitui).
const CLAUDE_PLUGIN_ROOT = args && args.raizDoPlugin
if (!alvo || !CLAUDE_PLUGIN_ROOT) {
  return { parou: true, erro: 'a esteira precisa de args.alvo (série ou issue) e args.raizDoPlugin' }
}
const AUDITOR = `node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs"`
const APROVADA = ['alinhada', 'alinhada com teste manual pendente']

// Roda um comando simples por um agente, que só devolve o código de saída e a saída crua.
async function rodar(comando, label, fase) {
  const r = await agent(
    [
      'Rode exatamente o comando abaixo, uma vez, na raiz do projeto, pela ferramenta Bash. Não',
      'altere nada, não conserte nada e não rode outro comando. Devolva o código de saída e a',
      'saída padrão completa, copiada sem resumir nem reformatar (é uma linha de JSON ou texto).',
      '',
      comando,
    ].join('\n'),
    { schema: COMANDO, label, phase: fase, effort: 'low' }
  )
  return r || { codigo: -1, saida: '' }
}

function json(r) {
  try {
    return JSON.parse(r.saida)
  } catch {
    return null
  }
}

const concluidas = []
const jaFeitas = []
let ramo = null
// Grupos de issues que poderiam rodar juntas (só informação: a esteira roda uma por vez).
let podemRodarJuntas = []

function resumo(parada) {
  const base = { alvo, ramo, concluidas, jaFeitas, podemRodarJuntas }
  if (!parada) {
    return {
      ...base,
      parou: false,
      parouEm: null,
      proximosPassos: 'Esteira terminada. Push, pull request e merge do branch da série ficam com você.',
    }
  }
  return {
    ...base,
    parou: true,
    parouEm: parada.issue || null,
    motivo: parada.motivo,
    detalhes: parada.detalhes || '',
    tentativas: parada.tentativas === undefined ? null : parada.tentativas,
    aguardaSim: Boolean(parada.aguardaSim),
    veredito: parada.veredito || null,
    arquivos: parada.arquivos || [],
    proximosPassos: parada.decisao,
  }
}

function emAberto(issue) {
  return [...issue.perguntasAbertas, ...issue.suposicoesAbertas]
}

// ------------------------------------------------------------------ preparação
phase('Preparação')
// A série vem da primeira lista; a lista que vale é a tirada já no branch da série,
// porque é o histórico dele que diz o que a esteira já commitou.
const descoberta = json(await rodar(`${AUDITOR} esteira-lista ${alvo} --linha`, 'descoberta', 'Preparação'))
if (!descoberta || !descoberta.serie) {
  return resumo({ motivo: `não deu para achar as issues de "${alvo}"`, decisao: 'confira o alvo e rode a esteira de novo' })
}
ramo = `esteira/${descoberta.serie}`
const existe = await rodar(`git rev-parse --verify --quiet refs/heads/${ramo}`, 'branch-existe', 'Preparação')
const troca = await rodar(existe.codigo === 0 ? `git switch ${ramo}` : `git switch -c ${ramo}`, 'branch', 'Preparação')
if (troca.codigo !== 0) {
  return resumo({ motivo: `não deu para ir para o branch ${ramo}`, detalhes: troca.saida, decisao: 'resolva o estado do git (mudanças não commitadas?) e retome' })
}
const lista = json(await rodar(`${AUDITOR} esteira-lista ${alvo} --linha`, 'lista', 'Preparação'))
if (!lista || !Array.isArray(lista.issues) || lista.issues.length === 0) {
  return resumo({ motivo: `não deu para listar as issues de "${alvo}" no branch ${ramo}`, decisao: 'confira o alvo e rode a esteira de novo' })
}
podemRodarJuntas = (lista.lotes || []).filter((lote) => lote.length > 1)
if (podemRodarJuntas.length) log(`Poderiam rodar juntas: ${podemRodarJuntas.map((l) => l.join(' + ')).join('; ')} (por enquanto, uma por vez)`)

// ---------------------------------------------------------------------- issues
phase('Issues')

async function rodarIssue(issue) {
  const id = issue.id
  const P = 'Issues'
  const parar = (motivo, extra) => ({ issue: id, motivo, ...extra })

  if (emAberto(issue).length) {
    return parar('há suposição ou pergunta em aberto na issue, antes de implementar', {
      detalhes: emAberto(issue).join(', '),
      decisao: `responda ou confirme ${emAberto(issue).join(', ')} na issue ${issue.caminho} e retome a esteira`,
    })
  }
  const inicio = await rodar(`${AUDITOR} iniciar ${id}`, `iniciar:${id}`, P)
  if (inicio.codigo !== 0) {
    return parar('não deu para marcar a issue como ativa no portão', { detalhes: inicio.saida, decisao: 'confira a issue e retome' })
  }

  const plano = await agent(`Planeje a issue ${issue.caminho}.`, { agentType: 'anti-vibe:planejador', label: `planejador:${id}`, phase: P })
  if (plano === null) return parar('o planejador não respondeu', { decisao: 'retome a esteira' })
  const relida = json(await rodar(`${AUDITOR} esteira-lista ${id} --linha`, `relida:${id}`, P))
  const atual = relida && relida.issues && relida.issues[0]
  if (!atual) return parar('não deu para reler a issue depois do plano', { decisao: 'confira a issue e retome' })
  if (emAberto(atual).length) {
    return parar('o plano deixou uma decisão em aberto', {
      detalhes: emAberto(atual).join(', '),
      decisao: `decida ${emAberto(atual).join(', ')} na issue ${atual.caminho} (e na spec) e retome a esteira`,
    })
  }

  if (atual.automaticos > 0) {
    const testes = await agent(`Escreva os testes da issue ${atual.caminho}.`, { agentType: 'anti-vibe:escritor-de-testes', label: `escritor:${id}`, phase: P })
    if (testes === null) return parar('o escritor de testes não respondeu', { decisao: 'retome a esteira' })
    const estado = json(await rodar(`${AUDITOR} estado ${id} --linha`, `estado-testes:${id}`, P))
    const criterios = estado && estado.antes ? estado.antes.criterios : null
    if (!criterios || estado.precisaDecisao || Object.values(criterios).some((c) => c !== 'falhou')) {
      return parar('os testes não ficaram prontos: um teste falhando para cada critério automático', {
        detalhes: criterios ? Object.entries(criterios).map(([c, e]) => `${c}: ${e}`).join('; ') : 'sem registro antes',
        tentativas: estado ? estado.tentativas || 0 : null,
        decisao: 'veja os testes que faltam ou que já passam, decida e retome',
      })
    }
  }

  let apontamentos = null
  let veredito = null
  for (let rodada = 1; rodada <= 2; rodada++) {
    const pedido =
      rodada === 1
        ? `Implemente a issue ${atual.caminho}.`
        : `Corrija a implementação da issue ${atual.caminho} conforme estes apontamentos do revisor independente, sem mexer em teste:\n\n${apontamentos}`
    const feito = await agent(pedido, { agentType: 'anti-vibe:executor', label: `${rodada === 1 ? 'executor' : 'correcao'}:${id}`, phase: P })
    if (feito === null) return parar('o executor não respondeu', { decisao: 'retome a esteira' })

    const rel = json(await rodar(`${AUDITOR} issue ${id} --linha`, `auditor:${id}:${rodada}`, P))
    if (!rel) return parar('o auditor não respondeu', { decisao: 'rode o auditor à mão e retome' })
    if (!APROVADA.includes(rel.veredito)) {
      const estado = json(await rodar(`${AUDITOR} estado ${id} --linha`, `estado:${id}:${rodada}`, P))
      const faltam = (rel.problemas || []).map((p) => `${p.codigo} — ${p.alvo}: ${p.detalhe}`)
      return parar(estado && estado.precisaDecisao ? 'o auditor reprovou até o limite de tentativas' : `o auditor não aprovou (veredito: ${rel.veredito})`, {
        detalhes: faltam.join('\n'),
        tentativas: estado ? estado.tentativas || 0 : null,
        decisao: 'decida o que fazer com os critérios que faltam (corrigir a issue, a spec ou o código) e retome',
      })
    }
    veredito = rel.veredito

    const revisao = await agent(
      [
        `Revise a issue ${atual.caminho}.`,
        `As mudanças: rode \`git diff HEAD -- ${atual.arquivos.join(' ')}\` (arquivo novo: leia inteiro).`,
        'A página de princípios: o AGENTS.md da raiz do projeto (na falta dele, o CLAUDE.md).',
        'Em nenhumProblema, diga se não achou nenhum problema; em apontamentos, os blocos do que achou (vazio se nada).',
      ].join('\n'),
      { agentType: 'anti-vibe:revisor', schema: REVISAO, label: `revisor:${id}:${rodada}`, phase: P }
    )
    if (revisao === null) return parar('o revisor independente não respondeu', { decisao: 'retome a esteira (a issue não foi commitada)' })
    if (revisao.nenhumProblema) {
      apontamentos = null
      break
    }
    apontamentos = revisao.apontamentos
    if (rodada === 2) {
      return parar('o revisor independente continuou apontando problema depois de uma correção', {
        detalhes: apontamentos,
        decisao: 'leia os apontamentos, decida e retome (a issue não foi commitada)',
      })
    }
  }

  if (atual.risco) {
    return parar('issue de risco: o auditor e o revisor aprovaram; o commit espera o seu sim', {
      detalhes: `veja as mudanças com git diff -- ${atual.arquivos.join(' ')}`,
      aguardaSim: true,
      veredito,
      arquivos: atual.arquivos,
      decisao: 'confira as mudanças e diga sim para commitar; depois a esteira segue',
    })
  }

  const mover = veredito === 'alinhada'
  const commit = await agent(
    [
      `Faça o commit da issue ${id}, no branch atual (${ramo}), pela ferramenta Bash.`,
      `1. Adicione um a um (git add <arquivo>), entre os arquivos mexidos, os desta lista: ${atual.arquivos.join(', ')};`,
      `   e os documentos do fluxo mexidos, dentro de ${lista.pastaSpecs}/. Nunca adicione tudo de uma vez (git add -A ou git add .).`,
      mover
        ? `2. Mova a issue para a pasta de concluídas: git mv ${atual.caminho} ${lista.pastaIssues}/concluidas_${atual.serie || lista.serie}/ (crie a pasta se faltar).`
        : '2. Não mova a issue: ela tem teste manual pendente e fica aberta.',
      `3. Commite com a mensagem de duas partes: a primeira linha "feat(${id}): ${atual.titulo.replace(/^[A-Za-z]+\d+-\d+:\s*/, '')}" e, depois de uma linha em branco, "Esteira-Issue: ${id}".`,
      '4. Não envie nada ao remoto e não junte branches.',
      'Devolva o hash curto do commit, se a issue foi movida e, se algo deu errado, o erro (vazio se nada).',
    ].join('\n'),
    { schema: COMMIT, label: `commit:${id}`, phase: P, effort: 'low' }
  )
  if (!commit || !commit.commit || commit.erro) {
    return parar('o commit da issue falhou', { detalhes: commit ? commit.erro : 'sem resposta', decisao: 'confira o git e retome' })
  }
  return null
}

for (const issue of lista.issues) {
  if (issue.commitada || issue.concluida) {
    jaFeitas.push(issue.id)
    continue
  }
  const parada = await rodarIssue(issue)
  if (parada) return resumo(parada)
  concluidas.push(issue.id)
  log(`${issue.id} commitada no ${ramo}`)
}
return resumo(null)
