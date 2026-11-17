import { BadRequestException, Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service';
import { QueueService } from '../../jobs/queue.service';
import { envConfig } from '../../config/env.config';
import { Public, RequirePermissions, TenantCtx } from '../../common/decorators/auth.decorators';
import { TenantAuthContext } from '../../common/types/auth.types';

const ContactSchema = z.object({
  fullName: z.string().min(2).max(160),
  email: z.string().email(),
  phoneNumber: z.string().max(32).optional(),
  companyName: z.string().max(160).optional(),
  category: z.enum(['business', 'partnership', 'sales', 'support']),
  message: z.string().min(10).max(3000),
  websiteHoneypot: z.string().optional(), // Spam trap: must be empty
});

@ApiTags('Audit, Operations & Public Contact')
@Controller()
export class AuditController {
  constructor(
    private readonly db: DatabaseService,
    private readonly queues: QueueService,
  ) {}

  @ApiBearerAuth()
  @Get('admin/audit-logs')
  @RequirePermissions('audit:read')
  async auditLogs(@TenantCtx() ctx: TenantAuthContext) {
    const [logsRes, verifyRes] = await Promise.all([
      this.db.query(
        `SELECT id, event_uuid, actor_email, action, resource_type, resource_id, ip_address, changes,
                LEFT(record_hash, 16) AS hash_prefix, created_at
         FROM audit_logs
         WHERE tenant_id = $1
         ORDER BY id DESC LIMIT 100`,
        [ctx.tenantId],
      ),
      this.db.query(`SELECT * FROM fn_verify_audit_chain()`),
    ]);
    return {
      logs: logsRes.rows,
      integrityChain: verifyRes.rows[0],
    };
  }

  @ApiBearerAuth()
  @Get('admin/system-health')
  @RequirePermissions('org:read')
  async systemHealth() {
    const dbHealth = await this.db.healthCheck().catch(() => ({ ok: false, latencyMs: -1 }));
    const queueHealth = await this.queues.getHealth();
    let intelOk = false;
    try {
      const r = await fetch(`${envConfig.intelligenceUrl}/health`);
      intelOk = r.ok;
    } catch {
      intelOk = false;
    }
    const status = dbHealth.ok && intelOk ? 'healthy' : 'degraded';
    return {
      status,
      timestamp: new Date().toISOString(),
      services: {
        postgresql: dbHealth,
        redisAndQueues: queueHealth,
        intelligenceEngine: { ok: intelOk, endpoint: envConfig.intelligenceUrl },
      },
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  @Public()
  @Get('health')
  async publicHealth() {
    const db = await this.db.healthCheck().catch(() => ({ ok: false, latencyMs: -1 }));
    return { status: db.ok ? 'ok' : 'error', service: 'bizwave-api', version: '1.0.0', dbLatencyMs: db.latencyMs };
  }

  @Public()
  @Post('public/contact')
  async submitContact(@Body() body: unknown, @Req() req: any) {
    const parsed = ContactSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Please complete all required fields properly.', errors: parsed.error.flatten().fieldErrors });
    }
    const d = parsed.data;
    // Silently reject bots filling hidden honeypot
    if (d.websiteHoneypot && d.websiteHoneypot.trim().length > 0) {
      return { submitted: true, reference: 'BW-SPAM-FILTERED' };
    }
    const ins = await this.db.query(
      `INSERT INTO contact_enquiries (full_name, email, phone_number, company_name, category, message, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7::inet) RETURNING id, created_at`,
      [d.fullName.trim(), d.email.trim().toLowerCase(), d.phoneNumber || null, d.companyName || null, d.category, d.message.trim(), req.ip || null],
    );
    return {
      submitted: true,
      reference: `BW-ENQ-${String(ins.rows[0].id).slice(0, 8).toUpperCase()}`,
      createdAt: ins.rows[0].created_at,
    };
  }
}
