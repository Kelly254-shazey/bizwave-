import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service';
import {
  decryptSecret,
  encryptSecret,
  generateOpaqueToken,
  hashPassword,
  sha256Hex,
  verifyPassword,
} from '../../database/crypto.util';
import { envConfig } from '../../config/env.config';
import { effectivePortalFeatures } from '../../common/portal-features';

export const RegisterSchema = z.object({
  businessName: z.string().trim().min(2).max(160),
  businessEmail: z.string().email(),
  phoneNumber: z.string().min(7).max(32).optional(),
  industryCode: z
    .enum(['retail', 'restaurant', 'wholesale', 'salon', 'professional_services', 'general_sme'])
    .default('retail'),
  businessSize: z.enum(['micro', 'small', 'medium', 'enterprise']).default('small'),
  countryCode: z.string().length(2).default('KE'),
  preferredLanguage: z.enum(['en', 'sw']).default('en'),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must include an uppercase letter')
    .regex(/[0-9]/, 'Password must include a number'),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mfaCode: z.string().optional(),
});

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}

  private signAccessToken(userId: string, sessionId: string, email: string): string {
    return jwt.sign(
      { sub: userId, sid: sessionId, email, type: 'access' },
      envConfig.jwtSecret,
      { expiresIn: envConfig.jwtAccessTtl as any },
    );
  }

  async getAuthorizedOrganizations(userId: string) {
    const res = await this.db.query(
      `SELECT t.id, t.name, t.slug, t.display_name, t.industry_code, t.business_size,
              t.currency_code, t.timezone, t.preferred_language, t.logo_url, t.brand_color,
              t.onboarding_completed, t.onboarding_step,
              ARRAY_AGG(DISTINCT r.code) AS roles
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       JOIN tenants t ON t.id = ur.tenant_id
       WHERE ur.user_id = $1 AND ur.is_active = TRUE AND (ur.expires_at IS NULL OR ur.expires_at > NOW()) AND t.status = 'active'
       GROUP BY t.id
       ORDER BY t.created_at ASC`,
      [userId],
    );

    const orgs = [];
    for (const org of res.rows) {
      const perms = await this.db.query(
        `SELECT DISTINCT p.code
         FROM user_roles ur
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE ur.user_id = $1 AND ur.tenant_id = $2 AND ur.is_active = TRUE AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
        [userId, org.id],
      );
      // Subscription tables are RLS protected; resolve each under its tenant context.
      const subscription = await this.db.withTenant(org.id, async (client) => {
        const plan = await client.query(`SELECT sp.code, s.plan_id FROM subscriptions s
          JOIN subscription_plans sp ON sp.id=s.plan_id
          WHERE s.tenant_id=$1 AND s.status IN ('active','trialing') ORDER BY s.created_at DESC LIMIT 1`, [org.id]);
        const features = plan.rows[0] ? await client.query(`SELECT feature_code FROM plan_features WHERE plan_id=$1 AND is_enabled=TRUE`, [plan.rows[0].plan_id]) : { rows: [] };
        return { planCode: plan.rows[0]?.code || 'starter', features: features.rows.map((f) => f.feature_code) };
      });
      orgs.push({
        ...org,
        plan_code: subscription.planCode,
        permissions: perms.rows.map((p) => p.code),
        enabledFeatures: effectivePortalFeatures(subscription.features),
      });
    }
    return orgs;
  }

  async register(rawBody: unknown, ip?: string, userAgent?: string) {
    const parsed = RegisterSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const data = parsed.data;
    const normalizedEmail = data.email.trim().toLowerCase();

    const existing = await this.db.query(`SELECT id FROM users WHERE LOWER(email) = $1`, [
      normalizedEmail,
    ]);
    if (existing.rowCount && existing.rowCount > 0) {
      throw new ConflictException('An account with this email address already exists.');
    }

    const passwordHash = await hashPassword(data.password);
    const slugBase = data.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60);
    const slug = `${slugBase || 'business'}-${Math.floor(1000 + Math.random() * 9000)}`;

    const created = await this.db.withSystemTransaction(async (client) => {
      // Create tenant
      const tenantRes = await client.query(
        `INSERT INTO tenants (
          name, slug, display_name, industry_code, business_size, country_code,
          currency_code, timezone, preferred_language, business_email, phone_number,
          onboarding_completed, onboarding_step
        ) VALUES ($1,$2,$1,$3,$4,$5,'KES','Africa/Nairobi',$6,$7,$8,FALSE,2)
        RETURNING *`,
        [
          data.businessName.trim(),
          slug,
          data.industryCode,
          data.businessSize,
          data.countryCode.toUpperCase(),
          data.preferredLanguage,
          data.businessEmail.trim().toLowerCase(),
          data.phoneNumber || null,
        ],
      );
      const tenant = tenantRes.rows[0];

      // Create default headquarters branch
      const branchRes = await client.query(
        `INSERT INTO branches (tenant_id, code, name, city, county, is_headquarters)
         VALUES ($1, 'HQ-01', 'Main Branch', 'Nairobi', 'Nairobi', TRUE)
         RETURNING id`,
        [tenant.id],
      );

      // Initialize tenant settings from industry template
      const tplRes = await client.query(
        `SELECT default_kpis, default_widgets FROM business_industries WHERE code = $1`,
        [data.industryCode],
      );
      await client.query(
        `INSERT INTO tenant_settings (tenant_id, default_branch_id, enabled_kpis, dashboard_layout)
         VALUES ($1, $2, $3, $4)`,
        [
          tenant.id,
          branchRes.rows[0].id,
          JSON.stringify(tplRes.rows[0]?.default_kpis || ['total_revenue', 'total_expenses']),
          JSON.stringify(tplRes.rows[0]?.default_widgets || ['kpi_summary', 'revenue_trend']),
        ],
      );

      // Create user (NEVER platform admin on registration!)
      const userRes = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone_number, preferred_language, is_platform_admin, email_verified)
         VALUES ($1,$2,$3,$4,$5,$6,FALSE,FALSE)
         RETURNING id, email, first_name, last_name, preferred_language, is_platform_admin, mfa_enabled`,
        [
          normalizedEmail,
          passwordHash,
          data.firstName.trim(),
          data.lastName.trim(),
          data.phoneNumber || null,
          data.preferredLanguage,
        ],
      );
      const user = userRes.rows[0];

      await client.query(`INSERT INTO user_profiles (user_id, job_title) VALUES ($1, 'Business Owner')`, [
        user.id,
      ]);

      // Assign business_owner role strictly scoped to this tenant
      const ownerRole = await client.query(
        `SELECT id FROM roles WHERE code = 'business_owner' AND tenant_id IS NULL LIMIT 1`,
      );
      await client.query(
        `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
        [tenant.id, user.id, ownerRole.rows[0].id],
      );

      // Start on Starter plan (14-day trial) — configurable commercial subscription
      const starterPlan = await client.query(
        `SELECT id FROM subscription_plans WHERE code = 'starter' LIMIT 1`,
      );
      await client.query(
        `INSERT INTO subscriptions (tenant_id, plan_id, status, billing_cycle, current_period_end)
         VALUES ($1, $2, 'trialing', 'monthly', NOW() + INTERVAL '14 days')`,
        [tenant.id, starterPlan.rows[0].id],
      );

      // Initialize default sales channel, expense categories & cash account
      await client.query(
        `INSERT INTO sales_channels (tenant_id, code, name) VALUES ($1, 'in_store_pos', 'In-Store / Walk-In')`,
        [tenant.id],
      );
      await client.query(
        `INSERT INTO cash_accounts (tenant_id, branch_id, name, account_type, opening_balance)
         VALUES ($1, $2, 'Primary M-Pesa / Cash Account', 'mpesa_till', 0)`,
        [tenant.id, branchRes.rows[0].id],
      );
      await client.query(
        `INSERT INTO expense_categories (tenant_id, name, category_type) VALUES
         ($1, 'Rent', 'rent'), ($1, 'Utilities', 'utilities'), ($1, 'Staff & Payroll', 'payroll'), ($1, 'Supplies', 'operating')`,
        [tenant.id],
      );

      // Email verification token
      const verifyRaw = generateOpaqueToken(24);
      await client.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '48 hours')`,
        [user.id, sha256Hex(verifyRaw)],
      );

      // Create session + rotating refresh token
      const sessionRes = await client.query(
        `INSERT INTO user_sessions (user_id, active_tenant_id, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3::inet, $4, NOW() + ($5 || ' days')::interval)
         RETURNING id`,
        [user.id, tenant.id, ip || null, userAgent || null, String(envConfig.jwtRefreshDays)],
      );
      const sessionId = sessionRes.rows[0].id;
      const refreshRaw = generateOpaqueToken(48);
      await client.query(
        `INSERT INTO refresh_tokens (session_id, user_id, token_hash, token_family, expires_at)
         VALUES ($1, $2, $3, gen_random_uuid(), NOW() + ($4 || ' days')::interval)`,
        [sessionId, user.id, sha256Hex(refreshRaw), String(envConfig.jwtRefreshDays)],
      );

      return { user, tenant, sessionId, refreshRaw };
    });

    await this.db.appendAuditLog({
      tenantId: created.tenant.id,
      actorUserId: created.user.id,
      actorEmail: created.user.email,
      action: 'auth.register_organization',
      resourceType: 'tenant',
      resourceId: created.tenant.id,
      ipAddress: ip,
      userAgent,
      changes: { industryCode: data.industryCode, businessSize: data.businessSize },
    });

    const accessToken = this.signAccessToken(
      created.user.id,
      created.sessionId,
      created.user.email,
    );
    const organizations = await this.getAuthorizedOrganizations(created.user.id);

    return {
      accessToken,
      refreshToken: created.refreshRaw,
      user: {
        id: created.user.id,
        email: created.user.email,
        firstName: created.user.first_name,
        lastName: created.user.last_name,
        preferredLanguage: created.user.preferred_language,
        isPlatformAdmin: false,
        mfaEnabled: false,
      },
      organizations,
      activeTenantId: created.tenant.id,
    };
  }

  async login(rawBody: unknown, ip?: string, userAgent?: string) {
    const parsed = LoginSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException('Please provide a valid email and password.');
    }
    const { email, password, mfaCode } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    // Check recent failed attempts (simple rate/lockout guard: 8 failures in 15 min)
    const failCountRes = await this.db.query(
      `SELECT COUNT(*)::int AS cnt FROM login_attempts
       WHERE LOWER(email) = $1 AND succeeded = FALSE AND created_at > NOW() - INTERVAL '15 minutes'`,
      [normalizedEmail],
    );
    if (failCountRes.rows[0].cnt >= 8) {
      throw new UnauthorizedException(
        'Too many failed login attempts. Please wait 15 minutes or reset your password.',
      );
    }

    const userRes = await this.db.query(
      `SELECT id, email, password_hash, first_name, last_name, preferred_language,
              mfa_enabled, is_platform_admin, status
       FROM users WHERE LOWER(email) = $1`,
      [normalizedEmail],
    );

    if (userRes.rowCount === 0) {
      await this.db.query(
        `INSERT INTO login_attempts (email, ip_address, user_agent, succeeded, failure_reason)
         VALUES ($1, $2::inet, $3, FALSE, 'unknown_email')`,
        [normalizedEmail, ip || null, userAgent || null],
      );
      throw new UnauthorizedException('Invalid email or password.');
    }

    const user = userRes.rows[0];
    if (user.status !== 'active') {
      throw new UnauthorizedException('This account is currently inactive or locked.');
    }

    const valid = await verifyPassword(user.password_hash, password);
    if (!valid) {
      await this.db.query(
        `INSERT INTO login_attempts (email, user_id, ip_address, user_agent, succeeded, failure_reason)
         VALUES ($1, $2, $3::inet, $4, FALSE, 'bad_password')`,
        [normalizedEmail, user.id, ip || null, userAgent || null],
      );
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Check MFA if enabled
    if (user.mfa_enabled) {
      if (!mfaCode) {
        return {
          mfaRequired: true,
          message: 'Please enter the 6-digit verification code from your authenticator app.',
        };
      }
      const mfaRow = await this.db.query(
        `SELECT secret_encrypted FROM mfa_methods WHERE user_id = $1 AND method_type = 'totp' AND is_verified = TRUE`,
        [user.id],
      );
      if (mfaRow.rowCount === 0) {
        throw new UnauthorizedException('MFA method not found');
      }
      const secret = decryptSecret(mfaRow.rows[0].secret_encrypted);
      const ok = authenticator.verify({ token: mfaCode.trim(), secret });
      if (!ok) {
        throw new UnauthorizedException('Invalid MFA verification code.');
      }
    }

    const organizations = await this.getAuthorizedOrganizations(user.id);
    const defaultTenantId = organizations[0]?.id || null;

    const sessionRes = await this.db.query(
      `INSERT INTO user_sessions (user_id, active_tenant_id, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3::inet, $4, NOW() + ($5 || ' days')::interval)
       RETURNING id`,
      [user.id, defaultTenantId, ip || null, userAgent || null, String(envConfig.jwtRefreshDays)],
    );
    const sessionId = sessionRes.rows[0].id;
    const refreshRaw = generateOpaqueToken(48);
    await this.db.query(
      `INSERT INTO refresh_tokens (session_id, user_id, token_hash, token_family, expires_at)
       VALUES ($1, $2, $3, gen_random_uuid(), NOW() + ($4 || ' days')::interval)`,
      [sessionId, user.id, sha256Hex(refreshRaw), String(envConfig.jwtRefreshDays)],
    );

    await this.db.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);
    await this.db.query(
      `INSERT INTO login_attempts (email, user_id, ip_address, user_agent, succeeded)
       VALUES ($1, $2, $3::inet, $4, TRUE)`,
      [normalizedEmail, user.id, ip || null, userAgent || null],
    );

    await this.db.appendAuditLog({
      tenantId: defaultTenantId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'auth.login',
      resourceType: 'user_session',
      resourceId: sessionId,
      ipAddress: ip,
      userAgent,
      changes: { mfaUsed: Boolean(user.mfa_enabled) },
    });

    return {
      mfaRequired: false,
      accessToken: this.signAccessToken(user.id, sessionId, user.email),
      refreshToken: refreshRaw,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        preferredLanguage: user.preferred_language,
        isPlatformAdmin: Boolean(user.is_platform_admin),
        mfaEnabled: Boolean(user.mfa_enabled),
      },
      organizations,
      activeTenantId: defaultTenantId,
    };
  }

  async refresh(refreshToken: string, ip?: string) {
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');
    const hash = sha256Hex(refreshToken);

    const tokenRes = await this.db.query(
      `SELECT rt.*, u.email, u.status AS user_status
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1`,
      [hash],
    );

    if (tokenRes.rowCount === 0) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const existing = tokenRes.rows[0];

    // Reuse detection: if an already-revoked token is replayed, revoke the ENTIRE token family & session!
    if (existing.revoked_at) {
      await this.db.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_family = $1 AND revoked_at IS NULL`,
        [existing.token_family],
      );
      await this.db.query(`UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1`, [
        existing.session_id,
      ]);
      await this.db.query(
        `INSERT INTO security_events (user_id, event_type, severity, ip_address, details)
         VALUES ($1, 'refresh_token_reuse_detected', 'high', $2::inet, $3::jsonb)`,
        [existing.user_id, ip || null, JSON.stringify({ tokenFamily: existing.token_family })],
      );
      throw new UnauthorizedException(
        'Security alert: refresh token reuse detected. Session has been revoked.',
      );
    }

    if (new Date(existing.expires_at) < new Date() || existing.user_status !== 'active') {
      throw new UnauthorizedException('Refresh token expired');
    }

    const newRefreshRaw = generateOpaqueToken(48);
    const newHash = sha256Hex(newRefreshRaw);

    const inserted = await this.db.query(
      `INSERT INTO refresh_tokens (session_id, user_id, token_hash, token_family, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + ($5 || ' days')::interval)
       RETURNING id`,
      [
        existing.session_id,
        existing.user_id,
        newHash,
        existing.token_family,
        String(envConfig.jwtRefreshDays),
      ],
    );

    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by = $1 WHERE id = $2`,
      [inserted.rows[0].id, existing.id],
    );
    await this.db.query(`UPDATE user_sessions SET last_active_at = NOW() WHERE id = $1`, [
      existing.session_id,
    ]);

    return {
      accessToken: this.signAccessToken(existing.user_id, existing.session_id, existing.email),
      refreshToken: newRefreshRaw,
    };
  }

  async logout(sessionId: string, userId: string) {
    await this.db.query(`UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1 AND user_id = $2`, [
      sessionId,
      userId,
    ]);
    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE session_id = $1 AND revoked_at IS NULL`,
      [sessionId],
    );
    return { message: 'Logged out successfully' };
  }

  async forgotPassword(email: string) {
    const res = await this.db.query(`SELECT id, email FROM users WHERE LOWER(email) = $1`, [
      email.trim().toLowerCase(),
    ]);
    // Always return generic message to prevent email enumeration
    if (res.rowCount && res.rowCount > 0) {
      const token = generateOpaqueToken(32);
      await this.db.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
        [res.rows[0].id, sha256Hex(token)],
      );
      return {
        message: 'If an account matches that email, password reset instructions have been prepared.',
        // Exposed only in non-production environments for automated testing
        ...(envConfig.nodeEnv !== 'production' ? { devResetToken: token } : {}),
      };
    }
    return {
      message: 'If an account matches that email, password reset instructions have been prepared.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    if (!token || !newPassword || newPassword.length < 8) {
      throw new BadRequestException('Valid reset token and password (min 8 chars) are required.');
    }
    const res = await this.db.query(
      `SELECT * FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [sha256Hex(token)],
    );
    if (res.rowCount === 0) {
      throw new BadRequestException('Reset token is invalid or expired.');
    }
    const row = res.rows[0];
    const hash = await hashPassword(newPassword);
    await this.db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, row.user_id]);
    await this.db.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);
    await this.db.query(`UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1`, [
      row.user_id,
    ]);
    return { message: 'Password updated successfully. Please sign in with your new password.' };
  }

  async changePassword(userId: string, sessionId: string, currentPassword: string, newPassword: string) {
    const policy = z.string().min(8).max(128).regex(/[A-Z]/).regex(/[0-9]/);
    if (!policy.safeParse(newPassword).success) throw new BadRequestException('New password must have 8–128 characters, an uppercase letter and a number.');
    if (!currentPassword || currentPassword === newPassword) throw new BadRequestException('Enter your current password and choose a different new password.');
    const row = await this.db.query(`SELECT password_hash, email FROM users WHERE id=$1`, [userId]);
    if (!row.rowCount || !(await verifyPassword(row.rows[0].password_hash, currentPassword))) throw new UnauthorizedException('Current password is incorrect.');
    const hash = await hashPassword(newPassword);
    await this.db.withSystemTransaction(async (client) => {
      await client.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [hash, userId]);
      await client.query(`UPDATE user_sessions SET revoked_at=NOW() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL`, [userId, sessionId]);
      await client.query(`UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL`, [userId]);
    });
    await this.db.appendAuditLog({ actorUserId: userId, actorEmail: row.rows[0].email, action: 'auth.password_changed', resourceType: 'user', resourceId: userId });
    return { changed: true, message: 'Password changed. Other sessions were signed out.' };
  }

  async setupMfa(userId: string, email: string) {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(email, 'BizWave', secret);
    await this.db.query(
      `INSERT INTO mfa_methods (user_id, method_type, secret_encrypted, is_verified)
       VALUES ($1, 'totp', $2, FALSE)
       ON CONFLICT (user_id, method_type)
       DO UPDATE SET secret_encrypted = EXCLUDED.secret_encrypted, is_verified = FALSE`,
      [userId, encryptSecret(secret)],
    );
    return { secret, otpauthUrl };
  }

  async verifyMfaSetup(userId: string, code: string) {
    const row = await this.db.query(
      `SELECT id, secret_encrypted FROM mfa_methods WHERE user_id = $1 AND method_type = 'totp'`,
      [userId],
    );
    if (row.rowCount === 0) {
      throw new BadRequestException('Please initiate MFA setup first.');
    }
    const secret = decryptSecret(row.rows[0].secret_encrypted);
    if (!authenticator.verify({ token: code.trim(), secret })) {
      throw new BadRequestException('Invalid 6-digit authenticator code.');
    }
    await this.db.query(`UPDATE mfa_methods SET is_verified = TRUE, last_used_at = NOW() WHERE id = $1`, [
      row.rows[0].id,
    ]);
    await this.db.query(`UPDATE users SET mfa_enabled = TRUE WHERE id = $1`, [userId]);
    return { mfaEnabled: true, message: 'Two-factor authentication is now enabled.' };
  }

  async listSessions(userId: string, currentSessionId: string) {
    const res = await this.db.query(
      `SELECT id, ip_address, user_agent, created_at, last_active_at, expires_at, revoked_at
       FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 15`,
      [userId],
    );
    return res.rows.map((s) => ({ ...s, isCurrent: s.id === currentSessionId }));
  }

  async revokeSession(userId: string, sessionId: string) {
    await this.db.query(`UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1 AND user_id = $2`, [
      sessionId,
      userId,
    ]);
    return { revoked: true };
  }
}
