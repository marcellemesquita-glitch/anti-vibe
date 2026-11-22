// Gancho de papéis do anti-vibe (PreToolUse em Edit, Write, MultiEdit e NotebookEdit).
//
// Cada agente da esteira edita só o que é do seu papel:
// - planejador: só a pasta de specs (spec e issues);
// - escritor de testes: só arquivo de teste (sufixo de teste, ou dentro de uma pasta de
//   teste, de mocks ou de fixtures);
// - executor: o código, e a issue e a spec (para marcar o checklist e registrar
//   suposições; mudar critérios ou arquivos da issue o auditor acusa). Nunca teste,
//   configuração de teste, CI ou auditor, a pasta do git, o registro do auditor nem o
//   próprio plugin;
// - revisor: nada.
// Fora desses agentes, o gancho não opina. Edição por terminal não passa por aqui: esse
// limite está registrado na spec.
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chamadoDireto, lerEntrada } from './comum.mjs'

const raizDoPlugin = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const PASTAS_DE_TESTE = ['test', 'tests', '__tests__', '__mocks__', 'fixtures']
const RE_AGENTE_DA_ESTEIRA = /^anti-vibe:(planejador|escritor-de-testes|executor|revisor)$/
// Discos do Windows e do macOS não diferenciam maiúsculas: a comparação também não.
const SEM_CAIXA = process.platform !== 'linux'

function normal(texto) {
  return SEM_CAIXA ? texto.toLowerCase() : texto
}

// Configuração com as listas na mesma caixa dos caminhos comparados.
function configComparavel(cfg) {
  const lista = (l) => (l || []).map(normal)
  return {
    ...cfg,
    pastasTestes: lista(cfg.pastasTestes),
    sufixosTeste: lista(cfg.sufixosTeste),
    configDeTeste: lista(cfg.configDeTeste),
    pastaSpecs: normal(cfg.pastaSpecs),
    pastaIssues: normal(cfg.pastaIssues),
  }
}

// `alvo` está dentro de `pasta` (caminhos absolutos)?
function dentroDe(pasta, alvo) {
  const rel = path.relative(normal(path.resolve(pasta)), normal(path.resolve(alvo)))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

// { nega: false } ou { nega: true, motivo }.
export async function decidirEdicao(entrada) {
  const agente = RE_AGENTE_DA_ESTEIRA.exec(String(entrada.agent_type || ''))
  if (!agente) return { nega: false }
  const papel = agente[1]
  if (papel === 'revisor') return { nega: true, motivo: 'o revisor independente só lê; ele não edita nenhum arquivo' }
  const alvo = entrada.tool_input?.file_path || entrada.tool_input?.notebook_path
  if (!alvo) return { nega: false }

  const raiz = process.env.CLAUDE_PROJECT_DIR || entrada.cwd || process.cwd()
  const absoluto = path.resolve(raiz, alvo)
  const foraDoProjeto = !dentroDe(raiz, absoluto)
  const rel = normal(path.relative(raiz, absoluto).split(path.sep).join('/'))

  const auditor = await import(pathToFileURL(path.join(raizDoPlugin, 'auditor', 'auditor.mjs')).href)
  let cfg
  try {
    cfg = auditor.carregarConfig(raiz)
  } catch {
    cfg = { ...auditor.CONFIG_PADRAO }
  }
  cfg = configComparavel(cfg)
  const pastas = rel.split('/').slice(0, -1)
  const eTeste = !foraDoProjeto && (auditor.eArquivoDeTeste(rel, cfg) || pastas.some((p) => PASTAS_DE_TESTE.includes(p)))
  const dentro = (pasta) => rel === pasta || rel.startsWith(`${pasta}/`)
  const eDoFluxo = !foraDoProjeto && (dentro(cfg.pastaSpecs) || dentro(cfg.pastaIssues))
  // Pasta do git, registro e sinais do auditor (que podem ficar fora do projeto, numa
  // subpasta do repositório) e o próprio plugin.
  const pastaDosRegistros = path.dirname(auditor.arquivoDoRegistro(raiz))
  const eDoAuditor =
    (!foraDoProjeto && dentro('.git')) ||
    (dentroDe(pastaDosRegistros, absoluto) && /^auditor-.*\.json$/i.test(path.basename(absoluto))) ||
    dentroDe(raizDoPlugin, absoluto)

  if (papel === 'planejador') {
    return eDoFluxo ? { nega: false } : { nega: true, motivo: `o planejador só edita a spec e as issues (em ${cfg.pastaSpecs}/); ${rel} é de outro papel` }
  }
  if (papel === 'escritor-de-testes') {
    return eTeste && !eDoAuditor
      ? { nega: false }
      : { nega: true, motivo: `o escritor de testes não altera código que não seja de teste; ${rel} não é arquivo de teste` }
  }
  // executor
  if (eDoAuditor) return { nega: true, motivo: `o executor não mexe no auditor, no registro dele, na pasta do git nem no plugin; ${rel} está protegido` }
  if (foraDoProjeto) return { nega: false }
  if (eTeste) return { nega: true, motivo: `o executor não cria, não altera e não apaga teste; ${rel} é arquivo de teste` }
  if (auditor.eConfigDeTeste(rel, cfg)) {
    return { nega: true, motivo: `o executor não mexe na configuração de testes, do CI ou do auditor; ${rel} está protegido` }
  }
  return { nega: false }
}

if (chamadoDireto(import.meta.url)) {
  const entrada = await lerEntrada()
  let decisao
  try {
    decisao = await decidirEdicao(entrada)
  } catch (erro) {
    // Sem conseguir decidir, um agente da esteira não edita: é mais seguro parar.
    const daEsteira = RE_AGENTE_DA_ESTEIRA.test(String(entrada.agent_type || ''))
    decisao = daEsteira ? { nega: true, motivo: `o gancho de papéis não conseguiu decidir (${erro.message})` } : { nega: false }
  }
  if (decisao.nega) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Papéis anti-vibe: ${decisao.motivo}.`,
        },
      }) + '\n'
    )
  }
}
