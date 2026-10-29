/* ==========================================================================
   store.js —— 数据层
   职责：常量表、读写 localStorage、首次访问填充演示数据、ID 生成
   所有模块挂到 window 上，故意不用 ES Module（file:// 直接打开也能跑）
   ========================================================================== */
window.Store = (function () {
  'use strict';

  var KEY = 'zongce.workbench.v1';

  /* ---------- 评分类别（按学院细则改上限，结构不用动） ---------- */
  var CATEGORIES = [
    { id: 'study',    name: '学业成绩', hint: '必修课加权平均分' },
    { id: 'comp',     name: '学科竞赛', hint: '挑战杯、互联网+、数模等' },
    { id: 'research', name: '科研创新', hint: '大创、论文、专利、软著' },
    { id: 'practice', name: '社会实践', hint: '志愿服务、实习、社会调研' },
    { id: 'arts',     name: '文体活动', hint: '体育竞赛、文艺演出' },
    { id: 'work',     name: '学生工作', hint: '班委、社团干部、助管' }
  ];

  var LEVELS = ['国家级', '省级', '市级', '校级', '院级'];

  var STATUSES = [
    { id: 'done', name: '已获得' },
    { id: 'plan', name: '计划中' },
    { id: 'drop', name: '已放弃' }
  ];

  /* ---------- 工具 ---------- */
  function uid(prefix) {
    return (prefix || 'id') + '_' +
      Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function catName(id) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) return CATEGORIES[i].name;
    }
    return id;
  }

  function catOf(id) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) return CATEGORIES[i];
    }
    return { id: id, name: id, hint: '', cap: 0 };
  }

  function statusName(id) {
    for (var i = 0; i < STATUSES.length; i++) {
      if (STATUSES[i].id === id) return STATUSES[i].name;
    }
    return id;
  }

  /* ---------- 演示数据 ----------
     用途：让你第一次打开就能看到有内容的界面。
     分值全是占位示例，不是任何一个学校的真实标准，用前按细则改。
     「清空全部数据」可一键归零，开始录自己的。                            */
  function demo() {
    var items = [
      { id: uid('it'), title: '全国大学生数学建模竞赛', category: 'comp',     level: '省级',   score: 6,   status: 'done', due: '2026-09-12', note: '省一等奖', link: '' },
      { id: uid('it'), title: '校运会 4×100 米接力',   category: 'arts',     level: '校级',   score: 2,   status: 'done', due: '2026-10-10', note: '团体第三', link: '' },
      { id: uid('it'), title: '校园马拉松志愿服务',     category: 'practice', level: '校级',   score: 1.5, status: 'done', due: '2026-10-18', note: '时长 8 小时', link: '' },
      { id: uid('it'), title: '班级学习委员',           category: 'work',     level: '院级',   score: 2,   status: 'done', due: '',           note: '任职满一学年', link: '' },
      { id: uid('it'), title: '蓝桥杯程序设计大赛',     category: 'comp',     level: '省级',   score: 3,   status: 'plan', due: '2026-11-15', note: '已报名省赛', link: '' },
      { id: uid('it'), title: '大学生创新创业训练计划', category: 'research', level: '校级',   score: 4,   status: 'plan', due: '2026-12-01', note: '组队中，缺一个前端', link: '' },
      { id: uid('it'), title: '挑战杯课外学术科技作品竞赛', category: 'comp', level: '国家级', score: 8,   status: 'plan', due: '2027-03-20', note: '需要先有成果', link: '' },
      { id: uid('it'), title: '全国大学生数学竞赛（省赛）', category: 'comp', level: '省级',   score: 4,   status: 'plan', due: '2026-12-20', note: '去年差 3 分进复试', link: '' },
      { id: uid('it'), title: '校级科研立项结题',       category: 'research', level: '校级',   score: 3,   status: 'plan', due: '2027-01-10', note: '结题报告写完就行', link: '' },
      { id: uid('it'), title: '院级志愿服务（累计 20 小时）', category: 'practice', level: '院级', score: 2, status: 'plan', due: '2026-11-05', note: '每周六上午', link: '' },
      { id: uid('it'), title: '开源项目贡献（累计 3 个 PR）', category: 'research', level: '校级', score: 2, status: 'plan', due: '2026-12-15', note: '', link: '' },
      { id: uid('it'), title: '全国大学生英语竞赛',     category: 'comp',     level: '国家级', score: 3,   status: 'drop', due: '2026-04-20', note: '时间冲突，放弃', link: '' }
    ];

    return {
      profile: {
        name: '林澈（示例）',
        school: '示例大学 · 信息工程学院',
        college: '信息工程学院',
        major: '计算机科学与技术',
        grade: '2024 级',
        term: '2026 秋季学期',
        targetScore: 88,
        lockedScore: 64.5,
        caps: { study: 70, comp: 12, research: 8, practice: 4, arts: 3, work: 3 }
      },
      items: items,
      plans: [],
      activePlanId: null,
      records: [],
      meta: { seeded: true, createdAt: new Date().toISOString() }
    };
  }

  function blank() {
    var caps = {};
    CATEGORIES.forEach(function (c) { caps[c.id] = 0; });
    return {
      profile: {
        name: '', school: '', college: '', major: '', grade: '', term: '',
        targetScore: 0, lockedScore: 0, caps: caps
      },
      items: [], plans: [], activePlanId: null, records: [],
      meta: { seeded: false, createdAt: new Date().toISOString() }
    };
  }

  /* ---------- 读写 ---------- */
  var db = null;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.profile && Array.isArray(parsed.items)) {
          db = migrate(parsed);
          return db;
        }
      }
    } catch (e) {
      console.warn('[store] 读取失败，改用演示数据', e);
    }
    db = demo();
    save();
    return db;
  }

  /* 结构兼容：老数据缺字段时补齐，避免升级后白屏 */
  function migrate(d) {
    if (!d.profile.caps) d.profile.caps = {};
    CATEGORIES.forEach(function (c) {
      if (typeof d.profile.caps[c.id] !== 'number') {
        d.profile.caps[c.id] = c.id === 'study' ? 70 : 0;
      }
    });
    if (!Array.isArray(d.plans)) d.plans = [];
    if (!Array.isArray(d.records)) d.records = [];
    if (typeof d.profile.targetScore !== 'number') d.profile.targetScore = 0;
    if (typeof d.profile.lockedScore !== 'number') d.profile.lockedScore = 0;
    return d;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      return true;
    } catch (e) {
      console.warn('[store] 保存失败（可能是隐私模式）', e);
      return false;
    }
  }

  function reset() {
    db = demo();
    save();
    return db;
  }

  function clearAll() {
    db = blank();
    save();
    return db;
  }

  return {
    CATEGORIES: CATEGORIES,
    LEVELS: LEVELS,
    STATUSES: STATUSES,
    uid: uid,
    catName: catName,
    catOf: catOf,
    statusName: statusName,
    load: load,
    save: save,
    reset: reset,
    clearAll: clearAll,
    get: function () { return db; }
  };
})();
