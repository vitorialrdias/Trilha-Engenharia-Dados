#!/usr/bin/env node
/*
 * Gera uma versão single-file (dist/) a partir de index.html + css/ + js/ + data/.
 * Inclui os dados inline no lugar dos fetch(), então o arquivo roda sem servidor.
 *
 *   node build.js                 -> dist/trilha-engenharia-dados.html
 *   node build.js caminho.html    -> caminho custom
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const outPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, "dist", "trilha-engenharia-dados.html");

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

const chapters = readJson(path.join(ROOT, "data", "chapters.json"));
const manifest = readJson(path.join(ROOT, "data", "topics-manifest.json"));
const resources = readJson(path.join(ROOT, "data", "resources.json"));
const achievements = readJson(path.join(ROOT, "data", "achievements.json"));

const topics = {};
manifest.forEach(entry => {
  topics[entry.id] = readJson(path.join(ROOT, "data", "topics", entry.file));
});

console.log("Bundling", Object.keys(topics).length, "topics across", Object.keys(chapters).length, "chapters...");

const css = fs.readFileSync(path.join(ROOT, "css", "app.css"), "utf8");
let appJs = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
const graderJs = fs.readFileSync(path.join(ROOT, "js", "grader.js"), "utf8");

// Troca só a função loadTrilhaData() (que faz fetch) por uma versão que já
// "resolve" na hora, porque os dados entram inline logo abaixo. O resto do fim
// do app.js (initAuth, renderCareerRequirements e o .then que inicia a trilha)
// continua igual ao da versão servida por HTTP.
const loaderRe = /\n([ \t]*)function loadTrilhaData\s*\(\s*\)\s*\{[\s\S]*?\n\1\}\n/;
if (!loaderRe.test(appJs) || !/loadTrilhaData\(\)\.then\(/.test(appJs)) {
  throw new Error("Função loadTrilhaData() ou a chamada loadTrilhaData().then( não encontrada em js/app.js. A estrutura do arquivo mudou?");
}
appJs = appJs.replace(loaderRe, (m, indent) => "\n" + indent +
  "function loadTrilhaData() { return { then: function (ok) { ok(); return { catch: function () {} }; } }; }\n");

function inlineData(name, value) {
  const re = new RegExp("var " + name + "\\s*=\\s*\\{\\};");
  if (!re.test(appJs)) throw new Error("Declaração `var " + name + " = {};` não encontrada em js/app.js.");
  // "</" e "<!--" dentro de um texto fechariam o <script>; U+2028/U+2029 quebram JS antigo.
  const json = JSON.stringify(value)
    .replace(/<\//g, "<\\/")
    .replace(/<!--/g, "<\\!--")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  // Função como substituto: "$&", "$'" e "$$" no conteúdo não são interpretados.
  appJs = appJs.replace(re, () => "var " + name + " = " + json + ";");
}
inlineData("TOPICS", topics);
inlineData("CHAPTERS", chapters);
inlineData("RESOURCES", resources);
inlineData("ACHIEVEMENTS", achievements);

const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const bodyMatch = indexHtml.match(/<body>([\s\S]*)<script src="js\/app\.js"><\/script>\s*<\/body>/);
if (!bodyMatch) throw new Error("Não foi possível localizar o markup do <body> em index.html.");
// O grader entra num <script> próprio, antes do app; tira a tag externa dele do markup.
const bodyMarkup = bodyMatch[1].replace(/<script src="js\/grader\.js"><\/script>\s*/, "").trim();

const headMatch = indexHtml.match(/<head>([\s\S]*?)<\/head>/);
if (!headMatch) throw new Error("Não foi possível localizar o markup do <head> em index.html.");
const headExtra = headMatch[1]
  .replace('<meta charset="UTF-8" />', "")
  .replace('<link rel="stylesheet" href="css/app.css" />', "")
  .trim();

const bundled = [
  "<!DOCTYPE html>",
  '<html lang="pt-BR">',
  "<head>",
  '<meta charset="UTF-8" />',
  headExtra,
  "<style>",
  css.trim(),
  "</style>",
  "</head>",
  "<body>",
  bodyMarkup,
  "<script>",
  graderJs.trim(),
  "</script>",
  "<script>",
  appJs.trim(),
  "</script>",
  "</body>",
  "</html>",
  ""
].join("\n");

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, bundled);
console.log("Wrote", outPath, "(" + bundled.length + " chars)");
