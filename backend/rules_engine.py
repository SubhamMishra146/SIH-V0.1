"""
rules_engine.py — Legal Metrology (Packaged Commodities) Rules, 2011
Evidence-based compliance checker with OCR fault-tolerance.

v4 Changes:
  - Added ocr_clean() step to fix common Tesseract typos BEFORE rule checks
  - All regex patterns are now tolerant of garbled characters and missing punctuation
  - Emails with broken spaces around @ and . are auto-repaired

Each rule function returns:
  { status: "PASS" or "VIOLATION", evidenceFound: str, remarks: str }
"""

import re


# ═══════════════════════════════════════════════════════════════════════════
# STEP 0: OCR Pre-Cleaning
# ═══════════════════════════════════════════════════════════════════════════

def ocr_clean(text):
    """
    Fix common Tesseract OCR misspellings and character-swap errors
    BEFORE running any compliance rule. This increases detection accuracy.
    """
    # 1. Normalize whitespace: replace line breaks with spaces, collapse multi-spaces
    cleaned = text.replace('\n', ' ').replace('\r', ' ')
    cleaned = re.sub(r'\s+', ' ', cleaned)

    # 2. Convert to lowercase for easier matching
    cleaned = cleaned.lower()

    # 3. Fix common OCR misspellings (Tesseract letter-swaps)
    ocr_fixes = {
        "laxes": "taxes",           # t -> l swap
        "iaxes": "taxes",           # t -> i swap
        "taxcs": "taxes",           # e -> c swap
        "manutacured": "manufactured",
        "manutactured": "manufactured",
        "manufacured": "manufactured",
        "manufatured": "manufactured",
        "manuafctured": "manufactured",
        "manulactured": "manufactured",  # f -> l swap
        "markeled": "marketed",
        "inclusve": "inclusive",
        "inclusivo": "inclusive",    # e -> o swap
        "inclus1ve": "inclusive",    # i -> 1 swap
        "consumar": "consumer",
        "cuslomer": "customer",     # t -> l swap
        "custorner": "customer",    # m -> rn swap
    }
    for wrong, right in ocr_fixes.items():
        cleaned = cleaned.replace(wrong, right)

    # 4. Fix "Dy" / "dy" -> "by" when preceded by manufactur/pack/market
    cleaned = re.sub(r'(manufactur\w*|pack\w*|market\w*)\s+dy\b', r'\1 by', cleaned)

    # 5. Fix broken emails: collapse spaces around @ and before .com/.in/.org
    cleaned = re.sub(r'\s*@\s*', '@', cleaned)
    cleaned = re.sub(r'\s*\.\s*(com|in|org|net|edu|co)\b', r'.\1', cleaned)

    return cleaned


# ═══════════════════════════════════════════════════════════════════════════
# RULE 1: MRP & Tax Declaration [Rule 6(1)(e)]
# ═══════════════════════════════════════════════════════════════════════════

