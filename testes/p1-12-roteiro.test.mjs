import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN = path.join(RAIZ, 'plugins', 'anti-vibe')
// O roteiro mora no caderno privado, que fica ao lado só no computador de quem desenvolve.
const ROTEIRO = path.join(RAIZ, 'caderno', 'docs', 'roteiro-de-troca.md')

const QUE_SAEM = ['break', 'execute', 'novo-projeto', 'plan', 'spec', 'triagem', 'auditor', 'issue', 'revisildo', 'testes', 'feature-flow']

function ler(caminho) {
  return fs.readFileSync(caminho, 'utf8').replace(/\r\n/g, '\n')
}

// Nomes das skills do plugin (campo name do frontmatter) e dos agentes.
function skillsDoPlugin() {
  return fs.readdirSync(path.join(PLUGIN, 'skills')).map((d) => /^name:\s*(\S+)/m.exec(ler(path.join(PLUGIN, 'skills', d, 'SKILL.md')))[1])
}
function agentesDoPlugin() {
  return fs.readdirSync(path.join(PLUGIN, 'agents')).map((a) => a.replace(/\.md$/, ''))
}

// Seções do roteiro (títulos ## e ###) com o texto de cada uma.
function secoes(texto) {
  const partes = texto.split(/\n(?=#{2,3} )/)
  return partes.filter((p) => /^#{2,3} /.test(p)).map((p) => ({ titulo: p.split('\n')[0], corpo: p }))
}

// Nomes que um comando de um passo cita, de commands/<nome>.md e skills/<nome>.
function nomesNoComando(corpo, comando) {
  const linhas = corpo.split('\n').filter((l) => new RegExp(`^(${comando})\\b`).test(l.trim()))
  return new Set(linhas.flatMap((l) => [...l.matchAll(/(?:commands\/([\w-]+)\.md|skills\/([\w-]+))/g)].map((m) => m[1] || m[2])))
}

describe('P1-12 — Roteiro de troca das cópias da pasta pessoal', () => {
  it('CA-P1-46: o roteiro cita cada arquivo que sai da pasta pessoal, com o destino de cada um', () => {
    if (!fs.existsSync(ROTEIRO)) {
      // Clone só do público: o caderno é privado e não está aqui (SUP-P1-90).
      console.warn('CA-P1-46: caderno/docs/roteiro-de-troca.md ausente; o roteiro não foi conferido')
      return
    }
    const texto = ler(ROTEIRO)
    const skills = skillsDoPlugin()
    const agentes = agentesDoPlugin()

    // Tabela "Na pasta pessoal | Destino": uma linha por item que sai, com destino que existe no plugin.
    const tabela = texto.split('## O que sai e para onde vai')[1].split('\n## ')[0]
    const linhas = tabela.split('\n').filter((l) => /^\| `/.test(l))
    for (const nome of QUE_SAEM) {
      const linha = linhas.find((l) => {
        const origem = l.split('|')[1]
        return origem.includes(`commands/${nome}.md`) || origem.includes(`skills/${nome}/`)
      })
      expect(linha, `falta ${nome} na tabela do que sai`).toBeDefined()
      const destino = linha.split('|')[2]
      const citadas = [...destino.matchAll(/\/anti-vibe:([\w-]+)/g)].map((m) => m[1])
      expect(citadas.length, `destino de ${nome} sem skill do plugin`).toBeGreaterThan(0)
      for (const s of citadas) expect(skills, `skill /anti-vibe:${s} citada para ${nome}`).toContain(s)
      for (const [, a] of destino.matchAll(/(?<!\/)anti-vibe:([\w-]+)/g)) expect(agentes, `agente anti-vibe:${a} citado para ${nome}`).toContain(a)
    }
    expect(linhas.some((l) => l.split('|')[1].includes('CLAUDE.md') && l.split('|')[2].trim().length > 10)).toBe(true)

    // Os passos: instalar, cópia de segurança, remover, enxugar o CLAUDE.md e voltar atrás.
    const todas = secoes(texto)
    const passo = (nome) => todas.find((s) => s.titulo.includes(nome))
    for (const p of ['Instalar o plugin', 'Cópia de segurança', 'Remover as cópias antigas', 'Enxugar o CLAUDE.md global', 'Voltar atrás']) {
      expect(passo(p), `passo ${p}`).toBeDefined()
    }
    // Todo passo com comando que mexe em algo pede o sim (🔒).
    for (const s of todas) {
      const blocos = [...s.corpo.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n')
      const mexe = /^(rm|cp|mv|mkdir)\b|^claude plugin (install|uninstall|marketplace update)|^\/anti-vibe:novo-projeto|>\s*\S/m.test(blocos)
      if (mexe) expect(s.corpo.includes('🔒'), `"${s.titulo}" mexe em algo sem 🔒`).toBe(true)
    }

    // A cópia de segurança, a remoção e a tabela citam exatamente os mesmos itens.
    const tabelaNomes = new Set(QUE_SAEM)
    expect(nomesNoComando(passo('Cópia de segurança').corpo, 'cp')).toEqual(tabelaNomes)
    expect(nomesNoComando(passo('Remover as cópias antigas').corpo, 'rm')).toEqual(tabelaNomes)
    expect(passo('Remover as cópias antigas').corpo).not.toMatch(/\*/)
    expect(passo('Cópia de segurança').corpo).toMatch(/cp CLAUDE\.md "\$destino\/"/)
    expect(passo('Cópia de segurança').corpo).toContain('tem que dar 15')

    // A cópia de segurança fica fora da pasta pessoal.
    const destino = /^destino="([^"]+)"/m.exec(passo('Cópia de segurança').corpo)[1]
    expect(destino.startsWith('/c/Users/marce/Documents/')).toBe(true)
    expect(destino).not.toContain('.claude')
  })
})
