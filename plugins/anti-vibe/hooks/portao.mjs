// Portão de conclusão do anti-vibe (gancho SubagentStop).
// Nesta versão age só sobre o agente de diagnóstico: na primeira tentativa de
// encerrar, barra (saída 2) e entrega uma palavra-passe que só o portão conhece.
// O agente é obrigado a continuar e devolvê-la — é a prova de que o bloqueio
// funciona no ambiente. Na segunda tentativa, libera sempre, para nunca prender
// o agente. A P1-05 liga o auditor aos agentes da esteira neste mesmo portão.
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const AGENTE_DIAGNOSTICO = 'anti-vibe:diagnostico'

export function palavraPasse(idDoAgente) {
  const hash = crypto.createHash('sha256').update(String(idDoAgente || 'sem-id')).digest('hex')
  return `PORTAO-${hash.slice(0, 6).toUpperCase()}`
}

// Recebe a entrada do gancho e devolve { codigo, mensagem }.
export function decidir(entrada) {
  if (!entrada || entrada.agent_type !== AGENTE_DIAGNOSTICO) return { codigo: 0 }
  const palavra = palavraPasse(entrada.agent_id)
  if (entrada.stop_hook_active) return { codigo: 0 }
  if (String(entrada.last_assistant_message || '').includes(palavra)) return { codigo: 0 }
  return {
    codigo: 2,
    mensagem:
      `Portão anti-vibe: antes de encerrar, repita o relato e inclua nele a linha ` +
      `"palavra-passe: ${palavra}". Ela prova que o portão de conclusão funcionou.`,
  }
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
  const { codigo, mensagem } = decidir(await lerEntrada())
  if (mensagem) process.stderr.write(mensagem + '\n')
  process.exit(codigo)
}
