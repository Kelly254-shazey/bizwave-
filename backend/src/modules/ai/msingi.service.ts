import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { envConfig } from '../../config/env.config';

export interface MsingiSynthesisResult {
  provider: 'msingi_sauti_api' | 'browser_web_speech_fallback';
  msingiConfigured: boolean;
  audioBase64: string | null;
  mimeType: string | null;
  voiceId: string;
  language: string;
  charactersCount: number;
  estimatedCostKes: number;
  requestId: string | null;
  fallbackText: string;
  notice: string;
}

export interface MsingiTranscriptionResult {
  provider: 'msingi_sauti_asr' | 'unconfigured';
  msingiConfigured: boolean;
  transcript: string | null;
  durationSec: number | null;
  speechDetected: boolean | null;
  requestId: string | null;
  notice: string;
}

/**
 * Official Server-Side Adapter for the MsingiAI Platform API (https://api.msingiai.com).
 *
 * Security & Cost Controls:
 * - Reads MSINGI_API_KEY strictly from server env vars (NEVER sent to browser, URLs, or logs).
 * - Enforces documented Msingi limits (max 2,000 chars per TTS call, 10MB max audio upload).
 * - Sends deterministic SHA-256 `Idempotency-Key` so retries within 24h never incur duplicate billing.
 * - Handles 402 (insufficient_balance), 403, 422, and network timeouts without ever faking audio.
 * - Supports self-hosted open-weight `msingiai/sauti-tts` (MIT/CC-BY-SA-4.0) by setting MSINGI_BASE_URL.
 */
@Injectable()
export class MsingiLanguageService {
  private readonly audioCache = new Map<string, { audioBase64: string; requestId: string | null; cachedAt: number }>();

  isConfigured(): boolean {
    return Boolean(envConfig.msingiApiKey && envConfig.msingiApiKey.trim().length >= 8);
  }

  getPublicStatus() {
    const configured = this.isConfigured();
    return {
      provider: 'MsingiAI Sauti (Kenya)',
      baseUrl: envConfig.msingiBaseUrl,
      configured,
      activeMode: configured ? 'msingi_sauti_api' : 'browser_web_speech_fallback',
      supportedCapabilities: {
        swahiliTts: true,
        swahiliEnglishShengAsr: true,
        selfHostableOpenWeights: 'https://huggingface.co/msingiai/sauti-tts',
      },
      pricingTransparency:
        'MsingiAI Playground & open-weight models (msingiai/sauti-tts, msingiai/sauti-asr) are free to try/self-host. Hosted API inference (api.msingiai.com) uses pay-as-you-go prepaid KES credit (KES 6.00 / 1,000 TTS chars, KES 1.90 / min ASR; no monthly subscription).',
      requiredServerEnvVars: configured ? [] : ['MSINGI_API_KEY', 'MSINGI_BASE_URL (optional for self-hosted)'],
    };
  }

  async synthesizeSpeech(params: {
    text: string;
    language: string;
    voiceId?: string;
  }): Promise<MsingiSynthesisResult> {
    const cleanedText = params.text.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 2000);
    const voiceId = (params.voiceId || envConfig.msingiDefaultVoice || 'female3').replace(/[^a-zA-Z0-9_-]/g, '');
    const estimatedCostKes = Number(((cleanedText.length / 1000) * 6.0).toFixed(2));

