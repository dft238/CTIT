#!/usr/bin/env python3
"""
CTIT 实验一：T-ROI 排序的决策质量验证
======================================
比较三种任务排序方法在时间预算约束下的总真实影响时间：
  1. 随机排序（baseline）
  2. 四象限分类法（中位数分割 + 同象限内 T-ROI 排序）
  3. T-ROI 排序（CTIT 基础模型）

输出：控制台报告 + CSV 数据文件（供论文表格使用）
"""

import numpy as np
import pandas as pd
from scipy import stats
import os
import json

# ============================================================
# 全局参数（与论文第 7.2.5 节一致）
# ============================================================
N_TASKS       = 1000    # 每次仿真的任务数
N_REPS        = 1000    # 蒙特卡洛重复次数
T_BUDGET      = 40.0    # 时间预算（小时）
SIGMA_EPSILON = 0.5     # 主观预估噪声的标准差
SEED          = 42      # 主实验随机种子

# 任务参数分布（论文 7.2.1 节）
T_COST_DIST    = {"dist": "lognormal", "mu": 0.0, "sigma": 0.8}
T_IMPACT_DIST  = {"dist": "lognormal", "mu": 2.3, "sigma": 2.0}
T_REMAIN_DIST  = {"dist": "uniform",   "low": 0.5, "high": 720.0}

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ============================================================
# 任务生成
# ============================================================
def generate_tasks(n=N_TASKS, seed=SEED):
    """生成一组任务，返回真实参数和预估参数。"""
    rng = np.random.default_rng(seed)

    # 真实值
    t_cost_true   = rng.lognormal(mean=T_COST_DIST["mu"], sigma=T_COST_DIST["sigma"], size=n)
    t_impact_true = rng.lognormal(mean=T_IMPACT_DIST["mu"], sigma=T_IMPACT_DIST["sigma"], size=n)
    t_remain      = rng.uniform(low=T_REMAIN_DIST["low"], high=T_REMAIN_DIST["high"], size=n)

    # 主观预估（加入噪声）
    epsilon = rng.normal(0, SIGMA_EPSILON, size=n)
    t_impact_pred = t_impact_true * (1 + epsilon)

    return {
        "t_cost_true": t_cost_true,
        "t_impact_true": t_impact_true,
        "t_remain": t_remain,
        "t_impact_pred": t_impact_pred,
    }


# ============================================================
# 排序方法
# ============================================================
def random_select(tasks, budget=T_BUDGET):
    """随机排序，贪心选择直到预算耗尽。"""
    n = len(tasks["t_cost_true"])
    order = np.random.permutation(n)
    return greedy_select(tasks, order, budget)


def troi_select(tasks, budget=T_BUDGET):
    """T-ROI 排序：按 T_impact_pred / T_remain 降序，贪心选择。"""
    troi = tasks["t_impact_pred"] / tasks["t_remain"]
    order = np.argsort(-troi)  # 降序
    return greedy_select(tasks, order, budget)


def quadrant_select(tasks, budget=T_BUDGET):
    """
    四象限分类法（算法化实现）：
      - 以中位数分割重要性和紧急性
      - 象限优先级：Q1 > Q2 > Q3 > Q4
      - 同象限内按 T-ROI 降序排列
    """
    n = len(tasks["t_impact_pred"])
    t_impact_pred = tasks["t_impact_pred"]
    t_remain = tasks["t_remain"]

    med_impact = np.median(t_impact_pred)
    med_remain = np.median(t_remain)

    high_impact = t_impact_pred > med_impact
    high_urgent = t_remain < med_remain

    # 象限编号：Q1=0, Q2=1, Q3=2, Q4=3
    quadrant = np.where(
        high_impact & high_urgent, 0,
        np.where(high_impact & ~high_urgent, 1,
                 np.where(~high_impact & high_urgent, 2, 3))
    )

    # 同象限内按 T-ROI 降序
    troi = t_impact_pred / t_remain
    # 用 (quadrant, -troi) 作为排序键
    sort_key = list(zip(quadrant, -troi))
    order = sorted(range(n), key=lambda i: sort_key[i])
    return greedy_select(tasks, np.array(order), budget)


