import OpenAI, { toFile } from 'openai';

const ALLOWED_MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/wav'] as const;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

/**
 * OpenAI Whisper API を呼び出してテキスト化する実装。
 *
 * - モデル: `whisper-1`
 * - MIME チェック: `audio/webm | audio/mp4 | audio/wav`
 * - サイズ上限: 50MB
 * - 言語指定: `options.language` が指定された場合のみ付与
 */
export async function transcribeOpenAI(
  audio: Blob | File,
  options?: { language?: string },
): Promise<string> {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
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
      `File size ${audio.size} bytes exceeds the maximum allowed size of 50MB (${MAX_FILE_SIZE_BYTES} bytes)`,
    );
  }

  const client = new OpenAI({ apiKey });

  const file = await toFile(audio, 'audio.webm', { type: baseMime });

  const result = await client.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    ...(options?.language !== undefined ? { language: options.language } : {}),
  });

  return result.text;
}
