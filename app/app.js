/* CTIT App v2 - app.js */
/* ===== State Management ===== */
const State = {
    // v2: engine selection ('local' | 'cloud')
    engine: 'local',
    // Cloud API settings (kept for cloud engine / backward compat)
    apiKey: '',
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    modelName: 'glm-4-flash',
    // Tasks and PID
    tasks: [],
    pid: { integral: 0, lastError: 0, Kp: 0.5, Ki: 0.15, completedCount: 0 },
    alpha: 0.0,
    beta: 1.0,
    theme: 'light',
    // Modal state
    editingTask: null,
    completingTask: null,
};

/* ===== Persistence (backward compatible) ===== */
function saveState() {
    const persist = {
        version: 2,
        engine: State.engine,
        apiKey: State.apiKey,
        apiUrl: State.apiUrl,
        modelName: State.modelName,
        tasks: State.tasks,
        pid: State.pid,
        alpha: State.alpha,
        beta: State.beta,
        theme: State.theme,
    };
    localStorage.setItem('ctit_state', JSON.stringify(persist));
}

function loadState() {
    const raw = localStorage.getItem('ctit_state');
    if (!raw) return;
    try {
        const data = JSON.parse(raw);
        // v1 data has no 'version' or 'engine' — default to 'local'
        if (!data.version) {
            // v1 user with API key → keep cloud engine for them
            if (data.apiKey) {
                data.engine = 'cloud';
            } else {
                data.engine = 'local';
            }
            data.version = 2;
        }
        Object.assign(State, data);
    } catch (e) { console.warn('Failed to load state', e); }
}

/* ===== DOM Helpers ===== */
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function showToast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 2500);
}

function showView(name) {
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`view-${name}`).classList.add('active');
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
}

/* ===== Theme ===== */
function applyTheme() {
    document.documentElement.setAttribute('data-theme', State.theme);
    $('themeToggle').textContent = State.theme === 'dark' ? '☀️' : '🌙';
}

/* ===== Engine Management ===== */
function applyEngine() {
    const isLocal = State.engine === 'local';
    // Header badge
    $('engineBadge').textContent = isLocal ? '本地引擎' : '云端模型';
    $('engineBadge').className = 'engine-badge ' + (isLocal ? 'local' : 'cloud');
    // Banner
    $('engineIcon').textContent = isLocal ? '📱' : '☁️';
    $('engineTitle').textContent = isLocal ? '本地估算引擎' : '云端大模型';
    $('engineDesc').textContent = isLocal ? '无需API，离线运行，即输即算' : '已连接云端模型，分析更深入';
    // Mode hint
    $('modeHint').textContent = isLocal ? '本地模式：即时返回，无需网络' : '云端模式：将调用API分析，需要网络';
    $('modeHint').className = 'mode-hint ' + (isLocal ? 'local' : 'cloud');
    // Report section
    $('reportEngineNote').innerHTML = isLocal
        ? '<span>📱 本地报告生成器：基于模板分析，无需联网</span>'
        : '<span>☁️ 云端报告生成器：将发送数据到API生成</span>';
    $('consentBox').classList.toggle('hidden', isLocal);
    $('reportDisclaimer').textContent = isLocal
        ? '⚠️ 报告由本地分析引擎生成，仅供参考。数据不会离开本设备。'
        : '⚠️ 报告内容由AI生成，仅供参考。数据仅在你同意时发送，不会存储在服务器。';
    // Settings
    updateEngineOptionStyles();
    $('cloudSettings').classList.toggle('hidden', isLocal);
}

function updateEngineOptionStyles() {
    $('engineOptLocal').classList.toggle('selected', State.engine === 'local');
    $('engineOptCloud').classList.toggle('selected', State.engine === 'cloud');
}

function setEngine(engine) {
    State.engine = engine;
    saveState();
    applyEngine();
    showToast(engine === 'local' ? '已切换到本地引擎' : '已切换到云端模型');
}

/* ===== CTIT Calculations ===== */
function calcTROI(task) {
    const ti = Math.max(0.01, task.T_impact);
    const tr = Math.max(0.01, task.T_remain);
    return ti / tr;
}

function calcComposite(task) {
    const ti = Math.max(0.01, task.T_impact);
    const tc = Math.max(0.01, task.T_cost);
    const tr = Math.max(0.01, task.T_remain);
    const a = State.alpha;
    const b = State.beta;
    return Math.pow(ti / tc, a) * Math.pow(ti / tr, b);
}

function calcPriority(task) {
    if (State.alpha > 0) return calcComposite(task);
    return calcTROI(task);
}

function getPriorityLevel(troi) {
    if (troi >= 10) return { level: 1, label: 'P1', text: '紧急高价值' };
    if (troi >= 2) return { level: 2, label: 'P2', text: '重要' };
    if (troi >= 0.5) return { level: 3, label: 'P3', text: '常规' };
    return { level: 4, label: 'P4', text: '低优先' };
}

function sortTasks() {
    const incomplete = State.tasks.filter(t => !t.completed);
    const complete = State.tasks.filter(t => t.completed);
    incomplete.sort((a, b) => calcPriority(b) - calcPriority(a));
    complete.sort((a, b) => {
        if (a.completedAt && b.completedAt) return new Date(b.completedAt) - new Date(a.completedAt);
        return 0;
    });
    State.tasks = [...incomplete, ...complete];
}

/* ===== PID Controller ===== */
function applyPIDCorrection(T_impact_estimated) {
    const bias = State.pid.integral * State.pid.Ki;
    return T_impact_estimated * (1 - bias);
}

function recordCompletion(task, actualImpact, actualCost) {
    const error = task.T_impact - actualImpact;
    State.pid.integral += error;
    State.pid.lastError = error;
    State.pid.completedCount++;
    task.completed = true;
    task.completedAt = new Date().toISOString();
    task.actualImpact = actualImpact;
    task.actualCost = actualCost;
    saveState();
}

