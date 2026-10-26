# Video toolchain

Self-contained workspace for making videos, kept apart from the Astro site's dependencies.

| Tool | Version | Use it for |
| --- | --- | --- |
| [HyperFrames](https://hyperframes.heygen.com) | 0.8.206 | HTML + GSAP compositions rendered to MP4/WebM/MOV/GIF. Good fit for AI-authored motion graphics. |
| [Remotion](https://www.remotion.dev) | 4.0.539 | React compositions with props, transitions and data-driven variants. |
| FFmpeg / ffprobe | system (6.1+) | Trimming, concatenating, crossfades, overlays, burned-in captions, loudness normalization and transcoding. |

## Setup

```bash
cd video
npm run setup    # npm ci + headless Chrome for both renderers + HyperFrames agent skills
npm run verify   # renders both demos, then runs a chain of FFmpeg edits on them
```

You need Node 22 or later and `ffmpeg` on your PATH.

## Layout

- `hyperframes-demo/`: HyperFrames project. Edit `index.html`, then `npm run hf:check` and `npm run hf:render`. Its `CLAUDE.md` has the authoring rules.
- `remotion/`: Remotion project. Compositions are registered in `src/Root.tsx`. Run `npm run studio` to preview and `npm run remotion:render -- BrandIntro out/intro.mp4` to render.
- `scripts/`: `setup.sh` and `verify.sh`.

Render output (`renders/`, `out/`) is gitignored.

## Remotion licensing

Remotion is free for individuals and companies with up to 3 employees. Larger companies need a [company license](https://www.remotion.dev/license).

## Optional extras (not installed)

- **whisper.cpp**: auto-transcription for word-timed captions. Build it from https://github.com/ggml-org/whisper.cpp and put it on your PATH.
- **Kokoro TTS**: local voiceover (`pip install kokoro-onnx soundfile`).
- **Remotion agent skills**: `npx skills add remotion-dev/skills`.

Run `npx hyperframes doctor` to see which of these it detects.
