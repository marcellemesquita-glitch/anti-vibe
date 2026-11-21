import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN = path.join(RAIZ, 'plugins', 'anti-vibe')

// No Windows o `claude` instalado pelo npm é um .cmd, que só roda por shell.
function validar(alvo) {
  return spawnSync(`claude plugin validate --strict "${alvo}"`, { cwd: RAIZ, encoding: 'utf8', shell: true })
}

function arquivosDe(pasta) {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const caminho = path.join(pasta, e.name)
    return e.isDirectory() ? arquivosDe(caminho) : [path.relative(PLUGIN, caminho).split(path.sep).join('/')]
  })
}

function todosOsArquivos(pasta) {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules') return []
    const caminho = path.join(pasta, e.name)
    return e.isDirectory() ? todosOsArquivos(caminho) : [caminho]
  })
}

function hashDe(arquivo) {
  const texto = fs.readFileSync(arquivo, 'utf8').replace(/\r\n/g, '\n').trim()
  return crypto.createHash('sha256').update(texto).digest('hex')
}

function lerJson(...partes) {
  return JSON.parse(fs.readFileSync(path.join(RAIZ, ...partes), 'utf8'))
}

describe('P1-01 — Esqueleto do plugin instalado no computador e na nuvem', () => {
  it('CA-P1-01: a validação oficial em modo estrito aprova o marketplace e o plugin', () => {
    for (const alvo of ['.', 'plugins/anti-vibe']) {
      const r = validar(alvo)
      expect(r.status, `${alvo}\n${r.stdout}\n${r.stderr}`).toBe(0)
      expect(r.stdout).toContain('Validation passed')
    }
  }, 60_000)

  it('CA-P1-02: o plugin não leva specs, issues, relatórios, notas, testes nem configuração de desenvolvimento', () => {
    const arquivos = arquivosDe(PLUGIN)
    expect(arquivos.length).toBeGreaterThan(0)
    const proibidos = [
      /(^|\/)pre-desenvolvimento\//,
      /(^|\/)issues\//,
      /(^|\/)spec-[^/]*\.md$/,
      /(^|\/)reports\//,
      /(^|\/)research_notes\//,
      /(^|\/)testes\//,
      /\.test\.[cm]?[jt]sx?$/,
      /\.spec\.[cm]?[jt]sx?$/,
      /(^|\/)node_modules\//,
      /(^|\/)package(-lock)?\.json$/,
      /(^|\/)\.claude\//,
      /(^|\/)licoes\.md$/,
    ]
    const intrusos = arquivos.filter((a) => proibidos.some((re) => re.test(a)))
    expect(intrusos).toEqual([])

    // Também pelo conteúdo: nenhum arquivo do plugin pode ser cópia de um documento de
    // trabalho deste repositório, onde quer que tenha sido colocado dentro do plugin.
    const pastasDeTrabalho = ['caderno', 'pre-desenvolvimento', 'reports', 'research_notes', 'testes', 'docs', '.claude']
      .map((p) => path.join(RAIZ, p))
      .filter((p) => fs.existsSync(p))
    const arquivosDeTrabalho = [
      ...pastasDeTrabalho.flatMap((p) => todosOsArquivos(p)),
      ...['package.json', 'package-lock.json', 'README.md', 'CLAUDE.md'].map((a) => path.join(RAIZ, a)).filter((a) => fs.existsSync(a)),
    ]
    expect(arquivosDeTrabalho.length).toBeGreaterThan(0)
    const hashesDeTrabalho = new Map(arquivosDeTrabalho.map((a) => [hashDe(a), path.relative(RAIZ, a)]))
    const copias = todosOsArquivos(PLUGIN)
      .filter((a) => hashesDeTrabalho.has(hashDe(a)))
      .map((a) => `${path.relative(RAIZ, a)} = ${hashesDeTrabalho.get(hashDe(a))}`)
    expect(copias).toEqual([])
  })

  it('CA-P1-03: o manifesto tem nome anti-vibe, versão explícita, descrição e autoria, sem versão repetida no catálogo', () => {
    const manifesto = lerJson('plugins', 'anti-vibe', '.claude-plugin', 'plugin.json')
    expect(manifesto.name).toBe('anti-vibe')
    expect(manifesto.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(String(manifesto.description || '').length).toBeGreaterThan(0)
    expect(String(manifesto.author?.name || '').length).toBeGreaterThan(0)

    const catalogo = lerJson('.claude-plugin', 'marketplace.json')
    const entrada = catalogo.plugins.find((p) => p.name === 'anti-vibe')
    expect(entrada).toBeDefined()
    expect(entrada.version).toBeUndefined()
  })
})
