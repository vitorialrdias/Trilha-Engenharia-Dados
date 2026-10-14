/* Casos de regressão da correção automática (js/grader.js). Uso: node check-grader.mjs */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const G = createRequire(import.meta.url)("../js/grader.js");

// fill: acento, maiúsculas, hífen, espaço e parênteses não importam
assert.ok(G.gradeFill(["b-tree"], "B Tree"));
assert.ok(G.gradeFill(["btree"], "b-tree"));
assert.ok(G.gradeFill(["idempotencia"], " Idempotência "));
assert.ok(G.gradeFill(["row_number"], "ROW_NUMBER()"));
assert.ok(!G.gradeFill(["merge"], ""));
assert.ok(!G.gradeFill(["merge"], "mergee"));

// code: espaços e quebras de linha colapsados
assert.ok(G.gradeCode([["PARTITION BY"]], "SUM(x) OVER (PARTITION\n    BY id)"));
assert.ok(G.gradeCode([["SELECT"], ["FROM"]], "select a\nfrom t"));
// termos curtos só como palavra inteira
assert.ok(!G.gradeCode([["ON"]], "SELECT * FROM t, JSON_TABLE"));
assert.ok(G.gradeCode([["ON"]], "JOIN b ON a.id = b.id"));
assert.ok(!G.gradeCode([["K"]], "qualquer texto com kafka no meio"));
assert.ok(G.gradeCode([["K"]], "top k = 5"));
// acento no código é ignorado
assert.ok(G.gradeCode([["CATALOGO"]], "catálogo"));
assert.ok(!G.gradeCode([["LOG DE TRANSA"]], "catálogo de tecnologia"));
assert.ok(!G.gradeCode([["SELECT"]], "   "));

// ordem das alternativas: mesma a cada chamada, é permutação, e varia entre questões
const a = G.optionOrder(4, "sql|0|1"), b = G.optionOrder(4, "sql|0|1");
assert.deepEqual(a, b);
assert.deepEqual([...a].sort(), [0, 1, 2, 3]);
const seen = new Set();
for (let i = 0; i < 200; i++) seen.add(G.optionOrder(4, "t|0|" + i).indexOf(0));
assert.equal(seen.size, 4);

// texto: <code> permanece, placeholders viram texto
assert.equal(G.safeHtml("use <code>x</code> em <nome>"), "use <code>x</code> em &lt;nome>");
assert.equal(G.escapeHtml('a "b" <c>'), "a &quot;b&quot; &lt;c&gt;");
console.log("OK  grader");
import assert2 from "node:assert/strict";
assert2.ok(G.gradeCode([["="]], "x=5"));
assert2.ok(G.gradeCode([["{"]], 'f"{x}"'));
assert2.ok(!G.gradeCode([["1"]], "limit 15"));
assert2.ok(G.gradeCode([["5"]], "limit 5;"));
console.log("OK  grader (símbolos)");
