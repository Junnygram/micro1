def calculate_total(items, discount_pct=0.0):
    # BUG 1: applying discount incorrectly (multiplying by discount_pct/10 instead of discount_pct/100)
    # BUG 2: fails on empty cart (return total should be 0.0)
    # BUG 3: fails if item is missing "quantity" or "price", raises KeyError without default fallback
    total = 0.0
    for item in items:
        total += item["price"] * item["quantity"]
    
    # If discount_pct is 10 (representing 10%), this subtracts total * 1.0 (100% discount)
    discount_amount = total * (discount_pct / 10.0)
    return total - discount_amount

def apply_shipping(total, country):
    # BUG: raises KeyError if country is not in the dictionary, rather than returning default or raising ValueError
    rates = {
        "US": 5.0,
        "CA": 10.0,
        "UK": 15.0
    }
    return total + rates[country]
