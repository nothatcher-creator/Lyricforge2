# Third-party runtime components

- FFmpeg WebAssembly core 0.12.10: GPL-2.0-or-later.
  https://github.com/ffmpegwasm/ffmpeg.wasm
  The core JavaScript is copied unmodified. Its WebAssembly file is split into
  consecutive binary pieces for asset delivery and reassembled before loading.
- FFmpeg JavaScript wrapper 0.12.15: MIT.
  https://github.com/ffmpegwasm/ffmpeg.wasm
- Transformers.js 3.8.1: Apache-2.0.
  https://github.com/huggingface/transformers.js
- ONNX Runtime Web: MIT.
  https://github.com/microsoft/onnxruntime
- Whisper model weights are downloaded separately from their Hugging Face model
  repositories. https://huggingface.co/Xenova/whisper-tiny.en
- Mediabunny 1.55.6 and its AAC encoder package: MPL-2.0.
  https://github.com/Vanilagy/mediabunny

Exact dependency versions are recorded in pnpm-lock.yaml. The preparation script
is scripts/prepare-media.mjs. Application media and custom fonts are supplied by
the user and are not included in the public runtime assets.
