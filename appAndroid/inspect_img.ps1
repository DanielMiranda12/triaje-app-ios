Add-Type -AssemblyName System.Drawing

$src = 'C:\Users\Daniel\.gemini\antigravity\brain\efe8b880-5b78-4332-b409-3ae15705c4a3\.user_uploaded\media_1794231704972_460fd770.jpg'
$img = [System.Drawing.Bitmap]::FromFile($src)

Write-Host "Width: $($img.Width), Height: $($img.Height)"
$c1 = $img.GetPixel(5, 5)
$c2 = $img.GetPixel(500, 500)
$c3 = $img.GetPixel(100, 500)
Write-Host "Corner (5,5): R=$($c1.R), G=$($c1.G), B=$($c1.B)"
Write-Host "Center (500,500): R=$($c2.R), G=$($c2.G), B=$($c2.B)"
Write-Host "Mid-Left (100,500): R=$($c3.R), G=$($c3.G), B=$($c3.B)"

$img.Dispose()
