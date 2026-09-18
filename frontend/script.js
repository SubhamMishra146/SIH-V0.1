const API_BASE = "http://localhost:5000/api";
let selectedFile = null;
let currentScan = null;

document.addEventListener("DOMContentLoaded", loadHistory);

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

async function submitScan() {
  if (!selectedFile) return;
  const productName = document.getElementById("product-name").value || "Unknown Product";
  
  const formData = new FormData();
  formData.append("labelImage", selectedFile);
  formData.append("productName", productName);
  
  document.getElementById('scan-btn').disabled = true;
  document.getElementById('scan-btn').innerText = "Scanning...";
  
  try {
    const res = await fetch(`${API_BASE}/scan`, { method: "POST", body: formData });
    const result = await res.json();
    currentScan = result.scan;
    
    renderReportCard(currentScan);
    loadHistory();
  } catch (e) {
    console.error("Scan error", e);
    alert("Scan failed");
  } finally {
    document.getElementById('scan-btn').disabled = false;
    document.getElementById('scan-btn').innerText = "Run Compliance Check";
  }
}

function renderReportCard(scan) {
  document.getElementById('report-card').style.display = 'block';
  document.getElementById('report-product-name').innerText = scan.productName;
  document.getElementById('report-timestamp').innerText = new Date(scan.scannedAt).toLocaleString();
  
  const isCompliant = scan.status === "Compliant";
  document.getElementById('report-status-badge').innerHTML = 
    `<span class="compliance-status-badge ${isCompliant ? 'compliant' : 'non-compliant'}">${scan.status}</span>`;
    
  const rulesList = document.getElementById('rules-checklist');
  rulesList.innerHTML = '';
  
  for (const [key, rule] of Object.entries(scan.rules)) {
    const snippetHtml = `<div class="snippet-box">Evidence: ${rule.evidence}</div>`;
    
    rulesList.innerHTML += `
      <div class="rule-item ${rule.passed ? 'passed' : 'failed'} flex-column align-items-start">
        <div class="d-flex gap-2 w-100">
          <div>${rule.passed ? '✅' : '❌'}</div>
          <div class="w-100">
            <div class="fw-bold">${key.toUpperCase()}</div>
            ${snippetHtml}
          </div>
        </div>
      </div>
    `;
  }
}

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

async function deleteScan(id) {
  if (!confirm("Are you sure you want to delete this scan from history?")) return;
  
  try {
    await fetch(`${API_BASE}/scans/${id}`, { method: 'DELETE' });
    if (currentScan && currentScan.id === id) {
      document.getElementById('report-card').style.display = 'none';
    }
    loadHistory();
  } catch (e) {
    console.error("Failed to delete scan", e);
    alert("Failed to delete scan.");
  }
}
