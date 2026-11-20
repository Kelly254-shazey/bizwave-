import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../../database/database.service';
import { encryptSecret, verifyHmacSignature } from '../../database/crypto.util';
import {
  CurrentUser,
  Public,
  RequireFeature,
  RequirePermissions,
  TenantCtx,
} from '../../common/decorators/auth.decorators';
import { AuthenticatedUser, TenantAuthContext } from '../../common/types/auth.types';

/**
 * Provider-independent messaging adapter interface (Section 2.4 & Section 13)
 * NEVER simulates successful external delivery when credentials are not configured!
 */
interface DispatchResult {
  deliveryStatus: 'submitted' | 'provider_unconfigured' | 'failed';
  providerMessageId: string | null;
  failureReason: string | null;
}

async function dispatchViaProviderAdapter(params: {
  providerCode: string;
  channelType: string;
  hasConfiguredCredentials: boolean;
  requiredEnvKeys: string[];
  recipient: string;
  body: string;
}): Promise<DispatchResult> {
  if (!params.hasConfiguredCredentials) {
    return {
      deliveryStatus: 'provider_unconfigured',
      providerMessageId: null,
      failureReason: `External delivery was not attempted. Outbound ${params.channelType.toUpperCase()} provider integration is not available in this release.`,
    };
  }
  // Credentials can be stored, but there is no outbound carrier adapter in
  // this release. Never imply that a provider was contacted or accepted it.
  return {
    deliveryStatus: 'provider_unconfigured',
    providerMessageId: null,
    failureReason: `External delivery was not attempted. Stored ${params.providerCode} credentials do not enable outbound delivery in this release.`,
  };
}

@ApiTags('BizWave Connect (Customer Communications)')
@ApiBearerAuth()
@Controller('communications')
export class CommunicationsController {
  constructor(private readonly db: DatabaseService) {}

  // The existing campaign/session records are tenant-wide and do not reliably
  // identify a branch. Fail closed for branch-restricted roles rather than
  // disclosing contacts, message bodies, or aggregates from other branches.
  private requireWholeBusiness(ctx: TenantAuthContext) {
    if (ctx.allowedBranchIds !== null) throw new ForbiddenException('Customer communications require whole-business access.');
  }

