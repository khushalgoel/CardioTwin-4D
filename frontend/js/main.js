/**
 * CARDIOTWIN-4D: CLINICAL WORKSTATION STATE CONTROLLER & ORCHESTRATOR
 * Track A: Cardiovascular Risk Visualization & Prediction
 * IIT Mandi AI Multimodal Hackathon
 */

document.addEventListener("DOMContentLoaded", () => {
  const AppState = {
    mode: "clinician", // "clinician" or "patient"
    activeVessel: "LAD",
    patient: {},
    predictions: {},
    counterfactualPlan: null,
    isStented: { LAD: false, LCX: false, RCA: false },
    archetypes: [],
    metrics: null,
    heart3d: null,
    ecg: null,
    debounceTimer: null
  };

  // Expose global active vessel selection for 3D raycasting
  window.selectActiveVessel = (vessel) => {
    setActiveVessel(vessel);
  };

  /* ==============================================================================
     21ST.DEV & FRAMER MOTION INTERACTIVE COMPONENT ENGINE
     ============================================================================== */
  function initSpotlightCards() {
    const cards = document.querySelectorAll('.glass-panel, .vessel-card, .cohort-selector-section, .cad-banner-section');
    cards.forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
        card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
      });
    });
  }

  function init21stMeteors() {
    const container = document.createElement('div');
    container.className = 'meteors-background';
    document.body.prepend(container);

    for (let i = 0; i < 14; i++) {
      const m = document.createElement('span');
      m.className = 'meteor-streak';
      m.style.top = `${Math.random() * 92}vh`;
      m.style.left = `${Math.random() * 95}vw`;
      m.style.animationDelay = `${Math.random() * 8}s`;
      m.style.animationDuration = `${3.5 + Math.random() * 4.5}s`;
      container.appendChild(m);
    }
  }

  function animateNumberTicker(element, targetVal, duration = 400, suffix = "%") {
    if (!element) return;
    const currentStr = element.textContent.replace(/[^0-9.]/g, "");
    const startVal = parseFloat(currentStr) || 0;
    const endVal = parseFloat(targetVal) || 0;
    if (Math.abs(startVal - endVal) < 0.05) {
      element.textContent = `${endVal.toFixed(1)}${suffix}`;
      return;
    }

    const startTime = performance.now();
    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      const cur = startVal + (endVal - startVal) * ease;
      element.textContent = `${cur.toFixed(1)}${suffix}`;
      if (progress < 1.0) {
        requestAnimationFrame(tick);
      } else {
        element.textContent = `${endVal.toFixed(1)}${suffix}`;
      }
    };
    requestAnimationFrame(tick);
  }

  function textDecodeEffect(element, finalHtml, duration = 380) {
    if (!element) return;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@*";
    const plainText = element.textContent || "Loading Patient Data...";
    const startTime = performance.now();

    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / duration;
      if (progress >= 1.0) {
        clearInterval(interval);
        element.innerHTML = finalHtml;
      } else {
        const scrambled = plainText.split("").map(c => {
          if (c === " " || Math.random() > 0.45) return c;
          return chars[Math.floor(Math.random() * chars.length)];
        }).join("");
        element.textContent = scrambled;
      }
    }, 40);
  }

  // Visual pulse synchronized with ICU Monitor Audio Beeps
  window.onCardiacBeatBeep = function() {
    const pulsar = document.querySelector('.heart-pulsar');
    if (pulsar) {
      pulsar.classList.remove('beep-flash');
      void pulsar.offsetWidth; // Force reflow
      pulsar.classList.add('beep-flash');
    }
    const latBadge = document.getElementById('telemetry-latency');
    if (latBadge) {
      latBadge.style.color = '#ffffff';
      latBadge.style.textShadow = '0 0 10px #ffffff';
      setTimeout(() => {
        latBadge.style.color = 'var(--cyan-bright)';
        latBadge.style.textShadow = 'none';
      }, 95);
    }
  };

  /* ==============================================================================
     1. INITIALIZATION & SETUP
     ============================================================================== */
  async function initApp() {
    console.log("Initializing CardioTwin-4D Clinical Workstation...");

    // 1. Initialize 3D Engine & ECG Monitor
    if (window.createHeart3D) {
      AppState.heart3d = window.createHeart3D("canvas-container");
    }
    if (window.createECGMonitor) {
      AppState.ecg = window.createECGMonitor("ecg-canvas");
    }

    // 2. Fetch Archetype Patients and 5-Fold Validation Metrics
    await loadArchetypes();
    await loadMetrics();

    // 3. Bind UI event listeners
    bindEventListeners();

    // 4. Initialize 21st.dev Spotlight & Meteors
    initSpotlightCards();
    init21stMeteors();

    // 5. Load the first cohort archetype
    if (AppState.archetypes.length > 0) {
      loadArchetypeById(AppState.archetypes[0].id);
    }
  }

  /* ==============================================================================
     2. API DATA LOADERS
     ============================================================================== */
  async function loadArchetypes() {
    try {
      const res = await fetch("/api/patients");
      const data = await res.json();
      AppState.archetypes = data.archetypes || [];

      // Populate Archetype Dropdown
      const selectEl = document.getElementById("archetype-select");
      if (selectEl && AppState.archetypes.length > 0) {
        selectEl.innerHTML = "";
        AppState.archetypes.forEach(arch => {
          const opt = document.createElement("option");
          opt.value = arch.id;
          opt.textContent = arch.label;
          selectEl.appendChild(opt);
        });
      }
    } catch (e) {
      console.error("Failed to load archetypes:", e);
    }
  }

  async function loadMetrics() {
    try {
      const res = await fetch("/api/metrics");
      AppState.metrics = await res.json();
      if (window.cardioCharts && AppState.metrics) {
        window.cardioCharts.renderValidationModal(AppState.metrics);
      }
    } catch (e) {
      console.error("Failed to load metrics:", e);
    }
  }

  function loadArchetypeById(id) {
    const arch = AppState.archetypes.find(a => a.id === Number(id));
    if (!arch) return;

    AppState.patient = { ...arch.features };
    AppState.isStented = { LAD: false, LCX: false, RCA: false };

    // Update patient info badge with 21st.dev decoder text effect
    const infoEl = document.getElementById("archetype-desc");
    if (infoEl) {
      textDecodeEffect(infoEl, `<strong>${arch.label}</strong>: ${arch.description}`);
    }

    // Sync input sliders & toggles
    syncControlsFromPatientState();

    // Run inference
    runInference(true);
  }

  /* ==============================================================================
     3. DEBOUNCED MODEL INFERENCE & SHAP SYNC
     ============================================================================== */
  function scheduleInference() {
    clearTimeout(AppState.debounceTimer);
    AppState.debounceTimer = setTimeout(() => {
      runInference(false);
    }, 40);
  }

  async function runInference(fetchShap = true) {
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features: AppState.patient })
      });
      const data = await res.json();
      if (data.status === "SUCCESS") {
        AppState.predictions = data.predictions;

        // Update UI components
        updateHeaderTelemetry(data.latency_ms);
        updateCadBanner();
        updateVesselCards();
        updateLumenInspector();

        // Update 3D Heart & ECG
        if (AppState.heart3d) {
          AppState.heart3d.updateState(AppState.predictions, AppState.patient);
        }
        if (AppState.ecg) {
          AppState.ecg.setBpm(AppState.patient.PR || 75);
          AppState.ecg.setFlags(AppState.patient);
        }

        // Fetch local TreeSHAP explanation for active vessel
        if (fetchShap) {
          fetchShapAttributions(AppState.activeVessel);
        }
      }
    } catch (e) {
      console.error("Inference error:", e);
    }
  }

  async function fetchShapAttributions(target) {
    try {
      const res = await fetch(`/api/explain?target=${target}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features: AppState.patient })
      });
      const explanation = await res.json();
      if (window.cardioCharts) {
        window.cardioCharts.renderShapWaterfall("shap-scroll-list", explanation);
      }
    } catch (e) {
      console.error("SHAP explanation error:", e);
    }
  }

  /* ==============================================================================
     4. UI SYNC & TELEMETRY UPDATERS
     ============================================================================== */
  function updateHeaderTelemetry(latencyMs) {
    const latEl = document.getElementById("telemetry-latency");
    if (latEl) latEl.textContent = `${latencyMs}ms`;

    const hrEl = document.getElementById("hud-val-hr");
    if (hrEl) hrEl.textContent = `${AppState.patient.PR || 75} BPM`;

    const efEl = document.getElementById("hud-val-ef");
    if (efEl) efEl.textContent = `${AppState.patient["EF-TTE"] || 55}%`;

    const rpp = Math.round(((AppState.patient.BP || 120) * (AppState.patient.PR || 75)) / 100);
    const rppEl = document.getElementById("hud-val-rpp");
    if (rppEl) rppEl.textContent = `${rpp.toLocaleString()}`;

    // Perfusion status
    const perfEl = document.getElementById("hud-val-perf");
    if (perfEl) {
      const ladCrit = AppState.predictions.LAD && AppState.predictions.LAD.probability >= 0.50;
      const rcaCrit = AppState.predictions.RCA && AppState.predictions.RCA.probability >= 0.50;
      const lcxCrit = AppState.predictions.LCX && AppState.predictions.LCX.probability >= 0.50;

      if (ladCrit && rcaCrit && lcxCrit) {
        perfEl.textContent = "TRIPLE-VESSEL ISCHEMIA";
        perfEl.className = "hud-telemetry-val crit";
      } else if (ladCrit) {
        perfEl.textContent = "ANTERIOR/SEPTAL ISCHEMIA";
        perfEl.className = "hud-telemetry-val crit";
      } else if (rcaCrit) {
        perfEl.textContent = "INFERIOR RV ISCHEMIA";
        perfEl.className = "hud-telemetry-val crit";
      } else if (lcxCrit) {
        perfEl.textContent = "LATERAL WALL ISCHEMIA";
        perfEl.className = "hud-telemetry-val crit";
      } else {
        perfEl.textContent = "NORMAL HOMOGENEOUS";
        perfEl.className = "hud-telemetry-val";
      }
    }
  }

  function updateCadBanner() {
    const cadObj = AppState.predictions.CAD;
    if (!cadObj) return;

    const probEl = document.getElementById("cad-prob-val");
    const gaugeBar = document.getElementById("cad-gauge-progress");
    const riskColor = cadObj.percent > 65 ? "var(--crimson-crit)" : (cadObj.percent > 35 ? "var(--amber-warn)" : "var(--emerald-bio)");

    if (probEl) {
      probEl.style.color = riskColor;
      animateNumberTicker(probEl, cadObj.percent);
    }

    if (gaugeBar) {
      const circum = 251.3;
      const offset = circum * (1.0 - Math.min(1.0, cadObj.percent / 100.0));
      gaugeBar.style.strokeDashoffset = `${offset}`;
      gaugeBar.style.stroke = riskColor;
    }

    const ciEl = document.getElementById("cad-ci-text");
    if (ciEl) {
      const [lower, upper] = cadObj.training_error_band_percent;
      ciEl.textContent = `Training-error range (not a confidence interval): [${lower}% - ${upper}%]`;
    }

    const tierEl = document.getElementById("cad-tier-badge");
    if (tierEl) {
      if (cadObj.percent >= 65) {
        tierEl.textContent = AppState.mode === "clinician" ? "HIGH MODEL-ESTIMATED RISK" : "MODEL FLAGS HIGHER RISK";
        tierEl.className = "cad-risk-tier-badge tier-critical";
      } else if (cadObj.percent >= 35) {
        tierEl.textContent = AppState.mode === "clinician" ? "INTERMEDIATE MODEL-ESTIMATED RISK" : "MODEL FLAGS INTERMEDIATE RISK";
        tierEl.className = "cad-risk-tier-badge tier-moderate";
      } else {
        tierEl.textContent = AppState.mode === "clinician" ? "LOWER MODEL-ESTIMATED RISK" : "MODEL FLAGS LOWER RISK";
        tierEl.className = "cad-risk-tier-badge tier-low";
      }
    }
  }

  function updateVesselCards() {
    ["LAD", "LCX", "RCA"].forEach(vessel => {
      const pred = AppState.predictions[vessel];
      if (!pred) return;

      const probEl = document.getElementById(`vessel-prob-${vessel}`);
      if (probEl) {
        probEl.style.color = pred.percent > 65 ? "var(--crimson-crit)" : (pred.percent > 35 ? "var(--amber-warn)" : "var(--emerald-bio)");
        animateNumberTicker(probEl, pred.percent);
      }

      const ffrEl = document.getElementById(`vessel-ffr-${vessel}`);
      if (ffrEl) {
        ffrEl.textContent = `vFFR: ${pred.vffr} ${pred.vffr < 0.80 ? '⚠️' : '✓'}`;
        ffrEl.style.color = pred.vffr < 0.80 ? "var(--crimson-crit)" : "var(--emerald-bio)";
      }

      const lumenEl = document.getElementById(`vessel-lumen-${vessel}`);
      if (lumenEl) {
        lumenEl.textContent = `Ø Open: ${pred.lumen_open_percent}%`;
      }
    });
  }

  function updateLumenInspector() {
    const vessel = AppState.activeVessel;
    const pred = AppState.predictions[vessel] || { probability: 0.15, lumen_diameter_ratio: 0.9, vffr: 0.95 };

    const titleEl = document.getElementById("lumen-title");
    if (titleEl) {
      const friendlyNames = {
        LAD: AppState.mode === "clinician" ? "LAD (Left Anterior Descending)" : "Front Heart Pipe (LAD)",
        LCX: AppState.mode === "clinician" ? "LCX (Left Circumflex)" : "Side Heart Pipe (LCX)",
        RCA: AppState.mode === "clinician" ? "RCA (Right Coronary Artery)" : "Back Heart Pipe (RCA)"
      };
      titleEl.textContent = friendlyNames[vessel];
    }

    const openEl = document.getElementById("lumen-open-text");
    if (openEl) {
      openEl.textContent = `${Math.round(pred.lumen_diameter_ratio * 100)}% Open`;
    }

    const ffrEl = document.getElementById("lumen-ffr-text");
    if (ffrEl) {
      ffrEl.textContent = `vFFR: ${pred.vffr}`;
    }

    const stentBtn = document.getElementById("btn-deploy-stent");
    if (stentBtn) {
      const isStented = AppState.isStented[vessel];
      stentBtn.innerHTML = isStented ? `✅ Stented (${vessel})` : `🦿 Deploy Virtual Stent (${vessel})`;
      stentBtn.style.opacity = isStented ? "0.6" : "1.0";
    }

    if (window.cardioCharts) {
      window.cardioCharts.drawLumenCrossSection(
        "lumen-cross-section-canvas",
        vessel,
        pred.probability,
        pred.lumen_diameter_ratio,
        AppState.isStented[vessel]
      );
    }
  }

  function setActiveVessel(vessel) {
    if (!["LAD", "LCX", "RCA"].includes(vessel)) return;
    AppState.activeVessel = vessel;

    // Highlight card
    document.querySelectorAll(".vessel-card").forEach(c => c.classList.remove("active"));
    const cardEl = document.getElementById(`card-${vessel}`);
    if (cardEl) cardEl.classList.add("active");

    // Highlight SHAP tab
    document.querySelectorAll(".shap-tab-btn").forEach(b => b.classList.remove("active"));
    const tabEl = document.getElementById(`shap-tab-${vessel}`);
    if (tabEl) tabEl.classList.add("active");

    // Camera fly-to
    if (AppState.heart3d) {
      AppState.heart3d.setCameraPreset(vessel);
    }

    // Refresh lumen inspector & SHAP waterfall
    updateLumenInspector();
    fetchShapAttributions(vessel);
  }

  /* ==============================================================================
     5. VIRTUAL STENT DEPLOYMENT
     ============================================================================== */
  async function deployVirtualStent() {
    const vessel = AppState.activeVessel;
    if (AppState.isStented[vessel]) return;

    try {
      const res = await fetch(`/api/virtual-stent?vessel=${vessel}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features: AppState.patient })
      });
      const data = await res.json();

      AppState.isStented[vessel] = true;
      AppState.predictions = data.post_stent;

      // Animate 3D stent lattice
      if (AppState.heart3d) {
        AppState.heart3d.deployStent(vessel);
        AppState.heart3d.updateState(AppState.predictions, AppState.patient);
      }

      // Sync UI
      updateCadBanner();
      updateVesselCards();
      updateLumenInspector();
      fetchShapAttributions(vessel);

      // Notification banner
      showNotification(`Virtual stent scenario shown for ${vessel}. The displayed lumen and vFFR values are illustrative, not measured clinical outcomes.`);
    } catch (e) {
      console.error("Virtual stent error:", e);
    }
  }

  /* ==============================================================================
     6. COUNTERFACTUAL CLINICAL TIME-MACHINE
     ============================================================================== */
  async function computeCounterfactualTrajectory() {
    const btn = document.getElementById("btn-compute-cf");
    if (btn) btn.innerHTML = "⏳ Optimizing Clinical Trajectory...";

    try {
      const res = await fetch("/api/counterfactual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features: AppState.patient })
      });
      const data = await res.json();
      AppState.counterfactualPlan = data;

      // Update UI results
      const redEl = document.getElementById("cf-cad-reduction");
      if (redEl) {
        redEl.textContent = `-${data.overall_cad_risk_reduction}%`;
      }
      const ladRedEl = document.getElementById("cf-lad-reduction");
      if (ladRedEl) {
        ladRedEl.textContent = `-${data.lad_risk_reduction}%`;
      }

      // Show action checklist in patient mode
      renderPatientChecklist(data.discussion_prompts);

      // Set scrubber to Month 0
      const scrubber = document.getElementById("timeline-scrubber");
      if (scrubber) scrubber.value = 0;

      if (btn) btn.innerHTML = "✨ Compute Illustrative Risk-Factor Scenario";
      showNotification(`Illustrative 12-month scenario computed: estimated CAD probability reduction of ${data.overall_cad_risk_reduction} percentage points. This is not a clinical forecast.`);
    } catch (e) {
      console.error("Counterfactual error:", e);
      if (btn) btn.innerHTML = "✨ Compute Illustrative Risk-Factor Scenario";
    }
  }

  function onTimelineScrub(val) {
    if (!AppState.counterfactualPlan) return;
    const trajectory = AppState.counterfactualPlan.trajectory;
    if (!trajectory || trajectory.length === 0) return;

    // val is 0 -> 100
    const ratio = val / 100.0;
    // Interpolate between milestones (Month 0, 3, 6, 12)
    let idx0 = 0, idx1 = 0, subT = 0;
    if (ratio <= 0.35) {
      idx0 = 0; idx1 = 1; subT = ratio / 0.35;
    } else if (ratio <= 0.70) {
      idx0 = 1; idx1 = 2; subT = (ratio - 0.35) / 0.35;
    } else {
      idx0 = 2; idx1 = 3; subT = (ratio - 0.70) / 0.30;
    }

    const vitals0 = trajectory[idx0].vitals;
    const vitals1 = trajectory[idx1].vitals;

    // Interpolate active vitals
    ["BP", "LDL", "TG", "HDL", "FBS", "BMI", "PR"].forEach(key => {
      const v0 = vitals0[key];
      const v1 = vitals1[key];
      const cur = v0 + (v1 - v0) * subT;
      AppState.patient[key] = Math.round(cur);
    });

    if (vitals1["Current_Smoker"] !== undefined && ratio > 0.3) {
      AppState.patient["Current Smoker"] = 0;
    }

    // Sync input sliders
    syncControlsFromPatientState();

    // Re-run inference to morph 3D heart and risk gauges
    scheduleInference();
  }

  function renderPatientChecklist(prompts) {
    const listEl = document.getElementById("patient-action-checklist");
    if (!listEl || !prompts) return;

    let html = "";
    prompts.forEach(item => {
      html += `
        <div style="background: rgba(14, 23, 46, 0.6); padding: 8px 10px; border-radius: 6px; border-left: 3px solid var(--purple-cf); font-size: 11px;">
          <strong style="color: var(--cyan-bright)">${item.category}</strong>: ${item.action}
        </div>
      `;
    });
    listEl.innerHTML = html;
  }

  /* ==============================================================================
     7. DUAL-PERSONA SWITCHER
     ============================================================================== */
  function setPersona(persona) {
    AppState.mode = persona;
    document.querySelectorAll(".persona-btn").forEach(b => b.classList.remove("active"));
    const btn = document.getElementById(`btn-persona-${persona}`);
    if (btn) btn.classList.add("active");

    if (persona === "patient") {
      document.body.classList.add("patient-mode");
      // Translate labels to patient friendly
      document.getElementById("brand-sub").textContent = "YOUR 3D HEART HEALTH TWIN";
      document.getElementById("vessel-title-LAD").textContent = "Front Heart Pipe (LAD)";
      document.getElementById("vessel-title-LCX").textContent = "Side Heart Pipe (LCX)";
      document.getElementById("vessel-title-RCA").textContent = "Back Heart Pipe (RCA)";
      document.getElementById("cad-banner-title-text").textContent = "OVERALL HEART STRAIN RISK";
    } else {
      document.body.classList.remove("patient-mode");
      document.getElementById("brand-sub").textContent = "CATH-LAB WORKSTATION";
      document.getElementById("vessel-title-LAD").textContent = "LAD (Anterior)";
      document.getElementById("vessel-title-LCX").textContent = "LCX (Lateral)";
      document.getElementById("vessel-title-RCA").textContent = "RCA (Inferior)";
      document.getElementById("cad-banner-title-text").textContent = "OVERALL CAD ANGIOGRAPHIC RISK";
    }

    updateCadBanner();
    updateLumenInspector();
  }

  /* ==============================================================================
     8. CONTROLS SYNC & EVENT LISTENERS
     ============================================================================== */
  function syncControlsFromPatientState() {
    // Sliders
    const sliderKeys = ["Age", "BP", "PR", "BMI", "EF-TTE", "LDL", "HDL", "TG", "FBS"];
    sliderKeys.forEach(k => {
      const input = document.getElementById(`input-${k}`);
      const valBadge = document.getElementById(`val-${k}`);
      if (input && AppState.patient[k] !== undefined) {
        input.value = AppState.patient[k];
        if (valBadge) valBadge.textContent = AppState.patient[k];
      }
    });

    // Dropdown RWMA
    const rwmaEl = document.getElementById("input-Region-RWMA");
    if (rwmaEl && AppState.patient["Region with RWMA"] !== undefined) {
      rwmaEl.value = AppState.patient["Region with RWMA"];
    }

    // Toggles
    const toggleKeys = [
      "Typical Chest Pain", "Atypical", "DM", "HTN", "Current Smoker",
      "St Elevation", "St Depression", "Tinversion", "Q Wave", "LVH"
    ];
    toggleKeys.forEach(k => {
      const btn = document.getElementById(`toggle-${k.replace(/\s+/g, "-")}`);
      if (btn && AppState.patient[k] !== undefined) {
        if (AppState.patient[k] === 1) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      }
    });
  }

  function bindEventListeners() {
    // Persona buttons
    document.getElementById("btn-persona-clinician")?.addEventListener("click", () => setPersona("clinician"));
    document.getElementById("btn-persona-patient")?.addEventListener("click", () => setPersona("patient"));

    // Archetype selector
    document.getElementById("archetype-select")?.addEventListener("change", (e) => {
      loadArchetypeById(e.target.value);
    });

    // Sliders
    const sliderKeys = ["Age", "BP", "PR", "BMI", "EF-TTE", "LDL", "HDL", "TG", "FBS"];
    sliderKeys.forEach(k => {
      const input = document.getElementById(`input-${k}`);
      const valBadge = document.getElementById(`val-${k}`);
      if (input) {
        input.addEventListener("input", (e) => {
          const val = Number(e.target.value);
          AppState.patient[k] = val;
          if (valBadge) valBadge.textContent = val;
          scheduleInference();
        });
      }
    });

    // RWMA Dropdown
    document.getElementById("input-Region-RWMA")?.addEventListener("change", (e) => {
      AppState.patient["Region with RWMA"] = Number(e.target.value);
      scheduleInference();
    });

    // Toggles
    const toggleKeys = [
      "Typical Chest Pain", "Atypical", "DM", "HTN", "Current Smoker",
      "St Elevation", "St Depression", "Tinversion", "Q Wave", "LVH"
    ];
    toggleKeys.forEach(k => {
      const btn = document.getElementById(`toggle-${k.replace(/\s+/g, "-")}`);
      if (btn) {
        btn.addEventListener("click", () => {
          const cur = AppState.patient[k] || 0;
          AppState.patient[k] = cur === 1 ? 0 : 1;
          if (AppState.patient[k] === 1) btn.classList.add("active");
          else btn.classList.remove("active");
          scheduleInference();
        });
      }
    });

    // Vessel cards click
    ["LAD", "LCX", "RCA"].forEach(v => {
      document.getElementById(`card-${v}`)?.addEventListener("click", () => setActiveVessel(v));
      document.getElementById(`shap-tab-${v}`)?.addEventListener("click", () => {
        document.querySelectorAll(".shap-tab-btn").forEach(b => b.classList.remove("active"));
        document.getElementById(`shap-tab-${v}`)?.classList.add("active");
        fetchShapAttributions(v);
      });
    });
    document.getElementById("shap-tab-CAD")?.addEventListener("click", () => {
      document.querySelectorAll(".shap-tab-btn").forEach(b => b.classList.remove("active"));
      document.getElementById("shap-tab-CAD")?.classList.add("active");
      fetchShapAttributions("CAD");
    });

    // Virtual stent button
    document.getElementById("btn-deploy-stent")?.addEventListener("click", deployVirtualStent);

    // Counterfactual button & scrubber
    document.getElementById("btn-compute-cf")?.addEventListener("click", computeCounterfactualTrajectory);
    document.getElementById("timeline-scrubber")?.addEventListener("input", (e) => {
      onTimelineScrub(Number(e.target.value));
    });

    // Camera view preset buttons
    document.querySelectorAll(".view-pill-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".view-pill-btn").forEach(b => b.classList.remove("active"));
        e.target.classList.add("active");
        const preset = e.target.getAttribute("data-view");
        if (AppState.heart3d) AppState.heart3d.setCameraPreset(preset);
      });
    });

    // 3D Layer toggles
    document.getElementById("toggle-layer-particles")?.addEventListener("click", (e) => {
      e.target.classList.toggle("active");
      const active = e.target.classList.contains("active");
      if (AppState.heart3d) AppState.heart3d.toggleLayer("particles", active);
    });
    document.getElementById("toggle-layer-ischemia")?.addEventListener("click", (e) => {
      e.target.classList.toggle("active");
      const active = e.target.classList.contains("active");
      if (AppState.heart3d) AppState.heart3d.toggleLayer("ischemia", active);
    });
    document.getElementById("toggle-layer-xray")?.addEventListener("click", (e) => {
      e.target.classList.toggle("active");
      const active = e.target.classList.contains("active");
      if (AppState.heart3d) AppState.heart3d.toggleXRay(active);
    });

    // Audio toggle with animated equalizer bars
    document.getElementById("toggle-ecg-audio")?.addEventListener("click", (e) => {
      if (AppState.ecg) {
        const enabled = AppState.ecg.toggleAudio();
        e.currentTarget.classList.toggle("active", enabled);
        if (enabled) {
          e.currentTarget.innerHTML = `
            <span class="soundwave-box">
              <span class="soundwave-bar"></span>
              <span class="soundwave-bar"></span>
              <span class="soundwave-bar"></span>
              <span class="soundwave-bar"></span>
            </span>
            <span>Heart Audio: ACTIVE</span>
          `;
        } else {
          e.currentTarget.innerHTML = `<span>🔇 Heart Audio: OFF</span>`;
        }
      }
    });

    // Validation modal
    document.getElementById("btn-open-validation")?.addEventListener("click", () => {
      document.getElementById("validation-modal")?.classList.add("open");
    });
    document.getElementById("btn-close-modal")?.addEventListener("click", () => {
      document.getElementById("validation-modal")?.classList.remove("open");
    });
    document.getElementById("validation-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "validation-modal") {
        e.target.classList.remove("open");
      }
    });
  }

  function showNotification(msg) {
    const banner = document.createElement("div");
    banner.style.position = "fixed";
    banner.style.bottom = "24px";
    banner.style.right = "24px";
    banner.style.background = "rgba(8, 16, 36, 0.92)";
    banner.style.backdropFilter = "blur(24px) saturate(190%)";
    banner.style.border = "1px solid var(--border-specular)";
    banner.style.boxShadow = "0 20px 50px -10px rgba(0,0,0,0.9), 0 0 25px rgba(56,189,248,0.35)";
    banner.style.color = "#f8fafc";
    banner.style.padding = "14px 20px";
    banner.style.borderRadius = "var(--radius-md)";
    banner.style.fontSize = "12px";
    banner.style.fontWeight = "600";
    banner.style.zIndex = "9999";
    banner.style.maxWidth = "440px";
    banner.style.display = "flex";
    banner.style.alignItems = "center";
    banner.style.gap = "12px";
    banner.style.transform = "translateY(20px) scale(0.95)";
    banner.style.opacity = "0";
    banner.style.transition = "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)";
    banner.innerHTML = `<span style="font-size: 16px; text-shadow: 0 0 10px rgba(56,189,248,0.6)">✨</span> <span style="line-height: 1.4">${msg}</span>`;
    document.body.appendChild(banner);

    requestAnimationFrame(() => {
      banner.style.transform = "translateY(0) scale(1)";
      banner.style.opacity = "1";
    });

    setTimeout(() => {
      banner.style.opacity = "0";
      banner.style.transform = "translateY(15px) scale(0.95)";
      setTimeout(() => banner.remove(), 400);
    }, 4500);
  }

  // Start initialization
  initApp();
});
