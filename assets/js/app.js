/* ==========================================================================
   app.js —— 渲染与交互
   结构：状态(db) → 一组 render 函数各自负责一块 DOM → 事件统一委托
   ========================================================================== */
(function () {
  'use strict';

  var S = window.Store;
  var P = window.Plan;
  var db = S.load();

  var view = 'profile';
  var RING_C = 2 * Math.PI * 58;   // 环形图周长，r=58

  /* ---------- 工具 ---------- */
  function $(sel) { return document.querySelector(sel); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function num(v, sig) {
    var n = Number(v) || 0;
    if (sig === false) return String(Math.round(n * 10) / 10);
    return (Math.round(n * 10) / 10).toFixed(n % 1 === 0 ? 0 : 1);
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, 2400);
  }

  var saveTimer = null;
  function persist(msg) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      S.save();
      if (msg) toast(msg);
    }, 220);
  }

  function activePlan() {
    if (!db.activePlanId) return null;
    for (var i = 0; i < db.plans.length; i++) {
      if (db.plans[i].id === db.activePlanId) return db.plans[i];
    }
    return null;
  }

  function findStep(stepId) {
    var plan = activePlan();
    if (!plan) return null;
    for (var i = 0; i < plan.steps.length; i++) {
      if (plan.steps[i].id === stepId) return plan.steps[i];
    }
    return null;
  }

  /* ==========================================================================
     顶部档案头
     ========================================================================== */
  function renderMasthead() {
    var p = db.profile;
    var g = P.computeGap(db);

    $('#mhTerm').textContent = (p.term || '当前学期') + ' · 综合测评';
    $('#mhName').textContent = p.name || '未命名档案';
    $('#mhSchool').textContent = [p.school, p.major, p.grade].filter(Boolean).join(' · ') || '填上学校和专业';
    $('#mhTarget').textContent = num(g.target);
    $('#mhLocked').textContent = num(g.locked);
    $('#mhGap').textContent = num(g.gap);
  }

  /* ==========================================================================
     01 档案
     ========================================================================== */
  function renderProfile() {
    var p = db.profile;

    Object.keys(p).forEach(function (key) {
      var input = document.querySelector('[data-profile="' + key + '"]');
      if (input) input.value = p[key] === 0 ? '' : p[key];
    });

    renderCatEditor();
    renderProfileNumbers();
  }

  function renderCatEditor() {
    var box = $('#catEditor');
    box.textContent = '';

    S.CATEGORIES.forEach(function (c) {
      var row = el('div', 'cat-row');

      var name = el('div', 'cat-row__name', c.name);
      name.appendChild(el('em', null, c.hint || ''));
      row.appendChild(name);

      var input = el('input');
      input.type = 'number';
      input.min = '0';
      input.step = '0.5';
      input.value = db.profile.caps[c.id] || 0;
      input.dataset.cap = c.id;
      input.setAttribute('aria-label', c.name + ' 分值上限');
      row.appendChild(input);

      box.appendChild(row);
    });
  }

  function renderProfileNumbers() {
    var g = P.computeGap(db);
    $('#pfLocked').textContent = num(g.locked);
    $('#pfPlanned').textContent = num(g.planned);
    $('#pfGap').textContent = num(g.gap);

    var sum = S.CATEGORIES.reduce(function (n, c) {
      return n + (Number(db.profile.caps[c.id]) || 0);
    }, 0);
    var node = $('#catSum');
    node.textContent = '上限合计 ' + num(sum) + ' 分' +
      (Math.abs(sum - 100) < 0.01 ? '（正好 100）' : '（多数学院的综测表按 100 分制，请核对）');
    node.style.color = Math.abs(sum - 100) < 0.01 ? '' : 'var(--brick)';
  }

  /* ==========================================================================
     02 目录
     ========================================================================== */
  function renderCatalog() {
    renderBars();
    renderTable();
  }

  function renderBars() {
    var box = $('#catBars');
    box.textContent = '';

    S.CATEGORIES.forEach(function (c) {
      var cap = Number(db.profile.caps[c.id]) || 0;
      var got = db.items.reduce(function (n, it) {
        return it.category === c.id && it.status === 'done' ? n + (Number(it.score) || 0) : n;
      }, 0);

      /* 学业成绩这类"不用争取就已定"的分存在档案的 lockedScore 里，
         不算进来的话，学业条会显示 0，和顶部档案头的已锁定分对不上 */
      if (c.id === 'study') got += Number(db.profile.lockedScore) || 0;

      var pct = cap > 0 ? Math.min(100, got / cap * 100) : 0;

      var row = el('div', 'bar');
      row.appendChild(el('span', 'bar__name', c.name));

      var track = el('div', 'bar__track');
      var fill = el('div', 'bar__fill' + (pct >= 100 ? ' bar__fill--full' : ''));
      fill.style.width = pct + '%';
      track.appendChild(fill);
      row.appendChild(track);

      row.appendChild(el('span', 'bar__num', num(got) + ' / ' + num(cap)));
      box.appendChild(row);
    });
  }

  function renderTable() {
    var tbody = $('#catalogTable tbody');
    tbody.textContent = '';

    var q = ($('#q').value || '').trim().toLowerCase();
    var fc = $('#filterCat').value;
    var fs = $('#filterStatus').value;

    var list = db.items.filter(function (it) {
      if (fc && it.category !== fc) return false;
      if (fs && it.status !== fs) return false;
      if (q && it.title.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });

    $('#catalogCount').textContent = list.length + ' / ' + db.items.length + ' 条';

    list.sort(function (a, b) {
      if (a.status !== b.status) return a.status === 'done' ? -1 : 1;
      return (Number(b.score) || 0) - (Number(a.score) || 0);
    });

    list.forEach(function (it) {
      var tr = el('tr');
      if (it.status === 'drop') tr.className = 'is-drop';

      /* 事项 */
      var td = el('td');
      td.appendChild(el('span', 'cell-title', it.title));
      if (it.note) td.appendChild(el('span', 'cell-note', it.note));
      tr.appendChild(td);

      /* 类别 */
      var tdc = el('td');
      tdc.appendChild(el('span', 'tag tag--cat', S.catName(it.category)));
      tr.appendChild(tdc);

      tr.appendChild(el('td', null, it.level || '—'));

      var tdS = el('td', 'ta-r num', num(it.score));
      tr.appendChild(tdS);

      /* 状态（可直接改） */
      var tdSt = el('td');
      var sel = el('select');
      sel.className = 'sel-inline';
      sel.dataset.act = 'status';
      sel.dataset.id = it.id;
      S.STATUSES.forEach(function (s) {
        var o = el('option', null, s.name);
        o.value = s.id;
        if (s.id === it.status) o.selected = true;
        sel.appendChild(o);
      });
      tdSt.appendChild(sel);
      tr.appendChild(tdSt);

      tr.appendChild(el('td', 'num', it.due || '—'));

      var tdAct = el('td');
      var del = el('button', 'iconbtn', '×');
      del.dataset.act = 'del';
      del.dataset.id = it.id;
      del.title = '删除';
      tdAct.appendChild(del);
      tr.appendChild(tdAct);

      tbody.appendChild(tr);
    });

    $('#catalogEmpty').hidden = list.length > 0;
  }

  /* ---------- 文本解析（v1 是粘贴解析，不是文件上传） ---------- */
  var KW = /(竞赛|大赛|比赛|挑战赛|项目|计划|评选|评比|申报|立项)/;
  var LEVEL_KW = /(国家级|全国|省级|市级|校级|院级)/;
  var DATE_RE = /(20\d{2})\s*[年\-\/\.]\s*(\d{1,2})\s*[月\-\/\.]\s*(\d{1,2})/;

  function guessCategory(s) {
    if (/(竞赛|大赛|比赛|挑战赛)/.test(s)) return 'comp';
    if (/(项目|论文|专利|软著|科研|课题|立项)/.test(s)) return 'research';
    if (/(志愿|实践|实习|调研|支教|公益)/.test(s)) return 'practice';
    if (/(体育|运动|田径|篮球|足球|文艺|演出|歌唱|晚会)/.test(s)) return 'arts';
    if (/(班委|干部|社团|学生会|助管|班主任)/.test(s)) return 'work';
    return 'comp';
  }

  function normLevel(k) {
    if (/国家级|全国/.test(k)) return '国家级';
    if (/^省|省级/.test(k)) return '省级';
    if (/^市|市级/.test(k)) return '市级';
    if (/^校|校级/.test(k)) return '校级';
    if (/^院|院级/.test(k)) return '院级';
    return '';
  }

  function pad2(n) { return String(n).length < 2 ? '0' + n : String(n); }

  function parseText(text) {
    var seen = {};
    var out = [];

    text.split(/[\n\r。；;！!？?]+/).forEach(function (line) {
      var s = line.replace(/\s+/g, ' ').trim();
      if (s.length < 6 || s.length > 110) return;
      if (!KW.test(s)) return;

      var lv = s.match(LEVEL_KW);
      var dm = s.match(DATE_RE);

      var title = s
        .replace(/[（(][^）)]*[）)]/g, '')
        .replace(/^[\s\d、\.．\)）\-·]+/, '')
        .replace(/^(关于|开展|组织|举办|参加|参与)/, '')
        .slice(0, 44)
        .trim();

      if (title.length < 4) return;
      var key = title.slice(0, 12);
      if (seen[key]) return;
      seen[key] = true;

      out.push({
        title: title,
        level: lv ? normLevel(lv[0]) : '',
        due: dm ? dm[1] + '-' + pad2(dm[2]) + '-' + pad2(dm[3]) : '',
        category: guessCategory(s)
      });
    });

    return out.slice(0, 8);
  }

  function renderParseResult(cands) {
    var box = $('#parseResult');
    box.textContent = '';

    if (!cands.length) {
      $('#parseMsg').textContent = '没找到像条目的句子。试试粘更完整的通知原文。';
      return;
    }

    $('#parseMsg').textContent = '找到 ' + cands.length + ' 条候选，分值需要你自己填。';

    cands.forEach(function (c) {
      var row = el('div', 'parse-item');
      row.appendChild(el('span', null, c.title));

      var sel = el('select');
      sel.className = 'sel-inline';
      sel.dataset.parseCat = '1';
      S.CATEGORIES.forEach(function (cat) {
        var o = el('option', null, cat.name);
        o.value = cat.id;
        if (cat.id === c.category) o.selected = true;
        sel.appendChild(o);
      });
      row.appendChild(sel);

      row.appendChild(el('span', 'parse-item__meta', [c.level || '级别?', c.due || '无日期'].join(' · ')));

      var btn = el('button', 'btn btn--sm', '加入目录');
      btn.addEventListener('click', function () {
        db.items.push({
          id: S.uid('it'),
          title: c.title,
          category: sel.value,
          level: c.level || '校级',
          score: 0,
          status: 'plan',
          due: c.due,
          note: '由文本解析生成，分值待补',
          link: ''
        });
        S.save();
        renderCatalog();
        renderMasthead();
        btn.textContent = '已加入';
        btn.disabled = true;
        toast('已加入，记得回目录补分值');
      });
      row.appendChild(btn);

      box.appendChild(row);
    });
  }

  /* ==========================================================================
     03 规划
     ========================================================================== */
  function renderPlan() {
    var g = P.computeGap(db);

    /* 环形图 */
    var ratio = g.ratio || 0;
    $('#ringFill').style.strokeDasharray = (ratio * RING_C) + ' ' + RING_C;
    $('#ringPct').textContent = Math.round(ratio * 100);

    if (g.target <= 0) {
      $('#gapHeadline').textContent = '先把目标分填进来';
      $('#gapNote').textContent = '去 01 档案设置目标总分和已确定得分，这里才能算缺口。';
    } else if (g.gap <= 0) {
      $('#gapHeadline').textContent = '已经到 ' + num(g.locked) + ' 分，目标达成了';
      $('#gapNote').textContent = '当前锁定分已覆盖目标 ' + num(g.target) + ' 分。可以提高目标，或者安心收着。';
    } else if (!g.reachable) {
      $('#gapHeadline').textContent = '还差 ' + num(g.gap) + ' 分，现有条目凑不齐';
      $('#gapNote').textContent =
        '「计划中」的条目一共只有 ' + num(g.planned) + ' 分。缺口比这大 —— ' +
        '要么去目录补机会，要么把目标分调回现实区间。';
    } else {
      $('#gapHeadline').textContent = '还差 ' + num(g.gap) + ' 分';
      $('#gapNote').textContent =
        '「计划中」的条目合计 ' + num(g.planned) + ' 分，最大可到 ' +
        num(g.locked + g.planned) + ' 分，覆盖缺口没问题。下面三套方案的取舍不同。';
    }

    renderPlans(g);
    renderSteps();
  }

  function renderPlans(g) {
    var box = $('#plans');
    box.textContent = '';

    if (!db.plans.length) {
      box.appendChild(el('p', 'empty', '还没生成方案。点上面的「生成 / 刷新方案」。'));
      return;
    }

    var activeId = db.activePlanId;

    db.plans.forEach(function (plan) {
      var card = el('article', 'plan' + (plan.id === activeId ? ' is-active' : ''));
      card.tabIndex = 0;
      card.setAttribute('role', 'button');

      var top = el('div', 'plan__top');
      top.appendChild(el('span', 'plan__name', plan.name + '方案'));

      var stanceText = { guard: 'GUARD', balance: 'BALANCE', sprint: 'SPRINT' };
      top.appendChild(el('span', 'plan__stance', stanceText[plan.stance] || ''));
      card.appendChild(top);

      var figs = el('div', 'plan__figures');

      var f1 = el('div');
      f1.appendChild(el('small', null, '预计补分'));
      f1.appendChild(el('b', null, num(plan.reach)));
      figs.appendChild(f1);

      var f2 = el('div');
      f2.appendChild(el('small', null, '覆盖缺口'));
      f2.appendChild(el('b', null, plan.coverage ? num(plan.coverage * 100, false) + '%' : '—'));
      figs.appendChild(f2);

      card.appendChild(figs);

      card.appendChild(el('p', 'plan__desc', plan.summary));

      var risk = el('div', 'plan__risk');
      risk.appendChild(el('span', 'dot' + (plan.risk === 'high' ? ' dot--high' : plan.risk === 'mid' ? ' dot--mid' : '')));
      risk.appendChild(el('span', null, plan.riskText || ''));
      card.appendChild(risk);

      var btn = el('button', 'btn btn--sm', plan.id === activeId ? '当前方案' : '选这套');
      btn.disabled = plan.id === activeId;
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        choosePlan(plan);
      });
      card.appendChild(btn);

      card.addEventListener('click', function () { choosePlan(plan); });

      box.appendChild(card);
    });
  }

  function choosePlan(plan) {
    if (plan.id === db.activePlanId) return;

    var prev = activePlan();
    var res = P.reconcileRecords(prev, plan, db.records);

    db.records = res.records;
    db.activePlanId = plan.id;
    S.save();

    renderPlan();
    renderProgress();

    var msg = '已切到' + plan.name + '方案';
    if (res.moved) msg += '，迁移 ' + res.moved + ' 条记录';
    if (res.orphaned) msg += '，' + res.orphaned + ' 条留作历史';
    toast(msg);
  }

  function generatePlans(quiet) {
    var g = P.computeGap(db);
    var prev = activePlan();
    var fresh = P.buildPlans(g, db);

    db.plans = fresh;

    /* 沿用原来的立场，这样刷新后进度还能挂回去 */
    var keep = null;
    if (prev) {
      fresh.forEach(function (p) { if (p.stance === prev.stance) keep = p; });
    }
    if (!keep) keep = fresh[1] || fresh[0];

    var res = P.reconcileRecords(prev, keep, db.records);
    db.records = res.records;
    db.activePlanId = keep.id;
    S.save();

    if (quiet) return;

    renderPlan();
    renderProgress();

    var msg = '已生成 3 套方案';
    if (prev) msg += '，迁移 ' + res.moved + ' 条记录';
    toast(msg);
  }

  function renderSteps() {
    var plan = activePlan();
    var card = $('#stepsCard');
    var box = $('#steps');
    box.textContent = '';

    if (!plan) { card.hidden = true; return; }
    card.hidden = false;
    $('#activePlanName').textContent = plan.name + '方案';

    if (!plan.steps.length) {
      box.appendChild(el('p', 'empty', '这套方案没有可用阶段。去 02 目录把一些条目标为「计划中」。'));
      return;
    }

    plan.steps.forEach(function (s, i) {
      var row = el('div', 'step');
      row.appendChild(el('div', 'step__no', pad2(i + 1)));

      var mid = el('div');
      var title = el('div', 'step__title');
      title.appendChild(el('span', null, s.title));

      var count = el('span', 'tag tag--cat', S.catName(s.category));
      title.appendChild(count);
      mid.appendChild(title);

      var metaText = s.itemIds.length + ' 个条目';
      if (s.due) {
        var wl = P.weeksLeft(s.due);
        metaText += ' · 最近截止 ' + s.due;
        if (wl !== null) {
          metaText += wl < 0 ? '（已过期）' : '（' + Math.round(wl) + ' 周后）';
        }
      }
      mid.appendChild(el('div', 'step__meta', metaText));
      row.appendChild(mid);

      row.appendChild(el('div', 'step__target', '+' + num(s.target)));

      box.appendChild(row);
    });
  }

  /* ---------- 手动加一步 ---------- */
  function addStepForm() {
    var box = $('#steps');
    if (!box || $('#stepAddForm')) return;

    var form = el('div', 'addbar step-addform');
    form.id = 'stepAddForm';

    var t = el('input');
    t.placeholder = '阶段名称，例：补一篇校级论文';
    t.className = 'addbar__title';
    form.appendChild(t);

    var cat = el('select');
    S.CATEGORIES.forEach(function (c) {
      var o = el('option', null, c.name);
      o.value = c.id;
      cat.appendChild(o);
    });
    form.appendChild(cat);

    var sc = el('input');
    sc.type = 'number';
    sc.step = '0.5';
    sc.min = '0';
    sc.placeholder = '分值';
    sc.className = 'addbar__num';
    form.appendChild(sc);

    var ok = el('button', 'btn btn--solid', '添加');
    ok.addEventListener('click', function () {
      var plan = activePlan();
      if (!plan) return;
      var name = (t.value || '').trim();
      if (!name) { toast('先写个阶段名称'); t.focus(); return; }

      plan.steps.push({
        id: S.uid('st'),
        title: name,
        category: cat.value,
        target: Number(sc.value) || 0,
        itemIds: [],
        due: ''
      });
      S.save();
      form.remove();
      renderPlan();
      renderProgress();
      toast('已添加阶段');
    });
    form.appendChild(ok);

    box.appendChild(form);
    t.focus();
  }

  /* ==========================================================================
     04 进度
     ========================================================================== */
  function recordOf(stepId) {
    for (var i = 0; i < db.records.length; i++) {
      if (db.records[i].stepId === stepId) return db.records[i];
    }
    return null;
  }

  function upsertRecord(stepId, patch) {
    var r = recordOf(stepId);
    if (!r) {
      r = {
        id: S.uid('rc'), stepId: stepId, planId: db.activePlanId,
        done: false, date: '', hours: 0, note: ''
      };
      db.records.push(r);
    }
    Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
    persist();
    return r;
  }

  function renderProgress() {
    var plan = activePlan();
    var st = P.planStats(plan, db.records);

    $('#pgDone').textContent = st.done + ' / ' + st.steps;
    $('#pgHours').textContent = num(st.hours) + ' h';
    $('#pgRecords').textContent = st.records;
    $('#pgScore').textContent = num(st.scoreDone);

    var line = $('#timeline');
    line.textContent = '';

    if (!plan || !plan.steps.length) {
      $('#progressEmpty').hidden = false;
      return;
    }
    $('#progressEmpty').hidden = true;

    plan.steps.forEach(function (s, i) {
      var r = recordOf(s.id);
      var isDone = !!(r && r.done);

      var row = el('div', 'tl' + (isDone ? ' is-done' : ''));

      var rail = el('div', 'tl__rail');
      rail.appendChild(el('div', 'tl__dot'));
      if (i < plan.steps.length - 1) rail.appendChild(el('div', 'tl__line'));
      row.appendChild(rail);

      var body = el('div', 'tl__body');

      var head = el('div', 'tl__head');
      head.appendChild(el('span', 'tl__title', s.title));
      head.appendChild(el('span', 'tag tag--cat', S.catName(s.category)));
      head.appendChild(el('span', 'tag ' + (isDone ? 'tag--done' : 'tag--plan'), isDone ? '已完成' : '未开始'));
      body.appendChild(head);

      var ctl = el('div', 'tl__ctl');

      var cb = el('input');
      cb.type = 'checkbox';
      cb.checked = isDone;
      cb.id = 'cb_' + s.id;
      cb.addEventListener('change', function () {
        var patch = { done: cb.checked };
        if (cb.checked && !(r && r.date)) {
          patch.date = new Date().toISOString().slice(0, 10);
          dateInput.value = patch.date;
        }
        if (cb.checked && !(r && Number(r.hours) > 0)) {
          patch.hours = Number(hoursInput.value) || 0;
        }
        r = upsertRecord(s.id, patch);
        renderProgress();
        flash('已完成');
      });
      ctl.appendChild(cb);

      var lbl = el('label', null, '完成');
      lbl.setAttribute('for', cb.id);
      lbl.style.fontSize = '11.5px';
      lbl.style.color = 'var(--muted)';
      ctl.appendChild(lbl);

      var dateInput = el('input');
      dateInput.type = 'date';
      dateInput.value = (r && r.date) || '';
      dateInput.addEventListener('change', function () {
        r = upsertRecord(s.id, { date: dateInput.value });
        flash('已保存');
      });
      ctl.appendChild(dateInput);

      var hoursInput = el('input');
      hoursInput.type = 'number';
      hoursInput.min = '0';
      hoursInput.step = '0.5';
      hoursInput.placeholder = '小时';
      hoursInput.value = (r && Number(r.hours)) || '';
      hoursInput.addEventListener('change', function () {
        r = upsertRecord(s.id, { hours: Number(hoursInput.value) || 0 });
        renderProgress();
        flash('已保存');
      });
      ctl.appendChild(hoursInput);

      var noteInput = el('input');
      noteInput.type = 'text';
      noteInput.placeholder = '记一句进度，例：报名已提交，等省赛通知';
      noteInput.value = (r && r.note) || '';
      noteInput.addEventListener('input', function () {
        r = upsertRecord(s.id, { note: noteInput.value });
      });
      ctl.appendChild(noteInput);

      var saved = el('span', 'tl__saved', '已保存');
      ctl.appendChild(saved);

      body.appendChild(ctl);
      row.appendChild(body);
      line.appendChild(row);
    });

    /* 无家可归的历史记录 */
    var orphans = db.records.filter(function (r) { return !r.stepId; });
    if (orphans.length) {
      var head = el('h4', 'card__title');
      head.style.marginTop = '22px';
      head.textContent = '未关联到当前方案的历史记录（' + orphans.length + ' 条）';
      line.appendChild(head);

      orphans.forEach(function (r) {
        var row = el('div', 'tl');
        var rail = el('div', 'tl__rail');
        rail.appendChild(el('div', 'tl__dot'));
        row.appendChild(rail);

        var body = el('div', 'tl__body');
        body.appendChild(el('div', 'tl__title', (r.note || '（无备注）') + (r.date ? ' · ' + r.date : '')));
        body.appendChild(el('div', 'step__meta', (r.done ? '已完成' : '未完成') + ' · 投入 ' + num(r.hours) + ' 小时'));
        row.appendChild(body);
        line.appendChild(row);
      });
    }
  }

  function flash(text) {
    var nodes = document.querySelectorAll('.tl__saved');
    if (!nodes.length) return;
    var last = nodes[nodes.length - 1];
    last.textContent = text;
    last.classList.add('is-on');
    setTimeout(function () { last.classList.remove('is-on'); }, 1400);
  }

  /* ==========================================================================
     导航
     ========================================================================== */
  function switchView(next) {
    view = next;
    document.querySelectorAll('.nav__item').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.view === next);
    });
    document.querySelectorAll('.view').forEach(function (s) {
      s.classList.toggle('is-active', s.id === 'view-' + next);
    });

    if (next === 'profile') renderProfile();
    if (next === 'catalog') renderCatalog();
    if (next === 'plan') renderPlan();
    if (next === 'progress') renderProgress();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ==========================================================================
     事件绑定
     ========================================================================== */
  function bootOptions() {
    var cats = S.CATEGORIES.map(function (c) { return [c.id, c.name]; });

    var a = $('#aCategory');
    cats.forEach(function (p) {
      var o = el('option', null, p[1]);
      o.value = p[0];
      a.appendChild(o);
    });

    var fc = $('#filterCat');
    var all = el('option', null, '全部类别');
    all.value = '';
    fc.appendChild(all);
    cats.forEach(function (p) {
      var o = el('option', null, p[1]);
      o.value = p[0];
      fc.appendChild(o);
    });

    var lv = $('#aLevel');
    S.LEVELS.forEach(function (l) {
      var o = el('option', null, l);
      o.value = l;
      lv.appendChild(o);
    });
    lv.value = '校级';   // 新条目默认校级，国家级误存会影响规划判断

    var as = $('#aStatus');
    S.STATUSES.forEach(function (s) {
      var o = el('option', null, s.name);
      o.value = s.id;
      if (s.id === 'plan') o.selected = true;
      as.appendChild(o);
    });

    var fs = $('#filterStatus');
    var allS = el('option', null, '全部状态');
    allS.value = '';
    fs.appendChild(allS);
    S.STATUSES.forEach(function (s) {
      var o = el('option', null, s.name);
      o.value = s.id;
      fs.appendChild(o);
    });
  }

  function bind() {
    /* 导航 */
    $('#nav').addEventListener('click', function (e) {
      var btn = e.target.closest('.nav__item');
      if (btn) switchView(btn.dataset.view);
    });

    /* 档案字段 */
    document.addEventListener('input', function (e) {
      var key = e.target.dataset.profile;
      if (!key) return;
      var v = e.target.value;
      db.profile[key] = (key === 'targetScore' || key === 'lockedScore')
        ? (Number(v) || 0)
        : v;
      persist();
      renderMasthead();
      renderProfileNumbers();
    });

    /* 类别上限 */
    $('#catEditor').addEventListener('input', function (e) {
      var id = e.target.dataset.cap;
      if (!id) return;
      db.profile.caps[id] = Number(e.target.value) || 0;
      persist();
      renderProfileNumbers();
    });

    /* 新增条目 */
    $('#addForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var title = $('#aTitle').value.trim();
      if (!title) return;

      db.items.push({
        id: S.uid('it'),
        title: title,
        category: $('#aCategory').value,
        level: $('#aLevel').value,
        score: Number($('#aScore').value) || 0,
        status: $('#aStatus').value,
        due: $('#aDue').value,
        note: '',
        link: ''
      });
      S.save();

      $('#aTitle').value = '';
      $('#aScore').value = '';
      $('#aDue').value = '';
      $('#aTitle').focus();

      renderCatalog();
      renderMasthead();
      toast('已加入目录');
    });

    /* 表格内改状态 / 删除 */
    $('#catalogTable').addEventListener('change', function (e) {
      if (e.target.dataset.act !== 'status') return;
      var id = e.target.dataset.id;
      db.items.forEach(function (it) { if (it.id === id) it.status = e.target.value; });
      S.save();
      renderCatalog();
      renderMasthead();
    });

    $('#catalogTable').addEventListener('click', function (e) {
      if (e.target.dataset.act !== 'del') return;
      var id = e.target.dataset.id;
      db.items = db.items.filter(function (it) { return it.id !== id; });
      S.save();
      renderCatalog();
      renderMasthead();
      toast('已删除');
    });

    /* 筛选 */
    ['#q', '#filterCat', '#filterStatus'].forEach(function (sel) {
      $(sel).addEventListener('input', renderTable);
      $(sel).addEventListener('change', renderTable);
    });

    /* 解析器 */
    $('#btnParse').addEventListener('click', function () {
      var text = $('#parseInput').value;
      if (!text.trim()) { toast('先粘一段通知原文'); return; }
      renderParseResult(parseText(text));
    });

    /* 生成方案 */
    $('#btnGenerate').addEventListener('click', generatePlans);

    /* 手动加阶段 */
    $('#btnAddStep').addEventListener('click', addStepForm);

    /* 清空 */
    $('#btnReset').addEventListener('click', function () {
      var ok = window.confirm('这会清空所有条目、方案和进度记录，只保留一份空档案。确定？');
      if (!ok) return;
      S.clearAll();
      db = S.get();
      renderMasthead();
      switchView('profile');
      toast('已清空，开始录你自己的数据');
    });
  }

  /* ==========================================================================
     启动
     ========================================================================== */
  function init() {
    bootOptions();
    bind();
    renderMasthead();
    renderProfile();

    if (!db.plans.length && db.items.some(function (it) { return it.status === 'plan'; })) {
      generatePlans(true);
    }

    renderCatalog();
    renderPlan();
    renderProgress();
    switchView('profile');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
