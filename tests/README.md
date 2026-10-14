# Testes (opcionais)

O app não tem suíte embutida. Estas checagens são ferramentas de apoio e **não
são dependência para rodar a trilha**.

```bash
cd tests
npm run check:content   # sem dependências
npm install && npm run check   # tudo, inclusive o playground SQL
```

## check-grader.mjs

Casos de regressão da correção automática (`js/grader.js`): normalização de
respostas de completar, correção de código com espaços e quebras de linha, termos
curtos que só valem como palavra inteira, ordem das alternativas e escape de texto.

## check-content.mjs

Para cada questão: tem `id` único e `explain`; mc com 4 alternativas distintas e
gabarito válido; todo `accept` de fill passa na própria correção; todo `sample` de
code/terminal passa em `requiredGroups`; sem travessão nem espaço duplo; manifest e
`chapters.json` coerentes.

## check-mc-bias.mjs

Detecta atalhos nas múltipla escolha: correta que é a única mais longa em mais de
40% das questões do tópico (ou 1,6× maior que a maior distratora), distratores com
"sempre/nunca/só" quando a correta não tem, e alternativas cortadas. `--strict`
falha se houver qualquer alerta.

## check-sql-playground.mjs

Garante que os exercícios dos tópicos com painel "Rodar query" (`project.playground`
ou `playground` no topo do JSON) funcionam:

- `playground: true`/`"sqlite"` (sql.js): toda tabela de `project.tables` (ou, sem
  ela, de `refTables`) é criável e todo `sample` de questão `code` executa;
  `sample` `terminal` de `EXPLAIN ANALYZE`/`EXPLAIN (...)` fica isento (é sintaxe PostgreSQL).
- `playground: "postgres"` (PGlite / PostgreSQL 16): `project.seedSql` roda e
  todo `sample` `code`/`terminal` (inclusive `EXPLAIN ANALYZE`) executa contra ele.

Rode sempre que criar/editar um tópico com playground ou mexer nas tabelas dele.