def check_mrp(cleaned, original):
    """
    Must have MRP/price AND 'inclusive of all taxes/GST' clause.
    Handles: "MRP: ? 185/-", "M.R.P. ₹ : 220.00", garbled rupee symbols.
    """

    # Find MRP keyword followed by digits within 15 chars
    # Handles: mrp : ? 185/-, m.r.p. ₹ : 220.00, mrp rs. 50, mrp 100
    # The [^a-z]{0,15}? skips any non-letter junk (?, ₹, :, spaces, =, *)
    price_match = re.search(
        r'(m\.?r\.?p\.?[^a-z]{0,15}?(\d+(?:[.,]\d{1,2})?\s*(?:/\-?)?))',
        cleaned
    )

    # Also try standalone rs/₹ with number if MRP keyword not found
    if not price_match:
        price_match = re.search(
            r'((?:rs\.?|₹)\s*[:\-]?\s*(\d+(?:[.,]\d{1,2})?\s*(?:/\-?)?))',
            cleaned
        )

    # Check for tax / GST clause
    has_tax = bool(re.search(r'(incl\w*\.?\s*(of\s*)?(all\s*)?(tax\w*|gst))', cleaned))

    if price_match and has_tax:
        # Try to grab a bigger snippet showing both price and tax together
        full_snippet = re.search(
            r'(m\.?r\.?p\.?[^a-z]{0,15}?\d+(?:[.,]\d{1,2})?\s*(?:/\-?)?.{0,30}?(tax\w*|gst))',
            cleaned
        )
        evidence = full_snippet.group(0).strip() if full_snippet else price_match.group(0).strip()
        return {
            "status": "PASS",
            "evidenceFound": f"Matched: '{evidence}'",
            "remarks": "MRP with inclusive-of-all-taxes/GST clause found."
        }
    elif price_match:
        return {
            "status": "VIOLATION",
            "evidenceFound": f"Found price: '{price_match.group(0).strip()}'",
            "remarks": "Found price but MISSING mandatory 'inclusive of all taxes' or 'GST' clause."
        }
    elif re.search(r'm\.?r\.?p', cleaned):
        return {
            "status": "VIOLATION",
            "evidenceFound": "MRP keyword found but price number not readable",
            "remarks": "MRP text detected but price value and tax clause not clearly readable by OCR."
        }
    else:
        return {
            "status": "VIOLATION",
            "evidenceFound": "None detected in scanned label",
            "remarks": "No MRP / price declaration found on the label."
        }


# ═══════════════════════════════════════════════════════════════════════════
# RULE 2: Net Quantity [Rule 6(1)(c)]
# ═══════════════════════════════════════════════════════════════════════════

def check_net_quantity(cleaned, original):
    """
    Supports two formats, with or without colons/punctuation:
      - Unit before number:  "Pages 400", "Pages: 368", "Net Wt: 500g"
      - Number before unit:  "500g", "368 pages", "1 litre"
    """

    # Format 1: Unit keyword then optional colon then number
    unit_before = re.search(
        r'((?:pages|page|pgs|leaves|sheets|pcs|pieces|units|nos|net\s*wt\.?|net\s*quantity|net\s*qty|net\s*content)\s*[:\-]?\s*(\d+[\.,]?\d*))',
        cleaned
    )

    # Format 2: Number then unit
    num_before = re.search(
        r'((\d+[\.,]?\d*)\s*(g|gm|gms|gram|grams|kg|kgs|mg|ml|mls|l|ltr|litre|liter|litres|liters|pcs|pieces|pages|page|pgs|leaves|sheets|units|nos)\b)',
        cleaned
    )

    if unit_before:
        return {
            "status": "PASS",
            "evidenceFound": f"Found: {unit_before.group(0).strip()}",
            "remarks": f"Net quantity '{unit_before.group(0).strip()}' declared."
        }
    elif num_before:
        return {
            "status": "PASS",
            "evidenceFound": f"Found: {num_before.group(0).strip()}",
            "remarks": f"Net quantity '{num_before.group(0).strip()}' declared in valid units."
        }
    else:
        return {
            "status": "VIOLATION",
            "evidenceFound": "None detected in scanned label",
            "remarks": "No Net Quantity with valid unit (g, kg, ml, l, pcs, pages, sheets) detected."
        }


# ═══════════════════════════════════════════════════════════════════════════
# RULE 3: Date of Mfg / Packing [Rule 6(1)(d)]
# ═══════════════════════════════════════════════════════════════════════════

