// Portão de conclusão do anti-vibe.
//
// Um agente pode encerrar de dois jeitos, e o portão vigia os dois:
// - escrevendo a resposta final  → gancho SubagentStop (barra com saída 2);
// - chamando a ferramenta SubagentHandback (o Claude Code usa esse caminho no modo
//   automático de permissões) → gancho PreToolUse (nega a chamada).
//
// Nesta versão o portão age só sobre o agente de diagnóstico: na primeira tentativa de
// encerrar, barra e entrega uma palavra-passe que só o portão conhece. O agente é obrigado
// a continuar e devolvê-la — é a prova de que o bloqueio funciona no ambiente. Na segunda
// tentativa, libera sempre, para nunca prender o agente. A P1-05 liga o auditor aos agentes
// da esteira neste mesmo portão.
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const AGENTE_DIAGNOSTICO = 'anti-vibe:diagnostico'

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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const entrada = await lerEntrada()
  const marca = marcaDe(entrada.agent_id)
  const resposta = decidir(entrada, fs.existsSync(marca))
  if (resposta.barrou) {
    try {
      fs.writeFileSync(marca, '')
    } catch {
      // sem marca, o pior caso é barrar de novo; o agente já tem a palavra-passe
    }
  }
  if (resposta.stdout) process.stdout.write(resposta.stdout + '\n')
  if (resposta.stderr) process.stderr.write(resposta.stderr + '\n')
  process.exit(resposta.codigo)
}
