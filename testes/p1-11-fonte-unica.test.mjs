import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// O caderno privado fica ao lado, em `caderno/`, só no computador de quem desenvolve.
const CADERNO = path.join(RAIZ, 'caderno')

const COMANDOS_DE_ABRIL = ['spec.md', 'break.md', 'plan.md', 'execute.md']

// Restos do fluxo de abril numa pasta: [caminhos achados].
function restosDeAbril(raiz) {
  const achados = []
  for (const c of COMANDOS_DE_ABRIL) {
    const caminho = path.join('.claude', 'commands', c)
    if (fs.existsSync(path.join(raiz, caminho))) achados.push(caminho)
  }
  for (const pasta of ['references', 'issues']) if (fs.existsSync(path.join(raiz, pasta))) achados.push(`${pasta}/`)
  if (fs.existsSync(path.join(raiz, 'docs', 'superpowers'))) achados.push('docs/superpowers/')
  return achados
}

function secoes(texto) {
  return texto.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim())
}

function secao(texto, titulo) {
  return (texto.split(`\n## ${titulo}\n`)[1] || '').split('\n## ')[0]
}

describe('P1-11 — Repositório como fonte única', () => {
  it('CA-P1-44: não sobra cópia antiga do fluxo no público nem no caderno, e a spec e o plano de abril estão arquivados no caderno', () => {
    expect(restosDeAbril(RAIZ)).toEqual([])

    if (!fs.existsSync(CADERNO)) {
      // Clone só do público: o caderno é privado e não está aqui (SUP-P1-83).
      console.warn('CA-P1-44: pasta caderno/ ausente; a parte do caderno não foi conferida')
      return
    }
    expect(restosDeAbril(CADERNO)).toEqual([])
    const arquivadas = fs.readdirSync(path.join(CADERNO, 'docs', 'specs-arquivadas'))
    expect(arquivadas).toContain('2026-04-09-workflow-anti-vibe-design.md')
    expect(arquivadas).toContain('2026-04-09-workflow-anti-vibe.md')
    // O README e o CLAUDE.md da raiz do caderno não são mais os de abril.
    for (const doc of ['README.md', 'CLAUDE.md']) {
      const texto = fs.readFileSync(path.join(CADERNO, doc), 'utf8')
      expect(texto, doc).not.toMatch(/references\/|spec → break → plan → execute|Workflow Anti-Vibe Coding/)
    }
  })

  it('CA-P1-45: o README ensina a instalar no computador, ligar num Project, atualizar, testar sem instalar e validar, e cita a licença MIT', () => {
    const readme = fs.readFileSync(path.join(RAIZ, 'README.md'), 'utf8').replace(/\r\n/g, '\n')
    const titulos = secoes(readme)
    for (const t of ['Instalar no computador', 'Ligar num Project da nuvem', 'Atualizar', 'Desenvolver o plugin', 'Licença']) {
      expect(titulos, `seção ${t}`).toContain(t)
    }
    expect(secao(readme, 'Instalar no computador')).toContain('claude plugin marketplace add marcellemesquita-glitch/anti-vibe')
    expect(secao(readme, 'Instalar no computador')).toContain('claude plugin install anti-vibe@fabrica-anti-vibe')
    // Dentro da sessão: adicionar o marketplace e instalar pelo nome com @marketplace.
    expect(secao(readme, 'Instalar no computador')).toContain('/plugin marketplace add marcellemesquita-glitch/anti-vibe\n/plugin install anti-vibe@fabrica-anti-vibe')
    expect(secao(readme, 'Instalar no computador')).not.toContain('--marketplace')
    expect(secao(readme, 'Ligar num Project da nuvem')).toMatch(/Adicionar marketplace → Adicionar de um\s+repositório/)
    expect(secao(readme, 'Atualizar')).toContain('claude plugin marketplace update fabrica-anti-vibe')
    expect(secao(readme, 'Atualizar')).toContain('claude plugin update anti-vibe@fabrica-anti-vibe')
    const desenvolver = secao(readme, 'Desenvolver o plugin')
    expect(desenvolver).toMatch(/claude --plugin-dir [^\n]*\/plugins\/anti-vibe\n/)
    expect(desenvolver).toContain('claude plugin validate --strict plugins/anti-vibe')
    expect(desenvolver).toContain('claude plugin validate --strict .')
    expect(desenvolver).toContain('npx vitest run')
    expect(secao(readme, 'Licença')).toContain('[MIT](LICENSE)')
    expect(fs.readFileSync(path.join(RAIZ, 'LICENSE'), 'utf8')).toMatch(/^MIT License/)
  })
})