def check_mfg_date(cleaned, original):
    """
    Matches real date formats. Rejects decimals like '20.00'.
    Handles OCR misreads like "PKG DL" for "PKG DT".
    Valid: MM/YYYY, MM-YYYY, MM/YY, MonthName YYYY, "APR 2020"
    """

    # Date keyword (tolerant: "pkg dt", "pkg dl", "mfg", "batch", etc.)
    keyword_match = re.search(
        r'(mfg\.?d?\.?|mfd\.?|pkd\.?|pkg\s*d[tl]\.?|packed|pack\s*date|batch|b\.?\s*no\.?|lot|best\s*before|exp\.?\s*date|use\s*by|date\s*of)',
        cleaned
    )

    # Strict numeric date: MM/YYYY or MM-YYYY or MM/YY (month 01-12)
    numeric_date = re.search(
        r'\b(0[1-9]|1[0-2])\s*[\/\-\.]\s*(20\d{2}|\d{2})\b',
        cleaned
    )

    # Month name (3-letter) followed by year, with flexible separators
    month_name_date = re.search(
        r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.,\/\-]*(20\d{2}|\d{2})\b',
        cleaned
    )

    date_match = numeric_date or month_name_date

    if keyword_match and date_match:
        return {
            "status": "PASS",
            "evidenceFound": f"Matched: '{keyword_match.group(0).strip()}' with date '{date_match.group(0).strip()}'",
            "remarks": "Manufacturing / Packing date is declared."
        }
    elif date_match:
        return {
            "status": "PASS",
            "evidenceFound": f"Date found: '{date_match.group(0).strip()}'",
            "remarks": "Date value found but keyword (Mfg/Pkd) not clearly detected. Accepting date."
        }
    else:
        return {
            "status": "VIOLATION",
            "evidenceFound": "None detected in scanned label",
            "remarks": "No valid manufacturing/packing date (MM/YYYY or Month YYYY) found."
        }


# ═══════════════════════════════════════════════════════════════════════════
# RULE 4: Manufacturer / Packer Details [Rule 6(1)(a)]
# ═══════════════════════════════════════════════════════════════════════════

def check_manufacturer(cleaned, original):
    """
    Catches partial OCR matches like "manufactur" (without full word).
    Also catches corporate suffixes and Indian locations.
    """

    # Keyword: partial match "manufactur" catches manufactured/manufacturing/etc.
    keyword_match = re.search(
        r'(manufactur\w*\s*by|mfg\.?\s*by|marketed\s*by|packed\s*by|imported\s*by|product\s*by|premium\s*product\s*by|fssai\s*lic)',
        cleaned
    )

    # Corporate suffixes
    company_match = re.search(
        r'(multi\s*pap|paper\s*products?|industries|enterprises|foods?\s|products?\s|pvt\.?\s*ltd\.?|limited|private|inc\.?|corp\.?|co\.?\s*ltd|llp|group)',
        cleaned
    )

    # Indian locations (cities + states + pincodes)
    address_match = re.search(
        r'(\b\d{6}\b|mumbai|delhi|bangalore|bengaluru|chennai|kolkata|hyderabad|pune|ahmedabad|jaipur|lucknow|bhubaneswar|odisha|orissa|chandigarh|noida|gurgaon|ghaziabad|kerala|tamil\s*nadu|karnataka|maharashtra|gujarat|rajasthan|uttar\s*pradesh|madhya\s*pradesh|west\s*bengal|andhra|telangana|assam|bihar|punjab|haryana|chhattisgarh|jharkhand|sivakasi)',
        cleaned
    )

    if keyword_match and (company_match or address_match):
        parts = [keyword_match.group(0).strip()]
        if company_match:
            parts.append(company_match.group(0).strip())
        if address_match:
            parts.append(address_match.group(0).strip())
        return {
            "status": "PASS",
            "evidenceFound": f"Matched: '{' ... '.join(parts)}'",
            "remarks": "Manufacturer / Packer name and address details found."
        }
    elif company_match and address_match:
        return {
            "status": "PASS",
            "evidenceFound": f"Matched: '{company_match.group(0).strip()} ... {address_match.group(0).strip()}'",
            "remarks": "Company name and location found (keyword like 'Mfg by' not explicit)."
        }
    elif keyword_match:
        return {
            "status": "VIOLATION",
            "evidenceFound": f"Found keyword: '{keyword_match.group(0).strip()}'",
            "remarks": "Manufacturer keyword found but complete address (pincode/city) not detected."
        }
    else:
        return {
            "status": "VIOLATION",
            "evidenceFound": "None detected in scanned label",
            "remarks": "No manufacturer/packer/importer declaration found on the label."
        }


