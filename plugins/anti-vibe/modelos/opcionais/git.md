## Git

- O branch principal é protegido: ninguém commita direto nele.
- Todo trabalho anda num branch próprio. A esteira usa `esteira/<série>`, um commit por issue.
- O que vai para o principal entra por pull request, depois de a pessoa revisar.
- Push, pull request e merge são sempre da pessoa, nunca de um agente.
- Antes do commit, o auditor da issue tem que dar "alinhada" (ou "alinhada com teste manual
  pendente").
- Nunca se commita `.env` nem arquivo com segredo.
