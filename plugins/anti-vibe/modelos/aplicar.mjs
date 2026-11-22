// Aplica os modelos do anti-vibe na pasta atual (a raiz do projeto).
//
//   node "${CLAUDE_PLUGIN_ROOT}/modelos/aplicar.mjs" [--git] [--regras] [--json]
//
// Cria só o que falta e nunca sobrescreve: arquivo que já existe é pulado. Diz o que
// criou, o que pulou e o que não conseguiu criar. Opcionais: --git (seção de git no
// AGENTS.md que ele criar) e --regras (regras por script de exemplo).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pastaDosModelos = path.dirname(fileURLToPath(import.meta.url))

// Sempre com quebra de linha LF, para os modelos não saírem misturados.
function ler(nome) {
  return fs.readFileSync(path.join(pastaDosModelos, nome), 'utf8').replace(/\r\n/g, '\n')
}

// O que vai para onde: [destino no projeto, conteúdo].
export function planoDeArquivos({ git = false, regras = false } = {}) {
  const agents = git ? `${ler('AGENTS.md').trimEnd()}\n\n${ler('opcionais/git.md')}` : ler('AGENTS.md')
  const plano = [
    ['AGENTS.md', agents],
    ['CLAUDE.md', ler('CLAUDE.md')],
    ['.claude/auditor.json', ler('auditor.json')],
    ['pre-desenvolvimento/issues/README.md', ler('issues-README.md')],
  ]
  if (regras) plano.push(['.claude/auditor-regras.json', ler('opcionais/auditor-regras.json')])
  return plano
}

// Devolve { criados, pulados, falhas, avisos }.
export function aplicar(raiz, opcoes = {}) {
  const resultado = { criados: [], pulados: [], falhas: [], avisos: [] }
  for (const [destino, conteudo] of planoDeArquivos(opcoes)) {
    const arquivo = path.join(raiz, destino)
    if (fs.existsSync(arquivo)) {
      resultado.pulados.push(destino)
      if (destino === 'AGENTS.md' && opcoes.git) {
        resultado.avisos.push(
          `o AGENTS.md já existia e não foi mexido: para as regras de git, acrescente à mão a seção de ${path.join(pastaDosModelos, 'opcionais', 'git.md')}`
        )
      }
      if (destino === '.claude/auditor-regras.json' && opcoes.regras) {
        resultado.avisos.push(
          `o .claude/auditor-regras.json já existia e não foi mexido: as regras de exemplo estão em ${path.join(pastaDosModelos, 'opcionais', 'auditor-regras.json')}, para copiar à mão se quiser`
        )
      }
      if (destino === 'CLAUDE.md' && !/^\s*@AGENTS\.md\s*$/m.test(fs.readFileSync(arquivo, 'utf8'))) {
        resultado.avisos.push('o CLAUDE.md já existia e não importa o AGENTS.md: acrescente nele, à mão, uma linha só com @AGENTS.md, senão as regras e o fluxo não são carregados')
      }
      continue
    }
    try {
      fs.mkdirSync(path.dirname(arquivo), { recursive: true })
      // 'wx': falha se o arquivo aparecer entre a conferência e a escrita.
      fs.writeFileSync(arquivo, conteudo, { flag: 'wx' })
      resultado.criados.push(destino)
    } catch (erro) {
      resultado.falhas.push({ arquivo: destino, motivo: erro.message })
    }
  }
  return resultado
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
  const args = process.argv.slice(2)
  const r = aplicar(process.cwd(), { git: args.includes('--git'), regras: args.includes('--regras') })
  if (args.includes('--json')) console.log(JSON.stringify(r, null, 2))
  else {
    for (const a of r.criados) console.log(`criado: ${a}`)
    for (const a of r.pulados) console.log(`pulado (já existia, não foi mexido): ${a}`)
    for (const f of r.falhas) console.log(`não deu para criar: ${f.arquivo} (${f.motivo})`)
    for (const a of r.avisos) console.log(`aviso: ${a}`)
  }
  process.exitCode = r.falhas.length ? 1 : 0
}
