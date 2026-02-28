$files = @('c:\Users\andre\OneDrive\Escritorio\cosas mias\nomina por pagar app\index.html', 'c:\Users\andre\OneDrive\Escritorio\cosas mias\nomina por pagar app\app.js')
foreach ($f in $files) {
    $content = Get-Content $f -Raw
    $fixed = $content.Replace("\``", "``")
    Set-Content -Path $f -Value $fixed -Encoding UTF8
}
Write-Host "Replaced occurrences."
