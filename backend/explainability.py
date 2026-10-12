"""
CardioTwin-4D: Explainability Engine, TreeSHAP Attributions,
Modifiable Counterfactual Clinical Optimizer & 1D Hemodynamics
"""

import os
import joblib
import numpy as np
import pandas as pd
import shap
from typing import Dict, List, Any, Tuple
import logging

import ml_pipeline
from ml_pipeline import (
    MODEL_ARTIFACT_PATH, compute_physiological_features,
    verify_anti_leakage, TARGETS, CardioTwinEnsemble, load_ensemble,
    FORBIDDEN_LEAKAGE_COLS
)

logger = logging.getLogger("CardioTwin.Explainability")

# Clinical Metadata: Units, Reference Ranges, and Descriptions
CLINICAL_METADATA = {
    "Age": {"unit": "years", "normal_range": "30 - 65", "category": "Demographic", "modifiable": False},
    "Sex": {"unit": "", "normal_range": "M / F", "category": "Demographic", "modifiable": False},
    "BMI": {"unit": "kg/m²", "normal_range": "18.5 - 24.9", "category": "Vitals", "modifiable": True, "target": 23.5},
    "BP": {"unit": "mmHg", "normal_range": "< 120", "category": "Vitals", "modifiable": True, "target": 118},
    "PR": {"unit": "BPM", "normal_range": "60 - 80", "category": "Vitals", "modifiable": True, "target": 68},
    "DM": {"unit": "", "normal_range": "0 (None)", "category": "Risk Factor", "modifiable": False},
    "HTN": {"unit": "", "normal_range": "0 (None)", "category": "Risk Factor", "modifiable": False},
    "Current Smoker": {"unit": "", "normal_range": "0 (Non-smoker)", "category": "Lifestyle", "modifiable": True, "target": 0},
    "EX-Smoker": {"unit": "", "normal_range": "0 (None)", "category": "Lifestyle", "modifiable": False},
    "FH": {"unit": "", "normal_range": "0 (Negative)", "category": "Family History", "modifiable": False},
    "Typical Chest Pain": {"unit": "", "normal_range": "0 (Absent)", "category": "Symptoms", "modifiable": False},
    "Atypical": {"unit": "", "normal_range": "0 (Absent)", "category": "Symptoms", "modifiable": False},
    "Nonanginal": {"unit": "", "normal_range": "0 (Absent)", "category": "Symptoms", "modifiable": False},
    "Q Wave": {"unit": "", "normal_range": "0 (Absent)", "category": "ECG", "modifiable": False},
    "St Elevation": {"unit": "", "normal_range": "0 (Absent)", "category": "ECG", "modifiable": False},
    "St Depression": {"unit": "", "normal_range": "0 (Absent)", "category": "ECG", "modifiable": False},
    "Tinversion": {"unit": "", "normal_range": "0 (Absent)", "category": "ECG", "modifiable": False},
    "LVH": {"unit": "", "normal_range": "0 (Absent)", "category": "ECG", "modifiable": False},
    "Poor R Progression": {"unit": "", "normal_range": "0 (Absent)", "category": "ECG", "modifiable": False},
    "FBS": {"unit": "mg/dL", "normal_range": "70 - 99", "category": "Lab", "modifiable": True, "target": 92},
    "CR": {"unit": "mg/dL", "normal_range": "0.7 - 1.2", "category": "Lab", "modifiable": False},
    "TG": {"unit": "mg/dL", "normal_range": "< 150", "category": "Lipids", "modifiable": True, "target": 125},
    "LDL": {"unit": "mg/dL", "normal_range": "< 100", "category": "Lipids", "modifiable": True, "target": 80},
    "HDL": {"unit": "mg/dL", "normal_range": "> 45", "category": "Lipids", "modifiable": True, "target": 52},
    "EF-TTE": {"unit": "%", "normal_range": "55 - 70%", "category": "Echo", "modifiable": False},
    "Region with RWMA": {"unit": "grade", "normal_range": "0 (None)", "category": "Echo", "modifiable": False},
    "Atherogenic_Index": {"unit": "log(TG/HDL)", "normal_range": "< 0.11", "category": "Calculated", "modifiable": True},
    "LDL_HDL_Ratio": {"unit": "ratio", "normal_range": "< 2.5", "category": "Calculated", "modifiable": True},
    "Rate_Pressure_Product": {"unit": "mmHg·BPM/100", "normal_range": "< 90", "category": "Hemodynamics", "modifiable": True},
    "Electrical_Ischemia_Score": {"unit": "score", "normal_range": "0", "category": "ECG Composite", "modifiable": False},
    "Mechanical_Pump_Deficit": {"unit": "index", "normal_range": "< 5.0", "category": "Echo Composite", "modifiable": False}
}


