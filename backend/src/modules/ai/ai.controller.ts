import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../../database/database.service';
import { envConfig } from '../../config/env.config';
import {
  CurrentUser,
  RequireFeature,
  RequirePermissions,
  TenantCtx,
} from '../../common/decorators/auth.decorators';
import { AuthenticatedUser, TenantAuthContext } from '../../common/types/auth.types';
import { MsingiLanguageService } from './msingi.service';

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /drop\s+table/i,
  /;\s*select\s+/i,
  /union\s+select/i,
  /other\s+tenant/i,
  /all\s+tenants/i,
  /show\s+(me\s+)?(system\s+prompt|passwords|api\s*keys|secrets)/i,
  /bypass\s+rls/i,
];

type Intent =
  | 'executive_briefing'
  | 'pro_scientist_audit'
  | 'forecast_graph'
  | 'pie_chart_breakdown'
  | 'website_catalog_insights'
  | 'what_if_simulation'
  | 'sales_drop'
  | 'mpesa_payment_mix'
  | 'expense_audit'
  | 'top_profit_products'
  | 'stockout_risk'
  | 'cash_needed_next_month'
  | 'churn_customers'
  | 'best_branch'
  | 'improve_revenue'
  | 'general_summary';

function detectIntent(text: string): Intent {
  const q = text.toLowerCase();
  if (/(what if|scenario|simulat|increase price|raise price|cut expense|reduce cost|nikiongeza bei|nikipunguza gharama|jaribu)/.test(q)) {
    return 'what_if_simulation';
  }
  if (/(website|web catalog|online store|site sync|tovuti)/.test(q)) {
    return 'website_catalog_insights';
  }
  if (/(forecast|predict|next 14|next 30|future sales|projection|utabiri|tabiri)/.test(q)) {
    return 'forecast_graph';
  }
  if (/(data scientist|break.?even|breakeven|formula|calculat|pareto|hhi|stability|seasonality|statistical|hesabu|uchambuzi wa kina)/.test(q)) {
    return 'pro_scientist_audit';
  }
  if (/(pie\s*chart|donut|chati ya duara)/.test(q)) {
    if (/(expense|cost|spend|gharama|matumizi)/.test(q)) return 'expense_audit';
    if (/(m-?pesa|payment|cash|malipo)/.test(q)) return 'mpesa_payment_mix';
    return 'pie_chart_breakdown';
  }
  if (/(briefing|health score|morning|status|overview|ripoti ya leo|hali ya biashara|afya ya biashara)/.test(q)) {
    return 'executive_briefing';
  }
  if (/(m-?pesa|payment method|cash vs|till|paybill|malipo|njia za malipo)/.test(q)) {
    return 'mpesa_payment_mix';
  }
  if (/(expense|cost|spend|leak|burn|overhead|gharama|matumizi)/.test(q)) {
    return 'expense_audit';
  }
  if (/(drop|decrease|down|fell|dip|pungua|shuka|why.*sales|kwa nini.*mauzo)/.test(q)) return 'sales_drop';
  if (/(profit|margin|best.*product|top.*product|faida|bidhaa.*kubwa|vyakula.*faida)/.test(q)) return 'top_profit_products';
  if (/(stock|run out|deplet|reorder|inventory|stoo|kuisha|bidhaa.*isha)/.test(q)) return 'stockout_risk';
  if (/(cash|money|liquidity|next month|payables|receivable|pesa|fedha|mwezi ujao)/.test(q)) return 'cash_needed_next_month';
  if (/(churn|stopped|inactive|lost.*customer|vip|wateja.*acha|hawajarudi)/.test(q)) return 'churn_customers';
  if (/(branch|location|tawi|matawi)/.test(q)) return 'best_branch';
  if (/(improve|grow|increase.*revenue|what should i do|recommend|action plan|ongeza|boresha|nifanye nini)/.test(q)) {
    return 'improve_revenue';
  }
  return 'general_summary';
}

function parseWhatIfParams(text: string): {
  price_change_pct: number;
  volume_change_pct: number;
  expense_change_pct: number;
  stockout_recovery_pct: number;
} {
  const q = text.toLowerCase();
  let price = 0;
  let volume = 0;
  let expense = 0;
  let stockout = 0;

  const priceMatch = q.match(/(?:price|bei)[^0-9+-]{0,20}([+-]?\d+(?:\.\d+)?)\s*%/);
  const priceUp = q.match(/(?:raise|increase|ongeza)\s+(?:my\s+)?(?:price|prices|bei)[^0-9]{0,15}(\d+(?:\.\d+)?)\s*%/);
  const priceDown = q.match(/(?:lower|cut|discount|punguza)\s+(?:my\s+)?(?:price|prices|bei)[^0-9]{0,15}(\d+(?:\.\d+)?)\s*%/);
  if (priceUp) price = Number(priceUp[1]);
  else if (priceDown) price = -Number(priceDown[1]);
  else if (priceMatch) price = Number(priceMatch[1]);

  const expDown = q.match(/(?:cut|reduce|trim|lower|punguza)\s+(?:my\s+)?(?:expense|expenses|cost|costs|gharama|matumizi)[^0-9]{0,15}(\d+(?:\.\d+)?)\s*%/);
  const expUp = q.match(/(?:increase|ongeza)\s+(?:my\s+)?(?:expense|expenses|cost|costs|gharama)[^0-9]{0,15}(\d+(?:\.\d+)?)\s*%/);
  if (expDown) expense = -Number(expDown[1]);
  else if (expUp) expense = Number(expUp[1]);

  const volMatch = q.match(/(?:volume|orders|sales|oda|mauzo)[^0-9+-]{0,20}([+-]?\d+(?:\.\d+)?)\s*%/);
  if (volMatch) volume = Number(volMatch[1]);


  return {
    price_change_pct: Math.max(-50, Math.min(50, price)),
    volume_change_pct: Math.max(-50, Math.min(100, volume)),
    expense_change_pct: Math.max(-60, Math.min(60, expense)),
    stockout_recovery_pct: Math.max(0, Math.min(30, stockout)),
  };
}

