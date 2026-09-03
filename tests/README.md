# Testes (opcionais)

O app não tem suíte embutida  estas checagens são ferramentas de apoio e **não
são dependência para rodar a trilha**.

## check-sql-playground.mjs

Garante que os exercícios dos tópicos com painel "Rodar query"
(`project.playground` definido no JSON) de fato funcionam:

- `playground: true`/`"sqlite"` (sql.js): toda tabela de `project.tables` é
  criável e todo `sample` de questão `code` executa; `sample` `terminal` de
  `EXPLAIN ANALYZE`/`EXPLAIN (...)` fica isento (é sintaxe PostgreSQL).
- `playground: "postgres"` (PGlite / PostgreSQL 16): `project.seedSql` roda e
  todo `sample` `code`/`terminal` (inclusive `EXPLAIN ANALYZE`) executa contra ele.

```bash
cd tests
npm install      # baixa sql.js (só aqui, não na raiz do projeto)
npm run check
```

Rode isto sempre que criar/editar um tópico com `playground: true` ou mexer nas
`project.tables` dele.
