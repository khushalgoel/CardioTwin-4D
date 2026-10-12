"""
CardioTwin-4D: Machine Learning Pipeline & Strict Anti-Leakage Clinical Engine
Track A: Cardiovascular Risk Visualization & Prediction
IIT Mandi AI Multimodal Hackathon
"""

import os
import io
import json
import logging
import urllib.request
import zipfile
import numpy as np
import pandas as pd
from typing import Dict, Tuple, List, Any
import joblib

from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier, VotingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, brier_score_loss, confusion_matrix, roc_curve
)
from sklearn.linear_model import LogisticRegression

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("CardioTwin.MLPipeline")

# Base paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
MODELS_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

CSV_FILEPATH = os.path.join(DATA_DIR, "z_alizadeh_sani_ext.csv")
METRICS_FILEPATH = os.path.join(MODELS_DIR, "metrics.json")
MODEL_ARTIFACT_PATH = os.path.join(MODELS_DIR, "cardiotwin_models.joblib")

# ==============================================================================
# 2.1 STRICT ANTI-LEAKAGE PROTOCOL
# ==============================================================================
FORBIDDEN_LEAKAGE_COLS = ["Cath", "CAD", "LAD", "LCX", "RCA"]

def verify_anti_leakage(df_features: pd.DataFrame, stage: str = "Training") -> bool:
    """
    Check that target and catheterization columns are absent from the feature matrix.
    """
    leaked = [col for col in FORBIDDEN_LEAKAGE_COLS if col in df_features.columns]
    banner = f"""
    ======================================================================
    🛡️ CARDIOTWIN-4D ANTI-DATA-LEAKAGE SECURITY AUDIT [{stage.upper()}]
    ----------------------------------------------------------------------
    Forbidden Target Columns : {FORBIDDEN_LEAKAGE_COLS}
    Features Evaluated Count : {len(df_features.columns)}
    Forbidden Columns Found  : {leaked if leaked else 'NONE'}
    Feature Check Status     : {'PASSED' if not leaked else 'FAILED - ABORTING!'}
    ======================================================================
    """
    print(banner)
    if leaked:
        raise ValueError(f"HARD LEAKAGE GUARD VIOLATION: Found forbidden target columns in feature matrix: {leaked}")
    return True


# ==============================================================================
# DATASET ACQUISITION & ANATOMICAL EXTENSION GENERATION
# ==============================================================================
def acquire_dataset() -> pd.DataFrame:
    """
    Loads the local cohort or downloads and validates the UCI dataset.

    Training stops if the real dataset cannot be loaded; synthetic or inferred
    labels must not be presented as cohort ground truth.
    """
    if os.path.exists(CSV_FILEPATH):
        logger.info(f"Loading existing dataset from {CSV_FILEPATH}")
        return clean_and_extend_dataset(pd.read_csv(CSV_FILEPATH))

    logger.info("Fetching official UCI Extension of Z-Alizadeh Sani benchmark (UCI Dataset 411)...")
    uci_url = "https://archive.ics.uci.edu/static/public/411/extention+of+z+alizadeh+sani+dataset.zip"

    try:
        req = urllib.request.Request(uci_url, headers={"User-Agent": "CardioTwin-4D-Client/1.0"})
        with urllib.request.urlopen(req, timeout=12) as response:
            zip_bytes = response.read()
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            excel_name = [n for n in zf.namelist() if n.endswith(".xlsx") or n.endswith(".xls")][0]
            with zf.open(excel_name) as f:
                df_raw = pd.read_excel(f)
        logger.info(f"Successfully downloaded official UCI 411 dataset with {len(df_raw)} records and columns: {list(df_raw.columns)}.")
    except Exception as e:
        logger.error("Unable to download the UCI dataset; no local cohort is available.")
        raise RuntimeError(
            "Training requires the real UCI dataset. Download it or place a validated "
            f"cohort at {CSV_FILEPATH}; training on generated data is disabled."
        ) from e

    # Standardize column names and labels before persisting the downloaded data.
    df_clean = clean_and_extend_dataset(df_raw)
    df_clean.to_csv(CSV_FILEPATH, index=False)
    logger.info(f"Persisted standardized extended dataset to {CSV_FILEPATH} (Shape: {df_clean.shape})")
    return df_clean


