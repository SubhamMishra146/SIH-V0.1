// Relative API path: automatically works on both localhost:5000 and Render cloud deployment
const API_BASE = "/api";
let selectedFile = null;
let currentScan = null;

document.addEventListener("DOMContentLoaded", loadHistory);

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
  document.getElementById('report-skeleton').style.display = 'block';
  document.getElementById('report-content').style.opacity = '0.2';
  document.getElementById('detections-section').style.display = 'none';
  document.getElementById('ocr-section').style.display = 'none';

  document.getElementById('scan-btn').disabled = true;
  document.getElementById('scan-btn').innerHTML =
    '<span class="spinner-border spinner-border-sm me-2"></span>OCR Processing...';

  const formData = new FormData();
  formData.append("labelImage", selectedFile);
  formData.append("productName", productName);

  try {
    const res = await fetch(`${API_BASE}/scan`, { method: "POST", body: formData });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const result = await res.json();
    currentScan = result.scan;

    renderReportCard(currentScan);
    loadHistory();
  } catch (e) {
    console.error("Scan error", e);
    alert("Scan failed: " + (e.message || "Network error. Please try again."));
  } finally {
    document.getElementById('report-skeleton').style.display = 'none';
    document.getElementById('report-content').style.opacity = '1';
    document.getElementById('scan-btn').disabled = false;
    document.getElementById('scan-btn').innerHTML = '<i class="bi bi-search"></i> Run Compliance Check';
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
  document.getElementById('report-card').style.display = 'block';
  document.getElementById('report-product-name').innerText = scan.productName;
  document.getElementById('report-timestamp').innerText = new Date(scan.scannedAt).toLocaleString();

  const isCompliant = scan.status === "Compliant";
  document.getElementById('report-status-badge').innerHTML =
    `<span class="compliance-status-badge ${isCompliant ? 'compliant' : 'non-compliant'}">${scan.status}</span>`;

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
          <span class="badge ${isPassed ? 'bg-success' : 'bg-danger'}">${isPassed ? 'PASS' : 'VIOLATION'}</span>
        </td>
        <td><code class="evidence-code">${rule.evidenceFound}</code></td>
        <td class="small">${rule.remarks}</td>
      </tr>`;
  }

  // Raw OCR box
  document.getElementById('ocr-section').style.display = 'block';
  document.getElementById('ocr-raw-text').innerText = scan.extractedText || "(No text extracted)";
  document.getElementById('ocr-body').style.display = 'block';
  document.getElementById('ocr-toggle-icon').className = 'bi bi-chevron-up';

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
    const confColor = confPct >= 80 ? 'text-success' : confPct >= 50 ? 'text-warning' : 'text-danger';
    const ruleBadge = matchedRule
      ? `<span class="badge bg-primary" title="${RULE_LABELS[matchedRule]}">${matchedRule}</span>`
      : '<span class="text-muted small">—</span>';

    const tr = document.createElement('tr');
    tr.dataset.conf = det.confidence;
    tr.innerHTML = `
      <td class="text-muted small">${det.id}</td>
      <td contenteditable="true" class="editable-cell" spellcheck="false">${det.text}</td>
      <td>
        <div class="d-flex align-items-center gap-1">
          <div class="conf-bar-bg"><div class="conf-bar-fill" style="width:${confPct}%;background:${confPct>=80?'#2ea043':confPct>=50?'#e3b341':'#f85149'}"></div></div>
          <span class="${confColor} small fw-bold">${confPct}%</span>
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

      // Color coding: green=matched rule, blue=generic text, red=low confidence
      let color;
      if (confPct < 0.5) color = 'rgba(248,81,73,0.85)';
      else if (matchedRule) color = 'rgba(46,160,67,0.85)';
      else color = 'rgba(56,139,253,0.85)';

      const box = det.box;
      if (!box || box.length < 4) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(box[0][0] * scaleX, box[0][1] * scaleY);
      for (let i = 1; i < box.length; i++) {
        ctx.lineTo(box[i][0] * scaleX, box[i][1] * scaleY);
      }
      ctx.closePath();
      ctx.stroke();

      // Label background
      const label = det.text.length > 18 ? det.text.slice(0, 15) + '…' : det.text;
      const x = box[0][0] * scaleX;
      const y = box[0][1] * scaleY - 4;
      ctx.fillStyle = color;
      ctx.font = '9px sans-serif';
      const tw = ctx.measureText(label).width;
      ctx.fillRect(x, y - 10, tw + 4, 12);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x + 2, y);
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

// ── Scan History ────────────────────────────────────────────────────────────
async function loadHistory() {
  const res = await fetch(`${API_BASE}/scans`);
  const scans = await res.json();

  const tbody = document.getElementById('history-tbody');
  tbody.innerHTML = '';
  let compliant = 0;

  scans.forEach(scan => {
    if (scan.status === "Compliant") compliant++;
    tbody.innerHTML += `
      <tr>
        <td class="align-middle">${scan.productName}</td>
        <td class="align-middle">${new Date(scan.scannedAt).toLocaleString()}</td>
        <td class="align-middle">
          <span class="badge ${scan.status === 'Compliant' ? 'bg-success' : 'bg-danger'}">${scan.status}</span>
        </td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-danger" onclick="deleteScan('${scan.id}')" title="Delete">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>`;
  });

  document.getElementById('stat-total').innerText = scans.length;
  document.getElementById('stat-compliant').innerText = compliant;
  document.getElementById('stat-violations').innerText = scans.length - compliant;
}

async function deleteScan(id) {
  if (!confirm("Delete this scan from history?")) return;
  try {
    await fetch(`${API_BASE}/scans/${id}`, { method: 'DELETE' });
    if (currentScan && currentScan.id === id) {
      document.getElementById('report-card').style.display = 'none';
      document.getElementById('ocr-section').style.display = 'none';
      document.getElementById('detections-section').style.display = 'none';
    }
    loadHistory();
  } catch (e) {
    alert("Failed to delete scan.");
  }
}