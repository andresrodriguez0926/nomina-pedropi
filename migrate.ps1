$utf8 = New-Object System.Text.UTF8Encoding $false
$html = [System.IO.File]::ReadAllText("index.html", $utf8)
$pattern = '(?s)<script>\s*/\*\*\s*\*\s*Payroll App Core Engine.*?</script>'
if ($html -match $pattern) {
    $fullMatch = $matches[0]
    $scriptBody = $fullMatch -replace '(?s)^<script>\s*', '' -replace '(?s)\s*</script>$', ''
    [System.IO.File]::WriteAllText("app.js", $scriptBody, $utf8)
    $newHtml = $html.Replace($fullMatch, '<script src="app.js"></script>')
    [System.IO.File]::WriteAllText("index.html", $newHtml, $utf8)
    Write-Host 'Migration successful!'
}
else {
    Write-Host 'Regex failed.'
}
