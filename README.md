# CardioTwin-4D

### Explore coronary-risk model outputs through an interactive 3D heart.

CardioTwin-4D is an educational prototype built for the IIT Mandi AI Multimodal Hackathon. It brings multi-vessel machine-learning outputs, feature explanations, and an interactive heart visualization into one browser-based experience. Users can explore cohort examples, adjust input features, inspect model behavior, and compare clearly labeled hypothetical scenarios.

> **Research and education only.** This prototype is not clinically validated and is not a diagnostic tool. Its outputs, scenarios, and visual simulations must not be used to guide care or replace a qualified clinician.

[![Python](https://img.shields.io/badge/Python-3.9%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/API-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Three.js](https://img.shields.io/badge/Visualization-Three.js-black?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![scikit-learn](https://img.shields.io/badge/ML-scikit--learn-F7931E?logo=scikitlearn&logoColor=white)](https://scikit-learn.org/)

---

## Why this project

CardioTwin-4D is designed to make a small-cohort cardiovascular ML demo easier to inspect—not to make it look more certain than it is. The interface connects four pieces:

- **Four model outputs:** CAD and the LAD, LCX, and RCA cohort labels.
- **Explanations:** per-patient TreeSHAP feature attributions for each target.
- **Interactive visualization:** a procedural 3D heart, vessel selection, animated ECG-style display, and simplified flow indicators.
- **Scenario exploration:** editable inputs and hypothetical risk-factor or virtual-stent scenarios, explicitly presented as model demonstrations rather than forecasts or treatment effects.

The goal is an explorable, transparent prototype where model limitations are part of the experience.

## At a glance

| | |
|---|---|
| **Data** | Extension of the Z-Alizadeh Sani cohort; 303 records |
| **Targets** | CAD, LAD, LCX, RCA |
| **Models** | Soft-voting Gradient Boosting and Random Forest ensembles with sigmoid calibration |
| **Evaluation** | Stratified 5-fold cross-validation; metrics are checked in at `backend/models/metrics.json` |
| **Backend** | FastAPI |
| **Frontend** | HTML, CSS, JavaScript, Three.js |
| **Explainability** | TreeSHAP feature attributions |

## Evaluation

The values below are the reported 5-fold cross-validation metrics stored in [`backend/models/metrics.json`](backend/models/metrics.json). Precision, recall, F1, and Brier score are fold means; the ROC-AUC column is also the mean across folds. Treat these as preliminary results on one small cohort, not evidence of clinical performance.

| Target | Accuracy | Precision | Recall | F1 | ROC-AUC | Brier score |
|:--|--:|--:|--:|--:|--:|--:|
| CAD | 85.80% | 87.32% | 93.95% | 0.9043 | 0.9311 | 0.1003 |
| LAD | 78.23% | 80.53% | 83.10% | 0.8172 | 0.8573 | 0.1544 |
| LCX | 67.33% | 65.40% | 36.99% | 0.4686 | 0.7230 | 0.2089 |
| RCA | 63.37% | 54.94% | 27.11% | 0.3401 | 0.6868 | 0.2143 |

**Important:** the low LCX and RCA recall means many positive examples were missed in this evaluation. The cohort is small, there is no external or prospective validation, and no claim of clinical utility is made. The displayed training-error band is computed from in-sample residuals; it is not a calibrated prediction interval and has no coverage guarantee.

**Evaluation caveat:** these cross-validation scores describe the per-target calibrated classifiers. At inference time, the CAD probability is further adjusted by a logistic stacker fitted using predictions on the full training cohort. That stacked CAD output was not separately evaluated with out-of-fold predictions, so the CAD score above should not be interpreted as validation of the exact served CAD output.

## How it works

```text
Patient/cohort features
        │
        ▼
Feature engineering ── target columns excluded from model inputs
        │
        ▼
Calibrated soft-voting models ── CAD, LAD, LCX, RCA
        │
        ├── TreeSHAP feature attributions
        ├── Simplified, formula-based flow indicators
        └── Hypothetical input-change scenarios
        │
        ▼
FastAPI endpoints + browser-based Three.js visualization
```

The CAD output combines the direct CAD model probability with a logistic stacker that uses a noisy-OR summary of the vessel probabilities. An additional floor prevents the returned CAD probability from falling below 98% of the largest vessel probability. This is an implementation constraint, **not a clinically established relationship or a guarantee of anatomical validity**.

The lumen, vFFR-like, and jet-velocity values are mathematical visualizations derived from model probabilities. They are not measurements, CFD results, or clinically validated physiological estimates. The virtual-stent view applies a fixed illustrative transformation; it does not simulate a real intervention or predict patient outcomes.

## Run locally

### Requirements

- Python 3.9 or newer
- A modern browser with WebGL support

### Install

From the project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

On Windows PowerShell, activate the environment with:

```powershell
.venv\Scripts\Activate.ps1
```

### Start the app

The repository includes the cohort CSV and a trained model artifact, so the normal demo launch does not require retraining:

```bash
python -m uvicorn app:app --app-dir backend --host 127.0.0.1 --port 8000
```

Open [http://localhost:8000](http://localhost:8000). Interactive API documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs).

### Deploy to Vercel

The repository includes a root-level FastAPI entry point and a root `requirements.txt` that reuses the backend dependencies. To deploy:

1. Import `khushalgoel/CardioTwin-4D` from the [Vercel dashboard](https://vercel.com/new).
2. Keep the project root directory set to `.` and allow Vercel to detect FastAPI.
3. Deploy without adding environment variables.

The deployment packages the checked-in model, cohort, metrics, and frontend with the Python function. Retraining is not part of deployment; retrain locally and commit updated model artifacts if needed. Verify `/`, `/api/health`, and `/docs` after deployment. The application remains a research and education prototype; do not enter real patient data.

### Retrain the models

Training runs stratified 5-fold evaluation and then fits the final model on the full cohort:

```bash
python backend/ml_pipeline.py
```

The pipeline requires real target labels in the source cohort and stops with an error if it cannot load valid data. It does not generate synthetic patient records or infer missing vessel labels.

## Explore the app

- Browse five labeled examples drawn from the supplied cohort.
- Edit clinical-feature inputs and request model probabilities for CAD, LAD, LCX, and RCA.
- Inspect TreeSHAP attributions for a selected target.
- Explore the heart visualization, vessel views, ECG-style animation, and derived flow indicators.
- Compare hypothetical risk-factor and virtual-stent scenarios. These are illustrations of how the implemented model and UI respond to changed inputs; they are not forecasts, causal estimates, or treatment recommendations.

## API

| Method | Endpoint | Purpose |
|:--|:--|:--|
| `GET` | `/api/health` | Service status |
| `GET` | `/api/metrics` | Stored cohort evaluation metrics |
| `GET` | `/api/leakage-audit` | Checks target names against the loaded model feature list |
| `GET` | `/api/patients` | Cohort preview and example profiles |
| `GET` | `/api/patient/{patient_id}` | One cohort record with features and separated ground truth |
| `POST` | `/api/predict` | Target probabilities and illustrative derived values |
| `POST` | `/api/explain?target=CAD` | TreeSHAP explanation for a target |
| `POST` | `/api/counterfactual` | Hypothetical risk-factor scenario |
| `POST` | `/api/virtual-stent?vessel=LAD` | Illustrative virtual-stent transformation |

## Data and responsible use

The cohort is the Extension of Z-Alizadeh Sani dataset (UCI Machine Learning Repository, [dataset 411](https://archive.ics.uci.edu/dataset/411/extension+of+z+alizadeh+sani+dataset)). The supplied CSV contains 303 records. The training code excludes `Cath`, `CAD`, `LAD`, `LCX`, and `RCA` from the predictor feature matrix and validates required target labels before training. The leakage-audit endpoint reports whether those names appear in the loaded model's feature list; it is a code-level check, not an independent audit or proof that all forms of leakage are absent.

This repository is a hackathon/learning prototype. It has not undergone external validation, prospective study, clinical review, regulatory assessment, or fairness analysis. Model explanations describe model behavior and do not establish causality. Do not submit real patient information to a deployment of this application.

## Project structure

```text
backend/
  app.py                  FastAPI routes and static-file serving
  explainability.py       TreeSHAP explanations and illustrative scenarios
  ml_pipeline.py          Data validation, feature engineering, training
  data/                   Supplied 303-record cohort CSV
  models/                 Trained model artifact and reported metrics
  requirements.txt        Python runtime dependencies
frontend/
  index.html              Workstation interface
  css/styles.css          UI styling
  js/                     App logic, charts, ECG, and 3D visualization
```

## Built for

**IIT Mandi AI Multimodal Hackathon — Track A: Cardiovascular Risk Visualization & Prediction**

---

If you use or adapt this work, cite the underlying dataset and review its terms of use. This project is a demonstration, not medical software.
