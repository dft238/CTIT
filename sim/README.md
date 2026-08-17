# CTIT 论文仿真代码

论文两个核心实验的可复现代码。运行后输出 CSV/JSON 到 `results/`，图表到 `figures/`。

## 文件清单

| 文件 | 说明 |
|------|------|
| `exp1_troi_ranking.py` | 实验一：T-ROI 排序的决策质量验证 |
| `exp2_pid_calibration.py` | 实验二：PI 控制器的偏置消除验证 |
| `generate_figures.py` | 论文图表生成脚本（结果缺失时自动先跑实验） |
| `results/` | 仿真输出数据（CSV + JSON），已附带一份可复现结果 |
| `figures/` | 论文图表 PNG（图 1 / 图 2） |

## 快速开始

```bash
pip install numpy scipy pandas matplotlib   # Python 3.10+

python3 exp1_troi_ranking.py     # 实验一（约 2-3 分钟）
python3 exp2_pid_calibration.py  # 实验二（约 1 分钟）
python3 generate_figures.py      # 生成图表（若 results/ 为空会自动先跑实验）
```

## 实验参数

### 实验一（论文第 7.2.5 节）

| 参数 | 值 | 说明 |
|------|-----|------|
| N_TASKS | 1000 | 每次仿真任务数 |
| N_REPS | 1000 | 蒙特卡洛重复次数 |
| T_BUDGET | 40.0 | 时间预算（小时） |
| SIGMA_EPSILON | 0.5 | 主观预估噪声标准差 |
| SEED | 42 | 主实验随机种子 |

任务参数分布：T_cost ~ Lognormal(μ=0, σ=0.8)，T_impact_true ~ Lognormal(μ=2.3, σ=2.0)，T_remain ~ Uniform(0.5, 720)。

### 实验二（论文第 8.2 节）

| 参数 | 值 | 说明 |
|------|-----|------|
| N_TRIALS | 200 | 每次仿真试验次数 |
| N_REPS | 200 | 蒙特卡洛重复次数 |
| T_IMPACT_TRUE | 20.0 | 真实影响时间（小时） |
| BIAS | 0.30 | +30% 乐观偏置 |
| SIGMA_NOISE | 0.30 | 预估随机噪声标准差 |
| SIGMA_OBS | 0.15 | 观测噪声标准差 |
| KP | 0.5 | 比例增益 |
| KI | 0.15 | 积分增益 |

## 关键结论（与论文一致）

- **实验一**：TROI 排序平均总影响时间 31,514h，比四象限高 **51.7%**（d=0.946，p=5.25×10⁻¹⁴¹），比随机高 1316.8%。
- **实验二**：PI 控制器偏置消除率 **100.1%**；P-only 仅 34.3%（残留稳态误差，符合控制论 `P-only 稳态误差 = b/(1+Kp)`）；无校准 0.3%。

## 修改建议

1. 在 `exp1_troi_ranking.py` / `exp2_pid_calibration.py` 顶部修改全局参数；
2. 重新运行对应脚本；
3. 运行 `python3 generate_figures.py` 重新生成图表。

> 若更换随机种子或参数，论文中的数字需同步更新。