def clean_and_extend_dataset(df: pd.DataFrame) -> pd.DataFrame:
    """
    Standardizes columns and categorical values without manufacturing target labels.
    """
    # Trim whitespace in column names
    df.columns = [c.strip() for c in df.columns]

    required_targets = {"Cath", "LAD", "LCX", "RCA"}
    missing_targets = sorted(required_targets - set(df.columns))
    if missing_targets:
        raise ValueError(
            "Dataset is missing required ground-truth columns "
            f"{missing_targets}; target labels will not be inferred."
        )

    cath = df["Cath"].astype("string").str.strip().str.casefold()
    invalid_cath = cath.isna() | ~cath.isin({"cad", "normal"})
    if invalid_cath.any():
        values = df.loc[invalid_cath, "Cath"].unique().tolist()
        raise ValueError(f"Unexpected or missing Cath labels: {values}")
    df["CAD"] = cath.eq("cad").astype(int)

    # Standardize binary columns & ground-truth vessel targets
    binary_maps = {
        "Sex": {"Male": 1, "Fmale": 0, "Female": 0, "male": 1, "female": 0, "M": 1, "F": 0, 1: 1, 0: 0},
        "LAD": {"Stenotic": 1, "Normal": 0, "1": 1, "0": 0, 1: 1, 0: 0},
        "LCX": {"Stenotic": 1, "Normal": 0, "1": 1, "0": 0, 1: 1, 0: 0},
        "RCA": {"Stenotic": 1, "Normal": 0, "1": 1, "0": 0, 1: 1, 0: 0},
        "DM": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "HTN": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "Current Smoker": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "EX-Smoker": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "FH": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "Obesity": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "CRF": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "CVA": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "Airway disease": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "Thyroid Disease": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "CHF": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "DLP": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "Edema": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "Weak Peripheral Pulse": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "Lung rales": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "Systolic Murmur": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "Diastolic Murmur": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "Typical Chest Pain": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "Dyspnea": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "Atypical": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "Nonanginal": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "Exertional CP": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "LowTH Ang": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "Q Wave": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "St Elevation": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "St Depression": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "Tinversion": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "LVH": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "Poor R Progression": {"Y": 1, "N": 0, 1: 1, 0: 0},
        "BBB": {"Y": 1, "N": 0, 1: 1, 0: 0, "LBBB": 1, "RBBB": 1},
        "VHD": {
            "Normal": 0, "Mild": 1, "Moderate": 2, "Severe": 3, "N": 0, "Y": 1,
            "0": 0, "1": 1, "2": 2, "3": 3, 0: 0, 1: 1, 2: 2, 3: 3
        }
    }

    for col, mapping in binary_maps.items():
        if col in df.columns:
            mapped = df[col].map(
                lambda value: mapping.get(
                    str(value).strip(),
                    mapping.get(value),
                )
            )
            unknown = mapped.isna() & df[col].notna()
            if unknown.any():
                values = df.loc[unknown, col].unique().tolist()
                raise ValueError(f"Unexpected {col} category values: {values}")
            if col in {"LAD", "LCX", "RCA"} and mapped.isna().any():
                values = df.loc[mapped.isna(), col].unique().tolist()
                raise ValueError(f"Unexpected or missing {col} ground-truth labels: {values}")
            df[col] = pd.to_numeric(mapped, errors="coerce").fillna(0).astype(int)

    # Ensure numeric types for continuous measurements
    numeric_cols = [
        "Age", "Weight", "Length", "BMI", "BP", "PR", "FBS", "CR", "TG",
        "LDL", "HDL", "BUN", "ESR", "HB", "K", "Na", "WBC", "Lymph", "Neut",
        "PLT", "EF-TTE", "Region RWMA"
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(df[col].median() if col in df else 0)

    # Standardize column alias: "Region RWMA" -> "Region with RWMA"
    if "Region RWMA" in df.columns and "Region with RWMA" not in df.columns:
        df["Region with RWMA"] = df["Region RWMA"]

    # Cath column string
    df["Cath"] = df["CAD"].apply(lambda x: "Cad" if x == 1 else "Normal")

    return df


# ==============================================================================
# 2.3 PHYSIOLOGICAL FEATURE ENGINEERING (DOMAIN-INFORMED PRIORS)
# ==============================================================================
def compute_physiological_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes 5 clinically-grounded composite biomarker features:
    1. Atherogenic_Index = log10(TG / max(HDL, 1))
    2. LDL_HDL_Ratio = LDL / max(HDL, 1)
    3. Rate_Pressure_Product = (BP * PR) / 100
    4. Electrical_Ischemia_Score = St_Elevation*2 + St_Depression*1.5 + Tinversion*1.5 + Q_Wave*1.5 + Poor_R_Progression
    5. Mechanical_Pump_Deficit = (60 - EF_TTE) * (1 + 0.5 * Region_with_RWMA)
    """
    df_out = df.copy()

    def numeric_column(name: str, default: float) -> pd.Series:
        values = df_out[name] if name in df_out.columns else pd.Series(default, index=df_out.index)
        return pd.to_numeric(values, errors="coerce").fillna(default)

    # 1. Atherogenic Index of Plasma (AIP)
    tg_val = numeric_column("TG", 150.0)
    hdl_val = numeric_column("HDL", 45.0).clip(lower=1.0)
    df_out["Atherogenic_Index"] = np.log10(np.clip(tg_val / hdl_val, 0.01, 100.0))

    # 2. LDL / HDL Ratio
    ldl_val = numeric_column("LDL", 100.0)
    df_out["LDL_HDL_Ratio"] = ldl_val / hdl_val

    # 3. Rate Pressure Product (RPP) - myocardial oxygen consumption (MVO2) proxy
    bp_val = numeric_column("BP", 120.0)
    pr_val = numeric_column("PR", 75.0)
    df_out["Rate_Pressure_Product"] = (bp_val * pr_val) / 100.0

    # 4. Electrical Ischemia Composite Score
    st_elev = numeric_column("St Elevation", 0.0)
    st_dep = numeric_column("St Depression", 0.0)
    t_inv = numeric_column("Tinversion", 0.0)
    q_w = numeric_column("Q Wave", 0.0)
    poor_r = numeric_column("Poor R Progression", 0.0)
    df_out["Electrical_Ischemia_Score"] = (
        st_elev * 2.0 + st_dep * 1.5 + t_inv * 1.5 + q_w * 1.5 + poor_r * 1.0
    )

    # 5. Mechanical Pump Deficit (systolic dysfunction x wall akinesis)
    ef_val = numeric_column("EF-TTE", 55.0)
    rwma_val = numeric_column("Region with RWMA", 0.0)
    df_out["Mechanical_Pump_Deficit"] = (60.0 - ef_val).clip(lower=0.0) * (1.0 + 0.5 * rwma_val)

    return df_out


# ==============================================================================
# MODEL TRAINING & CROSS-VALIDATION SUITE
# ==============================================================================
TARGETS = ["LAD", "LCX", "RCA", "CAD"]

class CardioTwinEnsemble:
    """
    Calibrated Soft-Voting Gradient Boosted Ensemble with Anatomical Coupling
    and Conformal Uncertainty Bounds.
    """
    def __init__(self, feature_cols: List[str]):
        self.feature_cols = feature_cols
        self.scaler = StandardScaler()
        self.models: Dict[str, CalibratedClassifierCV] = {}
        self.uncalibrated_ensembles: Dict[str, VotingClassifier] = {}
        self.anatomical_stacker: LogisticRegression = None
        self.training_error_margins: Dict[str, float] = {}

    def fit(self, X: pd.DataFrame, y_dict: Dict[str, np.ndarray]):
        # Scale features
        X_scaled = self.scaler.fit_transform(X)

        # Train specialized ensemble for each target
        for target in ["LAD", "LCX", "RCA", "CAD"]:
            logger.info(f"Training ensemble for target: {target}...")
            # Base models
            gb = GradientBoostingClassifier(
                n_estimators=100, learning_rate=0.07, max_depth=3,
                subsample=0.85, random_state=42
            )
            rf = RandomForestClassifier(
                n_estimators=120, max_depth=5, min_samples_split=4,
                class_weight="balanced", random_state=42
            )
            ensemble = VotingClassifier(
                estimators=[("gb", gb), ("rf", rf)],
                voting="soft"
            )
            
            # Calibrated ensemble with 3-fold sigmoid calibration
            calibrated = CalibratedClassifierCV(estimator=ensemble, method="sigmoid", cv=3)
            calibrated.fit(X_scaled, y_dict[target])
            self.models[target] = calibrated

            # Also fit uncalibrated base ensemble for direct tree inspection / SHAP
            ensemble.fit(X_scaled, y_dict[target])
            self.uncalibrated_ensembles[target] = ensemble

        # Fit Anatomical Consistency Meta-Stacker for CAD:
        # P(CAD_anatomical) = 1 - (1 - P_LAD) * (1 - P_LCX) * (1 - P_RCA)
        p_lad = self.models["LAD"].predict_proba(X_scaled)[:, 1]
        p_lcx = self.models["LCX"].predict_proba(X_scaled)[:, 1]
        p_rca = self.models["RCA"].predict_proba(X_scaled)[:, 1]
        p_cad_raw = self.models["CAD"].predict_proba(X_scaled)[:, 1]
        p_noisy_or = 1.0 - (1.0 - p_lad) * (1.0 - p_lcx) * (1.0 - p_rca)

        # Meta features: raw model CAD probability + anatomical noisy-OR probability
        meta_X = np.column_stack([p_cad_raw, p_noisy_or])
        self.anatomical_stacker = LogisticRegression(C=1.0, random_state=42)
        self.anatomical_stacker.fit(meta_X, y_dict["CAD"])

        # These are descriptive training residuals, not calibrated prediction intervals.
        for target in TARGETS:
            preds = self.models[target].predict_proba(X_scaled)[:, 1]
            residuals = np.abs(y_dict[target] - preds)
            self.training_error_margins[target] = float(np.percentile(residuals, 90))

        logger.info("Ensemble training and anatomical coupling complete.")

    def predict_one(self, sample_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        Runs inference for a single patient state after checking for target leakage.
        """
        # Cleanse any raw target keys if passed in dictionary
        clean_dict = {k: v for k, v in sample_dict.items() if k not in FORBIDDEN_LEAKAGE_COLS}
        df_sample = pd.DataFrame([clean_dict])
        
        # Enforce Anti-Leakage Guard
        verify_anti_leakage(df_sample, stage="Inference")

        # Compute domain features
        df_feats = compute_physiological_features(df_sample)
        
        # Select exact feature columns in order
        X_sample = df_feats.reindex(columns=self.feature_cols, fill_value=0.0)
        X_scaled = self.scaler.transform(X_sample)

        # Vessel probabilities
        p_lad = float(self.models["LAD"].predict_proba(X_scaled)[0, 1])
        p_lcx = float(self.models["LCX"].predict_proba(X_scaled)[0, 1])
        p_rca = float(self.models["RCA"].predict_proba(X_scaled)[0, 1])
        p_cad_raw = float(self.models["CAD"].predict_proba(X_scaled)[0, 1])

        # Anatomical Noisy-OR
        p_noisy_or = float(1.0 - (1.0 - p_lad) * (1.0 - p_lcx) * (1.0 - p_rca))

        # Stacker anatomical CAD probability
        meta_X = np.array([[p_cad_raw, p_noisy_or]])
        p_cad_coupled = float(self.anatomical_stacker.predict_proba(meta_X)[0, 1])

        # Ensure mathematical consistency: CAD prob cannot be lower than individual vessels
        max_vessel = max(p_lad, p_lcx, p_rca)
        p_cad = max(p_cad_coupled, max_vessel * 0.98)

        # Conformal uncertainty bounds & Ambiguity flags
        results = {}
        for tgt, p_val in [("LAD", p_lad), ("LCX", p_lcx), ("RCA", p_rca), ("CAD", p_cad)]:
            margin = self.training_error_margins.get(tgt, 0.12)
            p_low = max(0.01, p_val - margin)
            p_high = min(0.99, p_val + margin)
            
            # Ambiguity flag: borderline if probability is between 0.38 and 0.62
            ambiguity = "BORDERLINE_CLINICAL_REVIEW" if 0.38 <= p_val <= 0.62 else "HIGH_CONFIDENCE"

            # 1D Hemodynamic Poiseuille & Virtual FFR
            # d_v = 1 - 0.72 * (P_v)^1.25
            lumen_ratio = max(0.15, 1.0 - 0.72 * (p_val ** 1.25))
            # vFFR_v = clip(1.0 - 0.52 * (P_v)^1.4, 0.42, 0.99)
            v_ffr = float(np.clip(1.0 - 0.52 * (p_val ** 1.4), 0.42, 0.99))
            # Peak jet velocity multiplier V_jet = 1 / max(d_v^2, 0.18)
            v_jet = float(1.0 / max(lumen_ratio ** 2, 0.18))

            results[tgt] = {
                "probability": round(p_val, 4),
                "percent": round(p_val * 100.0, 1),
                "training_error_band": [round(p_low, 4), round(p_high, 4)],
                "training_error_band_percent": [round(p_low * 100.0, 1), round(p_high * 100.0, 1)],
                "ambiguity_flag": ambiguity,
                "lumen_diameter_ratio": round(lumen_ratio, 3),
                "lumen_open_percent": round(lumen_ratio * 100.0, 1),
                "vffr": round(v_ffr, 2),
                "peak_jet_velocity_multiplier": round(v_jet, 2),
                "ischemia_significant": bool(v_ffr < 0.80)
            }

        return results


def load_ensemble() -> Tuple[CardioTwinEnsemble, Dict[str, Any]]:
    """Loads the serialized ensemble and artifact dictionary."""
    if not os.path.exists(MODEL_ARTIFACT_PATH):
        raise FileNotFoundError(f"Model artifact not found at {MODEL_ARTIFACT_PATH}")
    artifacts = joblib.load(MODEL_ARTIFACT_PATH)
    ens = CardioTwinEnsemble(artifacts["feature_cols"])
    ens.models = artifacts["models"]
    ens.uncalibrated_ensembles = artifacts["uncalibrated_ensembles"]
    ens.scaler = artifacts["scaler"]
    ens.anatomical_stacker = artifacts["anatomical_stacker"]
    ens.training_error_margins = artifacts.get(
        "training_error_margins",
        artifacts.get("conformal_bounds", {}),
    )
    return ens, artifacts


def run_cross_validation_and_train():
    """
    Executes full 5-Fold Stratified Cross-Validation on the dataset,
    computes all clinical metrics, produces models/metrics.json, and serializes
    the production model artifacts.
    """
    df = acquire_dataset()
    logger.info(f"Loaded dataset: {df.shape[0]} patients, {df.shape[1]} columns.")

    # Apply physiological feature engineering to training set
    df_engineered = compute_physiological_features(df)

    # Separate target variables
    y_dict = {
        "CAD": df_engineered["CAD"].values.astype(int),
        "LAD": df_engineered["LAD"].values.astype(int),
        "LCX": df_engineered["LCX"].values.astype(int),
        "RCA": df_engineered["RCA"].values.astype(int)
    }

    # Strict Anti-Leakage Feature Extraction
    feature_df = df_engineered.drop(columns=[col for col in FORBIDDEN_LEAKAGE_COLS if col in df_engineered.columns])
    verify_anti_leakage(feature_df, stage="Cross-Validation-Setup")

    # Keep only numeric features
    feature_cols = [c for c in feature_df.columns if np.issubdtype(feature_df[c].dtype, np.number)]
    X = feature_df[feature_cols].copy()

    logger.info(f"Training on {len(feature_cols)} clean features: {feature_cols}")

    # 5-Fold Stratified Cross-Validation Suite
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    metrics_summary = {}

    for target in TARGETS:
        logger.info(f"Running 5-Fold Stratified CV for {target}...")
        y = y_dict[target]
        fold_accs, fold_precs, fold_recs, fold_f1s, fold_aucs, fold_briers = [], [], [], [], [], []
        y_true_all, y_pred_prob_all = [], []

        for train_idx, val_idx in skf.split(X, y):
            X_train, X_val = X.iloc[train_idx], X.iloc[val_idx]
            y_train, y_val = y[train_idx], y[val_idx]

            scaler = StandardScaler()
            X_tr_s = scaler.fit_transform(X_train)
            X_vl_s = scaler.transform(X_val)

            gb = GradientBoostingClassifier(n_estimators=100, learning_rate=0.07, max_depth=3, random_state=42)
            rf = RandomForestClassifier(n_estimators=100, max_depth=5, class_weight="balanced", random_state=42)
            ens = VotingClassifier(estimators=[("gb", gb), ("rf", rf)], voting="soft")
            cal = CalibratedClassifierCV(estimator=ens, method="sigmoid", cv=3)

            cal.fit(X_tr_s, y_train)
            val_probs = cal.predict_proba(X_vl_s)[:, 1]
            val_preds = (val_probs >= 0.5).astype(int)

            fold_accs.append(accuracy_score(y_val, val_preds))
            fold_precs.append(precision_score(y_val, val_preds, zero_division=0))
            fold_recs.append(recall_score(y_val, val_preds, zero_division=0))
            fold_f1s.append(f1_score(y_val, val_preds, zero_division=0))
            fold_aucs.append(roc_auc_score(y_val, val_probs))
            fold_briers.append(brier_score_loss(y_val, val_probs))

            y_true_all.extend(y_val.tolist())
            y_pred_prob_all.extend(val_probs.tolist())

        # Overall ROC curve coordinates for frontend plotting
        fpr, tpr, _ = roc_curve(y_true_all, y_pred_prob_all)
        cm = confusion_matrix(y_true_all, (np.array(y_pred_prob_all) >= 0.5).astype(int)).tolist()

        metrics_summary[target] = {
            "accuracy": round(float(np.mean(fold_accs)), 4),
            "precision": round(float(np.mean(fold_precs)), 4),
            "recall": round(float(np.mean(fold_recs)), 4),
            "f1_score": round(float(np.mean(fold_f1s)), 4),
            "roc_auc": round(float(np.mean(fold_aucs)), 4),
            "brier_score": round(float(np.mean(fold_briers)), 4),
            "confusion_matrix": cm,
            "roc_curve": {
                "fpr": [round(float(x), 4) for x in fpr[::max(1, len(fpr)//25)]],
                "tpr": [round(float(x), 4) for x in tpr[::max(1, len(tpr)//25)]]
            }
        }
        logger.info(
            f"[{target}] 5-Fold CV -> Acc: {metrics_summary[target]['accuracy']:.3f}, "
            f"F1: {metrics_summary[target]['f1_score']:.3f}, "
            f"ROC-AUC: {metrics_summary[target]['roc_auc']:.3f}"
        )

    # Save metrics.json
    metrics_payload = {
        "dataset_name": "Extension of Z-Alizadeh Sani Cohort",
        "cohort_size": int(len(df)),
        "cross_validation": "Stratified 5-Fold CV",
        "anti_leakage_guard": "STRICT_ACTIVE",
        "forbidden_leakage_columns_excluded": FORBIDDEN_LEAKAGE_COLS,
        "uncertainty_method": "90th-percentile in-sample training residual; not a calibrated prediction interval",
        "targets": metrics_summary
    }
    with open(METRICS_FILEPATH, "w") as f:
        json.dump(metrics_payload, f, indent=2)
    logger.info(f"Saved evaluation suite metrics to {METRICS_FILEPATH}")

    # Train final production ensemble on all clean data
    final_ensemble = CardioTwinEnsemble(feature_cols)
    final_ensemble.fit(X, y_dict)

    # Serialize production artifacts dictionary containing standard sklearn models
    artifacts = {
        "models": final_ensemble.models,
        "uncalibrated_ensembles": final_ensemble.uncalibrated_ensembles,
        "scaler": final_ensemble.scaler,
        "anatomical_stacker": final_ensemble.anatomical_stacker,
        "training_error_margins": final_ensemble.training_error_margins,
        "feature_cols": feature_cols,
        "training_means": X.mean().to_dict(),
        "training_stds": X.std().to_dict()
    }
    joblib.dump(artifacts, MODEL_ARTIFACT_PATH)
    logger.info(f"Successfully serialized production model artifacts to {MODEL_ARTIFACT_PATH}")

    return final_ensemble, metrics_payload


if __name__ == "__main__":
    run_cross_validation_and_train()
