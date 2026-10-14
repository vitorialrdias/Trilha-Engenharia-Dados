/*
 * Detecta "atalhos" nas questões de múltipla escolha que deixam a resposta
 * óbvia sem saber o conteúdo:
 *   1. comprimento: a correta ser a única alternativa mais longa em muitas
 *      questões do tópico, ou muito mais longa que a maior distratora;
 *   2. distratores com palavras absolutas ("sempre", "nunca", "só"...) quando a
 *      correta não tem nenhuma;
 *   3. alternativa cortada no meio da frase.
 * A posição da correta não é checada: o app embaralha as alternativas na tela.
 *
 * Uso:  cd tests && node check-mc-bias.mjs [--strict]
 * --strict sai com código != 0 se houver qualquer alerta.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");
const manifest = JSON.parse(readFileSync(join(ROOT, "data/topics-manifest.json"), "utf8"));

const LEN_RATIO = 1.6;         // correta / maior distratora
const LEN_FLOOR = 55;          // só conta acima deste tamanho
const MAX_LONGEST_SHARE = 0.4; // fração máxima de mc em que a correta é a única mais longa
const MAX_ABSOLUTE_SHARE = 0.2;
const ABS = /\b(sempre|nunca|apenas|somente|so|qualquer|nenhum|nenhuma|jamais|obrigatoriamente|impossivel|exclusivamente)\b/;
const plain = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

let warnings = 0;
for (const entry of manifest) {
  const topic = JSON.parse(readFileSync(join(ROOT, "data/topics", entry.file), "utf8"));
  let mc = 0, longestOnly = 0, absolute = 0;
  const problems = [];

  topic.levels.forEach((lv, li) =>
    lv.questions.forEach((q, qi) => {
      if (q.type !== "mc") return;
      mc++;
      const tag = `N${li + 1}Q${qi + 1}`;
      const lens = q.options.map((o) => String(o).length);
      const c = lens[q.correct];
      const others = lens.filter((_, i) => i !== q.correct);
      if (c === Math.max(...lens) && lens.filter((n) => n === c).length === 1) longestOnly++;
      if (c >= LEN_FLOOR && c > Math.max(...others) * LEN_RATIO) problems.push(`${tag}: correta ${c} vs ${Math.max(...others)} caracteres`);
      const absDistractors = q.options.filter((o, i) => i !== q.correct && ABS.test(plain(o))).length;
      if (absDistractors >= 2 && !ABS.test(plain(q.options[q.correct]))) absolute++;
      q.options.forEach((o, i) => {
        if (/(,|(?<![\p{L}])(de|da|do|em|que|com|para|dentro|e|ou|a|o))$/u.test(String(o).trim()) && String(o).length > 30) problems.push(`${tag}: alternativa ${"ABCD"[i]} parece cortada ("...${String(o).slice(-25)}")`);
      });
    })
  );

  if (mc >= 8) {
    if (longestOnly / mc > MAX_LONGEST_SHARE) problems.push(`correta é a única mais longa em ${longestOnly}/${mc} (${Math.round((100 * longestOnly) / mc)}%)`);
    if (absolute / mc > MAX_ABSOLUTE_SHARE) problems.push(`${absolute}/${mc} mc com 2+ distratores absolutos e correta sem nenhum`);
  }
  if (problems.length) {
    warnings += problems.length;
    console.log(`\n${entry.id}  (${mc} mc)`);
    problems.forEach((p) => console.log(`  ${p}`));
  }
}

console.log(warnings ? `\n${warnings} alerta(s) de viés.` : "\nSem viés de comprimento nem de distratores.");
if (strict && warnings) process.exit(1);
