export const meta = {
  name: 'teste-de-esteira',
  description: 'Diagnóstico do anti-vibe: agente do plugin, portão de conclusão e resposta estruturada',
  whenToUse: 'Chamado pelo skill diagnostico para conferir se o plugin funciona neste ambiente',
  phases: [
    { title: 'Agente e portão', detail: 'o agente de diagnóstico relata o ambiente e o portão o barra uma vez' },
    { title: 'Conferência', detail: 'confere a palavra-passe e monta o resumo' },
  ],
}

const RESUMO = {
  type: 'object',
  properties: {
    agente_respondeu: { type: 'boolean' },
    node: { type: 'string' },
    plataforma: { type: 'string' },
    palavra_passe: { type: 'string' },
    portao_funcionou: { type: 'boolean' },
  },
  required: ['agente_respondeu', 'node', 'plataforma', 'palavra_passe', 'portao_funcionou'],
}

phase('Agente e portão')
const relato = await agent('Faça o diagnóstico do ambiente conforme as suas instruções e responda com o relato.', {
  agentType: 'anti-vibe:diagnostico',
  label: 'diagnostico',
  phase: 'Agente e portão',
})

phase('Conferência')
const resumo = await agent(
  [
    'Leia o relato abaixo, escrito pelo agente de diagnóstico do anti-vibe, e preencha o resumo.',
    '- agente_respondeu: verdadeiro se há relato.',
    '- node e plataforma: copie do relato; use "desconhecido" se faltar.',
    '- palavra_passe: copie a palavra-passe do relato, se houver; senão, string vazia.',
    '- portao_funcionou: verdadeiro só se a palavra-passe tiver o formato PORTAO- seguido de seis caracteres hexadecimais maiúsculos.',
    'Não invente nada que não esteja no relato.',
    '',
    'Relato:',
    relato || '(o agente de diagnóstico não respondeu)',
  ].join('\n'),
  { schema: RESUMO, label: 'conferencia', phase: 'Conferência', model: 'haiku', effort: 'low' },
)

return { relato, resumo }
