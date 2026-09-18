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

# Hardcoded MOCK database since we are skipping OCR
MOCK_OCR_DB = {
    "parle-g": "Parle-G Glucose Biscuits Net Wt. 200g MRP Rs. 20/- Inclusive of all taxes Mfg by Parle Products Pvt. Ltd. Mumbai - 400055 Mfg Date: 08/2026 Consumer Care: 1800-103-1020",
    "fortune": "Fortune Sunflower Oil Net Content 1 Litre MRP Rs. 145 incl. of all taxes Manufactured by Adani Wilmar Ltd. Pkg Date: 07/2026", # missing consumer care
    "surf": "Surf Excel Detergent Powder 500g Mfg by Hindustan Unilever Ltd. Mumbai - 400099 Mfg: Sep 2026 Consumer Care: 1800-22-2210" # missing MRP
}

def read_data():
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"scans": []}

def write_data(data):
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

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
    
    # Save the file if provided
    image_path = ""
    if 'labelImage' in request.files:
        file = request.files['labelImage']
        if file.filename != '':
            filename = f"{uuid.uuid4().hex}_{file.filename}"
            file.save(os.path.join(UPLOAD_FOLDER, filename))
            image_path = f"uploads/{filename}"

    # Hardcoded text extraction based on product name
    extracted_text = "Standard Product. MRP Rs. 100 inclusive of all taxes. Net Wt 500g. Mfg Date 10/2026. Mfg by Standard Co, Delhi 110001. Care: care@standard.com"
    for key, val in MOCK_OCR_DB.items():
        if key.lower() in product_name.lower():
            extracted_text = val
            break
            
    # Run the hardcoded python rule engine
    result = run_compliance_check(extracted_text)
    
    scan_record = {
        "id": str(uuid.uuid4()),
        "productName": product_name,
        "imagePath": image_path,
        "scannedAt": datetime.datetime.utcnow().isoformat() + "Z",
        "status": result["status"],
        "extractedText": extracted_text, # Just for history
        "rules": result["rules"],
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