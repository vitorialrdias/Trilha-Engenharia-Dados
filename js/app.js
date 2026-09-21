
(function () {
  "use strict";

  var TOPICS = {};
  var ACHIEVEMENTS = {};

  var QUIZ_STATE_KEY = "trilha-dados-quiz-v2";
  var quizState = {};
  try {
    var qraw = localStorage.getItem(QUIZ_STATE_KEY);
    if (qraw) quizState = JSON.parse(qraw) || {};
  } catch (e) { quizState = {}; }

  function saveQuizState() {
    persistLocal(QUIZ_STATE_KEY, quizState);
    queueRemoteSync('quiz');
  }

  // Histórico real de tentativas por questão (separado de quizState porque
  // quizState guarda só a última resposta — aqui acumula quantas vezes cada
  // questão foi respondida e quantas dessas vezes deu erro, pra progresso real).
  var HISTORY_KEY = "trilha-dados-historico-v1";
  var historyState = {};
  try {
    var hraw = localStorage.getItem(HISTORY_KEY);
    if (hraw) historyState = JSON.parse(hraw) || {};
  } catch (e) { historyState = {}; }

  function saveHistoryState() {
    persistLocal(HISTORY_KEY, historyState);
    queueRemoteSync('history');
  }

  function recordQuestionAttempt(topicId, levelIdx, questionIndex, isCorrect) {
    var key = topicId + "|" + levelIdx + "|" + questionIndex;
    var entry = historyState[key];
    if (!entry) entry = historyState[key] = { attempts: 0, errors: 0, firstCorrectAt: null, lastAttemptAt: null, lastCorrect: false };
    entry.attempts++;
    if (!isCorrect) entry.errors++;
    else if (!entry.firstCorrectAt) entry.firstCorrectAt = Date.now();
    entry.lastAttemptAt = Date.now();
    entry.lastCorrect = isCorrect;
  }

  function historySummary() {
    var keys = Object.keys(historyState);
    var neverMissed = 0;
    var reworked = 0;
    keys.forEach(function (k) {
      var e = historyState[k];
      if (e.errors === 0) neverMissed++;
      else reworked++;
    });
    var firstTryRate = keys.length ? Math.round((neverMissed / keys.length) * 100) : 0;
    return { answeredCount: keys.length, firstTryRate: firstTryRate, reworked: reworked };
  }

  // Conquistas: recompensa por progresso, constância e conclusão de capítulos/trilha.
  // Sem certificado, sem nota, sem comparação entre pessoas — só marcos do próprio percurso.
  var ACHV_STATE_KEY = "trilha-dados-conquistas-v1";
  var achvState = { studyDays: [], acknowledged: [] };
  try {
    var araw = localStorage.getItem(ACHV_STATE_KEY);
    if (araw) achvState = JSON.parse(araw) || achvState;
  } catch (e) { }
  if (!achvState.studyDays) achvState.studyDays = [];
  if (!achvState.acknowledged) achvState.acknowledged = [];

  function saveAchvState() {
    persistLocal(ACHV_STATE_KEY, achvState);
    queueRemoteSync('achievements');
  }

  // Caderno de anotações: uma anotação por tópico (título + texto livre),
  // escrita pelo estudante. Nada aqui é gerado pela trilha.
  var CADERNO_KEY = "trilha-dados-caderno-v1";
  var notesState = [];
  try {
    var nraw = localStorage.getItem(CADERNO_KEY);
    if (nraw) notesState = JSON.parse(nraw) || [];
  } catch (e) { notesState = []; }

  function saveNotesState() {
    persistLocal(CADERNO_KEY, notesState);
    queueRemoteSync('caderno');
  }

  function notesForTopic(topicId) {
    return notesState.filter(function (n) { return n.topicId === topicId; })
      .sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  }

  function allNotesSorted() {
    return notesState.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  }

  function upsertNote(note) {
    var idx = -1;
    for (var i = 0; i < notesState.length; i++) { if (notesState[i].id === note.id) { idx = i; break; } }
    if (idx === -1) notesState.push(note); else notesState[idx] = note;
    saveNotesState();
  }

  function deleteNoteById(id) {
    notesState = notesState.filter(function (n) { return n.id !== id; });
    saveNotesState();
  }

  function newNoteId() {
    return "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function todayStr() {
    var d = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function daysBetween(a, b) {
    var da = new Date(a + "T00:00:00");
    var db = new Date(b + "T00:00:00");
    return Math.round((db - da) / 86400000);
  }

  function recordStudyDay() {
    var t = todayStr();
    if (achvState.studyDays.indexOf(t) === -1) {
      achvState.studyDays.push(t);
      saveAchvState();
    }
  }

  function longestStreak(days) {
    if (!days.length) return 0;
    var sorted = days.slice().sort();
    var best = 1, cur = 1;
    for (var i = 1; i < sorted.length; i++) {
      cur = (daysBetween(sorted[i - 1], sorted[i]) === 1) ? cur + 1 : 1;
      if (cur > best) best = cur;
    }
    return best;
  }

  function currentStreak(days) {
    if (!days.length) return 0;
    var sorted = days.slice().sort();
    var gap = daysBetween(sorted[sorted.length - 1], todayStr());
    if (gap > 1) return 0;
    var streak = 1;
    for (var i = sorted.length - 1; i > 0; i--) {
      if (daysBetween(sorted[i - 1], sorted[i]) === 1) streak++;
      else break;
    }
    return streak;
  }

  function doneTopicsCount() {
    var n = 0;
    Object.keys(TOPICS).forEach(function (id) { if (quizState[id] && quizState[id].done) n++; });
    return n;
  }

  // Uma conquista por capítulo é derivada direto de CHAPTERS — capítulo novo
  // ganha o badge automaticamente, sem precisar tocar neste arquivo.
  function computeAchievements() {
    var list = [];
    var doneCount = doneTopicsCount();
    var totalTopics = Object.keys(TOPICS).length;
    var days = achvState.studyDays || [];
    var streak = longestStreak(days);
    var totalDays = days.length;

    (ACHIEVEMENTS.progress || []).forEach(function (a) {
      list.push({ id: a.id, title: a.title, desc: a.desc, icon: a.icon, category: "Progresso", unlocked: doneCount >= a.min });
    });

    (ACHIEVEMENTS.consistency || []).forEach(function (a) {
      var value = a.type === "streak" ? streak : totalDays;
      list.push({ id: a.id, title: a.title, desc: a.desc, icon: a.icon, category: "Constância", unlocked: value >= a.min });
    });

    Object.keys(CHAPTERS).forEach(function (slug) {
      var ch = CHAPTERS[slug];
      var all = chapterSubtopics(ch);
      if (!all.length) return;
      var chDone = all.filter(function (s) { return getTopicState(s.topicId).done; }).length;
      list.push({
        id: "capitulo-" + slug,
        title: "Capítulo concluído: " + ch.title,
        desc: "Terminou todos os sub-tópicos de " + ch.title + ".",
        icon: ch.icon,
        category: "Capítulos",
        unlocked: chDone === all.length
      });
    });

    if (ACHIEVEMENTS.completion && totalTopics > 0) {
      var c = ACHIEVEMENTS.completion;
      list.push({ id: c.id, title: c.title, desc: c.desc, icon: c.icon, category: "Trilha completa", unlocked: doneCount === totalTopics });
    }

    return list;
  }

  function showAchievementToast(items) {
    if (!items.length) return;
    var host = document.getElementById('achievement-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'achievement-toast-host';
      document.body.appendChild(host);
    }
    items.forEach(function (a) {
      var el = document.createElement('div');
      el.className = 'achievement-toast';
      el.innerHTML = '<span class="achievement-toast-icon">' + a.icon + '</span>' +
        '<div><div class="achievement-toast-label">Conquista desbloqueada</div>' +
        '<div class="achievement-toast-title">' + escapeHtml(a.title) + '</div></div>';
      host.appendChild(el);
      setTimeout(function () { el.classList.add('show'); }, 20);
      setTimeout(function () {
        el.classList.remove('show');
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
      }, 5000);
    });
  }

  // Ao carregar o app pela 1ª vez após esta funcionalidade existir, marca como já
  // vistas as conquistas que o progresso salvo já cumpre, sem disparar toast em lote.
  function syncAchievementsSilently() {
    var unlockedIds = computeAchievements().filter(function (a) { return a.unlocked; }).map(function (a) { return a.id; });
    var changed = false;
    unlockedIds.forEach(function (id) {
      if (achvState.acknowledged.indexOf(id) === -1) { achvState.acknowledged.push(id); changed = true; }
    });
    if (changed) saveAchvState();
  }

  function notifyNewAchievements() {
    var all = computeAchievements();
    var unlockedIds = all.filter(function (a) { return a.unlocked; }).map(function (a) { return a.id; });
    var newOnes = unlockedIds.filter(function (id) { return achvState.acknowledged.indexOf(id) === -1; });
    if (!newOnes.length) return;
    achvState.acknowledged = achvState.acknowledged.concat(newOnes);
    saveAchvState();
    showAchievementToast(all.filter(function (a) { return newOnes.indexOf(a.id) !== -1; }));
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
    buildTopicChapterIndex();
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
  var notesFormState = { editingId: null };
  var notesBrowseState = { mode: 'closed', topicId: null };

  var CHAPTERS = {};
  var RESOURCES = {};
  var TOPIC_CHAPTER = {};

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

  // Uma cor por capítulo, distribuída pelo círculo cromático a partir da posição
  // do capítulo em CHAPTERS. Capítulo novo ganha cor sozinho, sem editar nada aqui.
  function chapterHue(chapterSlug) {
    var slugs = Object.keys(CHAPTERS);
    var i = slugs.indexOf(chapterSlug);
    if (i === -1) return 200;
    return Math.round((360 / slugs.length) * i);
  }

  function buildTopicChapterIndex() {
    TOPIC_CHAPTER = {};
    Object.keys(CHAPTERS).forEach(function (slug) {
      var ch = CHAPTERS[slug];
      chapterSubtopics(ch).forEach(function (s) {
        TOPIC_CHAPTER[s.topicId] = { chapterSlug: slug, chapterTitle: ch.title, slug: s.slug, hue: chapterHue(slug) };
      });
    });
  }

  function parseHash() {
    var h = (location.hash || "").replace(/^#\/?/, "");
    var parts = h.split("/").filter(Boolean);
    if (!parts.length) return { view: "home" };
    if (parts[0] === "learning") return { view: "learning" };
    if (parts[0] === "recursos") return { view: "recursos" };
    if (parts[0] === "conquistas") return { view: "conquistas" };
    if (parts[0] === "caderno") return { view: "caderno" };
    if (parts[0] === "sobre") return { view: "about" };
    if (parts[0] === "capitulo" && parts[1]) {
      return { view: "capitulo", chapter: parts[1], subtopic: parts[2] || null };
    }
    return { view: "home" };
  }

  function showView(name) {
    ['home', 'learning', 'recursos', 'conquistas', 'caderno', 'about', 'chapter', 'subtopic'].forEach(function (v) {
      var el = document.getElementById('view-' + v);
      if (el) el.classList.toggle('hidden', v !== name);
    });
    window.scrollTo(0, 0);
  }

  function setActiveNav(view) {
    var active = (view === 'home' || view === 'about' || view === 'recursos' || view === 'conquistas' || view === 'caderno') ? view : 'learning';
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

  function achievementCardHtml(a) {
    return '<div class="achv-card' + (a.unlocked ? ' is-unlocked' : ' is-locked') + '">' +
      '<div class="achv-icon">' + (a.unlocked ? a.icon : '🔒') + '</div>' +
      '<div class="achv-title">' + escapeHtml(a.title) + '</div>' +
      '<div class="achv-desc">' + escapeHtml(a.desc) + '</div>' +
      '</div>';
  }

  function renderAchievementsView() {
    var all = computeAchievements();
    var unlocked = all.filter(function (a) { return a.unlocked; });
    var setText = function (id, text) { var el = document.getElementById(id); if (el) el.textContent = text; };
    setText('achv-summary-count', unlocked.length + '/' + all.length);
    setText('achv-streak-atual', currentStreak(achvState.studyDays));
    setText('achv-streak-recorde', longestStreak(achvState.studyDays));
    setText('achv-dias-estudo', achvState.studyDays.length);
    var hist = historySummary();
    setText('achv-taxa-sem-erro', hist.answeredCount ? (hist.firstTryRate + '%') : '–');
    setText('achv-questoes-retrabalho', hist.answeredCount ? hist.reworked : '–');

    var byCategory = {}, order = [];
    all.forEach(function (a) {
      if (!byCategory[a.category]) { byCategory[a.category] = []; order.push(a.category); }
      byCategory[a.category].push(a);
    });

    var host = document.getElementById('achievements-grid');
    if (host) {
      host.innerHTML = order.map(function (cat) {
        var cards = byCategory[cat].map(achievementCardHtml).join('');
        return '<div class="achv-group"><h3 class="achv-group-title">' + escapeHtml(cat) + '</h3>' +
          '<div class="achv-cards">' + cards + '</div></div>';
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

  // Caderno de anotações -------------------------------------------------

  function formatNoteDate(ts) {
    var d = new Date(ts);
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function noteExcerpt(body, n) {
    var s = String(body || "").trim();
    return s.length > n ? s.slice(0, n).trim() + "…" : s;
  }

  function noteFormHtml(note) {
    var title = note ? escapeHtml(note.title || "") : "";
    var body = note ? escapeHtml(note.body || "") : "";
    return '<form class="note-form" id="note-form">' +
      '<input type="text" name="title" class="note-form-title" placeholder="Título da anotação" value="' + title + '" maxlength="80">' +
      '<textarea name="body" class="note-form-body" rows="5" placeholder="Escreva aqui, com suas palavras...">' + body + '</textarea>' +
      '<div class="note-form-actions">' +
      '<button type="submit" class="note-form-save">Salvar</button>' +
      '<button type="button" class="note-form-cancel" id="note-form-cancel">Cancelar</button>' +
      '</div></form>';
  }

  function noteCardHtmlForTopic(note, currentTopicId) {
    var info = TOPIC_CHAPTER[note.topicId];
    var tagHtml = "";
    if (note.topicId !== currentTopicId && info) {
      var tagBg = 'hsla(' + info.hue + ', 60%, 50%, 0.16)';
      var tagColor = 'hsl(' + info.hue + ', 55%, 32%)';
      tagHtml = '<a class="note-chapter-tag" href="#/capitulo/' + info.chapterSlug + '/' + info.slug + '" style="background:' + tagBg + ';color:' + tagColor + '">' + escapeHtml(info.chapterSlug.toUpperCase()) + '</a>';
    }
    return '<div class="note-card" data-note-id="' + note.id + '">' +
      '<div class="note-card-top">' + tagHtml + '<span class="note-date">' + formatNoteDate(note.updatedAt) + '</span></div>' +
      '<div class="note-card-title">' + escapeHtml(note.title || "Sem título") + '</div>' +
      '<div class="note-card-body">' + escapeHtml(note.body || "") + '</div>' +
      '<div class="note-card-actions">' +
      '<button type="button" class="note-action" data-note-edit="' + note.id + '">Editar</button>' +
      '<button type="button" class="note-action note-action-danger" data-note-delete="' + note.id + '">Excluir</button>' +
      '</div></div>';
  }

  function noteCardHtmlForCaderno(note) {
    var info = TOPIC_CHAPTER[note.topicId];
    var hue = info ? info.hue : 200;
    var border = 'hsl(' + hue + ', 55%, 42%)';
    var tagBg = 'hsla(' + hue + ', 60%, 50%, 0.16)';
    var tagColor = 'hsl(' + hue + ', 55%, 32%)';
    var chapterLabel = info ? info.chapterSlug.toUpperCase() : "";
    var openHref = info ? ('#/capitulo/' + info.chapterSlug + '/' + info.slug) : "#/caderno";
    return '<div class="note-card caderno-card" style="border-left-color:' + border + '" data-note-id="' + note.id + '">' +
      '<div class="note-card-top">' +
      '<span class="note-chapter-tag" style="background:' + tagBg + ';color:' + tagColor + '">' + escapeHtml(chapterLabel) + '</span>' +
      '<span class="note-date">' + formatNoteDate(note.updatedAt) + '</span>' +
      '</div>' +
      '<div class="note-card-title">' + escapeHtml(note.title || "Sem título") + '</div>' +
      '<div class="note-card-body">' + escapeHtml(noteExcerpt(note.body, 220)) + '</div>' +
      '<div class="note-card-actions">' +
      '<a class="note-action" href="' + openHref + '">Ver no tópico →</a>' +
      '<button type="button" class="note-action note-action-danger" data-note-delete="' + note.id + '">Excluir</button>' +
      '</div></div>';
  }

  // Navegação em dois níveis: um botão "Notas" fechado por padrão, que abre a
  // lista de tópicos com anotações; clicar num tópico mostra só as notas dele.
  // Nunca navega (não mexe em location.hash) — só troca o conteúdo do painel.
  function topicsWithNotes() {
    var byTopic = {};
    var order = [];
    notesState.forEach(function (n) {
      if (!byTopic[n.topicId]) { byTopic[n.topicId] = 0; order.push(n.topicId); }
      byTopic[n.topicId]++;
    });
    return order.map(function (tid) {
      var info = TOPIC_CHAPTER[tid];
      var topicData = TOPICS[tid];
      return { topicId: tid, title: topicData ? topicData.title : tid, info: info, count: byTopic[tid] };
    }).sort(function (a, b) { return a.title.localeCompare(b.title, 'pt-BR'); });
  }

  function notesTopicListHtml(topics, currentTopicId) {
    return '<div class="notes-topic-list">' + topics.map(function (t) {
      var hue = t.info ? t.info.hue : 200;
      var isCurrent = t.topicId === currentTopicId;
      return '<button type="button" class="notes-topic-item' + (isCurrent ? ' is-current' : '') + '" data-notes-topic="' + t.topicId + '">' +
        '<span class="notes-page-dot" style="background:hsl(' + hue + ',55%,45%)"></span>' +
        '<span class="notes-topic-title">' + escapeHtml(t.title) + '</span>' +
        '<span class="notes-topic-count">' + t.count + '</span>' +
        '</button>';
    }).join('') + '</div>';
  }

  function renderNotesPanel(topicId) {
    var panel = document.getElementById('notes-panel');
    if (!panel) return;
    var showForm = notesFormState.editingId !== null;
    var editingNote = (showForm && notesFormState.editingId !== 'new')
      ? notesState.filter(function (n) { return n.id === notesFormState.editingId; })[0]
      : null;

    var html = '<div class="notes-panel-head"><span class="notes-panel-label">📝 Minhas anotações</span>';
    if (!showForm) html += '<button type="button" class="notes-add-btn" id="notes-add-btn">+ Nova</button>';
    html += '</div>';

    if (showForm) {
      html += noteFormHtml(editingNote);
    } else if (!notesState.length) {
      html += '<p class="notes-empty">Nenhuma anotação ainda. Escreva com suas palavras o que quer lembrar depois.</p>';
    } else if (notesBrowseState.mode === 'closed') {
      html += '<button type="button" class="notes-browse-btn" id="notes-browse-btn">📂 Notas <span class="notes-browse-count">(' + notesState.length + ')</span></button>';
    } else if (notesBrowseState.mode === 'topics') {
      html += '<div class="notes-browse-head"><button type="button" class="notes-back-btn" id="notes-close-btn">✕ Fechar</button></div>';
      html += notesTopicListHtml(topicsWithNotes(), topicId);
    } else if (notesBrowseState.mode === 'topicNotes') {
      var topicNotes = notesForTopic(notesBrowseState.topicId);
      var topicTitle = (TOPICS[notesBrowseState.topicId] || {}).title || notesBrowseState.topicId;
      html += '<div class="notes-browse-head"><button type="button" class="notes-back-btn" id="notes-back-to-topics">← Tópicos</button><span class="notes-browse-title">' + escapeHtml(topicTitle) + '</span></div>';
      html += '<div class="notes-topic-notes">' + topicNotes.map(function (n) { return noteCardHtmlForTopic(n, topicId); }).join('') + '</div>';
    }

    panel.innerHTML = html;
    wireNotesPanel(panel, topicId);
  }

  function wireNotesPanel(panel, topicId) {
    var addBtn = panel.querySelector('#notes-add-btn');
    if (addBtn) addBtn.addEventListener('click', function () {
      notesFormState = { editingId: 'new' };
      renderNotesPanel(topicId);
    });
    var browseBtn = panel.querySelector('#notes-browse-btn');
    if (browseBtn) browseBtn.addEventListener('click', function () {
      notesBrowseState = { mode: 'topics', topicId: null };
      renderNotesPanel(topicId);
    });
    var closeBtn = panel.querySelector('#notes-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', function () {
      notesBrowseState = { mode: 'closed', topicId: null };
      renderNotesPanel(topicId);
    });
    var backBtn = panel.querySelector('#notes-back-to-topics');
    if (backBtn) backBtn.addEventListener('click', function () {
      notesBrowseState = { mode: 'topics', topicId: null };
      renderNotesPanel(topicId);
    });
    panel.querySelectorAll('[data-notes-topic]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        notesBrowseState = { mode: 'topicNotes', topicId: btn.getAttribute('data-notes-topic') };
        renderNotesPanel(topicId);
      });
    });
    panel.querySelectorAll('[data-note-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        notesFormState = { editingId: btn.getAttribute('data-note-edit') };
        renderNotesPanel(topicId);
      });
    });
    panel.querySelectorAll('[data-note-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-note-delete');
        if (!confirm('Excluir esta anotação? Essa ação não pode ser desfeita.')) return;
        deleteNoteById(id);
        notesFormState = { editingId: null };
        renderNotesPanel(topicId);
      });
    });
    var form = panel.querySelector('#note-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var title = form.elements.title.value.trim();
        var body = form.elements.body.value.trim();
        if (!title && !body) {
          notesFormState = { editingId: null };
          renderNotesPanel(topicId);
          return;
        }
        var isNew = notesFormState.editingId === 'new';
        var existing = !isNew ? notesState.filter(function (n) { return n.id === notesFormState.editingId; })[0] : null;
        var now = Date.now();
        var savedTopicId = isNew ? topicId : existing.topicId;
        upsertNote({
          id: isNew ? newNoteId() : existing.id,
          topicId: savedTopicId,
          title: title,
          body: body,
          createdAt: isNew ? now : existing.createdAt,
          updatedAt: now
        });
        notesFormState = { editingId: null };
        notesBrowseState = { mode: 'topicNotes', topicId: savedTopicId };
        renderNotesPanel(topicId);
      });
      var cancelBtn = panel.querySelector('#note-form-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', function () {
        notesFormState = { editingId: null };
        renderNotesPanel(topicId);
      });
    }
  }

  function renderCadernoView() {
    var grid = document.getElementById('caderno-grid');
    var emptyEl = document.getElementById('caderno-empty');
    if (!grid) return;
    var all = allNotesSorted();
    if (emptyEl) emptyEl.classList.toggle('hidden', all.length > 0);
    grid.innerHTML = all.map(noteCardHtmlForCaderno).join('');

    grid.querySelectorAll('[data-note-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-note-delete');
        if (!confirm('Excluir esta anotação? Essa ação não pode ser desfeita.')) return;
        deleteNoteById(id);
        renderCadernoView();
      });
    });

    var search = document.getElementById('caderno-search');
    if (search) {
      search.value = "";
      search.oninput = function () {
        var q = normalize(search.value);
        grid.querySelectorAll('.note-card').forEach(function (card) {
          var text = normalize(card.textContent);
          card.classList.toggle('hidden', q.length > 0 && text.indexOf(q) === -1);
        });
      };
    }
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
    if (current) renderNotesPanel(current.topicId);
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
    if (parsed.view === 'conquistas') { renderAchievementsView(); showView('conquistas'); return; }
    if (parsed.view === 'caderno') { renderCadernoView(); showView('caderno'); return; }
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

  function tableKey(t) {
    var m = /^\s*([A-Za-z_][\w]*)\s*\(/.exec(t.name || "");
    return m ? m[1] : null;
  }

  function questionTablesHtml(data, q) {
    var pool = (data.refTables || []).concat((data.project && data.project.tables) || []);
    if (!pool.length || (q.tables && !q.tables.length)) return "";
    var found = [];
    var seen = {};
    function add(t) {
      var k = tableKey(t);
      if (k && !seen[k]) { seen[k] = 1; found.push(t); }
    }
    if (q.tables) {
      q.tables.forEach(function (name) {
        pool.forEach(function (t) { if (tableKey(t) === name) add(t); });
      });
    } else {
      var text = (q.q || "") + " " + (q.schemaHint || "");
      var colOwners = {};
      pool.forEach(function (t) {
        (t.columns || []).forEach(function (c) {
          var name = String(c);
          if (name.indexOf("_") < 0) return;
          colOwners[name] = colOwners[name] === undefined ? tableKey(t) : false;
        });
      });
      pool.forEach(function (t) {
        var k = tableKey(t);
        if (!k) return;
        var hit = new RegExp("\\b" + k + "\\b").test(text);
        if (!hit) {
          (t.columns || []).forEach(function (c) {
            var name = String(c);
            if (colOwners[name] === k && new RegExp("\\b" + name + "\\b").test(text)) hit = true;
          });
        }
        if (hit) add(t);
      });
    }
    if (!found.length) return "";
    var html = '<details class="q-tables" open><summary>Tabelas de referência</summary><div class="q-tables-body">';
    found.forEach(function (t) { html += projectTableHtml(t); });
    return html + '</div></details>';
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

  function keyConceptBlockHtml(label, cls, text) {
    if (!text) return "";
    return '<div class="concept-block' + (cls ? ' ' + cls : '') + '"><span class="concept-block-label">' + label + '</span><p>' + escapeHtml(text) + '</p></div>';
  }

  // Cartão de conceito: situação concreta + código real que resolve, explicado
  // e comparado com quando NÃO vale a pena usar aquele recurso.
  function keyConceptCardHtml(c) {
    var html = '<div class="concept-card">';
    html += '<h4 class="concept-term">' + escapeHtml(c.term || "") + '</h4>';
    if (c.situation) html += '<p class="concept-situation"><strong>Situação:</strong> ' + escapeHtml(c.situation) + '</p>';
    if (c.code) html += '<pre class="code-sample concept-code">' + escapeHtml(c.code) + '</pre>';
    html += keyConceptBlockHtml("O que está acontecendo", "", c.howItWorks);
    html += keyConceptBlockHtml("Quando é bom usar", "concept-block-help", c.whenToUse);
    if (c.whenToAvoid) {
      html += '<div class="concept-block concept-block-warn"><span class="concept-block-label">Quando pode ser desnecessário</span><p>' + escapeHtml(c.whenToAvoid) + '</p>';
      if (c.altCode) html += '<pre class="code-sample concept-code">' + escapeHtml(c.altCode) + '</pre>';
      html += '</div>';
    }
    if (c.note) html += '<div class="concept-note"><span class="concept-note-label">Ponto importante</span><p>' + escapeHtml(c.note) + '</p></div>';
    html += '</div>';
    return html;
  }

  // Conceitos-chave do nível: reforço estruturado (o que é / como funciona /
  // para que serve / onde ajuda / onde atrapalha), opcional por nível — só
  // aparece nos tópicos que já ganharam essa camada de revisão de conteúdo.
  function keyConceptsHtml(level) {
    var concepts = level.keyConcepts;
    if (!concepts || !concepts.length) return "";
    return '<div class="concepts-box"><span class="concepts-label">Conceitos-chave deste nível</span>' +
      '<div class="concepts-list">' + concepts.map(keyConceptCardHtml).join('') + '</div></div>';
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

    html += keyConceptsHtml(level);

    var links = levelLinks(level);
    var linksHtml = links.map(function (l) {
      var m = /^\[([^\]]+)\]\s*/.exec(l.label || "");
      var kind = m ? m[1] : "";
      var text = m ? l.label.slice(m[0].length) : (l.label || "");
      var kindHtml = kind ? '<span class="lesson-link-kind kind-' + normalize(kind).replace(/[^a-z]/g, "") + '">' + kind + '</span>' : "";
      return '<a class="lesson-link" href="' + l.url + '" target="_blank" rel="noopener">' + kindHtml + escapeHtml(text) + '</a>';
    }).join('');
    if (level.explain) {
      html += '<div class="lesson-box"><span class="lesson-label">Antes de responder</span><p>' + level.explain + '</p><div class="lesson-links">' + linksHtml + '</div></div>';
    } else if (linksHtml) {
      html += '<div class="lesson-box"><span class="lesson-label">Materiais</span><div class="lesson-links">' + linksHtml + '</div></div>';
    }

    html += sqlPlaygroundHtml(data);

    level.questions.forEach(function (q, i) {
      html += '<div class="quiz-q" data-qi="' + i + '">';
      html += '<div class="q-text"><span class="q-num">' + (i + 1) + '.</span>' + q.q + '</div>';
      html += questionTablesHtml(data, q);
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
      recordQuestionAttempt(topicId, levelIdx, i, isCorrect);
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
    saveHistoryState();
    updateStats();
    recordStudyDay();
    notifyNewAchievements();
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

  // Sincronização opcional com Supabase: login por magic link ou Google,
  // progresso espelhado na nuvem pra acessar de qualquer navegador. Sem login,
  // o app continua 100% funcional só com localStorage, como sempre foi —
  // sync é estritamente opt-in, nunca bloqueia nem atrasa o uso normal.
  var SUPABASE_URL = "https://zusrjtdrbozpheunqzza.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_xqOl6xKG-bAQQAQ9Niu-Zg_LD_n63UU";
  var sb = (window.supabase && SUPABASE_URL.indexOf("COLOQUE_") !== 0)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  var authState = { session: null, formOpen: false };

  var SYNC_KEYS = {
    quiz: { storageKey: QUIZ_STATE_KEY, get: function () { return quizState; }, set: function (v) { quizState = v || {}; } },
    achievements: { storageKey: ACHV_STATE_KEY, get: function () { return achvState; }, set: function (v) { achvState = v || { studyDays: [], acknowledged: [] }; } },
    caderno: { storageKey: CADERNO_KEY, get: function () { return notesState; }, set: function (v) { notesState = v || []; } },
    history: { storageKey: HISTORY_KEY, get: function () { return historyState; }, set: function (v) { historyState = v || {}; } }
  };

  function persistLocal(storageKey, value) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
      localStorage.setItem(storageKey + "-updated-at", String(Date.now()));
    } catch (e) { }
  }

  function localUpdatedAt(storageKey) {
    try { return Number(localStorage.getItem(storageKey + "-updated-at")) || 0; } catch (e) { return 0; }
  }

  var syncTimers = {};
  function queueRemoteSync(key) {
    if (!sb || !authState.session) return;
    if (syncTimers[key]) clearTimeout(syncTimers[key]);
    syncTimers[key] = setTimeout(function () { pushRemoteState(key); }, 800);
  }

  function pushRemoteState(key) {
    if (!sb || !authState.session) return;
    var def = SYNC_KEYS[key];
    sb.from('progress').upsert({
      user_id: authState.session.user.id,
      key: key,
      data: def.get(),
      updated_at: new Date(localUpdatedAt(def.storageKey) || Date.now()).toISOString()
    }, { onConflict: 'user_id,key' }).then(function (res) {
      if (res.error) console.error('Sync: falha ao enviar "' + key + '"', res.error);
    });
  }

  function pullAndMergeAllState() {
    if (!sb || !authState.session) return Promise.resolve();
    return sb.from('progress').select('key,data,updated_at').eq('user_id', authState.session.user.id)
      .then(function (res) {
        if (res.error) { console.error('Sync: falha ao buscar progresso', res.error); return; }
        var remoteByKey = {};
        (res.data || []).forEach(function (row) { remoteByKey[row.key] = row; });
        Object.keys(SYNC_KEYS).forEach(function (key) {
          var def = SYNC_KEYS[key];
          var remote = remoteByKey[key];
          var localTs = localUpdatedAt(def.storageKey);
          if (!remote) {
            // Ainda não existe nada na nuvem pra essa chave: sobe o que já tem localmente
            // (protege o progresso já acumulado antes dessa funcionalidade existir).
            pushRemoteState(key);
            return;
          }
          var remoteTs = new Date(remote.updated_at).getTime();
          if (remoteTs > localTs) {
            def.set(remote.data);
            persistLocal(def.storageKey, remote.data);
          } else if (localTs > remoteTs) {
            pushRemoteState(key);
          }
        });
      }).then(function () {
        updateStats();
        route();
      });
  }

  function renderAuthWidget() {
    var host = document.getElementById('auth-widget');
    if (!host) return;
    renderHomeAuthBanner();
    if (!sb) {
      host.innerHTML = "";
      return;
    }
    if (authState.session) {
      var email = authState.session.user.email || "";
      host.innerHTML = '<span class="auth-email" title="' + escapeHtml(email) + '">' + escapeHtml(email) + '</span>' +
        '<button type="button" class="auth-btn" id="auth-logout-btn">Sair</button>';
      var logoutBtn = host.querySelector('#auth-logout-btn');
      if (logoutBtn) logoutBtn.addEventListener('click', function () { sb.auth.signOut(); });
      return;
    }
    if (!authState.formOpen) {
      host.innerHTML = '<button type="button" class="auth-btn" id="auth-open-btn">Entrar</button>';
      var openBtn = host.querySelector('#auth-open-btn');
      if (openBtn) openBtn.addEventListener('click', openAuthForm);
      return;
    }
    host.innerHTML =
      '<form class="auth-form" id="auth-form">' +
      '<input type="email" name="email" class="auth-email-input" placeholder="seu@email.com" required>' +
      '<button type="submit" class="auth-btn">Enviar link</button>' +
      '<button type="button" class="auth-btn auth-btn-google" id="auth-google-btn">Entrar com Google</button>' +
      '<button type="button" class="auth-btn-close" id="auth-close-btn">✕</button>' +
      '<span class="auth-form-msg" id="auth-form-msg"></span>' +
      '</form>';
    var form = host.querySelector('#auth-form');
    var msgEl = host.querySelector('#auth-form-msg');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.elements.email.value.trim();
      if (!email) return;
      msgEl.textContent = "Enviando...";
      sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: location.origin + location.pathname } })
        .then(function (res) {
          msgEl.textContent = res.error ? "Não deu pra enviar: " + res.error.message : "Link enviado! Confira seu e-mail.";
        });
    });
    host.querySelector('#auth-google-btn').addEventListener('click', function () {
      sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    });
    host.querySelector('#auth-close-btn').addEventListener('click', function () {
      authState.formOpen = false;
      renderAuthWidget();
    });
  }

  function openAuthForm() {
    authState.formOpen = true;
    renderAuthWidget();
    var widget = document.getElementById('auth-widget');
    if (widget) widget.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function renderHomeAuthBanner() {
    var host = document.getElementById('home-auth-banner');
    if (!host) return;
    if (!sb || authState.session) {
      host.innerHTML = "";
      return;
    }
    host.innerHTML = '<span class="home-auth-banner-text">💡 Crie uma conta para salvar seu progresso e ter acesso ao teste de conhecimento.</span>' +
      '<button type="button" class="auth-btn" id="home-auth-cta">Fazer login</button>';
    var btn = host.querySelector('#home-auth-cta');
    if (btn) btn.addEventListener('click', openAuthForm);
  }

  function initAuth() {
    if (!sb) { renderAuthWidget(); return; }
    // Callback do login (PKCE usa ?code=... na query, não #hash — o roteador
    // do app usa location.hash, então isso não colide com a navegação).
    if (location.search.indexOf('code=') !== -1) {
      sb.auth.exchangeCodeForSession(window.location.href).then(function () {
        var cleanUrl = location.pathname + location.hash;
        history.replaceState(null, "", cleanUrl);
      });
    }
    sb.auth.onAuthStateChange(function (event, session) {
      authState.session = session;
      authState.formOpen = false;
      renderAuthWidget();
      if (session) pullAndMergeAllState();
    });
  }

  function loadTrilhaData() {
    // no-store: durante o desenvolvimento (servido por HTTP), o navegador sempre
    // busca a versão nova de data/*.json em vez de servir do cache.
    var noStore = { cache: 'no-store' };
    return fetch('data/chapters.json', noStore).then(function (r) { return r.json(); }).then(function (chapters) {
      CHAPTERS = chapters;
      return fetch('data/resources.json', noStore).then(function (r) { return r.json(); }).catch(function () { return {}; });
    }).then(function (resources) {
      RESOURCES = resources || {};
      return fetch('data/achievements.json', noStore).then(function (r) { return r.json(); }).catch(function () { return {}; });
    }).then(function (achievements) {
      ACHIEVEMENTS = achievements || {};
      return fetch('data/topics-manifest.json', noStore).then(function (r) { return r.json(); });
    }).then(function (manifest) {
      return Promise.all(manifest.map(function (entry) {
        return fetch('data/topics/' + entry.file, noStore).then(function (r) { return r.json(); }).then(function (data) {
          TOPICS[entry.id] = data;
        });
      }));
    });
  }

  initAuth();

  loadTrilhaData().then(function () {
    initTopics();
    syncAchievementsSilently();
    route();
  }).catch(function (err) {
    console.error('Falha ao carregar os dados da trilha:', err);
    var el = document.createElement('div');
    el.style.cssText = 'padding:40px;font-family:sans-serif;color:#b00;max-width:640px;margin:0 auto;';
    el.textContent = 'Não foi possível carregar os dados da trilha (data/*.json). Se você abriu este arquivo diretamente (file://), sirva a pasta com um servidor local, veja o README.';
    document.body.prepend(el);
  });
})();
