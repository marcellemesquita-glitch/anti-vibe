// Auditor do fluxo com prova.
//
// Confere, sem julgamento do agente, se uma issue (ou uma série inteira) está
// alinhada: cada critério de aceite automático tem teste com o código dele e o
// teste passou; suposições e perguntas estão fechadas; as seções obrigatórias
// existem. Mora na pasta do plugin e roda sempre a partir da RAIZ do projeto:
//
//   node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" issue <id|caminho> [--sem-rodar] [--json | --linha]
//   node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" serie <série> [--sem-rodar] [--json]
//   node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" esteira-lista <série|id> [--json | --linha]
//   node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" estado <id> [--json | --linha]
//   node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" iniciar <id|caminho>
//   node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" antes <id|caminho> [--json]
//   node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" suposicoes
//   node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" confirmar <id> <CA-...> --por <nome> [--dia dd/mm/aaaa]
//   node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" regras
//   node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" licao listar | adicionar | recorreu | remover
//
// Sem dependências: só o Node do ambiente. A configuração padrão está aqui mesmo;
// a do projeto vence. Tudo o que o auditor grava fica no projeto, nunca no plugin.
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const CONFIG_PADRAO = {
  pastaIssues: 'pre-desenvolvimento/issues',
  pastaSpecs: 'pre-desenvolvimento',
  pastaSpecsArquivadas: 'docs/specs-arquivadas',
  pastasTestes: ['src', 'test', 'tests', '__tests__'],
  sufixosTeste: ['.test.ts', '.test.tsx', '.test.js', '.test.jsx', '.test.mjs', '.spec.ts', '.spec.tsx', '.spec.js'],
  comandoTeste: 'npx vitest run {arquivos} --reporter=json --outputFile={saida}',
  // Quem pode aprovar exceção. Lista vazia = qualquer nome preenchido.
  aprovadores: [],
  // Arquivos que nunca contam como "fora da issue" (documentos do próprio fluxo).
  foraDoEscopo: ['pre-desenvolvimento/**'],
  arquivoLicoes: 'pre-desenvolvimento/licoes.md',
  // Configuração do executor de testes, do CI e do próprio auditor: mexer nela sem a
  // issue listar o arquivo é trapaça possível.
  configDeTeste: [
    'vitest.config.*',
    'vitest.workspace.*',
    'vite.config.*',
    'jest.config.*',
    'playwright.config.*',
    'cypress.config.*',
    '.github/workflows/**',
    '.gitlab-ci.yml',
    '.circleci/**',
  ],
  // Reprovações do portão numa issue antes de ela precisar de decisão humana.
  limiteDeTentativas: 3,
}

// Configuração do próprio auditor, no projeto: sempre conferida, nunca configurável.
const CONFIG_DO_AUDITOR = ['.claude/auditor.json', '.claude/auditor-regras.json']

export const SAIDA = { ALINHADA: 0, NAO_ALINHADA: 1, USO: 2, MANUAL_PENDENTE: 10, NAO_RODADO: 11 }

const NOMES = {
  CRITERIO_SEM_TESTE: 'critério sem teste',
  CRITERIO_SEM_PROVA: 'critério sem prova',
  TESTE_ORFAO: 'teste órfão',
  CRITERIO_FORA_DE_ISSUE: 'critério fora de issue',
  CRITERIO_EM_DUAS_ISSUES: 'critério em duas issues',
  CRITERIO_FORA_DA_SPEC: 'critério fora da spec',
  SUPOSICAO_ABERTA: 'suposição aberta',
  PERGUNTA_ABERTA: 'pergunta aberta',
  SECAO_AUSENTE: 'seção ausente',
  SPEC_NAO_ENCONTRADA: 'spec não encontrada',
  EXCECAO_INVALIDA: 'exceção inválida',
  TESTE_MANUAL_PENDENTE: 'teste manual pendente',
  FORMATO_ANTIGO: 'issue no formato antigo',
  PROVA_NAO_CONFERIDA: 'prova não conferida',
  ARQUIVO_FORA_DA_ISSUE: 'arquivo fora da issue',
  ARQUIVO_NAO_TOCADO: 'arquivo não tocado',
  CHECKLIST_INCOMPLETO: 'checklist incompleto',
  REGRA_VIOLADA: 'regra violada',
  REGRA_DESLIGADA_SEM_MOTIVO: 'regra desligada sem motivo',
  REGRA_SEM_ARQUIVOS: 'regra que não confere nenhum arquivo',
  ESCOPO_NAO_CONFERIDO: 'escopo não conferido',
  TESTE_ALTERADO: 'teste alterado',
  TESTES_A_MENOS: 'testes a menos',
  TESTE_MARCADO: 'teste pulado ou isolado',
  CONFIG_DE_TESTE_ALTERADA: 'configuração de teste alterada',
  TESTE_NUNCA_FALHOU: 'teste que nunca falhou',
  FALHA_ANTES_NAO_REGISTRADA: 'falha antes não registrada',
  DECISAO_HUMANA: 'precisa de decisão humana',
  ISSUE_ALTERADA: 'issue alterada depois do antes',
  PORTAO_SEM_CONFERENCIA: 'portão sem conferência',
}

const RE_CODIGO_CA = /CA-[A-Z0-9]+-\d+/g
const RE_DIA = /^\d{2}\/\d{2}\/\d{4}$/

// ---------------------------------------------------------------- leitura

function ler(arquivo) {
  return fs.readFileSync(arquivo, 'utf8').replace(/\r\n/g, '\n')
}

