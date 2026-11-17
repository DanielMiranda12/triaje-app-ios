$csharp = @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Collections.Generic;

public class IconGenerator {
    public static void Process(string srcPath, string resBase) {
        using (Bitmap src = new Bitmap(srcPath)) {
            int w = src.Width;
            int h = src.Height;
            Bitmap transparentBmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);

            bool[,] visited = new bool[w, h];
            Queue<Point> queue = new Queue<Point>();

            queue.Enqueue(new Point(0, 0));
            queue.Enqueue(new Point(w - 1, 0));
            queue.Enqueue(new Point(0, h - 1));
            queue.Enqueue(new Point(w - 1, h - 1));

            while (queue.Count > 0) {
                Point p = queue.Dequeue();
                int x = p.X;
                int y = p.Y;
                if (x < 0 || x >= w || y < 0 || y >= h) continue;
                if (visited[x, y]) continue;
                visited[x, y] = true;

                Color c = src.GetPixel(x, y);
                if (c.R > 235 && c.G > 235 && c.B > 235) {
                    if (x > 0) queue.Enqueue(new Point(x - 1, y));
                    if (x < w - 1) queue.Enqueue(new Point(x + 1, y));
                    if (y > 0) queue.Enqueue(new Point(x, y - 1));
                    if (y < h - 1) queue.Enqueue(new Point(x, y + 1));
                }
            }

            for (int x = 0; x < w; x++) {
                for (int y = 0; y < h; y++) {
                    if (visited[x, y]) {
                        transparentBmp.SetPixel(x, y, Color.Transparent);
                    } else {
                        transparentBmp.SetPixel(x, y, src.GetPixel(x, y));
                    }
                }
            }

            // Mipmap sizes
            var mipmaps = new Dictionary<string, int>() {
                { "mipmap-mdpi", 48 },
                { "mipmap-hdpi", 72 },
                { "mipmap-xhdpi", 96 },
                { "mipmap-xxhdpi", 144 },
                { "mipmap-xxxhdpi", 192 }
            };

            foreach (var kv in mipmaps) {
                string dir = System.IO.Path.Combine(resBase, kv.Key);
                System.IO.Directory.CreateDirectory(dir);
                string outPath = System.IO.Path.Combine(dir, "ic_launcher.png");
                SaveResized(transparentBmp, outPath, kv.Value);
            }

            // Foreground sizes for adaptive icon
            var drawables = new Dictionary<string, int>() {
                { "drawable-mdpi", 108 },
                { "drawable-hdpi", 162 },
                { "drawable-xhdpi", 216 },
                { "drawable-xxhdpi", 324 },
                { "drawable-xxxhdpi", 432 }
            };

            foreach (var kv in drawables) {
                string dir = System.IO.Path.Combine(resBase, kv.Key);
                System.IO.Directory.CreateDirectory(dir);
                string outPath = System.IO.Path.Combine(dir, "ic_launcher_foreground.png");
                SaveResized(transparentBmp, outPath, kv.Value);
            }

            transparentBmp.Dispose();
        }
    }

    private static void SaveResized(Bitmap source, string destPath, int size) {
        using (Bitmap dest = new Bitmap(size, size, PixelFormat.Format32bppArgb)) {
            using (Graphics g = Graphics.FromImage(dest)) {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.SmoothingMode = SmoothingMode.HighQuality;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.CompositingQuality = CompositingQuality.HighQuality;
                g.Clear(Color.Transparent);
                g.DrawImage(source, 0, 0, size, size);
            }
            dest.Save(destPath, ImageFormat.Png);
        }
    }
}
'@

Add-Type -TypeDefinition $csharp -ReferencedAssemblies System.Drawing

$src = 'C:\Users\Daniel\.gemini\antigravity\brain\efe8b880-5b78-4332-b409-3ae15705c4a3\.user_uploaded\media_1794231704972_460fd770.jpg'
$res = 'C:\triaje\appAndroid\android\app\src\main\res'

[IconGenerator]::Process($src, $res)
Write-Host "Icons successfully generated!"
