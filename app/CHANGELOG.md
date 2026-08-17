# CTIT App 版本变更记录 (CHANGELOG)

> **目的**：防止跨会话更新时的上下文腐败。每次更新后保留种子文件+变更记录，下次更新前先读本文件。
> **种子目录**：
> - `download/ctit_v2_seed/` — v2.0 原始版本（不可修改）
> - `download/ctit_v2_seed_v2.1/` — v2.1 版本（修复中文数字解析+参数输入框）
> - `download/ctit_v2/CHANGELOG.md` — 本文件，记录所有版本变更

---

## v2.0 (2026-07-25) — 种子版本

**文件清单**（种子目录 `ctit_v2_seed/`）：
- `index.html` (323行) — PWA 入口
- `app.js` (1231行) — 主逻辑（含本地引擎+云端LLM+排序+UI）
- `styles.css` (937行) — 样式
- `sw.js` — Service Worker

**核心功能**：
- 本地 NLP 估算引擎（离线可用）
- 云端 LLM 可选模式（DeepSeek V4 flash）
- TROI 排序公式 P = T_impact / T_remain
- PI 偏置校准
- 自然语言任务录入
- 复盘报告生成
- 暗色主题
- localStorage 数据持久化（v1→v2 自动迁移）

**已知限制（v2.0）**：
1. 截止日期解析器不支持中文数字（"三天内"→30天 default）
2. 参数编辑只能拖滑块，无法手动输入精确数值
3. 分类器基于关键词匹配，复杂描述可能误分类
4. T_impact 有随机波动
5. 非常规日期格式不支持

---

## v2.1 (2026-08-11) — 修复截止日期解析 + 参数手动输入

### 修复 1：parseDeadline 重写（app.js L184-380）

**根因**：原 `parseDeadline` 中 `\d+` 只匹配阿拉伯数字，中文数字（一、二、三、...、十）全部漏匹配，fallback 到 720h（30天）。

**修复内容**：
1. 新增 `cn2num()` 函数：中文数字→阿拉伯数字转换
   - 单字：零〇一二两三四五六七八九十 → 0-10
   - 十X：十二→12, 十五→15
   - X十：二十→20, 三十→30
   - X十Y：二十三→23
2. 新增 `extractNum()` 函数：统一提取数字，先尝试阿拉伯数字，回退中文数字
3. 重写 `parseDeadline` 新增以下模式：

| 模式 | 示例 | T_remain |
|------|------|----------|
| 半小时 | 半小时 | 0.5h |
| 半天 | 半天 | 12h |
| 大后天 | 大后天 | 72h+ |
| 大大后天 | 大大后天 | 96h+ |
| X天(后/内/以内) | 三天内, 5天后 | X×24h |
| X小时(后/内) | 三小时后, 2小时 | X h |
| X分钟(后/内) | 三十分钟, 15分钟 | X/60 h |
| X周(后/内) | 一周, 两周 | X×168 h |
| XY天(范围) | 两三天, 一两天 | max(X,Y)×24h |
| X~Y天(分隔) | 两~三天 | max(X,Y)×24h |

4. 修复"半天"吞掉"半小时"的 bug（半天检查移到半小时之后）
5. "X天内/X天后"不再加 hoursLeftToday（精确为 X×24h）

**测试结果**：28 个测试用例全部通过

### 修复 2：参数编辑 UI 增加数字输入框（app.js L952-1028）

**根因**：`openAdjustModal` 中参数编辑只有 `<input type="range">` 滑块，无法手动输入精确数值。

**修复内容**：
1. 每个参数（T_impact, T_cost, T_remain）滑块旁增加 `<input type="number">` 数字输入框
2. 滑块↔数字输入框双向同步：
   - 拖动滑块 → 数字框实时更新
   - 输入数字 → 滑块位置实时更新
3. 数字输入框 blur 时自动 clamp 到合法范围
4. `saveAdjustModal` 优先读取数字输入框的值（更精确）
5. CSS 新增 `.slider-input-row` flex 布局（styles.css L578-611）

### 文件变更清单

| 文件 | 变更行数 | 变更内容 |
|------|----------|----------|
| `app.js` | L184-380 (重写) | parseDeadline + cn2num + extractNum |
| `app.js` | L952-1028 (重写) | openAdjustModal + saveAdjustModal |
| `styles.css` | L578-611 (新增) | .slider-input-row + .num-input 样式 |
| `index.html` | 无变更 | — |
| `sw.js` | 无变更 | — |

---

## 下次更新注意事项

1. **先读本 CHANGELOG**，确认上次改了什么、改了哪些函数
2. **种子目录不可修改**，是回滚基准
3. **更新前先创建新种子**：`cp -r download/ctit_v2 download/ctit_v2_seed_v2.X`
4. **更新后在本文件追加新版本记录**，包括：变更函数名、根因分析、测试结果
5. **用函数名定位**，不要硬编码行号（行号会因编辑而偏移）

---

## v2.2 (2026-08-11) — 修复参数输入 + 清洗事务名称 + 本地估算提示 + 大模型精估按钮

