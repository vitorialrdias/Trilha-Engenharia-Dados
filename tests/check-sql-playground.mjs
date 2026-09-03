/*
 * Verifica os tópicos com `project.playground`:
 *  - "sqlite"   (ou true): sql.js. Toda tabela de project.tables é criável e
 *    todo `sample` de questão `code` executa contra a seed.
 *  - "postgres": PGlite. `project.seedSql` roda e todo `sample` `code`/`terminal`
 *    (inclusive EXPLAIN / EXPLAIN ANALYZE) executa contra ele.
 *
 * Uso:  cd tests && npm install && node check-sql-playground.mjs
 * Sai com código != 0 se algum sample não executar.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

function bareTableName(name) {
  const n = String(name || "").split("(")[0].trim();
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? n : null;
}

function seedSqlite(SQL, tables) {
  const db = new SQL.Database();
  for (const t of tables || []) {
    const name = bareTableName(t.name);
    if (!name || !t.columns || !t.columns.length) continue;
    const cols = t.columns.map((c) => '"' + String(c).replace(/"/g, "") + '"');
    db.run(`CREATE TABLE ${name} (${cols.join(", ")});`);
    const ph = "(" + cols.map(() => "?").join(", ") + ")";
    for (const row of t.rows || []) {
      if (!row || row.length !== cols.length) continue;
      db.run(
        `INSERT INTO ${name} VALUES ${ph};`,
        row.map((c) => (c === null || c === undefined || c === "NULL" ? null : c))
      );
    }
  }
  return db;
}

const isSql = (s) => /^(SELECT|WITH|CREATE|INSERT|UPDATE|DELETE|EXPLAIN|PRAGMA|ANALYZE)\b/i.test(s);

const SQL = await initSqlJs();
const manifest = readJson("data/topics-manifest.json");
let failures = 0;
let checked = 0;

for (const entry of manifest) {
  const topic = readJson(`data/topics/${entry.file}`);
  const engine = topic.project?.playground;
  if (!engine) continue;

  const samples = [];
  topic.levels.forEach((level, li) =>
    level.questions.forEach((q, qi) => {
      if (q.sample && (q.type === "code" || q.type === "terminal")) {
        samples.push({ tag: `${entry.id} L${li + 1}Q${qi + 1}`, sql: q.sample.trim(), type: q.type });
      }
    })
  );

  if (engine === "postgres") {
    const db = new PGlite();
    for (const s of samples) {
      if (!isSql(s.sql)) continue;
      checked++;
      try {
        await db.exec("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
        if (topic.project.seedSql) await db.exec(topic.project.seedSql);
        await db.exec(s.sql);
      } catch (err) {
        failures++;
        console.error(`✗ ${s.tag}: ${err.message}`);
      }
    }
    await db.close();
  } else {
    const db = seedSqlite(SQL, topic.project.tables);
    for (const s of samples) {
      if (s.type === "terminal" && /^EXPLAIN(\s+ANALYZE|\s*\()/i.test(s.sql)) continue;
      if (!isSql(s.sql)) continue;
      checked++;
      try {
        db.exec(s.sql);
      } catch (err) {
        failures++;
        console.error(`✗ ${s.tag}: ${err.message}`);
      }
    }
    db.close();
  }
}

if (failures) {
  console.error(`\n${failures} sample(s) não executam (${checked} verificados).`);
  process.exit(1);
}
console.log(`OK  ${checked} samples de tópicos com playground executam.`);