# ═══════════════════════════════════════════════════════════════════════════
# RULE 5: Consumer Care [Rule 6(1)(g)]
# ═══════════════════════════════════════════════════════════════════════════

def check_consumer_care(cleaned, original):
    """
    Detects phone numbers (10-digit mobile, 1800 toll-free, STD landline)
    and emails (after OCR space-collapse fix).
    """

    # Email (on cleaned text where spaces around @ are already fixed)
    email_match = re.search(r'[a-z0-9._%+\-]+@[a-z0-9.\-]+\.(com|in|org|net|edu|co)', cleaned)

    # Phone: 10-digit Indian mobile
    mobile_match = re.search(r'\b[6-9]\d{9}\b', cleaned)

    # Phone: 1800 toll-free (various formats)
    tollfree_match = re.search(r'1800[\s\-]?\d{2,3}[\s\-]?\d{3,4}', cleaned)

    # Phone: STD landline (e.g., 044-12345678, 0484-2345678)
    landline_match = re.search(r'\b0\d{2,4}[\s\-]?\d{6,8}\b', cleaned)

    # Also check for "customer care" or "consumer care" keyword near contact info
    care_keyword = bool(re.search(r'(customer\s*care|consumer\s*care|helpline|grievance|feedback|write\s*to|contact\s*us)', cleaned))

    phone_match = mobile_match or tollfree_match or landline_match

    if email_match and phone_match:
        phone_str = phone_match.group(0).strip()
        return {
            "status": "PASS",
            "evidenceFound": f"Email: {email_match.group(0)} | Phone: {phone_str}",
            "remarks": "Both email and phone contact details found."
        }
    elif email_match:
        return {
            "status": "PASS",
            "evidenceFound": f"Email: {email_match.group(0)}",
            "remarks": "Consumer care email found."
        }
    elif phone_match:
        return {
            "status": "PASS",
            "evidenceFound": f"Phone: {phone_match.group(0).strip()}",
            "remarks": "Consumer care phone/helpline found."
        }
    elif care_keyword:
        return {
            "status": "VIOLATION",
            "evidenceFound": "'Customer Care' keyword found but no phone/email detected",
            "remarks": "Care keyword present but actual contact info not readable by OCR."
        }
    else:
        return {
            "status": "VIOLATION",
            "evidenceFound": "None detected in scanned label",
            "remarks": "No consumer care contact (email or phone number) found."
        }


# ═══════════════════════════════════════════════════════════════════════════
# Master Runner
# ═══════════════════════════════════════════════════════════════════════════

RULE_NAMES = {
    "mrp": "MRP & Tax Declaration",
    "netQuantity": "Net Quantity",
    "mfgDate": "Date of Mfg / Packing",
    "manufacturerDetails": "Manufacturer / Packer Details",
    "consumerCare": "Consumer Care Info"
}

def run_compliance_check(text):
    """Run all 5 Legal Metrology rules against the OCR text."""

    # ── Debug: print raw text to terminal ──
    print("=" * 60)
    print("=== RAW OCR TEXT ===")
    print(text)

    # ── Step 1: Clean OCR errors ──
    cleaned = ocr_clean(text)
    print("=== CLEANED TEXT ===")
    print(cleaned)
    print("=" * 60)

    # ── Step 2: Run all rules (pass both cleaned and original) ──
    rules = {
        "mrp": check_mrp(cleaned, text),
        "netQuantity": check_net_quantity(cleaned, text),
        "mfgDate": check_mfg_date(cleaned, text),
        "manufacturerDetails": check_manufacturer(cleaned, text),
        "consumerCare": check_consumer_care(cleaned, text)
    }

    # ── Debug: log each result ──
    for key, result in rules.items():
        print(f"  [{result['status']}] {RULE_NAMES[key]}: {result['evidenceFound']}")
    print("=" * 60)

    violations = [k for k, v in rules.items() if v["status"] == "VIOLATION"]
    status = "Compliant" if len(violations) == 0 else "Non-Compliant"

    return {
        "rules": rules,
        "ruleNames": RULE_NAMES,
        "violations": violations,
        "status": status
    }