#!/usr/bin/env bash
# Smoke test: renders the HyperFrames and Remotion demos, then runs a chain of
# FFmpeg edits on them. Outputs land in gitignored renders/ folders.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=ffmpeg-test/renders
mkdir -p "$OUT"
probe() { ffprobe -v error -show_entries stream=codec_name,width,height:format=duration -of compact=p=0 "$1" | tr '\n' ' '; echo; }

echo "== HyperFrames =="
(cd hyperframes-demo && npx hyperframes check && npx hyperframes render -o renders/hyperframes-test.mp4 --quiet >/dev/null)
probe hyperframes-demo/renders/hyperframes-test.mp4

echo "== Remotion =="
(cd remotion && npx tsc -p tsconfig.json && npx remotion render src/index.ts BrandIntro out/remotion-test.mp4 --log=error)
probe remotion/out/remotion-test.mp4

echo "== FFmpeg =="
HF=hyperframes-demo/renders/hyperframes-test.mp4
RM=remotion/out/remotion-test.mp4
printf "1\n00:00:00,500 --> 00:00:03,000\nBurned-in captions via libass\n" > "$OUT/subs.srt"
ffmpeg -y -loglevel error -i "$HF" -i "$RM" -filter_complex \
  "[0:v]fps=30,settb=AVTB,format=yuv420p[v0];[1:v]fps=30,settb=AVTB,format=yuv420p[v1];[v0][v1]xfade=transition=fade:duration=1:offset=5[v];[0:a][1:a]acrossfade=d=1[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 18 -c:a aac "$OUT/xfade.mp4"
ffmpeg -y -loglevel error -i "$OUT/xfade.mp4" -i ../brand-kit/TMB_Monogram_White_Logo.png -filter_complex \
  "[1]scale=120:-1,format=rgba,colorchannelmixer=aa=0.7[l];[0][l]overlay=W-w-40:40,subtitles=$OUT/subs.srt" \
  -af loudnorm=I=-14:TP=-1:LRA=11 -ar 48000 -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 192k "$OUT/edited.mp4"
ffmpeg -y -loglevel error -i "$OUT/edited.mp4" -c:v libx265 -crf 24 -tag:v hvc1 -x265-params log-level=error -c:a aac "$OUT/edited-hevc.mp4"
ffmpeg -y -loglevel error -i "$OUT/edited.mp4" -c:v libvpx-vp9 -b:v 0 -crf 33 -deadline realtime -cpu-used 8 -c:a libopus "$OUT/edited.webm"
ffmpeg -y -loglevel error -i "$OUT/edited.mp4" -t 3 -c:v prores_ks -profile:v 3 -c:a pcm_s16le "$OUT/master.mov"
for f in "$OUT"/edited.mp4 "$OUT"/edited-hevc.mp4 "$OUT"/edited.webm "$OUT"/master.mov; do printf '%s: ' "$f"; probe "$f"; done

echo "All video checks passed."