function getBiasPercent() {
    if (State.pid.completedCount === 0) return 0;
    const avgError = State.pid.integral / State.pid.completedCount;
    return (avgError / 20).toFixed(1) * 100;
}

/* ===== Local Estimation Engine ===== */
const LocalEngine = {

    /* Chinese numeral → number conversion */
    cn2num(str) {
        const map = { '零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 };
        // Single character
        if (str.length === 1 && map[str] !== undefined) return map[str];
        // "十X" = 10+X  e.g. 十二=12
        if (str.length === 2 && str[0] === '十') return 10 + (map[str[1]] || 0);
        // "X十" = X*10  e.g. 二十=20
        if (str.length === 2 && str[1] === '十') return (map[str[0]] || 0) * 10;
        // "X十Y" = X*10+Y  e.g. 二十三=23
        if (str.length === 3 && str[1] === '十') return (map[str[0]] || 0) * 10 + (map[str[2]] || 0);
        // Try parsing as plain number
        const n = parseInt(str);
        return isNaN(n) ? null : n;
    },

    /* Extract number from text — supports Arabic AND Chinese numerals */
    extractNum(text, regex) {
        const m = text.match(regex);
        if (!m) return null;
        // Try Arabic numeral first
        for (let i = 1; i < m.length; i++) {
            if (m[i] && /^\d+$/.test(m[i])) return parseInt(m[i]);
        }
        // Fall back to Chinese numeral
        for (let i = 1; i < m.length; i++) {
            if (m[i]) {
                const n = this.cn2num(m[i]);
                if (n !== null) return n;
            }
        }
        return null;
    },

    /* Deadline parser → T_remain (hours)
     * Exhaustive time expression patterns:
     *   - 紧急/立刻/马上 → 2h
     *   - 今天/今晚 → hours left today
     *   - 明天/明早 → 24h + remainder
     *   - 后天 → 48h + remainder
     *   - 大后天/大大后天 → 72h / 96h
     *   - X天(后/内/以内) → X×24h  (X supports 中文数字)
     *   - X小时(后/内/以内) → X hours
     *   - X分钟(后/内) → X/60 hours
     *   - 半天/半天后 → 12h
     *   - 一周/两周/X周(后/内) → X×168h
     *   - 下周X/本周X/周X/星期X → weekday calc
     *   - 本周末/下周末
     *   - X号/X日 → date in current/next month
     *   - X月X日 → exact date
     *   - 月底/月末
     *   - 尽快 → 12h
     *   - 两三天/一两天 → take the larger number
     *   - Default: 720h (30 days)
     */
    parseDeadline(text) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        const hoursLeftToday = Math.max(1, (todayEnd - now) / 3600000);

        // ── 紧急/立刻/马上 → 2h
        if (/马上|立刻|紧急|急[^需]|ASAP|asap|马上要|十万火急|加急/.test(text)) return 2;

        // ── 半小时/半小时后 → 0.5h (must check BEFORE 半天)
        if (/半小时/.test(text)) return 0.5;

        // ── 半天 → 12h
        if (/半天/.test(text)) return 12;

        // ── 大后天 (3 days), 大大后天 (4 days)
        if (/大大后天/.test(text)) return 96 + hoursLeftToday;
        if (/大后天/.test(text)) return 72 + hoursLeftToday;

        // ── 今天/今晚
        if (/今天|今晚|今日|today|本日/.test(text)) return Math.max(1, hoursLeftToday);

        // ── 明天/明早
        if (/明天|明早|明晚|tomorrow|tmr|次日/.test(text)) return 24 + hoursLeftToday;

        // ── 后天
        if (/后天|后日/.test(text)) return 48 + hoursLeftToday;

        // ── "两三天"/"一两天"/"三四天" → take larger value
        //    No separator between the two numerals
        let m2 = text.match(/(一|两|二|三|四|五|六|七|八|九)\s*(两|二|三|四|五|六|七|八|九)\s*天/);
        if (m2) {
            const n1 = this.cn2num(m2[1]);
            const n2 = this.cn2num(m2[2]);
            if (n1 !== null && n2 !== null) return Math.max(n1, n2) * 24;
        }
        // Also handle "两~三天" with separator
        m2 = text.match(/(一|两|二|三|四|五|六|七|八|九|十)\s*[~～\-至到]\s*(一|两|二|三|四|五|六|七|八|九|十)\s*天/);
        if (m2) {
            const n1 = this.cn2num(m2[1]);
            const n2 = this.cn2num(m2[2]);
            if (n1 !== null && n2 !== null) return Math.max(n1, n2) * 24;
        }

        // ── X天(后/内/以内/之后/之内) — supports Arabic + Chinese numerals
        //    "三天内" = within 3 days = 3×24h (NOT + hoursLeftToday)
        //    "五天后" = after 5 days = 5×24h
        //    "十天" = 10 days = 10×24h
        const dayNum = this.extractNum(text, /(?:(\d+)|([零〇一二两三四五六七八九十]+))\s*天/);
        if (dayNum !== null && dayNum > 0) {
            return dayNum * 24;
        }

        // ── X小时(后/内/以内/之后/之内) — supports Arabic + Chinese numerals
        const hourNum = this.extractNum(text, /(?:(\d+)|([零〇一二两三四五六七八九十]+))\s*小时/);
        if (hourNum !== null && hourNum > 0) {
            return Math.max(0.5, hourNum);
        }

        // ── X分钟(后/内/以后) — supports Arabic + Chinese numerals
        const minNum = this.extractNum(text, /(?:(\d+)|([零〇一二两三四五六七八九十]+))\s*分钟/);
        if (minNum !== null && minNum > 0) {
            return Math.max(0.5, minNum / 60);
        }

        // ── X周(后/内/以内) — supports Arabic + Chinese numerals
        const weekNum = this.extractNum(text, /(?:(\d+)|([零〇一二两三四五六七八九十]+))\s*周/);
        if (weekNum !== null && weekNum > 0) {
            return weekNum * 168;
        }

        // ── 本周X / 周X / 星期X
        const weekdayMap = { '日': 0, '天': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
        for (const [name, dayIdx] of Object.entries(weekdayMap)) {
            const re = new RegExp(`(?:本周|这周)?周${name}|(?:本周|这周)?星期${name}`);
            if (re.test(text) && !new RegExp(`下周${name}`).test(text)) {
                let diff = dayIdx - today.getDay();
                if (diff <= 0) diff += 7;
                // "周X前" means before that day
                if (new RegExp(`周${name}前|星期${name}前`).test(text)) {
                    return Math.max(1, diff * 24 - 24 + hoursLeftToday);
                }
                return diff * 24 + hoursLeftToday;
            }
        }

        // ── 本周末
        if (/本周末|这周末/.test(text)) {
            const sat = 6 - today.getDay();
            return Math.max(1, (sat <= 0 ? sat + 7 : sat) * 24 + hoursLeftToday);
        }

        // ── 下周X
        for (const [name, dayIdx] of Object.entries(weekdayMap)) {
            if (new RegExp(`下周${name}`).test(text)) {
                let diff = dayIdx - today.getDay();
                if (diff <= 0) diff += 7;
                return (7 + diff) * 24 + hoursLeftToday;
            }
        }

        // ── 下周末
        if (/下周末/.test(text)) {
            const sat = 6 - today.getDay();
            return Math.max(1, (sat <= 0 ? sat + 7 : sat + 7) * 24 + hoursLeftToday);
        }

        // ── X号/X日 (date in current month)
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

        // ── 月底/月末
        if (/月底|月末|这个月底|本月底/.test(text)) {
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            return Math.max(1, (endOfMonth - now) / 3600000);
        }

        // ── 下个月底
        if (/下个月底|下月底/.test(text)) {
            const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);
            return Math.max(1, (endOfNextMonth - now) / 3600000);
        }

        // ── X月X日/X月X号
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

        // ── 尽快
        if (/尽快|早点|赶紧|趁早|提早|提前完成/.test(text)) return 12;

        // ── No deadline found
        return 720; // 30 days default
    },

    /* Task category classifier */
    classifyTask(text) {
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
                if (text.includes(kw)) {
                    return cat;
                }
            }
        }
        // default
        return { name: '通用任务', T_impact: [10, 40], T_cost: [1, 5] };
    },

    /* Importance multiplier from markers */
    parseImportance(text) {
        let mult = 1.0;
        if (/重要|关键|必须|一定|务必|核心/.test(text)) mult *= 1.5;
        if (/非常|极其|特别|十分/.test(text)) mult *= 1.2;
        if (/最好|尽量|争取|希望/.test(text)) mult *= 1.15;
        if (/可以|可选|有空/.test(text)) mult *= 0.7;
        if (/只是|而已|随便|顺手/.test(text)) mult *= 0.6;
        return mult;
    },

    /* Urgency multiplier from markers */
    parseUrgency(text) {
        let mult = 1.0;
        if (/马上|立刻|紧急|急[^需]|ASAP/.test(text)) mult *= 0.15;
        if (/尽快|赶紧|趁早|早点/.test(text)) mult *= 0.4;
        if (/本周|这周|这几天/.test(text)) mult *= 0.6;
        return mult;
    },

    /* Duration extractor */
    parseDuration(text) {
        let m = text.match(/(\d+(?:\.\d+)?)\s*小时/);
        if (m) return parseFloat(m[1]);
        if (/半小时|半个小时/.test(text)) return 0.5;
        if (/一上午|半天/.test(text)) return 4;
        if (/一天|一整天|全天/.test(text)) return 8;
        if (/一下午|一晚上/.test(text)) return 4;
        m = text.match(/(\d+(?:\.\d+)?)\s*分钟/);
        if (m) return parseFloat(m[1]) / 60;
        return null;
    },

    /* Random within range */
    rand(min, max) {
        return min + Math.random() * (max - min);
    },

    /* Generate reasoning */
    genReasoning(category, T_remain, urgencyMult, importanceMult) {
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
    },

    /* Clean task name — strip time expressions from description */
    cleanTaskName(desc) {
        let name = desc;
        // Remove parenthetical content
        name = name.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '');
        // Strip deadline/time expressions
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
        // Clean up residual spaces and punctuation
        name = name.replace(/\s+/g, ' ').replace(/[,，。、；;]+$/g, '').trim();
        // Fallback: if name becomes empty, use original
        if (!name) name = desc.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '').trim();
        // Truncate
        if (name.length > 15) name = name.substring(0, 15) + '...';
        return name || '未命名事务';
    },

    /* Main analyze function */
    analyze(taskText) {
        const lines = taskText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const results = [];

        for (let i = 0; i < lines.length; i++) {
            const desc = lines[i];
            const category = this.classifyTask(desc);
            const T_remain = this.parseDeadline(desc) * this.parseUrgency(desc);
            const importanceMult = this.parseImportance(desc);
            const durationHint = this.parseDuration(desc);

            // Estimate T_impact — slightly boost ranges to be closer to LLM estimates
            let T_impact = this.rand(category.T_impact[0], category.T_impact[1]) * importanceMult;
            T_impact = Math.max(2, T_impact);

            // Estimate T_cost
            let T_cost;
            if (durationHint !== null) {
                T_cost = durationHint;
            } else {
                T_cost = this.rand(category.T_cost[0], category.T_cost[1]);
            }
            T_cost = Math.max(0.25, T_cost);

            // Clean task name — strip time expressions
            const name = this.cleanTaskName(desc);

            const reasoning = this.genReasoning(category, T_remain, this.parseUrgency(desc), importanceMult);

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
    },

    /* Local report generator */
    generateReport(tasks, pid, alpha, beta) {
        const completed = tasks.filter(t => t.completed);
        const allTasks = tasks;
        const total = allTasks.length;
        const completedCount = completed.length;
        const completionRate = total > 0 ? (completedCount / total * 100).toFixed(1) : 0;

        // Prediction accuracy
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

        // PID status
        const pidBias = pid.integral.toFixed(2);
        const biasPct = getBiasPercent();
        const biasDirection = pid.integral > 0 ? '高估' : (pid.integral < 0 ? '低估' : '无偏');

        // Category distribution
        const catStats = {};
        completed.forEach(t => {
            const cat = this.classifyTask(t.description || t.name);
            if (!catStats[cat.name]) catStats[cat.name] = { count: 0, totalImpact: 0, totalCost: 0 };
            catStats[cat.name].count++;
            catStats[cat.name].totalImpact += t.actualImpact || t.T_impact;
            catStats[cat.name].totalCost += t.actualCost || t.T_cost;
        });

        // Priority distribution
        const priStats = { P1: 0, P2: 0, P3: 0, P4: 0 };
        allTasks.forEach(t => {
            const troi = calcPriority(t);
            const pri = getPriorityLevel(troi);
            priStats[pri.label]++;
        });

        // Build report
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
        report += `- 校准次数：${pid.completedCount}\n\n`;
        if (Math.abs(biasPct) > 20) {
            report += `> 偏置较大，PID已自动修正后续预估。如持续偏差，考虑手动调整K_i参数。\n\n`;
        } else if (pid.completedCount > 0) {
            report += `> 校准状态良好，偏置在合理范围内。\n\n`;
        }

        report += `## 📊 事务类别分布\n\n`;
        if (Object.keys(catStats).length > 0) {
            report += `| 类别 | 数量 | 总影响时间 | 总耗时 |\n`;
            report += `|------|------|------------|--------|\n`;
            for (const [cat, stats] of Object.entries(catStats)) {
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
        if (Math.abs(biasPct) > 30 && pid.completedCount > 2) {
            suggestions.push(`PID偏置达${biasPct.toFixed(1)}%，建议在设置中微调K_i值（当前${pid.Ki}）。`);
        }
        if (priStats.P1 + priStats.P2 === 0 && total > 3) {
            suggestions.push('无高优先级事务，考虑是否需要为重要事务设置更近的截止日期。');
        }
        if (total > 10 && completionRate > 80) {
            suggestions.push('执行效率优秀，建议挑战更高T_impact事务，扩大时间投资回报。');
        }
        // Always add a generic one
        suggestions.push('定期使用"刷新排序"功能，让TROI随剩余时间自动更新优先级。');

        suggestions.forEach((s, i) => {
            report += `${i + 1}. ${s}\n`;
        });

        report += `\n---\n*报告由CTIT本地分析引擎v2生成 · ${new Date().toLocaleString('zh-CN')}*\n`;

        return report;
    },
};

/* ===== Cloud LLM API (preserved from v1) ===== */
async function callLLM(messages) {
    const response = await fetch(State.apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${State.apiKey}`,
        },
        body: JSON.stringify({
            model: State.modelName,
            messages: messages,
            temperature: 0.7,
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`API调用失败 (${response.status}): ${err}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

const ANALYZE_PROMPT = `你是一个时间管理分析助手，基于CTIT（可计算时间投资理论）框架。

请分析用户描述的任务，为每个任务估算以下三个参数：

1. T_impact（影响时间，单位：小时）：完成此任务能带来的总影响时间。考虑：
   - 任务的直接效果持续时间
   - 连锁效应（完成后对其他任务的积极影响）
   - 长期价值（技能提升、关系建立、系统搭建等）

2. T_cost（执行耗时，单位：小时）：完成此任务实际需要投入的时间。

3. T_remain（剩余时间，单位：小时）：距离此任务的最佳执行窗口关闭还有多少小时。
   - 有明确截止日期的任务：计算到截止日期的小时数
   - 无明确截止日期的任务：设为720（30天默认窗口）
   - 紧急任务：较小的值

请以严格的JSON格式返回，不要包含任何其他文字：
{
  "tasks": [
    {
      "name": "任务简短名称（10字以内）",
      "description": "原始任务描述",
      "T_impact": 数值,
      "T_cost": 数值,
      "T_remain": 数值,
      "reasoning": "参数估算的简短理由（20字以内）"
    }
  ]
}`;

async function analyzeTasksCloud(taskDescriptions) {
    const messages = [
        { role: 'system', content: ANALYZE_PROMPT },
        { role: 'user', content: `请分析以下任务：\n${taskDescriptions}` },
    ];

    const result = await callLLM(messages);

    let parsed;
    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
        } else {
            throw new Error('未找到JSON');
        }
    } catch (e) {
        throw new Error(`解析失败: ${e.message}\n原始响应: ${result.substring(0, 200)}`);
    }

    if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
        throw new Error('返回格式不正确');
    }

    return parsed.tasks.map((t, i) => ({
        id: `task_${Date.now()}_${i}`,
        name: t.name || t.description || `任务${i+1}`,
        description: t.description || t.name || '',
        T_impact: applyPIDCorrection(Number(t.T_impact) || 10),
        T_cost: Math.max(0.25, Number(t.T_cost) || 1),
        T_remain: Math.max(0.5, Number(t.T_remain) || 720),
        reasoning: t.reasoning || '',
        completed: false,
        completedAt: null,
        actualImpact: null,
        actualCost: null,
        predictedAt: new Date().toISOString(),
        adjusted: false,
        engine: 'cloud',
    }));
}

/* ===== Cloud Re-estimate (for locally-estimated tasks) ===== */
async function reestimateWithCloud(task) {
    if (!State.apiKey) {
        showToast('请先在设置中配置API Key');
        showView('settings');
        return;
    }
    const rawInput = task.rawInput || task.description || task.name;
    showToast('正在用大模型重新估算...');
    try {
        const messages = [
            { role: 'system', content: ANALYZE_PROMPT },
            { role: 'user', content: `请分析以下任务：\n${rawInput}` },
        ];
        const result = await callLLM(messages);
        let parsed;
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        else throw new Error('未找到JSON');
        if (!parsed.tasks || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
            throw new Error('返回格式不正确');
        }
        const t = parsed.tasks[0];
        // Overwrite task parameters with cloud estimates
        task.T_impact = applyPIDCorrection(Number(t.T_impact) || task.T_impact);
        task.T_cost = Math.max(0.25, Number(t.T_cost) || task.T_cost);
        task.T_remain = Math.max(0.5, Number(t.T_remain) || task.T_remain);
        task.reasoning = (t.reasoning || '') + '·云端精估';
        task.engine = 'cloud';
        task.adjusted = true;
        task.predictedAt = new Date().toISOString();
        saveState();
        renderAll();
        showToast('已用大模型重新估算');
    } catch (e) {
        showToast(`精估失败: ${e.message}`);
        console.error(e);
    }
}

/* ===== Unified Analyze (engine dispatcher) ===== */
async function analyzeTasks(taskDescriptions) {
    if (State.engine === 'local') {
        // Simulate small delay for UX feedback
        await new Promise(r => setTimeout(r, 200));
        return LocalEngine.analyze(taskDescriptions);
    } else {
        if (!State.apiKey) throw new Error('请先在设置中配置API Key');
        return await analyzeTasksCloud(taskDescriptions);
    }
}

/* ===== Report Generation ===== */
async function generateReport() {
    if (State.engine === 'local') {
        await new Promise(r => setTimeout(r, 300));
        return LocalEngine.generateReport(State.tasks, State.pid, State.alpha, State.beta);
    } else {
        return await generateReportCloud();
    }
}

async function generateReportCloud() {
    const completedTasks = State.tasks.filter(t => t.completed);
    const allTasks = State.tasks;

    const stats = {
        total: allTasks.length,
        completed: completedTasks.length,
        completionRate: allTasks.length > 0 ? (completedTasks.length / allTasks.length * 100).toFixed(1) : 0,
        avgPredictedImpact: completedTasks.length > 0 ?
            (completedTasks.reduce((s, t) => s + t.T_impact, 0) / completedTasks.length).toFixed(1) : 0,
        avgActualImpact: completedTasks.length > 0 ?
            (completedTasks.reduce((s, t) => s + (t.actualImpact || 0), 0) / completedTasks.length).toFixed(1) : 0,
        pidBias: getBiasPercent(),
        pidIntegral: State.pid.integral.toFixed(2),
        completedCount: State.pid.completedCount,
    };

    const taskData = completedTasks.map(t => ({
        name: t.name,
        predicted_T_impact: t.T_impact,
        actual_T_impact: t.actualImpact,
        predicted_T_cost: t.T_cost,
        actual_T_cost: t.actualCost,
        completedAt: t.completedAt,
    }));

    const reportPrompt = `你是CTIT时间管理分析助手。请基于以下用户任务完成数据，生成一份个性化的时间管理分析报告。

报告要求：
1. 使用Markdown格式
2. 包含以下部分：
   - 📈 预估准确性分析（对比预测T_impact与实际T_impact，分析偏差方向和原因）
   - ✅ 任务完成统计（完成率、平均耗时等）
   - 🔧 PID校准状态（当前偏置积分值、建议调整方向）
   - 💡 个性化优化建议（3-5条具体建议）
3. 语言简洁有力，避免空话
4. 每个建议都要基于实际数据

统计数据：
- 总任务数: ${stats.total}
- 已完成: ${stats.completed}
- 完成率: ${stats.completionRate}%
- 平均预测影响时间: ${stats.avgPredictedImpact}h
- 平均实际影响时间: ${stats.avgActualImpact}h
- PID偏置积分: ${stats.pidIntegral}
- 已校准次数: ${stats.completedCount}

已完成任务详情:
${JSON.stringify(taskData, null, 2)}`;

    const messages = [
        { role: 'system', content: '你是CTIT时间管理分析助手，请生成结构化的Markdown报告。' },
        { role: 'user', content: reportPrompt },
    ];

    return await callLLM(messages);
}

/* ===== Rendering ===== */
function renderTaskList() {
    const list = $('taskList');
    if (State.tasks.length === 0) {
        list.innerHTML = '';
        $('actionBar').classList.add('hidden');
        return;
    }

    $('actionBar').classList.remove('hidden');

    list.innerHTML = State.tasks.map(task => {
        const troi = calcPriority(task);
        const pri = getPriorityLevel(troi);
        const isCompleted = task.completed;
        const engineTag = task.engine === 'local' ? '📱' : '☁️';

        return `
        <div class="task-card priority-${pri.level} ${isCompleted ? 'completed' : ''}" data-id="${task.id}">
            <div class="task-top">
                <div class="task-checkbox ${isCompleted ? 'checked' : ''}" data-action="toggle" data-id="${task.id}">
                    ${isCompleted ? '✓' : ''}
                </div>
                <div class="task-info">
                    <div class="task-name">${engineTag} ${escapeHtml(task.name)}</div>
                    ${task.reasoning ? `<div class="task-reasoning">${escapeHtml(task.reasoning)}</div>` : ''}
                    <div class="task-troi">
                        <span class="troi-badge">TROI ${troi.toFixed(2)}</span>
                        <span class="priority-tag p${pri.level}">${pri.label} ${pri.text}</span>
                        ${task.adjusted ? '<span style="font-size:11px;color:var(--text-tertiary);">✏️ 已调整</span>' : ''}
                        ${isCompleted && task.completedAt ? `<span style="font-size:11px;color:var(--success);">✓ ${formatTime(task.completedAt)}</span>` : ''}
                    </div>
                    <div class="task-params">
                        <span class="param-item">影响 <strong>${task.T_impact.toFixed(1)}h</strong></span>
                        <span class="param-item">耗时 <strong>${task.T_cost.toFixed(1)}h</strong></span>
                        <span class="param-item">剩余 <strong>${formatRemain(task.T_remain)}</strong></span>
                    </div>
                    ${!isCompleted ? `
                    <div class="task-actions">
                        <button class="task-btn" data-action="adjust" data-id="${task.id}">⚙ 调整参数</button>
                        ${task.engine === 'local' ? `<button class="task-btn task-btn-cloud" data-action="reestimate" data-id="${task.id}">☁️ 精估</button>` : ''}
                        <button class="task-btn" data-action="complete" data-id="${task.id}">✓ 记录完成</button>
                    </div>
                    ` : `                    <div class="task-actions">
                        <button class="task-btn" data-action="uncomplete" data-id="${task.id}">↩ 取消完成</button>
                        <button class="task-btn" data-action="delete" data-id="${task.id}">🗑 删除</button>
                    </div>
                    `}
                </div>
            </div>
        </div>
        `;
    }).join('');
}

function renderPIDBadge() {
    if (State.pid.completedCount > 0) {
        $('pidBadge').classList.remove('hidden');
        const bias = getBiasPercent();
        $('biasValue').textContent = `${bias > 0 ? '+' : ''}${bias.toFixed(1)}%`;
        $('pidCount').textContent = State.pid.completedCount;
    } else {
        $('pidBadge').classList.add('hidden');
    }
}

function renderReportStats() {
    const completed = State.tasks.filter(t => t.completed);
    const total = State.tasks.length;
    const rate = total > 0 ? (completed.length / total * 100).toFixed(0) : 0;

    $('reportStats').innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${total}</div>
            <div class="stat-label">总事务数</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${completed.length}</div>
            <div class="stat-label">已完成</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${rate}%</div>
            <div class="stat-label">完成率</div>
        </div>
    `;

    // Enable report button: local engine always works (template-based), cloud needs API key + consent
    if (State.engine === 'local') {
        $('generateReportBtn').disabled = completed.length === 0;
    } else {
        $('generateReportBtn').disabled = completed.length === 0 || !State.apiKey || !$('reportConsent').checked;
    }
}

function renderDataStats() {
    const completed = State.tasks.filter(t => t.completed);
    const localCount = State.tasks.filter(t => t.engine === 'local').length;
    const cloudCount = State.tasks.filter(t => t.engine === 'cloud').length;
    $('dataStats').innerHTML = `
        事务总数: <strong>${State.tasks.length}</strong><br>
        已完成: <strong>${completed.length}</strong><br>
        本地引擎生成: <strong>${localCount}</strong><br>
        云端引擎生成: <strong>${cloudCount}</strong><br>
        PID校准次数: <strong>${State.pid.completedCount}</strong><br>
        PID偏置积分: <strong>${State.pid.integral.toFixed(2)}</strong><br>
        当前引擎: <strong>${State.engine === 'local' ? '本地估算引擎' : '云端大模型'}</strong>
    `;
}

function renderAll() {
    sortTasks();
    renderTaskList();
    renderPIDBadge();
    renderReportStats();
    renderDataStats();
}

/* ===== Modal: Adjust Parameters ===== */
function openAdjustModal(task) {
    State.editingTask = task;
    $('modalTitle').textContent = '调整事务参数';
    $('modalBody').innerHTML = `
        <div class="slider-group">
            <label>影响时间 T<sub>impact</sub> <span id="sliderTi">${task.T_impact.toFixed(1)}h</span></label>
            <div class="slider-input-row">
                <input type="range" class="slider" id="rangeTi" min="0.5" max="500" step="0.5" value="${task.T_impact}">
                <input type="number" class="num-input" id="numTi" min="0.5" max="500" step="0.5" value="${task.T_impact.toFixed(1)}">
            </div>
        </div>
        <div class="slider-group">
            <label>执行耗时 T<sub>cost</sub> <span id="sliderTc">${task.T_cost.toFixed(1)}h</span></label>
            <div class="slider-input-row">
                <input type="range" class="slider" id="rangeTc" min="0.25" max="200" step="0.25" value="${task.T_cost}">
                <input type="number" class="num-input" id="numTc" min="0.25" max="200" step="0.25" value="${task.T_cost.toFixed(1)}">
            </div>
        </div>
        <div class="slider-group">
            <label>剩余时间 T<sub>remain</sub> <span id="sliderTr">${task.T_remain.toFixed(1)}h</span></label>
            <div class="slider-input-row">
                <input type="range" class="slider" id="rangeTr" min="0.5" max="1440" step="0.5" value="${task.T_remain}">
                <input type="number" class="num-input" id="numTr" min="0.5" max="1440" step="0.5" value="${task.T_remain.toFixed(1)}">
            </div>
        </div>
        <div style="background:var(--bg);padding:12px;border-radius:8px;font-size:13px;color:var(--text-secondary);margin-top:8px;">
            当前 TROI: <strong style="color:var(--primary)">${calcPriority(task).toFixed(2)}</strong>
        </div>
    `;
    $('taskModal').classList.remove('hidden');

    // Slider → number sync
    function syncFromSlider() {
        const ti = parseFloat($('rangeTi').value);
        const tc = parseFloat($('rangeTc').value);
        const tr = parseFloat($('rangeTr').value);
        $('numTi').value = ti.toFixed(1);
        $('numTc').value = tc.toFixed(1);
        $('numTr').value = tr.toFixed(1);
        $('sliderTi').textContent = `${ti.toFixed(1)}h`;
        $('sliderTc').textContent = `${tc.toFixed(1)}h`;
        $('sliderTr').textContent = `${tr.toFixed(1)}h`;
    }
    // Number → slider sync
    function syncFromNum() {
        let ti = parseFloat($('numTi').value);
        let tc = parseFloat($('numTc').value);
        let tr = parseFloat($('numTr').value);
        if (isNaN(ti)) ti = parseFloat($('rangeTi').value);
        if (isNaN(tc)) tc = parseFloat($('rangeTc').value);
        if (isNaN(tr)) tr = parseFloat($('rangeTr').value);
        ti = Math.max(0.5, Math.min(500, ti));
        tc = Math.max(0.25, Math.min(200, tc));
        tr = Math.max(0.5, Math.min(1440, tr));
        $('rangeTi').value = ti;
        $('rangeTc').value = tc;
        $('rangeTr').value = tr;
        $('sliderTi').textContent = `${ti.toFixed(1)}h`;
        $('sliderTc').textContent = `${tc.toFixed(1)}h`;
        $('sliderTr').textContent = `${tr.toFixed(1)}h`;
    }

    $('rangeTi').addEventListener('input', syncFromSlider);
    $('rangeTc').addEventListener('input', syncFromSlider);
    $('rangeTr').addEventListener('input', syncFromSlider);
    $('numTi').addEventListener('input', syncFromNum);
    $('numTc').addEventListener('input', syncFromNum);
    $('numTr').addEventListener('input', syncFromNum);
}

function saveAdjustModal() {
    const t = State.editingTask;
    if (!t) return;
    // Read from number inputs (more precise than slider)
    let ti = parseFloat($('numTi').value);
    let tc = parseFloat($('numTc').value);
    let tr = parseFloat($('numTr').value);
    // Fallback to slider if parse fails
    if (isNaN(ti)) ti = parseFloat($('rangeTi').value);
    if (isNaN(tc)) tc = parseFloat($('rangeTc').value);
    if (isNaN(tr)) tr = parseFloat($('rangeTr').value);
    t.T_impact = Math.max(0.5, ti);
    t.T_cost = Math.max(0.25, tc);
    t.T_remain = Math.max(0.5, tr);
    t.adjusted = true;
    saveState();
    renderAll();
    $('taskModal').classList.add('hidden');
    showToast('参数已更新');
}

/* ===== Modal: Complete Task ===== */
function openCompleteModal(task) {
    State.completingTask = task;
    $('completeTaskName').textContent = task.name;
    $('actualImpact').value = task.T_impact;
    $('actualCost').value = task.T_cost;
    $('completeModal').classList.remove('hidden');
}

function confirmComplete() {
    const t = State.completingTask;
    if (!t) return;
    const actualImpact = parseFloat($('actualImpact').value) || 0;
    const actualCost = parseFloat($('actualCost').value) || 0;
    recordCompletion(t, actualImpact, actualCost);
    renderAll();
    $('completeModal').classList.add('hidden');
    showToast(`已完成！PID偏置积分: ${State.pid.integral.toFixed(2)}`);
}

/* ===== Event Handlers ===== */
function bindEvents() {
    // Tab navigation
    $$('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            showView(tab.dataset.tab);
            if (tab.dataset.tab === 'report') renderReportStats();
            if (tab.dataset.tab === 'settings') renderDataStats();
        });
    });

    // Theme toggle
    $('themeToggle').addEventListener('click', () => {
        State.theme = State.theme === 'light' ? 'dark' : 'light';
        applyTheme();
        saveState();
    });

    // Engine switch from banner
    $('engineSwitchBtn').addEventListener('click', () => {
        $('engineSwitchModal').classList.remove('hidden');
    });

    // Engine choice in modal
    $$('.engine-choice').forEach(choice => {
        choice.addEventListener('click', () => {
            setEngine(choice.dataset.engine);
            $('engineSwitchModal').classList.add('hidden');
            renderAll();
        });
    });

    $('engineSwitchCancel').addEventListener('click', () => $('engineSwitchModal').classList.add('hidden'));

    // Engine selection in settings
    $('engineOptLocal').addEventListener('click', () => {
        setEngine('local');
        renderAll();
    });
    $('engineOptCloud').addEventListener('click', () => {
        setEngine('cloud');
        renderAll();
    });

    // Analyze button
    $('analyzeBtn').addEventListener('click', async () => {
        const input = $('taskInput').value.trim();
        if (!input) { showToast('请输入事务描述'); return; }
        if (State.engine === 'cloud' && !State.apiKey) {
            showToast('请先在设置中配置API Key');
            showView('settings');
            return;
        }

        $('analyzeBtn').disabled = true;
        $('loading').classList.remove('hidden');

        try {
            const newTasks = await analyzeTasks(input);
            State.tasks.push(...newTasks);
            saveState();
            renderAll();
            $('taskInput').value = '';
            const engineLabel = State.engine === 'local' ? '本地' : '云端';
            showToast(`已添加 ${newTasks.length} 个事务（${engineLabel}引擎）`);
        } catch (e) {
            showToast(`分析失败: ${e.message}`);
            console.error(e);
        } finally {
            $('analyzeBtn').disabled = false;
            $('loading').classList.add('hidden');
        }
    });

    // Task list actions
    $('taskList').addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        const id = target.dataset.id;
        const task = State.tasks.find(t => t.id === id);
        if (!task) return;

        switch (action) {
            case 'toggle':
                if (task.completed) {
                    task.completed = false;
                    task.completedAt = null;
                    if (task.actualImpact) {
                        State.pid.integral -= (task.T_impact - task.actualImpact);
                        State.pid.completedCount = Math.max(0, State.pid.completedCount - 1);
                    }
                    saveState();
                    renderAll();
                } else {
                    openCompleteModal(task);
                }
                break;
            case 'adjust':
                openAdjustModal(task);
                break;
            case 'reestimate':
                reestimateWithCloud(task);
                break;
            case 'complete':
                openCompleteModal(task);
                break;
            case 'uncomplete':
                task.completed = false;
                task.completedAt = null;
                if (task.actualImpact) {
                    State.pid.integral -= (task.T_impact - task.actualImpact);
                    State.pid.completedCount = Math.max(0, State.pid.completedCount - 1);
                }
                saveState();
                renderAll();
                break;
            case 'delete':
                State.tasks = State.tasks.filter(t => t.id !== id);
                saveState();
                renderAll();
                break;
        }
    });

    // Modal events
    $('modalClose').addEventListener('click', () => $('taskModal').classList.add('hidden'));
    $('modalCancel').addEventListener('click', () => $('taskModal').classList.add('hidden'));
    $('modalSave').addEventListener('click', saveAdjustModal);

    $('completeCancel').addEventListener('click', () => $('completeModal').classList.add('hidden'));
    $('completeConfirm').addEventListener('click', confirmComplete);

    // Action bar
    $('refreshBtn').addEventListener('click', () => {
        const now = Date.now();
        State.tasks.forEach(t => {
            if (!t.completed && t.predictedAt) {
                const elapsed = (now - new Date(t.predictedAt).getTime()) / 3600000;
                t.T_remain = Math.max(0.1, t.T_remain - elapsed);
            }
        });
        saveState();
        renderAll();
        showToast('已刷新排序（剩余时间已更新）');
    });

    $('clearBtn').addEventListener('click', () => {
        if (confirm('确定清空所有事务？此操作不可撤销。')) {
            State.tasks = [];
            saveState();
            renderAll();
            showToast('已清空');
        }
    });

    // Settings - API presets
    $$('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $('apiUrl').value = btn.dataset.url;
            $('modelName').value = btn.dataset.model;
            $$('.preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Settings save
    $('saveSettingsBtn').addEventListener('click', () => {
        State.apiKey = $('apiKey').value.trim();
        State.apiUrl = $('apiUrl').value.trim() || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
        State.modelName = $('modelName').value.trim() || 'glm-4-flash';
        saveState();
        $('saveStatus').classList.remove('hidden');
        setTimeout(() => $('saveStatus').classList.add('hidden'), 2000);
        showToast('配置已保存');
    });

    $('savePidBtn').addEventListener('click', () => {
        State.pid.Kp = parseFloat($('kpInput').value) || 0.5;
        State.pid.Ki = parseFloat($('kiInput').value) || 0.15;
        State.alpha = parseFloat($('alphaInput').value) || 0;
        State.beta = parseFloat($('betaInput').value) || 1;
        saveState();
        renderAll();
        showToast('校准参数已保存');
    });

    // Report consent
    $('reportConsent').addEventListener('change', (e) => {
        if (State.engine === 'cloud') {
            $('generateReportBtn').disabled = !e.target.checked || State.tasks.filter(t => t.completed).length === 0;
        }
    });

    // Generate report
    $('generateReportBtn').addEventListener('click', async () => {
        if (State.engine === 'cloud' && !State.apiKey) {
            showToast('请先配置API Key');
            showView('settings');
            return;
        }

        $('generateReportBtn').disabled = true;
        $('generateReportBtn').textContent = '生成中...';

        try {
            const report = await generateReport();
            const html = markdownToHtml(report);
            $('reportOutput').innerHTML = html;
            $('reportOutput').classList.remove('hidden');
        } catch (e) {
            showToast(`报告生成失败: ${e.message}`);
        } finally {
            $('generateReportBtn').disabled = false;
            $('generateReportBtn').textContent = '生成报告';
        }
    });

    // Data management
    $('exportBtn').addEventListener('click', () => {
        const data = JSON.stringify({
            version: 2,
            engine: State.engine,
            tasks: State.tasks,
            pid: State.pid,
            alpha: State.alpha,
            beta: State.beta,
            exportDate: new Date().toISOString(),
        }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ctit_data_v2_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('数据已导出');
    });

    $('resetBtn').addEventListener('click', () => {
        if (confirm('确定重置所有数据？包括事务、PID状态和配置，此操作不可撤销。')) {
            localStorage.removeItem('ctit_state');
            location.reload();
        }
    });
}

/* ===== Utility Functions ===== */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 3600000;
    if (diff < 1) return '刚刚';
    if (diff < 24) return `${diff.toFixed(0)}h前`;
    return `${d.getMonth()+1}/${d.getDate()}`;
}

function formatRemain(hours) {
    if (hours < 1) return `${(hours * 60).toFixed(0)}min`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}天`;
}

function markdownToHtml(md) {
    let html = md
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^# (.+)$/gm, '<h3>$1</h3>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^\| (.+)$/gm, (match) => {
            // Table row
            const cells = match.split('|').filter(c => c.trim() && !c.includes('---'));
            if (cells.length === 0) return ''; // separator row
            return '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
        })
        .replace(/(<tr>.*?<\/tr>\n?)+/g, '<table>$&</table>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.+<\/li>\n?)+/g, '<ul>$&</ul>')
        .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
        .replace(/^([^<\n].+)$/gm, '<p>$1</p>')
        .replace(/\n/g, '');
    return html;
}

/* ===== Initialize App ===== */
function init() {
    loadState();
    applyTheme();
    applyEngine();

    // Populate settings inputs
    $('apiKey').value = State.apiKey || '';
    $('apiUrl').value = State.apiUrl || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
    $('modelName').value = State.modelName || 'glm-4-flash';
    $('kpInput').value = State.pid.Kp || 0.5;
    $('kiInput').value = State.pid.Ki || 0.15;
    $('alphaInput').value = State.alpha || 0;
    $('betaInput').value = State.beta || 1;

    bindEvents();
    renderAll();

    // First-time user: default to local engine, no API key prompt
    if (!State.apiKey && State.engine === 'local') {
        // No need to prompt for API key — local engine works out of the box
    } else if (State.engine === 'cloud' && !State.apiKey) {
        showView('settings');
        showToast('请配置API Key或切换到本地引擎');
    }
}

// Start
document.addEventListener('DOMContentLoaded', init);