def greedy_select(tasks, order, budget):
    """贪心选择：按给定顺序依次纳入任务，直到预算耗尽。"""
    total_cost = 0.0
    total_impact_true = 0.0
    selected_count = 0

    for i in order:
        cost = tasks["t_cost_true"][i]
        if total_cost + cost <= budget:
            total_cost += cost
            total_impact_true += tasks["t_impact_true"][i]
            selected_count += 1
        # 注意：不 break，因为后续可能有更小的任务能塞进来
        # 但为了与论文一致，这里用严格贪心（不回溯）
        # 如果想严格背包，可改用 DP

    return {
        "total_impact_true": total_impact_true,
        "total_cost": total_cost,
        "selected_count": selected_count,
    }


# ============================================================
# 主实验
# ============================================================
def run_main_experiment():
    """运行主实验，返回三种方法的结果统计。"""
    print("=" * 70)
    print("实验一：T-ROI 排序的决策质量验证")
    print("=" * 70)
    print(f"参数: N={N_TASKS}, T_budget={T_BUDGET}h, σ_ε={SIGMA_EPSILON}, 重复={N_REPS}")
    print()

    results = {"random": [], "quadrant": [], "troi": []}
    selected_counts = {"random": [], "quadrant": [], "troi": []}

    for rep in range(N_REPS):
        tasks = generate_tasks(n=N_TASKS, seed=SEED + rep)

        r_rand = random_select(tasks)
        r_quad = quadrant_select(tasks)
        r_troi = troi_select(tasks)

        results["random"].append(r_rand["total_impact_true"])
        results["quadrant"].append(r_quad["total_impact_true"])
        results["troi"].append(r_troi["total_impact_true"])

        selected_counts["random"].append(r_rand["selected_count"])
        selected_counts["quadrant"].append(r_quad["selected_count"])
        selected_counts["troi"].append(r_troi["selected_count"])

    # 统计
    print("-" * 70)
    print(f"{'方法':<12} {'平均 ΣT_impact (h)':>20} {'SD':>12} {'平均选中数':>12}")
    print("-" * 70)

    stats_summary = {}
    for method in ["random", "quadrant", "troi"]:
        arr = np.array(results[method])
        cnt = np.array(selected_counts[method])
        mean_val = np.mean(arr)
        sd_val = np.std(arr, ddof=1)
        mean_cnt = np.mean(cnt)
        stats_summary[method] = {
            "mean": mean_val,
            "sd": sd_val,
            "mean_count": mean_cnt,
        }
        print(f"{method:<12} {mean_val:>20.0f} {sd_val:>12.0f} {mean_cnt:>12.1f}")

    # 配对 t 检验
    print()
    print("-" * 70)
    print("配对 t 检验（vs T-ROI）")
    print("-" * 70)

    troi_arr = np.array(results["troi"])
    for method in ["random", "quadrant"]:
        other_arr = np.array(results[method])
        diff = troi_arr - other_arr
        t_stat, p_val = stats.ttest_rel(troi_arr, other_arr)
        cohen_d = np.mean(diff) / np.std(diff, ddof=1)

        # 提升百分比
        improvement = (np.mean(troi_arr) - np.mean(other_arr)) / np.mean(other_arr) * 100

        stats_summary[method]["t_stat"] = float(t_stat)
        stats_summary[method]["p_value"] = float(p_val)
        stats_summary[method]["cohen_d"] = float(cohen_d)
        stats_summary[method]["improvement_pct"] = float(improvement)

        print(f"{method:>10} vs troi:")
        print(f"  t = {t_stat:.2f}, p = {p_val:.3e}, Cohen's d = {cohen_d:.3f}")
        print(f"  T-ROI 提升: {improvement:.1f}%")
        print()

    # 验证 p 值的统计必然性
    print("-" * 70)
    print("p 值验证（t = d × √N）")
    print("-" * 70)
    for method in ["random", "quadrant"]:
        d = stats_summary[method]["cohen_d"]
        t_predicted = d * np.sqrt(N_REPS)
        t_actual = stats_summary[method]["t_stat"]
        print(f"  {method}: d={d:.3f}, √N={np.sqrt(N_REPS):.2f}, "
              f"t_predicted={t_predicted:.2f}, t_actual={t_actual:.2f}")

    # 保存原始数据
    df = pd.DataFrame(results)
    df.to_csv(f"{OUTPUT_DIR}/exp1_main_results.csv", index=False)
    print(f"\n原始数据已保存: {OUTPUT_DIR}/exp1_main_results.csv")

    # 保存统计摘要
    with open(f"{OUTPUT_DIR}/exp1_stats.json", "w", encoding="utf-8") as f:
        json.dump(stats_summary, f, indent=2, ensure_ascii=False)
    print(f"统计摘要已保存: {OUTPUT_DIR}/exp1_stats.json")

    return results, stats_summary


