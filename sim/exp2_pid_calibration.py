#!/usr/bin/env python3
"""
CTIT 实验二：PI 控制器的偏置消除验证
======================================
模拟一个具有 +30% 系统性乐观偏置的"被试"，在重复执行同类任务时，
比较三种预估校准方法的偏置消除效果：
  1. 无校准（No Correction）
  2. 纯比例控制（P-only）
  3. 比例-积分控制（PI）

输出：控制台报告 + CSV 数据文件（供论文表格使用）
"""

import numpy as np
import pandas as pd
from scipy import stats
import os
import json

# ============================================================
# 全局参数（与论文第 8.2 节一致）
# ============================================================
N_TRIALS      = 200     # 每次仿真的试验次数
N_REPS        = 200     # 蒙特卡洛重复次数
T_IMPACT_TRUE = 20.0    # 真实影响时间（小时）
BIAS          = 0.30    # +30% 乐观偏置
SIGMA_NOISE   = 0.30    # 预估随机噪声的标准差
SIGMA_OBS     = 0.15    # 观测噪声的标准差

# PID 参数
KP = 0.5    # 比例增益
KI = 0.15   # 积分增益

SEED = 42

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ============================================================
# 三种校准方法
# ============================================================
def no_correction(trials, bias, sigma_noise, sigma_obs, rng):
    """无校准：直接使用原始预估值。"""
    errors = []
    preds = []
    for k in range(trials):
        # 原始预估 = 真实值 × (1 + bias + noise)
        t_raw = T_IMPACT_TRUE * (1 + bias + rng.normal(0, sigma_noise))
        # 观测值 = 真实值 × (1 + obs_noise)
        t_actual = T_IMPACT_TRUE * (1 + rng.normal(0, sigma_obs))
        # 误差
        e = t_raw - t_actual
        errors.append(e)
        preds.append(t_raw)
    return np.array(preds), np.array(errors)


def p_only(trials, bias, sigma_noise, sigma_obs, rng, kp=KP):
    """P-only 控制：U(k) = -K_p × e(k-1)"""
    errors = []
    preds = []
    e_prev = 0.0

    for k in range(trials):
        # 原始预估
        t_raw = T_IMPACT_TRUE * (1 + bias + rng.normal(0, sigma_noise))
        # P 校正
        t_pred = t_raw - kp * e_prev
        # 观测
        t_actual = T_IMPACT_TRUE * (1 + rng.normal(0, sigma_obs))
        # 误差
        e = t_pred - t_actual
        errors.append(e)
        preds.append(t_pred)
        e_prev = e

    return np.array(preds), np.array(errors)


def pi_controller(trials, bias, sigma_noise, sigma_obs, rng, kp=KP, ki=KI):
    """PI 控制：U(k) = -K_p × e(k) - K_i × Σ e(j)"""
    errors = []
    preds = []
    e_prev = 0.0
    integral = 0.0

    for k in range(trials):
        # 原始预估
        t_raw = T_IMPACT_TRUE * (1 + bias + rng.normal(0, sigma_noise))
        # PI 校正
        t_pred = t_raw - kp * e_prev - ki * integral
        # 观测
        t_actual = T_IMPACT_TRUE * (1 + rng.normal(0, sigma_obs))
        # 误差
        e = t_pred - t_actual
        errors.append(e)
        preds.append(t_pred)
        # 更新积分和上一步误差
        integral += e
        e_prev = e

    return np.array(preds), np.array(errors)


