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

const topics = {};
manifest.forEach(entry => {
  topics[entry.id] = readJson(path.join(ROOT, "data", "topics", entry.file));
});

console.log("Bundling", Object.keys(topics).length, "topics across", Object.keys(chapters).length, "chapters...");

const css = fs.readFileSync(path.join(ROOT, "css", "app.css"), "utf8");
let appJs = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");

// Troca o bloco loadTrilhaData()...})(); (que faz fetch) por uma chamada síncrona,
// já que os dados entram inline logo abaixo.
const loaderStart = appJs.indexOf("  function loadTrilhaData(){");
const loaderEnd = appJs.indexOf("})();", loaderStart) + "})();".length;
if (loaderStart === -1 || loaderEnd === -1) {
  throw new Error("Bloco loadTrilhaData()...})(); não encontrado em js/app.js, a estrutura do arquivo mudou?");
}
const before = appJs.slice(0, loaderStart);
const after = appJs.slice(loaderEnd);

const inlineTail = [
  "  initTopics();",
  "  route();",
  "})();"
].join("\n");

appJs = before + inlineTail + after;

appJs = appJs.replace("var TOPICS = {};", "var TOPICS = " + JSON.stringify(topics) + ";");
appJs = appJs.replace("var CHAPTERS = {};", "var CHAPTERS = " + JSON.stringify(chapters) + ";");
appJs = appJs.replace("var RESOURCES = {};", "var RESOURCES = " + JSON.stringify(resources) + ";");

const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const bodyMatch = indexHtml.match(/<body>([\s\S]*)<script src="js\/app\.js"><\/script>\s*<\/body>/);
if (!bodyMatch) throw new Error("Não foi possível localizar o markup do <body> em index.html.");
const bodyMarkup = bodyMatch[1].trim();

const headMatch = indexHtml.match(/<head>([\s\S]*)<link rel="stylesheet" href="css\/app\.css" \/>\s*<\/head>/);
const headExtra = headMatch ? headMatch[1].replace('<meta charset="UTF-8" />', "").trim() : "";

const bundled = [
  headExtra,
  "",
  "<style>",
  css.trim(),
  "</style>",
  "",
  bodyMarkup,
  "",
  "<script>",
  appJs.trim(),
  "</script>",
  ""
].join("\n");

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, bundled);
console.log("Wrote", outPath, "(" + bundled.length + " chars)");
