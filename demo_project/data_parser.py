def parse_user_age(data):
    # BUG 1: raises KeyError if "age" is missing
    # BUG 2: raises ValueError if "age" is not a digit string (e.g. "twenty")
    age_str = data["age"]
    return int(age_str)

def format_date(date_str):
    # Expects "YYYY-MM-DD" and formats as "DD/MM/YYYY"
    # BUG: raises IndexError if date_str is empty or does not contain 2 hyphens
    # BUG: does not validate month or day bounds
    parts = date_str.split("-")
    return f"{parts[2]}/{parts[1]}/{parts[0]}"