# ============================================================
# 敏感性分析
# ============================================================
def run_sensitivity_analysis():
    """三维敏感性分析：噪声、预算、任务数量。"""
    print("\n" + "=" * 70)
    print("敏感性分析")
    print("=" * 70)

    # 1. 噪声维度
    print("\n--- 噪声维度 (σ_ε ∈ {0.2, 0.5, 0.8}) ---")
    global SIGMA_EPSILON
    original_sigma = SIGMA_EPSILON

    noise_results = []
    for sigma in [0.2, 0.5, 0.8]:
        SIGMA_EPSILON = sigma
        troi_impacts = []
        quad_impacts = []
        for rep in range(200):  # 敏感性分析用 200 次
            tasks = generate_tasks(n=N_TASKS, seed=SEED + rep)
            troi_impacts.append(troi_select(tasks)["total_impact_true"])
            quad_impacts.append(quadrant_select(tasks)["total_impact_true"])

        improvement = (np.mean(troi_impacts) - np.mean(quad_impacts)) / np.mean(quad_impacts) * 100
        noise_results.append({
            "sigma": sigma,
            "troi_mean": np.mean(troi_impacts),
            "quad_mean": np.mean(quad_impacts),
            "improvement_pct": improvement,
        })
        print(f"  σ_ε={sigma}: T-ROI={np.mean(troi_impacts):.0f}h, "
              f"四象限={np.mean(quad_impacts):.0f}h, 提升={improvement:.1f}%")

    SIGMA_EPSILON = original_sigma

    # 2. 预算维度
    print("\n--- 预算维度 (T_budget ∈ {20, 40, 80} h) ---")
    budget_results = []
    for budget in [20, 40, 80]:
        troi_impacts = []
        quad_impacts = []
        for rep in range(200):
            tasks = generate_tasks(n=N_TASKS, seed=SEED + rep)
            troi_impacts.append(troi_select(tasks, budget=budget)["total_impact_true"])
            quad_impacts.append(quadrant_select(tasks, budget=budget)["total_impact_true"])

        improvement = (np.mean(troi_impacts) - np.mean(quad_impacts)) / np.mean(quad_impacts) * 100
        budget_results.append({
            "budget": budget,
            "troi_mean": np.mean(troi_impacts),
            "quad_mean": np.mean(quad_impacts),
            "improvement_pct": improvement,
        })
        print(f"  T_budget={budget}h: T-ROI={np.mean(troi_impacts):.0f}h, "
              f"四象限={np.mean(quad_impacts):.0f}h, 提升={improvement:.1f}%")

    # 3. 任务数量维度
    print("\n--- 任务数量维度 (N ∈ {500, 1000, 2000}) ---")
    n_tasks_results = []
    for n in [500, 1000, 2000]:
        troi_impacts = []
        quad_impacts = []
        for rep in range(200):
            tasks = generate_tasks(n=n, seed=SEED + rep)
            troi_impacts.append(troi_select(tasks)["total_impact_true"])
            quad_impacts.append(quadrant_select(tasks)["total_impact_true"])

        improvement = (np.mean(troi_impacts) - np.mean(quad_impacts)) / np.mean(quad_impacts) * 100
        n_tasks_results.append({
            "n_tasks": n,
            "troi_mean": np.mean(troi_impacts),
            "quad_mean": np.mean(quad_impacts),
            "improvement_pct": improvement,
        })
        print(f"  N={n}: T-ROI={np.mean(troi_impacts):.0f}h, "
              f"四象限={np.mean(quad_impacts):.0f}h, 提升={improvement:.1f}%")

    # 保存
    pd.DataFrame(noise_results).to_csv(f"{OUTPUT_DIR}/exp1_sensitivity_noise.csv", index=False)
    pd.DataFrame(budget_results).to_csv(f"{OUTPUT_DIR}/exp1_sensitivity_budget.csv", index=False)
    pd.DataFrame(n_tasks_results).to_csv(f"{OUTPUT_DIR}/exp1_sensitivity_ntasks.csv", index=False)
    print(f"\n敏感性分析数据已保存到 {OUTPUT_DIR}/")


# ============================================================
# 主入口
# ============================================================
if __name__ == "__main__":
    results, stats_summary = run_main_experiment()
    run_sensitivity_analysis()
    print("\n" + "=" * 70)
    print("实验一全部完成！")
    print("=" * 70)
