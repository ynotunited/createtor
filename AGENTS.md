<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Final video rendering runs in the browser (canvas + WebAudio + MediaRecorder in src/components/studio/renderer.ts) — the Worker runtime has no ffmpeg.
- Voiceovers use gateway TTS (google/gemini-3.1-flash-tts-preview) buffered as WAV, chunked ≤700 chars, 3 concurrent, via src/lib/speech.server.ts.
- AI music is "Coming soon": no music model exists on the gateway; music comes from user uploads.
