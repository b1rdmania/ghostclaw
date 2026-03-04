import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { WAMessage, WASocket } from '@whiskeysockets/baileys';

import { readEnvFile } from './env.js';

const FALLBACK_MESSAGE = '[Voice Message - transcription unavailable]';

async function transcribeWithElevenLabs(
  audioBuffer: Buffer,
): Promise<string | null> {
  const env = readEnvFile(['ELEVENLABS_API_KEY']);
  const apiKey = env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    console.warn('ELEVENLABS_API_KEY not set in .env - transcription disabled');
    return null;
  }

  try {
    const formData = new FormData();
    formData.append('model_id', 'scribe_v1');
    formData.append(
      'file',
      new Blob([audioBuffer], { type: 'audio/ogg' }),
      'voice.ogg',
    );

    const response = await fetch(
      'https://api.elevenlabs.io/v1/speech-to-text',
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: formData,
      },
    );

    if (!response.ok) {
      console.error(
        'ElevenLabs STT error:',
        response.status,
        await response.text(),
      );
      return null;
    }

    const result = (await response.json()) as { text?: string };
    if (!result.text) {
      console.warn('ElevenLabs STT returned empty text');
      return null;
    }

    console.log(`ElevenLabs transcription complete: ${result.text.length} chars`);
    return result.text;
  } catch (err) {
    console.error('ElevenLabs STT failed:', err);
    return null;
  }
}

export async function transcribeAudioMessage(
  msg: WAMessage,
  sock: WASocket,
): Promise<string | null> {
  try {
    const buffer = (await downloadMediaMessage(
      msg,
      'buffer',
      {},
      {
        logger: console as any,
        reuploadRequest: sock.updateMediaMessage,
      },
    )) as Buffer;

    if (!buffer || buffer.length === 0) {
      console.error('Failed to download audio message');
      return FALLBACK_MESSAGE;
    }

    console.log(`Downloaded audio message: ${buffer.length} bytes`);

    const transcript = await transcribeWithElevenLabs(buffer);

    if (!transcript) {
      return FALLBACK_MESSAGE;
    }

    return transcript.trim();
  } catch (err) {
    console.error('Transcription error:', err);
    return FALLBACK_MESSAGE;
  }
}

export function isVoiceMessage(msg: WAMessage): boolean {
  return msg.message?.audioMessage?.ptt === true;
}