function fmtKes(n: number): string {
  return `KES ${Math.round(n).toLocaleString('en-KE')}`;
}

@ApiTags('BizWave AI Assistant')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(
    private readonly db: DatabaseService,
    private readonly msingi: MsingiLanguageService,
  ) {}

  private conversationScope(ctx: TenantAuthContext) {
    return { version: 1, permissions: [...ctx.permissions].sort(), branchIds: ctx.allowedBranchIds === null ? null : [...ctx.allowedBranchIds].sort() };
  }

  private mayReadConversation(ctx: TenantAuthContext, scope: any): boolean {
    // Legacy conversations do not carry a scope. Fail closed instead of revealing
    // historical answers written before a role or branch assignment changed.
    if (!scope || scope.version !== 1 || !Array.isArray(scope.permissions) ||
        !(scope.branchIds === null || Array.isArray(scope.branchIds))) return false;
    if (!scope.permissions.every((permission: any) => typeof permission === 'string' && ctx.permissions.includes(permission))) return false;
    if (scope.branchIds === null) return ctx.allowedBranchIds === null;
    return ctx.allowedBranchIds === null || scope.branchIds.every((id: any) => typeof id === 'string' && ctx.allowedBranchIds!.includes(id));
  }

  private hasSameConversationScope(ctx: TenantAuthContext, scope: any): boolean {
    if (!this.mayReadConversation(ctx, scope)) return false;
    const current = this.conversationScope(ctx);
    if (JSON.stringify([...scope.permissions].sort()) !== JSON.stringify(current.permissions)) return false;
    return (scope.branchIds === null && current.branchIds === null) ||
      (Array.isArray(scope.branchIds) && Array.isArray(current.branchIds) &&
       JSON.stringify([...scope.branchIds].sort()) === JSON.stringify(current.branchIds));
  }

  private publicConversation(row: any) {
    const { security_scope, ...conversation } = row;
    return conversation;
  }

  private hasExternalLlm(): boolean {
    return Boolean(envConfig.llmApiKey && envConfig.llmApiKey.trim().length >= 10);
  }

  private async callIntelligence(path: string, payload: Record<string, any>): Promise<any | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${envConfig.intelligenceUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Optional Grounded External LLM Polish:
   * Receives ONLY verified PostgreSQL & Python Intelligence outputs (never raw DB credentials),
   * instructed strictly NEVER to invent figures and ALWAYS reflect non-custodial analytics boundaries.
   */
  private async enhanceWithGroundedLlm(params: {
    question: string;
    lang: 'en' | 'sw';
    tenantName: string;
    industryCode: string;
    verifiedContext: Record<string, any>;
    deterministicDraft: string;
  }): Promise<{ text: string; llmUsed: boolean; model?: string }> {
    if (!this.hasExternalLlm()) {
      return { text: params.deterministicDraft, llmUsed: false };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), envConfig.llmTimeoutMs);
    try {
      const systemPrompt = [
        `You are BizWave AI, an executive SME business analyst for "${params.tenantName}" (industry: ${params.industryCode}) in Kenya.`,
        `Respond in crisp, natural ${params.lang === 'sw' ? 'Kenyan Kiswahili' : 'English'}.`,
        `STRICT RULES:`,
        `1. Use ONLY the verified numbers inside VERIFIED_DATA below. NEVER invent, guess, or alter any KES amount, count, or percentage.`,
        `2. BizWave ONLY records and analyses SME business operations (sales, M-Pesa records, stock, expenses, customers) to support decisions; BizWave does NOT process customer payments.`,
        `3. Structure every answer clearly with: **Observation** (what happened), **Root Cause** (why), and **Next Actions** (concrete steps with impact). Keep it concise and executive.`,
      ].join('\n');

      const res = await fetch(`${envConfig.llmBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${envConfig.llmApiKey}`,
        },
        body: JSON.stringify({
          model: envConfig.llmModel,
          temperature: 0.2,
          max_tokens: 650,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Question: ${params.question}\n\nVERIFIED_DATA:\n${JSON.stringify(params.verifiedContext, null, 2)}`,
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!res.ok) return { text: params.deterministicDraft, llmUsed: false };
      const json: any = await res.json();
      const content = json?.choices?.[0]?.message?.content?.trim();
      if (!content) return { text: params.deterministicDraft, llmUsed: false };
      return { text: content, llmUsed: true, model: envConfig.llmModel };
    } catch {
      return { text: params.deterministicDraft, llmUsed: false };
    } finally {
      clearTimeout(timer);
    }
  }

  @Get('status')
  @RequirePermissions('ai:use')
  async getStatus() {
    const intelOk = await fetch(`${envConfig.intelligenceUrl}/health`)
      .then((r) => r.ok)
      .catch(() => false);
    return {
      engine: 'BizWave Grounded SME Intelligence Engine v2.0',
      languages: ['English', 'Kiswahili'],
      sqlGrounding: 'whitelisted_parameterized_rls',
      pythonIntelligenceOnline: intelOk,
      externalLlmEnabled: this.hasExternalLlm(),
      externalLlmModel: this.hasExternalLlm() ? envConfig.llmModel : null,
      voiceProvider: this.msingi.getPublicStatus(),
      capabilities: [
        'Executive Health Score (0-100)',
        'Multi-Factor Sales & Margin Root-Cause Diagnostics',
        'What-If Financial Scenario Simulator',
        'Recorded M-Pesa vs Cash/Card Mix Analysis',
        'Expense Leak Audit & Cash Runway Estimation',
        'Stockout Risk & Customer Churn Prevention',
        'Bilingual English & Kiswahili Executive Playbooks',
      ],
    };
  }

  /**
   * Instant Executive Health Briefing combining live PostgreSQL KPIs + Python Advisor scoring.
   */
  @Get('briefing')
  @RequirePermissions('analytics:read', 'sales:read')
  async executiveBriefing(@Query('branchId') branchId: string | undefined, @TenantCtx() ctx: TenantAuthContext) {
    const branch = branchId && branchId !== 'all' ? branchId : null;
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const sales = await client.query(`SELECT COUNT(*)::int AS records, COALESCE(SUM(total_amount),0)::float AS revenue,
        COALESCE(SUM(cost_of_goods_sold),0)::float AS costs,
        COUNT(*) FILTER (WHERE cost_basis='unknown')::int AS unknown_costs,
        COUNT(*) FILTER (WHERE cost_basis='estimated')::int AS estimated_costs
        FROM sales WHERE tenant_id=$1 AND payment_status NOT IN ('reversed','refunded')
          AND ($2::uuid IS NULL OR branch_id=$2::uuid) AND ($3::uuid[] IS NULL OR branch_id=ANY($3::uuid[]))
          AND (transaction_date AT TIME ZONE 'Africa/Nairobi')::date BETWEEN (NOW() AT TIME ZONE 'Africa/Nairobi')::date - 29 AND (NOW() AT TIME ZONE 'Africa/Nairobi')::date`,
        [ctx.tenantId, branch, ctx.allowedBranchIds]);
      const row = sales.rows[0];
      const finance = ctx.permissions.includes('finance:read');
      const exp = finance ? await client.query(`SELECT COUNT(*)::int AS records, COALESCE(SUM(amount),0)::float AS total
        FROM expenses WHERE tenant_id=$1 AND ($2::uuid IS NULL OR branch_id=$2::uuid)
        AND ($3::uuid[] IS NULL OR branch_id=ANY($3::uuid[]))
        AND expense_date BETWEEN (NOW() AT TIME ZONE 'Africa/Nairobi')::date - 29 AND (NOW() AT TIME ZONE 'Africa/Nairobi')::date`,
        [ctx.tenantId, branch, ctx.allowedBranchIds]) : null;
      const costKnown = finance && Number(row.records) > 0 && Number(row.unknown_costs) === 0;
      return { organization: ctx.tenantName, period: 'Last 30 days', hasData: Number(row.records) > 0,
        snapshot: { current_revenue: Number(row.revenue), current_orders: Number(row.records),
          gross_profit: costKnown ? Number(row.revenue) - Number(row.costs) : null,
          expenses: exp && Number(exp.rows[0].records) > 0 ? Number(exp.rows[0].total) : null,
          costs_estimated: Number(row.estimated_costs) > 0 },
        diagnostics: null,
        note: 'Health scores are unavailable without complete, verified inputs.', generatedAt: new Date().toISOString() };
    });
  }

  @Post('simulate')
  @RequireFeature('ai_assistant')
  @RequirePermissions('ai:use', 'sales:read', 'finance:read')
  async runSimulation(
    @Body() body: { priceChangePct?: number; volumeChangePct?: number; expenseChangePct?: number; stockoutRecoveryPct?: number; branchId?: string },
    @TenantCtx() ctx: TenantAuthContext,
  ) {
    const branch = body.branchId && body.branchId !== 'all' ? body.branchId : null;
    const params = [body.priceChangePct ?? 0, body.volumeChangePct ?? 0, body.expenseChangePct ?? 0, body.stockoutRecoveryPct ?? 0].map(Number);
    if (params.some((n) => !Number.isFinite(n)) || params[0] < -50 || params[0] > 50 || params[1] < -50 || params[1] > 100 || params[2] < -60 || params[2] > 60 || params[3] < 0 || params[3] > 30) {
      throw new BadRequestException('One or more scenario percentages are outside the allowed range.');
    }
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const [sales, expense] = await Promise.all([
        client.query(`SELECT COUNT(*)::int AS records, COALESCE(SUM(total_amount),0)::float AS revenue,
          COALESCE(SUM(cost_of_goods_sold),0)::float AS costs, COUNT(*) FILTER (WHERE cost_basis='unknown')::int AS unknown_costs,
          COUNT(*) FILTER (WHERE cost_basis='estimated')::int AS estimated_costs FROM sales
          WHERE tenant_id=$1 AND payment_status NOT IN ('reversed','refunded')
          AND ($2::uuid IS NULL OR branch_id=$2::uuid) AND ($3::uuid[] IS NULL OR branch_id=ANY($3::uuid[]))
          AND (transaction_date AT TIME ZONE 'Africa/Nairobi')::date BETWEEN (NOW() AT TIME ZONE 'Africa/Nairobi')::date - 29 AND (NOW() AT TIME ZONE 'Africa/Nairobi')::date`,
          [ctx.tenantId, branch, ctx.allowedBranchIds]),
        client.query(`SELECT COUNT(*)::int AS records, COALESCE(SUM(amount),0)::float AS total FROM expenses
          WHERE tenant_id=$1 AND ($2::uuid IS NULL OR branch_id=$2::uuid) AND ($3::uuid[] IS NULL OR branch_id=ANY($3::uuid[]))
          AND expense_date BETWEEN (NOW() AT TIME ZONE 'Africa/Nairobi')::date - 29 AND (NOW() AT TIME ZONE 'Africa/Nairobi')::date`,
          [ctx.tenantId, branch, ctx.allowedBranchIds]),
      ]);
      const k = sales.rows[0]; const e = expense.rows[0];
      if (!Number(k.records) || Number(k.unknown_costs) || !Number(e.records)) {
        throw new BadRequestException('Add sales with costs and expense records for the last 30 days before running a profit scenario.');
      }
      const sim = await this.callIntelligence('/v1/advisor/simulate', { monthly_revenue: Number(k.revenue), monthly_cogs: Number(k.costs),
        monthly_expenses: Number(e.total), price_change_pct: params[0], volume_change_pct: params[1], expense_change_pct: params[2], stockout_recovery_pct: params[3] });
      if (!sim) throw new BadRequestException('Intelligence simulation service is temporarily unavailable.');
      return { hasBaselineData: true, simulation: sim, baselineCostsEstimated: Number(k.estimated_costs) > 0,
        note: 'Illustrative scenario, not a forecast. The model assumes a price elasticity of -0.35.' };
    });
  }

  @Post('voice/speak')
  @RequireFeature('ai_assistant')
  @RequirePermissions('ai:use')
  async speakAnswer(@Body() body: { text: string; language?: 'en' | 'sw'; voiceId?: string }) {
    const text = (body?.text || '').replace(/[*#`]/g, '').trim();
    if (!text) throw new BadRequestException('text is required');
    return this.msingi.synthesizeSpeech({
      text,
      language: body.language === 'sw' ? 'sw' : 'en',
      voiceId: body.voiceId,
    });
  }

  @Get('conversations')
  @RequireFeature('ai_assistant')
  @RequirePermissions('ai:use')
  async listConversations(@TenantCtx() ctx: TenantAuthContext, @CurrentUser() user: AuthenticatedUser) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM ai_conversations WHERE tenant_id = $1 AND user_id = $2 ORDER BY updated_at DESC LIMIT 100`,
        [ctx.tenantId, user.userId],
      );
      const tpl = await client.query(
        `SELECT suggested_questions_en, suggested_questions_sw FROM business_industries WHERE code = $1`,
        [ctx.industryCode],
      );
      const extraEn = [
        'Run a full Data Scientist audit & break-even calculation',
        'Predict my next 14 days sales with a forecast graph',
        'Draw a pie chart of my M-Pesa vs cash sales',
        'Draw a pie chart of my biggest expenses this month',
        'What if I raise prices 8% and cut expenses 10%?',
        'Give me my executive business health briefing',
      ];
      const extraSw = [
        'Fanya uchambuzi wa kina wa hesabu za faida na break-even',
        'Tabiri mauzo yangu ya siku 14 zijazo kwa grafu',
        'Chora chati ya duara ya mauzo ya M-Pesa na pesa taslimu',
        'Chora chati ya duara ya matumizi makubwa mwezi huu',
        'Nikiongeza bei kwa 8% na kupunguza gharama kwa 10% faida itakuwaje?',
        'Nipe ripoti ya afya ya biashara yangu leo',
      ];
      return {
        conversations: res.rows.filter((row) => this.mayReadConversation(ctx, row.security_scope)).slice(0, 30).map((row) => this.publicConversation(row)),
        suggestedQuestions: {
          en: [...extraEn, ...(tpl.rows[0]?.suggested_questions_en || [])].slice(0, 8),
          sw: [...extraSw, ...(tpl.rows[0]?.suggested_questions_sw || [])].slice(0, 8),
        },
      };
    });
  }

  @Post('conversations')
  @RequireFeature('ai_assistant')
  @RequirePermissions('ai:use')
  async createConversation(
    @Body() body: { title?: string; language?: 'en' | 'sw'; branchId?: string },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const lang = body?.language === 'sw' ? 'sw' : 'en';
    const branchId = body?.branchId && body.branchId !== 'all' ? body.branchId : null;
    if (branchId && (typeof branchId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branchId))) throw new BadRequestException('Invalid branch.');
    if (ctx.allowedBranchIds !== null && (!ctx.allowedBranchIds.length || (branchId && !ctx.allowedBranchIds.includes(branchId)))) throw new ForbiddenException('You are not authorized for this branch.');
    return this.db.withTenant(ctx.tenantId, async (client) => {
      if (branchId) {
        const branch = await client.query(`SELECT id FROM branches WHERE tenant_id=$1 AND id=$2 AND status='active'`, [ctx.tenantId, branchId]);
        if (!branch.rowCount) throw new BadRequestException('Branch not found.');
      }
      const ins = await client.query(
        `INSERT INTO ai_conversations (tenant_id, user_id, branch_id, title, language, security_scope)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,
        [
          ctx.tenantId,
          user.userId,
          branchId,
          String(body.title || (lang === 'sw' ? 'Mazungumzo Mapya ya Biashara' : 'New Business Analysis')).slice(0, 200),
          lang,
          JSON.stringify(this.conversationScope(ctx)),
        ],
      );
      return { conversation: this.publicConversation(ins.rows[0]) };
    });
  }

  @Get('conversations/:id/messages')
  @RequireFeature('ai_assistant')
  @RequirePermissions('ai:use')
  async listMessages(
    @Param('id') id: string,
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const conv = await client.query(
        `SELECT * FROM ai_conversations WHERE tenant_id = $1 AND id = $2 AND user_id = $3`,
        [ctx.tenantId, id, user.userId],
      );
      if (conv.rowCount === 0 || !this.mayReadConversation(ctx, conv.rows[0].security_scope)) throw new BadRequestException('Conversation not found');
      const msgs = await client.query(
        `SELECT m.*,
                (SELECT rating FROM ai_response_feedback f WHERE f.message_id = m.id AND f.user_id = $3 LIMIT 1) AS user_rating
         FROM ai_messages m
         WHERE m.tenant_id = $1 AND m.conversation_id = $2
         ORDER BY m.created_at ASC`,
        [ctx.tenantId, id, user.userId],
      );
      return { conversation: this.publicConversation(conv.rows[0]), messages: msgs.rows };
    });
  }

  /**
   * Supercharged Grounded Natural-Language Analytics Pipeline:
   * 1. Prompt-injection defense -> 2. 12-intent bilingual classifier -> 3. Whitelisted RLS SQL tools
   * -> 4. Python Advisor diagnostics / What-If simulation -> 5. Optional Grounded LLM synthesis with full provenance
   */
  @Post('conversations/:id/messages')
  @RequireFeature('ai_assistant')
  @RequirePermissions('ai:use')
  async sendMessage(
    @Param('id') conversationId: string,
    @Body() body: { content: string; language?: 'en' | 'sw'; branchId?: string },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    const question = typeof body?.content === 'string' ? body.content.trim() : '';
    if (!question || question.length > 1500) {
      throw new BadRequestException('Question must be between 1 and 1500 characters.');
    }

    const lang: 'en' | 'sw' = body.language === 'sw' ? 'sw' : body.language === 'en' ? 'en' :
      (/\b(kwa nini|bidhaa|mauzo|faida|pesa|tawi|wateja|stoo|nifanye|gharama|matumizi|afya|ripoti|nikiongeza)\b/.test(question.toLowerCase()) ? 'sw' : 'en');

    const isInjection = INJECTION_PATTERNS.some((rx) => rx.test(question));
    if (isInjection) {
      await this.db.query(
        `INSERT INTO security_events (tenant_id, user_id, event_type, severity, ip_address, details)
         VALUES ($1,$2,'ai_prompt_injection_blocked','medium',$3::inet,$4::jsonb)`,
        [ctx.tenantId, user.userId, req.ip || null, JSON.stringify({ questionPreview: question.slice(0, 140) })],
      );
      const refusal =
        lang === 'sw'
          ? 'Samahani, siwezi kutekeleza maombi yanayojaribu kubadilisha sheria za usalama, kuendesha SQL holela, au kufikia data ya biashara nyingine. Uliza swali kuhusu mauzo, stoo, gharama, wateja au mtiririko wa fedha wa biashara yako.'
          : 'I cannot execute unrestricted SQL, reveal system internals, or access records outside your authorized organization. Please ask about your sales, M-Pesa records, stock, expenses, cash flow, branches, or customers.';
      return {
        blocked: true,
        assistantMessage: {
          role: 'assistant',
          content: refusal,
          language: lang,
          intent: 'security_refusal',
          provenance: { guard: 'prompt_injection_filter', tenant: ctx.tenantName },
          supporting_data: {},
          follow_up_questions: [],
        },
      };
    }

    const intent = detectIntent(question);
    const effectiveBranch = body.branchId && body.branchId !== 'all' ? body.branchId : null;
    const canSales = ctx.permissions.includes('sales:read');
    const canFinance = ctx.permissions.includes('finance:read');
    const canInventory = ctx.permissions.includes('inventory:read');
    const canCustomers = ctx.permissions.includes('customers:read');
    const scope = [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds];
    const tr = (en: string, sw: string) => lang === 'sw' ? sw : en;

    return this.db.withTenant(ctx.tenantId, async (client) => {
      const convRes = await client.query(
        `SELECT * FROM ai_conversations WHERE tenant_id = $1 AND id = $2 AND user_id = $3`,
        [ctx.tenantId, conversationId, user.userId],
      );
      if (!convRes.rowCount || !this.mayReadConversation(ctx, convRes.rows[0].security_scope)) throw new BadRequestException('Conversation not found');
      // A thread's original scope protects ALL of its messages. Never append an
      // answer using wider permissions or branches to an older, narrower thread.
      if (!this.hasSameConversationScope(ctx, convRes.rows[0].security_scope)) {
        throw new ForbiddenException('Your access has changed. Start a new conversation to use your current access.');
      }
      if ((convRes.rows[0].branch_id || null) !== effectiveBranch) {
        throw new BadRequestException('Start a new conversation for the selected branch.');
      }

      const tools: string[] = [];
      const query = async (name: string, sql: string, args: any[] = scope): Promise<any[]> => {
        const result = await client.query(sql, args);
        tools.push(`${name} (${result.rows.length} rows)`);
        return result.rows;
      };
      const salesFilter = `s.tenant_id = $1 AND s.payment_status NOT IN ('reversed','refunded')
        AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
        AND ($3::uuid[] IS NULL OR s.branch_id = ANY($3::uuid[]))
        AND (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::date BETWEEN
            (NOW() AT TIME ZONE 'Africa/Nairobi')::date - 44 AND (NOW() AT TIME ZONE 'Africa/Nairobi')::date`;
      const [daily, totals, payments, expenses, products, inventory] = await Promise.all([
        canSales ? query('daily_sales', `SELECT (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::date::text AS date,
          SUM(s.total_amount)::float AS revenue, SUM(s.total_amount-s.cost_of_goods_sold)::float AS gross_profit
          FROM sales s WHERE ${salesFilter} GROUP BY 1 ORDER BY 1`) : Promise.resolve([]),
        canSales ? query('sales_totals', `SELECT COUNT(*)::int AS orders, COALESCE(SUM(s.total_amount),0)::float AS revenue,
          COALESCE(SUM(s.cost_of_goods_sold),0)::float AS cogs,
          COUNT(*) FILTER (WHERE s.cost_basis='unknown')::int AS unknown_costs,
          COUNT(*) FILTER (WHERE s.cost_basis='estimated')::int AS estimated_costs
          FROM sales s WHERE ${salesFilter}`) : Promise.resolve([]),
        canSales ? query('payment_totals', `SELECT sp.payment_method AS method, SUM(sp.amount)::float AS total
          FROM sales_payments sp JOIN sales s ON s.tenant_id=sp.tenant_id AND s.id=sp.sale_id
          WHERE ${salesFilter} GROUP BY 1 ORDER BY 2 DESC`) : Promise.resolve([]),
        canFinance ? query('expenses', `SELECT COALESCE(ec.name,'General') AS category,
          SUM(e.amount)::float AS total, COUNT(*)::int AS records FROM expenses e
          LEFT JOIN expense_categories ec ON ec.tenant_id=e.tenant_id AND ec.id=e.category_id
          WHERE e.tenant_id=$1 AND ($2::uuid IS NULL OR e.branch_id=$2::uuid)
            AND ($3::uuid[] IS NULL OR e.branch_id=ANY($3::uuid[]))
            AND e.expense_date BETWEEN (NOW() AT TIME ZONE 'Africa/Nairobi')::date - 44 AND (NOW() AT TIME ZONE 'Africa/Nairobi')::date
          GROUP BY 1 ORDER BY 2 DESC`) : Promise.resolve([]),
        canSales ? query('product_totals', `SELECT si.product_name_snapshot AS name, SUM(si.line_total)::float AS revenue,
          SUM(si.line_total-si.quantity*si.unit_cost)::float AS gross_profit
          FROM sales_items si JOIN sales s ON s.tenant_id=si.tenant_id AND s.id=si.sale_id
          WHERE ${salesFilter} GROUP BY 1 ORDER BY 2 DESC LIMIT 25`) : Promise.resolve([]),
        canInventory ? query('inventory_status', `SELECT COUNT(*) FILTER (WHERE stock_status='stockout')::int AS stockout_count,
          COUNT(*) FILTER (WHERE stock_status='low_stock')::int AS low_stock_count
          FROM vw_inventory_status WHERE tenant_id=$1 AND ($2::uuid IS NULL OR branch_id=$2::uuid)
            AND ($3::uuid[] IS NULL OR branch_id=ANY($3::uuid[]))`) : Promise.resolve([]),
      ]);
      const total = totals[0] || { orders: 0, revenue: 0, cogs: 0, unknown_costs: 0, estimated_costs: 0 };
      const expenseSum = expenses.reduce((sum, row) => sum + Number(row.total), 0);
      const hasCosts = canFinance && Number(total.orders) > 0 && Number(total.unknown_costs) === 0;
      const inv = inventory[0] || { stockout_count: 0, low_stock_count: 0 };
      let answerText = '';
      let chart: any = null;
      let kpis: { label: string; value: string }[] = [];
      let calculations: any[] = [];
      let recommendations: any[] = [];
      let followUps: string[] = [];
      let periodLabel = tr('Last 45 days', 'Siku 45 zilizopita');

      const scientist = async () => this.callIntelligence('/v1/scientist/analyze', {
        daily_sales: daily, products, payment_mix: payments, expense_mix: expenses,
        total_revenue: Number(total.revenue), total_cogs: Number(total.cogs),
        total_expenses: expenseSum, total_orders: Number(total.orders),
        cost_data_available: hasCosts, expense_data_available: canFinance && expenses.length > 0,
        liquidity_data_available: false,
        stockout_count: Number(inv.stockout_count), low_stock_count: Number(inv.low_stock_count),
        period_days: 45, horizon_days: 14,
      });
      const salesRequired = ['pro_scientist_audit', 'forecast_graph', 'pie_chart_breakdown', 'mpesa_payment_mix', 'sales_drop', 'top_profit_products', 'best_branch', 'what_if_simulation'];
      if (salesRequired.includes(intent) && !canSales) {
        answerText = tr('Your role does not include access to sales records. Ask your business owner if you need access.', 'Jukumu lako halina ruhusa ya kuona mauzo. Muulize mmiliki wa biashara kama unahitaji ruhusa.');
      } else if (['forecast_graph', 'pro_scientist_audit'].includes(intent)) {
        const sci = await scientist();
        if (!sci) {
          answerText = tr('The analysis service is temporarily unavailable. Please try again.', 'Huduma ya uchambuzi haipatikani kwa sasa. Jaribu tena.');
        } else if (intent === 'forecast_graph') {
          const series = sci.forecast?.series || [];
          const future = series.filter((point: any) => point.is_forecast);
          if (!future.length) {
            answerText = tr('Record at least three days of sales before creating a forecast.', 'Rekodi mauzo ya angalau siku tatu kabla ya kutengeneza utabiri.');
          } else {
            chart = { type: 'forecast', title: tr('Sales estimate', 'Makadirio ya mauzo'), data: series };
            kpis = [{ label: tr('14-day estimate', 'Makadirio ya siku 14'), value: fmtKes(Number(sci.forecast.projected_14d_revenue)) }];
            answerText = tr(`Estimated sales for ${future[0].date} to ${future[future.length - 1].date}: ${fmtKes(Number(sci.forecast.projected_14d_revenue))}. This is not guaranteed. Days without records are treated as zero by this model; the shaded range is a rough estimate, not a validated probability.`,
              `Makadirio ya mauzo kuanzia ${future[0].date} hadi ${future[future.length - 1].date}: ${fmtKes(Number(sci.forecast.projected_14d_revenue))}. Si uhakika. Siku zisizo na rekodi huhesabiwa kama sifuri; wigo ni makadirio tu.`);
          }
        } else {
          calculations = sci.calculations || [];
          recommendations = (sci.recommendations || []).map((r: any) => ({ title: r.title, type: 'action', detail: lang === 'sw' ? r.sw : r.en }));
          kpis = [{ label: tr('Recorded sales days', 'Siku zenye mauzo'), value: String(sci.recorded_days || 0) }];
          answerText = tr(`Analysis is based on ${sci.recorded_days || 0} days with sales records. Figures that lack cost or expense information are left out.`,
            `Uchambuzi unatokana na siku ${sci.recorded_days || 0} zenye rekodi za mauzo. Vipimo visivyo na taarifa za gharama au matumizi havijaonyeshwa.`);
          if (Number(total.estimated_costs) > 0 && hasCosts) answerText += tr(' Some costs are estimates.', ' Baadhi ya gharama ni makadirio.');
          if (sci.charts?.weekday_bar?.some((row: any) => row.value > 0)) chart = { type: 'bar', title: tr('Sales by weekday', 'Mauzo kwa siku'), data: sci.charts.weekday_bar };
        }
      } else if (['pie_chart_breakdown', 'mpesa_payment_mix'].includes(intent)) {
        const rows = payments.map((p) => ({ label: String(p.method).replace(/_/g, ' '), value: Number(p.total) }));
        if (rows.length) {
          chart = { type: 'pie', title: tr('Recorded payments', 'Malipo yaliyorekodiwa'), data: rows };
          answerText = tr('These are payment methods recorded against your sales, not a complete bank statement.', 'Hizi ni njia za malipo zilizorekodiwa kwenye mauzo, si taarifa kamili ya benki.');
        } else answerText = tr('No payment methods have been recorded for this period.', 'Hakuna njia za malipo zilizorekodiwa katika kipindi hiki.');
      } else if (intent === 'expense_audit') {
        if (!canFinance) answerText = tr('Your role does not include expense access.', 'Jukumu lako halina ruhusa ya kuona matumizi.');
        else if (!expenses.length) answerText = tr('There are no recorded expenses in this period.', 'Hakuna matumizi yaliyorekodiwa katika kipindi hiki.');
        else {
          chart = { type: 'pie', title: tr('Recorded expenses', 'Matumizi yaliyorekodiwa'), data: expenses.map((e) => ({ label: e.category, value: Number(e.total) })) };
          kpis = [{ label: tr('Recorded expenses', 'Matumizi yaliyorekodiwa'), value: fmtKes(expenseSum) }];
          answerText = tr('This breakdown uses the expenses recorded in the selected branch scope.', 'Mgawanyo huu unatumia matumizi yaliyorekodiwa kwa matawi yaliyochaguliwa.');
        }
      } else if (intent === 'website_catalog_insights') {
        const sources = await query('website_sources', `SELECT name, last_synced_at FROM data_sources WHERE tenant_id=$1
          AND source_type='json_api' AND config ? 'url' AND ($2::uuid IS NULL OR branch_id=$2::uuid)
          AND ($3::uuid[] IS NULL OR branch_id=ANY($3::uuid[])) ORDER BY last_synced_at DESC LIMIT 5`);
        answerText = sources.length ? tr(`Connected websites: ${sources.map((x) => x.name).join(', ')}. Open Website sync to review the latest results.`, `Tovuti zilizounganishwa: ${sources.map((x) => x.name).join(', ')}. Fungua sehemu ya tovuti kuona matokeo.`)
          : tr('No website is connected in this branch scope. Open Website sync to analyze one.', 'Hakuna tovuti iliyounganishwa katika matawi haya. Fungua sehemu ya tovuti kuchambua moja.');
      } else if (intent === 'what_if_simulation') {
        if (!canFinance) answerText = tr('Your role does not include access to financial scenarios.', 'Jukumu lako halina ruhusa ya kuona makadirio ya fedha.');
        else if (!hasCosts || !expenses.length) answerText = tr('Add sales costs and expense records before running a profit scenario.', 'Weka gharama za mauzo na rekodi za matumizi kabla ya kukadiria faida.');
        else if (!/\d+(?:\.\d+)?\s*%/.test(question)) answerText = tr('Tell me the percentage changes you want to test, for example: increase price by 8%.', 'Niambie asilimia unayotaka kujaribu, kwa mfano: ongeza bei kwa 8%.');
        else {
          const params = parseWhatIfParams(question);
          const sim = await this.callIntelligence('/v1/advisor/simulate', { monthly_revenue: Number(total.revenue) * 30 / 45,
            monthly_cogs: Number(total.cogs) * 30 / 45, monthly_expenses: expenseSum * 30 / 45, ...params });
          answerText = sim ? tr(`Illustrative scenario: monthly profit changes by ${fmtKes(Number(sim.impact.net_profit_delta))}. It assumes a price elasticity of ${sim.assumptions.price_elasticity}; it is not a prediction.`,
            `Mfano wa makadirio: faida ya mwezi inabadilika kwa ${fmtKes(Number(sim.impact.net_profit_delta))}. Mfano unatumia dhana ya mwitikio wa bei ${sim.assumptions.price_elasticity}; si utabiri.`)
            : tr('The scenario service is temporarily unavailable.', 'Huduma ya makadirio haipatikani kwa sasa.');
        }
      } else if (intent === 'stockout_risk') {
        if (!canInventory) answerText = tr('Your role does not include inventory access.', 'Jukumu lako halina ruhusa ya kuona stoo.');
        else answerText = tr(`Recorded inventory shows ${inv.stockout_count} out-of-stock and ${inv.low_stock_count} low-stock lines.`, `Stoo iliyorekodiwa ina bidhaa ${inv.stockout_count} zilizoisha na ${inv.low_stock_count} zinazokaribia kuisha.`);
      } else if (intent === 'cash_needed_next_month') {
        answerText = tr('A reliable cash forecast needs current account balances and confirmed obligations. Opening balances alone are not enough.', 'Utabiri wa fedha unahitaji salio la sasa na madeni yaliyothibitishwa. Salio la mwanzo pekee halitoshi.');
      } else if (intent === 'churn_customers') {
        if (!canCustomers) answerText = tr('Your role does not include customer access.', 'Jukumu lako halina ruhusa ya kuona wateja.');
        else {
          const rows = await query('inactive_customers', `SELECT c.full_name, MAX(s.transaction_date) AS last_purchase
            FROM customers c JOIN sales s ON s.tenant_id=c.tenant_id AND s.customer_id=c.id
            WHERE c.tenant_id=$1 AND s.payment_status NOT IN ('reversed','refunded')
            AND ($2::uuid IS NULL OR s.branch_id=$2::uuid) AND ($3::uuid[] IS NULL OR s.branch_id=ANY($3::uuid[]))
            GROUP BY c.id,c.full_name HAVING MAX(s.transaction_date) < NOW() - INTERVAL '30 days'
            ORDER BY MAX(s.transaction_date) DESC LIMIT 8`);
          answerText = rows.length ? tr(`Customers without a recorded purchase in these branches for 30 days: ${rows.map((r) => r.full_name).join(', ')}. This is not a churn prediction.`,
            `Wateja wasio na ununuzi uliorekodiwa katika matawi haya kwa siku 30: ${rows.map((r) => r.full_name).join(', ')}. Huu si utabiri wa kuondoka.`)
            : tr('No inactive customers were found in the selected branch records.', 'Hakuna wateja waliokaa bila kununua waliopatikana katika rekodi za matawi haya.');
        }
      } else if (intent === 'best_branch') {
        const rows = await query('branch_sales', `SELECT b.name AS label, COALESCE(SUM(s.total_amount),0)::float AS value
          FROM branches b LEFT JOIN sales s ON s.tenant_id=b.tenant_id AND s.branch_id=b.id AND s.payment_status NOT IN ('reversed','refunded')
          WHERE b.tenant_id=$1 AND ($2::uuid IS NULL OR b.id=$2::uuid) AND ($3::uuid[] IS NULL OR b.id=ANY($3::uuid[]))
          GROUP BY b.id,b.name ORDER BY value DESC`);
        chart = { type: 'bar', title: tr('Recorded sales by branch', 'Mauzo yaliyorekodiwa kwa tawi'), data: rows };
        periodLabel = tr('All recorded sales', 'Mauzo yote yaliyorekodiwa');
        answerText = rows.length ? tr(`Among the branches you can access, ${rows[0].label} has recorded the most sales: ${fmtKes(Number(rows[0].value))}.`, `Kati ya matawi unayoweza kuona, ${rows[0].label} lina mauzo mengi yaliyorekodiwa: ${fmtKes(Number(rows[0].value))}.`) : tr('No branches are available.', 'Hakuna matawi yanayopatikana.');
      } else if (intent === 'top_profit_products') {
        if (!canFinance) answerText = tr('Your role does not include access to profit figures.', 'Jukumu lako halina ruhusa ya kuona faida.');
        else if (!hasCosts) answerText = tr('Profit cannot be calculated because one or more sales are missing costs.', 'Faida haiwezi kuhesabiwa kwa sababu baadhi ya mauzo hayana gharama.');
        else if (!products.length) answerText = tr('No item-level sales were recorded for this period.', 'Hakuna mauzo ya bidhaa binafsi yaliyorekodiwa katika kipindi hiki.');
        else {
          const sorted = [...products].sort((a, b) => Number(b.gross_profit) - Number(a.gross_profit));
          chart = { type: 'bar', title: tr('Recorded gross profit by item', 'Faida ghafi kwa bidhaa'), data: sorted.slice(0, 6).map((p) => ({ label: p.name, value: Number(p.gross_profit) })) };
          answerText = tr(`The highest recorded item gross profit is ${sorted[0].name}: ${fmtKes(Number(sorted[0].gross_profit))}.`, `Bidhaa yenye faida ghafi kubwa ni ${sorted[0].name}: ${fmtKes(Number(sorted[0].gross_profit))}.`);
          if (Number(total.estimated_costs)) answerText += tr(' Some costs are estimates.', ' Baadhi ya gharama ni makadirio.');
        }
      } else {
        if (!canSales) answerText = tr('Ask about inventory, customers or other information available to your role.', 'Uliza kuhusu stoo, wateja au taarifa nyingine zinazopatikana kwa jukumu lako.');
        else if (!Number(total.orders)) answerText = tr('There are no sales records in the last 45 days for the selected branches.', 'Hakuna rekodi za mauzo katika siku 45 zilizopita kwa matawi yaliyochaguliwa.');
        else {
          kpis = [{ label: tr('Recorded sales', 'Mauzo yaliyorekodiwa'), value: fmtKes(Number(total.revenue)) }, { label: tr('Sales records', 'Rekodi za mauzo'), value: String(total.orders) }];
          if (canFinance && expenses.length) kpis.push({ label: tr('Recorded expenses', 'Matumizi yaliyorekodiwa'), value: fmtKes(expenseSum) });
          chart = { type: 'bar', title: tr('Daily recorded sales', 'Mauzo ya kila siku'), data: daily.slice(-14).map((d) => ({ label: String(d.date).slice(5), value: Number(d.revenue) })) };
          answerText = tr(`Your selected branches recorded ${fmtKes(Number(total.revenue))} in sales over the last 45 days.`, `Matawi yaliyochaguliwa yalirekodi mauzo ya ${fmtKes(Number(total.revenue))} katika siku 45 zilizopita.`);
          if (!hasCosts && canFinance) answerText += tr(' Profit is unavailable until missing costs are added.', ' Faida haipatikani hadi gharama zilizokosekana ziwekwe.');
        }
      }
      followUps = lang === 'sw' ? ['Onyesha njia za malipo', 'Tabiri mauzo ya siku 14'] : ['Show recorded payment methods', 'Forecast the next 14 days'];
      const provenance = { organization: ctx.tenantName, branchScope: effectiveBranch ? tr('Selected branch', 'Tawi lililochaguliwa') : tr('Authorized branches', 'Matawi yanayoruhusiwa'),
        period: periodLabel, toolsExecuted: tools, groundedInDatabase: true, synthesisMode: 'recorded_data', generatedAt: new Date().toISOString() };
      await client.query(`INSERT INTO ai_messages (tenant_id, conversation_id, role, content, language, intent) VALUES ($1,$2,'user',$3,$4,$5)`,
        [ctx.tenantId, conversationId, question, lang, intent]);
      const msg = await client.query(`INSERT INTO ai_messages (tenant_id, conversation_id, role, content, language, intent, provenance, supporting_data, follow_up_questions)
        VALUES ($1,$2,'assistant',$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb) RETURNING *`,
        [ctx.tenantId, conversationId, answerText, lang, intent, JSON.stringify(provenance), JSON.stringify({ kpis, chart, recommendations, calculations }), JSON.stringify(followUps)]);
      if (convRes.rows[0].title.startsWith('New ') || convRes.rows[0].title.startsWith('Mazungumzo')) {
        await client.query(`UPDATE ai_conversations SET title=$3, language=$4, updated_at=NOW() WHERE tenant_id=$1 AND id=$2`, [ctx.tenantId, conversationId, question.slice(0,80), lang]);
      } else await client.query(`UPDATE ai_conversations SET updated_at=NOW() WHERE tenant_id=$1 AND id=$2`, [ctx.tenantId, conversationId]);
      await client.query(`INSERT INTO ai_usage_records (tenant_id,user_id,conversation_id,prompt_tokens,completion_tokens,tools_invoked) VALUES ($1,$2,$3,$4,$5,$6)`,
        [ctx.tenantId, user.userId, conversationId, Math.ceil(question.length/4), Math.ceil(answerText.length/4), tools.length]);
      return { assistantMessage: msg.rows[0] };
    });
  }

  @Post('messages/:messageId/feedback')
  @RequireFeature('ai_assistant')
  @RequirePermissions('ai:use')
  async feedback(
    @Param('messageId') messageId: string,
    @Body() body: { rating: 1 | -1; comment?: string },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (body.rating !== 1 && body.rating !== -1) {
      throw new BadRequestException('rating must be 1 or -1');
    }
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const owned = await client.query(`SELECT c.security_scope FROM ai_messages m JOIN ai_conversations c
        ON c.tenant_id=m.tenant_id AND c.id=m.conversation_id
        WHERE m.tenant_id=$1 AND m.id=$2 AND m.role='assistant' AND c.user_id=$3`, [ctx.tenantId, messageId, user.userId]);
      if (!owned.rowCount || !this.mayReadConversation(ctx, owned.rows[0].security_scope)) throw new BadRequestException('Message not found');
      await client.query(
        `INSERT INTO ai_response_feedback (tenant_id, message_id, user_id, rating, comment)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (tenant_id, message_id, user_id)
         DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment`,
        [ctx.tenantId, messageId, user.userId, body.rating, body.comment || null],
      );
      return { recorded: true };
    });
  }
}
