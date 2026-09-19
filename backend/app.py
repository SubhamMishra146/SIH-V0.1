"""
app.py — Flask backend for SIH Legal Metrology Compliance Checker
Uses EasyOCR to extract text from uploaded packaging label images,
then runs the Python rules engine against the extracted text.
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os, json, uuid, datetime
from rules_engine import run_compliance_check

app = Flask(__name__, static_folder='../frontend')
CORS(app)

DATA_FILE = 'data.json'
UPLOAD_FOLDER = 'uploads'

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# ── OCR Setup ────────────────────────────────────────────────────────────────
# We initialise the EasyOCR reader once at startup so it doesn't reload
# the model on every request (it's slow the first time, fast after that).
import easyocr
print("[OCR] Loading EasyOCR model (first time may download ~100 MB)...")
ocr_reader = easyocr.Reader(['en'], gpu=False)
print("[OCR] EasyOCR ready.")


from PIL import Image
import numpy as np

def extract_text_from_image(image_path):
    """
    Run EasyOCR on an image file with orientation-agnostic multi-angle fallback.
    Reads packaging text in all orientations (0°, 270°, 90°, 180°) so vertical
    and rotated labels (e.g., scrub pads, side flaps, margin fine print) are not missed.
    """
    try:
        base_img = Image.open(image_path)
        if base_img.mode != 'RGB':
            base_img = base_img.convert('RGB')
    except Exception as e:
        print(f"[OCR] Error opening image with PIL: {e}")
        results = ocr_reader.readtext(image_path, detail=0)
        return " ".join(results)

    # Regulatory indicator keywords for scoring orientation quality
    keywords = ["mrp", "rs", "₹", "tax", "gst", "net", "qty", "commodity", "mfg", "pkd",
                "packed", "date", "manufactur", "marketed", "product", "ltd", "pvt", "care",
                "customer", "consumer", "email", "phone", "1800", "number"]

    def score_text(t):
        t_low = t.lower()
        return sum(1 for kw in keywords if kw in t_low)

    # 1. Primary pass (0 degrees)
    results_0 = ocr_reader.readtext(np.array(base_img), detail=0)
    text_0 = " ".join(results_0)
    score_0 = score_text(text_0)
    print(f"[OCR] Orientation 0°: {len(text_0)} chars, score={score_0}")

    best_text = text_0
    best_score = score_0
    all_texts = [text_0]

    # If 0° has poor keyword detection (< 3), rotate through 270°, 90°, and 180°
    # 270° (90° CCW) is the most common vertical orientation for pouches & sachets
    check_angles = [270, 90] if score_0 >= 4 else [270, 90, 180]

    for angle in check_angles:
        rotated = base_img.rotate(angle, expand=True)
        res = ocr_reader.readtext(np.array(rotated), detail=0)
        text_rot = " ".join(res)
        score_rot = score_text(text_rot)
        print(f"[OCR] Orientation {angle}°: {len(text_rot)} chars, score={score_rot}")

        if score_rot > best_score:
            best_score = score_rot
            best_text = text_rot

        if len(text_rot.strip()) > 10:
            all_texts.append(text_rot)

    # If rotated orientation yielded better regulatory data, use it as primary
    if best_score > score_0:
        print(f"[OCR] Rotated orientation selected (score {best_score} vs {score_0} at 0°)")
        return (best_text + " " + text_0).strip()
    else:
        # Combine unique streams to capture vertical margins alongside horizontal text
        combined = " ".join([t for t in all_texts if len(t) > 15])
        return combined.strip() if combined else text_0


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


# ── Routes ───────────────────────────────────────────────────────────────────
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

    # ── Step 1: Save uploaded image ──────────────────────────────────────
    image_path = ""
    saved_path = ""
    if 'labelImage' in request.files:
        file = request.files['labelImage']
        if file.filename != '':
            filename = f"{uuid.uuid4().hex}_{file.filename}"
            saved_path = os.path.join(UPLOAD_FOLDER, filename)
            file.save(saved_path)
            image_path = f"uploads/{filename}"

    # ── Step 2: Extract text using OCR ───────────────────────────────────
    extracted_text = ""
    if saved_path and os.path.exists(saved_path):
        print(f"[OCR] Running OCR on: {saved_path}")
        extracted_text = extract_text_from_image(saved_path)
        print(f"[OCR] Extracted {len(extracted_text)} characters.")
    else:
        extracted_text = "(No image uploaded — nothing to scan)"

    # ── Step 3: Run the compliance rule engine ───────────────────────────
    result = run_compliance_check(extracted_text)

    scan_record = {
        "id": str(uuid.uuid4()),
        "productName": product_name,
        "imagePath": image_path,
        "scannedAt": datetime.datetime.utcnow().isoformat() + "Z",
        "status": result["status"],
        "extractedText": extracted_text,
        "rules": result["rules"],
        "ruleNames": result["ruleNames"],
        "violations": result["violations"]
    }

    data = read_data()
    data["scans"].insert(0, scan_record)
    write_data(data)

    return jsonify({"message": f"Scan complete. Status: {result['status']}", "scan": scan_record})


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
    app.run(port=5000, debug=True)