import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CADERNO = path.join(RAIZ, 'caderno')

function git(...args) {
  const r = spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8' })
  return { status: r.status, saida: (r.stdout || '').trim() }
}

// Arquivos que o repositório público versiona ou vai versionar (rastreados + novos não
// ignorados), para o teste valer antes e depois do commit.
function arquivosDoPublico() {
  return git('ls-files', '--cached', '--others', '--exclude-standard').saida.split('\n').filter(Boolean)
}

function sha256(texto) {
  return crypto.createHash('sha256').update(texto).digest('hex')
}

function normalizar(texto) {
  return texto.replace(/\r\n/g, '\n').trim()
}

function todosOsArquivos(pasta) {
  if (!fs.existsSync(pasta)) return []
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    if (e.name === '.git' || e.name === 'node_modules') return []
    const caminho = path.join(pasta, e.name)
    return e.isDirectory() ? todosOsArquivos(caminho) : [caminho]
  })
}

// Termos que só existem no CRM e nomes de outras pessoas do projeto, guardados só pelo
// hash: assim nem este teste publica as palavras que proíbe. Ordem: o nome do sistema
// de tarefas, o banco, a coluna de isolamento, o nome da outra pessoa, o repositório do
// CRM e o comando de limpeza do banco.
const HASHES_PROIBIDOS = new Set([
  'c0d67255424148d869b8c00b4e7c27645b97147e36aaf9538a661a3d87883098',
  '4d7594e57f7d03f35ede2d316cda4cdb7df66b28963738e836a2f16d9fc9eb4d',
  '98608ef93fc8ae9aeae45f80e214cfab75b37fb38538b7e4d08ad3e90df5f77e',
  '22783f0252bcaaefacf263eacb5ec3603e66b4ce318cdcae0e3db9e624e3b014',
  '38617b6df033561e1b3d6486680c2b399bd2f2afbc602aac271778da285f346c',
  'd354bbdc0becc39d056816bfcfd93ec9e3bb3e1f7087c9049d3cce25018fe058',
])

// Palavras do texto, em minúsculas; palavras com hífen entram inteiras, por parte e em
// pares vizinhos, para casar termos como "a-b" dentro de "a-b-c".
function palavras(texto) {
  const saida = new Set()
  for (const bruta of texto.toLowerCase().match(/[a-z0-9_]+(?:-[a-z0-9_]+)*/g) || []) {
    const partes = bruta.split('-')
    saida.add(bruta)
    partes.forEach((p, i) => {
      saida.add(p)
      if (i > 0) saida.add(`${partes[i - 1]}-${p}`)
    })
  }
  return saida
}

// Documentos de desenvolvimento do caderno: arquivos inteiros e linhas longas, para
// pegar cópia renomeada ou trecho colado.
const PASTAS_DE_DOCUMENTOS = ['pre-desenvolvimento', 'reports', 'research_notes', path.join('docs', 'specs-arquivadas')]
// A versão de abril do fluxo, arquivada, é a origem das skills do plugin (SUP-P1-03 e
// SUP-P1-85): é o próprio método, não documento de desenvolvimento.
const VERSAO_DE_ABRIL = ['2026-04-09-workflow-anti-vibe-design.md', '2026-04-09-workflow-anti-vibe.md']
function documentosDoCaderno() {
  const arquivos = PASTAS_DE_DOCUMENTOS.flatMap((p) => todosOsArquivos(path.join(CADERNO, p)))
    .filter((a) => !(a.includes(`${path.sep}specs-arquivadas${path.sep}`) && VERSAO_DE_ABRIL.includes(path.basename(a))))
    // O README e o CLAUDE.md da raiz do caderno também são documentos dele.
    .concat(['README.md', 'CLAUDE.md'].map((d) => path.join(CADERNO, d)).filter((a) => fs.existsSync(a)))
  const hashes = new Set()
  const linhas = new Set()
  for (const a of arquivos) {
    const texto = normalizar(fs.readFileSync(a, 'utf8'))
    hashes.add(sha256(texto))
    for (const l of texto.split('\n')) if (l.trim().length >= 60) linhas.add(l.trim())
  }
  return { quantos: arquivos.length, hashes, linhas }
}

describe('P1-13 — Repositório público principal e caderno privado', () => {
  it('CA-P1-50: nenhum arquivo do repositório público é documento de desenvolvimento nem cita termos do CRM ou nomes de outras pessoas', () => {
    const arquivos = arquivosDoPublico()
    expect(arquivos.length).toBeGreaterThan(0)

    // Pelo caminho.
    const porCaminho = arquivos.filter((a) =>
      [
        /(^|\/)pre-desenvolvimento\//,
        /(^|\/)issues\//,
        /(^|\/)spec-[^/]*\.md$/,
        /(^|\/)licoes\.md$/,
        /(^|\/)reports\//,
        /(^|\/)research_notes\//,
        /(^|\/)docs\/specs-arquivadas\//,
      ].some((re) => re.test(a)),
    )
    expect(porCaminho).toEqual([])

    // Pelo conteúdo: cópia inteira, trecho colado ou código desta série fora dos testes.
    const docs = documentosDoCaderno()
    expect(docs.quantos, 'o caderno precisa estar em caderno/ para a prova').toBeGreaterThan(0)
    const porConteudo = []
    for (const a of arquivos) {
      const texto = normalizar(fs.readFileSync(path.join(RAIZ, a), 'utf8'))
      if (docs.hashes.has(sha256(texto))) porConteudo.push(`${a}: cópia de documento do caderno`)
      const colada = texto.split('\n').find((l) => docs.linhas.has(l.trim()))
      if (colada) porConteudo.push(`${a}: trecho de documento do caderno: "${colada.trim().slice(0, 60)}…"`)
      if (!a.startsWith('testes/') && /\b(CA|SUP|PER)-P1-\d{2}\b/.test(texto)) porConteudo.push(`${a}: código de rastreio da série P1`)
    }
    expect(porConteudo).toEqual([])

    // Termos do CRM e nomes de outras pessoas, em qualquer arquivo, inclusive este.
    const citacoes = arquivos.filter((a) => [...palavras(fs.readFileSync(path.join(RAIZ, a), 'utf8'))].some((p) => HASHES_PROIBIDOS.has(sha256(p))))
    expect(citacoes).toEqual([])
  })

  it('CA-P1-51: o git do repositório público ignora o caderno e não versiona nada dele', () => {
    expect(fs.existsSync(CADERNO), 'a pasta caderno/ precisa existir para a prova').toBe(true)
    expect(git('check-ignore', '-q', 'caderno/').status).toBe(0)
    expect(arquivosDoPublico().filter((a) => a.startsWith('caderno/'))).toEqual([])
    expect(git('ls-files', '--cached', '--', 'caderno').saida).toBe('')
  })

  it('CA-P1-52: a licença é MIT em nome da Marcelle e o manifesto declara MIT', () => {
    const licenca = fs.readFileSync(path.join(RAIZ, 'LICENSE'), 'utf8')
    expect(licenca).toMatch(/^MIT License/)
    expect(licenca).toMatch(/Copyright \(c\) \d{4} Marcelle Mesquita/)
    expect(licenca).toContain('Permission is hereby granted, free of charge')

    const manifesto = JSON.parse(fs.readFileSync(path.join(RAIZ, 'plugins', 'anti-vibe', '.claude-plugin', 'plugin.json'), 'utf8'))
    expect(manifesto.license).toBe('MIT')
  })
})
