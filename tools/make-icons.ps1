Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force "$PSScriptRoot/../icons" | Out-Null

foreach ($s in 16, 48, 128) {
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)

  $u = $s / 128.0  # 以 128px 为基准的缩放因子
  $fur   = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(160, 110, 66))
  $furIn = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(214, 170, 120))
  $dark  = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(58, 38, 24))

  # 耳朵（外 + 内）
  $earR = 20 * $u; $earInR = 10 * $u
  $earLx = 26 * $u; $earRx = 102 * $u; $earY = 30 * $u
  $g.FillEllipse($fur,   ($earLx - $earR), ($earY - $earR), $earR * 2, $earR * 2)
  $g.FillEllipse($fur,   ($earRx - $earR), ($earY - $earR), $earR * 2, $earR * 2)
  $g.FillEllipse($furIn, ($earLx - $earInR), ($earY - $earInR), $earInR * 2, $earInR * 2)
  $g.FillEllipse($furIn, ($earRx - $earInR), ($earY - $earInR), $earInR * 2, $earInR * 2)

  # 头
  $headR = 48 * $u
  $g.FillEllipse($fur, (64 * $u - $headR), (74 * $u - $headR), $headR * 2, $headR * 2)

  # 口鼻部
  $g.FillEllipse($furIn, (64 * $u - 22 * $u), (88 * $u - 14 * $u), 44 * $u, 32 * $u)

  # 眼睛
  $eyeR = 6 * $u
  $g.FillEllipse($dark, (48 * $u - $eyeR), (66 * $u - $eyeR), $eyeR * 2, $eyeR * 2)
  $g.FillEllipse($dark, (80 * $u - $eyeR), (66 * $u - $eyeR), $eyeR * 2, $eyeR * 2)

  # 鼻子
  $g.FillEllipse($dark, (64 * $u - 7 * $u), (86 * $u - 5 * $u), 14 * $u, 10 * $u)

  $g.Dispose()
  $fur.Dispose(); $furIn.Dispose(); $dark.Dispose()
  $bmp.Save("$PSScriptRoot/../icons/icon$s.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
Get-ChildItem "$PSScriptRoot/../icons"
