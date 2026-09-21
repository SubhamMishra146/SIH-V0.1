// Relative API path: automatically works on localhost, custom PORT, and Render cloud deployment
const API_BASE = (window.location.origin && window.location.origin.startsWith("http"))
  ? `${window.location.origin}/api`
  : "/api";
let selectedFile = null;
let currentScan = null;
let allHistoricalScans = [];
let historyFilter = 'all';

// ── 3-Page Navigation Controller ────────────────────────────────────────────
function navigateTo(viewName) {
  const views = ['scan', 'analytics', 'about'];
  if (!views.includes(viewName)) viewName = 'scan';

  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    const btn = document.getElementById(`nav-btn-${v}`);
    if (el) el.style.display = (v === viewName) ? 'block' : 'none';
    if (btn) {
      if (v === viewName) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });

  // Keep URL hash in sync
  if (window.location.hash !== `#${viewName}`) {
    window.history.replaceState(null, '', `#${viewName}`);
  }

  // Refresh analytics if switching to analytics page
  if (viewName === 'analytics') {
    loadHistory();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  if (hash) navigateTo(hash);
});

// ── Global Alert Banner ─────────────────────────────────────────────────────
function showGlobalAlert(message, type = 'info') {
  const box = document.getElementById('global-alert-box');
  const text = document.getElementById('global-alert-text');
  const icon = document.getElementById('global-alert-icon');
  if (!box || !text) return;

  text.innerText = message;
  if (icon) {
    icon.className = type === 'success' ? 'bi bi-check-circle-fill text-success fs-5' : 'bi bi-info-circle-fill text-warning fs-5';
  }
  box.style.display = 'flex';
  setTimeout(() => dismissGlobalAlert(), 6000);
}

function dismissGlobalAlert() {
  const box = document.getElementById('global-alert-box');
  if (box) box.style.display = 'none';
}

function updateGeminiBtnState() {
  const btn = document.getElementById('gemini-toggle-btn');
  const key = localStorage.getItem('gemini_api_key');
  if (btn) {
    if (key) {
      btn.className = "btn btn-sm gemini-btn fw-semibold";
      btn.innerHTML = `<i class="bi bi-stars"></i> Gemini Vision <span class="badge bg-success ms-1">ACTIVE</span>`;
    } else {
      btn.className = "btn btn-sm gemini-btn";
      btn.innerHTML = `<i class="bi bi-stars"></i> Gemini Vision`;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Initialize view from URL hash if present
  const hash = window.location.hash.replace('#', '');
  if (hash && ['scan', 'analytics', 'about'].includes(hash)) {
    navigateTo(hash);
  } else {
    navigateTo('scan');
  }

  loadHistory();
  const savedKey = localStorage.getItem('gemini_api_key');
  if (savedKey && document.getElementById('gemini-api-key')) {
    document.getElementById('gemini-api-key').value = savedKey;
  }
  updateGeminiBtnState();
});

function toggleGeminiSettings() {
  const panel = document.getElementById('gemini-settings');
  if (!panel) return;
  if (panel.style.display === 'none' || !panel.style.display) {
    panel.style.display = 'block';
    const input = document.getElementById('gemini-api-key');
    if (input) input.focus();
  } else {
    panel.style.display = 'none';
  }
}

function saveGeminiKey() {
  const key = document.getElementById('gemini-api-key').value.trim();
  if (key) {
    localStorage.setItem('gemini_api_key', key);
    updateGeminiBtnState();
    alert('Gemini API Key saved! Scans will now use Gemini 3.8 Flash Vision.');
    toggleGeminiSettings();
  }
}

function clearGeminiKey() {
  localStorage.removeItem('gemini_api_key');
  if (document.getElementById('gemini-api-key')) {
    document.getElementById('gemini-api-key').value = '';
  }
  updateGeminiBtnState();
  alert('Gemini API Key cleared. Scans will use local OpenCV + EasyOCR.');
}

// ── Drag-and-drop support ───────────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});

// ── File Selection ──────────────────────────────────────────────────────────
document.getElementById('file-input').addEventListener('change', e => {
  if (e.target.files.length > 0) handleFile(e.target.files[0]);
});

function handleFile(file) {
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('preview-img');
    img.onload = () => {
      // Reset canvas size to match image
      const canvas = document.getElementById('bbox-canvas');
      canvas.width = img.offsetWidth;
      canvas.height = img.offsetHeight;
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    };
    img.src = e.target.result;
    document.getElementById('preview-container').style.display = 'block';
  };
  reader.readAsDataURL(file);
  document.getElementById('scan-btn').disabled = false;
}

