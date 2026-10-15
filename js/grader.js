/*
 * Funções puras da trilha: correção de respostas, ordem das alternativas e
 * escape de texto. Ficam num arquivo próprio para o app e os testes usarem
 * exatamente o mesmo código (ES5, sem dependências).
 */
var TrilhaGrader = (function () {
  "use strict";

  function stripAccents(str) {
    return String(str == null ? "" : str).normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  // Resposta de completar: minúsculas, sem acento, sem ( ) ., hífen e
  // sublinhado viram espaço, espaços repetidos viram um só.
  function normalizeFill(str) {
    return stripAccents(str).toLowerCase()
      .replace(/[().]/g, "")
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function gradeFill(accept, userValue) {
    var user = normalizeFill(userValue);
    if (!user) return false;
    var compact = user.replace(/ /g, "");
    return (accept || []).some(function (a) {
      var n = normalizeFill(a);
      return n === user || n.replace(/ /g, "") === compact;
    });
  }

  // Código/terminal: texto e termos em maiúsculas, sem acento, espaços e quebras
  // de linha colapsados. Termos curtos (até 3 caracteres) só valem como palavra
  // inteira, para "ON" não casar com "JSON" nem "K" com qualquer texto.
  function normalizeCode(str) {
    return stripAccents(str).toUpperCase().replace(/\s+/g, " ").trim();
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function termMatches(text, term) {
    var t = normalizeCode(term);
    if (!t) return false;
    if (t.length <= 3) {
      // Só exige palavra inteira nas pontas que são letra/dígito/_ : "ON" não casa
      // com "JSON", mas "=" e "{" casam colados em "x=5" ou "f{".
      var pre = /^[A-Z0-9_]/.test(t) ? "(^|[^A-Z0-9_\\-])" : "";
      var post = /[A-Z0-9_]$/.test(t) ? "($|[^A-Z0-9_])" : "";
      return new RegExp(pre + escapeRegExp(t) + post).test(text);
    }
    return text.indexOf(t) !== -1;
  }

  // Colar o enunciado inteiro não vale como resposta (ele cita os termos pedidos).
  function pastesStem(text, stem) {
    var s = normalizeCode(String(stem || "").replace(/<[^>]*>/g, " "));
    return s.length >= 30 && text.indexOf(s) !== -1;
  }

  function gradeCode(requiredGroups, userValue, stem) {
    var text = normalizeCode(userValue);
    if (!text) return false;
    if (pastesStem(text, stem)) return false;
    return (requiredGroups || []).every(function (group) {
      return group.some(function (term) { return termMatches(text, term); });
    });
  }

  // Ordem determinística (mesma a cada visita) das alternativas de uma questão.
  function hashString(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seededRandom(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Devolve os índices originais das alternativas na ordem em que aparecem na tela.
  function optionOrder(count, seedText) {
    var order = [];
    for (var i = 0; i < count; i++) order.push(i);
    var rnd = seededRandom(hashString(String(seedText)));
    for (var j = count - 1; j > 0; j--) {
      var k = Math.floor(rnd() * (j + 1));
      var tmp = order[j]; order[j] = order[k]; order[k] = tmp;
    }
    return order;
  }

  // Textos do conteúdo aceitam <code>, mas "<nome>" e "<dag_id>" são texto.
  function safeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/<(?!\/?(?:code|strong|em)>)/g, "&lt;");
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  return {
    normalizeFill: normalizeFill,
    gradeFill: gradeFill,
    normalizeCode: normalizeCode,
    termMatches: termMatches,
    gradeCode: gradeCode,
    optionOrder: optionOrder,
    safeHtml: safeHtml,
    escapeHtml: escapeHtml
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = TrilhaGrader;