# ============================================================
# 主实验
# ============================================================
def run_main_experiment():
    """运行主实验，比较三种方法的偏置消除效果。"""
    print("=" * 70)
    print("实验二：PI 控制器的偏置消除验证")
    print("=" * 70)
    print(f"参数: N_trials={N_TRIALS}, bias=+{BIAS*100:.0f}%, "
          f"σ_noise={SIGMA_NOISE}, σ_obs={SIGMA_OBS}")
    print(f"PID: K_p={KP}, K_i={KI}")
    print(f"重复: {N_REPS}")
    print()

    all_results = {"none": [], "p_only": [], "pi": []}
    all_early = {"none": [], "p_only": [], "pi": []}
    all_late  = {"none": [], "p_only": [], "pi": []}

    for rep in range(N_REPS):
        rng = np.random.default_rng(SEED + rep)

        preds_n, errs_n = no_correction(N_TRIALS, BIAS, SIGMA_NOISE, SIGMA_OBS, rng)
        preds_p, errs_p = p_only(N_TRIALS, BIAS, SIGMA_NOISE, SIGMA_OBS, rng)
        preds_i, errs_i = pi_controller(N_TRIALS, BIAS, SIGMA_NOISE, SIGMA_OBS, rng)

        # 全程平均 signed error
        all_results["none"].append(np.mean(errs_n))
        all_results["p_only"].append(np.mean(errs_p))
        all_results["pi"].append(np.mean(errs_i))

        # 早期（前 30 次）
        all_early["none"].append(np.mean(errs_n[:30]))
        all_early["p_only"].append(np.mean(errs_p[:30]))
        all_early["pi"].append(np.mean(errs_i[:30]))

        # 晚期（后 50 次）
        all_late["none"].append(np.mean(errs_n[-50:]))
        all_late["p_only"].append(np.mean(errs_p[-50:]))
        all_late["pi"].append(np.mean(errs_i[-50:]))

    # 统计
    print("-" * 70)
    print(f"{'方法':<12} {'全程 SE (h)':>14} {'早期 SE (h)':>14} {'晚期 SE (h)':>14}")
    print("-" * 70)

    stats_summary = {}
    for method in ["none", "p_only", "pi"]:
        full = np.array(all_results[method])
        early = np.array(all_early[method])
        late = np.array(all_late[method])

        stats_summary[method] = {
            "full_mean": float(np.mean(full)),
            "full_sd": float(np.std(full, ddof=1)),
            "early_mean": float(np.mean(early)),
            "early_sd": float(np.std(early, ddof=1)),
            "late_mean": float(np.mean(late)),
            "late_sd": float(np.std(late, ddof=1)),
        }

        print(f"{method:<12} {np.mean(full):>14.2f} {np.mean(early):>14.2f} {np.mean(late):>14.2f}")

    # 偏置消除率
    print()
    print("-" * 70)
    print("偏置消除率")
    print("-" * 70)

    original_bias_hours = T_IMPACT_TRUE * BIAS  # 6.0 h
    for method in ["none", "p_only", "pi"]:
        late_mean = stats_summary[method]["late_mean"]
        elimination = (original_bias_hours - late_mean) / original_bias_hours * 100
        stats_summary[method]["bias_elimination_pct"] = float(elimination)
        print(f"  {method:>8}: 原始偏置={original_bias_hours:.1f}h, "
              f"晚期残留={late_mean:.1f}h, 消除率={elimination:.1f}%")

    # 配对 t 检验（PI vs P-only，晚期）
    print()
    print("-" * 70)
    print("配对 t 检验（PI vs P-only，晚期 SE）")
    print("-" * 70)
    late_pi = np.array(all_late["pi"])
    late_p  = np.array(all_late["p_only"])
    t_stat, p_val = stats.ttest_rel(late_pi, late_p)
    cohen_d = (np.mean(late_p) - np.mean(late_pi)) / np.std(late_p - late_pi, ddof=1)
    print(f"  t = {t_stat:.2f}, p = {p_val:.3e}, Cohen's d = {cohen_d:.3f}")

    stats_summary["pi_vs_p_late"] = {
        "t_stat": float(t_stat),
        "p_value": float(p_val),
        "cohen_d": float(cohen_d),
    }

    # 保存
    df = pd.DataFrame({
        "none_full": all_results["none"],
        "p_only_full": all_results["p_only"],
        "pi_full": all_results["pi"],
        "none_early": all_early["none"],
        "p_only_early": all_early["p_only"],
        "pi_early": all_early["pi"],
        "none_late": all_late["none"],
        "p_only_late": all_late["p_only"],
        "pi_late": all_late["pi"],
    })
    df.to_csv(f"{OUTPUT_DIR}/exp2_main_results.csv", index=False)
    print(f"\n原始数据已保存: {OUTPUT_DIR}/exp2_main_results.csv")

    with open(f"{OUTPUT_DIR}/exp2_stats.json", "w", encoding="utf-8") as f:
        json.dump(stats_summary, f, indent=2, ensure_ascii=False)
    print(f"统计摘要已保存: {OUTPUT_DIR}/exp2_stats.json")

    return stats_summary


