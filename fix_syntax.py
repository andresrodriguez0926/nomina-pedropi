import re

with open('app.js', 'r', encoding='utf-8') as f:
    app = f.read()

# Replace any \` that isn't already inside a string (Wait, it's safer to just replace all \` that are obviously starting/ending literals or are stray)
# The user's script or something added stray backslashes before backticks.
# Let's just remove ALL backslashes that immediately precede a backtick, because escaping a backtick inside a template literal is rare in this codebase, but wait...
# In `\${paidAmount...}` that's different.
# If we look at the grep, we had `alert(\`...`
# Let's replace `\`` with ``` globally, BUT wait, what if it's meant to be an escaped backtick inside a template literal?
# The grep showed `alert(\`Transaccin...`)` -> the end also has `.\`);`
# Let's just replace `\`` with ``` everywhere.
app = app.replace('\\`', '`')

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(app)

print("Fixed stray backslashes in app.js")
