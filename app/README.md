# CTIT App（PWA）

CTIT 时间投资计算器：输入自然语言任务，自动估算 T_impact / T_cost / T_remain，按 TROI 排序优先级，并用 PI 控制器随时间校准。

## 文件清单

| 文件 | 说明 |
|------|------|
| `index.html` | PWA 入口（单页） |
| `app.js` | 主逻辑：本地引擎 + 云端 LLM + 排序 + PI 校准 + UI |
| `styles.css` | 样式（含暗色主题） |
| `manifest.json` | PWA 清单 |
| `sw.js` | Service Worker（离线缓存） |
| `CHANGELOG.md` | 版本变更记录（v2.0 → v2.2） |

## 运行

直接用浏览器打开 `index.html`，或作为静态站点部署（无需构建）。

## 双引擎模式

| 引擎 | 说明 | 依赖 |
|------|------|------|
| 📱 本地引擎 | 离线关键词 + 规则解析，见 `../engine/ctit-engine.js` | 无 |
| ☁️ 云端精估 | 调用大模型重估，推理更准 | 需自备 API Key |

> 云端默认支持智谱 GLM、DeepSeek（在设置页选择预设或自定义接口）。**API Key 仅保存在浏览器 localStorage，不会上传或写入代码。**

## 版本

当前 v2.2（详见 `CHANGELOG.md`）：
- 中文数字截止日期解析（三天内 → 72h）
- 事务名称清洗（剥离时间表达）
- 参数数字输入框（移动端修复）
- 大模型「☁️ 精估」按钮

## 已知限制

1. 分类器基于关键词匹配，复杂描述可能误分类；
2. 本地 T_impact 含随机波动（范围估算）；
3. 非常规日期格式不支持。

> Android 打包产物（APK）未纳入源码仓库，可通过 Cordova 自行构建（见 CHANGELOG）。
