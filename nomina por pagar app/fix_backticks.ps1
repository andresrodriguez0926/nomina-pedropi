$utf8 = New-Object System.Text.UTF8Encoding $false
$app = [System.IO.File]::ReadAllText('app.js', $utf8)
$app = $app -replace '\\`', '`'
[System.IO.File]::WriteAllText('app.js', $app, $utf8)
Write-Host 'Fixed app.js'
