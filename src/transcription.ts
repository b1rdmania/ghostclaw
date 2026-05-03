import { readEnvFile } from './env.js';
import { logger } from './logger.js';

export async function transcribeBuffer(
  audioBuffer: Buffer,
): Promise<string | null> {
  return transcribeWithElevenLabs(audioBuffer);
}

async function transcribeWithElevenLabs(
  audioBuffer: Buffer,
): Promise<string | null> {
  const env = readEnvFile(['ELEVENLABS_API_KEY']);
  const apiKey = env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    logger.warn('ELEVENLABS_API_KEY not set in .env - transcription disabled');
    return null;
  }

  try {
    const formData = new FormData();
    formData.append('model_id', 'scribe_v2');
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
      const body = await response.text().catch(() => '');
      logger.error(
        { status: response.status, statusText: response.statusText, body },
        'ElevenLabs STT failed',
      );
      return null;
    }

    const result = (await response.json()) as { text?: string };
    if (!result.text) {
      logger.warn('ElevenLabs STT returned empty text');
      return null;
    }

    logger.info(
      { length: result.text.length },
      'ElevenLabs transcription complete',
    );
    return result.text;
  } catch (err) {
    logger.error({ err }, 'ElevenLabs STT failed');
    return null;
  }
}

/**
 * Convert text to speech using ElevenLabs API.
 * Returns an MP3 audio buffer, or null if not configured.
 */
export async function textToSpeech(text: string): Promise<Buffer | null> {
  logger.info({ textLength: text.length }, 'TTS requested');
  const env = readEnvFile(['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID']);
  const apiKey = env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    logger.warn(
      'ELEVENLABS_API_KEY not found in .env - voice replies disabled',
    );
    return null;
  }

  const voiceId = env.ELEVENLABS_VOICE_ID || 'gdij7XBqLfalxxwDgwAm';

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.error(
        { status: response.status, statusText: response.statusText, body },
        'ElevenLabs TTS failed',
      );
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    logger.info({ bytes: buffer.length }, 'TTS audio generated');
    return buffer;
  } catch (err) {
    logger.error({ err }, 'ElevenLabs TTS failed');
    return null;
  }
}
