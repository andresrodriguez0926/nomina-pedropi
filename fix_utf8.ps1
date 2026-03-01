$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$files = @(
    "c:\Users\andre\OneDrive\Escritorio\cosas mias\nomina por pagar app\index.html",
    "c:\Users\andre\OneDrive\Escritorio\cosas mias\nomina por pagar app\app.js"
)
$str1 = [string][char]92 + [string][char]96
$str2 = [string][char]96
foreach ($f in $files) {
    if (Test-Path $f) {
        $content = [System.IO.File]::ReadAllText($f, $utf8NoBom)
        $content = $content.Replace($str1, $str2)
        [System.IO.File]::WriteAllText($f, $content, $utf8NoBom)
        Write-Host "Fixed $f"
    }
}
Write-Host "Done"
