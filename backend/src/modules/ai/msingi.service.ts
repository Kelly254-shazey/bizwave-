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
  estimatedCostKes: number | null;
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
 * Optional server-side speech adapter. The provider API, self-hosted endpoint
 * compatibility, pricing and billing semantics have not been verified in this
 * release. A configured key is not proof of a working provider connection.
 * Secrets remain server-side, text is capped, and failed calls return no audio.
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
      activeMode: configured ? 'provider_configured_unverified' : 'browser_web_speech_fallback',
      supportedCapabilities: {
        swahiliTts: 'provider compatibility unverified',
        swahiliEnglishShengAsr: 'provider compatibility unverified',
        selfHostableOpenWeights: 'https://huggingface.co/msingiai/sauti-tts',
      },
      pricingTransparency:
        'Provider availability, compatibility and pricing have not been verified for this release. Check with the provider before enabling.',
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
    // Actual provider pricing is not known or verified by this release.
    const estimatedCostKes = null;

    // Without a server key, return text for an optional browser fallback.
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
          'The speech provider is not configured. The browser may offer Web Speech playback, depending on device and language support. Provider compatibility has not been verified.',
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
          estimatedCostKes: null,
          requestId,
          fallbackText: cleanedText,
          notice:
            response.status === 402
              ? 'The speech provider returned HTTP 402. The browser may offer Web Speech fallback; any provider charge is unknown.'
              : `The speech provider returned ${errorCode}. The browser may offer Web Speech fallback; any provider charge is unknown.`,
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
        estimatedCostKes: null,
        requestId: null,
        fallbackText: cleanedText,
        notice: 'The speech provider could not be reached. The browser may offer Web Speech fallback; any provider charge is unknown.',
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
          'The speech transcription provider is not configured. You can type your question or use browser dictation where available.',
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
