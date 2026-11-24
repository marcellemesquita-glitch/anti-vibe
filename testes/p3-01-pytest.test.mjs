import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AUDITOR = path.join(RAIZ, 'plugins', 'anti-vibe', 'auditor', 'auditor.mjs')

const criados = []
const atalhos = []

// Projeto de exemplo numa pasta temporária, sem configuração do auditor (vale o padrão).
// `node_modules` é um atalho para o deste repositório, para o Vitest rodar lá dentro.
function criarProjeto(arquivos, { git = false, vitest = false } = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'anti-vibe-p3-01-'))
  criados.push(raiz)
  escrever(raiz, arquivos)
  if (vitest) {
    fs.symlinkSync(path.join(RAIZ, 'node_modules'), path.join(raiz, 'node_modules'), 'junction')
    atalhos.push(path.join(raiz, 'node_modules'))
  }
  if (git) {
    fs.writeFileSync(path.join(raiz, '.gitignore'), 'node_modules\n__pycache__\n')
    rodarGit(raiz, 'init', '-q')
    commitar(raiz)
  }
  return raiz
}

afterAll(() => {
  for (const onde of atalhos) {
    try {
      fs.unlinkSync(onde)
    } catch {}
  }
  for (const raiz of criados) {
    try {
      fs.rmSync(raiz, { recursive: true, force: true })
    } catch {}
  }
})

function escrever(raiz, arquivos) {
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    const destino = path.join(raiz, rel)
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    fs.writeFileSync(destino, conteudo)
  }
}

function rodarGit(raiz, ...args) {
  const r = spawnSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd: raiz, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout
}

function commitar(raiz) {
  rodarGit(raiz, 'add', '-A')
  rodarGit(raiz, '-c', 'user.name=Teste', '-c', 'user.email=teste@exemplo.invalid', 'commit', '-q', '-m', 'base')
}

function conferir(raiz, { rodar = true } = {}) {
  const r = spawnSync(process.execPath, [AUDITOR, 'issue', 'S1-01', '--json', ...(rodar ? [] : ['--sem-rodar'])], {
    cwd: raiz,
    encoding: 'utf8',
  })
  return JSON.parse(r.stdout)
}

// Sem git no projeto de exemplo o escopo não é conferido; o aviso não trava.
const travas = (resultado) => resultado.problemas.filter((p) => p.codigo !== 'ESCOPO_NAO_CONFERIDO')

const doCodigo = (resultado, codigo) => resultado.problemas.filter((p) => p.codigo === codigo)

const SPEC = (criterios) =>
  [
    '# Spec: exemplo',
    '',
    '> série: S1',
    '',
    ...criterios.map((c) => `#### ${c} — critério de exemplo · prova: automática\n`),
    '## Suposições',
    '',
    'Nenhuma.',
    '',
    '## Perguntas em aberto',
    '',
    'Nenhuma.',
    '',
  ].join('\n')

function issue(criterios, arquivos = ['src/app.py']) {
  return [
    '# S1-01: Exemplo',
    '',
    '## Critérios de aceite',
    '',
    ...criterios.map((c) => `- **${c}** (automática) — critério de exemplo.`),
    '',
    '## Suposições',
    '',
    'Nenhuma.',
    '',
    '## Perguntas em aberto',
    '',
    'Nenhuma.',
    '',
    '## Arquivos',
    '',
    ...arquivos.map((a) => `- **Modificar:** \`${a}\``),
    '',
    '## Checklist',
    '',
    '- [x] feito',
    '',
  ].join('\n')
}

function basico(criterios = ['CA-S1-01'], arquivos) {
  return {
    'pre-desenvolvimento/spec-exemplo.md': SPEC(criterios),
    'pre-desenvolvimento/issues/S1-01-exemplo.md': issue(criterios, arquivos),
    'src/app.py': 'def dobro(n):\n    return n * 2\n',
  }
}

const TESTE_PY = (esperado) =>
  [
    'import sys, os',
    "sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))",
    'from app import dobro',
    '',
    '',
    'def test_CA_S1_01_dobra_o_numero():',
    `    assert dobro(2) == ${esperado}`,
    '',
  ].join('\n')

