'use client';

export type RecorderState = 'idle' | 'recording' | 'stopped';

export interface AudioRecorder {
  start(): Promise<void>;
  stop(): Promise<Blob>;
  readonly state: RecorderState;
  onAutoStop?: () => void;
}

const MIME_TYPE_PRIORITY = [
  'audio/webm; codecs=opus',
  'audio/mp4',
  'audio/wav',
] as const;

const MAX_RECORDING_MS = 600_000; // 10 minutes

function getSupportedMimeType(): string {
  for (const mimeType of MIME_TYPE_PRIORITY) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  // Fallback to browser default
  return '';
}

export function createAudioRecorder(): AudioRecorder {
  let _state: RecorderState = 'idle';
  let _mediaRecorder: MediaRecorder | null = null;
  let _stream: MediaStream | null = null;
  let _chunks: BlobPart[] = [];
  let _autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  let _stopResolve: ((blob: Blob) => void) | null = null;
  let _stopReject: ((err: unknown) => void) | null = null;

  const recorder: AudioRecorder = {
    get state(): RecorderState {
      return _state;
    },

    onAutoStop: undefined,

    async start(): Promise<void> {
      if (_state !== 'idle') {
        throw new Error('Recorder is not in idle state');
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          throw new Error(
            'マイクへのアクセスが拒否されました。ブラウザの設定でマイクの使用を許可してください。',
          );
        }
        throw err;
      }

      _stream = stream;
      _chunks = [];

      const mimeType = getSupportedMimeType();
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      _mediaRecorder = new MediaRecorder(stream, options);

      _mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          _chunks.push(event.data);
        }
      };

      _mediaRecorder.onstop = () => {
        const mimeUsed = _mediaRecorder?.mimeType ?? mimeType ?? 'audio/webm';
        const blob = new Blob(_chunks, { type: mimeUsed });

        // Stop all tracks to release microphone
        _stream?.getTracks().forEach((track) => track.stop());
        _stream = null;

        _state = 'stopped';

        if (_stopResolve) {
          _stopResolve(blob);
          _stopResolve = null;
          _stopReject = null;
        }
      };

      _mediaRecorder.onerror = (event) => {
        _stream?.getTracks().forEach((track) => track.stop());
        _stream = null;
        _state = 'stopped';

        const err = (event as Event & { error?: DOMException }).error ?? new Error('Recording failed');
        if (_stopReject) {
          _stopReject(err);
          _stopResolve = null;
          _stopReject = null;
        }
      };

      _state = 'recording';
      _mediaRecorder.start();

      // Auto-stop after 10 minutes
      _autoStopTimer = setTimeout(() => {
        if (_state === 'recording') {
          recorder.onAutoStop?.();
          void recorder.stop();
        }
      }, MAX_RECORDING_MS);
    },

    async stop(): Promise<Blob> {
      if (_state !== 'recording') {
        throw new Error('Recorder is not in recording state');
      }

      if (_autoStopTimer !== null) {
        clearTimeout(_autoStopTimer);
        _autoStopTimer = null;
      }

      return new Promise<Blob>((resolve, reject) => {
        _stopResolve = resolve;
        _stopReject = reject;
        _mediaRecorder?.stop();
      });
    },
  };

  return recorder;
}
