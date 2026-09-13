# LyricForge

A local-first lyric video editor built with React, TypeScript, Web Audio, canvas,
Whisper, and deterministic video encoding. Brand settings live in
`lib/lyricforge/model.ts`; the logo is `public/favicon.svg`.

## Run and develop

Use Node 22.13 or newer and the pnpm version in `package.json`.

```sh
pnpm install
pnpm media:prepare
pnpm dev
```

`pnpm test` runs the timing and history regressions. `pnpm typecheck` checks the
application types. `pnpm build` builds the application. Browser model inference
and software video encoding use the prepared assets under `public/workers`.

## Editing workflow

1. Create a project from the project menu and choose its aspect ratio.
2. Import audio. Waveform, energy, spectrum, and approximate beats are analyzed
   locally in a worker.
3. Detect lyrics, import TXT/LRC/SRT/VTT/ASS/SSA, or paste/type one line per event.
4. Correct lines or individual words. In Sync, play and tap **Set start & next**
   (Enter) for each line. Use the timeline and numeric fields for finer timing.
5. Choose a genre preset; all typography, timing, colors, motion and positions
   remain editable. Import fonts into the Project Fonts picker.
6. Add backgrounds, extra text and reactive layers. Drag objects in the preview,
   trim and move timeline clips, or add keyframes in the inspector.
7. Save locally or export a `.lyricforge` file that bundles the project and media.
8. Export video, audio, subtitles or the editable project. Review the encoded
   video in the export window, then use Save file. The download link remains
   available after rendering.

The first session contains clearly labelled original example lyrics and a
synthesized instrumental. These example lyrics are not a transcription of that
instrumental. Importing a song into the example starts a clean song session.

## Architecture

| System | Source |
| --- | --- |
| Project schema and timing primitives | `lib/lyricforge/model.ts` |
| Editor state and immutable undo history | `store.ts`, `history.ts` |
| Audio scheduling and offline mix | `audio.ts` |
| Waveform, beat and FFT analysis | `public/workers/analysis.js` |
| Manual synchronization | `synchronization.ts` |
| Lyric import and export | `lyrics.ts` |
| Modular transcription providers | `transcription.ts`, `transcription.worker.ts` |
| Shared preview/export rendering | `renderer.ts`, `animation.ts`, `video-pool.ts` |
| Media and imported fonts | `assets.ts` |
| Genre presets | `presets.ts` |
| IndexedDB and bundled projects | `project-manager.ts` |
| Native video encoding | `exporter.ts` |
| Software H.264 encoding | `software-exporter.ts` |
| UI components | `components/editor/` |
| Optional browser agent actions | `webmcp.ts` |

All core timing is stored in integer milliseconds. Playback uses the audio
context clock. Export renders each frame at `frameIndex / fps` through the same
renderer, at the selected output resolution. Each renderer owns its video
decoders so preview seeking cannot change an export's source frames. Export
never uses MediaRecorder or records the visible preview.

MP4 uses a native H.264 encoder when available and a local FFmpeg WebAssembly
fallback otherwise. The software path encodes one-second batches to bound raw
frame memory. Compressed segments, the final file and decoded audio still
consume memory. WebM VP9 and AV1 are offered when the browser exposes a working
encoder. Frame rates are 24, 30 and 60 FPS.

## Privacy and providers

No account or API key is needed for local transcription. The default English
Whisper Tiny model downloads from Hugging Face on first use and is cached by the
browser. Inference runs in a worker. Audio and project media are not uploaded.
The optional custom endpoint is used only after the user selects it and starts
detection; the dialog identifies the upload destination. It receives multipart
audio and must return:

```json
{"words":[{"word":"Hello","start":1.2,"end":1.7,"confidence":0.9}]}
```

Provider timestamps are seconds. Confidence is optional and is never invented.
Local Whisper does not supply calibrated confidence. Section and BPM labels are
estimates, not musical ground truth; repeated text suggests a chorus and gaps
suggest instrumental sections. Every result remains editable.

## Practical limits

- Browser media decoding determines support for AAC, FLAC, M4A and MOV. An
  unsupported file produces an actionable error. GIFs can be imported as image
  assets; use MP4 or WebM for reliably timed animation.
- Software H.264 is slower than hardware encoding. Large 4K/60 exports and long
  songs may exceed a device's memory. Imports are limited to 500 MB per media
  file and 750 MB per bundled project.
- Playback speed changes can change pitch. Export always uses the original
  audio rate. Preview volume does not change the exported mix.
- Word timing from pasted lyrics starts as an estimate. The local speech model
  can mishear singing, harsh vocals, layered vocals and instrumentals.
- LRC stores line starts; use SRT/VTT or project files to preserve explicit ends
  and overlaps. ASS imports text and timing; its original styling is not mapped.
- Autosave belongs to the current browser and device. Export a bundled project
  before moving devices or clearing browser storage.

## Verification status

See `QA.md` for the exact verification completed and the remaining acceptance
checks. This implementation has not yet passed both complete user-requested
browser workflows. It must not be represented as fully production-verified.

Third-party runtime notices are in `public/workers/THIRD_PARTY_NOTICES.md`.