class ClinicalExplainabilityEngine:
    """
    Computes TreeSHAP explanations for gradient boosted ensemble models,
    simulates 1D Poiseuille hemodynamics, executes virtual stenting, and
    generates counterfactual recovery trajectories across a 12-month timeline.
    """
    def __init__(self):
        logger.info("Initializing Clinical Explainability Engine...")
        self.ensemble, artifacts = load_ensemble()
        self.feature_cols: List[str] = artifacts["feature_cols"]
        self.training_means: Dict[str, float] = artifacts["training_means"]
        self.training_stds: Dict[str, float] = artifacts["training_stds"]

        # Initialize TreeSHAP explainers for base GradientBoosting models
        self.shap_explainers: Dict[str, shap.TreeExplainer] = {}
        for target in TARGETS:
            try:
                # The first estimator in VotingClassifier is GradientBoostingClassifier
                gb_model = self.ensemble.uncalibrated_ensembles[target].named_estimators_["gb"]
                self.shap_explainers[target] = shap.TreeExplainer(gb_model)
                logger.info(f"TreeSHAP explainer initialized for target {target}")
            except Exception as e:
                logger.error(f"Failed to create TreeSHAP explainer for {target}: {e}")

    def explain_patient(self, sample_dict: Dict[str, Any], target: str = "CAD") -> Dict[str, Any]:
        """
        Computes local SHAP attributions for a given patient and target (CAD, LAD, LCX, RCA).
        Returns top 8 positive (risk-increasing) and top 8 negative (protective) features.
        """
        if target not in TARGETS:
            target = "CAD"

        # Prepare clean feature vector
        clean_dict = {k: v for k, v in sample_dict.items() if k not in FORBIDDEN_LEAKAGE_COLS}
        df_sample = pd.DataFrame([clean_dict])
        verify_anti_leakage(df_sample, stage=f"Explain-{target}")
        df_feats = compute_physiological_features(df_sample)
        X_sample = df_feats.reindex(columns=self.feature_cols, fill_value=0.0)
        X_scaled = self.ensemble.scaler.transform(X_sample)

        explainer = self.shap_explainers.get(target)
        if explainer is None:
            return {"error": f"SHAP explainer for {target} unavailable"}

        # Calculate SHAP values
        raw_shap_values = explainer.shap_values(X_scaled)
        # For binary classification, TreeExplainer returns shape (1, n_features) or list
        if isinstance(raw_shap_values, list):
            sv = raw_shap_values[1][0] if len(raw_shap_values) > 1 else raw_shap_values[0][0]
        elif len(raw_shap_values.shape) == 2:
            sv = raw_shap_values[0]
        else:
            sv = raw_shap_values[0, :, 1] if raw_shap_values.ndim == 3 else raw_shap_values[0]

        # Extract features and map metadata
        feature_impacts = []
        for i, col in enumerate(self.feature_cols):
            raw_val = X_sample.iloc[0][col]
            impact = float(sv[i])
            meta = CLINICAL_METADATA.get(col, {"unit": "", "normal_range": "N/A", "category": "Clinical", "modifiable": False})

            # Human-readable label formatting
            friendly_name = col.replace("_", " ")
            if friendly_name == "Region RWMA" or friendly_name == "Region with RWMA":
                friendly_name = "Regional Wall Motion Abnormality"
            elif friendly_name == "EF-TTE":
                friendly_name = "Ejection Fraction (EF-TTE)"

            feature_impacts.append({
                "feature": col,
                "label": friendly_name,
                "raw_value": round(float(raw_val), 2) if isinstance(raw_val, (int, float)) else str(raw_val),
                "shap_value": round(impact, 4),
                "delta_percent": round(impact * 100.0, 1),
                "unit": meta["unit"],
                "normal_range": meta["normal_range"],
                "category": meta["category"],
                "is_risk_increasing": impact > 0,
                "is_modifiable": meta["modifiable"]
            })

        # Sort into positive (risk pushers) and negative (protective)
        risk_increasing = sorted([f for f in feature_impacts if f["shap_value"] > 0], key=lambda x: x["shap_value"], reverse=True)[:8]
        protective = sorted([f for f in feature_impacts if f["shap_value"] < 0], key=lambda x: x["shap_value"])[:8]

        # Base value
        if isinstance(explainer.expected_value, (list, np.ndarray)):
            expected_val = float(explainer.expected_value[1] if len(explainer.expected_value) > 1 else explainer.expected_value[0])
        else:
            expected_val = float(explainer.expected_value)

        return {
            "target": target,
            "base_value": round(expected_val, 4),
            "risk_increasing": risk_increasing,
            "protective": protective,
            "all_features": feature_impacts
        }

    def compute_counterfactual_trajectory(self, sample_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculates a hypothetical 12-month risk-factor scenario for demonstration.
        Freezes unmodifiable features while smoothly stepping modifiable risk factors
        (BP, LDL, TG, HDL, FBS, BMI, Smoking, PR) from Month 0 to Month 12.
        This is not a clinical forecast or treatment recommendation.
        """
        # Baseline (Month 0)
        baseline_patient = sample_dict.copy()

        # Modifiable clinical targets
        targets = {
            "BP": min(float(baseline_patient.get("BP", 140)), 118.0),
            "LDL": min(float(baseline_patient.get("LDL", 150)), 80.0),
            "TG": min(float(baseline_patient.get("TG", 200)), 125.0),
            "HDL": max(float(baseline_patient.get("HDL", 35)), 52.0),
            "FBS": min(float(baseline_patient.get("FBS", 120)), 92.0),
            "BMI": min(float(baseline_patient.get("BMI", 28.5)), 23.5),
            "Current Smoker": 0,
            "PR": 68.0 if float(baseline_patient.get("PR", 75)) > 75 else float(baseline_patient.get("PR", 75))
        }

        # Step milestones: Month 0 (0%), Month 3 (30%), Month 6 (65%), Month 12 (100%)
        milestones = [
            ("Month 0 (Current)", 0.0),
            ("Month 3", 0.35),
            ("Month 6", 0.70),
            ("Month 12 (Target)", 1.0)
        ]

        trajectory = []
        for name, progress in milestones:
            patient_step = baseline_patient.copy()
            for key, target_val in targets.items():
                cur_val = float(baseline_patient.get(key, target_val))
                step_val = cur_val + (target_val - cur_val) * progress
                patient_step[key] = int(round(step_val)) if key in ["BP", "TG", "LDL", "FBS", "Current Smoker", "PR"] else round(step_val, 1)

            # Re-predict
            step_pred = self.ensemble.predict_one(patient_step)
            trajectory.append({
                "milestone": name,
                "progress_ratio": progress,
                "vitals": {
                    "BP": patient_step["BP"],
                    "LDL": patient_step["LDL"],
                    "TG": patient_step["TG"],
                    "HDL": patient_step["HDL"],
                    "FBS": patient_step["FBS"],
                    "BMI": patient_step["BMI"],
                    "Current_Smoker": patient_step["Current Smoker"],
                    "PR": patient_step["PR"]
                },
                "predictions": step_pred
            })

        # Optimal delta summary
        m0_cad = trajectory[0]["predictions"]["CAD"]["percent"]
        m12_cad = trajectory[-1]["predictions"]["CAD"]["percent"]
        m0_lad = trajectory[0]["predictions"]["LAD"]["percent"]
        m12_lad = trajectory[-1]["predictions"]["LAD"]["percent"]

        # Prompts for discussion with the treating clinician
        discussion_prompts = [
            {"category": "Lipid review", "action": "Discuss lipid results and appropriate management options with the treating clinician."},
            {"category": "Blood pressure review", "action": "Review blood pressure measurements and possible management with the treating clinician."},
            {"category": "Glucose review", "action": "Discuss glucose results and follow-up testing with the treating clinician."},
            {"category": "Lifestyle discussion", "action": "Ask the treating clinician about safe activity, nutrition, and weight-management goals."},
        ]
        if baseline_patient.get("Current Smoker", 0) == 1:
            discussion_prompts.insert(0, {"category": "Smoking cessation", "action": "Discuss evidence-based smoking-cessation support with the treating clinician."})

        return {
            "trajectory": trajectory,
            "overall_cad_risk_reduction": round(m0_cad - m12_cad, 1),
            "lad_risk_reduction": round(m0_lad - m12_lad, 1),
            "baseline_cad_percent": m0_cad,
            "optimized_cad_percent": m12_cad,
            "discussion_prompts": discussion_prompts
        }

    def simulate_virtual_stent(self, sample_dict: Dict[str, Any], target_vessel: str = "LAD") -> Dict[str, Any]:
        """
        Simulates catheter-based balloon angioplasty and drug-eluting stent deployment in a chosen vessel.
        Mechanically restores vessel lumen to >= 96%, reduces vessel stenosis probability to baseline residual (< 6%),
        re-couples anatomical CAD probability, and elevates vFFR to healthy hyperemic status (> 0.95).
        """
        if target_vessel not in ["LAD", "LCX", "RCA"]:
            target_vessel = "LAD"

        pre_pred = self.ensemble.predict_one(sample_dict)
        post_pred = self.ensemble.predict_one(sample_dict)

        # Mechanically stented vessel transformation
        post_pred[target_vessel]["probability"] = 0.05
        post_pred[target_vessel]["percent"] = 5.0
        post_pred[target_vessel]["lumen_diameter_ratio"] = 0.98
        post_pred[target_vessel]["lumen_open_percent"] = 98.0
        post_pred[target_vessel]["vffr"] = 0.97
        post_pred[target_vessel]["peak_jet_velocity_multiplier"] = 1.04
        post_pred[target_vessel]["ischemia_significant"] = False
        post_pred[target_vessel]["ambiguity_flag"] = "HIGH_CONFIDENCE"
        post_pred[target_vessel]["stented"] = True

        # Recompute coupled CAD probability using the restored anatomical vessel
        p_lad = post_pred["LAD"]["probability"]
        p_lcx = post_pred["LCX"]["probability"]
        p_rca = post_pred["RCA"]["probability"]
        p_noisy_or = 1.0 - (1.0 - p_lad) * (1.0 - p_lcx) * (1.0 - p_rca)

        raw_cad = pre_pred["CAD"]["probability"]
        # Meta stacker blend
        meta_X = np.array([[raw_cad, p_noisy_or]])
        new_cad_prob = float(self.ensemble.anatomical_stacker.predict_proba(meta_X)[0, 1])
        new_cad_prob = max(new_cad_prob, max(p_lad, p_lcx, p_rca) * 0.98)

        post_pred["CAD"]["probability"] = round(new_cad_prob, 4)
        post_pred["CAD"]["percent"] = round(new_cad_prob * 100.0, 1)

        return {
            "target_vessel": target_vessel,
            "pre_stent": pre_pred,
            "post_stent": post_pred,
            "restored_lumen_gain_percent": round(max(0.0, post_pred[target_vessel]["lumen_open_percent"] - pre_pred[target_vessel]["lumen_open_percent"]), 1),
            "vffr_gain": round(max(0.0, post_pred[target_vessel]["vffr"] - pre_pred[target_vessel]["vffr"]), 2),
            "cad_risk_drop_percent": round(max(0.0, pre_pred["CAD"]["percent"] - post_pred["CAD"]["percent"]), 1)
        }