  @Get('overview')
  @RequireFeature('connect_core')
  @RequirePermissions('connect:read')
  async overview(@TenantCtx() ctx: TenantAuthContext) {
    this.requireWholeBusiness(ctx);
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const [channels, providers, templates, campaigns, messages, voice, ussd] = await Promise.all([
        client.query(
          `SELECT cc.*, cp.code AS provider_code, cp.name AS provider_name, cp.required_env_keys,
                  ca.account_label, ca.credential_status
           FROM communication_channels cc
           JOIN communication_providers cp ON cp.id = cc.provider_id
           LEFT JOIN communication_accounts ca ON ca.tenant_id = cc.tenant_id AND ca.channel_id = cc.id
           WHERE cc.tenant_id = $1`,
          [ctx.tenantId],
        ),
        client.query(`SELECT * FROM communication_providers WHERE is_active = TRUE ORDER BY name ASC`),
        client.query(`SELECT * FROM communication_templates WHERE tenant_id = $1 ORDER BY created_at DESC`, [ctx.tenantId]),
        client.query(
          `SELECT c.*, t.name AS template_name
           FROM communication_campaigns c
           LEFT JOIN communication_templates t ON t.tenant_id = c.tenant_id AND t.id = c.template_id
           WHERE c.tenant_id = $1 ORDER BY c.created_at DESC LIMIT 20`,
          [ctx.tenantId],
        ),
        client.query(
          `SELECT m.*, cust.full_name AS customer_name
           FROM communication_messages m
           LEFT JOIN customers cust ON cust.tenant_id = m.tenant_id AND cust.id = m.customer_id
           WHERE m.tenant_id = $1 ORDER BY m.created_at DESC LIMIT 40`,
          [ctx.tenantId],
        ),
        client.query(`SELECT * FROM voice_sessions WHERE tenant_id = $1 ORDER BY started_at DESC LIMIT 15`, [ctx.tenantId]),
        client.query(`SELECT * FROM ussd_sessions WHERE tenant_id = $1 ORDER BY started_at DESC LIMIT 15`, [ctx.tenantId]),
      ]);
      return {
        channels: channels.rows,
        providers: providers.rows,
        templates: templates.rows,
        campaigns: campaigns.rows,
        messages: messages.rows,
        voiceSessions: voice.rows,
        ussdSessions: ussd.rows,
      };
    });
  }

  @Post('channels/configure')
  @RequireFeature('connect_core')
  @RequirePermissions('connect:manage')
  async configureChannel(
    @Body()
    body: {
      channelType: 'sms' | 'whatsapp' | 'voice' | 'ussd';
      providerCode: string;
      senderId: string;
      credentials?: Record<string, string>;
      webhookSecret?: string;
    },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    this.requireWholeBusiness(ctx);
    const result = await this.db.withTenant(ctx.tenantId, async (client) => {
      const prov = await client.query(`SELECT * FROM communication_providers WHERE code = $1`, [body.providerCode]);
      if (prov.rowCount === 0) throw new BadRequestException('Unknown communication provider');

      const ch = await client.query(
        `INSERT INTO communication_channels (tenant_id, channel_type, provider_id, sender_id, is_enabled)
         VALUES ($1,$2,$3,$4,TRUE)
         ON CONFLICT (tenant_id, channel_type)
         DO UPDATE SET provider_id = EXCLUDED.provider_id, sender_id = EXCLUDED.sender_id, is_enabled = TRUE
         RETURNING *`,
        [ctx.tenantId, body.channelType, prov.rows[0].id, body.senderId || 'BIZWAVE'],
      );

      const hasCreds = Boolean(body.credentials && Object.values(body.credentials).some((v) => v && v.trim()));
      await client.query(
        `INSERT INTO communication_accounts (tenant_id, channel_id, account_label, encrypted_credentials, webhook_secret_encrypted, credential_status)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (tenant_id, channel_id)
         DO UPDATE SET
           encrypted_credentials = COALESCE(EXCLUDED.encrypted_credentials, communication_accounts.encrypted_credentials),
           webhook_secret_encrypted = COALESCE(EXCLUDED.webhook_secret_encrypted, communication_accounts.webhook_secret_encrypted),
           credential_status = EXCLUDED.credential_status,
           updated_at = NOW()`,
        [
          ctx.tenantId,
          ch.rows[0].id,
          `${prov.rows[0].name} (${body.channelType.toUpperCase()})`,
          hasCreds ? encryptSecret(JSON.stringify(body.credentials)) : null,
          body.webhookSecret ? encryptSecret(body.webhookSecret) : null,
          hasCreds ? 'configured' : 'missing_credentials',
        ],
      );
      return ch.rows[0];
    });

    await this.db.appendAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'communications.channel_configured',
      resourceType: 'communication_channel',
      resourceId: result.id,
      ipAddress: req.ip,
      changes: { channelType: body.channelType, providerCode: body.providerCode },
    });

    return { channel: result };
  }

  @Post('templates')
  @RequireFeature('connect_core')
  @RequirePermissions('connect:manage')
  async createTemplate(
    @Body()
    body: {
      name: string;
      channelType: 'sms' | 'whatsapp' | 'voice' | 'ussd';
      language: 'en' | 'sw';
      purpose: 'marketing' | 'transactional' | 'service_alerts';
      bodyTemplate: string;
    },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.requireWholeBusiness(ctx);
    if (!body.name || !body.bodyTemplate) throw new BadRequestException('name and bodyTemplate required');
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const vars = [...body.bodyTemplate.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
      const ins = await client.query(
        `INSERT INTO communication_templates (tenant_id, name, channel_type, language, purpose, body_template, variables, created_by, approval_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'draft') RETURNING *`,
        [ctx.tenantId, body.name, body.channelType, body.language || 'en', body.purpose || 'marketing', body.bodyTemplate, JSON.stringify(vars), user.userId],
      );
      return { template: ins.rows[0] };
    });
  }

  @Get('campaigns')
  @RequireFeature('connect_core')
  @RequirePermissions('connect:read')
  async listCampaigns(@TenantCtx() ctx: TenantAuthContext) {
    this.requireWholeBusiness(ctx);
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const res = await client.query(`SELECT * FROM communication_campaigns WHERE tenant_id = $1 ORDER BY created_at DESC`, [ctx.tenantId]);
      return { campaigns: res.rows };
    });
  }

  @Post('campaigns')
  @RequireFeature('connect_core')
  @RequirePermissions('connect:send')
  async createAndLaunchCampaign(
    @Body()
    body: {
      name: string;
      channelType: 'sms' | 'whatsapp' | 'voice' | 'ussd';
      templateId?: string;
      customMessage?: string;
      purpose: 'marketing' | 'transactional' | 'service_alerts';
      customerIds?: string[];
    },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    this.requireWholeBusiness(ctx);
    if (!body.name) throw new BadRequestException('Campaign name is required');
    const purpose = body.purpose || 'marketing';

    const outcome = await this.db.withTenant(ctx.tenantId, async (client) => {
      let bodyText = body.customMessage || '';
      if (body.templateId) {
        const t = await client.query(`SELECT body_template FROM communication_templates WHERE tenant_id = $1 AND id = $2`, [
          ctx.tenantId,
          body.templateId,
        ]);
        if (t.rows[0]) bodyText = t.rows[0].body_template;
      }
      if (!bodyText) throw new BadRequestException('Provide a templateId or customMessage.');

      // Resolve configured provider & credential status
      const chRes = await client.query(
        `SELECT cc.*, cp.code AS provider_code, cp.required_env_keys, ca.credential_status
         FROM communication_channels cc
         JOIN communication_providers cp ON cp.id = cc.provider_id
         LEFT JOIN communication_accounts ca ON ca.tenant_id = cc.tenant_id AND ca.channel_id = cc.id
         WHERE cc.tenant_id = $1 AND cc.channel_type = $2 LIMIT 1`,
        [ctx.tenantId, body.channelType],
      );
      const providerCode = chRes.rows[0]?.provider_code || (body.channelType === 'whatsapp' ? 'meta_whatsapp' : 'africas_talking');
      const requiredKeys: string[] = chRes.rows[0]?.required_env_keys || ['AFRICASTALKING_API_KEY'];
      const hasCreds = chRes.rows[0]?.credential_status === 'configured' || chRes.rows[0]?.credential_status === 'verified';

      // Target customers
      const custRes = await client.query(
        `SELECT c.id, c.full_name, c.phone_number, c.marketing_opt_in,
                (SELECT status FROM customer_consents cc
                 WHERE cc.tenant_id = c.tenant_id AND cc.customer_id = c.id
                   AND cc.channel = $2 AND cc.purpose = $3 LIMIT 1) AS explicit_consent
         FROM customers c
         WHERE c.tenant_id = $1 AND c.phone_number IS NOT NULL
           AND ($4::uuid[] IS NULL OR c.id = ANY($4::uuid[]))`,
        [ctx.tenantId, body.channelType, purpose, body.customerIds?.length ? body.customerIds : null],
      );

      let consentedCount = 0;
      let skippedNoConsent = 0;
      const campIns = await client.query(
        `INSERT INTO communication_campaigns (tenant_id, name, channel_type, template_id, purpose, status, target_count, created_by)
         VALUES ($1,$2,$3,$4,$5,'processing',$6,$7) RETURNING *`,
        [ctx.tenantId, body.name, body.channelType, body.templateId || null, purpose, custRes.rows.length, user.userId],
      );
      const camp = campIns.rows[0];

      for (const cust of custRes.rows) {
        // STRICT CONSENT ENFORCEMENT (Section 13 & Kenya DPA 2019): NEVER send marketing without explicit granted consent!
        const hasConsent =
          purpose === 'transactional'
            ? cust.explicit_consent !== 'revoked'
            : cust.explicit_consent === 'granted';

        const rendered = bodyText.replace(/\{\{name\}\}/g, cust.full_name);

        if (!hasConsent) {
          skippedNoConsent++;
          await client.query(
            `INSERT INTO communication_messages (tenant_id, campaign_id, customer_id, channel_type, provider_code, recipient_address, body, purpose, consent_checked, delivery_status, failure_reason)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,'rejected_no_consent','Blocked by Kenya DPA consent guard: customer has not granted marketing consent for this channel.')`,
            [ctx.tenantId, camp.id, cust.id, body.channelType, providerCode, cust.phone_number, rendered, purpose],
          );
          continue;
        }

        consentedCount++;
        const dispatch = await dispatchViaProviderAdapter({
          providerCode,
          channelType: body.channelType,
          hasConfiguredCredentials: hasCreds,
          requiredEnvKeys: requiredKeys,
          recipient: cust.phone_number,
          body: rendered,
        });

        await client.query(
          `INSERT INTO communication_messages (tenant_id, campaign_id, customer_id, channel_type, provider_code, recipient_address, body, purpose, consent_checked, provider_message_id, delivery_status, failure_reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9,$10,$11)`,
          [
            ctx.tenantId,
            camp.id,
            cust.id,
            body.channelType,
            providerCode,
            cust.phone_number,
            rendered,
            purpose,
            dispatch.providerMessageId,
            dispatch.deliveryStatus,
            dispatch.failureReason,
          ],
        );
      }

      // Outbound delivery is not implemented, even when credentials are saved.
      // Keep the campaign blocked and never claim that it was sent/completed.
      const upd = await client.query(
        `UPDATE communication_campaigns SET status = 'blocked_provider_unconfigured', consented_count = $3, skipped_no_consent_count = $4, sent_at = NULL
         WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [ctx.tenantId, camp.id, consentedCount, skippedNoConsent],
      );

      return {
        campaign: upd.rows[0],
        providerConfigured: hasCreds,
        requiredCredentials: hasCreds ? [] : requiredKeys,
        deliveryEnabled: false,
        honestNotice: 'No messages were sent. Outbound provider delivery is not connected in this release, even if credentials are saved.',
      };
    });

    await this.db.appendAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'communications.campaign_executed',
      resourceType: 'communication_campaign',
      resourceId: outcome.campaign.id,
      ipAddress: req.ip,
      changes: {
        channel: body.channelType,
        consented: outcome.campaign.consented_count,
        skippedNoConsent: outcome.campaign.skipped_no_consent_count,
        status: outcome.campaign.status,
      },
    });

    return outcome;
  }

  @Post('messages')
  @RequireFeature('connect_core')
  @RequirePermissions('connect:send')
  async sendDirectMessage(
    @Body()
    body: {
      customerId: string;
      channelType: 'sms' | 'whatsapp' | 'voice' | 'ussd';
      purpose: 'marketing' | 'transactional' | 'service_alerts';
      message: string;
    },
    @TenantCtx() ctx: TenantAuthContext,
  ) {
    this.requireWholeBusiness(ctx);
    if (!body.customerId || !body.message) {
      throw new BadRequestException('customerId and message are required');
    }
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const cRes = await client.query(
        `SELECT c.*, (SELECT status FROM customer_consents cc WHERE cc.tenant_id = c.tenant_id AND cc.customer_id = c.id AND cc.channel = $3 AND cc.purpose = $4 LIMIT 1) AS consent_status
         FROM customers c WHERE c.tenant_id = $1 AND c.id = $2`,
        [ctx.tenantId, body.customerId, body.channelType, body.purpose],
      );
      if (cRes.rowCount === 0) throw new BadRequestException('Customer not found');
      const cust = cRes.rows[0];
      if (!cust.phone_number) throw new BadRequestException('Customer has no phone number on file.');

      const allowed =
        body.purpose === 'transactional'
          ? cust.consent_status !== 'revoked'
          : cust.consent_status === 'granted';

      if (!allowed) {
        const ins = await client.query(
          `INSERT INTO communication_messages (tenant_id, customer_id, channel_type, provider_code, recipient_address, body, purpose, consent_checked, delivery_status, failure_reason)
           VALUES ($1,$2,$3,'consent_guard',$4,$5,$6,TRUE,'rejected_no_consent','Customer has not opted in to marketing messages on this channel.') RETURNING *`,
          [ctx.tenantId, cust.id, body.channelType, cust.phone_number, body.message, body.purpose],
        );
        return { message: ins.rows[0], blockedByConsent: true };
      }

      const dispatch = await dispatchViaProviderAdapter({
        providerCode: body.channelType === 'whatsapp' ? 'meta_whatsapp' : 'africas_talking',
        channelType: body.channelType,
        hasConfiguredCredentials: false,
        requiredEnvKeys: body.channelType === 'whatsapp' ? ['META_WHATSAPP_ACCESS_TOKEN', 'META_WHATSAPP_PHONE_NUMBER_ID'] : ['AFRICASTALKING_USERNAME', 'AFRICASTALKING_API_KEY'],
        recipient: cust.phone_number,
        body: body.message,
      });

      const ins = await client.query(
        `INSERT INTO communication_messages (tenant_id, customer_id, channel_type, provider_code, recipient_address, body, purpose, consent_checked, delivery_status, failure_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9) RETURNING *`,
        [
          ctx.tenantId,
          cust.id,
          body.channelType,
          body.channelType === 'whatsapp' ? 'meta_whatsapp' : 'africas_talking',
          cust.phone_number,
          body.message,
          body.purpose,
          dispatch.deliveryStatus,
          dispatch.failureReason,
        ],
      );
      return { message: ins.rows[0], blockedByConsent: false };
    });
  }

  @Get('reports')
  @RequireFeature('connect_core')
  @RequirePermissions('connect:read')
  async deliveryReports(@TenantCtx() ctx: TenantAuthContext) {
    this.requireWholeBusiness(ctx);
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const res = await client.query(
        `SELECT channel_type, delivery_status, COUNT(*)::int AS count
         FROM communication_messages WHERE tenant_id = $1
         GROUP BY channel_type, delivery_status
         ORDER BY channel_type, count DESC`,
        [ctx.tenantId],
      );
      return { breakdown: res.rows };
    });
  }

  /**
   * Provider Webhook Receiver with HMAC Signature Verification & Replay/Idempotency Protection (Section 13)
   */
  @Public()
  @Post('webhooks/:provider')
  async receiveWebhook(
    @Param('provider') provider: string,
    @Headers('x-bizwave-signature') sigHeader: string | undefined,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Body() payload: Record<string, any>,
  ) {
    const key = idempotencyKey || payload.eventId || payload.id;
    if (!key) throw new BadRequestException('Missing webhook event idempotency identifier');

    const secret = process.env.WEBHOOK_SIGNING_SECRET || 'bizwave-dev-webhook-secret';
    const sigValid = sigHeader ? verifyHmacSignature(JSON.stringify(payload), secret, sigHeader) : false;

    if (!sigValid) {
      // Log rejected webhook attempt under a non-colliding key so attackers CANNOT poison
      // the idempotency_key of a subsequent legitimate signed webhook event.
      const rejectKey = `rejected:${Date.now()}:${Math.random().toString(36).slice(2, 8)}:${String(key)}`;
      await this.db.query(
        `INSERT INTO webhook_events (provider_code, idempotency_key, signature_valid, event_type, payload, processed_at)
         VALUES ($1,$2,false,$3,$4::jsonb,NULL)`,
        [provider, rejectKey, payload.eventType || 'delivery_receipt', JSON.stringify(payload)],
      );
      throw new UnauthorizedException('Invalid webhook cryptographic signature.');
    }

    const existing = await this.db.query(
      `SELECT id FROM webhook_events WHERE idempotency_key = $1 AND signature_valid = true`,
      [String(key)],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return { accepted: true, duplicateIgnored: true };
    }

    await this.db.query(
      `INSERT INTO webhook_events (provider_code, idempotency_key, signature_valid, event_type, payload, processed_at)
       VALUES ($1,$2,true,$3,$4::jsonb,NOW())`,
      [provider, String(key), payload.eventType || 'delivery_receipt', JSON.stringify(payload)],
    );

    return { accepted: true, signatureVerified: true, idempotencyKey: key };
  }
}
