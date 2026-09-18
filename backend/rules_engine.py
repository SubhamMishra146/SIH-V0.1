import re

def check_rule_mrp(text):
    """Rule 6(1)(e): Retail sale price (MRP) and inclusive of all taxes"""
    has_mrp = bool(re.search(r'(m\.?r\.?p|₹|rs\.?|price)', text, re.IGNORECASE))
    has_tax = bool(re.search(r'(incl|inclusive).*?(tax|taxes)', text, re.IGNORECASE))
    
    if has_mrp and has_tax:
        return {"passed": True, "evidence": "MRP and 'inclusive of all taxes' found."}
    if has_mrp:
        return {"passed": False, "evidence": "VIOLATION: 'inclusive of all taxes' text missing."}
    return {"passed": False, "evidence": "VIOLATION: MRP missing from label."}

def check_rule_net_quantity(text):
    """Rule 6(1)(c): Net quantity"""
    qty_match = re.search(r'\b(\d+[\.,]?\d*)\s*(g|kg|mg|ml|l|litre|liter|pcs|pieces)\b', text, re.IGNORECASE)
    if qty_match:
        return {"passed": True, "evidence": f"Net quantity {qty_match.group(0)} found."}
    return {"passed": False, "evidence": "VIOLATION: Net quantity missing or not in standard units."}

def check_rule_mfg_date(text):
    """Rule 6(1)(d): Month and year of manufacture/packing"""
    date_indicator = bool(re.search(r'(mfg|mfd|pkd|packed|batch|b\.?no\.?|lot)', text, re.IGNORECASE))
    date_val = bool(re.search(r'(\d{2}[\/\-]\d{2,4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)', text, re.IGNORECASE))
    
    if date_indicator and date_val:
        return {"passed": True, "evidence": "Manufacturing/Packing date found."}
    return {"passed": False, "evidence": "VIOLATION: Manufacturing date missing."}

def check_rule_manufacturer(text):
    """Rule 6(1)(a): Name and address of manufacturer/packer/importer"""
    mfg_name = bool(re.search(r'(mfg by|manufactured by|marketed by|packed by)', text, re.IGNORECASE))
    mfg_address = bool(re.search(r'\b\d{6}\b|ltd|pvt|industrial|estate|mumbai|delhi|bangalore', text, re.IGNORECASE))
    
    if mfg_name and mfg_address:
        return {"passed": True, "evidence": "Manufacturer name and address found."}
    return {"passed": False, "evidence": "VIOLATION: Complete manufacturer details missing."}

def check_rule_consumer_care(text):
    """Rule 6(1)(g): Consumer care details"""
    care_keywords = bool(re.search(r'(care|feedback|write to|customer care|grievance)', text, re.IGNORECASE))
    contact_details = bool(re.search(r'(\+91[\s-]?)?(\b[6-9]\d{9}\b|\b1800[\s-]\d{2,3}[\s-]\d{4}\b)|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text, re.IGNORECASE))
    
    if care_keywords or contact_details:
        return {"passed": True, "evidence": "Consumer care contact details found."}
    return {"passed": False, "evidence": "VIOLATION: Consumer care details missing."}

def run_compliance_check(text):
    """Runs all Legal Metrology rules against the provided text"""
    rules = {
        "mrp": check_rule_mrp(text),
        "netQuantity": check_rule_net_quantity(text),
        "mfgDate": check_rule_mfg_date(text),
        "manufacturerDetails": check_rule_manufacturer(text),
        "consumerCare": check_rule_consumer_care(text)
    }
    
    violations = [k for k, v in rules.items() if not v["passed"]]
    status = "Compliant" if len(violations) == 0 else "Non-Compliant"
    
    return {
        "rules": rules,
        "violations": violations,
        "status": status
    }