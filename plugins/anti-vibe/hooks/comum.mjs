// Peças comuns aos ganchos do anti-vibe que leem a entrada do Claude Code.
import fs from 'node:fs'
import path from 'node:path'
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

// Raiz do projeto do fluxo. Na nuvem, a sessão pode começar na pasta acima do
// repositório (ex.: a pasta home do usuário, com o código numa subpasta dela). Então:
// 1. sobe a partir de `partida` (arquivo editado ou pasta atual do agente) até achar
//    uma pasta com .claude/auditor.json, sem sair de `base`;
// 2. se não achou e `base` não tem .claude/auditor.json, usa a única subpasta direta
//    de `base` que tiver um;
// 3. senão, fica com `base`.
export function raizDoProjeto(base, partida) {
  const temConfig = (pasta) => fs.existsSync(path.join(pasta, '.claude', 'auditor.json'))
  const baseAbs = path.resolve(base)
  if (partida) {
    let atual = path.resolve(baseAbs, partida)
    if (!fs.existsSync(atual) || !fs.statSync(atual).isDirectory()) atual = path.dirname(atual)
    while (true) {
      const rel = path.relative(baseAbs, atual)
      if (rel.startsWith('..') || path.isAbsolute(rel)) break
      if (temConfig(atual)) return atual
      if (rel === '') break
      atual = path.dirname(atual)
    }
  }
  if (temConfig(baseAbs)) return baseAbs
  try {
    const candidatas = fs
      .readdirSync(baseAbs, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => path.join(baseAbs, d.name))
      .filter(temConfig)
    if (candidatas.length === 1) return candidatas[0]
  } catch {}
  return baseAbs
}
