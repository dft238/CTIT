#!/usr/bin/env python3
"""
CTIT 论文图表生成脚本
======================
读取实验一和实验二的仿真结果（自动运行仿真如结果不存在），
生成论文中的全部图表。

输出的图表：
  figures/fig1_experiment1.png  —— 实验一四合一图
  figures/fig2_experiment2.png  —— 实验二四合一图
"""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy import stats
import os
import sys

# Font setup
plt.rcParams['font.sans-serif'] = ['Noto Sans SC', 'WenQuanYi Zen Hei', 'SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
plt.rcParams['mathtext.fontset'] = 'cm'
plt.rcParams['figure.dpi'] = 200

FIG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "figures")
RESULTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
os.makedirs(FIG_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)

# Auto-run experiments if results don't exist
if not os.path.exists(f"{RESULTS_DIR}/exp1_main_results.csv"):
    print("实验一结果不存在，自动运行实验一...")
    sys.path.insert(0, os.path.dirname(__file__))
    import exp1_troi_ranking
    exp1_troi_ranking.run_main_experiment()
    exp1_troi_ranking.run_sensitivity_analysis()

if not os.path.exists(f"{RESULTS_DIR}/exp2_main_results.csv"):
    print("实验二结果不存在，自动运行实验二...")
    import exp2_pid_calibration
    exp2_pid_calibration.run_main_experiment()
    exp2_pid_calibration.run_sensitivity_analysis()


# ============================================================
# Figure 1: Experiment 1 — Four-panel
# ============================================================
def make_fig1():
    import pandas as pd

    df = pd.read_csv(f"{RESULTS_DIR}/exp1_main_results.csv")

    fig, axes = plt.subplots(2, 2, figsize=(14, 11))

    # --- Panel A: Boxplot ---
    ax = axes[0, 0]
    data_box = [df["random"].values, df["quadrant"].values, df["troi"].values]
    labels = ["Random", "Quadrant", "T-ROI"]
    bp = ax.boxplot(data_box, tick_labels=labels, patch_artist=True, showfliers=False,
                    widths=0.6)
    colors = ["#A8B4C2", "#D4A574", "#5B8DB8"]
    for patch, color in zip(bp["boxes"], colors):
        patch.set_facecolor(color)
        patch.set_alpha(0.7)
    ax.set_ylabel(r"$\sum T_{\mathrm{impact\_true}}$ (hours)", fontsize=12)
    ax.set_title("(A) Decision Quality Comparison", fontsize=13, fontweight="bold")
    ax.grid(axis="y", alpha=0.3)
    ax.set_xticklabels(labels, fontsize=11)

    # --- Panel B: Paired difference histogram ---
    ax = axes[0, 1]
    diff_troi_quad = df["troi"].values - df["quadrant"].values
    diff_troi_rand = df["troi"].values - df["random"].values
    ax.hist(diff_troi_rand, bins=50, alpha=0.6, color="#A8B4C2",
            label=f"T-ROI vs Random (mean={np.mean(diff_troi_rand):.0f}h)")
    ax.hist(diff_troi_quad, bins=50, alpha=0.7, color="#5B8DB8",
            label=f"T-ROI vs Quadrant (mean={np.mean(diff_troi_quad):.0f}h)")
    ax.axvline(0, color="red", linestyle="--", linewidth=1)
    ax.set_xlabel(r"$\Delta$ $\sum T_{\mathrm{impact\_true}}$ (hours)", fontsize=12)
    ax.set_ylabel("Frequency", fontsize=12)
    ax.set_title("(B) Paired Differences (T-ROI − Baseline)", fontsize=13, fontweight="bold")
    ax.legend(fontsize=9)
    ax.grid(axis="y", alpha=0.3)

    # --- Panel C: Noise sensitivity ---
    ax = axes[1, 0]
    df_noise = pd.read_csv(f"{RESULTS_DIR}/exp1_sensitivity_noise.csv")
    x = df_noise["sigma"].values
    ax.plot(x, df_noise["troi_mean"].values / 1000, "o-", color="#5B8DB8",
            linewidth=2, markersize=8, label="T-ROI")
    ax.plot(x, df_noise["quad_mean"].values / 1000, "s--", color="#D4A574",
            linewidth=2, markersize=8, label="Quadrant")
    ax.fill_between(x,
                    (df_noise["troi_mean"] - df_noise["troi_mean"] * 0.02).values / 1000,
                    (df_noise["troi_mean"] + df_noise["troi_mean"] * 0.02).values / 1000,
                    alpha=0.15, color="#5B8DB8")
    ax.set_xlabel(r"Subjective estimation noise $\sigma_\varepsilon$", fontsize=12)
    ax.set_ylabel(r"$\sum T_{\mathrm{impact}}$ ($\times 10^3$ h)", fontsize=12)
    ax.set_title("(C) Noise Sensitivity", fontsize=13, fontweight="bold")
    ax.legend(fontsize=11)
    ax.grid(alpha=0.3)
    ax.set_xticks([0.2, 0.5, 0.8])

    # --- Panel D: Budget sensitivity ---
    ax = axes[1, 1]
    df_budget = pd.read_csv(f"{RESULTS_DIR}/exp1_sensitivity_budget.csv")
    x = df_budget["budget"].values
    ax.plot(x, df_budget["troi_mean"].values / 1000, "o-", color="#5B8DB8",
            linewidth=2, markersize=8, label="T-ROI")
    ax.plot(x, df_budget["quad_mean"].values / 1000, "s--", color="#D4A574",
            linewidth=2, markersize=8, label="Quadrant")
    ax.set_xlabel(r"Time budget $T_{\mathrm{budget}}$ (hours)", fontsize=12)
    ax.set_ylabel(r"$\sum T_{\mathrm{impact}}$ ($\times 10^3$ h)", fontsize=12)
    ax.set_title("(D) Budget Sensitivity", fontsize=13, fontweight="bold")
    ax.legend(fontsize=11)
    ax.grid(alpha=0.3)
    ax.set_xticks([20, 40, 80])

    plt.tight_layout()
    plt.savefig(f"{FIG_DIR}/fig1_experiment1.png", dpi=200, bbox_inches="tight")
    plt.close()
    print(f"Figure 1 saved: {FIG_DIR}/fig1_experiment1.png")


