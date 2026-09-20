"""
app.py — Flask backend for SIH Legal Metrology Compliance Checker
Uses EasyOCR (with EasyOCR angle detection) + OpenCV CLAHE preprocessing
to extract text from uploaded packaging label images, then runs the
Python rules engine for Legal Metrology compliance checking.

Phase 1 Upgrades:
  - OpenCV CLAHE + unsharp mask preprocessing for glossy/foil label glare removal
  - Structured JSON OCR output with confidence scores per detection
  - Multi-angle orientation with keyword scoring (auto-selects best rotation)
  - /health endpoint
  - 25 MB max upload size
  - CORS open for hackathon evaluation
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os, json, uuid, datetime
from rules_engine import run_compliance_check

app = Flask(__name__, static_folder='../frontend')
CORS(app, origins="*")

# Allow high-res smartphone photos (up to 25 MB)
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024

DATA_FILE = 'data.json'
UPLOAD_FOLDER = 'uploads'

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# ── OCR & Image Libraries ─────────────────────────────────────────────────────
import easyocr
import cv2
import numpy as np
from PIL import Image

print("[OCR] EasyOCR will be loaded on first scan request (lazy init).")
ocr_reader = None  # Loaded on first request to save startup RAM

def get_ocr_reader():
    """Lazy-initialize EasyOCR — only load it when first scan arrives."""
    global ocr_reader
    if ocr_reader is None:
        print("[OCR] Loading EasyOCR model (first scan)...")
        ocr_reader = easyocr.Reader(['en'], gpu=False)
        print("[OCR] EasyOCR ready.")
    return ocr_reader


# ═══════════════════════════════════════════════════════════════════════════════
# PREPROCESSING: OpenCV CLAHE + Unsharp Mask
# Purpose: Remove glare from glossy foil/plastic packaging, sharpen fine print
# ═══════════════════════════════════════════════════════════════════════════════

def preprocess_image(pil_img):
    """
    Apply packaging-focused image preprocessing before OCR:
    1. CLAHE on LAB L-channel  -> neutralizes glare hot-spots on glossy labels
    2. Unsharp mask             -> sharpens tiny 6pt-8pt mandatory declaration text
    Returns: preprocessed image as numpy RGB array (ready for EasyOCR)
    """
    # Convert PIL -> OpenCV BGR
    img_bgr = cv2.cvtColor(np.array(pil_img.convert('RGB')), cv2.COLOR_RGB2BGR)

    # Step 1: CLAHE on LAB L-channel to remove glare without blowing out highlights
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_channel = clahe.apply(l_channel)
    lab = cv2.merge([l_channel, a_channel, b_channel])
    img_enhanced = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

    # Step 2: Unsharp mask to sharpen fine print
    blurred = cv2.GaussianBlur(img_enhanced, (0, 0), sigmaX=2)
    img_sharp = cv2.addWeighted(img_enhanced, 1.5, blurred, -0.5, 0)

    # Return as RGB numpy array (EasyOCR expects RGB)
    return cv2.cvtColor(img_sharp, cv2.COLOR_BGR2RGB)


# ═══════════════════════════════════════════════════════════════════════════════
# OCR: Multi-Angle Extraction with Structured JSON Output
# ═══════════════════════════════════════════════════════════════════════════════

# Keywords that indicate regulatory text — used to score orientation quality
REGULATORY_KEYWORDS = [
    "mrp", "rs", "₹", "tax", "gst", "net", "qty", "commodity", "mfg", "pkd",
    "packed", "date", "manufactur", "marketed", "product", "ltd", "pvt", "care",
    "customer", "consumer", "email", "phone", "1800", "number", "incl", "expiry"
]

def score_text(text):
    """Count how many regulatory keywords appear in a block of text."""
    t = text.lower()
    return sum(1 for kw in REGULATORY_KEYWORDS if kw in t)


def run_ocr_on_array(img_array):
    """
    Run EasyOCR on a numpy RGB array.
    Returns list of dicts: [{text, confidence, box}, ...]
    """
    raw_results = get_ocr_reader().readtext(img_array, detail=1)
    detections = []
    for i, (bbox, text, conf) in enumerate(raw_results):
        detections.append({
            "id": i + 1,
            "text": text,
            "confidence": round(float(conf), 4),
            "box": [[int(pt[0]), int(pt[1])] for pt in bbox]
        })
    return detections


def extract_text_from_image(image_path):
    """
    Full pipeline:
      1. Open image with PIL
      2. Preprocess (CLAHE + unsharp mask)
      3. Run EasyOCR at 0° (preprocessed)
      4. If regulatory score is low, also test 270°, 90°, 180° rotations
      5. Use the orientation that captured the most regulatory keywords
      6. Return structured JSON with all detections + raw_text
    """
    try:
        base_pil = Image.open(image_path)
        if base_pil.mode != 'RGB':
            base_pil = base_pil.convert('RGB')
    except Exception as e:
        print(f"[OCR] Error opening image: {e}")
        return {
            "status": "error",
            "detections": [],
            "raw_text": f"Could not open image: {e}"
        }

    # Preprocess the image
    preprocessed = preprocess_image(base_pil)

    # Primary pass at 0°
    print("[OCR] Running at 0° (preprocessed)...")
    dets_0 = run_ocr_on_array(preprocessed)
    text_0 = " ".join(d["text"] for d in dets_0)
    score_0 = score_text(text_0)
    print(f"[OCR] 0°: {len(dets_0)} detections, {len(text_0)} chars, score={score_0}")

    best_dets = dets_0
    best_text = text_0
    best_score = score_0

    # If 0° is weak, try rotations — common for vertical pouches and sachets
    angles_to_try = [270, 90] if score_0 >= 4 else [270, 90, 180]

    for angle in angles_to_try:
        rotated_pil = base_pil.rotate(angle, expand=True)
        rotated_arr = preprocess_image(rotated_pil)
        print(f"[OCR] Running at {angle}°...")
        dets_rot = run_ocr_on_array(rotated_arr)
        text_rot = " ".join(d["text"] for d in dets_rot)
        score_rot = score_text(text_rot)
        print(f"[OCR] {angle}°: {len(dets_rot)} detections, score={score_rot}")

        if score_rot > best_score:
            best_score = score_rot
            best_dets = dets_rot
            best_text = text_rot
            print(f"[OCR] Switched to {angle}° (better score: {score_rot})")

    # If rotated orientation was significantly better, also append 0° text
    # so we don't lose horizontally-printed text (e.g., barcode numbers)
    if best_text != text_0 and len(text_0) > 20:
        combined_raw = (best_text + " " + text_0).strip()
    else:
        combined_raw = best_text

    print(f"[OCR] Final: {len(best_dets)} detections, combined raw text: {len(combined_raw)} chars")

    return {
        "status": "success",
        "detections": best_dets,
        "raw_text": combined_raw
    }


# ── Data helpers ─────────────────────────────────────────────────────────────

def read_data():
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"scans": []}

def write_data(data):
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route('/health')
def health():
    """Health check endpoint for Render / load balancers."""
    return jsonify({"status": "healthy"}), 200

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(app.static_folder, path)

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)


@app.route('/api/scan', methods=['POST'])
def scan():
    product_name = request.form.get('productName', 'Unknown Product')

    # Step 1: Save uploaded image
    image_path = ""
    saved_path = ""
    if 'labelImage' in request.files:
        file = request.files['labelImage']
        if file.filename != '':
            filename = f"{uuid.uuid4().hex}_{file.filename}"
            saved_path = os.path.join(UPLOAD_FOLDER, filename)
            file.save(saved_path)
            image_path = f"uploads/{filename}"

    # Step 2: Run OCR pipeline
    ocr_result = {"status": "error", "detections": [], "raw_text": ""}
    if saved_path and os.path.exists(saved_path):
        print(f"\n[OCR] ── Scanning: {saved_path}")
        ocr_result = extract_text_from_image(saved_path)
    else:
        ocr_result["raw_text"] = "(No image uploaded — nothing to scan)"

    # Step 3: Run compliance rules against raw OCR text
    result = run_compliance_check(ocr_result["raw_text"])

    scan_record = {
        "id": str(uuid.uuid4()),
        "productName": product_name,
        "imagePath": image_path,
        "scannedAt": datetime.datetime.now(datetime.UTC).isoformat(),
        "status": result["status"],
        "extractedText": ocr_result["raw_text"],
        "detections": ocr_result["detections"],   # structured per-word OCR data
        "rules": result["rules"],
        "ruleNames": result["ruleNames"],
        "violations": result["violations"]
    }

    data = read_data()
    data["scans"].insert(0, scan_record)
    write_data(data)

    return jsonify({
        "message": f"Scan complete. Status: {result['status']}",
        "scan": scan_record
    })


@app.route('/api/scans', methods=['GET'])
def get_scans():
    data = read_data()
    return jsonify(data["scans"])

@app.route('/api/scans', methods=['DELETE'])
def clear_scans():
    write_data({"scans": []})
    return jsonify({"message": "History cleared."})

@app.route('/api/scans/<scan_id>', methods=['DELETE'])
def delete_scan(scan_id):
    data = read_data()
    initial_len = len(data["scans"])
    data["scans"] = [s for s in data["scans"] if s["id"] != scan_id]

    if len(data["scans"]) == initial_len:
        return jsonify({"error": "Scan not found"}), 404

    write_data(data)
    return jsonify({"message": "Scan deleted successfully."})


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)