// ── Submit Scan ─────────────────────────────────────────────────────────────
async function submitScan() {
  if (!selectedFile) return;
  const productName = document.getElementById("product-name").value || "Unknown Product";

  // Show report card with skeleton
  document.getElementById('report-card').style.display = 'block';
  const placeholder = document.getElementById('report-placeholder');
  if (placeholder) placeholder.style.display = 'none';
  document.getElementById('report-skeleton').style.display = 'block';
  const content = document.getElementById('report-content');
  if (content) {
    content.style.display = 'block';
    content.style.opacity = '0.2';
  }
  document.getElementById('detections-section').style.display = 'none';
  document.getElementById('ocr-section').style.display = 'none';

  document.getElementById('scan-btn').disabled = true;
  document.getElementById('scan-btn').innerHTML =
    '<span class="spinner-border spinner-border-sm me-2"></span>OCR Processing...';

  const formData = new FormData();
  formData.append("labelImage", selectedFile);
  formData.append("productName", productName);
  const apiKey = localStorage.getItem('gemini_api_key') || document.getElementById('gemini-api-key')?.value.trim() || '';
  if (apiKey) formData.append("apiKey", apiKey);

  try {
    const res = await fetch(`${API_BASE}/scan`, { method: "POST", body: formData });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const result = await res.json();
    currentScan = result.scan;

    renderReportCard(currentScan);
    loadHistory();
    showGlobalAlert(`Audit complete for "${productName}". Report generated and saved to registry.`, 'success');

    if (currentScan.geminiError && apiKey) {
      console.warn("Gemini Vision notice:", currentScan.geminiError);
      alert("Gemini Vision Notice: Could not connect to Gemini (" + currentScan.geminiError + ").\n\nFell back to Local OpenCV + EasyOCR.");
    }
  } catch (e) {
    console.error("Scan error", e);
    alert("Scan failed: " + (e.message || "Network error. Please try again."));
  } finally {
    document.getElementById('report-skeleton').style.display = 'none';
    if (content) content.style.opacity = '1';
    document.getElementById('scan-btn').disabled = false;
    document.getElementById('scan-btn').innerHTML = '<i class="bi bi-search me-1.5"></i> Run Compliance Check';
  }
}

// ── Render Audit Report ─────────────────────────────────────────────────────
const RULE_LABELS = {
  mrp: "MRP & Tax Declaration",
  netQuantity: "Net Quantity",
  mfgDate: "Date of Mfg / Packing",
  manufacturerDetails: "Manufacturer / Packer Details",
  consumerCare: "Consumer Care Info"
};

