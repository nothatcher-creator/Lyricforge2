# Verification record

Updated 2026-09-13. Tests use a 7.365-second synthesized speech WAV, a custom
TrueType font, a PNG background and a two-second H.264 video with burned-in
source timestamps. This is not a sung rock or metal performance; these results
do not establish transcription accuracy for music or long-session performance.

## Passed

- TypeScript compilation (no emit) and 17 automated regression tests.
- Exact millisecond subtitle import/export, line/word retiming, splits/merges,
  word corrections, undo/redo, keyframe interpolation, section estimates,
  manual tap order, locked selections and no-op edits.
- Project archive tests preserve media bytes, font references, words and
  keyframes, and reject missing media and broken project references.
- Browser imported and decoded the WAV, with waveform and approximate BPM.
- Local Whisper Tiny returned its spoken text with word timestamps and applied
  three fully editable lyric lines. A line correction, Undo and Redo worked;
  a separate word correction and 50 ms word-start edit worked.
- Metal preset, imported StudioSerif font, custom size and progressive karaoke
  fill applied. The font appeared in Project Fonts.
- Image and video layers, track reordering, a four-second video start offset,
  and an additional title with a Rise entrance rendered in the preview.
- Full preview playback completed. Reloading restored the automatic project,
  audio, text, font, styles and media layers from IndexedDB.
- Automatic project rendered to H.264 MP4 at 1920 × 1080 / 30 FPS using the
  local FFmpeg fallback. The generated 10.2 MB video decoded and played through
  in the in-app review player. DOM media metadata reported 7.366667 seconds,
  within 2 ms of the 7.365-second project. At output playback time 5.560935,
  the background showed source frame 46 / 1.533 seconds, consistent with
  frame sampling and its four-second clip offset.
- Manual workflow imported the WAV, pasted four lines, and tapped all starts
  while playing at 0.25×. Selection advanced in the original line order.
  Recorded starts were 161, 1848, 3749 and 5704 ms. Karaoke preset and full
  preview playback worked. Preset Undo/Redo restored the previous styles.
- Dragging a lyric moved it from 1848–3749 to 2233–4134 ms; Undo restored it.
  Trimming the last lyric shortened its end from 7365 to 6980 ms; Undo restored
  the original end.
- The manual project rendered to 1280 × 720 / 30 FPS H.264 MP4 (5.6 MB).
  The encoded video decoded and played through; media metadata again reported
  7.366667 seconds. This also exercised proportional rendering at a different
  export resolution.
- Cancelling an in-progress software export returned to a usable export dialog,
  retained the project, and allowed rendering to restart.
- Full-screen preview's explicit exit control returned to the editor.

## Current limitations and remaining acceptance checks

Browser download waits timed out for both bundled projects and MP4 output;
files remained unconfirmed in the browser's shared download directory. The
browser URL policy blocks its internal download-manager page. No browser
security settings were changed and no unconfirmed file was used as a completed
artifact. A persistent explicit Save file link is now provided after export.

Consequently, completed OS-level downloads, opening a downloaded bundled project,
and external ffprobe/audio checks are not yet verified. The embedded MP4 player
verifies the actual encoded video, not the editor canvas. Both complete requested
workflows must not be claimed as fully passed until downloaded files can also
be checked.

Also still required:

- Native WebCodecs MP4/WebM paths on browsers that expose those codecs.
- Tablet/Android landscape, pinch gestures and long projects on real devices.
- Browser keyframe editing and a complete bundled-file import round trip.
- Transcription accuracy on representative sung material and harsh vocals.
- Optional WebMCP actions: modelContext was unavailable in the test browser.
