// 抽象化された transcribeAudio。
// WHISPER_PROVIDER 環境変数で実装を切り替える（default: 'openai'）。
//   - 'openai'      : OpenAI Whisper API（whisper-1）
//   - 'groq'        : Groq Whisper API（whisper-large-v3-turbo、最速）
//   - 'local-docker': ローカル Docker サービス（onerahmet/openai-whisper-asr-webservice）
import { transcribeGroq } from './transcribe-groq';
import { transcribeLocalDocker } from './transcribe-local-docker';
import { transcribeOpenAI } from './transcribe-openai';

export async function transcribeAudio(
  audio: Blob | File,
  options?: { language?: string },
): Promise<string> {
  const provider = process.env['WHISPER_PROVIDER'] ?? 'openai';
  if (provider === 'local-docker') {
    return transcribeLocalDocker(audio, options);
  }
  if (provider === 'groq') {
    return transcribeGroq(audio, options);
  }
  return transcribeOpenAI(audio, options);
}