describe('P3-01 — O auditor entende pytest', () => {
  it('CA-P3-01: teste pytest que passa prova o critério, sem nada configurado no projeto', () => {
    const raiz = criarProjeto({ ...basico(), 'tests/test_app.py': TESTE_PY(4) })
    const r = conferir(raiz)
    expect(travas(r)).toEqual([])
    expect(r.veredito).toBe('alinhada')
    // Sem bytecode nem cache do pytest deixados no projeto.
    expect(fs.existsSync(path.join(raiz, 'tests', '__pycache__'))).toBe(false)
    expect(fs.existsSync(path.join(raiz, '.pytest_cache'))).toBe(false)
  }, 60_000)

  it('CA-P3-02: teste pytest que falha deixa o critério sem prova, com o resultado failed', () => {
    const raiz = criarProjeto({ ...basico(), 'tests/test_app.py': TESTE_PY(5) })
    const r = conferir(raiz)
    const semProva = doCodigo(r, 'CRITERIO_SEM_PROVA')
    expect(semProva.map((p) => p.alvo)).toEqual(['CA-S1-01'])
    expect(semProva[0].detalhe).toContain('failed')
    expect(r.veredito).not.toBe('alinhada')
  }, 60_000)

  it('CA-P3-03: teste Python novo pulado, por decorador ou pelo pytestmark do arquivo, é acusado e não prova o critério', () => {
    const raiz = criarProjeto({ ...basico(['CA-S1-01', 'CA-S1-02', 'CA-S1-03']), 'tests/test_app.py': TESTE_PY(4) }, { git: true })
    escrever(raiz, {
      'tests/test_marcados.py': [
        'import pytest',
        'import unittest',
        '',
        '@pytest.mark.skip(reason="depois")',
        'def test_pulado():',
        '    assert True',
        '',
        '@pytest.mark.skipif(True, reason="sempre")',
        'def test_pulado_se():',
        '    assert True',
        '',
        '@pytest.mark.xfail',
        'def test_CA_S1_02_falha_esperada():',
        '    assert False',
        '',
        'class TestGrupo:',
        '    @unittest.skip("depois")',
        '    def test_dentro(self):',
        '        assert True',
        '',
        'def test_normal():',
        '    assert True',
        '',
        '# Teste numa linha só não engole o que vem depois.',
        'def test_numa_linha(): assert True',
        '',
        '@pytest.mark.skipif(',
        '    True,',
        '    reason="em várias linhas",',
        ')',
        '@pytest.mark.parametrize(',
        '    "n",',
        '    [1, 2],',
        ')',
        'def test_decorador_longo(n):',
        '    """Texto que volta',
        'à coluna zero."""',
        '    assert n',
        '',
        'class Cadastro(unittest.TestCase):',
        '    @unittest.skip("depois")',
        '    def test_do_unittest(self):',
        '        assert True',
        '',
        'class TestDesligada:',
        '    __test__ = False',
        '',
        '    def test_desligado(self):',
        '        assert True',
        '',
      ].join('\n'),
      'tests/test_arquivo_pulado.py': ['import pytest', '', 'pytestmark = pytest.mark.skip', '', 'def test_CA_S1_03_escondido():', '    assert True', ''].join(
        '\n'
      ),
      // Mexer no próprio pytest de dentro do arquivo de teste faz qualquer teste passar.
      'tests/test_mexe_no_pytest.py': [
        'import pytest',
        'import _pytest.python',
        '_pytest.python.Function.runtest = lambda self: None',
        'pytest.Function.runtest = lambda self: None',
        "pytest_plugins = ['meu_plugin']",
        '',
        'def test_ok():',
        '    assert True',
        '',
        'test_ok.__code__ = (lambda: None).__code__',
        '',
      ].join('\n'),
      'tests/test_lista_pulada.py':['import pytest', '', 'pytestmark = [', '    pytest.mark.skip,', ']', '', 'def test_na_lista():', '    assert True', ''].join(
        '\n'
      ),
    })
    const r = conferir(raiz)
    const marcados = doCodigo(r, 'TESTE_MARCADO').map((p) => `${p.alvo} | ${p.detalhe.split(' (')[0]}`)
    expect(marcados.sort()).toEqual(
      [
        'tests/test_marcados.py › test_pulado | marcado com skip',
        'tests/test_marcados.py › test_pulado_se | marcado com skipif',
        'tests/test_marcados.py › test_CA-S1-02_falha_esperada | marcado com xfail',
        'tests/test_marcados.py › test_dentro | marcado com skip',
        'tests/test_arquivo_pulado.py › test_CA-S1-03_escondido | marcado com skip',
        'tests/test_marcados.py › test_decorador_longo | marcado com skipif',
        'tests/test_marcados.py › test_do_unittest | marcado com skip',
        'tests/test_marcados.py › test_desligado | marcado com __test__ = False',
        'tests/test_lista_pulada.py › test_na_lista | marcado com skip',
        ...Array(5).fill('tests/test_mexe_no_pytest.py › (preparação) | marcado com mudança no pytest'),
      ].sort()
    )
    expect(doCodigo(r, 'TESTE_MARCADO').every((p) => p.trava)).toBe(true)
    expect(doCodigo(r, 'CRITERIO_SEM_PROVA').map((p) => p.alvo).sort()).toEqual(['CA-S1-02', 'CA-S1-03'])
    // Sem rodar o pytest, a leitura do arquivo já sabe que o teste está pulado.
    const semRodar = doCodigo(conferir(raiz, { rodar: false }), 'CRITERIO_SEM_PROVA')
    expect(semRodar.map((p) => `${p.alvo} | ${p.detalhe.split(' em ')[0]}`).sort()).toEqual(['CA-S1-02 | teste pulado', 'CA-S1-03 | teste pulado'])
  }, 60_000)

  it('CA-P3-04: mexer em conftest.py, pytest.ini ou tox.ini sem a issue listar reprova, nomeando o arquivo', () => {
    const raiz = criarProjeto(
      {
        ...basico(),
        'tests/test_app.py': TESTE_PY(4),
        'conftest.py': '',
        'tests/conftest.py': '',
        'pytest.ini': '[pytest]\n',
        'tox.ini': '[tox]\n',
        '.pytest.ini': '[pytest]\n',
        'pytest.toml': '[pytest]\n',
      },
      { git: true }
    )
    escrever(raiz, {
      'conftest.py': 'def pytest_collection_modifyitems(items):\n    items.clear()\n',
      'tests/conftest.py': 'import pytest\n',
      'pytest.ini': '[pytest]\naddopts = -k nada\n',
      'tox.ini': '[tox]\nskipsdist = true\n',
      '.pytest.ini': '[pytest]\naddopts = -k nada\n',
      'pytest.toml': '[pytest]\naddopts = ["-k", "nada"]\n',
    })
    const config = doCodigo(conferir(raiz, { rodar: false }), 'CONFIG_DE_TESTE_ALTERADA')
    expect(config.map((p) => p.alvo).sort()).toEqual(['.pytest.ini', 'conftest.py', 'pytest.ini', 'pytest.toml', 'tests/conftest.py', 'tox.ini'])
    expect(config.every((p) => p.trava)).toBe(true)
  }, 60_000)

  it('CA-P3-05: alterar o corpo de um teste Python que já existia reprova, nomeando o teste; teste novo e reindentação não', () => {
    const base = [
      'class TestCadastro:',
      '    def test_recusa(self):',
      '        assert 1 == 1',
      '',
      '    def test_aceita(self):',
      '        assert 2 == 2',
      '',
      '',
      'def test_com_texto():',
      '    """Texto que volta',
      'à coluna zero."""',
      '    assert 3 == 3',
      '',
    ].join('\n')
    const raiz = criarProjeto({ ...basico(), 'tests/test_app.py': TESTE_PY(4), 'tests/test_x.py': base }, { git: true })

    escrever(raiz, { 'tests/test_x.py': base.replace('class TestCadastro:\n', 'class TestCadastro:\n    def test_CA_S1_01_novo(self):\n        assert 3 == 3\n\n') })
    expect(doCodigo(conferir(raiz, { rodar: false }), 'TESTE_ALTERADO')).toEqual([])

    // Reindentar (tabulação em vez de espaços) sem mudar o conteúdo não é alterar.
    escrever(raiz, { 'tests/test_x.py': base.replace(/^ {8}/gm, '\t\t').replace(/^ {4}/gm, '\t') })
    expect(doCodigo(conferir(raiz, { rodar: false }), 'TESTE_ALTERADO')).toEqual([])

    escrever(raiz, { 'tests/test_x.py': base.replace('assert 2 == 2', 'assert True') })
    const alterados = doCodigo(conferir(raiz, { rodar: false }), 'TESTE_ALTERADO')
    expect(alterados.map((p) => p.alvo)).toEqual(['tests/test_x.py › TestCadastro › test_aceita'])
    expect(alterados[0].trava).toBe(true)

    // A linha depois de um texto entre aspas triplas ainda é do teste.
    escrever(raiz, { 'tests/test_x.py': base.replace('assert 3 == 3', 'assert True') })
    expect(doCodigo(conferir(raiz, { rodar: false }), 'TESTE_ALTERADO').map((p) => p.alvo)).toEqual(['tests/test_x.py › test_com_texto'])

    // Esconder o teste antigo num `if False:` ou numa classe que o pytest não coleta tira o teste da conta.
    for (const escondido of [
      base.replace('    def test_aceita(self):\n        assert 2 == 2', '    if False:\n        def test_aceita(self):\n            assert 2 == 2'),
      base.replace('class TestCadastro:', 'class Cadastro:'),
    ]) {
      escrever(raiz, { 'tests/test_x.py': escondido })
      expect(doCodigo(conferir(raiz, { rodar: false }), 'TESTES_A_MENOS').length).toBe(1)
    }
  }, 60_000)

  it('CA-P3-07: o resultado do pytest vale só para o teste lido no arquivo: nome repetido, reatribuído ou trocado por isca não prova', () => {
    const raiz = criarProjeto({
      ...basico(['CA-S1-01', 'CA-S1-02', 'CA-S1-03', 'CA-S1-04', 'CA-S1-05', 'CA-S1-06', 'CA-S1-07', 'CA-S1-08', 'CA-S1-09']),
      'tests/test_app.py': [
        'import pytest',
        '',
        'def test_CA_S1_01_real():',
        '    assert 1 == 2',
        '',
        'def test_CA_S1_01_real():',
        '    pass',
        '',
        'def test_CA_S1_02_real():',
        '    assert 1 == 2',
        '',
        'test_CA_S1_02_real = lambda: None',
        '',
        'def test_CA_S1_03_real():',
        '    assert 1 == 2',
        '',
        'del test_CA_S1_03_real',
        '',
        "@pytest.mark.parametrize('x', [1], ids=['CA_S1_03'])",
        'def test_apoio(x):',
        '    pass',
        '',
        '# Teste que some sem del nem reatribuição, com uma isca de mesmo código ao lado.',
        'def test_CA_S1_05_real():',
        '    assert 1 == 2',
        '',
        "globals().pop('test_CA_S1_05_real')",
        '',
        'def test_CA_S1_05_isca():',
        '    pass',
        '',
        '# Função trocada por outra que passa, de jeitos que a leitura do arquivo não reconhece.',
        'import sys',
        '',
        'def test_CA_S1_06_real():',
        '    assert 1 == 2',
        '',
        'def test_CA_S1_07_real():',
        '    assert 1 == 2',
        '',
        'def test_CA_S1_08_real():',
        '    assert 1 == 2',
        '',
        'def test_CA_S1_09_real():',
        '    assert 1 == 2',
        '',
        'globals()["test_CA_S1_06_real"] = lambda: None',
        'setattr(sys.modules[__name__], "test_CA_S1_07_real", lambda: None)',
        'nada = test_CA_S1_08_real = lambda: None',
        'for test_CA_S1_09_real in [lambda: None]:',
        '    pass',
        '',
        '# Parametrize de verdade, com o código no nome da função, prova.',
        "@pytest.mark.parametrize('n', [1, 2])",
        'def test_CA_S1_04_cada_numero(n):',
        '    assert n > 0',
        '',
      ].join('\n'),
    })
    const r = conferir(raiz)
    expect(doCodigo(r, 'CRITERIO_SEM_PROVA').map((p) => p.alvo).sort()).toEqual(['CA-S1-01', 'CA-S1-02', 'CA-S1-03', 'CA-S1-05', 'CA-S1-06', 'CA-S1-07', 'CA-S1-08', 'CA-S1-09'])
    expect(r.veredito).not.toBe('alinhada')
    // Sem rodar o pytest, a leitura do arquivo já sabe do nome repetido, reatribuído e apagado.
    const semRodar = doCodigo(conferir(raiz, { rodar: false }), 'CRITERIO_SEM_PROVA')
    expect(semRodar.map((p) => `${p.alvo} | ${p.detalhe.split(' em ')[0]}`).sort()).toEqual(['CA-S1-01 | teste pulado', 'CA-S1-02 | teste pulado', 'CA-S1-03 | teste pulado'])
  }, 60_000)

  it('CA-P3-06: projeto só com JavaScript não chama o pytest e continua alinhado', () => {
    const marca = path.join(os.tmpdir(), `anti-vibe-p3-01-pytest-chamado-${process.pid}`)
    fs.rmSync(marca, { force: true })
    const raiz = criarProjeto(
      {
        'pre-desenvolvimento/spec-exemplo.md': SPEC(['CA-S1-01']),
        'pre-desenvolvimento/issues/S1-01-exemplo.md': issue(['CA-S1-01'], ['src/app.mjs']),
        'src/app.mjs': 'export const dobro = (n) => n * 2\n',
        'tests/app.test.mjs': "import { it, expect } from 'vitest'\nimport { dobro } from '../src/app.mjs'\nit('CA-S1-01: dobra', () => {\n  expect(dobro(2)).toBe(4)\n})\n",
        // Arquivo Python que não é teste, ao lado dos testes.
        'tests/gerar_dados.py': 'print("apoio")\n',
        '.claude/auditor.json': JSON.stringify({
          comandoTestePython: `node -e "require('fs').writeFileSync(process.argv[1], 'x')" "${marca.split(path.sep).join('/')}"`,
        }),
      },
      { vitest: true }
    )
    const r = conferir(raiz)
    expect(travas(r)).toEqual([])
    expect(r.veredito).toBe('alinhada')
    expect(fs.existsSync(marca)).toBe(false)

    // Com um teste Python no projeto, o mesmo comando é chamado: a marca prova que o desvio existe.
    escrever(raiz, { 'tests/test_app.py': 'def test_CA_S1_01_tambem():\n    assert True\n' })
    conferir(raiz)
    expect(fs.existsSync(marca)).toBe(true)
    fs.rmSync(marca, { force: true })
  }, 60_000)
})