### 修复 1：参数编辑数字输入框重写（openAdjustModal 函数）

**根因**：v2.1 的数字输入框使用 `update(source)` 统一函数处理双向同步，在移动端可能因 `input` 事件触发时序问题导致输入失效。

**修复内容**：
- 拆分为两个独立函数：`syncFromSlider()`（滑块→数字框）和 `syncFromNum()`（数字框→滑块）
- `syncFromNum` 内置 NaN 检查和范围 clamp，不会因输入中间状态（如空字符串）崩溃
- `saveAdjustModal` 优先读数字框，NaN 时 fallback 到滑块
- 移除了 `blur` 事件处理器（不再需要在 blur 时强制格式化，`syncFromNum` 已处理）

### 修复 2：事务名称清洗（新增 cleanTaskName 方法）

**根因**：`LocalEngine.analyze` 直接用用户原文作为 task.name，导致"复习期末考试三天内"中的"三天内"被保留在名称中。

**修复内容**：
- 新增 `cleanTaskName(desc)` 方法，剥离所有时间表达：
  - 中文数字天数：三天内/五天后/两天/十天后等
  - 阿拉伯数字天数：3天/7天内等
  - 范围天数：两三天/一两天/三四天等
  - 小时/分钟/周：三小时后/半小时/三十分钟/一周等
  - 星期：周X/星期X/本周X/下周X/本周末等
  - 日期：X号/X日/X月X日/月底等
  - 紧急标记：紧急/马上/立刻/尽快等
  - 相对日期：今天/明天/后天/大后天等
- 清洗后若名称为空，fallback 到原文（去括号后）
- 名称截断为 15 字以内
- 12 个测试用例全部通过

### 修复 3：本地估算 reasoning 附加提示

**根因**：本地引擎 T_impact 基于类别基准范围的随机值，通常低于大模型估算值（LLM 会考虑连锁效应和长期价值）。

**修复内容**：
- `genReasoning` 末尾附加 `本地估算·建议低优事项使用`
- 提示用户本地估算适合优先级较低的事务，高优事务建议使用云端精估

### 修复 4：大模型重估按钮（新增 reestimateWithCloud 函数 + UI 按钮）

**功能**：对已通过本地引擎估算的任务，可点击"☁️ 精估"按钮用大模型重新估算。

**实现细节**：
- 任务对象新增 `rawInput` 字段，保存用户原始输入文本
- 任务卡片中 `task.engine === 'local'` 时显示"☁️ 精估"按钮
- 点击后调用 `reestimateWithCloud(task)`：
  1. 读取 `task.rawInput`（fallback 到 description/name）
  2. 发送到 LLM（使用同一 ANALYZE_PROMPT）
  3. 解析返回的 JSON
  4. 覆盖 task 的 T_impact/T_cost/T_remain/reasoning
  5. 更新 engine 标记为 'cloud'（📱→☁️）
  6. 保存状态并重新渲染
- CSS 新增 `.task-btn-cloud` 样式（淡紫色底+紫色文字）
- 若未配置 API Key，提示用户去设置页

### 文件变更清单

| 文件 | 变更函数/区域 | 变更内容 |
|------|--------------|----------|
| `app.js` | `LocalEngine.cleanTaskName` (新增) | 剥离时间表达，生成简洁事务名称 |
| `app.js` | `LocalEngine.genReasoning` (修改) | 末尾附加"本地估算·建议低优事项使用" |
| `app.js` | `LocalEngine.analyze` (修改) | 调用 cleanTaskName + 保存 rawInput |
| `app.js` | `reestimateWithCloud` (新增) | 大模型重估功能 |
| `app.js` | `openAdjustModal` (重写) | 拆分同步逻辑，修复移动端输入 |
| `app.js` | `saveAdjustModal` (修改) | NaN 检查 + fallback |
| `app.js` | `renderTaskList` (修改) | 本地任务卡片增加"☁️ 精估"按钮 |
| `app.js` | 事件委托 (修改) | 增加 `case: 'reestimate'` |
| `styles.css` | `.task-btn-cloud` (新增) | 精估按钮样式 |
| `sw.js` | `CACHE_NAME` (修改) | `ctit-v2.1` → `ctit-v2.2` |
| `index.html` | 无变更 | — |

### APK 构建

- `CTIT_v2.2.apk` (5.5MB) 已构建成功 (2026-08-11 19:07)
- 构建环境: JDK 17, Cordova 13, Gradle 8.7, Android SDK build-tools 34.0.0
- ANDROID_HOME: `/home/z/android-sdk`（非 `/home/z/Android/Sdk`）

---

## 下次更新注意事项

1. **先读本 CHANGELOG**，确认上次改了什么、改了哪些行
2. **种子目录 `ctit_v2_seed/` 不可修改**，是回滚基准
3. **更新前先创建新种子**：`cp -r download/ctit_v2 download/ctit_v2_seed_v2.1`
4. **更新后在本文件追加新版本记录**，包括：变更行号、根因分析、测试结果
5. **行号会因编辑而偏移**，用函数名+关键注释定位，不要硬编码行号
