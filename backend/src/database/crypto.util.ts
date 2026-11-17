import crypto from 'crypto';
import argon2 from 'argon2';
import { envConfig } from '../config/env.config';

const ENC_KEY = Buffer.from(envConfig.encryptionKeyHex.slice(0, 64), 'hex');

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function sha256Hex(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function generateOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * AES-256-GCM authenticated encryption for integration secrets & MFA secrets
 */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(ciphertext: string): string {
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  if (!ivHex || !tagHex || !encHex) {
    throw new Error('Malformed encrypted payload');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function verifyHmacSignature(payload: string, secret: string, providedSig: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const cleaned = providedSig.replace(/^sha256=/, '');
  if (expected.length !== cleaned.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(cleaned));
}
