---
name: diagnostico
description: Confere se o plugin anti-vibe está funcionando neste ambiente (terminal, VS Code, Desktop ou thread na nuvem) — gancho de início de sessão, portão de conclusão e workflow. Use quando a pessoa pedir para diagnosticar, testar ou verificar a instalação do anti-vibe.
---

# Diagnóstico do anti-vibe

Confira as três peças de que a esteira depende e mostre o resultado peça por peça.
Não crie, altere nem apague arquivos do projeto.

## 1. Gancho de início de sessão

Procure no contexto desta sessão a linha `anti-vibe <versão> ativo`, escrita pelo
gancho de início do plugin.

- Encontrou: ✔, com a versão.
- Não encontrou: ✘ "o gancho de início não rodou nesta sessão".

## 2. Workflow e portão de conclusão

Rode o workflow `anti-vibe:teste-de-esteira` pela ferramenta Workflow, pelo nome, sem
argumentos, e espere o resultado.

- O workflow não pôde ser iniciado ou terminou com erro: workflow ✘, com o motivo, e
  portão "não conferido".
- Terminou: workflow ✔. Leia `resumo`:
  - `portao_funcionou` verdadeiro: portão ✔, com a palavra-passe.
  - falso: portão ✘ "o agente não recebeu a palavra-passe: o portão não barrou a
    conclusão neste ambiente".

## 3. Resultado

Mostre uma tabela:

| Peça | Resultado | Detalhe |
|---|---|---|
| Gancho de início | ✔ ou ✘ | versão ou motivo |
| Portão de conclusão | ✔ ou ✘ | palavra-passe ou motivo |
| Workflow | ✔ ou ✘ | Node e plataforma do agente, ou motivo |

Depois da tabela, informe onde o plugin está instalado: `${CLAUDE_PLUGIN_ROOT}`.

Se alguma peça deu ✘, diga em uma frase o que isso impede (ex.: sem portão, o auditor
não consegue barrar a conclusão da esteira) e não tente consertar sozinho.
