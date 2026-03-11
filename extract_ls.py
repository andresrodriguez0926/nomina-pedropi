import os
import sqlite3
import json
import traceback

def extract_leveldb():
    print("Checking leveldb paths for Chrome/Edge Local Storage...")
    paths = [
        os.path.expanduser('~\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Local Storage\\leveldb'),
        os.path.expanduser('~\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Local Storage\\leveldb')
    ]
    
    try:
        import plyvel
        print("Plyvel found, we could read leveldb... but Windows handles this poorly.")
    except Exception as e:
        print("No plyvel, writing out string dump...")
        
    for path in paths:
        if os.path.exists(path):
            print(f"Found: {path}")
            for root, _, files in os.walk(path):
                for file in files:
                    if file.endswith('.ldb') or file.endswith('.log'):
                        filepath = os.path.join(root, file)
                        try:
                            with open(filepath, 'rb') as f:
                                content = f.read().decode('utf-8', errors='ignore')
                                if 'payroll_employees' in content or 'payroll_active' in content:
                                    print(f"--> Found payroll data strings in {filepath}")
                                    # Extract SAN employees
                                    import re
                                    matches = re.findall(r'\{[^{}]*"firstName"\s*:\s*"SAN"[^{}]*\}', content, re.IGNORECASE)
                                    for m in matches:
                                        print("EMP DATA:", m)
                                        
                        except Exception as e:
                            pass
                            
extract_leveldb()
