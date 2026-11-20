import 'reflect-metadata';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import { AppModule } from './app.module';
import { assertProductionConfig, envConfig } from './config/env.config';

const logger = pino({
  level: envConfig.nodeEnv === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-bizwave-signature"]',
      '*.password',
      '*.temporaryPassword',
      '*.refreshToken',
      '*.accessToken',
      '*.credentials',
      '*.secret',
      '*.apiKey',
      '*.msingiApiKey',
      '*.llmApiKey',
    ],
    censor: '[REDACTED]',
  },
});

async function bootstrap() {
  assertProductionConfig();
  const isProd = envConfig.nodeEnv === 'production';

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  // Senior Cybersecurity hardening: strict baseline security headers
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: isProd ? 'same-site' : 'cross-origin' },
      frameguard: isProd ? { action: 'deny' } : false,
      hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      noSniff: true,
      xssFilter: true,
    }),
  );

  // Additional explicit browser permission restrictions
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(self), payment=(), usb=()');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    next();
  });

  // Explicit request body cap (anti-payload-DoS) before composite login rate limiting
  app.use(express.json({ limit: '2mb' }));

  // Tiered rate limiting:
  // 1) OWASP ASVS V2.2.1 per-(IP, email) failed-login brute-force defense (prevents shared shop Wi-Fi false lockouts)
  app.use(
    '/api/v1/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: Number(process.env.RATE_LIMIT_AUTH_FAIL_MAX || 12),
      skipSuccessfulRequests: true,
      keyGenerator: (req: any) =>
        `${req.ip || 'unknown'}:${String(req.body?.email || 'anon').trim().toLowerCase().slice(0, 120)}`,
      standardHeaders: true,
      legacyHeaders: false,
      message: { statusCode: 429, message: 'Too many failed login attempts for this account. Please wait before retrying.' },
    }),
  );
  // 2) Per-IP credential-stuffing ceiling across all accounts
  app.use(
    '/api/v1/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: Number(process.env.RATE_LIMIT_AUTH_IP_MAX || 200),
      standardHeaders: true,
      legacyHeaders: false,
      message: { statusCode: 429, message: 'Too many login requests from this network. Please wait before retrying.' },
    }),
  );
  app.use(
    '/api/v1/ai',
    rateLimit({
      windowMs: 60 * 1000,
      max: 60,
      standardHeaders: true,
      legacyHeaders: false,
      message: { statusCode: 429, message: 'BizWave AI rate limit reached. Please pause briefly.' },
    }),
  );
  app.use(
    '/api/v1',
    rateLimit({
      windowMs: 60 * 1000,
      max: Number(process.env.RATE_LIMIT_GLOBAL_MAX || 1200),
      standardHeaders: true,
      legacyHeaders: false,
      message: { statusCode: 429, message: 'API rate limit reached. Please pause briefly.' },
    }),
  );

  app.enableCors({
    origin: isProd ? envConfig.allowedOrigins : true,
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Tenant-Id',
      'X-Idempotency-Key',
      'X-BizWave-Signature',
    ],
  });

  app.setGlobalPrefix('api/v1');

  // Expose interactive Swagger API docs only in non-production unless ENABLE_SWAGGER=true
  if (!isProd || envConfig.enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('BizWave AI-Powered SME Intelligence API')
      .setDescription(
        'BizWave Analytics, Predict, AI and opt-in business discovery. Customer communications can be prepared, but outbound delivery and online billing are not connected in this release.',
      )
      .setVersion('2.0.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'X-Tenant-Id', in: 'header' }, 'X-Tenant-Id')
      .build();
    const doc = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, doc);
  }

  await app.listen(envConfig.port, envConfig.host);
  logger.info({ host: envConfig.host, port: envConfig.port, env: envConfig.nodeEnv }, 'BizWave NestJS API listening');
}

bootstrap();
