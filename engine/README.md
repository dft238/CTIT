# CTIT 本地估算引擎（独立模块）

从 `app/app.js`（v2.2）抽取的本地 NLP 估算引擎，**零依赖、零网络**，Node.js 与浏览器均可直接运行。

## 功能

对自然语言任务描述做离线解析，输出 CTIT 三参数：

- `T_impact` 影响时间（h）
- `T_cost` 执行耗时（h）
- `T_remain` 剩余时间（h）

并计算 `TROI = T_impact / T_remain` 优先级，附带 PI 偏置校准。

## 快速开始

```js
const { createCTITEngine } = require('./ctit-engine.js');
const ctit = createCTITEngine();

const tasks = ctit.analyze('写论文\n复习期末考试三天内');
// => [
//   { name: '写论文', T_impact: ..., T_cost: ..., T_remain: 720, reasoning: '学术研究·时间充裕·本地估算...' },
//   { name: '复习期末考试', T_impact: ..., T_cost: ..., T_remain: 72, reasoning: '考试学习·本周需完成·...' },
// ]
```

浏览器直接引入：

```html
<script src="ctit-engine.js"></script>
<script>
  const ctit = window.CTITEngine;   // 或 window.createCTITEngine()
  ctit.analyze('写论文');
</script>
```

## API

### 主入口

| 方法 | 说明 |
|------|------|
| `analyze(text)` | 逐行解析任务描述，返回任务对象数组 |
| `generateReport(tasks)` | 生成 Markdown 复盘报告 |

### 解析函数（可单独调用）

| 方法 | 说明 | 示例 |
|------|------|------|
| `parseDeadline(text)` | 截止日期 → T_remain（h） | `'三天内'` → 72 |
| `classifyTask(text)` | 关键词分类 | `'写论文'` → 学术研究 |
| `parseImportance(text)` | 重要性乘数 | `'重要'` → ×1.5 |
| `parseUrgency(text)` | 紧急性乘数 | `'紧急'` → ×0.15 |
| `parseDuration(text)` | 显式时长提取 | `'2小时'` → 2 |
| `cleanTaskName(desc)` | 剥离时间表达生成名称 | `'复习期末考试三天内'` → `'复习期末考试'` |
| `cn2num(str)` | 中文数字转数值 | `'二十三'` → 23 |

### 排序 / 优先级

| 方法 | 说明 |
|------|------|
| `calcTROI(task)` | TROI = T_impact / T_remain |
| `calcComposite(task)` | 复合指标（α/β 权重） |
| `calcPriority(task)` | α>0 用复合，否则用 TROI |
| `getPriorityLevel(troi)` | → P1/P2/P3/P4 |

### PID 校准

| 方法 | 说明 |
|------|------|
| `applyPIDCorrection(T_impact)` | 用当前偏置修正预估 |
| `recordCompletion(task, actualImpact, actualCost)` | 记录实际值，更新积分 |
| `getBiasPercent()` | 当前偏置百分比 |

### 工厂参数

```js
const ctit = createCTITEngine({
  pid: { integral: 0, lastError: 0, Kp: 0.5, Ki: 0.15, completedCount: 0 },
  alpha: 0.0,   // 复合指标权重（0 = 只用 TROI）
  beta: 1.0,
});
```

## 测试

```bash
node test.js   # 20 项冒烟测试
```

## 说明

- 本模块只做**本地估算**；云端（LLM）能力在 `app/app.js` 的 `callLLM`，需自备 API Key。
- 本地 T_impact 基于类别基准范围随机取值，适合低优事项；高优事项建议云端精估。
