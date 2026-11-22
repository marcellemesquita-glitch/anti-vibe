// Portão de conclusão do anti-vibe.
//
// Um agente pode encerrar de dois jeitos, e o portão vigia os dois:
// - escrevendo a resposta final  → gancho SubagentStop (barra com saída 2);
// - chamando a ferramenta SubagentHandback (o Claude Code usa esse caminho no modo
//   automático de permissões) → gancho PreToolUse (nega a chamada).
//
// Dois agentes passam por aqui:
// - o de diagnóstico: na primeira tentativa de encerrar, o portão barra e entrega uma
//   palavra-passe que só ele conhece; o agente é obrigado a continuar e devolvê-la, o que
//   prova que o bloqueio funciona no ambiente. Na segunda tentativa, libera sempre.
// - o executor: o portão roda o auditor sobre a issue ativa (a do último `antes`) e barra
//   enquanto houver problema, devolvendo a lista do que falta. O auditor conta as
//   reprovações; no limite, o portão libera com o aviso de que a issue precisa de decisão
//   humana.
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const AGENTE_DIAGNOSTICO = 'anti-vibe:diagnostico'
export const AGENTE_EXECUTOR = 'anti-vibe:executor'

const raizDoPlugin = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// Resposta do portão para um encerramento barrado ou liberado, nos dois caminhos.
function resposta(entrada, { libera, mensagem }) {
  if (entrada.hook_event_name === 'PreToolUse') {
    if (libera) return { codigo: 0, stdout: mensagem ? JSON.stringify({ systemMessage: mensagem }) : undefined }
    return {
      codigo: 0,
      stdout: JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: mensagem },
      }),
    }
  }
  if (libera) return { codigo: 0, stdout: mensagem ? JSON.stringify({ systemMessage: mensagem }) : undefined }
  return { codigo: 2, stderr: mensagem }
}

// Fim do executor: o auditor decide. Erro ao conferir não prende o agente, mas avisa.
export async function decidirExecutor(entrada) {
  if (entrada.hook_event_name === 'PreToolUse' && entrada.tool_name !== 'SubagentHandback') return { codigo: 0 }
  // A pasta do projeto vem antes da pasta atual do agente, que ele pode ter mudado.
  const raiz = process.env.CLAUDE_PROJECT_DIR || entrada.cwd || process.cwd()
  try {
    const auditor = await import(pathToFileURL(path.join(raizDoPlugin, 'auditor', 'auditor.mjs')).href)
    return resposta(entrada, auditor.conferirNoPortao(raiz))
  } catch (erro) {
    return resposta(entrada, { libera: true, mensagem: `Portão anti-vibe: não deu para rodar o auditor (${erro.message}).` })
  }
}

export function palavraPasse(idDoAgente) {
  const hash = crypto.createHash('sha256').update(String(idDoAgente || 'sem-id')).digest('hex')
  return `PORTAO-${hash.slice(0, 6).toUpperCase()}`
}

function pedido(palavra) {
  return (
    `Portão anti-vibe: antes de encerrar, repita o relato e inclua nele a linha ` +
    `"palavra-passe: ${palavra}". Ela prova que o portão de conclusão funcionou.`
  )
}

// Decide sem efeitos colaterais. `jaBarrou` diz se o portão já barrou este agente antes
// (só importa no caminho do SubagentHandback, que não tem `stop_hook_active`).
// Devolve { codigo, stderr?, stdout? }.
export function decidir(entrada, jaBarrou = false) {
  if (!entrada || entrada.agent_type !== AGENTE_DIAGNOSTICO) return { codigo: 0 }
  const palavra = palavraPasse(entrada.agent_id)

  if (entrada.hook_event_name === 'PreToolUse') {
    if (entrada.tool_name !== 'SubagentHandback') return { codigo: 0 }
    if (String(entrada.tool_input?.message || '').includes(palavra)) return { codigo: 0 }
    if (jaBarrou) return { codigo: 0 }
    return {
      codigo: 0,
      barrou: true,
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: pedido(palavra),
        },
      }),
    }
  }

  // SubagentStop
  if (entrada.stop_hook_active) return { codigo: 0 }
  if (String(entrada.last_assistant_message || '').includes(palavra)) return { codigo: 0 }
  return { codigo: 2, stderr: pedido(palavra) }
}

// Marca, fora da pasta do plugin, que o portão já barrou este agente no caminho do
// SubagentHandback, para liberar na tentativa seguinte.
function marcaDe(idDoAgente) {
  const nome = crypto.createHash('sha256').update(String(idDoAgente || 'sem-id')).digest('hex').slice(0, 16)
  return path.join(os.tmpdir(), `anti-vibe-portao-${nome}`)
}

function lerEntrada() {
  return new Promise((resolve) => {
    let dados = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (pedaco) => (dados += pedaco))
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(dados || '{}'))
      } catch {
        resolve({})
      }
    })
  })
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
  const entrada = await lerEntrada()
  let decisao
  if (entrada.agent_type === AGENTE_EXECUTOR) {
    decisao = await decidirExecutor(entrada)
  } else {
    const marca = marcaDe(entrada.agent_id)
    decisao = decidir(entrada, fs.existsSync(marca))
    if (decisao.barrou) {
      try {
        fs.writeFileSync(marca, '')
      } catch {
        // sem marca, o pior caso é barrar de novo; o agente já tem a palavra-passe
      }
    }
  }
  if (decisao.stdout) process.stdout.write(decisao.stdout + '\n')
  if (decisao.stderr) process.stderr.write(decisao.stderr + '\n')
  process.exitCode = decisao.codigo
}
