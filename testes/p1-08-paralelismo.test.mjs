import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN = path.join(RAIZ, 'plugins', 'anti-vibe')
const AUDITOR = path.join(PLUGIN, 'auditor', 'auditor.mjs')
const WORKFLOW = path.join(PLUGIN, 'workflows', 'esteira.js')

const criados = []
afterAll(() => {
  for (const raiz of criados) {
    try {
      fs.rmSync(raiz, { recursive: true, force: true })
    } catch {}
  }
})

function issue(id, { arquivos = [], dependeDe = 'nenhuma' } = {}) {
  return [
    `# ${id}: Entrega ${id}`,
    '',
    `**Depende de:** ${dependeDe}`,
    '**Risco:** não',
    '',
    '## Critérios de aceite',
    '',
    `- **CA-${id}** (automática) — critério.`,
    '',
    '## Suposições',
    '',
    'Nenhuma.',
    '',
    '## Perguntas em aberto',
    '',
    'Nenhuma.',
    '',
    ...(arquivos.length ? ['## Arquivos', '', ...arquivos.map((a) => `- **Modificar:** \`${a}\``), ''] : []),
  ].join('\n')
}

function lotes(issues) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'anti-vibe-p1-08-'))
  criados.push(raiz)
  for (const [id, opcoes] of Object.entries(issues)) {
    const destino = path.join(raiz, 'pre-desenvolvimento', 'issues', `${id}-exemplo.md`)
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    fs.writeFileSync(destino, issue(id, opcoes))
  }
  const r = spawnSync(process.execPath, [AUDITOR, 'esteira-lista', 'S1', '--linha'], { cwd: raiz, encoding: 'utf8' })
  return JSON.parse(r.stdout).lotes
}

describe('P1-08 — Paralelismo para issues independentes', () => {
  it('CA-P1-34: a esteira junta só as issues independentes de arquivos disjuntos; a que mexe num arquivo de outra espera', async () => {
    // Duas independentes de arquivos disjuntos e uma terceira que mexe num arquivo da primeira.
    expect(
      lotes({
        'S1-01': { arquivos: ['src/a.mjs'] },
        'S1-02': { arquivos: ['src/b.mjs'] },
        'S1-03': { arquivos: ['src/a.mjs', 'src/c.mjs'] },
      })
    ).toEqual([['S1-01', 'S1-02'], ['S1-03']])

    // A dependente só entra depois da dependência, mesmo com arquivos disjuntos.
    expect(
      lotes({
        'S1-01': { arquivos: ['src/a.mjs'] },
        'S1-02': { arquivos: ['src/b.mjs'], dependeDe: 'S1-01' },
        'S1-03': { arquivos: ['src/c.mjs'] },
      })
    ).toEqual([['S1-01', 'S1-03'], ['S1-02']])

    // Feita a dependência, as duas que esperavam por ela rodam juntas.
    expect(
      lotes({
        'S1-01': { arquivos: ['src/a.mjs'] },
        'S1-02': { arquivos: ['src/b.mjs'], dependeDe: 'S1-01' },
        'S1-03': { arquivos: ['src/c.mjs'], dependeDe: 'S1-01' },
      })
    ).toEqual([['S1-01'], ['S1-02', 'S1-03']])

    // Issue sem Arquivos (o plan ainda não confirmou) fica sozinha; dependência de fora do alvo conta como feita.
    expect(
      lotes({
        'S1-01': { arquivos: ['src/a.mjs'], dependeDe: 'S0-04' },
        'S1-02': {},
        'S1-03': { arquivos: ['src/c.mjs'] },
      })
    ).toEqual([['S1-01', 'S1-03'], ['S1-02']])

    // Issue sem Arquivos abrindo o grupo também fica sozinha.
    expect(
      lotes({
        'S1-01': {},
        'S1-02': { arquivos: ['src/b.mjs'] },
        'S1-03': { arquivos: ['src/c.mjs'] },
      })
    ).toEqual([['S1-01'], ['S1-02', 'S1-03']])

    // O campo Depende de: vale só antes do parêntese; códigos de critério não contam;
    // S1-1 é a S1-01; e ./src/a.mjs é o mesmo arquivo que src/a.mjs.
    expect(
      lotes({
        'S1-01': { arquivos: ['src/a.mjs'] },
        'S1-02': { arquivos: ['src/b.mjs'], dependeDe: 'S1-1 (independente de S1-04)' },
        'S1-03': { arquivos: ['src/c.mjs'], dependeDe: 'nenhuma, ver CA-S1-01' },
        'S1-04': { arquivos: ['./src/a.mjs'] },
      })
    ).toEqual([['S1-01', 'S1-03'], ['S1-02', 'S1-04']])

    // Dependência da mesma série que não existe na lista não conta como feita.
    expect(
      lotes({
        'S1-01': { arquivos: ['src/a.mjs'], dependeDe: 'S1-09' },
        'S1-02': { arquivos: ['src/b.mjs'] },
      })
    ).toEqual([['S1-02'], ['S1-01']])

    // Dependência em círculo: uma por vez, no fim, sem travar.
    expect(
      lotes({
        'S1-01': { arquivos: ['src/a.mjs'], dependeDe: 'S1-02' },
        'S1-02': { arquivos: ['src/b.mjs'], dependeDe: 'S1-01' },
      })
    ).toEqual([['S1-01'], ['S1-02']])

    // A esteira traz os grupos no resumo.
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    const corpo = fs.readFileSync(WORKFLOW, 'utf8').replace('export const meta =', 'const meta =')
    const lista = { serie: 'S1', pastaIssues: 'p/issues', pastaSpecs: 'p', issues: [], lotes: [['S1-01', 'S1-02'], ['S1-03']] }
    lista.issues = ['S1-01', 'S1-02', 'S1-03'].map((id) => ({ id, caminho: `p/issues/${id}.md`, titulo: id, serie: 'S1', risco: false, automaticos: 0, arquivos: [], suposicoesAbertas: [], perguntasAbertas: [], concluida: true, commitada: false, dependeDe: [] }))
    const agent = async (pedido, { label }) => (['descoberta', 'lista'].includes(label) ? { codigo: 0, saida: JSON.stringify(lista) } : { codigo: 0, saida: '' })
    const resumo = await new AsyncFunction('agent', 'phase', 'log', 'args', corpo)(agent, () => {}, () => {}, { alvo: 'S1', raizDoPlugin: '/p' })
    expect(resumo.podemRodarJuntas).toEqual([['S1-01', 'S1-02']])
  })
})
