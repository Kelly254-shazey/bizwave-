const DEV_JWT_FALLBACK = 'bizwave-dev-jwt-secret-change-in-production-min-32-chars-2026';
const DEV_ENCRYPTION_FALLBACK = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const DEV_WEBHOOK_FALLBACK = 'bizwave-dev-webhook-secret-change-in-prod';

export const envConfig = {
  host: process.env.HOST || '127.0.0.1',
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  enableSwagger: process.env.ENABLE_SWAGGER === 'true',
  // Temporarily open the portal's core tools across plans; role permissions stay enforced.
  // Set to true when plan-based restrictions should resume.
  featureGatingEnabled: process.env.PORTAL_FEATURE_GATING_ENABLED === 'true',
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://bizwave_app:bizwave_app_dev_pw@127.0.0.1:5432/bizwave',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  intelligenceUrl:
    process.env.INTELLIGENCE_URL || process.env.INTELLIGENCE_SERVICE_URL || 'http://127.0.0.1:8001',
  jwtSecret: process.env.JWT_SECRET || DEV_JWT_FALLBACK,
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || '15m',
  jwtRefreshDays: parseInt(process.env.JWT_REFRESH_DAYS || '14', 10),
  encryptionKeyHex: process.env.APP_ENCRYPTION_KEY || DEV_ENCRYPTION_FALLBACK,
  webhookSigningSecret: process.env.WEBHOOK_SIGNING_SECRET || DEV_WEBHOOK_FALLBACK,
  uploadDir: process.env.UPLOAD_DIR || '/home/user/bizwave/uploads',
  allowedOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // MsingiAI Platform API (Optional Kenyan Swahili/English Voice for BizWave AI & Connect)
  msingiBaseUrl: (process.env.MSINGI_BASE_URL || 'https://api.msingiai.com').replace(/\/+$/, ''),
  msingiApiKey: process.env.MSINGI_API_KEY || '',
  msingiDefaultVoice: process.env.MSINGI_DEFAULT_VOICE || 'female3',
  msingiTimeoutMs: parseInt(process.env.MSINGI_TIMEOUT_MS || '45000', 10),

  // Optional External LLM Enhancement (OpenAI / Groq / OpenRouter / Ollama OpenAI-compatible API)
  // Always strictly grounded with verified tenant PostgreSQL tool outputs; never invents data.
  llmApiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '',
  llmBaseUrl: (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
  llmModel: process.env.LLM_MODEL || 'gpt-4o-mini',
  llmTimeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || '25000', 10),
};

export function isSecureProductionOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password &&
      !url.hostname.includes('*') && url.pathname === '/' && !url.search && !url.hash && url.origin === origin;
  } catch {
    return false;
  }
}

/**
 * Fail-closed security guard for production deployments.
 * Refuses to boot if development fallback secrets, weak keys, or unsafe CORS are active.
 */
export function assertProductionConfig(): void {
  if (envConfig.nodeEnv !== 'production') return;

  const errors: string[] = [];
  if (!process.env.JWT_SECRET || envConfig.jwtSecret === DEV_JWT_FALLBACK || envConfig.jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be explicitly set (>= 32 chars) and not match the dev default.');
  }
  if (
    !process.env.APP_ENCRYPTION_KEY ||
    envConfig.encryptionKeyHex === DEV_ENCRYPTION_FALLBACK ||
    !/^[0-9a-fA-F]{64}$/.test(envConfig.encryptionKeyHex)
  ) {
    errors.push('APP_ENCRYPTION_KEY must be an explicit 64-char hex key (32 bytes) and not match the dev default.');
  }
  if (
    !process.env.WEBHOOK_SIGNING_SECRET ||
    envConfig.webhookSigningSecret === DEV_WEBHOOK_FALLBACK ||
    envConfig.webhookSigningSecret.length < 24
  ) {
    errors.push('WEBHOOK_SIGNING_SECRET must be explicitly set (>= 24 chars) and not match the dev default.');
  }
  if (!process.env.DATABASE_URL || envConfig.databaseUrl.includes('bizwave_app_dev_pw')) {
    errors.push('DATABASE_URL must use a dedicated production password (not bizwave_app_dev_pw).');
  }
  if (!process.env.CORS_ORIGINS || envConfig.allowedOrigins.length === 0 || !envConfig.allowedOrigins.every(isSecureProductionOrigin)) {
    errors.push('CORS_ORIGINS must list explicit HTTPS production origins (no HTTP, wildcards, credentials, paths or queries).');
  }

  if (errors.length > 0) {
    throw new Error(`PRODUCTION SECURITY CONFIG FAILURE — refusing to start:\n- ${errors.join('\n- ')}`);
  }
}