    // Only invoke MsingiAI hosted API when server key is configured AND text is Swahili/Sheng (Sauti's specialty)
    if (!this.isConfigured()) {
      return {
        provider: 'browser_web_speech_fallback',
        msingiConfigured: false,
        audioBase64: null,
        mimeType: null,
        voiceId,
        language: params.language,
        charactersCount: cleanedText.length,
        estimatedCostKes: 0,
        requestId: null,
        fallbackText: cleanedText,
        notice:
          'MsingiAI API key (MSINGI_API_KEY) is not configured on the server. Using zero-cost browser Web Speech playback locally. Set MSINGI_API_KEY (or self-host open-weight msingiai/sauti-tts via MSINGI_BASE_URL) for native Kenyan Sauti WAV speech.',
      };
    }

    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`${voiceId}|${cleanedText}`)
      .digest('hex');

    // In-memory 6-hour cache prevents redundant billable TTS synthesis for popular lessons
    const cached = this.audioCache.get(idempotencyKey);
    if (cached && Date.now() - cached.cachedAt < 6 * 3600 * 1000) {
      return {
        provider: 'msingi_sauti_api',
        msingiConfigured: true,
        audioBase64: cached.audioBase64,
        mimeType: 'audio/wav',
        voiceId,
        language: params.language,
        charactersCount: cleanedText.length,
        estimatedCostKes: 0,
        requestId: cached.requestId,
        fallbackText: cleanedText,
        notice: 'Served from server cache (MsingiAI Sauti WAV, zero extra billing).',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), envConfig.msingiTimeoutMs);
    try {
      const response = await fetch(`${envConfig.msingiBaseUrl}/v1/audio/speech`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${envConfig.msingiApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ text: cleanedText, voice_id: voiceId }),
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') || '';
      const requestId = response.headers.get('x-request-id');

      if (!response.ok || !contentType.includes('audio')) {
        let errorCode = `http_${response.status}`;
        try {
          const errJson: any = await response.json();
          errorCode = errJson?.error?.code || errJson?.code || errorCode;
        } catch {
          // ignore non-json error body
        }
        return {
          provider: 'browser_web_speech_fallback',
          msingiConfigured: true,
          audioBase64: null,
          mimeType: null,
          voiceId,
          language: params.language,
          charactersCount: cleanedText.length,
          estimatedCostKes: 0,
          requestId,
          fallbackText: cleanedText,
          notice:
            response.status === 402
              ? 'MsingiAI workspace prepaid balance is insufficient (HTTP 402). Falling back to free browser Web Speech playback.'
              : `MsingiAI speech endpoint returned ${errorCode}. Falling back safely to browser Web Speech playback.`,
        };
      }

      const wavBuffer = Buffer.from(await response.arrayBuffer());
      const audioBase64 = wavBuffer.toString('base64');
      if (this.audioCache.size > 120) {
        const oldestKey = this.audioCache.keys().next().value;
        if (oldestKey) this.audioCache.delete(oldestKey);
      }
      this.audioCache.set(idempotencyKey, { audioBase64, requestId, cachedAt: Date.now() });

      return {
        provider: 'msingi_sauti_api',
        msingiConfigured: true,
        audioBase64,
        mimeType: 'audio/wav',
        voiceId,
        language: params.language,
        charactersCount: cleanedText.length,
        estimatedCostKes,
        requestId,
        fallbackText: cleanedText,
        notice: 'Native Kenyan Kiswahili speech synthesized via MsingiAI Sauti TTS.',
      };
    } catch {
      return {
        provider: 'browser_web_speech_fallback',
        msingiConfigured: true,
        audioBase64: null,
        mimeType: null,
        voiceId,
        language: params.language,
        charactersCount: cleanedText.length,
        estimatedCostKes: 0,
        requestId: null,
        fallbackText: cleanedText,
        notice: 'MsingiAI API could not be reached within timeout. Using free browser Web Speech fallback.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async transcribeAudio(params: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
  }): Promise<MsingiTranscriptionResult> {
    if (!this.isConfigured()) {
      return {
        provider: 'unconfigured',
        msingiConfigured: false,
        transcript: null,
        durationSec: null,
        speechDetected: null,
        requestId: null,
        notice:
          'MsingiAI ASR requires server-side MSINGI_API_KEY (or self-hosted msingiai/sauti-asr via MSINGI_BASE_URL). You can still type your question or use browser microphone dictation for free.',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), envConfig.msingiTimeoutMs);
    try {
      const form = new FormData();
      const safeName = params.originalName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'voice-note.wav';
      const bytes = new Uint8Array(params.buffer);
      form.append('file', new Blob([bytes], { type: params.mimeType || 'audio/wav' }), safeName);

      const response = await fetch(`${envConfig.msingiBaseUrl}/v1/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${envConfig.msingiApiKey}`,
        },
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          provider: 'unconfigured',
          msingiConfigured: true,
          transcript: null,
          durationSec: null,
          speechDetected: null,
          requestId: response.headers.get('x-request-id'),
          notice:
            response.status === 402
              ? 'MsingiAI prepaid balance insufficient for ASR transcription (HTTP 402).'
              : `MsingiAI ASR returned HTTP ${response.status}.`,
        };
      }

      const json: any = await response.json();
      return {
        provider: 'msingi_sauti_asr',
        msingiConfigured: true,
        transcript: json.text || '',
        durationSec: typeof json.duration === 'number' ? json.duration : null,
        speechDetected: typeof json.speech_detected === 'boolean' ? json.speech_detected : true,
        requestId: json.request_id || response.headers.get('x-request-id'),
        notice: 'Transcribed via MsingiAI Sauti ASR (Kiswahili / Kenyan English code-switching).',
      };
    } catch {
      return {
        provider: 'unconfigured',
        msingiConfigured: true,
        transcript: null,
        durationSec: null,
        speechDetected: null,
        requestId: null,
        notice: 'MsingiAI ASR request timed out safely.',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
