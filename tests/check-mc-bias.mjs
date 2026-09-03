/*
 * Detecta "atalhos" nas questões de múltipla escolha que deixam a resposta
 * óbvia sem saber o conteúdo:
 *   1. comprimento: a alternativa correta ser muito mais longa que as outras;
 *   2. posição: a alternativa correta se concentrar sempre nos mesmos índices.
 *
 * Uso:  cd tests && node check-mc-bias.mjs [--strict]
 * --strict sai com código != 0 se houver qualquer alerta.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");
const manifest = JSON.parse(readFileSync(join(ROOT, "data/topics-manifest.json"), "utf8"));

// razão máxima entre a correta e a maior distratora (só conta acima deste tamanho)
const LEN_RATIO = 1.6;
const LEN_FLOOR = 55;

let warnings = 0;

for (const entry of manifest) {
  const topic = JSON.parse(readFileSync(join(ROOT, "data/topics", entry.file), "utf8"));
  const pos = [0, 0, 0, 0];
  let mc = 0;
  const lenHits = [];

  topic.levels.forEach((lv, li) =>
    lv.questions.forEach((q, qi) => {
      if (q.type !== "mc") return;
      mc++;
      pos[q.correct]++;
      const lens = q.options.map((o) => String(o).length);
      const correctLen = lens[q.correct];
      const maxOther = Math.max(...lens.filter((_, i) => i !== q.correct));
      if (correctLen >= LEN_FLOOR && correctLen > maxOther * LEN_RATIO) {
        lenHits.push(`L${li + 1}Q${qi + 1} (correta ${correctLen} vs ${maxOther}, ${(correctLen / maxOther).toFixed(1)}x)`);
      }
    })
  );

  const problems = [];
  if (lenHits.length) problems.push(`  comprimento — correta longa demais: ${lenHits.join(", ")}`);
  if (mc >= 8) {
    const zero = pos.filter((n) => n === 0).length;
    const max = Math.max(...pos);
    if (zero >= 2) problems.push(`  posição — correta nunca em ${pos.map((n, i) => (n === 0 ? "ABCD"[i] : null)).filter(Boolean).join("/")} (distribuição ${pos.join("/")})`);
    else if (max > mc * 0.5) problems.push(`  posição — ${Math.round((max / mc) * 100)}% das corretas no mesmo índice (distribuição ${pos.join("/")})`);
  }

  if (problems.length) {
    warnings += problems.length;
    console.log(`\n${entry.id}  (${mc} mc)`);
    problems.forEach((p) => console.log(p));
  }
}

console.log(warnings ? `\n${warnings} alerta(s) de viés.` : "\nSem viés de comprimento ou posição.");
if (strict && warnings) process.exit(1);