// Rule keywords for matching detections to rules
const RULE_KEYWORDS = {
  mrp: ["mrp", "m.r.p", "rs.", "₹", "tax", "gst", "incl"],
  netQuantity: ["net", "qty", "quantity", "g", "kg", "ml", "pages", "pcs", "sheets", "n ", "number of"],
  mfgDate: ["mfg", "mfd", "pkd", "pkg", "packed", "manufactur", "date", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"],
  manufacturerDetails: ["manufactur", "marketed", "packed by", "pvt", "ltd", "limited", "product by"],
  consumerCare: ["@", "care", "customer", "consumer", "helpline", "1800", "email", "phone"]
};

function getMatchedRule(text) {
  const t = text.toLowerCase();
  for (const [rule, keywords] of Object.entries(RULE_KEYWORDS)) {
    if (keywords.some(kw => t.includes(kw))) return rule;
  }
  return null;
}

function renderReportCard(scan) {
  const reportCard = document.getElementById('report-card');
  if (reportCard) reportCard.style.display = 'block';

  const placeholder = document.getElementById('report-placeholder');
  if (placeholder) placeholder.style.display = 'none';

  const content = document.getElementById('report-content');
  if (content) {
    content.style.display = 'block';
    content.style.opacity = '1';
  }

  const prodName = document.getElementById('report-product-name');
  if (prodName) prodName.innerText = scan.productName || "Product";

  const timeStamp = document.getElementById('report-timestamp');
  if (timeStamp) timeStamp.innerText = scan.scannedAt ? new Date(scan.scannedAt).toLocaleString() : '';

  const isCompliant = scan.status === "Compliant";
  const statusBadge = document.getElementById('report-status-badge');
  if (statusBadge) {
    statusBadge.innerHTML = `<span class="compliance-status-badge ${isCompliant ? 'compliant' : 'non-compliant'}">${isCompliant ? '<i class="bi bi-check-circle-fill"></i>' : '<i class="bi bi-exclamation-triangle-fill"></i>'} ${scan.status}</span>`;
  }

  const engine = scan.engine || "Local OpenCV + EasyOCR";
  const isGemini = engine.includes("Gemini");
  const engineBadge = document.getElementById('report-engine-badge');
  if (engineBadge) {
    engineBadge.innerHTML = isGemini
      ? `<span class="badge badge-lavender-subtle fw-semibold" title="Processed by Gemini 3.8 Flash Vision"><i class="bi bi-stars"></i> ${engine}</span>`
      : `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle" title="Processed by on-device EasyOCR"><i class="bi bi-cpu"></i> ${engine}</span>`;
  }

  // Build audit table
  const tbody = document.getElementById('audit-tbody');
  tbody.innerHTML = '';
  const names = scan.ruleNames || RULE_LABELS;
  for (const [key, rule] of Object.entries(scan.rules)) {
    const isPassed = rule.status === "PASS";
    tbody.innerHTML += `
      <tr>
        <td class="fw-semibold">${names[key] || key}</td>
        <td class="text-center">
          <span class="badge ${isPassed ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-danger-subtle text-danger border border-danger-subtle'} font-monospace">
            ${isPassed ? '<i class="bi bi-check2"></i> PASS' : '<i class="bi bi-x-lg"></i> VIOLATION'}
          </span>
        </td>
        <td><code class="evidence-code">${rule.evidenceFound}</code></td>
        <td class="small text-secondary">${rule.remarks}</td>
      </tr>`;
  }

  // Raw OCR box
  document.getElementById('ocr-section').style.display = 'block';
  document.getElementById('ocr-raw-text').innerText = scan.extractedText || "(No text extracted)";
  document.getElementById('ocr-body').style.display = 'block';
  document.getElementById('ocr-toggle-icon').className = 'bi bi-chevron-up text-secondary';

  // Detections table + bounding boxes
  if (scan.detections && scan.detections.length > 0) {
    renderDetectionsTable(scan.detections);
    drawBoundingBoxes(scan.detections);
  }
}

// ── Detections Table ────────────────────────────────────────────────────────
let allDetections = [];

function renderDetectionsTable(detections) {
  allDetections = detections;
  document.getElementById('detections-section').style.display = 'block';
  document.getElementById('det-count').textContent = detections.length;
  document.getElementById('conf-slider').value = 0;
  document.getElementById('conf-value').textContent = '0%';
  buildDetRows(detections);
}

function buildDetRows(detections) {
  const tbody = document.getElementById('det-tbody');
  tbody.innerHTML = '';
  detections.forEach(det => {
    const matchedRule = getMatchedRule(det.text);
    const confPct = Math.round(det.confidence * 100);
    const confColor = confPct >= 80 ? 'text-warning' : confPct >= 50 ? 'text-primary' : 'text-danger';
    const ruleBadge = matchedRule
      ? `<span class="badge badge-gold-subtle" title="${RULE_LABELS[matchedRule]}">${matchedRule}</span>`
      : '<span class="text-muted small">—</span>';

    const tr = document.createElement('tr');
    tr.dataset.conf = det.confidence;
    tr.innerHTML = `
      <td class="text-secondary small font-monospace">${det.id}</td>
      <td contenteditable="true" class="editable-cell" spellcheck="false">${det.text}</td>
      <td>
        <div class="d-flex align-items-center gap-2">
          <div class="conf-bar-bg"><div class="conf-bar-fill" style="width:${confPct}%;background:${confPct>=80?'#D4AF37':confPct>=50?'#7048A8':'#e11d48'}"></div></div>
          <span class="${confColor} small fw-bold font-monospace" style="min-width:32px;">${confPct}%</span>
        </div>
      </td>
      <td>${ruleBadge}</td>`;
    tbody.appendChild(tr);
  });
}

function filterByConfidence(val) {
  document.getElementById('conf-value').textContent = `${val}%`;
  const threshold = val / 100;
  const rows = document.querySelectorAll('#det-tbody tr');
  rows.forEach(row => {
    row.style.display = parseFloat(row.dataset.conf) >= threshold ? '' : 'none';
  });
}

// ── Bounding Box Canvas Drawing ─────────────────────────────────────────────
function drawBoundingBoxes(detections) {
  const img = document.getElementById('preview-img');
  const canvas = document.getElementById('bbox-canvas');

  // Wait for image to be fully rendered at its display size
  const draw = () => {
    const dispW = img.offsetWidth;
    const dispH = img.offsetHeight;
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;

    if (!natW || !natH || !dispW || !dispH) return;

    canvas.width = dispW;
    canvas.height = dispH;
    const scaleX = dispW / natW;
    const scaleY = dispH / natH;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, dispW, dispH);

    detections.forEach(det => {
      const matchedRule = getMatchedRule(det.text);
      const confPct = det.confidence;

      // Color coding: Gold=matched rule, Deep Lavender=generic text, Rose=low confidence
      let strokeColor, fillColor;
      if (confPct < 0.5) {
        strokeColor = '#e11d48';
        fillColor = 'rgba(225, 29, 72, 0.14)';
      } else if (matchedRule) {
        strokeColor = '#D4AF37';
        fillColor = 'rgba(212, 175, 55, 0.18)';
      } else {
        strokeColor = '#7048A8';
        fillColor = 'rgba(112, 72, 168, 0.16)';
      }

      const box = det.box;
      if (!box || box.length < 4) return;

      // Draw box with stroke & soft fill
      ctx.beginPath();
      ctx.moveTo(box[0][0] * scaleX, box[0][1] * scaleY);
      for (let i = 1; i < box.length; i++) {
        ctx.lineTo(box[i][0] * scaleX, box[i][1] * scaleY);
      }
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label pill
      const label = det.text.length > 20 ? det.text.slice(0, 18) + '…' : det.text;
      const x = box[0][0] * scaleX;
      const y = Math.max(12, box[0][1] * scaleY - 3);
      ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
      const tw = ctx.measureText(label).width;

      ctx.fillStyle = strokeColor;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y - 11, tw + 8, 14, 3);
        ctx.fill();
      } else {
        ctx.fillRect(x, y - 11, tw + 8, 14);
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x + 4, y);
    });
  };

  if (img.complete && img.naturalWidth) draw();
  else img.onload = draw;
}

