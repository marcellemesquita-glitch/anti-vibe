// Gancho de início de sessão do anti-vibe.
// Escreve no stdout (vira contexto da sessão) a versão ativa, as regras sempre
// ativas e a instrução de começar pela triagem. Nunca bloqueia a sessão.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raizDoPlugin = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

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

export function textoDaSessao() {
  return [
    `anti-vibe ${versao()} ativo`,
    '',
    'Regras sempre ativas deste fluxo:',
    ...REGRAS.map((r, i) => `${i + 1}. ${r}`),
    '',
    'Toda tarefa começa pela triagem (/anti-vibe:triagem), que decide a marcha: sonda, delimitada ou arquitetural.',
    'O detalhe de cada projeto fica no AGENTS.md da raiz (ou, na falta dele, no CLAUDE.md).',
  ].join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(textoDaSessao() + '\n')
}
