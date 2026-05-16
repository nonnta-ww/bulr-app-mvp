// ローカル Docker Whisper サービス（onerahmet/openai-whisper-asr-webservice）を呼び出す。
// HTTP API: POST /asr (multipart/form-data, audio_file field)
// Query params: task=transcribe, language=ja, output=json

const ALLOWED_MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/wav'] as const;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const DEFAULT_ENDPOINT = 'http://localhost:9000';

interface WhisperLocalResponse {
  text: string;
  language?: string;
}

/**
 * ローカル Docker Whisper サービスへ multipart/form-data で音声を POST してテキスト化する。
 *
 * 初回呼び出しはモデルダウンロード（数十秒〜）でブロックされる場合があるが、
 * 通常の HTTP エラーとして扱い、上位（API ルート側 withRetry）に任せる。
 */
export async function transcribeLocalDocker(
  audio: Blob | File,
  options?: { language?: string },
): Promise<string> {
  // MediaRecorder は 'audio/webm;codecs=opus' のようにパラメータ付きで送ることがあるため、
  // RFC 7231 に従いベース MIME 部分のみで比較する。
  const baseMime = audio.type.split(';')[0]!.trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(baseMime as (typeof ALLOWED_MIME_TYPES)[number])) {
    throw new Error(
      `Unsupported MIME type: ${audio.type}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
    );
  }

  if (audio.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File size ${audio.size} bytes exceeds the maximum allowed size of 50MB (${MAX_FILE_SIZE_BYTES} bytes)`,
    );
  }

  const endpoint = process.env['WHISPER_LOCAL_ENDPOINT'] ?? DEFAULT_ENDPOINT;

  const formData = new FormData();
  // ファイル名は拡張子付きで送る（Whisper 側が MIME 推定で使う場合がある）
  formData.append('audio_file', audio, 'audio.webm');

  const url = new URL('/asr', endpoint);
  url.searchParams.set('task', 'transcribe');
  url.searchParams.set('language', options?.language ?? 'ja');
  url.searchParams.set('output', 'json');

  const response = await fetch(url.toString(), {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `[Whisper local-docker] HTTP ${response.status}: ${detail.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as WhisperLocalResponse;
  if (data.text === undefined || data.text === null) {
    throw new Error('[Whisper local-docker] missing text field in response');
  }
  return data.text;
}