// ── OCR Text Toggle ─────────────────────────────────────────────────────────
function toggleOcrText() {
  const body = document.getElementById('ocr-body');
  const icon = document.getElementById('ocr-toggle-icon');
  if (body.style.display === 'none') {
    body.style.display = 'block';
    icon.className = 'bi bi-chevron-up';
  } else {
    body.style.display = 'none';
    icon.className = 'bi bi-chevron-down';
  }
}

// ── Export Suite ────────────────────────────────────────────────────────────
function copyFullText() {
  if (!currentScan) return;
  navigator.clipboard.writeText(currentScan.extractedText || '')
    .then(() => alert('Full OCR text copied to clipboard!'))
    .catch(() => alert('Could not access clipboard.'));
}

function downloadJSON() {
  if (!currentScan) return;
  const blob = new Blob([JSON.stringify(currentScan, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `compliance_report_${currentScan.productName.replace(/\s+/g, '_')}.json`;
  a.click();
}

function downloadCSV() {
  if (!currentScan || !currentScan.detections) return;
  const rows = [['ID', 'Text', 'Confidence %', 'Rule Matched']];
  currentScan.detections.forEach(det => {
    const rule = getMatchedRule(det.text) || '';
    rows.push([det.id, `"${det.text.replace(/"/g, '""')}"`, Math.round(det.confidence * 100), rule]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ocr_detections_${currentScan.productName.replace(/\s+/g, '_')}.csv`;
  a.click();
}

// ── Scan History & Clickable Registry ──────────────────────────────────────
async function loadHistory() {
  try {
    const res = await fetch(`${API_BASE}/scans`);
    allHistoricalScans = await res.json();
  } catch (e) {
    console.error("Failed to load history:", e);
    allHistoricalScans = [];
  }

  let compliant = 0;
  allHistoricalScans.forEach(s => {
    if (s.status === "Compliant") compliant++;
  });

  const totalEl = document.getElementById('stat-total');
  const compEl = document.getElementById('stat-compliant');
  const violEl = document.getElementById('stat-violations');

  if (totalEl) totalEl.innerText = allHistoricalScans.length;
  if (compEl) compEl.innerText = compliant;
  if (violEl) violEl.innerText = allHistoricalScans.length - compliant;

  filterHistory();
}

function setHistoryFilter(status) {
  historyFilter = status;

  const btnAll = document.getElementById('filter-all-btn');
  const btnComp = document.getElementById('filter-compliant-btn');
  const btnViol = document.getElementById('filter-violation-btn');

  if (btnAll) btnAll.classList.toggle('active', status === 'all');
  if (btnComp) btnComp.classList.toggle('active', status === 'Compliant');
  if (btnViol) btnViol.classList.toggle('active', status === 'Non-Compliant');

  filterHistory();
}

function filterHistory() {
  const query = (document.getElementById('history-search-input')?.value || '').toLowerCase().trim();

  const filtered = allHistoricalScans.filter(scan => {
    const matchesStatus = (historyFilter === 'all') || (scan.status === historyFilter);
    const matchesQuery = !query || (scan.productName && scan.productName.toLowerCase().includes(query));
    return matchesStatus && matchesQuery;
  });

  renderHistoryRows(filtered);
}

function renderHistoryRows(scans) {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (scans.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-secondary py-4 small">
          <i class="bi bi-inbox fs-4 d-block mb-1 text-muted"></i> No matching scan records found
        </td>
      </tr>`;
    return;
  }

  scans.forEach(scan => {
    const isCompliant = scan.status === "Compliant";
    const dateStr = scan.scannedAt ? new Date(scan.scannedAt).toLocaleString() : '—';
    const isGemini = scan.engine && scan.engine.includes("Gemini");

    const thumbHtml = scan.imagePath
      ? `<img src="/${scan.imagePath.replace(/^\//, '')}" alt="Label" class="history-thumb" onerror="this.outerHTML='<div class=\\'history-thumb-placeholder\\'><i class=\\'bi bi-image\\'></i></div>'" />`
      : `<div class="history-thumb-placeholder"><i class="bi bi-upc-scan"></i></div>`;

    const statusBadge = isCompliant
      ? `<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-check2"></i> Compliant</span>`
      : `<span class="badge bg-danger-subtle text-danger border border-danger-subtle"><i class="bi bi-exclamation-triangle-fill"></i> Non-Compliant</span>`;

    const engineBadge = isGemini
      ? `<span class="badge badge-lavender-subtle"><i class="bi bi-stars"></i> Gemini</span>`
      : `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle"><i class="bi bi-cpu"></i> Local</span>`;

    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    tr.title = `Click to load inspection report for "${scan.productName || 'Product'}"`;
    tr.onclick = () => inspectHistoricalScan(scan.id);

    tr.innerHTML = `
      <td class="align-middle">${thumbHtml}</td>
      <td class="align-middle">
        <div class="fw-semibold text-dark">${scan.productName || 'Unknown Product'}</div>
        <small class="text-secondary d-md-none">${dateStr}</small>
      </td>
      <td class="align-middle text-secondary small d-none d-md-table-cell">${dateStr}</td>
      <td class="align-middle">${statusBadge}</td>
      <td class="align-middle d-none d-sm-table-cell">${engineBadge}</td>
      <td class="align-middle text-end" style="white-space:nowrap;">
        <button class="btn btn-sm btn-outline-lavender me-1.5" onclick="event.stopPropagation(); inspectHistoricalScan('${scan.id}')" title="Inspect Label">
          <i class="bi bi-eye me-1"></i> Inspect
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); deleteScan('${scan.id}')" title="Delete">
          <i class="bi bi-trash"></i>
        </button>
      </td>`;
    tbody.appendChild(tr);
  });
}

// ── Inspect Historical Scan (Click-to-Inspect) ──────────────────────────────
async function inspectHistoricalScan(scanId) {
  let scan = allHistoricalScans.find(s => s.id === scanId);
  if (!scan) {
    try {
      const res = await fetch(`${API_BASE}/scans/${scanId}`);
      if (res.ok) scan = await res.json();
    } catch (e) {
      console.error("Error fetching single scan:", e);
    }
  }

  if (!scan) {
    alert("Could not load scan details.");
    return;
  }

  currentScan = scan;

  // 1. Populate product name in the inspection setup
  const pInput = document.getElementById('product-name');
  if (pInput) pInput.value = scan.productName || "";

  // 2. Load the original product image and overlay bounding boxes
  const previewContainer = document.getElementById('preview-container');
  const img = document.getElementById('preview-img');

  if (scan.imagePath) {
    previewContainer.style.display = 'block';
    img.onload = () => {
      const canvas = document.getElementById('bbox-canvas');
      canvas.width = img.offsetWidth;
      canvas.height = img.offsetHeight;
      if (scan.detections && scan.detections.length > 0) {
        drawBoundingBoxes(scan.detections);
      } else {
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    img.src = `/${scan.imagePath.replace(/^\//, '')}`;
  } else {
    previewContainer.style.display = 'none';
  }

  // 3. Render the compliance report card
  renderReportCard(scan);

  // 4. Switch to Page 1 (Inspection & Audit)
  navigateTo('scan');
  showGlobalAlert(`Loaded historical scan for "${scan.productName || 'Product'}" into Inspection Workspace.`, 'success');
}

async function deleteScan(id) {
  if (!confirm("Delete this scan from history?")) return;
  try {
    await fetch(`${API_BASE}/scans/${id}`, { method: 'DELETE' });
    if (currentScan && currentScan.id === id) {
      const content = document.getElementById('report-content');
      if (content) content.style.display = 'none';
      const placeholder = document.getElementById('report-placeholder');
      if (placeholder) placeholder.style.display = 'block';
      document.getElementById('ocr-section').style.display = 'none';
      document.getElementById('detections-section').style.display = 'none';
      currentScan = null;
    }
    loadHistory();
    showGlobalAlert("Scan record deleted successfully.", "info");
  } catch (e) {
    alert("Failed to delete scan.");
  }
}