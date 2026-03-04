$content = Get-Content -Path "app.js" -Encoding UTF8
for ($i = 0; $i -lt $content.Count; $i++) {
    if ($i -ne 59) {
        $content[$i] = $content[$i] -replace "state\.employees\.filter\(", "window.getVisibleEmployees().filter("
        if ($content[$i] -notmatch "nextRegNum" -and $content[$i] -notmatch "state\.employees\.map\(\(emp, index\)") {
            $content[$i] = $content[$i] -replace "state\.employees\.map\(", "window.getVisibleEmployees().map("
        }
    }
}
Set-Content -Path "app.js" -Value $content -Encoding UTF8
