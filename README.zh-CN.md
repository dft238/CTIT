# CTIT — 可计算时间投资理论

**Computable Time Investment Theory**：用三个可计算的时间参数，替代「重要 / 紧急」的模糊直觉，把时间管理变成一道可量化、可校准的排序问题。

> 核心公式：`优先级 P = T_impact / T_remain`，并用 PI 控制器自动校准主观高估 / 低估。

> **▶ [在线演示](https://ctit.dengfengting238.workers.dev/)** — 浏览器直接体验，无需安装。

🌐 [English](README.md)

---

## 理论核心

| 参数 | 含义 |
|------|------|
| **T_impact** | 影响时间（h）：完成该事务能带来的总影响时间（含连锁效应、长期价值） |
| **T_cost** | 执行耗时（h）：完成该事务实际要投入的时间 |
| **T_remain** | 剩余时间（h）：距最佳执行窗口关闭还剩多久 |

**TROI = T_impact / T_remain**（时间投资回报率），值越大越应优先处理。

**PI 偏置校准**：人天然会高估 / 低估事务价值。用 PI 控制器的积分项（`Σ误差 × K_i`）自动修正 T_impact 的系统性偏置，实现「越用越准」。

## 核心结果（蒙特卡洛仿真，N=1000 次重复）

### 实验一 · TROI 排序显著优于随机与四象限

| 排序方法 | 平均总影响时间 | 相对提升 |
|---------|--------------|---------|
| 随机排序 | 2,224 h | — |
| 四象限分类 | 20,774 h | +834%（vs 随机） |
| **TROI 排序** | **31,514 h** | **+51.7%（vs 四象限）** d=0.946, p=5.25×10⁻¹⁴¹ |

### 实验二 · PI 控制器消除偏置，P-only 残留稳态误差

| 校准方式 | 稳态偏置 | 偏置消除率 |
|---------|---------|-----------|
| 无校准 | ≈ +6.0 h | 0.3% |
| P-only（仅比例） | ≈ +3.9 h | 34.3%（残留稳态误差） |
| **PI（比例+积分）** | **≈ -0.005 h** | **100.1%**（vs P-only：d=5.79, p=3.3×10⁻¹⁵⁵） |

> 完整原始数据见 [`sim/results/`](sim/results/)，复现脚本见 [`sim/`](sim/)。

## 仓库结构

```
.
├── sim/      # 论文仿真代码 + 结果数据 + 图表
├── app/      # CTIT App（PWA）完整源码
├── engine/   # 独立本地 NLP 估算引擎（从 app.js 抽取，可复用）
└── docs/     # 理论摘要、实验数据、论文状态
```

## 快速开始

### 1. 仿真（Python 3.10+）

```bash
cd sim
pip install numpy scipy pandas matplotlib
python3 exp1_troi_ranking.py     # 实验一：TROI 排序验证
python3 exp2_pid_calibration.py  # 实验二：PI 校准验证
python3 generate_figures.py      # 生成论文图表（figures/）
```

### 2. 本地估算引擎（Node.js，零依赖、零网络）

```js
const { createCTITEngine } = require('./engine/ctit-engine.js');
const ctit = createCTITEngine();
const tasks = ctit.analyze('写论文\n复习期末考试三天内');
console.log(tasks); // 每个事务含 T_impact / T_cost / T_remain / reasoning
```

```bash
node engine/test.js   # 20 项冒烟测试
```

### 3. App（PWA）

直接用浏览器打开 `app/index.html`，或作为静态站点部署。

- **本地引擎**：完全离线，无需任何配置。
- **云端精估**（可选）：在设置中填入自己的 API Key（智谱 GLM / DeepSeek）。

## 论文状态

- 本仓库开源**代码与仿真数据**。代码开源不影响论文发表，反而增强可复现性（加分项）。
- 论文**全文尚未公开发布**，此处仅提供摘要（见 [`docs/`](docs/)）。
- 论文正式发表后，将补充全文与标准引用格式。

## 许可证

- 代码、引擎、仿真脚本：**MIT License**（见 [`LICENSE`](LICENSE)）。
- 论文文字与图表：另行保留版权，发表前请勿转载全文。

## 作者

王风庆（等风停）

---

*CTIT = Computable Time Investment Theory（可计算时间投资理论）*
