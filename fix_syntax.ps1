$u = New-Object System.Text.UTF8Encoding $false
$t = [System.IO.File]::ReadAllText('app.js', $u)
$t = $t.Replace('\`', '`')
[System.IO.File]::WriteAllText('app.js', $t, $u)
Write-Host 'Done'
