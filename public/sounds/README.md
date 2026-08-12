# Audio files needed here

This folder is intentionally empty of audio in the repository — no third-party
audio is bundled with this project. The app **runs and builds without errors**
even with this folder empty; any card whose file is missing simply shows a
small "Audio file not found" note the first time it's toggled, instead of
crashing anything else.

To make the nature-sound cards actually play, add royalty-free **CC0
("no rights reserved") audio files** with these **exact filenames** directly
in this folder (`public/sounds/`):

| Filename            | Sound card    | Suggested length |
| -------------------- | ------------- | ----------------- |
| `rain.mp3`           | Rain          | 1–3 min loop |
| `thunderstorm.mp3`   | Thunderstorm  | 2–5 min loop |
| `ocean.mp3`          | Ocean Waves   | 1–3 min loop |
| `forest.mp3`         | Forest        | 2–4 min loop |
| `cafe.mp3`           | Cafe          | 2–4 min loop |
| `fireplace.mp3`      | Fireplace     | 1–3 min loop |
| `fan.mp3`            | Fan           | 1–2 min loop |

White, pink, and brown noise need **no files** — they're generated live in the
browser (see `public/worklets/noise-processor.js`).

## Where to find CC0 audio

- [Pixabay Sound Effects](https://pixabay.com/sound-effects/) — filter by
  "Sound Effects", all tracks are free to use without attribution.
- [Freesound.org](https://freesound.org/) — filter search results by
  **License: Creative Commons 0**. Attribution-required tracks (CC-BY) also
  work legally, but CC0 avoids any attribution bookkeeping.
- [Zapsplat](https://www.zapsplat.com/) — free tier requires attribution or a
  paid plan for attribution-free use; check the license on each track.

Search terms that tend to work well: `"rain loop"`, `"thunderstorm ambience"`,
`"ocean waves loop"`, `"forest ambience birds"`, `"coffee shop ambience"`,
`"fireplace crackle loop"`, `"box fan white noise"`.

## Making a clean seamless loop

The app loops the whole file with the Web Audio API (`AudioBufferSourceNode.loop
= true`), so any pop or volume jump between the end and start of the file will
be audible on every repeat. Before dropping a file in:

1. Trim silence from the very start and end.
2. Make sure the amplitude/energy at the last ~0.5s roughly matches the first
   ~0.5s (a short crossfade in an editor like Audacity works well: copy the
   first ~1s, paste it at the end, and crossfade).
2. Export as MP3, ~128–192kbps is plenty for ambient background noise — keep
   files reasonably small since this is a client-side app with no server-side
   transcoding.

## Adding a brand-new sound (not just replacing a file)

1. Add the file here, e.g. `public/sounds/waterfall.mp3`.
2. Add an entry to the `SOUNDS` array in `src/config/sounds.ts` with a unique
   `id`, `kind: 'file'`, `file: 'waterfall.mp3'`, an inline SVG `icon`, and a
   `defaultVolume`. No other code changes are needed — the mixer grid, sleep
   timer, presets, and localStorage persistence all pick it up automatically.
