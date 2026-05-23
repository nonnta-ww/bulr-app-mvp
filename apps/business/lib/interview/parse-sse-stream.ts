import type { ZodType } from 'zod';

export class StreamEndedWithoutTerminalEvent extends Error {
  constructor() {
    super('SSE stream ended before a terminal event was received');
    this.name = 'StreamEndedWithoutTerminalEvent';
  }
}

export async function* parseSseStream<T>(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  schema: ZodType<T>,
  isTerminal: (event: T) => boolean,
): AsyncGenerator<T, void, unknown> {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let terminalYielded = false;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      if (!terminalYielded) {
        throw new StreamEndedWithoutTerminalEvent();
      }
      return;
    }

    buffer += decoder.decode(value, { stream: true });

    // Split on double newlines (SSE frame boundary)
    const frames = buffer.split('\n\n');
    // Keep the last incomplete frame in the buffer
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const trimmed = frame.trim();
      if (!trimmed) continue;

      // Extract data line
      const dataLine = trimmed
        .split('\n')
        .find((line) => line.startsWith('data: '));
      if (!dataLine) continue;

      const json = dataLine.slice('data: '.length);

      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        console.warn('[parseSseStream] Invalid JSON, skipping frame:', json);
        continue;
      }

      const result = schema.safeParse(parsed);
      if (!result.success) {
        console.warn(
          '[parseSseStream] Zod validation failed, skipping event:',
          result.error.message,
        );
        continue;
      }

      yield result.data;

      if (isTerminal(result.data)) {
        terminalYielded = true;
      }
    }

    // If terminal was yielded, drain and exit on next done
    // (stream should close shortly after terminal event)
  }
}
