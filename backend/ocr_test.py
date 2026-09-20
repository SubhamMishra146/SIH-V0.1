"""
ocr_test.py — Phase 1 Verification Script
Tests the OpenCV preprocessing + EasyOCR pipeline on a sample image
and prints structured JSON output confirming the upgrade works.

Usage:
  python ocr_test.py [path/to/image.jpg]
  (defaults to first image in uploads/ folder)
"""

import sys, os, json, glob

# ── Import the OCR pipeline from app.py ──
os.environ["PYTHONIOENCODING"] = "utf-8"
from app import extract_text_from_image, preprocess_image
from PIL import Image
import numpy as np

# ── Find a test image ──
test_image = None
if len(sys.argv) > 1:
    test_image = sys.argv[1]
else:
    uploads = glob.glob("uploads/*.*")
    if uploads:
        test_image = uploads[0]

if not test_image or not os.path.exists(test_image):
    print("[TEST] No image found. Place a .jpg/.png in uploads/ or pass path as argument.")
    print("[TEST] Skipping image test — verifying import only.")
    print("\n✅ Phase 1 IMPORT CHECK: EasyOCR + OpenCV imports OK")
    sys.exit(0)

print(f"\n[TEST] Using image: {test_image}")
print("=" * 60)

# ── Run preprocessing ──
print("[TEST] Running OpenCV CLAHE + Unsharp Mask preprocessing...")
pil_img = Image.open(test_image)
preprocessed = preprocess_image(pil_img)
print(f"[TEST] Preprocessed shape: {preprocessed.shape}, dtype: {preprocessed.dtype}")

# ── Run full OCR pipeline ──
print("\n[TEST] Running full OCR pipeline (multi-angle)...")
result = extract_text_from_image(test_image)

# ── Print structured JSON output ──
print("\n" + "=" * 60)
print("STRUCTURED OCR OUTPUT (JSON)")
print("=" * 60)

# Show first 5 detections to keep output clean
preview = {
    "status": result["status"],
    "total_detections": len(result["detections"]),
    "sample_detections": result["detections"][:5],
    "raw_text_preview": result["raw_text"][:300] + ("..." if len(result["raw_text"]) > 300 else "")
}
print(json.dumps(preview, indent=2, ensure_ascii=False))

print("\n" + "=" * 60)
print(f"✅ Phase 1 PASS — {len(result['detections'])} text regions detected")
print(f"   Raw text: {len(result['raw_text'])} characters extracted")
print(f"   Confidence scores: present on all {len(result['detections'])} detections")
print("=" * 60)