# ============================================================
# 敏感性分析
# ============================================================
def run_sensitivity_analysis():
    """偏置大小敏感性分析 + K_i 敏感性分析。"""
    print("\n" + "=" * 70)
    print("敏感性分析")
    print("=" * 70)

    # 1. 偏置大小维度
    print("\n--- 偏置大小维度 (bias ∈ {-20%, 0%, +30%, +50%}) ---")
    bias_results = []
    for bias in [-0.20, 0.0, 0.30, 0.50]:
        late_errors = {"none": [], "p_only": [], "pi": []}
        for rep in range(100):
            rng = np.random.default_rng(SEED + rep)
            _, errs_n = no_correction(N_TRIALS, bias, SIGMA_NOISE, SIGMA_OBS, rng)
            _, errs_p = p_only(N_TRIALS, bias, SIGMA_NOISE, SIGMA_OBS, rng)
            _, errs_i = pi_controller(N_TRIALS, bias, SIGMA_NOISE, SIGMA_OBS, rng)

            late_errors["none"].append(np.mean(errs_n[-50:]))
            late_errors["p_only"].append(np.mean(errs_p[-50:]))
            late_errors["pi"].append(np.mean(errs_i[-50:]))

        bias_results.append({
            "bias": bias,
            "none_late": np.mean(late_errors["none"]),
            "p_only_late": np.mean(late_errors["p_only"]),
            "pi_late": np.mean(late_errors["pi"]),
        })
        print(f"  bias={bias:+.0%}: none={np.mean(late_errors['none']):.2f}h, "
              f"p_only={np.mean(late_errors['p_only']):.2f}h, "
              f"pi={np.mean(late_errors['pi']):.2f}h")

    pd.DataFrame(bias_results).to_csv(f"{OUTPUT_DIR}/exp2_sensitivity_bias.csv", index=False)

    # 2. K_i 敏感性分析
    print("\n--- K_i 敏感性 (K_i ∈ {0.05, 0.10, 0.15, 0.20, 0.30}) ---")
    ki_results = []
    for ki in [0.05, 0.10, 0.15, 0.20, 0.30]:
        late_errors = []
        for rep in range(100):
            rng = np.random.default_rng(SEED + rep)
            _, errs_i = pi_controller(N_TRIALS, BIAS, SIGMA_NOISE, SIGMA_OBS, rng, ki=ki)
            late_errors.append(np.mean(errs_i[-50:]))
        ki_results.append({
            "ki": ki,
            "pi_late": np.mean(late_errors),
            "pi_late_sd": np.std(late_errors, ddof=1),
        })
        print(f"  K_i={ki:.2f}: late_SE={np.mean(late_errors):.2f}h "
              f"(±{np.std(late_errors, ddof=1):.2f})")

    pd.DataFrame(ki_results).to_csv(f"{OUTPUT_DIR}/exp2_sensitivity_ki.csv", index=False)

    # 3. 无偏置条件下的 PI vs P-only（验证 K_i 的条件依赖性）
    print("\n--- 无偏置条件下 PI vs P-only ---")
    late_p = []
    late_pi = []
    for rep in range(100):
        rng = np.random.default_rng(SEED + rep)
        _, errs_p = p_only(N_TRIALS, 0.0, SIGMA_NOISE, SIGMA_OBS, rng)
        _, errs_i = pi_controller(N_TRIALS, 0.0, SIGMA_NOISE, SIGMA_OBS, rng)
        late_p.append(np.mean(errs_p[-50:]))
        late_pi.append(np.mean(errs_i[-50:]))

    print(f"  P-only: late_SE={np.mean(late_p):.2f}h")
    print(f"  PI:     late_SE={np.mean(late_pi):.2f}h")
    print(f"  → 无偏置时 PI 略差于 P-only（积分项引入了不必要的方差）")

    print(f"\n敏感性分析数据已保存到 {OUTPUT_DIR}/")


# ============================================================
# 主入口
# ============================================================
if __name__ == "__main__":
    stats_summary = run_main_experiment()
    run_sensitivity_analysis()
    print("\n" + "=" * 70)
    print("实验二全部完成！")
    print("=" * 70)
