import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

pattern = re.compile(r'(?s)<script>\s*/\*\*\s*\*\s*Payroll App Core Engine.*?</script>')
match = pattern.search(html)

if match:
    full_match = match.group(0)
    script_body = re.sub(r'(?s)^<script>\s*', '', full_match)
    script_body = re.sub(r'(?s)\s*</script>$', '', script_body)
    
    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(script_body)
        
    new_html = html.replace(full_match, '<script src="app.js"></script>')
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(new_html)
    print("Migration successful!")
else:
    print("Regex failed to match the script block.")
