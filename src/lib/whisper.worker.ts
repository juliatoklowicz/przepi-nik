/// <reference lib="webworker" />
// Rozpoznawanie mowy (Whisper) w osobnym wątku, żeby nie blokować aplikacji.
// Model (~80 MB) pobiera się z Hugging Face przy pierwszym użyciu i zostaje w cache przeglądarki.

import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null

self.onmessage = async (e: MessageEvent<{ audio: Float32Array; language?: string }>) => {
  try {
    asr ??= pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p: { status: string; progress?: number; file?: string }) => {
        if (p.status === 'progress') self.postMessage({ type: 'download', progress: (p.progress ?? 0) / 100 })
      },
    }) as Promise<AutomaticSpeechRecognitionPipeline>
    const transcriber = await asr
    self.postMessage({ type: 'transcribing' })
    const result = await transcriber(e.data.audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      task: 'transcribe',
      ...(e.data.language ? { language: e.data.language } : {}),
    })
    const text = Array.isArray(result) ? result.map((r) => r.text).join(' ') : result.text
    self.postMessage({ type: 'done', text })
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