# ============================================================
# Figure 2: Experiment 2 — Four-panel
# ============================================================
def make_fig2():
    import pandas as pd

    # Re-run a single representative trial for the convergence curve
    rng = np.random.default_rng(42)
    N_TRIALS = 200
    T_TRUE = 20.0
    BIAS = 0.30
    SIGMA_N = 0.30
    SIGMA_O = 0.15
    KP = 0.5
    KI = 0.15

    # Generate data for all three methods
    errors_none = []
    errors_p = []
    errors_i = []
    e_prev_p = 0.0
    e_prev_i = 0.0
    integral = 0.0

    for k in range(N_TRIALS):
        t_raw = T_TRUE * (1 + BIAS + rng.normal(0, SIGMA_N))
        t_actual = T_TRUE * (1 + rng.normal(0, SIGMA_O))

        # None
        errors_none.append(t_raw - t_actual)

        # P-only
        t_pred_p = t_raw - KP * e_prev_p
        e_p = t_pred_p - t_actual
        errors_p.append(e_p)
        e_prev_p = e_p

        # PI
        t_pred_i = t_raw - KP * e_prev_i - KI * integral
        e_i = t_pred_i - t_actual
        errors_i.append(e_i)
        integral += e_i
        e_prev_i = e_i

    errors_none = np.array(errors_none)
    errors_p = np.array(errors_p)
    errors_i = np.array(errors_i)

    # Smooth with rolling mean (window=10)
    def smooth(arr, w=10):
        return np.convolve(arr, np.ones(w) / w, mode="valid")

    sm_none = smooth(errors_none)
    sm_p = smooth(errors_p)
    sm_i = smooth(errors_i)
    x_smooth = np.arange(len(sm_none)) + 5

    fig, axes = plt.subplots(2, 2, figsize=(14, 11))

    # --- Panel A: Convergence curve ---
    ax = axes[0, 0]
    ax.plot(x_smooth, sm_none, color="#A8B4C2", linewidth=1.5, alpha=0.8, label="No Correction")
    ax.plot(x_smooth, sm_p, color="#D4A574", linewidth=1.5, alpha=0.8, label="P-only")
    ax.plot(x_smooth, sm_i, color="#5B8DB8", linewidth=2, label="PI")
    ax.axhline(0, color="red", linestyle="--", linewidth=1, alpha=0.5)
    ax.axhline(T_TRUE * BIAS, color="gray", linestyle=":", linewidth=1, alpha=0.5,
               label=f"Original bias (+{T_TRUE*BIAS:.0f}h)")
    ax.set_xlabel("Trial number", fontsize=12)
    ax.set_ylabel("Signed Error (hours)", fontsize=12)
    ax.set_title("(A) Signed Error Convergence", fontsize=13, fontweight="bold")
    ax.legend(fontsize=9, loc="upper right")
    ax.grid(alpha=0.3)
    ax.set_xlim(0, 200)

    # --- Panel B: Early vs Late ---
    ax = axes[0, 1]
    df = pd.read_csv(f"{RESULTS_DIR}/exp2_main_results.csv")
    methods = ["none", "p_only", "pi"]
    labels = ["No Correction", "P-only", "PI"]
    colors = ["#A8B4C2", "#D4A574", "#5B8DB8"]

    early_means = [df[f"{m}_early"].mean() for m in methods]
    late_means = [df[f"{m}_late"].mean() for m in methods]
    early_sds = [df[f"{m}_early"].std(ddof=1) for m in methods]
    late_sds = [df[f"{m}_late"].std(ddof=1) for m in methods]

    x = np.arange(len(methods))
    width = 0.35
    ax.bar(x - width/2, early_means, width, yerr=early_sds, color=colors, alpha=0.5,
           label="Early (trials 1-30)", capsize=5)
    ax.bar(x + width/2, late_means, width, yerr=late_sds, color=colors, alpha=0.9,
           label="Late (trials 151-200)", capsize=5)
    ax.axhline(0, color="red", linestyle="--", linewidth=1, alpha=0.5)
    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=11)
    ax.set_ylabel("Signed Error (hours)", fontsize=12)
    ax.set_title("(B) Early vs Late Phase Comparison", fontsize=13, fontweight="bold")
    ax.legend(fontsize=10)
    ax.grid(axis="y", alpha=0.3)

    # --- Panel C: Bias size sensitivity ---
    ax = axes[1, 0]
    df_bias = pd.read_csv(f"{RESULTS_DIR}/exp2_sensitivity_bias.csv")
    x = df_bias["bias"].values * 100
    ax.plot(x, df_bias["none_late"].values, "o--", color="#A8B4C2",
            linewidth=1.5, markersize=7, label="No Correction")
    ax.plot(x, df_bias["p_only_late"].values, "s--", color="#D4A574",
            linewidth=1.5, markersize=7, label="P-only")
    ax.plot(x, df_bias["pi_late"].values, "D-", color="#5B8DB8",
            linewidth=2, markersize=7, label="PI")
    ax.axhline(0, color="red", linestyle="--", linewidth=1, alpha=0.5)
    ax.set_xlabel("Systematic bias (%)", fontsize=12)
    ax.set_ylabel("Late-phase Signed Error (hours)", fontsize=12)
    ax.set_title("(C) Bias Size Sensitivity", fontsize=13, fontweight="bold")
    ax.legend(fontsize=10)
    ax.grid(alpha=0.3)
    ax.set_xticks([-20, 0, 30, 50])

    # --- Panel D: K_i sensitivity ---
    ax = axes[1, 1]
    df_ki = pd.read_csv(f"{RESULTS_DIR}/exp2_sensitivity_ki.csv")
    x = df_ki["ki"].values
    ax.errorbar(x, df_ki["pi_late"].values, yerr=df_ki["pi_late_sd"].values,
                fmt="D-", color="#5B8DB8", linewidth=2, markersize=8, capsize=5,
                label="PI (with +30% bias)")
    ax.axhline(0, color="red", linestyle="--", linewidth=1, alpha=0.5, label="Zero error")
    ax.set_xlabel(r"Integral gain $K_i$", fontsize=12)
    ax.set_ylabel("Late-phase Signed Error (hours)", fontsize=12)
    ax.set_title(r"(D) $K_i$ Sensitivity", fontsize=13, fontweight="bold")
    ax.legend(fontsize=10)
    ax.grid(alpha=0.3)
    ax.set_xticks([0.05, 0.10, 0.15, 0.20, 0.30])

    plt.tight_layout()
    plt.savefig(f"{FIG_DIR}/fig2_experiment2.png", dpi=200, bbox_inches="tight")
    plt.close()
    print(f"Figure 2 saved: {FIG_DIR}/fig2_experiment2.png")


# ============================================================
# Main
# ============================================================
if __name__ == "__main__":
    print("生成论文图表...")
    make_fig1()
    make_fig2()
    print(f"\n全部图表已保存到 {FIG_DIR}/")
    print("文件列表:")
    for f in sorted(os.listdir(FIG_DIR)):
        size = os.path.getsize(f"{FIG_DIR}/{f}") / 1024
        print(f"  {f}  ({size:.1f} KB)")
