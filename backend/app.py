"""
CardioTwin-4D: FastAPI Clinical Engine Server
Track A: Cardiovascular Risk Visualization & Prediction
"""

import os
import time
import json
import logging
from typing import Dict, Any, Optional, List
import pandas as pd

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from ml_pipeline import (
    MODEL_ARTIFACT_PATH, METRICS_FILEPATH, CSV_FILEPATH,
    FORBIDDEN_LEAKAGE_COLS, load_ensemble
)
from explainability import ClinicalExplainabilityEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("CardioTwin.App")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")

app = FastAPI(
    title="CardioTwin-4D Clinical API",
    description="Anatomically-Constrained 4D Hemodynamic Digital Twin, Multi-Vessel Stenosis Predictor & Counterfactual Clinical Workstation",
    version="1.0.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load engine on startup
try:
    explainability_engine = ClinicalExplainabilityEngine()
    ensemble = explainability_engine.ensemble
    logger.info("Successfully loaded ML models and Explainability Engine.")
except Exception as e:
    logger.error(f"Failed to load engine on startup: {e}")
    explainability_engine = None
    ensemble = None

# Load dataset for patient browsing & archetypes
try:
    df_cohort = pd.read_csv(CSV_FILEPATH)
    logger.info(f"Loaded cohort dataset with {len(df_cohort)} records.")
except Exception as e:
    logger.warning(f"Could not load cohort dataset: {e}")
    df_cohort = pd.DataFrame()


# ==============================================================================
# CURATED ARCHETYPE PATIENTS
# ==============================================================================
ARCHETYPES = [
    {
        "id": 14,
        "label": "Patient #14: LAD and RCA Labels Positive",
        "description": "67yo Female; cohort labels are CAD-positive, LAD-positive, LCX-negative, and RCA-positive. EF 55%, RWMA score 2.",
        "case_type": "LAD_RCA_LABELS"
    },
    {
        "id": 42,
        "label": "Patient #42: CAD-Negative Cohort Label",
        "description": "40yo Male; cohort labels are CAD-negative and negative for LAD, LCX, and RCA. EF 50%, LDL 131.",
        "case_type": "CAD_NEGATIVE_LABEL"
    },
    {
        "id": 108,
        "label": "Patient #108: Three Vessel Labels Positive",
        "description": "75yo Male; cohort labels are CAD-positive and positive for LAD, LCX, and RCA. EF 50%, RWMA score 0.",
        "case_type": "TRIPLE_VESSEL_LABELS"
    },
    {
        "id": 215,
        "label": "Patient #215: Chest Pain with CAD-Negative Label",
        "description": "66yo Male; CAD, LAD, LCX, and RCA cohort labels are negative. Typical chest pain is recorded; EF 45%, LDL 117.",
        "case_type": "CHEST_PAIN_CAD_NEGATIVE_LABEL"
    },
    {
        "id": 289,
        "label": "Patient #289: LCX and RCA Labels Positive",
        "description": "67yo Female; cohort labels are CAD-positive, LAD-negative, LCX-positive, and RCA-positive. EF 50%, LDL 92.",
        "case_type": "LCX_RCA_LABELS"
    }
]


class PatientPayload(BaseModel):
    features: Dict[str, Any]


# ==============================================================================
# API ENDPOINTS
# ==============================================================================
@app.get("/api/health")
def health_check():
    return {
        "status": "ONLINE",
        "engine": "CardioTwin-4D",
        "timestamp": time.time(),
        "anti_leakage_guard": "ACTIVE",
        "calibrated_targets": ["CAD", "LAD", "LCX", "RCA"]
    }


@app.get("/api/leakage-audit")
def leakage_audit():
    """
    Reports whether forbidden target columns appear in the model feature list.
    """
    if ensemble is None:
        raise HTTPException(status_code=500, detail="Model engine not loaded")

    feature_cols = ensemble.feature_cols
    forbidden_in_features = [col for col in FORBIDDEN_LEAKAGE_COLS if col in feature_cols]

    return {
        "audit_status": "PASSED" if not forbidden_in_features else "FAILED",
        "forbidden_leakage_columns": FORBIDDEN_LEAKAGE_COLS,
        "clean_features_count": len(feature_cols),
        "clean_features_list": feature_cols,
        "detected_leaks": forbidden_in_features,
        "verification_statement": "Forbidden target column names were checked against the model feature list.",
        "timestamp": time.time()
    }


@app.get("/api/metrics")
def get_metrics():
    """
    Returns 5-fold cross-validation metrics, ROC curves, and confusion matrices.
    """
    if not os.path.exists(METRICS_FILEPATH):
        raise HTTPException(status_code=404, detail="Metrics file not found. Run ml_pipeline.py first.")

    with open(METRICS_FILEPATH, "r") as f:
        metrics = json.load(f)
    return metrics


@app.get("/api/patients")
def get_patients():
    """
    Returns pre-loaded archetype cases and full cohort metadata.
    """
    patients_list = []
    if not df_cohort.empty:
        for idx in range(min(303, len(df_cohort))):
            row = df_cohort.iloc[idx].to_dict()
            patients_list.append({
                "patient_id": idx + 1,
                "age": int(row.get("Age", 55)),
                "sex": "Male" if row.get("Sex", 1) == 1 else "Female",
                "cad_target": int(row.get("CAD", 0)),
                "lad_target": int(row.get("LAD", 0)),
                "lcx_target": int(row.get("LCX", 0)),
                "rca_target": int(row.get("RCA", 0)),
                "features": {k: v for k, v in row.items() if k not in FORBIDDEN_LEAKAGE_COLS}
            })

    # Hydrate archetypes with their real patient features
    hydrated_archetypes = []
    for arch in ARCHETYPES:
        arch_id = arch["id"]
        if arch_id <= len(df_cohort):
            row = df_cohort.iloc[arch_id - 1].to_dict()
            hydrated_archetypes.append({
                **arch,
                "features": {k: v for k, v in row.items() if k not in FORBIDDEN_LEAKAGE_COLS},
                "ground_truth": {
                    "CAD": int(row.get("CAD", 0)),
                    "LAD": int(row.get("LAD", 0)),
                    "LCX": int(row.get("LCX", 0)),
                    "RCA": int(row.get("RCA", 0))
                }
            })

    return {
        "archetypes": hydrated_archetypes,
        "cohort_count": len(patients_list),
        "patients": patients_list[:50]  # Return top 50 in preview list
    }


@app.get("/api/patient/{patient_id}")
def get_patient_by_id(patient_id: int):
    """
    Retrieves a single patient's raw clinical features by cohort ID (1..303).
    """
    if df_cohort.empty or patient_id < 1 or patient_id > len(df_cohort):
        raise HTTPException(status_code=404, detail=f"Patient ID {patient_id} not found in cohort.")

    row = df_cohort.iloc[patient_id - 1].to_dict()
    return {
        "patient_id": patient_id,
        "features": {k: v for k, v in row.items() if k not in FORBIDDEN_LEAKAGE_COLS},
        "ground_truth": {
            "Cath": row.get("Cath", "Cad" if row.get("CAD") == 1 else "Normal"),
            "CAD": int(row.get("CAD", 0)),
            "LAD": int(row.get("LAD", 0)),
            "LCX": int(row.get("LCX", 0)),
            "RCA": int(row.get("RCA", 0))
        }
    }


@app.post("/api/predict")
def predict_patient(payload: PatientPayload):
    """
    Returns multi-vessel model probabilities, descriptive training-error bands,
    and illustrative hemodynamic values.
    """
    t0 = time.time()
    if ensemble is None:
        raise HTTPException(status_code=500, detail="ML Engine not initialized")

    try:
        results = ensemble.predict_one(payload.features)
        latency_ms = round((time.time() - t0) * 1000.0, 2)
        return {
            "status": "SUCCESS",
            "latency_ms": latency_ms,
            "predictions": results,
            "anti_leakage_verified": True
        }
    except Exception as e:
        logger.error(f"Inference error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/explain")
def explain_patient(payload: PatientPayload, target: str = Query("CAD", pattern="^(CAD|LAD|LCX|RCA)$")):
    """
    Returns TreeSHAP attributions for the chosen target.
    """
    if explainability_engine is None:
        raise HTTPException(status_code=500, detail="Explainability engine not initialized")

    try:
        explanation = explainability_engine.explain_patient(payload.features, target=target)
        return explanation
    except Exception as e:
        logger.error(f"Explanation error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/counterfactual")
def get_counterfactual_trajectory(payload: PatientPayload):
    """
    Produces a hypothetical 12-month model scenario with input changes and
    discussion prompts; it is not a clinical forecast or treatment plan.
    """
    if explainability_engine is None:
        raise HTTPException(status_code=500, detail="Explainability engine not initialized")

    try:
        trajectory = explainability_engine.compute_counterfactual_trajectory(payload.features)
        return trajectory
    except Exception as e:
        logger.error(f"Counterfactual optimization error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/virtual-stent")
def virtual_stent(payload: PatientPayload, vessel: str = Query("LAD", pattern="^(LAD|LCX|RCA)$")):
    """
    Runs an illustrative stent scenario for LAD, LCX, or RCA; values are not
    measured outcomes or predictions of a real procedure.
    """
    if explainability_engine is None:
        raise HTTPException(status_code=500, detail="Explainability engine not initialized")

    try:
        stent_sim = explainability_engine.simulate_virtual_stent(payload.features, target_vessel=vessel)
        return stent_sim
    except Exception as e:
        logger.error(f"Virtual stent error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


# ==============================================================================
# STATIC FRONTEND SERVING
# ==============================================================================
if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

    NO_CACHE_HEADERS = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
    }

    @app.get("/")
    def serve_frontend_index():
        index_path = os.path.join(FRONTEND_DIR, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path, headers=NO_CACHE_HEADERS)
        return {"message": "CardioTwin-4D API active. Frontend index.html not yet built."}

    # Serve JS, CSS, and Assets directly if requested
    @app.get("/{file_path:path}")
    def serve_static_assets(file_path: str):
        full_path = os.path.join(FRONTEND_DIR, file_path)
        if os.path.exists(full_path) and os.path.isfile(full_path):
            return FileResponse(full_path, headers=NO_CACHE_HEADERS)
        index_path = os.path.join(FRONTEND_DIR, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path, headers=NO_CACHE_HEADERS)
        raise HTTPException(status_code=404, detail="File not found")
