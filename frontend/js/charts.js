/**
 * CARDIOTWIN-4D: CHARTS, SHAP WATERFALL, LUMEN INSPECTOR & VALIDATION MODAL
 * - TreeSHAP Bi-Directional Waterfall Renderer
 * - 2D Cross-Sectional Artery Lumen Ring (Atherosclerotic Plaque Crescent vs Stent)
 * - Empirical Training-Error Range Display
 * - 5-Fold CV ROC Curves & Confusion Matrix Modal Renderer
 */

class CardioTwinCharts {
  constructor() {
    this.currentShapTarget = "CAD";
    this.shapData = null;
    this.metricsData = null;
  }

  /* ==============================================================================
     1. SHAP WATERFALL RENDERER
     ============================================================================== */
  renderShapWaterfall(containerId, explanation) {
    const container = document.getElementById(containerId);
    if (!container || !explanation) return;

    this.shapData = explanation;
    const target = explanation.target || "CAD";
    const riskIncreasing = explanation.risk_increasing || [];
    const protective = explanation.protective || [];

    // Max absolute impact for proportional bar scaling
    const maxImpact = Math.max(
      ...riskIncreasing.map(f => Math.abs(f.delta_percent)),
      ...protective.map(f => Math.abs(f.delta_percent)),
      10.0
    );

    let html = `
      <div class="shap-group-title" style="font-size: 10px; font-weight: 700; color: var(--crimson-crit); text-transform: uppercase; margin-bottom: 4px;">
        ▲ Risk-Increasing Factors (Top ${riskIncreasing.length})
      </div>
    `;

    riskIncreasing.slice(0, 6).forEach(item => {
      const barWidth = Math.min(100, Math.round((Math.abs(item.delta_percent) / maxImpact) * 100));
      html += `
        <div class="shap-item-row">
          <div class="shap-item-header">
            <span class="shap-item-name">${item.label}: <strong style="color: #fff">${item.raw_value}</strong> ${item.unit}</span>
            <span class="shap-item-impact risk-pos mono">+${item.delta_percent}%</span>
          </div>
          <div class="shap-bar-track">
            <div class="shap-bar-fill pos" style="width: ${barWidth}%"></div>
          </div>
          <div style="font-size: 9px; color: var(--text-dim); display: flex; justify-content: space-between;">
            <span>Ref: ${item.normal_range}</span>
            <span>${item.is_modifiable ? '<span style="color: var(--purple-cf)">● Modifiable</span>' : 'Frozen'}</span>
          </div>
        </div>
      `;
    });

    html += `
      <div class="shap-group-title" style="font-size: 10px; font-weight: 700; color: var(--emerald-bio); text-transform: uppercase; margin-top: 10px; margin-bottom: 4px;">
        ▼ Protective / Favorable Factors (Top ${protective.length})
      </div>
    `;

    protective.slice(0, 5).forEach(item => {
      const barWidth = Math.min(100, Math.round((Math.abs(item.delta_percent) / maxImpact) * 100));
      html += `
        <div class="shap-item-row">
          <div class="shap-item-header">
            <span class="shap-item-name">${item.label}: <strong style="color: #fff">${item.raw_value}</strong> ${item.unit}</span>
            <span class="shap-item-impact risk-neg mono">${item.delta_percent}%</span>
          </div>
          <div class="shap-bar-track">
            <div class="shap-bar-fill neg" style="width: ${barWidth}%"></div>
          </div>
          <div style="font-size: 9px; color: var(--text-dim); display: flex; justify-content: space-between;">
            <span>Ref: ${item.normal_range}</span>
            <span>${item.is_modifiable ? '<span style="color: var(--purple-cf)">● Modifiable</span>' : 'Frozen'}</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  /* ==============================================================================
     2. 2D CROSS-SECTIONAL ARTERY LUMEN INSPECTOR
     ============================================================================== */
  drawLumenCrossSection(canvasId, vesselName, pRisk, lumenRatio, isStented = false) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const outerRadius = w * 0.44;

    ctx.clearRect(0, 0, w, h);

    // 0. Radar / Ultrasound Concentric Reticle Calibration Grid
    ctx.strokeStyle = "rgba(56, 189, 248, 0.15)";
    ctx.lineWidth = 1;
    [0.3, 0.6, 0.9].forEach(rFrac => {
      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius * rFrac, 0, Math.PI * 2);
      ctx.stroke();
    });
    // Crosshair axes
    ctx.beginPath();
    ctx.moveTo(cx - outerRadius, cy);
    ctx.lineTo(cx + outerRadius, cy);
    ctx.moveTo(cx, cy - outerRadius);
    ctx.lineTo(cx, cy + outerRadius);
    ctx.stroke();

    // 1. Outer Arterial Adventitia / Media Wall (Crimson muscular ring with clearcoat border)
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
    const wallGrad = ctx.createRadialGradient(cx, cy, outerRadius * 0.7, cx, cy, outerRadius);
    wallGrad.addColorStop(0, "#881337");
    wallGrad.addColorStop(1, "#4c0519");
    ctx.fillStyle = wallGrad;
    ctx.fill();
    ctx.strokeStyle = "#fda4af";
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // 2. Atherosclerotic Plaque Crescent or Stented Restoration
    if (isStented) {
      // Dilated patent lumen with platinum wireframe struts
      const openRadius = outerRadius * 0.92;
      ctx.beginPath();
      ctx.arc(cx, cy, openRadius, 0, Math.PI * 2);
      const openGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, openRadius);
      openGrad.addColorStop(0, "rgba(56, 189, 248, 0.9)");
      openGrad.addColorStop(0.7, "rgba(14, 165, 233, 0.6)");
      openGrad.addColorStop(1, "rgba(2, 132, 199, 0.3)");
      ctx.fillStyle = openGrad;
      ctx.fill();

      // Metallic diamond stent ring with platinum nodes
      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Glowing stent nodes
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * openRadius, cy + Math.sin(a) * openRadius, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Golden-amber plaque crescent encroaching inward from left wall
      const plaqueThickness = outerRadius * (1.0 - Math.max(0.18, lumenRatio));
      
      // Plaque body with lipid necrotic core gradient
      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius - 1, 0, Math.PI * 2);
      const plaqueGrad = ctx.createRadialGradient(cx - outerRadius * 0.4, cy, 2, cx, cy, outerRadius);
      plaqueGrad.addColorStop(0, "#f59e0b");
      plaqueGrad.addColorStop(0.6, "#d97706");
      plaqueGrad.addColorStop(1, "#78350f");
      ctx.fillStyle = plaqueGrad;
      ctx.fill();

      // Remaining open patent lumen (displaced toward right side)
      const openRadius = Math.max(7, outerRadius * Math.sqrt(lumenRatio));
      const offsetX = plaqueThickness * 0.65;

      ctx.beginPath();
      ctx.arc(cx + offsetX, cy, openRadius, 0, Math.PI * 2);
      const lumenGrad = ctx.createRadialGradient(cx + offsetX, cy, 0, cx + offsetX, cy, openRadius);
      lumenGrad.addColorStop(0, "#ef4444");
      lumenGrad.addColorStop(0.7, "#dc2626");
      lumenGrad.addColorStop(1, "#991b1b");
      ctx.fillStyle = lumenGrad;
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Blood flow sparkle dot
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx + offsetX, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ==============================================================================
     3. MODEL VALIDATION & ROC CURVES MODAL
     ============================================================================== */
  renderValidationModal(metrics) {
    this.metricsData = metrics;
    const tableBody = document.getElementById("validation-metrics-tbody");
    if (!tableBody || !metrics || !metrics.targets) return;

    let rowsHtml = "";
    const targetNames = {
      CAD: "Coronary Artery Disease (CAD)",
      LAD: "Left Anterior Descending (LAD)",
      LCX: "Left Circumflex (LCX)",
      RCA: "Right Coronary Artery (RCA)"
    };

    for (const [key, targetObj] of Object.entries(metrics.targets)) {
      rowsHtml += `
        <tr>
          <td><strong style="color: var(--cyan-bright)">${key}</strong> <span style="font-size: 10px; color: var(--text-dim)">(${targetNames[key]})</span></td>
          <td class="mono">${(targetObj.accuracy * 100).toFixed(1)}%</td>
          <td class="mono">${(targetObj.precision * 100).toFixed(1)}%</td>
          <td class="mono">${(targetObj.recall * 100).toFixed(1)}%</td>
          <td class="mono"><strong>${targetObj.f1_score.toFixed(3)}</strong></td>
          <td class="mono"><span style="color: var(--emerald-bio); font-weight: 700;">${targetObj.roc_auc.toFixed(3)}</span></td>
          <td class="mono">${targetObj.brier_score.toFixed(3)}</td>
        </tr>
      `;
    }
    tableBody.innerHTML = rowsHtml;

    // Draw Multi-Target ROC Curves on Canvas
    this.drawRocCurves("roc-curves-canvas", metrics.targets);
  }

  drawRocCurves(canvasId, targets) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padLeft = 45;
    const padBottom = 35;
    const padTop = 15;
    const padRight = 20;

    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    // Axes
    ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, h - padBottom);
    ctx.lineTo(w - padRight, h - padBottom);
    ctx.stroke();

    // Axis Labels
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px JetBrains Mono, monospace";
    ctx.fillText("0.0", padLeft - 22, h - padBottom + 4);
    ctx.fillText("1.0", padLeft - 22, padTop + 8);
    ctx.fillText("False Positive Rate (1 - Specificity)", padLeft + plotW / 2 - 90, h - 8);

    ctx.save();
    ctx.translate(14, padTop + plotH / 2 + 40);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("True Positive Rate (Sensitivity)", 0, 0);
    ctx.restore();

    // Random Chance Diagonal
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, h - padBottom);
    ctx.lineTo(padLeft + plotW, padTop);
    ctx.stroke();
    ctx.setLineDash([]);

    // Target Colors
    const colors = {
      CAD: "#38bdf8",
      LAD: "#ef4444",
      LCX: "#10b981",
      RCA: "#f59e0b"
    };

    // Plot curves with neon glow
    for (const [tgt, obj] of Object.entries(targets)) {
      if (!obj.roc_curve) continue;
      const fprs = obj.roc_curve.fpr;
      const tprs = obj.roc_curve.tpr;

      ctx.save();
      ctx.strokeStyle = colors[tgt] || "#38bdf8";
      ctx.lineWidth = 2.4;
      ctx.shadowColor = colors[tgt] || "#38bdf8";
      ctx.shadowBlur = 10;
      ctx.beginPath();

      for (let i = 0; i < fprs.length; i++) {
        const x = padLeft + fprs[i] * plotW;
        const y = h - padBottom - tprs[i] * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Legend
    let legX = padLeft + 15;
    const legY = padTop + 15;
    for (const [tgt, obj] of Object.entries(targets)) {
      ctx.fillStyle = colors[tgt] || "#38bdf8";
      ctx.fillRect(legX, legY, 10, 10);
      ctx.fillStyle = "#ffffff";
      ctx.font = "10px Inter, sans-serif";
      ctx.fillText(`${tgt} (AUC ${obj.roc_auc.toFixed(2)})`, legX + 14, legY + 9);
      legX += 110;
    }
  }
}

window.cardioCharts = new CardioTwinCharts();
