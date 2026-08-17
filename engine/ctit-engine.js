/*!
 * CTIT 本地估算引擎（独立模块）
 * ============================================================
 * 从 CTIT App v2.2 的 app.js 中抽取的「本地 NLP 估算引擎」，
 * 原实现为 app.js 内的 LocalEngine 对象（约 L182-L707）。
 *
 * 功能：对自然语言任务描述进行本地（离线）估算，输出 CTIT 三参数：
 *   - T_impact  影响时间（小时）：完成该事务带来的总影响时间
 *   - T_cost    执行耗时（小时）：完成该事务实际需要投入的时间
 *   - T_remain  剩余时间（小时）：距离最佳执行窗口关闭还剩多久
 * 并基于 TROI = T_impact / T_remain 计算优先级，附带 PI 偏置校准。
 *
 * 本模块无任何网络/API 依赖，Node.js 与浏览器均可直接运行。
 * 云端（LLM）能力不在本模块内，见 app/app.js 的 callLLM。
 *
 * 用法：
 *   const { createCTITEngine } = require('./ctit-engine.js');
 *   const ctit = createCTITEngine();
 *   const tasks = ctit.analyze('写论文\n复习期末考试三天内');
 */

function createCTITEngine(opts) {
  opts = opts || {};

  // ---- 可注入状态（默认值与 app.js 一致） ----
  const pid = opts.pid || { integral: 0, lastError: 0, Kp: 0.5, Ki: 0.15, completedCount: 0 };
  const alpha = (opts.alpha !== undefined) ? opts.alpha : 0.0;
  const beta = (opts.beta !== undefined) ? opts.beta : 1.0;

  /* ============================================================
   * 排序 / 优先级
   * ============================================================ */
  function calcTROI(task) {
    const ti = Math.max(0.01, task.T_impact);
    const tr = Math.max(0.01, task.T_remain);
    return ti / tr;
  }

  function calcComposite(task) {
    const ti = Math.max(0.01, task.T_impact);
    const tc = Math.max(0.01, task.T_cost);
    const tr = Math.max(0.01, task.T_remain);
    return Math.pow(ti / tc, alpha) * Math.pow(ti / tr, beta);
  }

  function calcPriority(task) {
    if (alpha > 0) return calcComposite(task);
    return calcTROI(task);
  }

  function getPriorityLevel(troi) {
    if (troi >= 10) return { level: 1, label: 'P1', text: '紧急高价值' };
    if (troi >= 2) return { level: 2, label: 'P2', text: '重要' };
    if (troi >= 0.5) return { level: 3, label: 'P3', text: '常规' };
    return { level: 4, label: 'P4', text: '低优先' };
  }

  /* ============================================================
   * PID 偏置校准（PI 控制器）
   * ============================================================ */
  function applyPIDCorrection(T_impact_estimated) {
    const bias = pid.integral * pid.Ki;
    return T_impact_estimated * (1 - bias);
  }

  function recordCompletion(task, actualImpact, actualCost) {
    const error = task.T_impact - actualImpact;
    pid.integral += error;
    pid.lastError = error;
    pid.completedCount++;
    task.completed = true;
    task.completedAt = new Date().toISOString();
    task.actualImpact = actualImpact;
    task.actualCost = actualCost;
  }

  function getBiasPercent() {
    if (pid.completedCount === 0) return 0;
    const avgError = pid.integral / pid.completedCount;
    return (avgError / 20).toFixed(1) * 100;
  }

  /* ============================================================
   * 中文数字 / 数字提取
   * ============================================================ */

  /* Chinese numeral → number conversion */
  function cn2num(str) {
    const map = { '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
    if (str.length === 1 && map[str] !== undefined) return map[str];
    if (str.length === 2 && str[0] === '十') return 10 + (map[str[1]] || 0);
    if (str.length === 2 && str[1] === '十') return (map[str[0]] || 0) * 10;
    if (str.length === 3 && str[1] === '十') return (map[str[0]] || 0) * 10 + (map[str[2]] || 0);
    const n = parseInt(str);
    return isNaN(n) ? null : n;
  }

  /* Extract number from text — supports Arabic AND Chinese numerals */
  function extractNum(text, regex) {
    const m = text.match(regex);
    if (!m) return null;
    for (let i = 1; i < m.length; i++) {
      if (m[i] && /^\d+$/.test(m[i])) return parseInt(m[i]);
    }
    for (let i = 1; i < m.length; i++) {
      if (m[i]) {
        const n = cn2num(m[i]);
        if (n !== null) return n;
      }
    }
    return null;
  }

  /* ============================================================
   * 截止日期解析 → T_remain（小时）
   * ============================================================ */
  function parseDeadline(text) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const hoursLeftToday = Math.max(1, (todayEnd - now) / 3600000);

    if (/马上|立刻|紧急|急[^需]|ASAP|asap|马上要|十万火急|加急/.test(text)) return 2;
    if (/半小时/.test(text)) return 0.5;
    if (/半天/.test(text)) return 12;
    if (/大大后天/.test(text)) return 96 + hoursLeftToday;
    if (/大后天/.test(text)) return 72 + hoursLeftToday;
    if (/今天|今晚|今日|today|本日/.test(text)) return Math.max(1, hoursLeftToday);
    if (/明天|明早|明晚|tomorrow|tmr|次日/.test(text)) return 24 + hoursLeftToday;
    if (/后天|后日/.test(text)) return 48 + hoursLeftToday;

    let m2 = text.match(/(一|两|二|三|四|五|六|七|八|九)\s*(两|二|三|四|五|六|七|八|九)\s*天/);
    if (m2) {
      const n1 = cn2num(m2[1]);
      const n2 = cn2num(m2[2]);
      if (n1 !== null && n2 !== null) return Math.max(n1, n2) * 24;
    }
    m2 = text.match(/(一|两|二|三|四|五|六|七|八|九|十)\s*[~～\-至到]\s*(一|两|二|三|四|五|六|七|八|九|十)\s*天/);
    if (m2) {
      const n1 = cn2num(m2[1]);
      const n2 = cn2num(m2[2]);
      if (n1 !== null && n2 !== null) return Math.max(n1, n2) * 24;
    }

    const dayNum = extractNum(text, /(?:(\d+)|([零〇一二两三四五六七八九十]+))\s*天/);
    if (dayNum !== null && dayNum > 0) return dayNum * 24;

    const hourNum = extractNum(text, /(?:(\d+)|([零〇一二两三四五六七八九十]+))\s*小时/);
    if (hourNum !== null && hourNum > 0) return Math.max(0.5, hourNum);

    const minNum = extractNum(text, /(?:(\d+)|([零〇一二两三四五六七八九十]+))\s*分钟/);
    if (minNum !== null && minNum > 0) return Math.max(0.5, minNum / 60);

    const weekNum = extractNum(text, /(?:(\d+)|([零〇一二两三四五六七八九十]+))\s*周/);
    if (weekNum !== null && weekNum > 0) return weekNum * 168;

    const weekdayMap = { '日': 0, '天': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
    for (const name of Object.keys(weekdayMap)) {
      const dayIdx = weekdayMap[name];
      const re = new RegExp(`(?:本周|这周)?周${name}|(?:本周|这周)?星期${name}`);
      if (re.test(text) && !new RegExp(`下周${name}`).test(text)) {
        let diff = dayIdx - today.getDay();
        if (diff <= 0) diff += 7;
        if (new RegExp(`周${name}前|星期${name}前`).test(text)) {
          return Math.max(1, diff * 24 - 24 + hoursLeftToday);
        }
        return diff * 24 + hoursLeftToday;
      }
    }

    if (/本周末|这周末/.test(text)) {
      const sat = 6 - today.getDay();
      return Math.max(1, (sat <= 0 ? sat + 7 : sat) * 24 + hoursLeftToday);
    }

    for (const name of Object.keys(weekdayMap)) {
      const dayIdx = weekdayMap[name];
      if (new RegExp(`下周${name}`).test(text)) {
        let diff = dayIdx - today.getDay();
        if (diff <= 0) diff += 7;
        return (7 + diff) * 24 + hoursLeftToday;
      }
    }

    if (/下周末/.test(text)) {
      const sat = 6 - today.getDay();
      return Math.max(1, (sat <= 0 ? sat + 7 : sat + 7) * 24 + hoursLeftToday);
    }

    let m = text.match(/(\d{1,2})\s*[号日]/);
    if (m && !/月/.test(text)) {
      const day = parseInt(m[1]);
      if (day >= 1 && day <= 31) {
        const target = new Date(now.getFullYear(), now.getMonth(), day);
        let diff = (target - today) / 86400000;
        if (diff < 0) {
          const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, day);
          diff = (nextMonth - today) / 86400000;
        }
        return Math.max(1, diff * 24);
      }
    }

    if (/月底|月末|这个月底|本月底/.test(text)) {
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return Math.max(1, (endOfMonth - now) / 3600000);
    }

    if (/下个月底|下月底/.test(text)) {
      const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);
      return Math.max(1, (endOfNextMonth - now) / 3600000);
    }

    m = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]?/);
    if (m) {
      const month = parseInt(m[1]) - 1;
      const day = parseInt(m[2]);
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
        let target = new Date(now.getFullYear(), month, day);
        if (target < now) target = new Date(now.getFullYear() + 1, month, day);
        return Math.max(1, (target - now) / 3600000);
      }
    }

    if (/尽快|早点|赶紧|趁早|提早|提前完成/.test(text)) return 12;

    return 720; // 30 days default
  }

  /* ============================================================
   * 任务类别分类
   * ============================================================ */
  function classifyTask(text) {
    const categories = [
      { name: '学术研究', keywords: ['论文', '写完', '研究', '实验', '投稿', 'SCI', 'CSSCI', '期刊', '章节', '文献', '综述', '定理', '证明', '推导', '引理', '算法', '仿真', '答辩', '开题', '毕业', '导师', '课题', '立项', '申报书', '大创'], T_impact: [60, 200], T_cost: [4, 20] },
      { name: '考试学习', keywords: ['复习', '考试', '预习', '学习', '读', '看书', '课程', '刷题', '做题', '背', '笔记', '作业', '习题', '期末', '期中', 'quiz', 'assignment'], T_impact: [20, 80], T_cost: [2, 8] },
      { name: '工作项目', keywords: ['项目', '报告', '汇报', '开会', '组会', 'PPT', 'ppt', '方案', '代码', 'debug', '编程', '开发', '部署', '测试', '上线', '迭代', '需求', '原型', '文档', 'review', '重构'], T_impact: [30, 100], T_cost: [3, 10] },
      { name: '日常行政', keywords: ['回复', '邮件', '签字', '提交', '填表', '报销', '注册', '报名', '打印', '复印', '签字', '审批', '盖章', '领', '取', '交', '发', '送'], T_impact: [5, 20], T_cost: [0.5, 2] },
      { name: '生活健康', keywords: ['运动', '健身', '跑步', '买菜', '做饭', '打扫', '洗', '收拾', '整理', '睡觉', '休息', '体检', '看病', '吃药', '喝水'], T_impact: [10, 30], T_cost: [1, 3] },
      { name: '社交沟通', keywords: ['聚会', '聊天', '见面', '电话', '微信', '沟通', '讨论', '协商', '约', '吃饭', '聚餐'], T_impact: [5, 15], T_cost: [1, 4] },
      { name: '规划思考', keywords: ['计划', '规划', '复盘', '总结', '思考', '反思', '目标', '安排', '梳理', 'review'], T_impact: [40, 120], T_cost: [1, 4] },
    ];

    for (const cat of categories) {
      for (const kw of cat.keywords) {
        if (text.includes(kw)) return cat;
      }
    }
    return { name: '通用任务', T_impact: [10, 40], T_cost: [1, 5] };
  }

  /* ============================================================
   * 重要性 / 紧急性 乘数（标记解析）
   * ============================================================ */
  function parseImportance(text) {
    let mult = 1.0;
    if (/重要|关键|必须|一定|务必|核心/.test(text)) mult *= 1.5;
    if (/非常|极其|特别|十分/.test(text)) mult *= 1.2;
    if (/最好|尽量|争取|希望/.test(text)) mult *= 1.15;
    if (/可以|可选|有空/.test(text)) mult *= 0.7;
    if (/只是|而已|随便|顺手/.test(text)) mult *= 0.6;
    return mult;
  }

  function parseUrgency(text) {
    let mult = 1.0;
    if (/马上|立刻|紧急|急[^需]|ASAP/.test(text)) mult *= 0.15;
    if (/尽快|赶紧|趁早|早点/.test(text)) mult *= 0.4;
    if (/本周|这周|这几天/.test(text)) mult *= 0.6;
    return mult;
  }

  /* ============================================================
   * 时长提取
   * ============================================================ */
  function parseDuration(text) {
    let m = text.match(/(\d+(?:\.\d+)?)\s*小时/);
    if (m) return parseFloat(m[1]);
    if (/半小时|半个小时/.test(text)) return 0.5;
    if (/一上午|半天/.test(text)) return 4;
    if (/一天|一整天|全天/.test(text)) return 8;
    if (/一下午|一晚上/.test(text)) return 4;
    m = text.match(/(\d+(?:\.\d+)?)\s*分钟/);
    if (m) return parseFloat(m[1]) / 60;
    return null;
  }

  /* Random within range */
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  /* ============================================================
   * 推理说明生成
   * ============================================================ */
  function genReasoning(category, T_remain, urgencyMult, importanceMult) {
    const reasons = [];
    reasons.push(category.name);
    if (T_remain < 4) reasons.push('非常紧急');
    else if (T_remain < 24) reasons.push('近期截止');
    else if (T_remain < 72) reasons.push('本周需完成');
    else reasons.push('时间充裕');

    if (urgencyMult < 0.3) reasons.push('需立即行动');
    else if (urgencyMult < 0.6) reasons.push('需优先处理');

    if (importanceMult > 1.3) reasons.push('高影响事务');
    else if (importanceMult < 0.7) reasons.push('低影响事务');

    reasons.push('本地估算·建议低优事项使用');
    return reasons.join('·');
  }

  /* ============================================================
   * 事务名称清洗
   * ============================================================ */
  function cleanTaskName(desc) {
    let name = desc;
    name = name.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '');
    name = name.replace(/三天内|五天内|两天内|一天内|四天内|六天内|七天内|八天内|九天内|十天内/g, '');
    name = name.replace(/三天后|五天后|两天后|一天后|四天后|六天后|七天后|八天后|九天后|十天后/g, '');
    name = name.replace(/\d+\s*天[内后]?/g, '');
    name = name.replace(/[零〇一二两三四五六七八九十]+\s*天[内后]?/g, '');
    name = name.replace(/两三天|一两天|三四天|四五天|五六天|六七天/g, '');
    name = name.replace(/\d+\s*小时[后内]?/g, '');
    name = name.replace(/[零〇一二两三四五六七八九十]+\s*小时[后内]?/g, '');
    name = name.replace(/半小时[后内]?/g, '');
    name = name.replace(/半天[后内]?/g, '');
    name = name.replace(/\d+\s*分钟[后内]?/g, '');
    name = name.replace(/[零〇一二两三四五六七八九十]+\s*分钟[后内]?/g, '');
    name = name.replace(/\d+\s*周[后内]?/g, '');
    name = name.replace(/下周[一二三四五六日天]/g, '');
    name = name.replace(/本周[一二三四五六日天]/g, '');
    name = name.replace(/这周[一二三四五六日天]/g, '');
    name = name.replace(/周[一二三四五六日天]/g, '');
    name = name.replace(/星期[一二三四五六日天]/g, '');
    name = name.replace(/本周末|这周末|下周末/g, '');
    name = name.replace(/月底|月末|下个月底|下月底/g, '');
    name = name.replace(/\d{1,2}\s*月\s*\d{1,2}\s*[号日]?/g, '');
    name = name.replace(/\d{1,2}\s*[号日]/g, '');
    name = name.replace(/紧急|马上|立刻|ASAP|asap|尽快|赶紧|趁早|早点/g, '');
    name = name.replace(/大后天|大大后天|后天|明天|今天|今晚/g, '');
    name = name.replace(/tomorrow|tmr|today/g, '');
    name = name.replace(/\s+/g, ' ').replace(/[,，。、；;]+$/g, '').trim();
    if (!name) name = desc.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '').trim();
    if (name.length > 15) name = name.substring(0, 15) + '...';
    return name || '未命名事务';
  }

  /* ============================================================
   * 主分析入口
   * ============================================================ */
  function analyze(taskText) {
    const lines = String(taskText).split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const results = [];

    for (let i = 0; i < lines.length; i++) {
      const desc = lines[i];
      const category = classifyTask(desc);
      const T_remain = parseDeadline(desc) * parseUrgency(desc);
      const importanceMult = parseImportance(desc);
      const durationHint = parseDuration(desc);

      let T_impact = rand(category.T_impact[0], category.T_impact[1]) * importanceMult;
      T_impact = Math.max(2, T_impact);

      let T_cost;
      if (durationHint !== null) {
        T_cost = durationHint;
      } else {
        T_cost = rand(category.T_cost[0], category.T_cost[1]);
      }
      T_cost = Math.max(0.25, T_cost);

      const name = cleanTaskName(desc);
      const reasoning = genReasoning(category, T_remain, parseUrgency(desc), importanceMult);

      results.push({
        id: `task_${Date.now()}_${i}`,
        name: name,
        description: desc,
        rawInput: desc,
        T_impact: applyPIDCorrection(T_impact),
        T_cost: T_cost,
        T_remain: Math.max(0.5, T_remain),
        reasoning: reasoning,
        completed: false,
        completedAt: null,
        actualImpact: null,
        actualCost: null,
        predictedAt: new Date().toISOString(),
        adjusted: false,
        engine: 'local',
      });
    }

    return results;
  }

  /* ============================================================
   * 本地报告生成
   * ============================================================ */
  function generateReport(tasks, pidOverride, alphaOverride, betaOverride) {
    const p = pidOverride || pid;
    const a = (alphaOverride !== undefined) ? alphaOverride : alpha;
    const b = (betaOverride !== undefined) ? betaOverride : beta;

    const completed = tasks.filter(t => t.completed);
    const allTasks = tasks;
    const total = allTasks.length;
    const completedCount = completed.length;
    const completionRate = total > 0 ? (completedCount / total * 100).toFixed(1) : 0;

    let avgPredictedImpact = 0, avgActualImpact = 0;
    let overestimateCount = 0, underestimateCount = 0;
    let totalError = 0;
    if (completedCount > 0) {
      avgPredictedImpact = (completed.reduce((s, t) => s + t.T_impact, 0) / completedCount).toFixed(1);
      avgActualImpact = (completed.reduce((s, t) => s + (t.actualImpact || 0), 0) / completedCount).toFixed(1);
      completed.forEach(t => {
        const err = t.T_impact - (t.actualImpact || 0);
        totalError += err;
        if (err > 0) overestimateCount++;
        else if (err < 0) underestimateCount++;
      });
    }

    const avgError = completedCount > 0 ? (totalError / completedCount).toFixed(1) : 0;
    const accuracyPct = completedCount > 0 && avgPredictedImpact > 0
      ? (100 - Math.abs(avgError) / avgPredictedImpact * 100).toFixed(0)
      : 100;

    const pidBias = p.integral.toFixed(2);
    const biasPct = (function () {
      if (p.completedCount === 0) return 0;
      const avgErr = p.integral / p.completedCount;
      return (avgErr / 20).toFixed(1) * 100;
    })();
    const biasDirection = p.integral > 0 ? '高估' : (p.integral < 0 ? '低估' : '无偏');

    const catStats = {};
    completed.forEach(t => {
      const cat = classifyTask(t.description || t.name);
      if (!catStats[cat.name]) catStats[cat.name] = { count: 0, totalImpact: 0, totalCost: 0 };
      catStats[cat.name].count++;
      catStats[cat.name].totalImpact += t.actualImpact || t.T_impact;
      catStats[cat.name].totalCost += t.actualCost || t.T_cost;
    });

    const priStats = { P1: 0, P2: 0, P3: 0, P4: 0 };
    allTasks.forEach(t => {
      const troi = calcPriority(t);
      const pri = getPriorityLevel(troi);
      priStats[pri.label]++;
    });

    let report = `## 📈 预估准确性分析\n\n`;
    if (completedCount > 0) {
      report += `已完成事务的预测准确率约为 **${accuracyPct}%**。\n\n`;
      report += `- 平均预测影响时间：${avgPredictedImpact}h\n`;
      report += `- 平均实际影响时间：${avgActualImpact}h\n`;
      report += `- 平均偏差：${avgError}h（${biasDirection}）\n`;
      report += `- 高估事务数：${overestimateCount}，低估事务数：${underestimateCount}\n\n`;
      if (overestimateCount > underestimateCount + 1) {
        report += `> 倾向于高估事务影响时间，建议适当下调T_impact初始估计，或依赖PID校准。\n\n`;
      } else if (underestimateCount > overestimateCount + 1) {
        report += `> 倾向于低估事务影响时间，建议在输入描述时注意标注长期价值。\n\n`;
      } else {
        report += `> 预估整体较为均衡，继续维持当前估算习惯即可。\n\n`;
      }
    } else {
      report += `暂无已完成事务，无法分析预估准确性。完成若干事务后再生成报告可获得此项分析。\n\n`;
    }

    report += `## ✅ 任务完成统计\n\n`;
    report += `- 事务总数：${total}\n`;
    report += `- 已完成：${completedCount}\n`;
    report += `- 完成率：${completionRate}%\n\n`;
    report += `**优先级分布：**\n`;
    report += `- P1 紧急高价值：${priStats.P1}\n`;
    report += `- P2 重要：${priStats.P2}\n`;
    report += `- P3 常规：${priStats.P3}\n`;
    report += `- P4 低优先：${priStats.P4}\n\n`;

    if (completionRate < 50 && total > 5) {
      report += `> 完成率偏低，建议检查P3/P4事务是否过多，考虑精简或延后低优先事项。\n\n`;
    } else if (completionRate >= 80 && total > 5) {
      report += `> 完成率优秀，时间执行效率高，可适当增加高影响事务的投入。\n\n`;
    }

    report += `## 🔧 PID校准状态\n\n`;
    report += `- 偏置积分值：${pidBias}\n`;
    report += `- 校准方向：${biasDirection}（${biasPct > 0 ? '+' : ''}${biasPct.toFixed(1)}%）\n`;
    report += `- 校准次数：${p.completedCount}\n\n`;
    if (Math.abs(biasPct) > 20) {
      report += `> 偏置较大，PID已自动修正后续预估。如持续偏差，考虑手动调整K_i参数。\n\n`;
    } else if (p.completedCount > 0) {
      report += `> 校准状态良好，偏置在合理范围内。\n\n`;
    }

    report += `## 📊 事务类别分布\n\n`;
    if (Object.keys(catStats).length > 0) {
      report += `| 类别 | 数量 | 总影响时间 | 总耗时 |\n`;
      report += `|------|------|------------|--------|\n`;
      for (const cat of Object.keys(catStats)) {
        const stats = catStats[cat];
        report += `| ${cat} | ${stats.count} | ${stats.totalImpact.toFixed(1)}h | ${stats.totalCost.toFixed(1)}h |\n`;
      }
      report += `\n`;
    } else {
      report += `暂无已完成事务的类别数据。\n\n`;
    }

    report += `## 💡 个性化优化建议\n\n`;
    const suggestions = [];
    if (completedCount === 0) {
      suggestions.push('开始完成事务并记录实际影响时间，以启用PID自动校准。');
      suggestions.push('建议从P1/P2事务入手，优先处理高TROI值任务。');
    }
    if (completionRate < 50 && total > 5) {
      suggestions.push(`完成率仅${completionRate}%，建议每日复盘未完成事务，将低优先事项延后或删除。`);
    }
    if (overestimateCount > underestimateCount + 1) {
      suggestions.push('存在高估倾向，后续事务可在描述中更精确标注影响范围，或信任PID校准结果。');
    }
    if (underestimateCount > overestimateCount + 1) {
      suggestions.push('存在低估倾向，注意考虑事务的连锁效应和长期价值。');
    }
    if (Math.abs(biasPct) > 30 && p.completedCount > 2) {
      suggestions.push(`PID偏置达${biasPct.toFixed(1)}%，建议在设置中微调K_i值（当前${p.Ki}）。`);
    }
    if (priStats.P1 + priStats.P2 === 0 && total > 3) {
      suggestions.push('无高优先级事务，考虑是否需要为重要事务设置更近的截止日期。');
    }
    if (total > 10 && completionRate > 80) {
      suggestions.push('执行效率优秀，建议挑战更高T_impact事务，扩大时间投资回报。');
    }
    suggestions.push('定期使用"刷新排序"功能，让TROI随剩余时间自动更新优先级。');

    suggestions.forEach((s, i) => {
      report += `${i + 1}. ${s}\n`;
    });

    report += `\n---\n*报告由CTIT本地分析引擎v2生成 · ${new Date().toLocaleString('zh-CN')}*\n`;

    return report;
  }

  /* ============================================================
   * 导出引擎对象
   * ============================================================ */
  return {
    // 纯 NLP 解析
    cn2num,
    extractNum,
    parseDeadline,
    classifyTask,
    parseImportance,
    parseUrgency,
    parseDuration,
    genReasoning,
    cleanTaskName,
    // 排序 / 优先级
    calcTROI,
    calcComposite,
    calcPriority,
    getPriorityLevel,
    // PID 校准
    applyPIDCorrection,
    recordCompletion,
    getBiasPercent,
    // 主入口
    analyze,
    generateReport,
    // 状态访问
    get pid() { return pid; },
    get alpha() { return alpha; },
    get beta() { return beta; },
  };
}

/* 默认实例 */
const defaultEngine = createCTITEngine();

/* Node.js 导出 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createCTITEngine, defaultEngine, CTIT: defaultEngine };
}

/* 浏览器全局 */
if (typeof window !== 'undefined') {
  window.CTITEngine = defaultEngine;
  window.createCTITEngine = createCTITEngine;
}
