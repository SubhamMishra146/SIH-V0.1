const API_BASE = "http://localhost:5000/api";
let selectedFile = null;
let currentScan = null;

document.addEventListener("DOMContentLoaded", loadHistory);

// ── File Input Handler ──────────────────────────────────────────────────────
document.getElementById('file-input').addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    selectedFile = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.getElementById('preview-img');
      img.src = e.target.result;
      document.getElementById('preview-container').style.display = 'block';
    };
    reader.readAsDataURL(selectedFile);
    document.getElementById('scan-btn').disabled = false;
  }
});

// ── Submit Scan ─────────────────────────────────────────────────────────────
async function submitScan() {
  if (!selectedFile) return;
  const productName = document.getElementById("product-name").value || "Unknown Product";

  const formData = new FormData();
  formData.append("labelImage", selectedFile);
  formData.append("productName", productName);

  document.getElementById('scan-btn').disabled = true;
  document.getElementById('scan-btn').innerHTML = '<i class="bi bi-hourglass-split"></i> Scanning... (OCR Processing)';

  try {
    const res = await fetch(`${API_BASE}/scan`, { method: "POST", body: formData });
    const result = await res.json();
    currentScan = result.scan;

    renderReportCard(currentScan);
    loadHistory();
  } catch (e) {
    console.error("Scan error", e);
    alert("Scan failed. Is the backend running?");
  } finally {
    document.getElementById('scan-btn').disabled = false;
    document.getElementById('scan-btn').innerHTML = '<i class="bi bi-search"></i> Run Compliance Check';
  }
}

// ── Render Audit Report ─────────────────────────────────────────────────────
// Human-readable names for each rule key (fallback if backend doesn't send them)
const RULE_LABELS = {
  mrp: "MRP & Tax Declaration",
  netQuantity: "Net Quantity",
  mfgDate: "Date of Mfg / Packing",
  manufacturerDetails: "Manufacturer / Packer Details",
  consumerCare: "Consumer Care Info"
};

function renderReportCard(scan) {
  document.getElementById('report-card').style.display = 'block';
  document.getElementById('report-product-name').innerText = scan.productName;
  document.getElementById('report-timestamp').innerText = new Date(scan.scannedAt).toLocaleString();

  const isCompliant = scan.status === "Compliant";
  document.getElementById('report-status-badge').innerHTML =
    `<span class="compliance-status-badge ${isCompliant ? 'compliant' : 'non-compliant'}">${scan.status}</span>`;

  // Build the audit evidence table
  const tbody = document.getElementById('audit-tbody');
  tbody.innerHTML = '';

  // Use ruleNames from backend if available, otherwise fallback
  const names = scan.ruleNames || RULE_LABELS;

  for (const [key, rule] of Object.entries(scan.rules)) {
    const isPassed = rule.status === "PASS";
    const statusBadge = isPassed
      ? '<span class="badge bg-success">PASS</span>'
      : '<span class="badge bg-danger">VIOLATION</span>';

    tbody.innerHTML += `
      <tr>
        <td class="fw-semibold">${names[key] || key}</td>
        <td class="text-center">${statusBadge}</td>
        <td><code class="evidence-code">${rule.evidenceFound}</code></td>
        <td class="small">${rule.remarks}</td>
      </tr>
    `;
  }

  // Show the raw OCR text section
  const ocrSection = document.getElementById('ocr-section');
  ocrSection.style.display = 'block';
  document.getElementById('ocr-raw-text').innerText = scan.extractedText || "(No text extracted)";
  // Expand it by default so judges can see it immediately
  document.getElementById('ocr-body').style.display = 'block';
  document.getElementById('ocr-toggle-icon').className = 'bi bi-chevron-up';
}

// ── Toggle OCR Text Box ─────────────────────────────────────────────────────
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

// ── Load History ────────────────────────────────────────────────────────────
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
        <td class="align-middle">${scan.status}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-danger" onclick="deleteScan('${scan.id}')" title="Delete Scan">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>
    `;
  });

  document.getElementById('stat-total').innerText = scans.length;
  document.getElementById('stat-compliant').innerText = compliant;
  document.getElementById('stat-violations').innerText = scans.length - compliant;
}

// ── Delete Scan ─────────────────────────────────────────────────────────────
async function deleteScan(id) {
  if (!confirm("Are you sure you want to delete this scan from history?")) return;

  try {
    await fetch(`${API_BASE}/scans/${id}`, { method: 'DELETE' });
    if (currentScan && currentScan.id === id) {
      document.getElementById('report-card').style.display = 'none';
      document.getElementById('ocr-section').style.display = 'none';
    }
    loadHistory();
  } catch (e) {
    console.error("Failed to delete scan", e);
    alert("Failed to delete scan.");
  }
}