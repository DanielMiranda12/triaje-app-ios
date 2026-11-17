Add-Type -AssemblyName System.Drawing

$srcPath = 'C:\Users\Daniel\.gemini\antigravity\brain\efe8b880-5b78-4332-b409-3ae15705c4a3\.user_uploaded\media_1794231704972_460fd770.jpg'
$srcBmp = New-Object System.Drawing.Bitmap $srcPath

# Check if we can flood fill or replace the white outer corners with transparent
# A point (x, y) is in the outer corner if its distance to the corner is small and it's near white
$w = $srcBmp.Width
$h = $srcBmp.Height
$transparentBmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

# Simple BFS flood fill from corners for pixels with R>240, G>240, B>240
$visited = New-Object 'bool[,]' $w, $h
$queue = New-Object System.Collections.Generic.Queue[System.Drawing.Point]

# Enqueue 4 corners
$queue.Enqueue((New-Object System.Drawing.Point(0, 0)))
$queue.Enqueue((New-Object System.Drawing.Point($w - 1, 0)))
$queue.Enqueue((New-Object System.Drawing.Point(0, $h - 1)))
$queue.Enqueue((New-Object System.Drawing.Point($w - 1, $h - 1)))

while ($queue.Count -gt 0) {
    $p = $queue.Dequeue()
    $x = $p.X
    $y = $p.Y
    if ($x -lt 0 -or $x -ge $w -or $y -lt 0 -or $y -ge $h) { continue }
    if ($visited[$x, $y]) { continue }
    $visited[$x, $y] = $true

    $c = $srcBmp.GetPixel($x, $y)
    # If it's near white / background outside the squircle
    if ($c.R -gt 240 -and $c.G -gt 240 -and $c.B -gt 240) {
        # Check 4 neighbors
        if ($x -gt 0) { $queue.Enqueue((New-Object System.Drawing.Point($x - 1, $y))) }
        if ($x -lt $w - 1) { $queue.Enqueue((New-Object System.Drawing.Point($x + 1, $y))) }
        if ($y -gt 0) { $queue.Enqueue((New-Object System.Drawing.Point($x, $y - 1))) }
        if ($y -lt $h - 1) { $queue.Enqueue((New-Object System.Drawing.Point($x, $y + 1))) }
    }
}

for ($x = 0; $x -lt $w; $x++) {
    for ($y = 0; $y -lt $h; $y++) {
        if ($visited[$x, $y]) {
            $transparentBmp.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
        } else {
            $transparentBmp.SetPixel($x, $y, $srcBmp.GetPixel($x, $y))
        }
    }
}

Write-Host "Flood fill complete. Generating mipmap icons..."

# Sizes for mipmap ic_launcher.png
$mipmapSizes = @{
    'mipmap-mdpi' = 48
    'mipmap-hdpi' = 72
    'mipmap-xhdpi' = 96
    'mipmap-xxhdpi' = 144
    'mipmap-xxxhdpi' = 192
}

$resBase = 'C:\triaje\appAndroid\android\app\src\main\res'

function Save-Resized($sourceBmp, $destPath, $size) {
    $destBmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($destBmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($sourceBmp, 0, 0, $size, $size)
    $g.Dispose()
    $destBmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destBmp.Dispose()
}

foreach ($folder in $mipmapSizes.Keys) {
    $size = $mipmapSizes[$folder]
    $dir = Join-Path $resBase $folder
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force }
    $out = Join-Path $dir 'ic_launcher.png'
    Save-Resized $transparentBmp $out $size
    Write-Host "Saved $out ($size x $size)"
}

# Foreground for adaptive icon in drawable-*
$foregroundSizes = @{
    'drawable-mdpi' = 108
    'drawable-hdpi' = 162
    'drawable-xhdpi' = 216
    'drawable-xxhdpi' = 324
    'drawable-xxxhdpi' = 432
}

foreach ($folder in $foregroundSizes.Keys) {
    $size = $foregroundSizes[$folder]
    $dir = Join-Path $resBase $folder
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force }
    $out = Join-Path $dir 'ic_launcher_foreground.png'
    Save-Resized $transparentBmp $out $size
    Write-Host "Saved $out ($size x $size)"
}

$srcBmp.Dispose()
$transparentBmp.Dispose()

# Update colors.xml for the adaptive background
$colorsXml = Join-Path $resBase 'values\colors.xml'
@'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0035DB</color>
</resources>
'@ | Out-File -FilePath $colorsXml -Encoding utf8

Write-Host "colors.xml updated with #0035DB"
