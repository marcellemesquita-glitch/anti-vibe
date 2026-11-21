# anti-vibe

Método de desenvolvimento com IA, empacotado como plugin do Claude Code: triagem da
tarefa, spec com critérios de aceite, testes escritos antes do código, auditor que
confere cada critério e revisão independente.

> Em construção. A esteira automática e as etapas do fluxo estão sendo adicionadas.

## Instalar

No terminal:

```
claude plugin marketplace add marcellemesquita-glitch/anti-vibe
claude plugin install anti-vibe@fabrica-anti-vibe
```

Ou, dentro de uma sessão do Claude Code:

```
/plugin install anti-vibe --marketplace marcellemesquita-glitch/anti-vibe
```

Para conferir se está funcionando, abra uma sessão nova e rode `/anti-vibe:diagnostico`.

## Licença

[MIT](LICENSE).
