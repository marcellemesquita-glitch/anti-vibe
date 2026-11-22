// Gancho de início de sessão do anti-vibe.
// Escreve no stdout (vira contexto da sessão) a versão ativa, as regras sempre
// ativas, a instrução de começar pela triagem e, num projeto com o fluxo, o estado
// do trabalho. Só informa: nunca bloqueia a sessão e sempre termina com sucesso.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const raizDoPlugin = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

export const LIMITE = 10000
const MAX_ISSUES = 20

function versao() {
  try {
    const manifesto = JSON.parse(fs.readFileSync(path.join(raizDoPlugin, '.claude-plugin', 'plugin.json'), 'utf8'))
    return manifesto.version || 'sem versão'
  } catch {
    return 'sem versão'
  }
}

const REGRAS = [
  'Só são mexidos os arquivos listados na tarefa atual.',
  'Nenhuma funcionalidade além do que foi pedido é adicionada.',
  'Código existente é reutilizado: antes de criar algo, procura-se por nomes parecidos.',
  'Lógica de negócio fica no backend, nunca no frontend.',
  'Chaves de API, segredos e tokens nunca ficam no frontend.',
]

function textoDasRegras() {
  return [
    `anti-vibe ${versao()} ativo`,
    '',
    'Regras sempre ativas deste fluxo:',
    ...REGRAS.map((r, i) => `${i + 1}. ${r}`),
    '',
    'Toda tarefa começa pela triagem (/anti-vibe:triagem), que decide a marcha: sonda, delimitada ou arquitetural.',
    'O detalhe de cada projeto fica no AGENTS.md da raiz (ou, na falta dele, no CLAUDE.md).',
  ]
}

function relativo(raiz, caminho) {
  return path.relative(raiz, caminho).split(path.sep).join('/')
}

// Cada parte do estado tem a própria guarda: um arquivo ilegível vira uma linha de
// aviso e não apaga o resto.
function parte(linhas, nome, ler) {
  try {
    ler()
  } catch (erro) {
    linhas.push(`(não deu para ler ${nome}: ${erro.message})`)
  }
}

// Código e título da issue; o código vem do nome do arquivo se o título não o traz.
function nomeDaIssue(a, caminho) {
  const titulo = a.lerIssue(caminho).titulo
  const id = a.idDaIssue(caminho)
  return id && !titulo.toUpperCase().startsWith(id) ? `${id}: ${titulo}` : titulo
}

// Linhas do estado do trabalho; [] se a pasta não usa o fluxo.
async function linhasDoEstado(raiz) {
  const a = await import(pathToFileURL(path.join(raizDoPlugin, 'auditor', 'auditor.mjs')).href)
  const cfg = a.carregarConfig(raiz)
  const specs = a.listarSpecs(path.join(raiz, cfg.pastaSpecs))
  const usaOFluxo =
    specs.length > 0 ||
    fs.existsSync(path.join(raiz, cfg.pastaIssues)) ||
    fs.existsSync(path.join(raiz, '.claude', 'auditor.json'))
  if (!usaOFluxo) return []

  const linhas = ['', 'Estado do trabalho neste projeto:']

  linhas.push(specs.length ? 'Spec ativa:' : 'Spec ativa: nenhuma.')
  for (const s of specs) {
    parte(linhas, relativo(raiz, s), () => {
      const spec = a.lerSpec(s)
      linhas.push(`- ${relativo(raiz, s)}${spec.serie ? ` (série ${spec.serie})` : ''}: ${spec.titulo}`)
    })
  }

  parte(linhas, 'as issues abertas', () => {
    // Ordem numérica: S1-2 antes de S1-10.
    const abertas = a
      .listarIssues(raiz, cfg)
      .sort((x, y) => path.basename(x).localeCompare(path.basename(y), 'pt-BR', { numeric: true }))
    linhas.push(abertas.length ? `Issues abertas (${abertas.length}):` : 'Issues abertas: nenhuma.')
    for (const i of abertas.slice(0, MAX_ISSUES)) {
      parte(linhas, relativo(raiz, i), () => linhas.push(`- ${nomeDaIssue(a, i)}`))
    }
    if (abertas.length > MAX_ISSUES) {
      linhas.push(`- ... e mais ${abertas.length - MAX_ISSUES} (todas em ${cfg.pastaIssues}/).`)
    }
  })

  const ultimo = a.lerUltimoVeredito(raiz)
  if (ultimo) linhas.push(`Último veredito do auditor: ${ultimo.alvo} — ${ultimo.veredito} (${ultimo.dia}).`)

  parte(linhas, 'as lições', () => {
    const licoes = a.licoesParaLer(raiz, cfg)
    if (licoes.length) {
      linhas.push('Lições aprendidas (leia antes de planejar):')
      for (const l of licoes) linhas.push(`- ${l.id}: ${l.texto}`)
    }
  })
  return linhas
}

export async function textoDaSessao(raiz = process.env.CLAUDE_PROJECT_DIR || process.cwd()) {
  const linhas = textoDasRegras()
  try {
    linhas.push(...(await linhasDoEstado(raiz)))
  } catch (erro) {
    linhas.push('', `Não deu para ler o estado do trabalho: ${erro.message}`)
  }
  let texto = linhas.join('\n')
  // Folga de 100 caracteres abaixo do limite, para a quebra de linha final e afins.
  const teto = LIMITE - 100
  if (texto.length > teto) {
    const aviso = '\n[... cortado para caber no limite do início de sessão]'
    texto = texto.slice(0, teto - aviso.length) + aviso
  }
  return texto
}

function chamadoDireto() {
  if (!process.argv[1]) return false
  try {
    return fs.realpathSync.native(process.argv[1]) === fs.realpathSync.native(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (chamadoDireto()) {
  process.stdout.write((await textoDaSessao()) + '\n')
}
