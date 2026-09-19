"""Test the v4 rules engine against real Tesseract OCR errors."""
from rules_engine import run_compliance_check

# Simulated OCR output with all the real typos you reported
test_text = """MRP: ? 185/-
Inclusive of all laxes
Pages 400
Manutacured Dy Multi Pap Limited Sivakasi
PKG DL: APR 2020
En sts @sundaramgroups . in
Customer Care: 8369691119"""

print("=" * 60)
print("TEST: Real Tesseract OCR errors from notebook scan")
print("=" * 60)
result = run_compliance_check(test_text)

print("\n--- FINAL RESULTS ---")
for k, v in result["rules"].items():
    print(f"  {k}: {v['status']} -> {v['evidenceFound']}")
print(f"\nOverall: {result['status']}")
