import { defineConfig } from 'vitest/config'

// Os testes rodam o auditor e os ganchos como processos; com todas as suítes ao
// mesmo tempo, o limite padrão de 5 s é curto demais.
export default defineConfig({ test: { testTimeout: 30000 } })