function semAcento(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function pastaDoAuditor() {
  return path.dirname(fileURLToPath(import.meta.url))
}

// Onde procurar as regras por script, do mais geral ao mais específico: a pasta
// do auditor no plugin e o `.claude/` do projeto. O do projeto vence.
function arquivosDeConfig(raiz, pastaDoPlugin, nomeNoPlugin, nomeNoProjeto) {
  const candidatos = [
    path.join(pastaDoPlugin, nomeNoPlugin),
    path.join(raiz, '.claude', nomeNoProjeto),
  ].map((a) => path.resolve(a))
  return [...new Set(candidatos)].filter((a) => fs.existsSync(a))
}

// A configuração tem só duas camadas: CONFIG_PADRAO e `.claude/auditor.json` do
// projeto, que vence. Nada na pasta do plugin muda a configuração.
export function carregarConfig(raiz) {
  const doProjeto = path.join(raiz, '.claude', 'auditor.json')
  return fs.existsSync(doProjeto) ? { ...CONFIG_PADRAO, ...JSON.parse(ler(doProjeto)) } : { ...CONFIG_PADRAO }
}

// Conteúdo de uma seção `## Título`, até a próxima `## `. null se não existe.
export function secao(texto, titulo) {
  const linhas = texto.split('\n')
  const alvo = semAcento(titulo)
  const inicio = linhas.findIndex((l) => /^##\s+/.test(l) && semAcento(l.replace(/^##\s+/, '')) === alvo)
  if (inicio === -1) return null
  let fim = linhas.findIndex((l, i) => i > inicio && /^##\s+/.test(l))
  if (fim === -1) fim = linhas.length
  return linhas.slice(inicio + 1, fim).join('\n')
}

// Linhas de dados de uma tabela markdown (sem cabeçalho nem separador).
export function linhasDaTabela(texto) {
  if (!texto) return []
  const linhas = texto.split('\n').filter((l) => l.trim().startsWith('|'))
  return linhas
    .slice(1)
    .filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l))
    .map((l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
}

function vazio(celula) {
  return !celula || celula === '—' || celula === '-'
}

export function serieDoCodigo(codigo) {
  const m = /^[A-Z]+-([A-Z0-9]+)-\d+$/.exec(codigo)
  return m ? m[1] : null
}

function serieDaIssue(caminho) {
  const m = /^([A-Za-z]+\d+)-\d+/.exec(path.basename(caminho))
  return m ? m[1].toUpperCase() : null
}

// Apaga o conteúdo dos blocos de código (``` ... ```), mantendo as linhas. Um
// exemplo de formato dentro de um bloco não é critério nem suposição de verdade.
export function semBlocosDeCodigo(texto) {
  let dentro = false
  return texto
    .split('\n')
    .map((linha) => {
      const cerca = /^\s*(```|~~~)/.test(linha)
      if (cerca) dentro = !dentro
      return cerca || dentro ? '' : linha
    })
    .join('\n')
}

export function lerIssue(caminho) {
  const bruto = ler(caminho)
  const texto = semBlocosDeCodigo(bruto)
  const titulo = (/^#\s+(.+)$/m.exec(texto) || [])[1] || path.basename(caminho)
  const secCriterios = secao(texto, 'Critérios de aceite')
  const criterios = []
  if (secCriterios !== null) {
    const re = /^- \*\*(CA-[A-Z0-9]+-\d+)\*\*\s*\(([^)]+)\)\s*(?:—|-)?\s*(.*)$/gm
    let m
    while ((m = re.exec(secCriterios))) {
      criterios.push({ codigo: m[1], prova: semAcento(m[2]) === 'manual' ? 'manual' : 'automatica', texto: m[3] })
    }
  }
  const roteiros = {}
  const reRoteiro = /^###\s+Roteiro manual\s*(?:—|-)\s*(CA-[A-Z0-9]+-\d+)\s*\n([\s\S]*?)(?=\n#{2,3}\s|(?![\s\S]))/gm
  let r
  while ((r = reRoteiro.exec(texto))) roteiros[r[1]] = r[2].trim()

  return {
    caminho,
    texto: bruto,
    titulo,
    serie: serieDaIssue(caminho),
    // Issue avulsa: combinada na triagem, sem spec; os critérios dela bastam.
    avulsa: semAcento((/^\*\*Tipo:\*\*\s*(.+)$/m.exec(texto) || [])[1] || '') === 'avulsa',
    formatoAntigo: secCriterios === null,
    criterios,
    roteiros,
    suposicoes: registros(secao(texto, 'Suposições'), 'SUP'),
    perguntas: registros(secao(texto, 'Perguntas em aberto'), 'PER'),
    temSuposicoes: secao(texto, 'Suposições') !== null,
    temPerguntas: secao(texto, 'Perguntas em aberto') !== null,
    // null = a issue ainda não passou pelo /plan (sem a seção Arquivos).
    arquivos:
      secao(texto, 'Arquivos') === null
        ? null
        : [...secao(texto, 'Arquivos').matchAll(/^- \*\*[^*]+:\*\*\s*`([^`]+)`/gm)].map((m) => m[1]),
    checklistAbertos: [...(secao(texto, 'Checklist') || '').matchAll(/^- \[ \]\s*(.+)$/gm)].map((m) => m[1]),
    manuais: linhasDaTabela(secao(texto, 'Testes manuais')).map(([codigo, por, dia]) => ({ codigo, por, dia })),
    excecoes: linhasDaTabela(secao(texto, 'Exceções')).map(([problema, alvo, motivo, por, dia]) => ({
      problema,
      alvo,
      motivo,
      por,
      dia,
    })),
  }
}

function registros(sec, prefixo) {
  return linhasDaTabela(sec)
    .filter(([id]) => id && id.startsWith(`${prefixo}-`))
    .map(([id, texto, status, resolucao]) => ({ id, texto, status: semAcento(status || ''), resolucao }))
}

export function lerSpec(caminho) {
  const texto = semBlocosDeCodigo(ler(caminho))
  const criterios = []
  const re = /^#{3,5}\s+(CA-[A-Z0-9]+-\d+)\b(.*)$/gm
  let m
  while ((m = re.exec(texto))) {
    const prova = /prova:\s*manual/i.test(m[2]) ? 'manual' : 'automatica'
    criterios.push({ codigo: m[1], prova })
  }
  return {
    caminho,
    titulo: (/^#\s+(.+)$/m.exec(texto) || [])[1] || path.basename(caminho),
    serie: ((/^>\s*s[ée]rie:\s*([A-Za-z0-9]+)/m.exec(texto) || [])[1] || '').toUpperCase() || null,
    criterios,
    suposicoes: registros(secao(texto, 'Suposições'), 'SUP'),
    perguntas: registros(secao(texto, 'Perguntas em aberto'), 'PER'),
    temSuposicoes: secao(texto, 'Suposições') !== null,
    temPerguntas: secao(texto, 'Perguntas em aberto') !== null,
  }
}

function arquivosMd(pasta) {
  if (!fs.existsSync(pasta)) return []
  return fs
    .readdirSync(pasta, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => path.join(pasta, e.name))
}

// Arquivos de spec (spec*.md) de uma pasta.
export function listarSpecs(pasta) {
  return arquivosMd(pasta).filter((a) => path.basename(a).startsWith('spec'))
}

// Spec da série: em andamento ou já arquivada.
export function acharSpec(raiz, cfg, serie) {
  const pastas = [cfg.pastaSpecs, cfg.pastaSpecsArquivadas].map((p) => path.join(raiz, p))
  for (const pasta of pastas) {
    for (const arquivo of listarSpecs(pasta)) {
      const spec = lerSpec(arquivo)
      if (spec.serie === serie) return spec
    }
  }
  return null
}

// Issues abertas (soltas na pasta) e, se pedido, as das subpastas de concluídas.
export function listarIssues(raiz, cfg, { comConcluidas = false } = {}) {
  const pasta = path.join(raiz, cfg.pastaIssues)
  const soltas = arquivosMd(pasta).filter((a) => path.basename(a) !== 'README.md')
  if (!comConcluidas || !fs.existsSync(pasta)) return soltas
  const subpastas = fs.readdirSync(pasta, { withFileTypes: true }).filter((e) => e.isDirectory())
  return soltas.concat(subpastas.flatMap((s) => arquivosMd(path.join(pasta, s.name))))
}

export function acharIssue(raiz, cfg, idOuCaminho) {
  const direto = path.resolve(raiz, idOuCaminho)
  if (idOuCaminho.endsWith('.md') && fs.existsSync(direto)) return direto
  const prefixo = `${idOuCaminho.toUpperCase()}-`
  return (
    listarIssues(raiz, cfg, { comConcluidas: true }).find((a) =>
      path.basename(a).toUpperCase().startsWith(prefixo)
    ) || null
  )
}

// ------------------------------------------------------- códigos nos testes

function arquivosDeTeste(raiz, cfg) {
  const achados = []
  const andar = (pasta) => {
    if (!fs.existsSync(pasta)) return
    for (const e of fs.readdirSync(pasta, { withFileTypes: true })) {
      const caminho = path.join(pasta, e.name)
      if (e.isDirectory()) andar(caminho)
      else if (cfg.sufixosTeste.some((s) => e.name.endsWith(s))) achados.push(caminho)
    }
  }
  cfg.pastasTestes.forEach((p) => andar(path.join(raiz, p)))
  return achados
}

// Mapa código → [{ arquivo, linha, titulo, pulado }]. Só vale código no nome de
// um `it`/`test`; no `describe` não conta.
export function codigosNosTestes(raiz, cfg) {
  const mapa = new Map()
  const re = /\b(x?it|test)((?:\.\w+)*)\s*\(\s*(["'`])((?:\\.|(?!\3).)*)\3/g
  for (const arquivo of arquivosDeTeste(raiz, cfg)) {
    ler(arquivo)
      .split('\n')
      .forEach((linha, i) => {
        re.lastIndex = 0
        let m
        while ((m = re.exec(linha))) {
          const pulado = m[1] === 'xit' || /\.(skip|todo)\b/.test(m[2])
          for (const codigo of m[4].match(RE_CODIGO_CA) || []) {
            if (!mapa.has(codigo)) mapa.set(codigo, [])
            mapa.get(codigo).push({ arquivo: path.relative(raiz, arquivo).split(path.sep).join('/'), linha: i + 1, titulo: m[4], pulado })
          }
        }
      })
  }
  return mapa
}

// ------------------------------------------------- impressão dos testes

// Linha que fica só com fechamento de bloco (ou em branco): não conta.
const RE_SO_FECHA = /^\s*[})\];,]*\s*$/
// Modificadores que recebem argumentos antes do nome: it.each([...])('nome').
const MODIFICADORES_COM_ARGUMENTO = ['each', 'for', 'skipIf', 'runIf']
// Modificadores que pulam ou isolam o teste.
const MARCACOES = ['skip', 'only', 'todo', 'skipIf', 'runIf']

function resumo(texto) {
  return crypto.createHash('sha256').update(texto).digest('hex').slice(0, 16)
}

// A linha sem o conteúdo dos textos e sem comentário de linha, para contar parênteses.
function semTextos(linha) {
  return linha.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""').replace(/\/\/.*$/, '')
}

// Posição do parêntese que fecha o primeiro que abre em `texto`; -1 se não fecha.
function fechaParenteses(texto) {
  const limpo = semTextos(texto)
  let prof = 0
  for (let i = 0; i < limpo.length; i++) {
    if (limpo[i] === '(') prof++
    else if (limpo[i] === ')' && --prof === 0) return i
  }
  return -1
}

// Última linha do bloco que abre na linha `inicio` (parênteses, chaves e colchetes).
function fimDoBloco(linhas, inicio) {
  let prof = 0
  let abriu = false
  for (let i = inicio; i < linhas.length; i++) {
    for (const c of semTextos(linhas[i])) {
      if ('({['.includes(c)) {
        prof++
        abriu = true
      } else if (')}]'.includes(c)) prof--
    }
    if (abriu && prof <= 0) return i
  }
  return linhas.length - 1
}

// Abertura de teste ou describe na linha `i`: { tipo, nome, marcacao } ou null.
// Aceita modificadores (`.skip`, `.each([...])`...) e o nome na linha seguinte.
function aberturaDeTeste(linhas, i) {
  const m = /^\s*([xf]?it|test|[xf]?describe)\b/.exec(linhas[i])
  if (!m) return null
  let resto = linhas[i].slice(m[0].length)
  const modificadores = []
  for (;;) {
    const mod = /^\s*\.(\w+)/.exec(resto)
    if (!mod) break
    modificadores.push(mod[1])
    resto = resto.slice(mod[0].length)
    if (MODIFICADORES_COM_ARGUMENTO.includes(mod[1]) && /^\s*\(/.test(resto)) {
      const fim = fechaParenteses(resto)
      if (fim < 0) return null
      resto = resto.slice(fim + 1)
    }
  }
  const abre = /^\s*\(\s*/.exec(resto)
  if (!abre) return null
  resto = resto.slice(abre[0].length)
  if (!resto.trim() && i + 1 < linhas.length) resto = linhas[i + 1].trim()
  const nome = /^(["'`])((?:\\.|(?!\1).)*)\1/.exec(resto)
  if (!nome) return null
  const marca = /^[xf]/.test(m[1]) ? m[1] : modificadores.find((x) => MARCACOES.includes(x))
  return {
    tipo: /describe$/.test(m[1]) ? 'describe' : 'teste',
    nome: nome[2],
    marcacao: marca ? (marca === m[1] ? marca : `${m[1]}.${marca}`) : null,
  }
}

// Leitura de um arquivo de teste:
// - testes: [{ chave, nome, caminho, linha, resumo }], o caminho com os describes; o
//   trecho de cada teste vai da abertura até o fechamento do bloco, sem espaços nas
//   pontas e sem linhas em branco (reindentar não muda o resumo);
// - preparacao: as linhas fora de qualquer teste (imports, funções de apoio,
//   before/after), sem as que só fecham bloco;
// - marcacoes: [{ nome, marcacao, linha }] de testes e describes.
export function lerTestes(texto) {
  const linhas = texto.replace(/\r\n/g, '\n').split('\n')
  const testes = []
  const marcacoes = []
  const dentro = new Array(linhas.length).fill(false)
  const describes = []
  const vistos = new Map()
  for (let i = 0; i < linhas.length; i++) {
    while (describes.length && i > describes[describes.length - 1].fim) describes.pop()
    const abertura = aberturaDeTeste(linhas, i)
    if (!abertura) continue
    if (abertura.marcacao) marcacoes.push({ nome: abertura.nome, marcacao: abertura.marcacao, linha: i + 1 })
    const fim = fimDoBloco(linhas, i)
    if (abertura.tipo === 'describe') {
      describes.push({ nome: abertura.nome, fim })
      continue
    }
    const caminho = [...describes.map((d) => d.nome), abertura.nome].join(' › ')
    const n = (vistos.get(caminho) || 0) + 1
    vistos.set(caminho, n)
    const corpo = linhas.slice(i, fim + 1).map((l) => l.trim()).filter(Boolean)
    for (let k = i; k <= fim; k++) dentro[k] = true
    testes.push({ chave: n > 1 ? `${caminho} #${n}` : caminho, nome: abertura.nome, caminho, linha: i + 1, resumo: resumo(corpo.join('\n')) })
    i = fim
  }
  const preparacao = linhas.filter((_, k) => !dentro[k]).map((l) => l.trim()).filter((l) => !RE_SO_FECHA.test(l))
  return { testes, preparacao, marcacoes }
}

export function eArquivoDeTeste(rel, cfg) {
  return cfg.pastasTestes.some((p) => rel.startsWith(`${p}/`)) && cfg.sufixosTeste.some((s) => rel.endsWith(s))
}

function impressaoDoArquivo(texto) {
  const { testes, preparacao } = lerTestes(texto)
  return { testes: testes.map(({ chave, nome, caminho, resumo }) => ({ chave, nome, caminho, resumo })), preparacao }
}

// Impressão de todos os testes de agora: mapa arquivo → { testes, preparacao }.
export function impressaoDosTestes(raiz, cfg) {
  const mapa = {}
  for (const arquivo of arquivosDeTeste(raiz, cfg)) mapa[relativoAoProjeto(raiz, arquivo)] = impressaoDoArquivo(ler(arquivo))
  return mapa
}

// A mesma impressão, dos arquivos de teste de um commit. null sem git ou sem o commit.
export function impressaoDoCommit(raiz, cfg, commit = 'HEAD') {
  const lista = git(raiz, ['ls-tree', '-r', '--name-only', commit])
  if (lista === null) return null
  const mapa = {}
  for (const rel of lista.split('\n').filter((a) => a && eArquivoDeTeste(a, cfg))) {
    const texto = git(raiz, ['show', `${commit}:./${rel}`])
    if (texto !== null) mapa[rel] = impressaoDoArquivo(texto)
  }
  return mapa
}

export function contarTestes(impressao) {
  return Object.values(impressao).reduce((total, a) => total + a.testes.length, 0)
}

function relativoAoProjeto(raiz, arquivo) {
  return path.relative(raiz, arquivo).split(path.sep).join('/')
}

// Resultado do Vitest (JSON) → mapa código → [status].
export function resultadosDoJson(json) {
  const mapa = new Map()
  for (const arquivo of json.testResults || []) {
    for (const caso of arquivo.assertionResults || []) {
      for (const codigo of new Set((caso.title || '').match(RE_CODIGO_CA) || [])) {
        if (!mapa.has(codigo)) mapa.set(codigo, [])
        mapa.get(codigo).push(caso.status)
      }
    }
  }
  return mapa
}

export function rodarTestes(raiz, cfg, arquivos) {
  if (arquivos.length === 0) return { resultados: new Map() }
  const saida = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-')), 'resultado.json')
  const comando = cfg.comandoTeste
    .replace('{arquivos}', arquivos.map((a) => `"${a.split(path.sep).join('/')}"`).join(' '))
    .replace('{saida}', `"${saida}"`)
  const proc = spawnSync(comando, { cwd: raiz, shell: true, encoding: 'utf8' })
  if (!fs.existsSync(saida)) {
    const fim = `${proc.stdout || ''}\n${proc.stderr || ''}`.trim().split('\n').slice(-15).join('\n')
    return { resultados: new Map(), erro: fim || 'o comando de teste não gerou resultado' }
  }
  return { resultados: resultadosDoJson(JSON.parse(ler(saida))) }
}

// ------------------------------------------------- escopo e regras por script

// Glob simples (`**`, `*`, `{a,b}`) → expressão regular.
export function globParaRegex(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*'
      i += glob[i + 2] === '/' ? 2 : 1
    } else if (c === '*') re += '[^/]*'
    else if (c === '{') re += '(?:'
    else if (c === '}') re += ')'
    else if (c === ',') re += '|'
    else re += c.replace(/[.+?^$()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

function casa(globs, arquivo) {
  return (globs || []).some((g) => globParaRegex(g).test(arquivo))
}

// Nomes com acento saem como texto, não como escapes octais.
function git(raiz, args) {
  const proc = spawnSync('git', ['-c', 'core.quotePath=false', ...args], { cwd: raiz, encoding: 'utf8' })
  return proc.status === 0 ? proc.stdout : null
}

// Pasta do projeto dentro do repositório ('' na raiz, 'app/' numa subpasta).
function prefixoNoRepositorio(raiz) {
  return (git(raiz, ['rev-parse', '--show-prefix']) || '').trim()
}

// O que mudou desde um commit (o último, por padrão), com os caminhos relativos ao
// projeto e só os de dentro dele: [{ arquivo, estado: 'A' | 'M' | 'D', linhas }].
// `linhas` são as linhas acrescentadas (null = o arquivo inteiro é novo).
// Devolve null fora de um repositório git, ou se o commit não existe.
export function mudancasDoGit(raiz, desde = 'HEAD') {
  const status = git(raiz, ['status', '--porcelain=v1', '-uall'])
  if (status === null) return null
  const prefixo = prefixoNoRepositorio(raiz)
  const doProjeto = (arquivo) => (arquivo.startsWith(prefixo) ? arquivo.slice(prefixo.length) : null)
  const mudancas = new Map()
  for (const linha of status.split('\n').filter(Boolean)) {
    const xy = linha.slice(0, 2)
    const arquivo = doProjeto(linha.slice(3).split(' -> ').pop().replace(/^"|"$/g, ''))
    if (arquivo === null) continue
    const estado = xy.includes('D') ? 'D' : xy === '??' || xy.includes('A') ? 'A' : 'M'
    if (desde === 'HEAD' || xy === '??') mudancas.set(arquivo, estado)
  }
  if (desde !== 'HEAD') {
    // Desde um commit mais antigo: o que o diff contra ele mostra, mais os não versionados.
    const diff = git(raiz, ['diff', '--name-status', '--relative', desde])
    if (diff === null) return null
    for (const linha of diff.split('\n').filter(Boolean)) {
      const [tipo, ...caminhos] = linha.split('\t')
      const estado = tipo.startsWith('D') ? 'D' : tipo.startsWith('A') ? 'A' : 'M'
      if (tipo.startsWith('R')) mudancas.set(caminhos[0], 'D')
      mudancas.set(caminhos[caminhos.length - 1], tipo.startsWith('R') ? 'A' : estado)
    }
  }
  return [...mudancas].map(([arquivo, estado]) => ({
    arquivo,
    estado,
    linhas: estado === 'M' ? linhasAcrescentadas(raiz, arquivo, desde) : null,
  }))
}

function linhasAcrescentadas(raiz, arquivo, desde = 'HEAD') {
  const diff = git(raiz, ['diff', '-U0', desde, '--', arquivo]) || ''
  const linhas = new Set()
  for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const inicio = Number(m[1])
    const quantas = m[2] === undefined ? 1 : Number(m[2])
    for (let i = 0; i < quantas; i++) linhas.add(inicio + i)
  }
  return linhas
}

// Regras por script, nos mesmos lugares da configuração. Regra com o mesmo
// `id` em um lugar mais específico substitui a mais geral.
export function carregarRegras(raiz, pastaDoPlugin = pastaDoAuditor()) {
  const porId = new Map()
  for (const arquivo of arquivosDeConfig(raiz, pastaDoPlugin, 'regras.json', 'auditor-regras.json')) {
    for (const regra of JSON.parse(ler(arquivo))) porId.set(regra.id, regra)
  }
  return [...porId.values()]
}

// Confere as regras nos arquivos mudados. Regra de conteúdo olha só as linhas
// acrescentadas; regra "intocavel" acusa arquivo modificado ou apagado.
export function conferirRegras({ raiz, regras, mudancas }) {
  const problemas = []
  const desligadas = []
  const mudados = mudancas.map((m) => m.arquivo)
  for (const regra of regras) {
    for (const m of mudancas) {
      if (!casa(regra.arquivos, m.arquivo) || casa(regra.excluir, m.arquivo)) continue
      const local = path.join(raiz, m.arquivo)
      const texto = m.estado !== 'D' && fs.existsSync(local) ? ler(local) : ''

      const desliga = new RegExp(`auditor-desligar\\s+${regra.id}\\b[ \\t]*:?[ \\t]*(.*)`).exec(texto)
      if (desliga) {
        const motivo = desliga[1].replace(/\*\/|-->/g, '').trim()
        if (motivo) desligadas.push({ regra: regra.id, arquivo: m.arquivo, motivo })
        else {
          problemas.push(
            problema(
              'REGRA_DESLIGADA_SEM_MOTIVO',
              m.arquivo,
              `a regra "${regra.nome}" foi desligada neste arquivo sem dizer por quê`,
              `escreva o motivo: auditor-desligar ${regra.id}: <motivo>`
            )
          )
        }
        continue
      }

      if (regra.tipo === 'intocavel') {
        if (m.estado === 'A') continue
        if (regra.salvoSeMudar && mudados.some((a) => casa(regra.salvoSeMudar, a))) continue
        problemas.push(
          problema('REGRA_VIOLADA', m.arquivo, `${regra.nome} (regra ${regra.id}; vem de: ${regra.origem})`, regra.oQueFazer)
        )
        continue
      }

      if (m.estado === 'D') continue
      if (regra.somenteSe && !new RegExp(regra.somenteSe, 'm').test(texto)) continue
      const padrao = new RegExp(regra.padrao)
      texto.split('\n').forEach((linha, i) => {
        if (m.linhas && !m.linhas.has(i + 1)) return
        if (!padrao.test(linha)) return
        problemas.push(
          problema(
            'REGRA_VIOLADA',
            m.arquivo,
            `linha ${i + 1}: ${regra.nome} (regra ${regra.id}; vem de: ${regra.origem})\n${linha.trim().slice(0, 160)}`,
            regra.oQueFazer
          )
        )
      })
    }
  }
  return { problemas, desligadas }
}

// Roda todas as regras no projeto inteiro, para ver o que cada uma acha hoje
// e avisar a que não confere nenhum arquivo.
export function conferirProjetoInteiro(raiz, regras) {
  const lista = git(raiz, ['ls-files'])
  const arquivos = (lista || '').split('\n').filter(Boolean)
  return regras.map((regra) => {
    const alvos = arquivos.filter((a) => casa(regra.arquivos, a) && !casa(regra.excluir, a))
    const mudancas = alvos.map((arquivo) => ({ arquivo, estado: 'A', linhas: null }))
    const { problemas, desligadas } =
      regra.tipo === 'intocavel' ? { problemas: [], desligadas: [] } : conferirRegras({ raiz, regras: [regra], mudancas })
    return { regra, arquivos: alvos.length, problemas, desligadas }
  })
}

function conferirEscopo({ issue, rel, cfg, mudancas, problemas }) {
  for (const item of issue.checklistAbertos) {
    problemas.push(problema('CHECKLIST_INCOMPLETO', rel, item, 'conclua o item e marque [x]'))
  }
  if (issue.arquivos === null) return
  // Configuração de teste fora da issue é acusada à parte (conferirTrapaca), com o
  // nome próprio; aqui ela só sai da conta, para não sair duas vezes.
  const mexidos = (mudancas || []).filter(
    (m) =>
      m.arquivo !== rel &&
      !(eConfigDeTeste(m.arquivo, cfg) && !issue.arquivos.includes(m.arquivo)) &&
      !casa(cfg.foraDoEscopo, m.arquivo)
  )
  if (mexidos.length === 0) {
    problemas.push(
      problema(
        'ESCOPO_NAO_CONFERIDO',
        rel,
        'nada mudou desde o último commit; não dá para comparar com a seção Arquivos',
        'rode o auditor antes de commitar para conferir o escopo',
        false
      )
    )
    return
  }
  for (const m of mexidos) {
    if (issue.arquivos.includes(m.arquivo)) continue
    problemas.push(
      problema(
        'ARQUIVO_FORA_DA_ISSUE',
        m.arquivo,
        'foi mexido e não está na seção Arquivos da issue',
        'desfaça a mudança, ou pare e pergunte antes de incluir o arquivo na issue'
      )
    )
  }
  for (const declarado of issue.arquivos) {
    if (mexidos.some((m) => m.arquivo === declarado)) continue
    problemas.push(
      problema(
        'ARQUIVO_NAO_TOCADO',
        declarado,
        'está na seção Arquivos e não foi mexido',
        'implemente o que falta ou tire o arquivo da issue'
      )
    )
  }
}

// Seções da issue guardadas no `antes`. Critérios e Arquivos não mudam depois dele;
// Suposições, Perguntas e Exceções podem mudar (quem aprova confirma e excepciona), mas
// a mudança aparece no relatório para a pessoa conferir.
const SECOES_TRAVADAS = ['Critérios de aceite', 'Arquivos']
const SECOES_AVISADAS = ['Suposições', 'Perguntas em aberto', 'Exceções']

export function secoesDaIssue(texto) {
  const limpo = semBlocosDeCodigo(texto.replace(/\r\n/g, '\n'))
  return Object.fromEntries(
    [...SECOES_TRAVADAS, ...SECOES_AVISADAS].map((t) => {
      const sec = secao(limpo, t)
      return [t, sec === null ? null : resumo(sec.split('\n').map((l) => l.trim()).filter(Boolean).join('\n'))]
    })
  )
}

// A issue mudou depois do `antes`? Devolve os problemas (travam só Critérios e Arquivos).
function conferirIssueDoAntes(antes, texto, id) {
  if (!antes || !antes.secoes) return []
  const agora = secoesDaIssue(texto)
  const problemas = []
  for (const titulo of [...SECOES_TRAVADAS, ...SECOES_AVISADAS]) {
    if (antes.secoes[titulo] === agora[titulo]) continue
    const trava = SECOES_TRAVADAS.includes(titulo)
    problemas.push(
      problema(
        'ISSUE_ALTERADA',
        `${id} › ${titulo}`,
        `a seção ${titulo} da issue mudou depois do registro antes (${antes.dia})`,
        trava
          ? 'desfaça a mudança na issue; mudar critério ou arquivo depois do antes é decisão de quem aprova, com um novo antes'
          : 'confira com quem aprova se foi ela quem fez essa mudança',
        trava
      )
    )
  }
  return problemas
}

// Testes de uma impressão que sumiram ou mudaram na outra. Um teste é achado pelo
// caminho (describes e nome); se o caminho mudou mas o nome é único dos dois lados,
// pelo nome (envolver testes num describe não é alterá-los).
function testesMudados(base, agora) {
  const mudados = []
  for (const [arquivo, antigo] of Object.entries(base || {})) {
    const atual = agora[arquivo] || { testes: [], preparacao: [] }
    const porChave = new Map(atual.testes.map((t) => [t.chave, t]))
    const contar = (lista, nome) => lista.filter((t) => t.nome === nome).length
    for (const t of antigo.testes) {
      let par = porChave.get(t.chave)
      if (!par && contar(antigo.testes, t.nome) === 1 && contar(atual.testes, t.nome) === 1) {
        par = atual.testes.find((x) => x.nome === t.nome)
      }
      if (!par) mudados.push({ alvo: `${arquivo} › ${t.chave}`, nome: t.nome, como: 'foi apagado ou renomeado' })
      else if (par.resumo !== t.resumo) mudados.push({ alvo: `${arquivo} › ${t.chave}`, nome: t.nome, como: 'foi alterado' })
    }
    // Preparação: linha que sumiu (acrescentar não conta).
    const sobra = new Map()
    for (const l of atual.preparacao) sobra.set(l, (sobra.get(l) || 0) + 1)
    const perdidas = antigo.preparacao.filter((l) => {
      const n = sobra.get(l) || 0
      if (n > 0) sobra.set(l, n - 1)
      return n === 0
    })
    if (perdidas.length && agora[arquivo]) {
      mudados.push({ alvo: `${arquivo} › (preparação)`, nome: 'preparação', como: `perdeu ou mudou linhas (ex.: "${perdidas[0].slice(0, 60)}")` })
    }
  }
  return mudados
}

// Formas conhecidas de trapaça: teste antigo alterado ou apagado, testes a menos,
// teste novo pulado ou isolado, configuração de teste mexida, issue mexida e teste que
// nunca falhou. A base é o commit registrado no `antes` (ou o último, sem `antes`).
function conferirTrapaca({ raiz, cfg, issue, caminho, problemas }) {
  const id = idDaIssue(caminho)
  const estado = lerRegistro(raiz).issues[id] || null
  const antes = estado && estado.antes ? estado.antes : null
  const base = (antes && antes.base) || 'HEAD'
  const daBaseTexto = base === 'HEAD' ? 'do último commit' : 'do commit de base do antes'
  const naBaseTexto = base === 'HEAD' ? 'no último commit' : 'no commit de base do antes'
  const agora = impressaoDosTestes(raiz, cfg)
  const daBase = impressaoDoCommit(raiz, cfg, base)
  const mudancas = mudancasDoGit(raiz, base)

  problemas.push(...conferirIssueDoAntes(antes, ler(caminho), id))

  const acusados = new Set()
  const acusar = (lista, quando) => {
    for (const m of lista) {
      if (acusados.has(m.alvo)) continue
      acusados.add(m.alvo)
      problemas.push(
        problema(
          'TESTE_ALTERADO',
          m.alvo,
          `o teste "${m.nome}" ${m.como} depois ${quando}`,
          'desfaça a mudança no teste; mudar teste existente só com exceção escrita na issue'
        )
      )
    }
  }
  if (daBase) acusar(testesMudados(daBase, agora), daBaseTexto)
  if (antes && antes.testes) acusar(testesMudados(antes.testes, agora), `do registro antes (${antes.dia})`)

  if (daBase) {
    const havia = contarTestes(daBase)
    const ha = contarTestes(agora)
    if (ha < havia) {
      problemas.push(
        problema(
          'TESTES_A_MENOS',
          'número de testes',
          `havia ${havia} testes ${naBaseTexto}; agora há ${ha}`,
          'devolva os testes apagados; apagar teste só com exceção escrita na issue'
        )
      )
    }
  }

  for (const m of mudancas || []) {
    if (m.estado === 'D' || !eArquivoDeTeste(m.arquivo, cfg)) continue
    const arquivo = path.join(raiz, m.arquivo)
    if (!fs.existsSync(arquivo)) continue
    for (const t of lerTestes(ler(arquivo)).marcacoes) {
      if (m.linhas && !m.linhas.has(t.linha)) continue
      problemas.push(
        problema(
          'TESTE_MARCADO',
          `${m.arquivo} › ${t.nome}`,
          `marcado com ${t.marcacao} (linha ${t.linha})`,
          'tire a marcação: teste pulado não prova nada, e teste isolado esconde os outros'
        )
      )
    }
  }

  const listados = issue.arquivos || []
  for (const m of mudancas || []) {
    if (!eConfigDeTeste(m.arquivo, cfg) || listados.includes(m.arquivo)) continue
    problemas.push(
      problema(
        'CONFIG_DE_TESTE_ALTERADA',
        m.arquivo,
        'configuração do executor de testes, do CI ou do auditor mexida sem estar na seção Arquivos da issue',
        'desfaça a mudança; mexer nessa configuração é decisão de quem aprova, escrita na issue'
      )
    )
  }

  // Sem registro `antes` da issue, não há o que comparar (projeto que ainda não usa o
  // comando); a esteira é quem garante o `antes`.
  if (antes) {
    for (const c of issue.criterios.filter((x) => x.prova === 'automatica')) {
      const antesDele = antes.criterios[c.codigo]
      if (antesDele === 'passou') {
        problemas.push(
          problema(
            'TESTE_NUNCA_FALHOU',
            c.codigo,
            `o teste já passava antes da implementação (registro de ${antes.dia}): ele não prova o critério`,
            'reescreva o teste para conferir o "Então" do critério, que o código antigo não cumpria'
          )
        )
      } else if (antesDele !== 'falhou') {
        problemas.push(
          problema(
            'FALHA_ANTES_NAO_REGISTRADA',
            c.codigo,
            `no registro antes, o critério estava como "${antesDele || 'ausente'}"; não há prova de que o teste falhava`,
            `depois de escrever os testes e antes do código, rode: antes ${id}`,
            false
          )
        )
      }
    }
  }
  if (estado && estado.precisaDecisao) {
    problemas.push(
      problema(
        'DECISAO_HUMANA',
        id,
        `o portão reprovou a issue ${estado.tentativas} vezes, o limite`,
        'apresente o que falta à pessoa e espere a decisão dela',
        false
      )
    )
  }
}

// Configuração de testes, do CI e do auditor. A lista padrão vale sempre (o projeto
// acrescenta, não tira) e a do auditor nunca é configurável: mudar a configuração do
// auditor poderia tirá-la da conferência ou esconder o resto.
export function eConfigDeTeste(arquivo, cfg) {
  return CONFIG_DO_AUDITOR.includes(arquivo) || casa(CONFIG_PADRAO.configDeTeste, arquivo) || casa(cfg.configDeTeste, arquivo)
}

// ---------------------------------------------------------------- auditoria

function problema(codigo, alvo, detalhe, oQueFazer, trava = true) {
  return { codigo, nome: NOMES[codigo], alvo, detalhe, oQueFazer, trava }
}

function registrosAbertos(dono, problemas) {
  for (const s of dono.suposicoes) {
    if (!['confirmada', 'invalidada'].includes(s.status)) {
      problemas.push(
        problema('SUPOSICAO_ABERTA', s.id, s.texto, 'confirme ou invalide com quem decide e atualize o status')
      )
    }
  }
  for (const p of dono.perguntas) {
    if (p.status !== 'respondida') {
      problemas.push(problema('PERGUNTA_ABERTA', p.id, p.texto, 'pergunte a quem decide e grave a resposta'))
    }
  }
}

function secoesAusentes(dono, onde, problemas) {
  if (!dono.temSuposicoes) {
    problemas.push(
      problema('SECAO_AUSENTE', onde, 'falta a seção Suposições', 'acrescente a seção; sem nenhuma, escreva "Nenhuma."')
    )
  }
  if (!dono.temPerguntas) {
    problemas.push(
      problema(
        'SECAO_AUSENTE',
        onde,
        'falta a seção Perguntas em aberto',
        'acrescente a seção; sem nenhuma, escreva "Nenhuma."'
      )
    )
  }
}

function validarExcecao(e, cfg) {
  if (!NOMES[e.problema]) return `"${e.problema}" não é um código de problema do auditor`
  if (vazio(e.alvo)) return 'falta o alvo (código do critério, da suposição ou o arquivo)'
  if (vazio(e.motivo)) return 'falta o motivo'
  if (vazio(e.por)) return 'falta quem aprovou'
  if (cfg.aprovadores.length && !cfg.aprovadores.some((a) => semAcento(a) === semAcento(e.por))) {
    return `"${e.por}" não pode aprovar exceção (só ${cfg.aprovadores.join(' ou ')})`
  }
  if (!RE_DIA.test(e.dia || '')) return 'falta o dia, no formato dd/mm/aaaa'
  return null
}

// Audita uma issue. `resultados` é o mapa código → [status] dos testes já
// rodados, ou null quando os testes não foram rodados.
// `mudancas` é o que mudou desde o último commit (veja mudancasDoGit); sem ele,
// escopo e regras não são conferidos.
export function auditarIssue({ raiz, cfg, caminho, testes, resultados, erroDosTestes, mudancas, regras = [] }) {
  const issue = lerIssue(caminho)
  const rel = path.relative(raiz, caminho).split(path.sep).join('/')
  const base = { issue: rel, titulo: issue.titulo, problemas: [], excecoes: [], manuaisPendentes: [], regrasDesligadas: [] }

  if (issue.formatoAntigo) {
    base.problemas.push(
      problema(
        'FORMATO_ANTIGO',
        rel,
        'a issue não tem a seção Critérios de aceite; a prova mecânica não se aplica',
        'revise do jeito antigo',
        false
      )
    )
    // Issue que tinha critérios no `antes` e perdeu a seção: não vira "formato antigo".
    const estado = mudancas !== undefined ? lerRegistro(raiz).issues[idDaIssue(caminho)] : null
    const mexida = conferirIssueDoAntes(estado && estado.antes, issue.texto, idDaIssue(caminho)).filter((p) => p.trava)
    if (mexida.length) {
      base.problemas.push(...mexida)
      return { ...base, ...veredito(base.problemas, [], false) }
    }
    return { ...base, veredito: 'formato antigo', saida: SAIDA.ALINHADA }
  }

  const problemas = base.problemas
  secoesAusentes(issue, rel, problemas)
  registrosAbertos(issue, problemas)

  // A avulsa só dispensa a spec quando a série não tem spec: declarar "Avulsa" numa
  // série que tem spec não tira os critérios da conferência com ela.
  const spec = issue.serie ? acharSpec(raiz, cfg, issue.serie) : null
  const naSpec = new Set(spec ? spec.criterios.map((c) => c.codigo) : [])
  if (!spec && !issue.avulsa) {
    problemas.push(
      problema(
        'SPEC_NAO_ENCONTRADA',
        issue.serie || rel,
        'nenhuma spec com esta série foi encontrada, em andamento ou arquivada',
        'confira a linha "> série:" no topo da spec'
      )
    )
  }

  let naoRodado = false
  for (const c of issue.criterios) {
    if (spec && !naSpec.has(c.codigo)) {
      problemas.push(
        problema(
          'CRITERIO_FORA_DA_SPEC',
          c.codigo,
          'o critério está na issue e não está na spec',
          'acrescente-o à spec ou tire-o da issue'
        )
      )
    }
    if (c.prova === 'manual') {
      const conf = issue.manuais.find((m) => m.codigo === c.codigo && !vazio(m.por) && RE_DIA.test(m.dia || ''))
      if (!conf) {
        problemas.push(
          problema(
            'TESTE_MANUAL_PENDENTE',
            c.codigo,
            c.texto,
            `faça o teste e registre com: confirmar ${path.basename(caminho).split('-').slice(0, 2).join('-')} ${c.codigo} --por <nome>`,
            false
          )
        )
        base.manuaisPendentes.push({ codigo: c.codigo, texto: c.texto, roteiro: issue.roteiros[c.codigo] || null })
      }
      continue
    }
    const marcados = testes.get(c.codigo) || []
    if (marcados.length === 0) {
      problemas.push(
        problema(
          'CRITERIO_SEM_TESTE',
          c.codigo,
          c.texto,
          `escreva um teste com "${c.codigo}" no nome do it/test`
        )
      )
      continue
    }
    const onde = marcados.map((t) => `${t.arquivo}:${t.linha}`).join(', ')
    if (marcados.some((t) => t.pulado)) {
      problemas.push(
        problema('CRITERIO_SEM_PROVA', c.codigo, `teste pulado em ${onde}`, 'teste pulado não é prova: tire o skip/todo')
      )
      continue
    }
    if (resultados === null) {
      naoRodado = true
      continue
    }
    const status = resultados.get(c.codigo) || []
    if (status.length === 0 || status.some((s) => s !== 'passed')) {
      const motivo = status.length === 0 ? 'o teste não rodou' : `resultado: ${[...new Set(status)].join(', ')}`
      problemas.push(
        problema('CRITERIO_SEM_PROVA', c.codigo, `${motivo} (${onde})`, 'faça o teste passar; não enfraqueça o teste')
      )
    }
  }

  // Teste com código desta série que não existe na spec.
  if (spec) {
    for (const [codigo, marcados] of testes) {
      if (serieDoCodigo(codigo) !== issue.serie || naSpec.has(codigo)) continue
      const onde = marcados.map((t) => `${t.arquivo}:${t.linha}`).join(', ')
      problemas.push(
        problema(
          'TESTE_ORFAO',
          codigo,
          `teste aponta para um critério que não existe na spec (${onde})`,
          'a spec mudou: atualize o código do teste ou remova o teste'
        )
      )
    }
  }

  if (erroDosTestes) {
    problemas.push(
      problema('CRITERIO_SEM_PROVA', rel, `o comando de teste falhou antes de dar resultado:\n${erroDosTestes}`, 'corrija a execução dos testes')
    )
  }
  if (naoRodado) {
    problemas.push(
      problema('PROVA_NAO_CONFERIDA', rel, 'os testes não foram rodados (--sem-rodar)', 'rode sem --sem-rodar', false)
    )
  }

  if (mudancas !== undefined) {
    conferirEscopo({ issue, rel, cfg, mudancas, problemas })
    const mexidos = (mudancas || []).filter((m) => !casa(cfg.foraDoEscopo, m.arquivo))
    const conferidas = conferirRegras({ raiz, regras, mudancas: mexidos })
    problemas.push(...conferidas.problemas)
    base.regrasDesligadas = conferidas.desligadas
    conferirTrapaca({ raiz, cfg, issue, caminho, problemas })
  }

  // Exceções: inválida trava; válida tira o problema correspondente da conta.
  for (const e of issue.excecoes) {
    const erro = validarExcecao(e, cfg)
    if (erro) {
      problemas.push(problema('EXCECAO_INVALIDA', e.alvo || rel, erro, 'complete a linha da exceção ou remova-a'))
      continue
    }
    // Uma exceção cobre todas as ocorrências do problema naquele alvo.
    let usada = false
    for (let i = problemas.length - 1; i >= 0; i--) {
      if (problemas[i].codigo !== e.problema || problemas[i].alvo !== e.alvo) continue
      problemas.splice(i, 1)
      usada = true
    }
    if (usada && e.problema === 'TESTE_MANUAL_PENDENTE') {
      base.manuaisPendentes = base.manuaisPendentes.filter((m) => m.codigo !== e.alvo)
    }
    base.excecoes.push({ ...e, usada })
  }

  return { ...base, ...veredito(problemas, base.manuaisPendentes, naoRodado) }
}

function veredito(problemas, manuaisPendentes, naoRodado) {
  if (problemas.some((p) => p.trava)) return { veredito: 'não alinhada', saida: SAIDA.NAO_ALINHADA }
  if (naoRodado) return { veredito: 'estrutura conferida, testes não rodados', saida: SAIDA.NAO_RODADO }
  if (manuaisPendentes.length) {
    return { veredito: 'alinhada com teste manual pendente', saida: SAIDA.MANUAL_PENDENTE }
  }
  return { veredito: 'alinhada', saida: SAIDA.ALINHADA }
}

function arquivosDosCodigos(raiz, testes, codigos) {
  const arquivos = new Set()
  for (const codigo of codigos) {
    for (const t of testes.get(codigo) || []) arquivos.add(path.join(raiz, t.arquivo))
  }
  return [...arquivos]
}

export function executarIssue(raiz, cfg, caminho, { semRodar = false } = {}) {
  const issue = lerIssue(caminho)
  const testes = codigosNosTestes(raiz, cfg)
  const automaticos = issue.criterios.filter((c) => c.prova === 'automatica').map((c) => c.codigo)
  const execucao = semRodar
    ? { resultados: null }
    : rodarTestes(raiz, cfg, arquivosDosCodigos(raiz, testes, automaticos).map((a) => path.relative(raiz, a)))
  return auditarIssue({
    raiz,
    cfg,
    caminho,
    testes,
    resultados: execucao.resultados,
    erroDosTestes: execucao.erro,
    mudancas: mudancasDoGit(raiz),
    regras: carregarRegras(raiz),
  })
}

export function executarSerie(raiz, cfg, serie, { semRodar = false } = {}) {
  serie = serie.toUpperCase()
  const caminhos = listarIssues(raiz, cfg, { comConcluidas: true }).filter((a) => serieDaIssue(a) === serie)
  const testes = codigosNosTestes(raiz, cfg)
  const issues = caminhos.map(lerIssue)
  const automaticos = issues.flatMap((i) => i.criterios.filter((c) => c.prova === 'automatica').map((c) => c.codigo))
  const execucao = semRodar
    ? { resultados: null }
    : rodarTestes(raiz, cfg, arquivosDosCodigos(raiz, testes, automaticos).map((a) => path.relative(raiz, a)))

  const relatorios = caminhos.map((caminho) =>
    auditarIssue({ raiz, cfg, caminho, testes, resultados: execucao.resultados, erroDosTestes: execucao.erro })
  )

  const problemas = []
  const spec = acharSpec(raiz, cfg, serie)
  // Série inteira no formato antigo: a spec não tem a linha da série, e tudo bem.
  const serieAntiga = !spec && issues.length > 0 && issues.every((i) => i.formatoAntigo)
  if (serieAntiga) {
    return { serie, problemas, issues: relatorios, veredito: 'formato antigo', saida: SAIDA.ALINHADA }
  }
  // Série só de issues avulsas não tem spec, e tudo bem.
  const serieAvulsa = issues.length > 0 && issues.every((i) => i.avulsa)
  if (!spec) {
    if (!serieAvulsa) {
      problemas.push(
        problema('SPEC_NAO_ENCONTRADA', serie, 'nenhuma spec com esta série foi encontrada', 'confira a linha "> série:" da spec')
      )
    }
  } else {
    const relSpec = path.relative(raiz, spec.caminho).split(path.sep).join('/')
    secoesAusentes(spec, relSpec, problemas)
    registrosAbertos(spec, problemas)
    for (const c of spec.criterios) {
      const donas = issues.filter((i) => i.criterios.some((x) => x.codigo === c.codigo))
      if (donas.length === 0) {
        problemas.push(
          problema('CRITERIO_FORA_DE_ISSUE', c.codigo, 'nenhuma issue entrega este critério', 'inclua-o em uma issue')
        )
      } else if (donas.length > 1) {
        problemas.push(
          problema(
            'CRITERIO_EM_DUAS_ISSUES',
            c.codigo,
            `aparece em ${donas.map((d) => path.basename(d.caminho)).join(' e ')}`,
            'cada critério é entregue por uma única issue'
          )
        )
      }
    }
  }

  const todos = problemas.concat(relatorios.flatMap((r) => r.problemas))
  const pendentes = relatorios.flatMap((r) => r.manuaisPendentes)
  const naoRodado = relatorios.some((r) => r.saida === SAIDA.NAO_RODADO)
  return { serie, problemas, issues: relatorios, ...veredito(todos, pendentes, naoRodado) }
}

// Suposições e perguntas abertas das specs em andamento e das issues abertas.
export function listarAbertas(raiz, cfg) {
  const fontes = listarSpecs(path.join(raiz, cfg.pastaSpecs))
    .map(lerSpec)
    .concat(listarIssues(raiz, cfg).map(lerIssue))
  const vistos = new Set()
  const abertas = []
  for (const fonte of fontes) {
    const problemas = []
    registrosAbertos(fonte, problemas)
    for (const p of problemas) {
      if (vistos.has(p.alvo)) continue
      vistos.add(p.alvo)
      abertas.push({ ...p, onde: path.relative(raiz, fonte.caminho).split(path.sep).join('/') })
    }
  }
  return abertas
}

function hoje() {
  const d = new Date()
  const dois = (n) => String(n).padStart(2, '0')
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`
}

// Grava a confirmação de um teste manual na issue. Devolve mensagem de erro ou null.
export function confirmarManual(caminho, codigo, por, dia = hoje()) {
  const issue = lerIssue(caminho)
  const criterio = issue.criterios.find((c) => c.codigo === codigo)
  if (!criterio) return `${codigo} não é um critério desta issue`
  if (criterio.prova !== 'manual') return `${codigo} é de prova automática; quem prova é o teste`
  if (vazio(por)) return 'diga quem conferiu: --por <nome>'
  if (!RE_DIA.test(dia)) return 'o dia deve estar no formato dd/mm/aaaa'
  if (issue.manuais.some((m) => m.codigo === codigo)) return `${codigo} já está confirmado nesta issue`

  const linha = `| ${codigo} | ${por} | ${dia} |`
  let texto = issue.texto.replace(/\n+$/, '')
  if (secao(texto, 'Testes manuais') === null) {
    texto += `\n\n## Testes manuais\n\n| Critério | Conferido por | Dia |\n|---|---|---|\n${linha}`
  } else {
    const linhas = texto.split('\n')
    const inicio = linhas.findIndex((l) => /^##\s+Testes manuais\s*$/.test(l))
    let fim = inicio + 1
    for (let i = inicio + 1; i < linhas.length && !/^##\s+/.test(linhas[i]); i++) {
      if (linhas[i].trim().startsWith('|')) fim = i + 1
    }
    linhas.splice(fim, 0, linha)
    texto = linhas.join('\n')
  }
  fs.writeFileSync(caminho, `${texto}\n`)
  return null
}

// ------------------------------------------------------------------- lições

const MAX_LICOES_POR_ISSUE = 2
const MAX_LICOES_LIDAS = 10
// Falhas que o auditor não registra sozinho; pedem a evidência por escrito.
const FALHAS_SEM_SINAL = ['revisildo', 'teste-manual']

export function idDaIssue(caminhoOuId) {
  const m = /^([A-Za-z]+\d+-\d+)/.exec(path.basename(caminhoOuId))
  return m ? m[1].toUpperCase() : null
}

// Dentro da pasta do git, onde nunca é versionado nem aparece como arquivo
// mexido. Fora de um repositório, cai em `.claude/`.
function arquivoDeSinais(raiz) {
  const pastaDoGit = (git(raiz, ['rev-parse', '--git-dir']) || '').trim()
  return pastaDoGit
    ? path.resolve(raiz, pastaDoGit, 'auditor-sinais.json')
    : path.join(raiz, '.claude', 'auditor-sinais.json')
}

export function lerSinais(raiz) {
  const arquivo = arquivoDeSinais(raiz)
  return fs.existsSync(arquivo) ? JSON.parse(ler(arquivo)) : []
}

// Guarda os problemas que travaram uma issue. É o lastro das lições: só vira
// lição o que o auditor de fato acusou. Fica fora do versionamento.
export function registrarSinais(raiz, relatorio) {
  const issue = idDaIssue(relatorio.issue)
  const travas = relatorio.problemas.filter((p) => p.trava)
  if (!issue || travas.length === 0) return
  const sinais = lerSinais(raiz)
  for (const p of travas) {
    if (sinais.some((s) => s.issue === issue && s.codigo === p.codigo && s.alvo === p.alvo)) continue
    sinais.push({ issue, codigo: p.codigo, alvo: p.alvo, dia: hoje() })
  }
  fs.mkdirSync(path.dirname(arquivoDeSinais(raiz)), { recursive: true })
  fs.writeFileSync(arquivoDeSinais(raiz), `${JSON.stringify(sinais, null, 2)}\n`)
}

// Último veredito (de uma issue ou de uma série), ao lado dos sinais: fora do
// versionamento. O gancho de início de sessão mostra esse veredito.
function arquivoDoUltimoVeredito(raiz) {
  return path.join(path.dirname(arquivoDeSinais(raiz)), 'auditor-ultimo.json')
}

// Só informativo: se não der para gravar, o veredito do comando não muda.
export function registrarUltimoVeredito(raiz, alvo, veredito, dia = hoje()) {
  try {
    const arquivo = arquivoDoUltimoVeredito(raiz)
    fs.mkdirSync(path.dirname(arquivo), { recursive: true })
    fs.writeFileSync(arquivo, `${JSON.stringify({ alvo, veredito, dia }, null, 2)}\n`)
  } catch {}
}

// null se não há registro ou se ele está ilegível.
export function lerUltimoVeredito(raiz) {
  try {
    return JSON.parse(ler(arquivoDoUltimoVeredito(raiz)))
  } catch {
    return null
  }
}

// Registro do auditor: estado dos critérios no `antes`, impressão dos testes e da
// issue, commit de base, tentativas no portão e issue ativa. Só o auditor escreve;
// fica fora do versionamento, ao lado dos sinais.
export function arquivoDoRegistro(raiz) {
  return path.join(path.dirname(arquivoDeSinais(raiz)), 'auditor-registro.json')
}

export function lerRegistro(raiz) {
  try {
    const reg = JSON.parse(ler(arquivoDoRegistro(raiz)))
    return { ativa: reg.ativa || null, issues: reg.issues || {} }
  } catch {
    return { ativa: null, issues: {} }
  }
}

function gravarJson(arquivo, dados) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true })
  fs.writeFileSync(arquivo, `${JSON.stringify(dados, null, 2)}\n`)
}

// Momento "testes escritos, código ainda não feito": roda os testes dos critérios
// automáticos e guarda o resultado de cada um, a impressão dos testes e da issue e o
// commit de base. Marca a issue como ativa e recomeça a contagem de tentativas.
// Devolve { erro } se a issue não tem identificador.
export function registrarAntes(raiz, cfg, caminho) {
  const id = idDaIssue(caminho)
  if (!id) return { erro: `o nome do arquivo da issue não começa pelo identificador (ex.: S1-01-...): ${path.basename(caminho)}` }
  const issue = lerIssue(caminho)
  const testes = codigosNosTestes(raiz, cfg)
  const automaticos = issue.criterios.filter((c) => c.prova === 'automatica').map((c) => c.codigo)
  const execucao = rodarTestes(raiz, cfg, arquivosDosCodigos(raiz, testes, automaticos).map((a) => path.relative(raiz, a)))
  const criterios = {}
  for (const codigo of automaticos) {
    const status = execucao.resultados.get(codigo) || []
    if (!testes.has(codigo)) criterios[codigo] = 'sem teste'
    else if (execucao.erro) criterios[codigo] = 'não rodou'
    else criterios[codigo] = status.length > 0 && status.every((s) => s === 'passed') ? 'passou' : 'falhou'
  }
  const registro = lerRegistro(raiz)
  registro.ativa = id
  registro.issues[id] = {
    antes: {
      dia: hoje(),
      base: (git(raiz, ['rev-parse', 'HEAD']) || '').trim() || null,
      criterios,
      testes: impressaoDosTestes(raiz, cfg),
      secoes: secoesDaIssue(issue.texto),
    },
    tentativas: 0,
    precisaDecisao: false,
  }
  gravarJson(arquivoDoRegistro(raiz), registro)
  const pendentes = (estado) => automaticos.filter((c) => criterios[c] === estado)
  const rel = {
    issue: id,
    criterios,
    erroDosTestes: execucao.erro || null,
    passaram: pendentes('passou'),
    semTeste: pendentes('sem teste'),
    naoRodaram: pendentes('não rodou'),
  }
  rel.saida = rel.passaram.length || rel.semTeste.length || rel.naoRodaram.length ? SAIDA.NAO_ALINHADA : SAIDA.ALINHADA
  return rel
}

// Começo do trabalho numa issue: ela vira a ativa do portão, com a contagem zerada e
// sem registro `antes` (quem o faz é o portão do escritor de testes).
export function iniciarIssue(raiz, caminho) {
  const id = idDaIssue(caminho)
  if (!id) return { erro: `o nome do arquivo da issue não começa pelo identificador (ex.: S1-01-...): ${path.basename(caminho)}` }
  const registro = lerRegistro(raiz)
  registro.ativa = id
  registro.issues[id] = { tentativas: 0, precisaDecisao: false }
  gravarJson(arquivoDoRegistro(raiz), registro)
  return { issue: id }
}

// Fim do escritor de testes: roda o `antes`; passa se há teste para cada critério
// automático e todos falham.
function travasDoEscritor(raiz, cfg, caminho) {
  const rel = registrarAntes(raiz, cfg, caminho)
  if (rel.erro) return [problema('PORTAO_SEM_CONFERENCIA', path.basename(caminho), rel.erro, 'renomeie a issue com o identificador na frente')]
  return [
    ...rel.semTeste.map((c) => problema('CRITERIO_SEM_TESTE', c, 'o critério automático não tem teste', `escreva um teste com "${c}" no nome do it/test`)),
    ...rel.passaram.map((c) =>
      problema('TESTE_NUNCA_FALHOU', c, 'o teste já passa sem o código: ele não prova o critério', 'reescreva o teste para conferir o "Então" do critério')
    ),
    ...rel.naoRodaram.map((c) =>
      problema('PORTAO_SEM_CONFERENCIA', c, `o comando de teste não rodou:\n${rel.erroDosTestes || ''}`, 'corrija a execução dos testes')
    ),
  ]
}

// Decisão do portão sobre o fim do executor ou do escritor de testes: { libera,
// mensagem }. Sem issue ativa, libera. Se não der para conferir (configuração
// ilegível, issue sumida), conta como reprovação: o portão não libera por falha de
// conferência. Só libera sem conferir se nem o contador der para gravar, para nunca
// prender o agente para sempre.
export function conferirNoPortao(raiz, papel = 'executor') {
  const registro = lerRegistro(raiz)
  const id = registro.ativa
  if (!id) return { libera: true }
  const estado = registro.issues[id] || { tentativas: 0, precisaDecisao: false }
  if (estado.precisaDecisao) {
    return { libera: true, mensagem: `Portão anti-vibe: a issue ${id} já atingiu o limite de tentativas e precisa de decisão humana.` }
  }
  let limite = CONFIG_PADRAO.limiteDeTentativas
  let travas
  try {
    const cfg = carregarConfig(raiz)
    limite = cfg.limiteDeTentativas || limite
    const caminho = acharIssue(raiz, cfg, id)
    if (!caminho) {
      travas = [problema('PORTAO_SEM_CONFERENCIA', id, `a issue ativa não foi encontrada em ${cfg.pastaIssues}`, 'devolva o arquivo da issue ao lugar')]
    } else if (papel === 'escritor') {
      travas = travasDoEscritor(raiz, cfg, caminho)
    } else if (!estado.antes && lerIssue(caminho).criterios.some((c) => c.prova === 'automatica')) {
      // Sem critério automático (só manual, protótipo, formato antigo) não há teste a
      // registrar falhando.
      travas = [
        problema(
          'FALHA_ANTES_NAO_REGISTRADA',
          id,
          'os testes não foram registrados falhando antes da implementação',
          `os testes vêm do escritor de testes, cujo portão roda o antes; à mão: antes ${id}`
        ),
      ]
    } else {
      const rel = executarIssue(raiz, cfg, caminho)
      registrarSinais(raiz, rel)
      registrarUltimoVeredito(raiz, id, rel.veredito)
      travas = rel.problemas.filter((p) => p.trava)
    }
  } catch (erro) {
    travas = [problema('PORTAO_SEM_CONFERENCIA', id, `o auditor não conseguiu conferir: ${erro.message}`, 'desfaça o que quebrou a conferência')]
  }
  if (travas.length === 0) return { libera: true }

  // O `antes` do escritor regrava o estado da issue: a contagem parte da de antes dele.
  const atual = lerRegistro(raiz)
  const novo = { ...(atual.issues[id] || estado), tentativas: (estado.tentativas || 0) + 1 }
  novo.precisaDecisao = novo.tentativas >= limite
  atual.ativa = id
  atual.issues[id] = novo
  try {
    gravarJson(arquivoDoRegistro(raiz), atual)
  } catch (erro) {
    return { libera: true, mensagem: `Portão anti-vibe: não deu para gravar o contador de tentativas (${erro.message}); confira a issue ${id} à mão.` }
  }
  const lista = travas.map((p) => `- ${p.nome} (${p.codigo}) — ${p.alvo}: ${p.detalhe}\n  o que fazer: ${p.oQueFazer}`).join('\n')
  if (novo.precisaDecisao) {
    return {
      libera: true,
      mensagem:
        `Portão anti-vibe: a issue ${id} foi reprovada ${novo.tentativas} vezes, o limite. ` +
        `Pare: ela precisa de decisão humana. Apresente à pessoa o que falta, do mais grave ao menos grave:\n${lista}`,
    }
  }
  const oQue = papel === 'escritor' ? 'os testes da issue ainda não estão prontos' : 'a issue ainda não está alinhada'
  const como = papel === 'escritor' ? 'sem escrever código que não seja de teste' : 'sem mexer em teste nem na issue'
  return {
    libera: false,
    mensagem:
      `Portão anti-vibe: ${oQue} (${id}, tentativa ${novo.tentativas} de ${limite}). ` +
      `Não encerre: corrija o que falta, ${como}, e tente de novo.\n${lista}`,
  }
}

// ---------------------------------------------------------------- esteira

// O que a esteira precisa saber das issues de uma série (ou de uma issue), inclusive
// as concluídas: em ordem numérica, com o risco, os critérios automáticos, os arquivos, o que está em aberto e
// se a issue já foi commitada pela esteira (linha `Esteira-Issue: <id>` no histórico
// do branch atual) ou já está nas concluídas.
export function listarParaEsteira(raiz, cfg, alvo) {
  const umaIssue = /^[A-Za-z]+\d+-\d+$/.test(alvo) || alvo.endsWith('.md')
  const caminhos = umaIssue
    ? [acharIssue(raiz, cfg, alvo)].filter(Boolean)
    : listarIssues(raiz, cfg, { comConcluidas: true }).filter((a) => serieDaIssue(a) === alvo.toUpperCase())
  caminhos.sort((x, y) => path.basename(x).localeCompare(path.basename(y), 'pt-BR', { numeric: true }))
  const historico = git(raiz, ['log', '--format=%B']) || ''
  const commitadas = new Set([...historico.matchAll(/^Esteira-Issue:\s*(\S+)/gm)].map((m) => m[1].toUpperCase()))
  const pastaIssues = path.join(raiz, cfg.pastaIssues)
  const issues = caminhos.map((caminho) => {
    const issue = lerIssue(caminho)
    const id = idDaIssue(caminho)
    const abertas = (lista, fechados) => lista.filter((r) => !fechados.includes(r.status)).map((r) => r.id)
    return {
      id,
      caminho: path.relative(raiz, caminho).split(path.sep).join('/'),
      titulo: issue.titulo,
      serie: issue.serie,
      avulsa: issue.avulsa,
      risco: semAcento((/^\*\*Risco:\*\*\s*(\S+)/m.exec(semBlocosDeCodigo(issue.texto)) || [])[1] || '') === 'sim',
      automaticos: issue.criterios.filter((c) => c.prova === 'automatica').length,
      arquivos: issue.arquivos || [],
      suposicoesAbertas: abertas(issue.suposicoes, ['confirmada', 'invalidada']),
      perguntasAbertas: abertas(issue.perguntas, ['respondida']),
      concluida: path.dirname(caminho) !== pastaIssues,
      commitada: commitadas.has(id),
      dependeDe: dependenciasDaIssue(issue.texto, id),
    }
  })
  return {
    alvo,
    serie: umaIssue ? (issues[0] && issues[0].serie) || null : alvo.toUpperCase(),
    pastaIssues: cfg.pastaIssues,
    pastaSpecs: cfg.pastaSpecs,
    issues,
    lotes: lotesDaEsteira(issues),
  }
}

// Identificador sem zeros à esquerda no número: S1-01 e S1-1 são a mesma issue.
function idCanonico(id) {
  return id.toUpperCase().replace(/-0*(\d+)$/, '-$1')
}

// Issues de que esta depende, pelo campo `**Depende de:**` (feito pelo break). Vale só o
// que vem antes de um parêntese ou de "independente": "P1-05 (independente de P1-06)"
// depende só da P1-05. Códigos de critério, suposição e pergunta não contam.
export function dependenciasDaIssue(texto, id) {
  const campo = (/^\*\*Depende de:\*\*\s*(.+)$/m.exec(semBlocosDeCodigo(texto)) || [])[1] || ''
  const trecho = campo.split(/\(|\bindependente/i)[0]
  const ids = trecho.match(/(?<![A-Za-z-])[A-Za-z]+\d+-\d+\b/g) || []
  return [...new Set(ids.map((d) => d.toUpperCase()))].filter((d) => idCanonico(d) !== idCanonico(id || ''))
}

function caminhoComparavel(arquivo) {
  return arquivo.replace(/\\/g, '/').replace(/^\.\//, '')
}

// Grupos de issues que podem rodar juntas, em ordem (cada grupo depois do anterior).
// Entram juntas as issues que não dependem umas das outras, cujas dependências já
// foram feitas (num grupo anterior, ou de outra série) e que têm a seção Arquivos
// preenchida sem arquivo em comum. Issue sem Arquivos fica sozinha. Dependência da
// mesma série que não está na lista, ou em círculo: cada issue presa vira um grupo só
// dela, no fim, na ordem.
export function lotesDaEsteira(issues) {
  const serie = (id) => id.split('-')[0].toUpperCase()
  const seriesDoAlvo = new Set(issues.map((i) => serie(i.id)))
  const feitas = new Set(issues.filter((i) => i.commitada || i.concluida).map((i) => idCanonico(i.id)))
  let pendentes = issues.filter((i) => !feitas.has(idCanonico(i.id)))
  const arquivos = (i) => (i.arquivos || []).map(caminhoComparavel)
  const lotes = []
  while (pendentes.length) {
    const lote = []
    for (const issue of pendentes) {
      const prontas = (issue.dependeDe || []).every((d) => feitas.has(idCanonico(d)) || !seriesDoAlvo.has(serie(d)))
      if (!prontas) continue
      if (lote.length === 0) {
        lote.push(issue)
        continue
      }
      const disjunta =
        arquivos(issue).length > 0 &&
        lote.every((outra) => arquivos(outra).length > 0 && !arquivos(outra).some((a) => arquivos(issue).includes(a)))
      if (disjunta) lote.push(issue)
    }
    if (lote.length === 0) {
      // Ninguém pronto: dependência em círculo ou de issue que não vai rodar.
      for (const issue of pendentes) lotes.push([issue.id])
      break
    }
    lotes.push(lote.map((i) => i.id))
    for (const i of lote) feitas.add(idCanonico(i.id))
    pendentes = pendentes.filter((i) => !lote.includes(i))
  }
  return lotes
}

export function lerLicoes(raiz, cfg) {
  const arquivo = path.join(raiz, cfg.arquivoLicoes)
  if (!fs.existsSync(arquivo)) return []
  return linhasDaTabela(ler(arquivo))
    .filter(([id]) => /^L-\d+$/.test(id || ''))
    .map(([id, texto, origem, falha, recorrencias]) => ({
      id,
      texto,
      origem,
      falha,
      recorrencias: recorrencias && recorrencias !== '—' ? recorrencias.split(',').map((r) => r.trim()) : [],
    }))
}

function gravarLicoes(raiz, cfg, licoes) {
  const linhas = licoes.map(
    (l) => `| ${l.id} | ${l.texto} | ${l.origem} | ${l.falha} | ${l.recorrencias.length ? l.recorrencias.join(', ') : '—'} |`
  )
  const texto = [
    '# Lições aprendidas',
    '',
    'Regras que nasceram de uma falha real em uma issue. O `/spec` e o `/plan` leem as dez',
    'primeiras, as recorrentes na frente. Este arquivo é escrito pelo auditor',
    '(`auditor.mjs licao ...`); não edite à mão.',
    '',
    '| ID | Lição | Origem | Falha | Voltou a acontecer em |',
    '|---|---|---|---|---|',
    ...linhas,
    '',
  ].join('\n')
  const arquivo = path.join(raiz, cfg.arquivoLicoes)
  fs.mkdirSync(path.dirname(arquivo), { recursive: true })
  fs.writeFileSync(arquivo, texto)
}

// Recorrentes primeiro, depois as mais novas; no máximo dez.
export function licoesParaLer(raiz, cfg) {
  return lerLicoes(raiz, cfg)
    .map((l, i) => ({ ...l, ordem: i }))
    .sort((a, b) => b.recorrencias.length - a.recorrencias.length || b.ordem - a.ordem)
    .slice(0, MAX_LICOES_LIDAS)
}

// Devolve { erro } ou { licao }. `sinais` é injetável para teste.
export function adicionarLicao(raiz, cfg, { issue, falha, texto, evidencia }, sinais = lerSinais(raiz)) {
  const id = idDaIssue(issue || '')
  if (!id) return { erro: 'diga a issue de origem (ex.: S1-02)' }
  if (vazio(texto)) return { erro: 'escreva a lição em uma frase: --texto "..."' }
  if (vazio(falha)) {
    return { erro: 'lição sem falha de origem é recusada: diga --falha <código do auditor | revisildo | teste-manual>' }
  }
  let origemDaFalha
  if (FALHAS_SEM_SINAL.includes(falha)) {
    if (vazio(evidencia)) return { erro: `falha "${falha}" precisa da evidência: --evidencia "o que deu errado"` }
    origemDaFalha = `${falha}: ${evidencia}`
  } else {
    const sinal = sinais.find((s) => s.issue === id && s.codigo === falha)
    if (!sinal) {
      return {
        erro: `o auditor não registrou "${falha}" na issue ${id}; lição sem falha real é recusada. Caminho limpo não gera lição.`,
      }
    }
    origemDaFalha = `${NOMES[falha] || falha} em ${sinal.alvo}`
  }
  const licoes = lerLicoes(raiz, cfg)
  if (licoes.filter((l) => l.origem === id).length >= MAX_LICOES_POR_ISSUE) {
    return { erro: `a issue ${id} já tem ${MAX_LICOES_POR_ISSUE} lições, que é o máximo` }
  }
  const numero = Math.max(0, ...licoes.map((l) => Number(l.id.slice(2)))) + 1
  const licao = {
    id: `L-${String(numero).padStart(2, '0')}`,
    texto: texto.replace(/\|/g, '/').trim(),
    origem: id,
    falha: origemDaFalha.replace(/\|/g, '/'),
    recorrencias: [],
  }
  gravarLicoes(raiz, cfg, [...licoes, licao])
  return { licao }
}

// Marca que a falha de uma lição voltou a acontecer, em outra série.
export function marcarRecorrencia(raiz, cfg, idLicao, issue) {
  const licoes = lerLicoes(raiz, cfg)
  const licao = licoes.find((l) => l.id === idLicao)
  const id = idDaIssue(issue || '')
  if (!licao) return { erro: `lição ${idLicao} não existe` }
  if (!id) return { erro: 'diga a issue em que a falha voltou (ex.: S2-01)' }
  const serie = (x) => x.split('-')[0]
  if ([licao.origem, ...licao.recorrencias].some((x) => serie(x) === serie(id))) {
    return { erro: `a série ${serie(id)} já está contada nesta lição; recorrência é a mesma falha em outra série` }
  }
  licao.recorrencias.push(id)
  gravarLicoes(raiz, cfg, licoes)
  return { licao }
}

export function removerLicao(raiz, cfg, idLicao) {
  const licoes = lerLicoes(raiz, cfg)
  if (!licoes.some((l) => l.id === idLicao)) return { erro: `lição ${idLicao} não existe` }
  gravarLicoes(raiz, cfg, licoes.filter((l) => l.id !== idLicao))
  return {}
}

// ---------------------------------------------------------------- relatório

function imprimirProblemas(problemas, escrever) {
  for (const p of problemas) {
    escrever(`  ${p.trava ? '✘' : '•'} ${p.nome} (${p.codigo}) — ${p.alvo}`)
    if (p.detalhe) p.detalhe.split('\n').forEach((l) => escrever(`      ${l}`))
    escrever(`      o que fazer: ${p.oQueFazer}`)
  }
}

export function imprimirIssue(rel, escrever = console.log) {
  escrever(`Issue: ${rel.titulo}`)
  escrever(`Arquivo: ${rel.issue}`)
  imprimirProblemas(rel.problemas, escrever)
  for (const m of rel.manuaisPendentes) {
    if (!m.roteiro) continue
    escrever(`  Roteiro manual — ${m.codigo}:`)
    m.roteiro.split('\n').forEach((l) => escrever(`      ${l}`))
  }
  for (const e of rel.excecoes) {
    const uso = e.usada ? '' : ' (não usada: o problema não existe mais)'
    escrever(`  ⚑ exceção: ${e.problema} em ${e.alvo} — ${e.motivo}. Aprovada por ${e.por} em ${e.dia}${uso}`)
  }
  for (const d of rel.regrasDesligadas || []) {
    escrever(`  ⚑ regra desligada: ${d.regra} em ${d.arquivo} — ${d.motivo}`)
  }
  escrever(`Veredito: ${rel.veredito}`)
}

function erroDeUso(mensagem) {
  console.error(`erro: ${mensagem}`)
  console.error('uso: auditor.mjs issue <id|caminho> | serie <série> | suposicoes | regras | licao ... | confirmar <id> <CA-...> --por <nome>')
  return SAIDA.USO
}

function opcao(args, nome) {
  const i = args.indexOf(nome)
  return i === -1 ? undefined : args[i + 1]
}

export function principal(args, raiz = process.cwd()) {
  const cfg = carregarConfig(raiz)
  const [comando, ...resto] = args
  const semRodar = resto.includes('--sem-rodar')
  const json = resto.includes('--json')
  // Uma linha só de JSON, resumida: o formato que a esteira lê (um agente copia a saída).
  const linha = resto.includes('--linha')
  const comValor = ['--por', '--dia', '--falha', '--texto', '--evidencia']
  const posicionais = resto.filter((a, i) => !a.startsWith('--') && !comValor.includes(resto[i - 1]))

  if (comando === 'issue') {
    if (!posicionais[0]) return erroDeUso('diga qual issue')
    const caminho = acharIssue(raiz, cfg, posicionais[0])
    if (!caminho) return erroDeUso(`issue "${posicionais[0]}" não encontrada em ${cfg.pastaIssues}`)
    const rel = executarIssue(raiz, cfg, caminho, { semRodar })
    registrarSinais(raiz, rel)
    registrarUltimoVeredito(raiz, idDaIssue(caminho) || path.basename(caminho), rel.veredito)
    if (linha) {
      const problemas = rel.problemas.filter((p) => p.trava).map(({ codigo, alvo, detalhe }) => ({ codigo, alvo, detalhe }))
      console.log(JSON.stringify({ issue: rel.issue, veredito: rel.veredito, problemas }))
    } else if (json) console.log(JSON.stringify(rel, null, 2))
    else imprimirIssue(rel)
    return rel.saida
  }

  if (comando === 'serie') {
    if (!posicionais[0]) return erroDeUso('diga qual série')
    const rel = executarSerie(raiz, cfg, posicionais[0], { semRodar })
    if (rel.issues.length === 0 && rel.problemas.length === 0) return erroDeUso(`nenhuma issue da série ${rel.serie}`)
    registrarUltimoVeredito(raiz, `série ${rel.serie}`, rel.veredito)
    if (json) {
      console.log(JSON.stringify(rel, null, 2))
      return rel.saida
    }
    console.log(`Série: ${rel.serie}`)
    imprimirProblemas(rel.problemas, console.log)
    for (const issue of rel.issues) {
      console.log('')
      imprimirIssue(issue)
    }
    console.log(`\nVeredito da série: ${rel.veredito}`)
    return rel.saida
  }

  if (comando === 'esteira-lista') {
    if (!posicionais[0]) return erroDeUso('diga a série ou a issue')
    const rel = listarParaEsteira(raiz, cfg, posicionais[0])
    if (rel.issues.length === 0) return erroDeUso(`nenhuma issue de "${posicionais[0]}" em ${cfg.pastaIssues}`)
    if (linha) console.log(JSON.stringify(rel))
    else if (json) console.log(JSON.stringify(rel, null, 2))
    else {
      console.log(`Esteira: ${rel.alvo} (série ${rel.serie || '?'})`)
      for (const i of rel.issues) {
        const marcas = [i.risco && 'risco', i.commitada && 'já commitada', i.concluida && 'concluída', (i.perguntasAbertas.length || i.suposicoesAbertas.length) && 'algo em aberto'].filter(Boolean)
        console.log(`  ${i.titulo}${marcas.length ? ` (${marcas.join(', ')})` : ''}`)
      }
    }
    return SAIDA.ALINHADA
  }

  if (comando === 'estado') {
    if (!posicionais[0]) return erroDeUso('diga qual issue')
    const id = posicionais[0].toUpperCase()
    const registro = lerRegistro(raiz)
    const estado = { issue: id, ativa: registro.ativa === id, ...(registro.issues[id] || {}) }
    if (estado.antes) {
      delete estado.antes.testes
      delete estado.antes.secoes
    }
    if (linha) console.log(JSON.stringify(estado))
    else if (json) console.log(JSON.stringify(estado, null, 2))
    else {
      console.log(`${id}${estado.ativa ? ' (ativa no portão)' : ''}: ${estado.tentativas || 0} tentativa(s)${estado.precisaDecisao ? ', precisa de decisão humana' : ''}`)
      if (estado.antes) for (const [c, e] of Object.entries(estado.antes.criterios)) console.log(`  antes — ${c}: ${e}`)
    }
    return SAIDA.ALINHADA
  }

  if (comando === 'iniciar') {
    if (!posicionais[0]) return erroDeUso('diga qual issue')
    const caminho = acharIssue(raiz, cfg, posicionais[0])
    if (!caminho) return erroDeUso(`issue "${posicionais[0]}" não encontrada em ${cfg.pastaIssues}`)
    const rel = iniciarIssue(raiz, caminho)
    if (rel.erro) return erroDeUso(rel.erro)
    console.log(`${rel.issue} é agora a issue ativa do portão (contagem de tentativas zerada).`)
    return SAIDA.ALINHADA
  }

  if (comando === 'antes') {
    if (!posicionais[0]) return erroDeUso('diga qual issue')
    const caminho = acharIssue(raiz, cfg, posicionais[0])
    if (!caminho) return erroDeUso(`issue "${posicionais[0]}" não encontrada em ${cfg.pastaIssues}`)
    const rel = registrarAntes(raiz, cfg, caminho)
    if (rel.erro) return erroDeUso(rel.erro)
    if (json) {
      console.log(JSON.stringify(rel, null, 2))
      return rel.saida
    }
    console.log(`Antes da implementação: ${rel.issue} (agora é a issue ativa do portão)`)
    for (const [codigo, estado] of Object.entries(rel.criterios)) {
      console.log(`  ${estado === 'falhou' ? '✔' : '✘'} ${codigo}: ${estado}`)
    }
    if (rel.erroDosTestes) console.log(`  o comando de teste falhou antes de dar resultado:\n${rel.erroDosTestes}`)
    if (rel.passaram.length) console.log(`O teste de ${rel.passaram.join(', ')} já passa sem o código: ele não prova o critério.`)
    if (rel.semTeste.length) console.log(`Sem teste: ${rel.semTeste.join(', ')}.`)
    if (rel.naoRodaram.length) console.log(`Não rodaram: ${rel.naoRodaram.join(', ')}; corrija a execução dos testes e rode o antes de novo.`)
    if (rel.saida === SAIDA.ALINHADA) console.log('Todos os testes falham antes da implementação, como devem.')
    return rel.saida
  }

  if (comando === 'suposicoes') {
    const abertas = listarAbertas(raiz, cfg)
    if (json) console.log(JSON.stringify(abertas, null, 2))
    else if (abertas.length === 0) console.log('Nenhuma suposição ou pergunta em aberto.')
    else abertas.forEach((a) => console.log(`${a.nome} — ${a.alvo}: ${a.detalhe}\n    em ${a.onde}`))
    return SAIDA.ALINHADA
  }

  if (comando === 'regras') {
    const resultado = conferirProjetoInteiro(raiz, carregarRegras(raiz))
    if (json) {
      console.log(JSON.stringify(resultado, null, 2))
      return SAIDA.ALINHADA
    }
    if (resultado.length === 0) console.log('Nenhuma regra por script neste projeto.')
    for (const r of resultado) {
      const achados = r.regra.tipo === 'intocavel' ? 'só confere arquivo modificado' : `${r.problemas.length} ocorrência(s) hoje`
      console.log(`${r.regra.id} — ${r.regra.nome}`)
      console.log(`    vem de: ${r.regra.origem}`)
      console.log(`    confere ${r.arquivos} arquivo(s); ${achados}`)
      if (r.arquivos === 0) console.log(`    ✘ ${NOMES.REGRA_SEM_ARQUIVOS}: provavelmente o caminho da regra está escrito errado`)
      r.problemas.slice(0, 5).forEach((p) => console.log(`      ${p.alvo} — ${p.detalhe.split('\n')[0]}`))
      if (r.problemas.length > 5) console.log(`      ... e mais ${r.problemas.length - 5}`)
      r.desligadas.forEach((d) => console.log(`      ⚑ desligada em ${d.arquivo} — ${d.motivo}`))
    }
    return resultado.some((r) => r.arquivos === 0) ? SAIDA.NAO_ALINHADA : SAIDA.ALINHADA
  }

  if (comando === 'licao') {
    const [acao, alvo, alvo2] = posicionais
    if (acao === 'listar') {
      const licoes = licoesParaLer(raiz, cfg)
      if (json) console.log(JSON.stringify(licoes, null, 2))
      else if (licoes.length === 0) console.log('Nenhuma lição registrada.')
      else {
        licoes.forEach((l) => {
          const voltou = l.recorrencias.length ? ` — RECORRENTE (voltou em ${l.recorrencias.join(', ')})` : ''
          console.log(`${l.id}: ${l.texto}\n    origem: ${l.origem}, ${l.falha}${voltou}`)
        })
      }
      return SAIDA.ALINHADA
    }
    let resultado
    if (acao === 'adicionar') {
      resultado = adicionarLicao(raiz, cfg, {
        issue: alvo,
        falha: opcao(resto, '--falha'),
        texto: opcao(resto, '--texto'),
        evidencia: opcao(resto, '--evidencia'),
      })
    } else if (acao === 'recorreu') resultado = marcarRecorrencia(raiz, cfg, alvo, alvo2)
    else if (acao === 'remover') resultado = removerLicao(raiz, cfg, alvo)
    else return erroDeUso('use: licao listar | adicionar <issue> --falha <...> --texto "..." | recorreu <L-nn> <issue> | remover <L-nn>')
    if (resultado.erro) return erroDeUso(resultado.erro)
    console.log(resultado.licao ? `Lição ${resultado.licao.id} gravada em ${cfg.arquivoLicoes}.` : `Lição ${alvo} removida.`)
    return SAIDA.ALINHADA
  }

  if (comando === 'confirmar') {
    const [id, codigo] = posicionais
    if (!id || !codigo) return erroDeUso('diga a issue e o critério')
    const caminho = acharIssue(raiz, cfg, id)
    if (!caminho) return erroDeUso(`issue "${id}" não encontrada em ${cfg.pastaIssues}`)
    const erro = confirmarManual(caminho, codigo, opcao(resto, '--por'), opcao(resto, '--dia'))
    if (erro) return erroDeUso(erro)
    console.log(`Teste manual de ${codigo} confirmado por ${opcao(resto, '--por')}.`)
    return SAIDA.ALINHADA
  }

  return erroDeUso(comando ? `comando desconhecido: ${comando}` : 'faltou o comando')
}

// Compara pelo caminho real: chamado por um atalho para a pasta do plugin, o
// `argv[1]` e o `import.meta.url` diferem, e sair calado daria código 0 (alinhada).
function chamadoDireto() {
  if (!process.argv[1]) return false
  try {
    return fs.realpathSync.native(process.argv[1]) === fs.realpathSync.native(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (chamadoDireto()) {
  process.exitCode = principal(process.argv.slice(2))
}
