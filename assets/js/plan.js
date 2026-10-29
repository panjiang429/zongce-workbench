/* ==========================================================================
   plan.js —— 规划引擎
   ==========================================================================
   这个文件是整个项目的"脑子"，也是最值得你动手改的地方。
   下面标了【作业 1】【作业 2】的两个函数，我给的是"能跑的最简版"。
   它不会报错，但结果还不够聪明 —— 把注释里列的升级方向做掉，实用性会明显上一个台阶。

   改完怎么自检？每一条都对应界面上能看到的直接变化：
     · 换方案时进度记录有没有丢 → 04 进度页的条数变不变
     · 三套方案的推荐条目有没有真的不一样 → 03 规划页三张卡的数字
     · 缺口大于可选项总和时，有没有明确告诉你"凑不齐" → 顶部那句话
   ========================================================================== */
window.Plan = (function () {
  'use strict';

  var C = window.Store;

  /* ---------- 级别 → 难度权重（越靠上越难拿，用于性价比估算） ---------- */
  var LEVEL_WEIGHT = {
    '国家级': 4,
    '省级': 3,
    '市级': 2.5,
    '校级': 2,
    '院级': 1.5
  };

  function weightOf(level) {
    return LEVEL_WEIGHT[level] || 2;
  }

  /* 距离截止还有几周，没有截止日返回 null */
  function weeksLeft(due) {
    if (!due) return null;
    var t = Date.parse(due + 'T23:59:59');
    if (isNaN(t)) return null;
    return (t - Date.now()) / (7 * 24 * 3600 * 1000);
  }

  /* ---------- 缺口测算 ---------- */
  /* 已锁定 = 学业等已定分 + 所有「已获得」条目
     缺口   = 目标 - 已锁定（不小于 0）
     在途   = 所有「计划中」条目的分值和，用来看缺口是否够得着 */
  function computeGap(db) {
    var p = db.profile;
    var done = 0, planned = 0, dropped = 0;

    db.items.forEach(function (it) {
      var s = Number(it.score) || 0;
      if (it.status === 'done') done += s;
      else if (it.status === 'plan') planned += s;
      else dropped += s;
    });

    var base = Number(p.lockedScore) || 0;
    var target = Number(p.targetScore) || 0;
    var locked = base + done;
    var gap = Math.max(0, target - locked);

    return {
      target: target,
      base: base,
      done: done,
      planned: planned,
      dropped: dropped,
      locked: locked,
      gap: round1(gap),
      reachable: planned + 0.0001 >= gap,
      ratio: target > 0 ? Math.min(1, locked / target) : 0
    };
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  /* ==========================================================================
     【作业 1】三套规划方案怎么生成
     ==========================================================================
     输入：g（computeGap 的返回值）、db（全部数据）
     输出：三个方案对象组成的数组，每个长这样：
       {
         id, name, stance, summary,
         coverage: 1.0,          // 打算凑到缺口的几倍
         reach:    计划能补的分,  // 这三套方案实际能补多少
         risk:     'low' | 'mid' | 'high',
         steps: [ { id, title, category, target, itemIds: [], due } ]
       }

     现在的做法：只从 status === 'plan' 的条目里挑，
       guard   按"难度 + 截止紧迫度"从易到难凑 1.0 倍缺口。
               剩余不到 4 周的条目难度 +2.5，相当于先跳过快到期的，
               避免出现"稳守方案里塞了一个 10 天后就要截止的项"这种自相矛盾。
       balance 按分值从高到低，凑够 1.3 倍，且至少覆盖 2 个类别
       sprint  按分值从高到低，凑够 1.6 倍 —— 押大注，项数少但每项都难

     还可以升级的地方（挑一个做就有明显差别）：
       1. 加"分散度惩罚"：同一类别堆太多条目的方案，风险应该标 high，
          因为一次失败就全塌。现在 riskText 里那句"只押在一个类别上"
          只在条目数极少时才触发，判断太粗。
       2. 如果 reach < gap（凑不齐），给方案加一个 needMore 字段，
          界面上可以提示"按现有条目最多只能到 X 分，需要再新增 Y 分的机会"。
       3. 让 steps 的 title 描述具体一点，比如
          "学科竞赛：蓝桥杯（省）+ 挑战杯（国）" 比现在把全名拼一长串好读。
       4. guard 的 2.5 是拍脑袋定的系数，可以换成按"剩余周数 ÷ 4"连续衰减，
          看看方案会不会更平滑。
     ========================================================================== */
  function buildPlans(g, db) {
    var pool = db.items.filter(function (it) { return it.status === 'plan'; });

    if (!pool.length) {
      return [
        makePlan('guard',   '稳守', g, []),
        makePlan('balance', '均衡', g, []),
        makePlan('sprint',  '冲刺', g, [])
      ];
    }

    /* 稳守的排序键：级别难度 + 截止紧迫度惩罚。
       2.5 是经验值 —— 大致相当于"快到期的项，难度自动升一级半" */
    function easeKey(it) {
      var w = weightOf(it.level);
      var wl = weeksLeft(it.due);
      return wl !== null && wl < 4 ? w + 2.5 : w;
    }

    var byEase = pool.slice().sort(function (a, b) {
      var ka = easeKey(a), kb = easeKey(b);
      if (ka !== kb) return ka - kb;
      return (Number(b.score) || 0) - (Number(a.score) || 0);
    });

    var byScore = pool.slice().sort(function (a, b) {
      return (Number(b.score) || 0) - (Number(a.score) || 0);
    });

    return [
      makePlan('guard',   '稳守', g, pick(byEase,  g.gap * 1.0, 1)),
      makePlan('balance', '均衡', g, pick(byScore, g.gap * 1.3, 2)),
      makePlan('sprint',  '冲刺', g, pick(byScore, g.gap * 1.6, 1))
    ];
  }

  /* 从候选池里按顺序取，直到累计分达到 need；minCats 是最少要跨几个类别 */
  function pick(sorted, need, minCats) {
    var chosen = [], sum = 0, cats = {};

    if (!(need > 0)) return chosen;   // 缺口已经是 0，不用再补

    function take(list) {
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        if (chosen.indexOf(it) !== -1) continue;
        chosen.push(it);
        sum += Number(it.score) || 0;
        cats[it.category] = true;
        if (sum >= need) return true;
      }
      return false;
    }

    take(sorted);

    /* 没跨够类别就把池子里其它类别的也补进来（不改动已选顺序） */
    var guard = 0;
    while (Object.keys(cats).length < minCats && guard < 10) {
      guard++;
      var before = Object.keys(cats).length;
      for (var i = 0; i < sorted.length; i++) {
        if (chosen.indexOf(sorted[i]) === -1) { take([sorted[i]]); break; }
      }
      if (Object.keys(cats).length === before) break;
    }

    return chosen;
  }

  function makePlan(stance, name, g, items) {
    /* 按类别归并成阶段 */
    var groups = {};
    items.forEach(function (it) {
      if (!groups[it.category]) groups[it.category] = [];
      groups[it.category].push(it);
    });

    var steps = Object.keys(groups).map(function (catId) {
      var list = groups[catId].slice().sort(function (a, b) {
        return (Number(b.score) || 0) - (Number(a.score) || 0);
      });
      var sum = list.reduce(function (n, it) { return n + (Number(it.score) || 0); }, 0);
      var dues = list.map(function (it) { return it.due; }).filter(Boolean).sort();

      return {
        id: C.uid('st'),
        title: C.catName(catId) + '：' + list.map(function (it) { return it.title; }).join(' + '),
        category: catId,
        target: round1(sum),
        itemIds: list.map(function (it) { return it.id; }),
        due: dues[0] || ''
      };
    }).sort(function (a, b) { return b.target - a.target; });

    var reach = round1(steps.reduce(function (n, s) { return n + s.target; }, 0));
    var soonest = steps.map(function (s) { return s.due; }).filter(Boolean).sort()[0] || '';
    var wl = weeksLeft(soonest);

    /* 风险判断：只看两个客观信号 —— 够不够、来不来得及 */
    var risk = 'low', riskText = '缺口可覆盖，时间也宽松';
    if (reach + 0.0001 < g.gap) {
      risk = 'high';
      riskText = '现有条目凑不齐，还差 ' + round1(g.gap - reach) + ' 分';
    } else if (wl !== null && wl < 3) {
      risk = 'high';
      riskText = '最近一项 ' + soonest + ' 截止，剩不到 3 周';
    } else if (wl !== null && wl < 8) {
      risk = 'mid';
      riskText = '最近一项 ' + soonest + ' 截止，约 ' + Math.round(wl) + ' 周';
    } else if (steps.length < 2) {
      risk = 'mid';
      riskText = '只押在一个类别上，单点失败就没有退路';
    }

    var coverage = g.gap > 0 ? round1(reach / g.gap) : 0;

    var summary = steps.length
      ? '跨 ' + steps.length + ' 个类别，共 ' + countItems(steps) + ' 项，预计补 ' + reach + ' 分'
      : '当前没有「计划中」的条目，先去 02 目录加几条';

    return {
      id: C.uid('pl'),
      stance: stance,
      name: name,
      coverage: coverage,
      reach: reach,
      risk: risk,
      riskText: riskText,
      summary: summary,
      createdAt: new Date().toISOString(),
      steps: steps
    };
  }

  function countItems(steps) {
    return steps.reduce(function (n, s) { return n + s.itemIds.length; }, 0);
  }

  /* ==========================================================================
     【作业 2】换方案时，进度记录怎么跟着迁移
     ==========================================================================
     背景：记录（record）不是挂在方案上，而是挂在「阶段 step」上。
     一换方案，step 的 id 全变了，旧记录就成了悬空引用 —— 界面上一换方案就清零。
     这个函数负责在切换瞬间把旧记录重新钉到新阶段上。

     输入：
       prevPlan  旧方案对象（可能为 null，比如第一次生成）
       nextPlan  新方案对象
       records   全部记录数组，每条 { id, stepId, planId, done, date, hours, note }
     输出：
       { records: 迁移后的完整记录数组, moved: 迁移条数, orphaned: 无家可归的条数 }

     现在的做法：按 category 匹配 —— 记录原来落在「学科竞赛」这个阶段，
       就把它挪到新方案里同样叫「学科竞赛」的阶段上。匹配不到就 stepId 置 null，
       界面会把它归到「历史记录」里，不删。

     可以升级的地方：
       1. 先按标题精确匹配（同一件事换了方案还在），匹配不到再退回按类别匹配。
          现在只有类别匹配，所以同一类别里两条不同的阶段会混在一起。
       2. 迁移时保留原始时间线：给记录加 migratedFrom 字段存旧 stepId，
          以后想做"方案 A 时期做过什么"的复盘就有原始依据。
       3. 如果新方案里完全没有这个类别，与其置 null，不如自动补一个
          "遗留事项"阶段把它收进去 —— 用户在进度页看到的就还是完整的一条线。
       4. 幂等：同一个 nextPlan 重复调用两次，结果应该完全一致。
     ========================================================================== */
  function reconcileRecords(prevPlan, nextPlan, records) {
    var out = [], moved = 0, orphaned = 0;

    var map = {};
    (nextPlan.steps || []).forEach(function (s) { map[s.category] = s; });

    var prevMap = {};
    if (prevPlan && prevPlan.steps) {
      prevPlan.steps.forEach(function (s) { prevMap[s.id] = s; });
    }

    records.forEach(function (r) {
      var prevStep = prevMap[r.stepId];
      var catId = prevStep ? prevStep.category : null;
      var target = catId ? map[catId] : null;

      if (target) {
        out.push({
          id: r.id,
          stepId: target.id,
          planId: nextPlan.id,
          done: r.done,
          date: r.date,
          hours: r.hours,
          note: r.note
        });
        if (prevStep) moved++;
      } else {
        out.push({
          id: r.id,
          stepId: null,
          planId: r.planId,
          done: r.done,
          date: r.date,
          hours: r.hours,
          note: r.note
        });
        orphaned++;
      }
    });

    return { records: out, moved: moved, orphaned: orphaned };
  }

  /* ---------- 统计（纯计算，不用改） ---------- */
  function planStats(plan, records) {
    if (!plan) return { steps: 0, done: 0, hours: 0, records: 0, scoreDone: 0, pct: 0 };

    var ids = {};
    plan.steps.forEach(function (s) { ids[s.id] = s; });

    var mine = records.filter(function (r) { return r.stepId && ids[r.stepId]; });

    var doneSteps = {}, hours = 0, scoreDone = 0;

    mine.forEach(function (r) {
      if (r.done) {
        doneSteps[r.stepId] = true;
        scoreDone += Number(ids[r.stepId].target) || 0;
      }
      hours += Number(r.hours) || 0;
    });

    var doneCount = Object.keys(doneSteps).length;

    return {
      steps: plan.steps.length,
      done: doneCount,
      hours: round1(hours),
      records: mine.length,
      scoreDone: round1(scoreDone),
      pct: plan.steps.length ? doneCount / plan.steps.length : 0
    };
  }

  return {
    computeGap: computeGap,
    buildPlans: buildPlans,
    reconcileRecords: reconcileRecords,
    planStats: planStats,
    weeksLeft: weeksLeft,
    weightOf: weightOf,
    round1: round1
  };
})();
