import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN = path.join(RAIZ, 'plugins', 'anti-vibe')
const MODELOS = path.join(PLUGIN, 'modelos')
const AUDITOR = path.join(PLUGIN, 'auditor', 'auditor.mjs')
const APLICAR = path.join(MODELOS, 'aplicar.mjs')

const criados = []
afterAll(() => {
  for (const raiz of criados) {
    try {
      fs.rmSync(raiz, { recursive: true, force: true })
    } catch {}
  }
})

function pasta(arquivos = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'anti-vibe-p1-10-'))
  criados.push(raiz)
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true })
    fs.writeFileSync(path.join(raiz, rel), conteudo)
  }
  return raiz
}

function rodar(script, raiz, ...args) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: raiz, encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout, saida: `${r.stdout}\n${r.stderr}` }
}

function ler(caminho) {
  return fs.readFileSync(caminho, 'utf8').replace(/\r\n/g, '\n')
}

describe('P1-10 — Novo projeto e modelos', () => {
  it('CA-P1-41: os modelos existem e têm as seções esperadas, o CLAUDE.md importa o AGENTS.md, a configuração do auditor é válida e os opcionais existem', async () => {
    const agents = ler(path.join(MODELOS, 'AGENTS.md'))
    const secoes = agents.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim())
    for (const s of ['Regras sempre ativas', 'Arquitetura', 'Fluxo', 'Auditor']) expect(secoes, `seção ${s}`).toContain(s)
    const regras = agents.split('## Regras sempre ativas')[1].split('\n## ')[0]
    expect(regras.match(/^\d\. /gm)).toHaveLength(5)

    const claude = ler(path.join(MODELOS, 'CLAUDE.md'))
    expect(claude.split('\n').map((l) => l.trim())).toContain('@AGENTS.md')

    // A configuração: JSON válido, só com campos que o auditor conhece, iguais ao padrão.
    const config = JSON.parse(ler(path.join(MODELOS, 'auditor.json')))
    const { CONFIG_PADRAO } = await import(pathToFileURL(AUDITOR).href)
    for (const [chave, valor] of Object.entries(config)) {
      expect(Object.keys(CONFIG_PADRAO), `campo ${chave}`).toContain(chave)
      expect(valor, `valor de ${chave}`).toEqual(CONFIG_PADRAO[chave])
    }
    // E o auditor roda com ela, num projeto com a tabela de séries do modelo.
    const projeto = pasta({
      '.claude/auditor.json': ler(path.join(MODELOS, 'auditor.json')),
      'pre-desenvolvimento/issues/README.md': ler(path.join(MODELOS, 'issues-README.md')),
    })
    const r = rodar(AUDITOR, projeto, 'suposicoes')
    expect(r.status, r.saida).toBe(0)
    expect(r.stdout).toContain('Nenhuma suposição ou pergunta em aberto.')
    // Prova de que o auditor lê esse arquivo: no mesmo lugar, um JSON quebrado o derruba.
    const quebrado = pasta({ '.claude/auditor.json': '{ quebrado' })
    expect(rodar(AUDITOR, quebrado, 'suposicoes').status).not.toBe(0)

    // Os opcionais existem, e as regras de exemplo são lidas pelo auditor.
    expect(ler(path.join(MODELOS, 'opcionais', 'git.md'))).toMatch(/^## Git/)
    escrever(projeto, '.claude/auditor-regras.json', ler(path.join(MODELOS, 'opcionais', 'auditor-regras.json')))
    const lidas = rodar(AUDITOR, projeto, 'regras').stdout
    expect(lidas).toContain('arquivo-gerado')
    expect(lidas).toContain('componente-pronto')
    expect(lidas).toContain('segredo-no-frontend')
  })

  it('o script dos modelos prepara uma pasta vazia e o auditor roda sem erro', () => {
    const raiz = pasta()
    const r = rodar(APLICAR, raiz)
    expect(r.status, r.saida).toBe(0)
    for (const a of ['AGENTS.md', 'CLAUDE.md', '.claude/auditor.json', 'pre-desenvolvimento/issues/README.md']) {
      expect(fs.existsSync(path.join(raiz, a)), a).toBe(true)
      expect(r.stdout).toContain(`criado: ${a}`)
    }
    expect(fs.existsSync(path.join(raiz, '.claude', 'auditor-regras.json'))).toBe(false)
    expect(ler(path.join(raiz, 'AGENTS.md'))).not.toContain('## Git')
    const suposicoes = rodar(AUDITOR, raiz, 'suposicoes')
    expect(suposicoes.status).toBe(0)
    expect(suposicoes.stdout).toContain('Nenhuma suposição ou pergunta em aberto.')
    expect(JSON.parse(ler(path.join(raiz, '.claude', 'auditor.json')))).toEqual(JSON.parse(ler(path.join(MODELOS, 'auditor.json'))))
  })

  it('o script não sobrescreve nada e diz o que pulou; os opcionais entram só quando pedidos', () => {
    const raiz = pasta({ 'CLAUDE.md': 'meu projeto, minhas regras\n' })
    const r = rodar(APLICAR, raiz, '--git', '--regras')
    expect(r.status, r.saida).toBe(0)
    expect(ler(path.join(raiz, 'CLAUDE.md'))).toBe('meu projeto, minhas regras\n')
    expect(r.stdout).toContain('pulado (já existia, não foi mexido): CLAUDE.md')
    expect(ler(path.join(raiz, 'AGENTS.md'))).toContain('## Git')
    expect(JSON.parse(ler(path.join(raiz, '.claude', 'auditor-regras.json'))).map((x) => x.id)).toEqual(['arquivo-gerado', 'componente-pronto'])

    // Rodar de novo não mexe em nada; com --git e AGENTS.md existente, avisa.
    const antes = ler(path.join(raiz, 'AGENTS.md')) + ler(path.join(raiz, '.claude', 'auditor.json'))
    const deNovo = rodar(APLICAR, raiz, '--git', '--json')
    const json = JSON.parse(deNovo.stdout)
    expect(json.criados).toEqual([])
    expect(json.pulados.sort()).toEqual(['.claude/auditor.json', 'AGENTS.md', 'CLAUDE.md', 'pre-desenvolvimento/issues/README.md'].sort())
    expect(json.avisos.join(' ')).toContain('acrescente à mão a seção')
    // O CLAUDE.md antigo não importa o AGENTS.md: o script avisa.
    expect(json.avisos.join(' ')).toContain('acrescente nele, à mão, uma linha só com @AGENTS.md')
    // Com --regras e o arquivo já existente, também avisa.
    expect(rodar(APLICAR, raiz, '--regras').stdout).toContain('as regras de exemplo estão em')
    // Com o @AGENTS.md no CLAUDE.md, o aviso some.
    escrever(raiz, 'CLAUDE.md', 'meu projeto\n\n@AGENTS.md\n')
    expect(rodar(APLICAR, raiz).stdout).not.toContain('@AGENTS.md')
    expect(ler(path.join(raiz, 'AGENTS.md')) + ler(path.join(raiz, '.claude', 'auditor.json'))).toBe(antes)
  })

  it('a skill novo-projeto roda o script e o auditor e explica como ligar o plugin na nuvem', () => {
    const original = ler(path.join(PLUGIN, 'skills', 'novo-projeto', 'SKILL.md'))
    expect(original).toMatch(/^---\nname: novo-projeto\n/)
    const skill = original.replace(/\s+/g, ' ')
    expect(skill).toContain('node "${CLAUDE_PLUGIN_ROOT}/modelos/aplicar.mjs"')
    expect(skill).toContain('node "${CLAUDE_PLUGIN_ROOT}/auditor/auditor.mjs" suposicoes')
    expect(skill).toContain('Adicionar marketplace → Adicionar de um repositório')
    expect(skill).toContain('já existia e não foi mexido')
    expect(skill).toContain('faça commit e push dos arquivos criados')
    expect(skill).toContain('não deu para criar')
  })
})

function escrever(raiz, rel, conteudo) {
  fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true })
  fs.writeFileSync(path.join(raiz, rel), conteudo)
}
