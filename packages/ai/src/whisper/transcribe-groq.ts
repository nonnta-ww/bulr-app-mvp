import OpenAI, { toFile } from 'openai';

const ALLOWED_MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/wav'] as const;
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB (Groq の上限)
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'whisper-large-v3-turbo';

/**
 * Groq Whisper API（OpenAI 互換）を呼び出してテキスト化する実装。
 *
 * - モデル: `whisper-large-v3-turbo`（既定）/ `WHISPER_GROQ_MODEL` で上書き可
 * - ベース URL: `https://api.groq.com/openai/v1`
 * - MIME チェック: `audio/webm | audio/mp4 | audio/wav`
 * - サイズ上限: 25MB（Groq の上限。OpenAI Whisper API より小さい点に注意）
 * - 言語指定: `options.language` が指定された場合のみ付与
 */
export async function transcribeGroq(
  audio: Blob | File,
  options?: { language?: string },
): Promise<string> {
  const apiKey = process.env['GROQ_API_KEY'];
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set in environment variables');
  }

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
      `File size ${audio.size} bytes exceeds the maximum allowed size of 25MB (${MAX_FILE_SIZE_BYTES} bytes)`,
    );
  }

  const client = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });

  const file = await toFile(audio, 'audio.webm', { type: baseMime });

  const model = process.env['WHISPER_GROQ_MODEL'] ?? DEFAULT_MODEL;

  const result = await client.audio.transcriptions.create({
    file,
    model,
    ...(options?.language !== undefined ? { language: options.language } : {}),
  });

  return result.text;
}
