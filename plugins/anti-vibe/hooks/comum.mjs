// Peças comuns aos ganchos do anti-vibe que leem a entrada do Claude Code.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

// Entrada do gancho (JSON no stdin); {} se vier vazia ou ilegível.
export function lerEntrada() {
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

// O script de `urlDoModulo` foi chamado direto (e não importado)? Compara o caminho
// real dos dois lados, para funcionar também por atalho.
export function chamadoDireto(urlDoModulo) {
  if (!process.argv[1]) return false
  try {
    return fs.realpathSync.native(process.argv[1]) === fs.realpathSync.native(fileURLToPath(urlDoModulo))
  } catch {
    return false
  }
}
