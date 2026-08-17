# CTIT — Computable Time Investment Theory

**Turn time management into a computable ranking problem** — replace the fuzzy "important / urgent" intuition with three measurable time parameters, and auto-calibrate your over/under-estimation with a PI controller.

> Core formula: `Priority P = T_impact / T_remain`, with PI-controller bias calibration.

> **▶ [Live Demo](https://ctit.dengfengting238.workers.dev/)** — try it in your browser, no install needed.

🌐 [中文文档](README.zh-CN.md)

---

## The idea

| Parameter | Meaning |
|-----------|---------|
| **T_impact** | Impact time (h): total time a task's completion "buys back" — incl. chain effects & long-term value |
| **T_cost** | Execution cost (h): time you actually spend doing it |
| **T_remain** | Remaining time (h): hours left before the optimal execution window closes |

**TROI = T_impact / T_remain** (Time Return On Investment). Higher TROI → do it first.

**PI bias calibration**: people systematically over- or under-estimate task value. A PI controller's integral term (`Σerror × K_i`) corrects that bias automatically — the more you use it, the more accurate it gets.

## Key results (Monte-Carlo, N=1000 replications)

### Experiment 1 — TROI ranking beats random & the Eisenhower matrix

| Method | Mean total impact | Improvement |
|--------|-------------------|-------------|
| Random | 2,224 h | — |
| Eisenhower quadrant | 20,774 h | +834% vs random |
| **TROI ranking** | **31,514 h** | **+51.7% vs quadrant** (d=0.946, p=5.25×10⁻¹⁴¹) |

### Experiment 2 — PI eliminates bias; P-only leaves steady-state error

| Controller | Steady-state bias | Bias eliminated |
|-----------|-------------------|-----------------|
| None | ≈ +6.0 h | 0.3% |
| P-only | ≈ +3.9 h | 34.3% (residual steady-state error) |
| **PI** | **≈ −0.005 h** | **100.1%** (vs P-only: d=5.79, p=3.3×10⁻¹⁵⁵) |

> Full raw data in [`sim/results/`](sim/results/), reproducible scripts in [`sim/`](sim/).

## Repository layout

```
.
├── sim/      # paper simulation code + results + figures
├── app/      # CTIT App (PWA) full source
├── engine/   # standalone local NLP estimation engine (extracted from app.js)
└── docs/     # theory abstract, experiment data, paper status
```

## Quick start

### 1. Simulation (Python 3.10+)

```bash
cd sim
pip install numpy scipy pandas matplotlib
python3 exp1_troi_ranking.py     # Exp 1: TROI ranking validation
python3 exp2_pid_calibration.py  # Exp 2: PI calibration validation
python3 generate_figures.py      # regenerate paper figures
```

### 2. Local engine (Node.js, zero dependencies)

```js
const { createCTITEngine } = require('./engine/ctit-engine.js');
const ctit = createCTITEngine();
ctit.analyze('write the paper\nreview for the final exam in 3 days');
```

```bash
node engine/test.js   # 20 smoke tests
```

### 3. App (PWA)

Open `app/index.html` in a browser, or deploy as a static site.

- **Local engine**: fully offline, no setup.
- **Cloud refinement (optional)**: bring your own API key (Zhipu GLM / DeepSeek).

## Paper status

- This repo open-sources **code & simulation data only**. Open-sourcing code does **not** hurt paper publication — reproducibility is a plus.
- The full paper is **not yet published**; only the abstract is in [`docs/`](docs/).
- Once published, the full text and citation will be added here.

## License

- Code, engine, simulations: **MIT** ([`LICENSE`](LICENSE)).
- Paper text & figures: copyright reserved until publication.

## Author

Wang Fengqing (等风停)

---

*CTIT = Computable Time Investment Theory*
