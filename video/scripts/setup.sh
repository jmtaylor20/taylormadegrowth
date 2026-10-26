#!/usr/bin/env bash
# Installs the video toolchain: npm deps (HyperFrames, Remotion), the headless
# Chrome builds each renderer uses, and the HyperFrames agent skills.
# FFmpeg/ffprobe must already be on PATH (apt-get install ffmpeg).
set -euo pipefail
cd "$(dirname "$0")/.."

command -v ffmpeg >/dev/null || { echo "ffmpeg not found — install it (apt-get install -y ffmpeg)"; exit 1; }
node -e 'process.exit(+process.versions.node.split(".")[0] < 22)' || { echo "Node >= 22 required"; exit 1; }

npm ci
npx hyperframes browser ensure
npx remotion browser ensure
(cd .. && ./video/node_modules/.bin/hyperframes skills update \
  hyperframes hyperframes-cli hyperframes-registry media-use remotion-to-hyperframes)

echo "Video toolchain ready. Run: npm run verify"
