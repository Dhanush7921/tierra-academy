#!/usr/bin/env bash
# Generates small SYNTHETIC demo lesson clips + captions into storage/sample/.
# These are original, license-free placeholders (abstract gradients + text) used until
# real course videos are uploaded to Cloudflare Stream. Requires ffmpeg with libfreetype.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=storage/sample
mkdir -p "$OUT"
FONT="${FONT:-$(fc-match -f '%{file}' 'DejaVu Sans:bold' 2>/dev/null || echo /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf)}"

make_clip () {
  local n="$1" title="$2" c0="$3" c1="$4"
  ffmpeg -y -v error \
    -f lavfi -i "gradients=s=640x360:c0=${c0}:c1=${c1}:x0=0:y0=0:x1=640:y1=360:speed=0.02:d=24:r=15" \
    -f lavfi -i "sine=frequency=220:sample_rate=22050:d=24" \
    -filter_complex "[0:v]drawtext=fontfile=${FONT}:text='TIERRA ACADEMY':fontcolor=white@0.9:fontsize=20:x=32:y=30,\
drawtext=fontfile=${FONT}:text='${title}':fontcolor=white:fontsize=34:x=32:y=(h/2)-30,\
drawtext=fontfile=${FONT}:text='DEMO LESSON CLIP - synthetic placeholder':fontcolor=white@0.75:fontsize=16:x=32:y=(h/2)+22,\
drawtext=fontfile=${FONT}:text='%{eif\:t\:d}s':fontcolor=white@0.8:fontsize=18:x=w-80:y=h-40[v];[1:a]volume=0.04[a]" \
    -map "[v]" -map "[a]" -c:v libx264 -preset veryfast -crf 34 -pix_fmt yuv420p -c:a aac -b:a 32k -movflags +faststart \
    "$OUT/demo-lesson-${n}.mp4"
  cat > "$OUT/demo-lesson-${n}.en.vtt" <<VTT
WEBVTT

00:00:00.000 --> 00:00:06.000
Welcome to Tierra Academy. This is a demo lesson clip.

00:00:06.000 --> 00:00:14.000
Real course videos will be streamed securely from Cloudflare Stream.

00:00:14.000 --> 00:00:24.000
${title} - placeholder content for the platform demonstration.
VTT
}

make_clip 1 "Circuits and Components" "0x0b1220" "0xff7a00"
make_clip 2 "Microcontrollers and Firmware" "0x0b1220" "0xffb300"
make_clip 3 "Robotics and Automation" "0x111a2e" "0xff5a1f"
ls -la "$OUT"
