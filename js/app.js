
(function () {
  "use strict";

  var TOPICS = {};

  var QUIZ_STATE_KEY = "trilha-dados-quiz-v2";
  var quizState = {};
  try {
    var qraw = localStorage.getItem(QUIZ_STATE_KEY);
    if (qraw) quizState = JSON.parse(qraw) || {};
  } catch (e) { quizState = {}; }

  function saveQuizState() {
    try { localStorage.setItem(QUIZ_STATE_KEY, JSON.stringify(quizState)); } catch (e) { }
  }

  function normalize(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[().]/g, "")
      .trim();
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function levelLinks(level) {
    if (level.links && level.links.length) return level.links;
    if (level.link) return [level.link];
    return [];
  }

  function getTopicState(topicId) {
    if (!quizState[topicId]) {
      quizState[topicId] = { level: 0, doneLevels: [false, false, false, false], answers: {}, done: false };
    }
    return quizState[topicId];
  }

  function formatNumber(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function contentStats() {
    var ids = Object.keys(TOPICS);
    var levels = 0, questions = 0;
    ids.forEach(function (id) {
      var lv = (TOPICS[id] && TOPICS[id].levels) || [];
      levels += lv.length;
      lv.forEach(function (l) { questions += (l.questions || []).length; });
    });
    return { chapters: Object.keys(CHAPTERS).length, topics: ids.length, levels: levels, questions: questions };
  }

  function setStatEl(id, value, suffix) {
    var el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = formatNumber(value) + (suffix ? '<span>' + suffix + '</span>' : '');
  }

  function updateStats() {
    var s = contentStats();
    var done = 0;
    Object.keys(TOPICS).forEach(function (id) { if (quizState[id] && quizState[id].done) done++; });

    setStatEl('stat-chapters', s.chapters, '');
    setStatEl('stat-topics', s.topics, ' · 4 níveis cada');
    setStatEl('stat-questions', s.questions, '');
    setStatEl('stat-progress', done, '/' + s.topics + ' concluídos');

    var lp = document.getElementById('learning-progress');
    if (lp) {
      lp.textContent = done > 0
        ? (done + ' de ' + s.topics + ' tópicos concluídos neste navegador')
        : (s.topics + ' tópicos, ' + formatNumber(s.questions) + ' exercícios com correção automática');
    }
  }

  function initTopics() {
    updateStats();
  }

  // Dois destinos de render que compartilham a lógica de quiz via activeCtx:
  // o modal (#quiz-overlay) e a página inteira do sub-tópico (#view-subtopic).
  var modalCtx = {
    overlay: document.getElementById('quiz-overlay'),
    titleEl: document.getElementById('quiz-title'),
    subtitleEl: document.getElementById('quiz-subtitle'),
    bodyEl: document.getElementById('quiz-body'),
    checkBtn: document.getElementById('quiz-check'),
    scoreEl: document.getElementById('quiz-score'),
    successEl: document.getElementById('quiz-success')
  };
  var pageCtx = {
    overlay: null,
    titleEl: document.getElementById('page-quiz-title'),
    subtitleEl: document.getElementById('page-quiz-subtitle'),
    bodyEl: document.getElementById('page-quiz-body'),
    checkBtn: document.getElementById('page-quiz-check'),
    scoreEl: document.getElementById('page-quiz-score'),
    successEl: document.getElementById('page-quiz-success')
  };
  var closeBtn = document.getElementById('quiz-close');
  var activeCtx = modalCtx;
  var currentTopic = null;
  var currentLevel = 0;

  var CHAPTERS = {};
  var RESOURCES = {};

  function chapterSubtopics(ch) {
    if (ch.groups) {
      var all = [];
      ch.groups.forEach(function (g) {
        g.subtopics.forEach(function (s) { all.push(s); });
      });
      return all;
    }
    return ch.subtopics || [];
  }

  function parseHash() {
    var h = (location.hash || "").replace(/^#\/?/, "");
    var parts = h.split("/").filter(Boolean);
    if (!parts.length) return { view: "home" };
    if (parts[0] === "learning") return { view: "learning" };
    if (parts[0] === "recursos") return { view: "recursos" };
    if (parts[0] === "sobre") return { view: "about" };
    if (parts[0] === "capitulo" && parts[1]) {
      return { view: "capitulo", chapter: parts[1], subtopic: parts[2] || null };
    }
    return { view: "home" };
  }

  function showView(name) {
    ['home', 'learning', 'recursos', 'about', 'chapter', 'subtopic'].forEach(function (v) {
      var el = document.getElementById('view-' + v);
      if (el) el.classList.toggle('hidden', v !== name);
    });
    window.scrollTo(0, 0);
  }

  function setActiveNav(view) {
    var active = (view === 'home' || view === 'about' || view === 'recursos') ? view : 'learning';
    var links = document.querySelectorAll('.site-links a[data-nav]');
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle('is-active', links[i].getAttribute('data-nav') === active);
    }
  }

  function resourceCardHtml(item) {
    var langCls = item.lang === "en" ? "en" : "pt";
    var langLabel = item.lang === "en" ? "EN" : "PT";
    var name = escapeHtml(item.name || "");
    var title = item.url
      ? '<a href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener">' + name + '</a>'
      : name;
    var tags = (item.tags || []).map(function (t) {
      return '<span class="resource-tag">' + escapeHtml(t) + '</span>';
    }).join('');
    return '<div class="resource-card" data-topics="' + escapeHtml((item.topics || []).join(' ')) + '">' +
      '<div class="resource-card-top"><h3>' + title + '</h3>' +
      '<span class="resource-lang ' + langCls + '">' + langLabel + '</span></div>' +
      '<p>' + escapeHtml(item.desc || "") + '</p>' +
      (tags ? '<div class="resource-tags">' + tags + '</div>' : '') +
      '</div>';
  }

  function applyResourceFilter(filter) {
    var cards = document.querySelectorAll('#resource-sections .resource-card');
    for (var i = 0; i < cards.length; i++) {
      var topics = (cards[i].getAttribute('data-topics') || '').split(' ');
      var show = (filter === 'todos') || topics.indexOf(filter) !== -1;
      cards[i].classList.toggle('hidden', !show);
    }
    var stages = document.querySelectorAll('#resource-sections .resource-stage');
    for (var j = 0; j < stages.length; j++) {
      var visible = stages[j].querySelectorAll('.resource-card:not(.hidden)').length;
      stages[j].classList.toggle('hidden', visible === 0);
    }
  }

  function renderResourcesView() {
    var r = RESOURCES || {};
    var set = function (id, text) { var el = document.getElementById(id); if (el) el.textContent = text || ''; };
    set('recursos-eyebrow', r.eyebrow);
    set('recursos-title', r.title);
    set('recursos-dek', r.dek);
    set('recursos-note', r.note);
    set('recursos-foot', r.footnote);

    var bar = document.getElementById('resource-filterbar');
    if (bar) {
      var chips = (r.filters || []).map(function (f, i) {
        return '<button type="button" class="resource-chip' + (i === 0 ? ' active' : '') +
          '" data-filter="' + escapeHtml(f.id) + '">' + escapeHtml(f.label) + '</button>';
      }).join('');
      bar.innerHTML = '<span class="resource-flabel">Filtrar por tema</span>' + chips;
      bar.querySelectorAll('.resource-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          bar.querySelectorAll('.resource-chip').forEach(function (c) { c.classList.remove('active'); });
          chip.classList.add('active');
          applyResourceFilter(chip.getAttribute('data-filter'));
        });
      });
    }

    var host = document.getElementById('resource-sections');
    if (host) {
      host.innerHTML = (r.sections || []).map(function (s) {
        var cards = (s.items || []).map(resourceCardHtml).join('');
        return '<section class="resource-stage">' +
          '<div class="resource-stage-label">' +
          '<span class="resource-stage-num">' + escapeHtml(s.num || '') + ' / ' + escapeHtml(s.kind || '') + '</span>' +
          '<div class="resource-stage-title">' + escapeHtml(s.title || '') + '</div>' +
          '<p class="resource-stage-desc">' + escapeHtml(s.desc || '') + '</p>' +
          '</div>' +
          '<div class="resource-cards">' + cards + '</div>' +
          '</section>';
      }).join('');
    }
  }

  function subtopicStatusInfo(topicId) {
    var st = getTopicState(topicId);
    if (st.done) return { cls: "is-done", label: "✓ Concluído" };
    var anyDone = st.doneLevels.some(function (d) { return d; });
    if (anyDone || st.level > 0) return { cls: "is-progress", label: "Nível " + (st.level + 1) + "/4" };
    return { cls: "", label: "Não iniciado" };
  }

  function renderChaptersGrid() {
    var grid = document.getElementById('chapters-grid');
    if (!grid) return;
    var slugs = Object.keys(CHAPTERS);
    var html = "";
    slugs.forEach(function (slug, i) {
      var ch = CHAPTERS[slug];
      var all = chapterSubtopics(ch);
      var doneCount = all.filter(function (s) { return getTopicState(s.topicId).done; }).length;
      var complete = (all.length > 0 && doneCount === all.length);
      html += '<a class="chapter-card' + (complete ? ' is-complete' : '') + '" href="#/capitulo/' + slug + '">' +
        '<div class="cc-order">Etapa ' + (i + 1) + ' de ' + slugs.length + '</div>' +
        '<div class="cc-icon">' + ch.icon + '</div>' +
        '<div class="cc-title">' + ch.title + '</div>' +
        '<div class="cc-sub">' + all.length + ' sub-tópicos com página própria</div>' +
        '<div class="cc-progress">' + doneCount + '/' + all.length + ' concluídos</div>' +
        '</a>';
    });
    grid.innerHTML = html;
  }

  function subtopicCardHtml(chapterSlug, s, num) {
    var status = subtopicStatusInfo(s.topicId);
    var topicData = TOPICS[s.topicId];
    return '<a class="subtopic-card ' + status.cls + '" href="#/capitulo/' + chapterSlug + '/' + s.slug + '">' +
      '<div class="sc-num">' + num + '</div>' +
      '<div class="sc-text"><div class="sc-title">' + (topicData ? topicData.title : s.slug) + '</div><div class="sc-sub">' + (s.sub || "") + '</div></div>' +
      '<div class="sc-status">' + status.label + '</div>' +
      '</a>';
  }

  function renderChapterView(chapterSlug) {
    var ch = CHAPTERS[chapterSlug];
    if (!ch) return;
    var slugs = Object.keys(CHAPTERS);
    var step = slugs.indexOf(chapterSlug) + 1;
    document.getElementById('chapter-icon').textContent = ch.icon;
    document.getElementById('chapter-eyebrow').textContent =
      'Etapa ' + step + ' de ' + slugs.length + ' · ' + String(ch.eyebrow || '').replace(/^Cap[ií]tulo\s*·\s*/, '');
    document.getElementById('chapter-title').textContent = ch.title;
    document.getElementById('chapter-intro').textContent = ch.intro;
    var listEl = document.getElementById('chapter-subtopic-list');
    var html = "";
    if (ch.groups) {
      ch.groups.forEach(function (g) {
        html += '<div class="subtopic-group-head">' + g.name + '</div>';
        g.subtopics.forEach(function (s, i) { html += subtopicCardHtml(chapterSlug, s, i + 1); });
      });
    } else {
      (ch.subtopics || []).forEach(function (s, i) { html += subtopicCardHtml(chapterSlug, s, i + 1); });
    }
    listEl.innerHTML = html;

    var bookEl = document.getElementById('chapter-book');
    if (bookEl) bookEl.innerHTML = chapterBookHtml(ch.book);
  }

  function chapterBookHtml(b) {
    if (!b) return "";
    var meta = [];
    if (b.level) meta.push('Nível: ' + b.level);
    if (b.price) meta.push(b.price);
    else if (b.cost) meta.push(b.cost);
    return '<div class="chapter-book">' +
      '<span class="chapter-book-label">Leitura recomendada ao fim do capítulo</span>' +
      '<div class="chapter-book-title">' + escapeHtml(b.title) + '</div>' +
      '<div class="chapter-book-author">' + escapeHtml(b.author || "") + (b.year ? ' · ' + b.year : "") + '</div>' +
      (meta.length ? '<div class="chapter-book-meta">' + escapeHtml(meta.join(' · ')) + '</div>' : "") +
      (b.why ? '<p>' + escapeHtml(b.why) + '</p>' : "") +
      (b.where ? '<a class="chapter-book-link" href="' + b.where + '" target="_blank" rel="noopener">Onde encontrar</a>' : "") +
      '</div>';
  }

  function refreshSubtopicChrome(chapterSlug, subtopicSlug) {
    var ch = CHAPTERS[chapterSlug];
    if (!ch) return;
    var all = chapterSubtopics(ch);
    var current = all.filter(function (s) { return s.slug === subtopicSlug; })[0];
    var crumb = document.getElementById('subtopic-crumb');
    if (crumb && current) crumb.innerHTML = '<a href="#/capitulo/' + chapterSlug + '">' + ch.title + '</a> / ' + (TOPICS[current.topicId] || {}).title;
    var siblingsEl = document.getElementById('subtopic-siblings');
    if (siblingsEl) {
      var sibHtml = "";
      if (ch.groups) {
        ch.groups.forEach(function (g) {
          sibHtml += '<span class="subtopic-group-label">' + g.name + '</span>';
          g.subtopics.forEach(function (s) { sibHtml += subtopicPillHtml(chapterSlug, s, subtopicSlug); });
        });
      } else {
        (ch.subtopics || []).forEach(function (s) { sibHtml += subtopicPillHtml(chapterSlug, s, subtopicSlug); });
      }
      siblingsEl.innerHTML = sibHtml;
    }
  }

  function subtopicPillHtml(chapterSlug, s, currentSlug) {
    var status = subtopicStatusInfo(s.topicId);
    var cls = "subtopic-pill" + (s.slug === currentSlug ? " is-current" : "") + (status.cls === "is-done" ? " is-done" : "");
    return '<a class="' + cls + '" href="#/capitulo/' + chapterSlug + '/' + s.slug + '">' + TOPICS[s.topicId].title.split(":")[0] + '</a>';
  }

  function renderSubtopicView(chapterSlug, subtopicSlug) {
    var ch = CHAPTERS[chapterSlug];
    var sub = ch && chapterSubtopics(ch).filter(function (s) { return s.slug === subtopicSlug; })[0];
    if (!ch || !sub || !TOPICS[sub.topicId]) {
      location.hash = ch ? ("#/capitulo/" + chapterSlug) : "#/learning";
      return;
    }
    refreshSubtopicChrome(chapterSlug, subtopicSlug);
    activeCtx = pageCtx;
    var st = getTopicState(sub.topicId);
    renderQuiz(sub.topicId, st.level);
  }

  function route() {
    renderChaptersGrid();
    var parsed = parseHash();
    setActiveNav(parsed.view);
    if (parsed.view === 'learning') { showView('learning'); return; }
    if (parsed.view === 'recursos') { renderResourcesView(); showView('recursos'); return; }
    if (parsed.view === 'about') { showView('about'); return; }
    if (parsed.view === 'capitulo' && CHAPTERS[parsed.chapter]) {
      if (!parsed.subtopic) {
        renderChapterView(parsed.chapter);
        showView('chapter');
      } else {
        renderSubtopicView(parsed.chapter, parsed.subtopic);
        showView('subtopic');
      }
      return;
    }
    showView('home');
  }

  function levelStepperHtml(topicId, shownLevel) {
    var st = getTopicState(topicId);
    var levels = TOPICS[topicId].levels;
    var html = '<div class="level-stepper">';
    levels.forEach(function (lvl, i) {
      var cls = "level-dot";
      if (st.doneLevels[i]) cls += " is-done";
      if (i === shownLevel) cls += " is-current";
      var locked = (i > st.level) && !st.doneLevels[i];
      if (locked) cls += " is-locked";
      html += '<div class="' + cls + '" data-level="' + i + '" data-clickable="' + (!locked ? "1" : "0") + '"><span class="n">' + (st.doneLevels[i] ? "✓" : (i + 1)) + '</span>' + lvl.name + '</div>';
    });
    html += '</div>';
    return html;
  }

  function projectTableHtml(t) {
    var html = '<div class="project-banner-table-wrap">';
    if (t.name) html += '<div class="project-banner-table-name">' + t.name + '</div>';
    html += '<table><thead><tr>';
    (t.columns || []).forEach(function (c) { html += '<th>' + escapeHtml(String(c)) + '</th>'; });
    html += '</tr></thead><tbody>';
    (t.rows || []).forEach(function (row) {
      html += '<tr>';
      row.forEach(function (cell) {
        var isNull = (cell === null || cell === undefined || cell === "NULL");
        html += '<td' + (isNull ? ' class="is-null"' : '') + '>' + (isNull ? 'NULL' : escapeHtml(String(cell))) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function projectBannerHtml(data) {
    if (!data.project) return "";
    var p = data.project;
    var html = '<div class="project-banner"><span class="project-banner-label">Projeto do tópico</span><h4>' + p.title + '</h4>';
    if (p.description) html += '<p>' + p.description + '</p>';
    if (p.tables && p.tables.length) {
      p.tables.forEach(function (t) { html += projectTableHtml(t); });
    }
    if (p.code) {
      html += '<div class="code-sample-label">' + (p.code.label || "Código") + '</div><pre class="project-banner-code">' + escapeHtml(p.code.content) + '</pre>';
    }
    if (p.terminal) {
      html += '<div class="project-banner-terminal">';
      html += '<div class="terminal-bar"><span class="terminal-dot d1"></span><span class="terminal-dot d2"></span><span class="terminal-dot d3"></span></div>';
      (p.terminal.lines || []).forEach(function (line) {
        html += '<div class="terminal-line"><span class="terminal-prompt">' + (p.terminal.shell || "$") + '</span><span class="terminal-prompt-text">' + escapeHtml(line) + '</span></div>';
      });
      html += '</div>';
      if (p.terminal.output) {
        html += '<div class="code-sample-label">Saída</div><pre class="terminal-output-sample">' + escapeHtml(p.terminal.output) + '</pre>';
      }
    }
    if (p.note) html += '<p class="project-banner-note">' + p.note + '</p>';
    html += '</div>';
    return html;
  }

  function finalProjectHtml(data) {
    if (!data.finalProject) return "";
    var fp = data.finalProject;
    return '<div class="final-project-box"><span class="final-project-label">Tarefa final · aplique o que você praticou</span>' +
      '<h4>' + fp.title + '</h4>' +
      '<p class="final-project-context"><strong>' + fp.area + '</strong> pediu: ' + fp.ask + '</p>' +
      '<p>' + fp.task + '</p>' +
      (fp.deliverables ? '<ul class="final-project-deliverables">' + fp.deliverables.map(function (d) { return '<li>' + d + '</li>'; }).join('') + '</ul>' : '') +
      '</div>';
  }

  // Playground SQL. Dois motores WASM carregados sob demanda, da CDN:
  //  - "sqlite"  : sql.js        leve, para os tópicos de SQL ANSI (p1-0, p1-1, p1-3, ent-1);
  //  - "postgres": PGlite (PG16)  para o tópico de plano de execução (p1-2), onde
  //                EXPLAIN ANALYZE, Seq Scan, Bitmap etc. precisam bater com as explicações.
  var SQLJS_BASE = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.14.2/";
  var PGLITE_URL = "https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.8/dist/index.js";
  var sqlJsPromise = null;
  var pglitePromise = null;

  function ensureSqlJs() {
    if (sqlJsPromise) return sqlJsPromise;
    sqlJsPromise = new Promise(function (resolve, reject) {
      function init() {
        window.initSqlJs({ locateFile: function (f) { return SQLJS_BASE + f; } }).then(resolve, reject);
      }
      if (window.initSqlJs) { init(); return; }
      var s = document.createElement('script');
      s.src = SQLJS_BASE + "sql-wasm.js";
      s.onload = init;
      s.onerror = function () { reject(new Error("Não foi possível abrir o ambiente de prática. Verifique sua conexão com a internet e tente de novo.")); };
      document.head.appendChild(s);
    });
    return sqlJsPromise;
  }

  // PGlite é ESM: injeta um <script type="module"> que faz import() e devolve a instância.
  function ensurePglite() {
    if (pglitePromise) return pglitePromise;
    pglitePromise = new Promise(function (resolve, reject) {
      window.__pgliteOk = function (db) { resolve(db); };
      window.__pgliteErr = function (e) { reject(new Error("Não foi possível abrir o ambiente de prática. Verifique sua conexão com a internet e tente de novo.")); };
      var s = document.createElement('script');
      s.type = 'module';
      s.textContent =
        "import(" + JSON.stringify(PGLITE_URL) + ")" +
        ".then(function(m){ return new m.PGlite(); })" +
        ".then(function(db){ return db.query('select 1').then(function(){ window.__pgliteOk(db); }); })" +
        ".catch(function(e){ window.__pgliteErr(e); });";
      document.head.appendChild(s);
    });
    return pglitePromise;
  }

  function playgroundEngine(data) {
    var p = data.project && data.project.playground;
    if (p === "postgres") return "postgres";
    if (p) return "sqlite";
    return null;
  }

  function playgroundTables(data) {
    return (data.project && data.project.tables) ? data.project.tables : [];
  }

  function bareTableName(name) {
    var n = String(name || "").split("(")[0].trim();
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? n : null;
  }

  function seedDatabase(SQL, tables) {
    var db = new SQL.Database();
    tables.forEach(function (t) {
      var name = bareTableName(t.name);
      if (!name || !t.columns || !t.columns.length) return;
      var cols = t.columns.map(function (c) { return '"' + String(c).replace(/"/g, "") + '"'; });
      db.run("CREATE TABLE " + name + " (" + cols.join(", ") + ");");
      var placeholders = "(" + cols.map(function () { return "?"; }).join(", ") + ")";
      (t.rows || []).forEach(function (row) {
        if (!row || row.length !== cols.length) return;
        var vals = row.map(function (cell) {
          return (cell === null || cell === undefined || cell === "NULL") ? null : cell;
        });
        db.run("INSERT INTO " + name + " VALUES " + placeholders + ";", vals);
      });
    });
    return db;
  }

  // Normaliza o resultado do PGlite ({rows:[obj], fields:[{name}]}) para o formato do sql.js.
  function pgResultsToRows(results) {
    return (results || []).filter(function (r) { return r && r.fields && r.fields.length; }).map(function (r) {
      var columns = r.fields.map(function (f) { return f.name; });
      return {
        columns: columns,
        values: (r.rows || []).map(function (obj) { return columns.map(function (c) { return obj[c]; }); })
      };
    });
  }

  function sqlPlaygroundHtml(data) {
    var engine = playgroundEngine(data);
    if (!engine) return "";
    var names = [];
    playgroundTables(data).forEach(function (t) {
      var n = bareTableName(t.name);
      if (n && names.indexOf(n) === -1) names.push(n);
    });
    if (!names.length) return "";
    var isPg = engine === "postgres";
    var hint = isPg
      ? 'Execute as consultas do exercício e veja o <strong>plano de execução</strong> do banco: use <code>EXPLAIN</code> para ver a estratégia escolhida e <code>EXPLAIN ANALYZE</code> para ver também os tempos. Crie um índice e rode de novo para comparar.'
      : 'Espaço para praticar: escreva uma consulta, clique em <strong>Rodar</strong> e veja o resultado nas tabelas do exercício.';
    return '<div class="sql-playground" data-sql-playground="1" data-engine="' + engine + '">' +
      '<div class="sql-playground-head">' +
      '<span class="sql-playground-label">Rodar query</span>' +
      '<span class="sql-playground-tables">tabelas: ' + names.join(", ") + '</span>' +
      '</div>' +
      '<p class="sql-playground-hint">' + hint + ' Cada execução recomeça com os dados originais, então dá para testar à vontade.</p>' +
      '<textarea class="sql-playground-input" rows="4" spellcheck="false" placeholder="SELECT * FROM ' + names[0] + ' LIMIT 10;"></textarea>' +
      '<div class="sql-playground-actions">' +
      '<button type="button" class="sql-playground-run">Rodar</button>' +
      '<span class="sql-playground-status"></span>' +
      '</div>' +
      '<div class="sql-playground-result"></div>' +
      '</div>';
  }

  function renderSqlResult(container, res) {
    if (!res || !res.length) {
      container.innerHTML = '<div class="sql-playground-empty">Comando executado. Nenhuma linha para exibir.</div>';
      return;
    }
    // EXPLAIN devolve uma coluna "QUERY PLAN" com uma linha por linha do plano.
    if (res.length === 1 && res[0].columns.length === 1 && /^query plan$/i.test(res[0].columns[0])) {
      var plan = res[0].values.map(function (r) { return String(r[0]); }).join("\n");
      container.innerHTML = '<pre class="sql-playground-explain">' + escapeHtml(plan) + '</pre>';
      return;
    }
    var html = "";
    res.forEach(function (r) {
      html += '<div class="sql-playground-table-wrap"><table><thead><tr>';
      r.columns.forEach(function (c) { html += '<th>' + escapeHtml(String(c)) + '</th>'; });
      html += '</tr></thead><tbody>';
      r.values.forEach(function (row) {
        html += '<tr>';
        row.forEach(function (cell) {
          var isNull = (cell === null || cell === undefined);
          html += '<td' + (isNull ? ' class="is-null"' : '') + '>' + (isNull ? 'NULL' : escapeHtml(String(cell))) + '</td>';
        });
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    });
    container.innerHTML = html;
  }

  function runSqlite(root, data, sql, status, result, btn) {
    status.textContent = window.initSqlJs ? "executando…" : "preparando…";
    var tables = playgroundTables(data);
    ensureSqlJs().then(function (SQL) {
      status.textContent = "";
      var db = null;
      try {
        db = seedDatabase(SQL, tables);
        renderSqlResult(result, db.exec(sql));
      } catch (e) {
        result.innerHTML = '<div class="sql-playground-error">' + escapeHtml(String((e && e.message) || e)) + '</div>';
      } finally {
        if (db) db.close();
        btn.disabled = false;
      }
    }, function (err) {
      status.textContent = "";
      btn.disabled = false;
      result.innerHTML = '<div class="sql-playground-error">' + escapeHtml(String((err && err.message) || err)) + '</div>';
    });
  }

  function runPostgres(root, data, sql, status, result, btn) {
    var seedSql = (data.project && data.project.seedSql) || "";
    status.textContent = window.__pgliteOk && pglitePromise ? "executando…" : "preparando o banco… (a primeira vez leva alguns segundos)";
    ensurePglite().then(function (db) {
      status.textContent = "executando…";
      return db.exec("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")
        .then(function () { return seedSql ? db.exec(seedSql) : null; })
        .then(function () { return db.exec(sql); })
        .then(function (results) {
          status.textContent = "";
          renderSqlResult(result, pgResultsToRows(results));
          btn.disabled = false;
        });
    }).catch(function (err) {
      status.textContent = "";
      btn.disabled = false;
      result.innerHTML = '<div class="sql-playground-error">' + escapeHtml(String((err && err.message) || err)) + '</div>';
    });
  }

  function wireSqlPlayground(root, data) {
    var btn = root.querySelector('.sql-playground-run');
    var input = root.querySelector('.sql-playground-input');
    var status = root.querySelector('.sql-playground-status');
    var result = root.querySelector('.sql-playground-result');
    var engine = root.getAttribute('data-engine');
    btn.addEventListener('click', function () {
      var sql = input.value.replace(/^\s+|\s+$/g, "");
      if (!sql) return;
      btn.disabled = true;
      result.innerHTML = "";
      if (engine === "postgres") runPostgres(root, data, sql, status, result, btn);
      else runSqlite(root, data, sql, status, result, btn);
    });
  }

  function renderQuiz(topicId, levelIdx) {
    currentTopic = topicId;
    currentLevel = levelIdx;
    var data = TOPICS[topicId];
    var level = data.levels[levelIdx];
    var st = getTopicState(topicId);

    var ctx = activeCtx;
    ctx.titleEl.textContent = data.title;
    ctx.subtitleEl.textContent = "Nível " + (levelIdx + 1) + " de 4, " + level.name + " · " + level.questions.length + " questões";
    ctx.scoreEl.textContent = "";
    ctx.successEl.classList.remove('show');
    ctx.checkBtn.style.display = "";
    ctx.checkBtn.className = "quiz-check-btn";
    ctx.checkBtn.textContent = "Verificar respostas";
    ctx.checkBtn.onclick = checkAnswers;

    var saved = (st.answers[levelIdx]) || {};

    var html = levelStepperHtml(topicId, levelIdx);

    html += projectBannerHtml(data);

    var links = levelLinks(level);
    var linksHtml = links.map(function (l) {
      var m = /^\[([^\]]+)\]\s*/.exec(l.label || "");
      var kind = m ? m[1] : "";
      var text = m ? l.label.slice(m[0].length) : (l.label || "");
      var kindHtml = kind ? '<span class="lesson-link-kind kind-' + normalize(kind).replace(/[^a-z]/g, "") + '">' + kind + '</span>' : "";
      return '<a class="lesson-link" href="' + l.url + '" target="_blank" rel="noopener">' + kindHtml + escapeHtml(text) + '</a>';
    }).join('');
    html += '<div class="lesson-box"><span class="lesson-label">Antes de responder</span><p>' + level.explain + '</p><div class="lesson-links">' + linksHtml + '</div></div>';

    html += sqlPlaygroundHtml(data);

    level.questions.forEach(function (q, i) {
      html += '<div class="quiz-q" data-qi="' + i + '">';
      html += '<div class="q-text"><span class="q-num">' + (i + 1) + '.</span>' + q.q + '</div>';
      if (q.type === "mc") {
        html += '<div class="quiz-opts">';
        q.options.forEach(function (opt, oi) {
          var checked = (saved[i] !== undefined && Number(saved[i]) === oi) ? "checked" : "";
          html += '<label class="quiz-opt" data-oi="' + oi + '"><input type="radio" name="q' + i + '" value="' + oi + '" ' + checked + '>' + opt + '</label>';
        });
        html += '</div>';
      } else if (q.type === "code") {
        var codeVal = saved[i] !== undefined ? saved[i] : "";
        var codePlaceholder = /\bquery\b/i.test(q.q) ? "Escreva sua query aqui..." : "Escreva sua resposta aqui...";
        html += '<div class="quiz-code">';
        if (q.schemaHint) html += '<div class="code-hint">' + q.schemaHint + '</div>';
        html += '<textarea name="q' + i + '" rows="4" placeholder="' + codePlaceholder + '">' + escapeHtml(codeVal) + '</textarea>';
        html += '</div>';
      } else if (q.type === "terminal") {
        var termVal = saved[i] !== undefined ? saved[i] : "";
        html += '<div class="quiz-terminal">';
        if (q.schemaHint) html += '<div class="code-hint">' + q.schemaHint + '</div>';
        html += '<div class="terminal-bar"><span class="terminal-dot d1"></span><span class="terminal-dot d2"></span><span class="terminal-dot d3"></span></div>';
        html += '<div class="terminal-line"><span class="terminal-prompt">' + (q.shell || "$") + '</span><input type="text" class="terminal-input" name="q' + i + '" autocomplete="off" spellcheck="false" placeholder="digite o comando" value="' + (termVal ? escapeHtml(termVal).replace(/"/g, '&quot;') : "") + '"></div>';
        html += '</div>';
      } else {
        var val = saved[i] !== undefined ? saved[i] : "";
        html += '<div class="quiz-fill"><input type="text" name="q' + i + '" placeholder="Digite sua resposta" value="' + (val ? String(val).replace(/"/g, '&quot;') : "") + '"></div>';
      }
      html += '<div class="quiz-feedback"></div>';
      html += '</div>';
    });

    var isLastLevel = (levelIdx === data.levels.length - 1);
    if (isLastLevel && st.done) {
      html += finalProjectHtml(data);
    }

    ctx.bodyEl.innerHTML = html;

    ctx.bodyEl.querySelectorAll('.level-dot[data-clickable="1"]').forEach(function (dot) {
      dot.addEventListener('click', function () {
        renderQuiz(topicId, Number(dot.getAttribute('data-level')));
      });
    });

    var pg = ctx.bodyEl.querySelector('[data-sql-playground]');
    if (pg) wireSqlPlayground(pg, data);

    if (isLastLevel && st.done) {
      ctx.checkBtn.style.display = "none";
      ctx.successEl.textContent = "Tópico concluído! Você passou pelos 4 níveis.";
      ctx.successEl.classList.add('show');
    }
  }

  function openQuiz(topicId) {
    if (!TOPICS[topicId]) return;
    activeCtx = modalCtx;
    var st = getTopicState(topicId);
    renderQuiz(topicId, st.level);
    modalCtx.overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeQuiz() {
    modalCtx.overlay.classList.add('hidden');
    document.body.style.overflow = '';
    currentTopic = null;
  }

  function checkAnswers() {
    if (!currentTopic) return;
    var topicId = currentTopic;
    var levelIdx = currentLevel;
    var data = TOPICS[topicId];
    var level = data.levels[levelIdx];
    var st = getTopicState(topicId);
    var ctx = activeCtx;
    var qBlocks = ctx.bodyEl.querySelectorAll('.quiz-q');
    var correctCount = 0;
    var answers = {};

    qBlocks.forEach(function (block) {
      var i = Number(block.getAttribute('data-qi'));
      var q = level.questions[i];
      var feedback = block.querySelector('.quiz-feedback');
      var isCorrect = false;
      var userVal = null;

      if (q.type === "mc") {
        var checkedInput = block.querySelector('input[type="radio"]:checked');
        userVal = checkedInput ? Number(checkedInput.value) : null;
        isCorrect = userVal === q.correct;
        block.querySelectorAll('.quiz-opt').forEach(function (optEl) {
          var oi = Number(optEl.getAttribute('data-oi'));
          optEl.classList.remove('answer-correct', 'answer-wrong');
          if (oi === q.correct) optEl.classList.add('answer-correct');
          else if (oi === userVal && !isCorrect) optEl.classList.add('answer-wrong');
        });
      } else if (q.type === "code") {
        var codeEl = block.querySelector('textarea');
        userVal = codeEl ? codeEl.value : "";
        var normCode = userVal.toUpperCase();
        isCorrect = normCode.trim().length > 0 && (q.requiredGroups || []).every(function (group) {
          return group.some(function (term) { return normCode.indexOf(term.toUpperCase()) !== -1; });
        });
      } else if (q.type === "terminal") {
        var termEl = block.querySelector('.terminal-input');
        userVal = termEl ? termEl.value : "";
        var normTerm = userVal.toUpperCase();
        isCorrect = normTerm.trim().length > 0 && (q.requiredGroups || []).every(function (group) {
          return group.some(function (term) { return normTerm.indexOf(term.toUpperCase()) !== -1; });
        });
      } else {
        var inputEl = block.querySelector('input[type="text"]');
        userVal = inputEl ? inputEl.value : "";
        var norm = normalize(userVal);
        isCorrect = q.accept.some(function (a) { return normalize(a) === norm; }) && norm.length > 0;
      }

      answers[i] = userVal;
      block.classList.remove('correct', 'incorrect');
      block.classList.add(isCorrect ? 'correct' : 'incorrect');
      var feedbackHtml = (isCorrect ? "Certo. " : ((q.type === "code" || q.type === "terminal") ? "Não bateu exatamente com o esperado, mas veja o padrão abaixo. " : "Não foi dessa vez. ")) + (q.explain || "");
      if ((q.type === "code" || q.type === "terminal") && q.sample) {
        feedbackHtml += '<div class="code-sample-label">' + (q.type === "terminal" ? "Comando de referência" : "Exemplo de resposta") + '</div><pre class="code-sample">' + escapeHtml(q.sample) + '</pre>';
        if (q.type === "terminal" && q.output) {
          feedbackHtml += '<div class="code-sample-label">Saída simulada do terminal</div><pre class="terminal-output-sample">' + escapeHtml(q.output) + '</pre>';
        }
      }
      feedback.innerHTML = feedbackHtml;
      if (isCorrect) correctCount++;
    });

    var total = level.questions.length;
    ctx.scoreEl.textContent = correctCount + "/" + total + " corretas";

    st.answers[levelIdx] = answers;
    var levelPassed = (correctCount === total);

    if (levelPassed) {
      st.doneLevels[levelIdx] = true;
      var isLastLevel = (levelIdx === data.levels.length - 1);
      if (isLastLevel) {
        st.done = true;
        ctx.successEl.textContent = "Tópico concluído! Você passou pelos 4 níveis.";
        ctx.successEl.classList.add('show');
        ctx.checkBtn.style.display = "none";
        ctx.bodyEl.insertAdjacentHTML('beforeend', finalProjectHtml(data));
      } else {
        if (st.level <= levelIdx) st.level = levelIdx + 1;
        ctx.successEl.textContent = "Nível concluído! Pronto para avançar.";
        ctx.successEl.classList.add('show');
        ctx.checkBtn.textContent = "Avançar para o próximo nível →";
        ctx.checkBtn.className = "quiz-next-btn";
        ctx.checkBtn.onclick = function () { renderQuiz(topicId, levelIdx + 1); };
      }
    } else {
      ctx.successEl.classList.remove('show');
    }

    saveQuizState();
    updateStats();
    if (ctx === pageCtx) {
      var parsedHash = parseHash();
      if (parsedHash && parsedHash.subtopic) refreshSubtopicChrome(parsedHash.chapter, parsedHash.subtopic);
    }

    if (!levelPassed) {
      ctx.checkBtn.className = "quiz-check-btn";
      ctx.checkBtn.textContent = "Verificar respostas";
      ctx.checkBtn.onclick = checkAnswers;
    }
  }

  document.querySelectorAll('.quiz-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openQuiz(btn.getAttribute('data-topic'));
    });
  });
  closeBtn.addEventListener('click', closeQuiz);
  modalCtx.overlay.addEventListener('click', function (e) { if (e.target === modalCtx.overlay) closeQuiz(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modalCtx.overlay.classList.contains('hidden')) closeQuiz();
  });

  var chapterBackBtn = document.getElementById('chapter-back-btn');
  if (chapterBackBtn) chapterBackBtn.addEventListener('click', function () { location.hash = '#/learning'; });
  var subtopicBackBtn = document.getElementById('subtopic-back-btn');
  if (subtopicBackBtn) subtopicBackBtn.addEventListener('click', function () {
    var parsed = parseHash();
    location.hash = (parsed && parsed.chapter) ? ('#/capitulo/' + parsed.chapter) : '#/learning';
  });
  window.addEventListener('hashchange', route);

  function loadTrilhaData() {
    // no-store: durante o desenvolvimento (servido por HTTP), o navegador sempre
    // busca a versão nova de data/*.json em vez de servir do cache.
    var noStore = { cache: 'no-store' };
    return fetch('data/chapters.json', noStore).then(function (r) { return r.json(); }).then(function (chapters) {
      CHAPTERS = chapters;
      return fetch('data/resources.json', noStore).then(function (r) { return r.json(); }).catch(function () { return {}; });
    }).then(function (resources) {
      RESOURCES = resources || {};
      return fetch('data/topics-manifest.json', noStore).then(function (r) { return r.json(); });
    }).then(function (manifest) {
      return Promise.all(manifest.map(function (entry) {
        return fetch('data/topics/' + entry.file, noStore).then(function (r) { return r.json(); }).then(function (data) {
          TOPICS[entry.id] = data;
        });
      }));
    });
  }

  loadTrilhaData().then(function () {
    initTopics();
    route();
  }).catch(function (err) {
    console.error('Falha ao carregar os dados da trilha:', err);
    var el = document.createElement('div');
    el.style.cssText = 'padding:40px;font-family:sans-serif;color:#b00;max-width:640px;margin:0 auto;';
    el.textContent = 'Não foi possível carregar os dados da trilha (data/*.json). Se você abriu este arquivo diretamente (file://), sirva a pasta com um servidor local, veja o README.';
    document.body.prepend(el);
  });
})();
