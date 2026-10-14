/*
 * Checagens estruturais do conteúdo, sem dependências:
 *  - todo sample de code/terminal passa na própria correção (js/grader.js);
 *  - todo accept de fill passa na própria correção;
 *  - mc tem 4 alternativas distintas e gabarito válido;
 *  - toda questão tem explain e um id único (usado para guardar o progresso);
 *  - placeholders "<nome>" fora de <code> não somem na tela (safeHtml os escapa),
 *    então só avisamos de travessões e espaços duplos deixados por travessão;
 *  - tópicos listados no manifest existem em chapters.json e vice-versa.
 *
 * Uso:  cd tests && node check-content.mjs
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const G = createRequire(import.meta.url)("../js/grader.js");
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

const manifest = readJson("data/topics-manifest.json");
const chapters = readJson("data/chapters.json");
let errors = 0;
const fail = (msg) => { errors++; console.error("✗ " + msg); };

const ids = new Set();
for (const entry of manifest) {
  const topic = readJson(`data/topics/${entry.file}`);
  if (topic.levels.length !== 4) fail(`${entry.id}: precisa de 4 níveis`);
  topic.levels.forEach((lv, li) =>
    lv.questions.forEach((q, qi) => {
      const tag = `${entry.id} N${li + 1}Q${qi + 1}`;
      if (!q.explain) fail(`${tag}: sem explain`);
      if (!q.id) fail(`${tag}: sem id`);
      else if (ids.has(q.id)) fail(`${tag}: id repetido (${q.id})`);
      else ids.add(q.id);
      const blob = JSON.stringify(q);
      if (/—/.test(blob)) fail(`${tag}: travessão no texto`);
      // espaço duplo só importa em texto corrido (código de referência pode ter indentação)
      const prose = [q.q, q.explain, ...(q.options || []), ...(q.accept || [])].join("\n");
      if (/\S {2,}\S/.test(prose)) fail(`${tag}: espaço duplo no texto`);
      if (q.type === "mc") {
        if (q.options.length !== 4) fail(`${tag}: mc precisa de 4 alternativas`);
        if (!(q.correct >= 0 && q.correct < q.options.length)) fail(`${tag}: gabarito fora do intervalo`);
        if (new Set(q.options.map((o) => G.normalizeFill(o))).size !== q.options.length) fail(`${tag}: alternativas repetidas`);
      } else if (q.type === "fill") {
        if (!q.accept?.length) fail(`${tag}: fill sem accept`);
        for (const a of q.accept || []) if (!G.gradeFill(q.accept, a)) fail(`${tag}: accept "${a}" não passa na própria correção`);
      } else if (q.type === "code" || q.type === "terminal") {
        if (!q.sample) fail(`${tag}: sem sample`);
        else if (!G.gradeCode(q.requiredGroups, q.sample)) fail(`${tag}: o sample não passa em requiredGroups`);
        if (!q.requiredGroups?.length) fail(`${tag}: sem requiredGroups`);
        for (const g of q.requiredGroups || []) for (const t of g) if (!String(t).trim()) fail(`${tag}: termo vazio`);
      } else fail(`${tag}: tipo desconhecido ${q.type}`);
    })
  );
}

const inChapters = new Set();
for (const ch of Object.values(chapters)) {
  const subs = ch.groups ? ch.groups.flatMap((g) => g.subtopics) : ch.subtopics;
  const slugs = new Set();
  for (const s of subs) {
    inChapters.add(s.topicId);
    if (slugs.has(s.slug)) fail(`slug repetido em ${ch.title}: ${s.slug}`);
    slugs.add(s.slug);
  }
}
for (const e of manifest) if (!inChapters.has(e.id)) fail(`${e.id} está no manifest mas não em chapters.json`);
for (const id of inChapters) if (!manifest.some((e) => e.id === id)) fail(`${id} está em chapters.json mas não no manifest`);

if (errors) { console.error(`\n${errors} problema(s).`); process.exit(1); }
console.log(`OK  ${ids.size} questões verificadas.`);
