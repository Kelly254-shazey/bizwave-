import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
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

  if (/(stockout|restock|stoo)/.test(q)) stockout = 5;

  // Smart default balanced scenario if user asks "what if" without numbers
  if (price === 0 && volume === 0 && expense === 0 && stockout === 0) {
    price = 5;
    expense = -10;
    stockout = 4;
  }

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
  @RequirePermissions('analytics:read')
  async executiveBriefing(
    @Query('branchId') branchId: string | undefined,
    @TenantCtx() ctx: TenantAuthContext,
  ) {
    const effectiveBranch = branchId && branchId !== 'all' ? branchId : null;
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const [currKpi] = (
        await client.query(`SELECT * FROM fn_calculate_business_kpis($1, $2::uuid, CURRENT_DATE - 30, CURRENT_DATE)`, [
          ctx.tenantId,
          effectiveBranch,
        ])
      ).rows;
      const [prevKpi] = (
        await client.query(`SELECT * FROM fn_calculate_business_kpis($1, $2::uuid, CURRENT_DATE - 60, CURRENT_DATE - 31)`, [
          ctx.tenantId,
          effectiveBranch,
        ])
      ).rows;
      const [inv] = (
        await client.query(
          `SELECT COUNT(*)::int AS total_products,
                  COUNT(*) FILTER (WHERE stock_status = 'stockout')::int AS stockout_count,
                  COUNT(*) FILTER (WHERE stock_status = 'low_stock')::int AS low_stock_count
           FROM vw_inventory_status WHERE tenant_id = $1 AND ($2::uuid IS NULL OR branch_id = $2::uuid)`,
          [ctx.tenantId, effectiveBranch],
        )
      ).rows;
      const [fin] = (
        await client.query(
          `SELECT
             (SELECT COALESCE(SUM(opening_balance), 0)::float FROM cash_accounts WHERE tenant_id = $1) AS cash_balance,
             (SELECT COALESCE(SUM(amount_due - amount_paid), 0)::float FROM payables WHERE tenant_id = $1 AND status <> 'paid') AS payables,
             (SELECT COALESCE(SUM(amount_due - amount_received), 0)::float FROM receivables WHERE tenant_id = $1 AND status <> 'paid') AS receivables`,
          [ctx.tenantId],
        )
      ).rows;
      const [cust] = (
        await client.query(
          `SELECT
             COUNT(*) FILTER (WHERE total_orders > 0 AND COALESCE(days_since_last_purchase, 0) < 30)::int AS active_customers,
             COUNT(*) FILTER (WHERE total_orders > 0 AND COALESCE(days_since_last_purchase, 0) >= 30)::int AS churn_risk_customers
           FROM vw_customer_purchase_summary WHERE tenant_id = $1`,
          [ctx.tenantId],
        )
      ).rows;

      const diagPayload = {
        current_revenue: Number(currKpi?.total_revenue || 0),
        previous_revenue: Number(prevKpi?.total_revenue || 0),
        current_orders: Number(currKpi?.order_count || 0),
        previous_orders: Number(prevKpi?.order_count || 0),
        gross_profit: Number(currKpi?.gross_profit || 0),
        expenses: Number(currKpi?.total_expenses || 0),
        cash_balance: Number(fin?.cash_balance || 0),
        payables: Number(fin?.payables || 0),
        receivables: Number(fin?.receivables || 0),
        stockout_count: Number(inv?.stockout_count || 0),
        low_stock_count: Number(inv?.low_stock_count || 0),
        total_products: Number(inv?.total_products || 0),
        active_customers: Number(cust?.active_customers || 0),
        churn_risk_customers: Number(cust?.churn_risk_customers || 0),
      };

      const diagnostics = await this.callIntelligence('/v1/advisor/diagnose', diagPayload);

      return {
        organization: ctx.tenantName,
        period: 'Last 30 days vs Prior 30 days',
        hasData: diagPayload.current_revenue > 0 || diagPayload.expenses > 0 || diagPayload.total_products > 0,
        snapshot: diagPayload,
        diagnostics,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Interactive What-If Financial Scenario Simulator grounded in trailing 30-day actuals.
   */
  @Post('simulate')
  @RequireFeature('ai_assistant')
  @RequirePermissions('ai:use')
  async runSimulation(
    @Body()
    body: {
      priceChangePct?: number;
      volumeChangePct?: number;
      expenseChangePct?: number;
      stockoutRecoveryPct?: number;
      branchId?: string;
    },
    @TenantCtx() ctx: TenantAuthContext,
  ) {
    const effectiveBranch = body.branchId && body.branchId !== 'all' ? body.branchId : null;
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const [kpi] = (
        await client.query(`SELECT * FROM fn_calculate_business_kpis($1, $2::uuid, CURRENT_DATE - 30, CURRENT_DATE)`, [
          ctx.tenantId,
          effectiveBranch,
        ])
      ).rows;
      const rev = Number(kpi?.total_revenue || 0);
      const gp = Number(kpi?.gross_profit || 0);
      const cogs = Math.max(0, rev - gp);
      const exp = Number(kpi?.total_expenses || 0);

      const sim = await this.callIntelligence('/v1/advisor/simulate', {
        monthly_revenue: rev,
        monthly_cogs: cogs,
        monthly_expenses: exp,
        price_change_pct: Number(body.priceChangePct || 0),
        volume_change_pct: Number(body.volumeChangePct || 0),
        expense_change_pct: Number(body.expenseChangePct || 0),
        stockout_recovery_pct: Number(body.stockoutRecoveryPct || 0),
      });
      if (!sim) {
        throw new BadRequestException('Intelligence simulation service is temporarily unavailable.');
      }
      return {
        hasBaselineData: rev > 0 || exp > 0,
        simulation: sim,
      };
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
        `SELECT * FROM ai_conversations WHERE tenant_id = $1 AND user_id = $2 ORDER BY updated_at DESC LIMIT 30`,
        [ctx.tenantId, user.userId],
      );
      const tpl = await client.query(
        `SELECT suggested_questions_en, suggested_questions_sw FROM business_industries WHERE code = $1`,
        [ctx.industryCode],
      );
      const extraEn = [
        'Give me my executive business health briefing',
        'What if I raise prices 8% and cut expenses 10%?',
        'Break down my recorded M-Pesa vs cash sales',
        'Where are my biggest expense leaks this month?',
      ];
      const extraSw = [
        'Nipe ripoti ya afya ya biashara yangu leo',
        'Nikiongeza bei kwa 8% na kupunguza gharama kwa 10% faida itakuwaje?',
        'Linganisha rekodi za mauzo ya M-Pesa na pesa taslimu',
        'Gharama kubwa zaidi mwezi huu ni zipi?',
      ];
      return {
        conversations: res.rows,
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
    const lang = body.language === 'sw' ? 'sw' : 'en';
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const ins = await client.query(
        `INSERT INTO ai_conversations (tenant_id, user_id, branch_id, title, language)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [
          ctx.tenantId,
          user.userId,
          body.branchId && body.branchId !== 'all' ? body.branchId : null,
          body.title || (lang === 'sw' ? 'Mazungumzo Mapya ya Biashara' : 'New Business Analysis'),
          lang,
        ],
      );
      return { conversation: ins.rows[0] };
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
      if (conv.rowCount === 0) throw new BadRequestException('Conversation not found');
      const msgs = await client.query(
        `SELECT m.*,
                (SELECT rating FROM ai_response_feedback f WHERE f.message_id = m.id AND f.user_id = $3 LIMIT 1) AS user_rating
         FROM ai_messages m
         WHERE m.tenant_id = $1 AND m.conversation_id = $2
         ORDER BY m.created_at ASC`,
        [ctx.tenantId, id, user.userId],
      );
      return { conversation: conv.rows[0], messages: msgs.rows };
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
    const question = (body?.content || '').trim();
    if (!question || question.length > 1500) {
      throw new BadRequestException('Question must be between 1 and 1500 characters.');
    }

    const lang: 'en' | 'sw' =
      body.language === 'sw' ||
      /(kwa nini|bidhaa|mauzo|faida|pesa|tawi|wateja|stoo|nifanye|gharama|matumizi|afya|ripoti|nikiongeza)/.test(
        question.toLowerCase(),
      )
        ? 'sw'
        : 'en';

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
    const toolsExecuted: { name: string; rows: number; ms: number }[] = [];

    return this.db.withTenant(ctx.tenantId, async (client) => {
      const convRes = await client.query(
        `SELECT * FROM ai_conversations WHERE tenant_id = $1 AND id = $2 AND user_id = $3`,
        [ctx.tenantId, conversationId, user.userId],
      );
      if (convRes.rowCount === 0) throw new BadRequestException('Conversation not found');

      await client.query(
        `INSERT INTO ai_messages (tenant_id, conversation_id, role, content, language, intent)
         VALUES ($1,$2,'user',$3,$4,$5)`,
        [ctx.tenantId, conversationId, question, lang, intent],
      );

      if (convRes.rows[0].title.startsWith('New ') || convRes.rows[0].title.startsWith('Mazungumzo')) {
        await client.query(`UPDATE ai_conversations SET title = $2, language = $3 WHERE id = $1`, [
          conversationId,
          question.slice(0, 80),
          lang,
        ]);
      }

      let branchLabel = lang === 'sw' ? 'Matawi Yote Yanayoruhusiwa' : 'All Authorized Branches';
      if (effectiveBranch) {
        const b = await client.query(`SELECT name FROM branches WHERE tenant_id = $1 AND id = $2`, [
          ctx.tenantId,
          effectiveBranch,
        ]);
        if (b.rows[0]) branchLabel = b.rows[0].name;
      }

      const runTool = async (name: string, sql: string, params: any[]) => {
        const t0 = Date.now();
        const r = await client.query(sql, params);
        toolsExecuted.push({ name, rows: r.rows.length, ms: Date.now() - t0 });
        return r.rows;
      };

      let answerText = '';
      let chart: any = null;
      let kpis: { label: string; value: string }[] = [];
      let recommendations: { title: string; type: 'observation' | 'estimate' | 'action'; detail: string }[] = [];
      let followUps: string[] = [];
      let periodLabel = 'Last 30 days';
      let verifiedContext: Record<string, any> = { intent };

      const canSeeFinance = ctx.permissions.includes('finance:read') || ctx.permissions.includes('sales:read');

      if (intent === 'executive_briefing') {
        periodLabel = 'Last 30 days vs Prior 30 days (Executive Health Diagnostic)';
        const [currKpi] = await runTool(
          'tool_30d_kpis',
          `SELECT * FROM fn_calculate_business_kpis($1, $2::uuid, CURRENT_DATE - 30, CURRENT_DATE)`,
          [ctx.tenantId, effectiveBranch],
        );
        const [prevKpi] = await runTool(
          'tool_prior_30d_kpis',
          `SELECT * FROM fn_calculate_business_kpis($1, $2::uuid, CURRENT_DATE - 60, CURRENT_DATE - 31)`,
          [ctx.tenantId, effectiveBranch],
        );
        const [inv] = await runTool(
          'tool_inventory_summary',
          `SELECT COUNT(*)::int AS total_products,
                  COUNT(*) FILTER (WHERE stock_status = 'stockout')::int AS stockout_count,
                  COUNT(*) FILTER (WHERE stock_status = 'low_stock')::int AS low_stock_count
           FROM vw_inventory_status WHERE tenant_id = $1 AND ($2::uuid IS NULL OR branch_id = $2::uuid)`,
          [ctx.tenantId, effectiveBranch],
        );
        const [fin] = await runTool(
          'tool_cash_obligations',
          `SELECT
             (SELECT COALESCE(SUM(opening_balance), 0)::float FROM cash_accounts WHERE tenant_id = $1) AS cash_balance,
             (SELECT COALESCE(SUM(amount_due - amount_paid), 0)::float FROM payables WHERE tenant_id = $1 AND status <> 'paid') AS payables,
             (SELECT COALESCE(SUM(amount_due - amount_received), 0)::float FROM receivables WHERE tenant_id = $1 AND status <> 'paid') AS receivables`,
          [ctx.tenantId],
        );
        const [cust] = await runTool(
          'tool_customer_retention',
          `SELECT
             COUNT(*) FILTER (WHERE total_orders > 0 AND COALESCE(days_since_last_purchase, 0) < 30)::int AS active_customers,
             COUNT(*) FILTER (WHERE total_orders > 0 AND COALESCE(days_since_last_purchase, 0) >= 30)::int AS churn_risk_customers
           FROM vw_customer_purchase_summary WHERE tenant_id = $1`,
          [ctx.tenantId],
        );

        const diagInput = {
          current_revenue: Number(currKpi.total_revenue || 0),
          previous_revenue: Number(prevKpi.total_revenue || 0),
          current_orders: Number(currKpi.order_count || 0),
          previous_orders: Number(prevKpi.order_count || 0),
          gross_profit: Number(currKpi.gross_profit || 0),
          expenses: Number(currKpi.total_expenses || 0),
          cash_balance: Number(fin.cash_balance || 0),
          payables: Number(fin.payables || 0),
          receivables: Number(fin.receivables || 0),
          stockout_count: Number(inv.stockout_count || 0),
          low_stock_count: Number(inv.low_stock_count || 0),
          total_products: Number(inv.total_products || 0),
          active_customers: Number(cust.active_customers || 0),
          churn_risk_customers: Number(cust.churn_risk_customers || 0),
        };
        const diag = await this.callIntelligence('/v1/advisor/diagnose', diagInput);
        verifiedContext = { diagInput, diagnostics: diag };

        const score = diag?.overall_health_score ?? 50;
        const grade = diag?.grade ?? 'Ready for Data';
        const netProfit = diagInput.gross_profit - diagInput.expenses;

        kpis = [
          { label: lang === 'sw' ? 'Alama ya Afya ya Biashara' : 'BizWave Health Score', value: `${score}/100 (${grade})` },
          { label: lang === 'sw' ? 'Mapato (Siku 30)' : '30d Revenue', value: fmtKes(diagInput.current_revenue) },
          { label: lang === 'sw' ? 'Faida Halisi' : '30d Net Profit', value: fmtKes(netProfit) },
          { label: lang === 'sw' ? 'Tahadhari za Stoo' : 'Stockout / Low', value: `${diagInput.stockout_count} / ${diagInput.low_stock_count}` },
        ];
        if (diag?.pillars) {
          chart = {
            type: 'bar',
            title: lang === 'sw' ? 'Alama za Nguzo za Biashara (0–100)' : 'Business Health Pillar Scores (0–100)',
            data: [
              { label: 'Growth', value: diag.pillars.growth },
              { label: 'Margin', value: diag.pillars.margin },
              { label: 'Inventory', value: diag.pillars.inventory },
              { label: 'Cash Flow', value: diag.pillars.cashflow },
              { label: 'Retention', value: diag.pillars.retention },
            ],
          };
        }
        const driverLines = (diag?.drivers || [])
          .map((d: any) => `• **${d.headline}** — ${d.detail}`)
          .join('\n');

        if (diagInput.current_revenue === 0 && diagInput.expenses === 0) {
          answerText =
            lang === 'sw'
              ? `**Muhtasari wa Afya ya Biashara:** Bado hujapakia rekodi za mauzo au matumizi kwa **${ctx.tenantName}**. Pakia faili yako ya CSV/Excel kwenye **BizWave Analytics → Imports** au rekodi mauzo na matumizi ili BizWave AI ikokotoe alama yako ya afya (0–100), utabiri wa mauzo, na hatua za ukuaji.`
              : `**Executive Health Briefing:** No sales or expense records have been imported yet for **${ctx.tenantName}**. Upload your sales/M-Pesa/expense spreadsheet under **BizWave Analytics → Imports** (or record daily entries) to unlock live health scoring, anomaly detection, and cash-flow forecasts.`;
        } else {
          answerText =
            lang === 'sw'
              ? `**Alama ya Afya ya Biashara: ${score}/100 (${grade})**\nKatika siku 30 zilizopita, **${ctx.tenantName}** imerekodi mapato ya **${fmtKes(diagInput.current_revenue)}** (${diagInput.current_orders} oda), matumizi ya **${fmtKes(diagInput.expenses)}**, na faida halisi ya **${fmtKes(netProfit)}**.\n\n**Mambo Makuu Yaliyogunduliwa:**\n${driverLines || '• Viashiria vikuu vya biashara viko thabiti.'}\n\n**Hatua Inayopendekezwa:** Tumia kiigaji cha *What-If* hapa chini kupima athari za kuboresha bei, kupunguza gharama, au kujaza stoo.`
              : `**BizWave Executive Health Score: ${score}/100 (${grade})**\nOver the trailing 30 days, **${ctx.tenantName}** recorded **${fmtKes(diagInput.current_revenue)}** in sales (**${diagInput.current_orders} orders**), **${fmtKes(diagInput.expenses)}** in operating expenses, and **${fmtKes(netProfit)}** in net profit.\n\n**Key Diagnostic Drivers:**\n${driverLines || '• Core operational metrics are tracking smoothly.'}\n\n**Next Actions:** Prioritize the highest-severity drivers above and test pricing or expense adjustments using the What-If Scenario Simulator.`;
        }
        recommendations = (diag?.drivers || []).slice(0, 3).map((d: any) => ({
          title: d.headline,
          type: d.severity === 'positive' ? 'observation' : 'action',
          detail: d.detail,
        }));
        followUps =
          lang === 'sw'
            ? ['Nikiongeza bei kwa 8% na kupunguza gharama kwa 10% faida itakuwaje?', 'Linganisha rekodi za mauzo ya M-Pesa na pesa taslimu', 'Gharama kubwa zaidi mwezi huu ni zipi?']
            : ['What if I raise prices 8% and cut expenses 10%?', 'Break down my recorded M-Pesa vs cash sales', 'Where are my biggest expense leaks this month?'];
      } else if (intent === 'what_if_simulation') {
        periodLabel = 'Trailing 30d Actuals -> What-If Scenario Projection';
        const [kpiRow] = await runTool(
          'tool_30d_baseline_for_simulation',
          `SELECT * FROM fn_calculate_business_kpis($1, $2::uuid, CURRENT_DATE - 30, CURRENT_DATE)`,
          [ctx.tenantId, effectiveBranch],
        );
        const rev = Number(kpiRow.total_revenue || 0);
        const gp = Number(kpiRow.gross_profit || 0);
        const cogs = Math.max(0, rev - gp);
        const exp = Number(kpiRow.total_expenses || 0);
        const params = parseWhatIfParams(question);
        const sim = await this.callIntelligence('/v1/advisor/simulate', {
          monthly_revenue: rev,
          monthly_cogs: cogs,
          monthly_expenses: exp,
          ...params,
        });
        verifiedContext = { baseline: { rev, gp, cogs, exp }, params, simulation: sim };

        if (rev === 0 || !sim) {
          answerText =
            lang === 'sw'
              ? 'Pakia au rekodi angalau mauzo ya mwezi mmoja ili BizWave AI iweze kuiga (simulate) mabadiliko ya bei, oda, na gharama kwa usahihi.'
              : 'Record or import at least one month of sales & expenses so BizWave AI can simulate price, volume, and cost scenarios on your real numbers.';
        } else {
          kpis = [
            { label: lang === 'sw' ? 'Faida ya Sasa / Mwezi' : 'Current Net Profit / Mo', value: fmtKes(sim.baseline.monthly_net_profit) },
            { label: lang === 'sw' ? 'Faida Inayokadiriwa / Mwezi' : 'Projected Net Profit / Mo', value: fmtKes(sim.projected.monthly_net_profit) },
            { label: lang === 'sw' ? 'Ongezeko la Faida / Mwezi' : 'Monthly Profit Impact', value: `${sim.impact.net_profit_delta >= 0 ? '+' : ''}${fmtKes(sim.impact.net_profit_delta)}` },
            { label: lang === 'sw' ? 'Athari kwa Mwaka' : 'Annualized Profit Impact', value: `${sim.impact.annualized_profit_delta >= 0 ? '+' : ''}${fmtKes(sim.impact.annualized_profit_delta)}` },
          ];
          chart = {
            type: 'bar',
            title: lang === 'sw' ? 'Ulinganisho: Sasa vs Makadirio (KES)' : 'Baseline vs Projected Monthly Performance (KES)',
            data: [
              { label: 'Current Rev', value: sim.baseline.monthly_revenue },
              { label: 'Proj. Rev', value: sim.projected.monthly_revenue },
              { label: 'Current Net', value: sim.baseline.monthly_net_profit },
              { label: 'Proj. Net', value: sim.projected.monthly_net_profit },
            ],
          };
          answerText =
            lang === 'sw'
              ? `**Uigaji wa Hali (What-If Simulation):** Kwa kurekebisha bei (**${params.price_change_pct >= 0 ? '+' : ''}${params.price_change_pct}%**), matumizi (**${params.expense_change_pct >= 0 ? '+' : ''}${params.expense_change_pct}%**), kiasi cha oda (**${params.volume_change_pct >= 0 ? '+' : ''}${params.volume_change_pct}%**), na kuzuia upotevu wa stoo (**+${params.stockout_recovery_pct}%**):\n\n• **Mapato kwa Mwezi:** ${fmtKes(sim.baseline.monthly_revenue)} → **${fmtKes(sim.projected.monthly_revenue)}**\n• **Faida Halisi kwa Mwezi:** ${fmtKes(sim.baseline.monthly_net_profit)} → **${fmtKes(sim.projected.monthly_net_profit)}** (${sim.impact.net_profit_delta >= 0 ? '+' : ''}${fmtKes(sim.impact.net_profit_delta)}/mwezi)\n• **Athari ya Mwaka Mzima:** **${sim.impact.annualized_profit_delta >= 0 ? '+' : ''}${fmtKes(sim.impact.annualized_profit_delta)}**\n\n**Hatua Inayopendekezwa:** Anza kwa kujaribu mabadiliko haya kwenye bidhaa zako kuu 5 na ufuatilie kasi ya mauzo kwa wiki 2.`
              : `**What-If Scenario Simulation** (Price **${params.price_change_pct >= 0 ? '+' : ''}${params.price_change_pct}%**, Expenses **${params.expense_change_pct >= 0 ? '+' : ''}${params.expense_change_pct}%**, Volume **${params.volume_change_pct >= 0 ? '+' : ''}${params.volume_change_pct}%**, Stockout Recovery **+${params.stockout_recovery_pct}%**):\n\n• **Monthly Revenue:** ${fmtKes(sim.baseline.monthly_revenue)} → **${fmtKes(sim.projected.monthly_revenue)}**\n• **Monthly Net Profit:** ${fmtKes(sim.baseline.monthly_net_profit)} → **${fmtKes(sim.projected.monthly_net_profit)}** (**${sim.impact.net_profit_delta >= 0 ? '+' : ''}${fmtKes(sim.impact.net_profit_delta)} / month**, margin ${sim.impact.margin_delta_pp >= 0 ? '+' : ''}${sim.impact.margin_delta_pp} pp)\n• **Annualized Profit Impact:** **${sim.impact.annualized_profit_delta >= 0 ? '+' : ''}${fmtKes(sim.impact.annualized_profit_delta)}**\n\n*(Assumes conservative -0.35 price elasticity when raising prices.)*\n\n**Suggested Action:** Pilot the adjustment on your top-performing SKU category for 14 days and monitor order count in BizWave Analytics.`;
          recommendations = [
            {
              title: 'Run controlled 14-day margin pilot',
              type: 'estimate',
              detail: `Projected upside of ${fmtKes(sim.impact.net_profit_delta)}/month (${fmtKes(sim.impact.annualized_profit_delta)}/year).`,
            },
          ];
        }
        followUps = ['Where are my biggest expense leaks this month?', 'Which products generate the highest profit?'];
      } else if (intent === 'mpesa_payment_mix') {
        periodLabel = 'Last 30 days Recorded Payment Method Mix';
        const mix = await runTool(
          'tool_recorded_payment_mix',
          `SELECT sp.payment_method AS label,
                  COUNT(*)::int AS tx_count,
                  COALESCE(SUM(sp.amount), 0)::float AS value
           FROM sales_payments sp
           JOIN sales s ON s.tenant_id = sp.tenant_id AND s.id = sp.sale_id
           WHERE sp.tenant_id = $1
             AND s.payment_status NOT IN ('reversed','refunded')
             AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
             AND (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE >= CURRENT_DATE - 30
           GROUP BY sp.payment_method
           ORDER BY value DESC`,
          [ctx.tenantId, effectiveBranch],
        );
        const totalAmt = mix.reduce((s, m) => s + m.value, 0);
        const mpesaRow = mix.find((m) => m.label === 'mpesa');
        const mpesaShare = totalAmt > 0 && mpesaRow ? (mpesaRow.value / totalAmt) * 100 : 0;
        verifiedContext = { totalRecorded: totalAmt, paymentMix: mix };

        kpis = mix.slice(0, 4).map((m) => ({
          label: `${String(m.label).toUpperCase()} (Recorded)`,
          value: `${fmtKes(m.value)} (${totalAmt > 0 ? ((m.value / totalAmt) * 100).toFixed(1) : '0'}%)`,
        }));
        chart = {
          type: 'bar',
          title: lang === 'sw' ? 'Rekodi za Mauzo kwa Njia ya Malipo (KES)' : 'Recorded Sales by Payment Method (KES)',
          data: mix.map((m) => ({ label: String(m.label).toUpperCase(), value: m.value })),
        };
        answerText =
          mix.length === 0
            ? lang === 'sw'
              ? 'Hakuna rekodi za njia za malipo zilizopakiwa kwa siku 30 zilizopita. Pakia rekodi za mauzo/M-Pesa kwenye BizWave Analytics ili kuzichambua.'
              : 'No recorded sales payment breakdown found in the last 30 days. Record or import your sales & M-Pesa logs in BizWave Analytics to analyze channel mix.'
            : lang === 'sw'
              ? `**Uchunguzi wa Rekodi za Malipo (Siku 30):** Jumla ya rekodi za mauzo ni **${fmtKes(totalAmt)}**. **M-Pesa** inachangia **${mpesaShare.toFixed(1)}%** (${fmtKes(mpesaRow?.value || 0)}).\n\n**Mchanganuo:** ${mix.map((m) => `${String(m.label).toUpperCase()}: ${fmtKes(m.value)} (${m.tx_count} miamala)`).join(' · ')}.\n\n*Kumbuka: BizWave haichakati malipo ya wateja wako — inarekodi na kuchambua taarifa za M-Pesa, pesa taslimu na benki ili kukusaidia kufanya maamuzi bora.*`
              : `**Recorded Payment Mix (Last 30 Days):** Total recorded inflows reached **${fmtKes(totalAmt)}**, with **M-Pesa accounting for ${mpesaShare.toFixed(1)}%** (${fmtKes(mpesaRow?.value || 0)}).\n\n**Breakdown:** ${mix.map((m) => `${String(m.label).toUpperCase()}: ${fmtKes(m.value)} (${m.tx_count} tx)`).join(' · ')}.\n\n*Note: BizWave does not process customer payments — we record, reconcile, and analyze your M-Pesa, cash, card, and bank entries to power accurate cash-flow decisions.*`;
        followUps = ['How much cash might I need next month?', 'Where are my biggest expense leaks this month?'];
      } else if (intent === 'expense_audit') {
        if (!canSeeFinance) {
          answerText = 'Your role does not include financial expense visibility.';
        } else {
          periodLabel = 'Last 30 days Operating Expense Audit';
          const cats = await runTool(
            'tool_expense_by_category',
            `SELECT COALESCE(ec.name, e.vendor_name, 'Uncategorized') AS label,
                    COUNT(*)::int AS items,
                    COALESCE(SUM(e.amount), 0)::float AS value
             FROM expenses e
             LEFT JOIN expense_categories ec ON ec.tenant_id = e.tenant_id AND ec.id = e.category_id
             WHERE e.tenant_id = $1
               AND ($2::uuid IS NULL OR e.branch_id = $2::uuid)
               AND e.expense_date >= CURRENT_DATE - 30
             GROUP BY 1 ORDER BY value DESC LIMIT 7`,
            [ctx.tenantId, effectiveBranch],
          );
          const [kpiRow] = await runTool(
            'tool_expense_ratio_kpis',
            `SELECT * FROM fn_calculate_business_kpis($1, $2::uuid, CURRENT_DATE - 30, CURRENT_DATE)`,
            [ctx.tenantId, effectiveBranch],
          );
          const totalExp = cats.reduce((s, c) => s + c.value, 0);
          const rev = Number(kpiRow.total_revenue || 0);
          const ratio = rev > 0 ? (totalExp / rev) * 100 : 0;
          verifiedContext = { totalExpenses: totalExp, revenue30d: rev, expenseRatioPct: ratio, categories: cats };

          kpis = [
            { label: lang === 'sw' ? 'Jumla ya Matumizi (30d)' : '30d Total Expenses', value: fmtKes(totalExp) },
            { label: lang === 'sw' ? 'Asilimia ya Mapato' : 'Expense / Revenue Ratio', value: `${ratio.toFixed(1)}%` },
            { label: lang === 'sw' ? 'Gharama Kubwa Zaidi' : 'Largest Cost Driver', value: cats[0] ? `${cats[0].label} (${fmtKes(cats[0].value)})` : 'None' },
          ];
          chart = cats.length > 0 ? { type: 'bar', title: lang === 'sw' ? 'Matumizi kwa Kategoria (KES)' : '30d Expenses by Category (KES)', data: cats } : null;
          answerText =
            cats.length === 0
              ? lang === 'sw'
                ? 'Hakuna rekodi za matumizi kwa siku 30 zilizopita. Rekodi au pakia gharama zako ili kufuatilia faida halisi.'
                : 'No expenses recorded in the last 30 days. Record your rent, supplier, utility, and payroll costs in BizWave Analytics to track true net profit.'
              : lang === 'sw'
                ? `**Ukaguzi wa Gharama (Siku 30):** Jumla ya matumizi ni **${fmtKes(totalExp)}** (${ratio.toFixed(1)}% ya mapato ya ${fmtKes(rev)}).\n\n**Gharama 3 Kuu:** ${cats.slice(0, 3).map((c, i) => `${i + 1}. **${c.label}** — ${fmtKes(c.value)} (${totalExp > 0 ? ((c.value / totalExp) * 100).toFixed(0) : 0}%)`).join(' · ')}.\n\n**Hatua Inayopendekezwa:** Kupunguza gharama za **${cats[0].label}** kwa 10% kutahifadhi **${fmtKes(cats[0].value * 0.1)}** kila mwezi (${fmtKes(cats[0].value * 1.2)} kwa mwaka).`
                : `**Operating Expense Audit (Last 30 Days):** Recorded expenses totaled **${fmtKes(totalExp)}** (**${ratio.toFixed(1)}%** of ${fmtKes(rev)} revenue).\n\n**Top Cost Drivers:** ${cats.slice(0, 3).map((c, i) => `${i + 1}. **${c.label}** — ${fmtKes(c.value)} (${totalExp > 0 ? ((c.value / totalExp) * 100).toFixed(0) : 0}%)`).join(' · ')}.\n\n**Suggested Action:** Trimming **${cats[0].label}** by 10% directly adds **${fmtKes(cats[0].value * 0.1)}/month** (**${fmtKes(cats[0].value * 1.2)}/year**) to net profit.`;
          recommendations = cats[0]
            ? [{ title: `Optimize ${cats[0].label}`, type: 'action', detail: `10% reduction saves ${fmtKes(cats[0].value * 0.1)} per month.` }]
            : [];
          followUps = ['What if I cut expenses 10% and raise prices 5%?', 'How much cash might I need next month?'];
        }
      } else if (intent === 'sales_drop') {
        periodLabel = 'Last 7 days vs Prior 7 days';
        const wk = await runTool(
          'tool_weekly_sales_comparison',
          `SELECT
             COALESCE(SUM(total_amount) FILTER (WHERE (transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE >= CURRENT_DATE - 6), 0)::float AS curr_rev,
             COUNT(*) FILTER (WHERE (transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE >= CURRENT_DATE - 6)::int AS curr_orders,
             COALESCE(SUM(total_amount) FILTER (WHERE (transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE BETWEEN CURRENT_DATE - 13 AND CURRENT_DATE - 7), 0)::float AS prev_rev,
             COUNT(*) FILTER (WHERE (transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE BETWEEN CURRENT_DATE - 13 AND CURRENT_DATE - 7)::int AS prev_orders
           FROM sales
           WHERE tenant_id = $1 AND payment_status NOT IN ('reversed','refunded')
             AND ($2::uuid IS NULL OR branch_id = $2::uuid)
             AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))`,
          [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds],
        );
        const daily = await runTool(
          'tool_daily_sales_14d',
          `SELECT (transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE::text AS label,
                  SUM(total_amount)::float AS value
           FROM sales
           WHERE tenant_id = $1 AND payment_status NOT IN ('reversed','refunded')
             AND ($2::uuid IS NULL OR branch_id = $2::uuid)
             AND (transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE >= CURRENT_DATE - 13
           GROUP BY 1 ORDER BY 1 ASC`,
          [ctx.tenantId, effectiveBranch],
        );
        const stockouts = await runTool(
          'tool_open_stock_alerts',
          `SELECT product_name, branch_name, available_quantity, stock_status
           FROM vw_inventory_status WHERE tenant_id = $1 AND stock_status IN ('stockout','low_stock') LIMIT 4`,
          [ctx.tenantId],
        );

        const r = wk[0];
        const deltaPct = r.prev_rev > 0 ? ((r.curr_rev - r.prev_rev) / r.prev_rev) * 100 : 0;
        const orderDelta = r.curr_orders - r.prev_orders;
        const currAov = r.curr_orders > 0 ? r.curr_rev / r.curr_orders : 0;
        const prevAov = r.prev_orders > 0 ? r.prev_rev / r.prev_orders : 0;
        const stockoutNames = stockouts.map((s) => `${s.product_name} (${s.branch_name})`).join(', ');
        verifiedContext = { weekly: r, deltaPct, orderDelta, currAov, prevAov, stockouts };

        kpis = [
          { label: lang === 'sw' ? 'Mauzo Wiki Hii' : 'This Week Revenue', value: fmtKes(r.curr_rev) },
          { label: lang === 'sw' ? 'Wiki Iliyopita' : 'Prior Week Revenue', value: fmtKes(r.prev_rev) },
          { label: lang === 'sw' ? 'Mabadiliko' : 'Week-over-Week', value: `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%` },
          { label: lang === 'sw' ? 'Wastani wa Oda (AOV)' : 'Avg Order Value', value: `${fmtKes(currAov)} (vs ${fmtKes(prevAov)})` },
        ];
        chart = { type: 'bar', title: lang === 'sw' ? 'Mauzo ya Kila Siku (Siku 14)' : 'Daily Revenue (Last 14 Days)', data: daily };

        if (lang === 'sw') {
          answerText = `**Uchunguzi (Observation):** Katika siku 7 zilizopita, mapato yalikuwa **${fmtKes(r.curr_rev)}** (${r.curr_orders} oda, wastani ${fmtKes(currAov)}) ikilinganishwa na **${fmtKes(r.prev_rev)}** (${r.prev_orders} oda) wiki iliyotangulia — badiliko la **${deltaPct.toFixed(1)}%**.\n\n**Sababu Zinazohusiana:** Idadi ya oda ilibadilika kwa **${orderDelta}**${stockoutNames ? `, na bidhaa zifuatazo zina uhaba au zimeisha stoo: **${stockoutNames}**` : ''}.\n\n**Hatua Inayopendekezwa:** Jaza upya bidhaa zilizoisha stoo mara moja na uwasiliane na wateja waliopunguza manunuzi kupitia BizWave Connect.`;
          followUps = ['Ni bidhaa zipi zinakaribia kuisha stoo?', 'Ni tawi lipi linafanya vizuri zaidi?', 'Nifanye nini kuboresha mapato?'];
        } else {
          answerText = `**Observation:** Over the last 7 days, revenue totaled **${fmtKes(r.curr_rev)}** across **${r.curr_orders} orders** (AOV ${fmtKes(currAov)}), compared to **${fmtKes(r.prev_rev)}** (**${r.prev_orders} orders**, AOV ${fmtKes(prevAov)}) the previous week — a **${deltaPct.toFixed(1)}%** shift.\n\n**Root Cause:** Order volume moved by **${orderDelta} orders**${stockoutNames ? `, coinciding with stockouts/low stock on **${stockoutNames}**` : ''}.\n\n**Suggested Action:** Prioritize replenishment for out-of-stock SKUs and run a targeted weekend offer to high-frequency buyers via BizWave Connect.`;
          followUps = ['Which products are likely to run out of stock?', 'Which branch is performing best?', 'What should I do to improve revenue?'];
        }
        recommendations = [
          { title: 'Replenish depleted items', type: 'action', detail: stockoutNames ? `Restock ${stockoutNames}` : 'Verify top SKU shelf availability across branches.' },
        ];
      } else if (intent === 'top_profit_products') {
        periodLabel = 'All recorded periods (Product Profitability)';
        const prods = await runTool(
          'tool_top_profitable_products',
          `SELECT product_name AS label, gross_profit::float AS value, total_revenue::float AS revenue, units_sold::float AS units, margin_pct::float AS margin_pct
           FROM vw_product_performance WHERE tenant_id = $1 ORDER BY gross_profit DESC LIMIT 6`,
          [ctx.tenantId],
        );
        const top = prods[0];
        verifiedContext = { topProducts: prods };
        kpis = prods.slice(0, 3).map((p) => ({
          label: p.label,
          value: `${fmtKes(p.value)} (${p.margin_pct}% margin)`,
        }));
        chart = { type: 'bar', title: lang === 'sw' ? 'Faida Ghafi kwa Bidhaa (KES)' : 'Gross Profit by Product (KES)', data: prods };
        answerText = !top
          ? lang === 'sw'
            ? 'Hakuna rekodi za mauzo ya bidhaa bado. Pakia faili la mauzo kwanza.'
            : 'No product sales records found yet. Import sales data to analyze product profitability.'
          : lang === 'sw'
            ? `**Uchunguzi (Observation):** Bidhaa inayoongoza kwa faida ghafi ni **${top.label}** ikiwa na faida ya **${fmtKes(top.value)}** (kiwango cha faida **${top.margin_pct}%** kutoka mauzo ya **${fmtKes(top.revenue)}**).\n\n**Bidhaa 3 Bora:** ${prods.slice(0, 3).map((p, i) => `${i + 1}. ${p.label} (${fmtKes(p.value)}, ${p.margin_pct}%)`).join(' · ')}.\n\n**Hatua Inayopendekezwa:** Linda upatikanaji wa stoo wa bidhaa hizi zenye faida kubwa na uziweke mbele kwenye promosheni.`
            : `**Observation:** Your highest-profit product is **${top.label}**, generating **${fmtKes(top.value)}** in gross profit (**${top.margin_pct}%** gross margin on **${fmtKes(top.revenue)}** revenue).\n\n**Top 3 Profit Drivers:** ${prods.slice(0, 3).map((p, i) => `${i + 1}. ${p.label} — ${fmtKes(p.value)} (${p.margin_pct}%)`).join(' · ')}.\n\n**Suggested Action:** Protect safety stock on top-margin SKUs and bundle slower-moving staples alongside them to lift average basket value.`;
        followUps =
          lang === 'sw'
            ? ['Ni bidhaa zipi zinakaribia kuisha stoo?', 'Ni tawi lipi linafanya vizuri zaidi?']
            : ['Which products are likely to run out of stock?', 'Which branch is performing best?'];
      } else if (intent === 'stockout_risk') {
        periodLabel = 'Real-Time Inventory Snapshot';
        const items = await runTool(
          'tool_inventory_risk',
          `SELECT product_name, branch_name, available_quantity::float AS available, reorder_level::float AS reorder_level, stock_status
           FROM vw_inventory_status
           WHERE tenant_id = $1 AND ($2::uuid IS NULL OR branch_id = $2::uuid)
           ORDER BY CASE stock_status WHEN 'stockout' THEN 0 WHEN 'low_stock' THEN 1 ELSE 2 END, available_quantity ASC LIMIT 8`,
          [ctx.tenantId, effectiveBranch],
        );
        const atRisk = items.filter((i) => i.stock_status !== 'healthy');
        verifiedContext = { inventoryAtRisk: atRisk };
        kpis = [
          { label: lang === 'sw' ? 'Zimeisha Stoo' : 'Out of Stock', value: String(atRisk.filter((i) => i.stock_status === 'stockout').length) },
          { label: lang === 'sw' ? 'Stoo ya Chini' : 'Low Stock Warning', value: String(atRisk.filter((i) => i.stock_status === 'low_stock').length) },
        ];
        chart = {
          type: 'bar',
          title: lang === 'sw' ? 'Idadi Iliyopo Stoo' : 'Available Units on Hand',
          data: items.map((i) => ({ label: `${i.product_name.slice(0, 18)} (${i.branch_name.slice(0, 4)})`, value: i.available })),
        };
        const listStr = atRisk
          .map((i) => `• **${i.product_name}** (${i.branch_name}): ${i.available} left vs reorder level ${i.reorder_level} [${i.stock_status.toUpperCase()}]`)
          .join('\n');
        answerText =
          atRisk.length === 0
            ? lang === 'sw'
              ? '**Uchunguzi:** Bidhaa zote ziko juu ya kiwango cha kuagiza upya kwa sasa.'
              : '**Observation:** All tracked products are currently above their configured reorder thresholds.'
            : lang === 'sw'
              ? `**Uchunguzi (Observation):** Kuna bidhaa **${atRisk.length}** zenye hatari ya kuisha stoo:\n${listStr}\n\n**Hatua Inayopendekezwa:** Tuma agizo la ununuzi kwa wasambazaji wako leo ili kuepuka upotevu wa mauzo.`
              : `**Observation:** **${atRisk.length} SKU-branch lines** are either stocked out or below reorder threshold:\n${listStr}\n\n**Suggested Action:** Raise purchase orders immediately for critical stockouts and rebalance surplus inventory across branches.`;
        followUps =
          lang === 'sw'
            ? ['Kwa nini mauzo yangu yalipungua wiki hii?', 'Nitahitaji pesa kiasi gani mwezi ujao?']
            : ['Why did my sales decrease this week?', 'How much cash might I need next month?'];
      } else if (intent === 'cash_needed_next_month') {
        if (!canSeeFinance) {
          answerText = 'Your role does not include financial data access required to estimate monthly cash obligations.';
        } else {
          periodLabel = 'Trailing 30d Operating Expenses + Open Confirmed Payables';
          const [expRow] = await runTool(
            'tool_trailing_30d_expenses',
            `SELECT COALESCE(SUM(amount), 0)::float AS total_exp FROM expenses WHERE tenant_id = $1 AND expense_date >= CURRENT_DATE - 30`,
            [ctx.tenantId],
          );
          const payables = await runTool(
            'tool_confirmed_payables',
            `SELECT description AS label, (amount_due - amount_paid)::float AS value, due_date::text AS due_date
             FROM payables WHERE tenant_id = $1 AND status <> 'paid' AND is_confirmed_obligation = TRUE ORDER BY due_date ASC`,
            [ctx.tenantId],
          );
          const [cashRow] = await runTool(
            'tool_cash_accounts_opening',
            `SELECT COALESCE(SUM(opening_balance), 0)::float AS bal FROM cash_accounts WHERE tenant_id = $1`,
            [ctx.tenantId],
          );
          const confirmedPay = payables.reduce((a, b) => a + b.value, 0);
          const estMonthlyOpex = expRow.total_exp;
          const totalProjectedOutflow = confirmedPay + estMonthlyOpex * 0.65;
          const recommendedBuffer = totalProjectedOutflow * 1.15;
          verifiedContext = { confirmedPay, estMonthlyOpex, cashOpeningBalance: cashRow.bal, recommendedBuffer, payables };

          kpis = [
            { label: lang === 'sw' ? 'Madeni Yaliyothibitishwa' : 'Confirmed Payables', value: fmtKes(confirmedPay) },
            { label: lang === 'sw' ? 'Matumizi (Siku 30)' : 'Trailing 30d Expenses', value: fmtKes(estMonthlyOpex) },
            { label: lang === 'sw' ? 'Akiba ya Fedha Inayopendekezwa' : 'Recommended Cash Reserve', value: fmtKes(recommendedBuffer) },
          ];
          chart = payables.length > 0 ? { type: 'bar', title: 'Confirmed Upcoming Payables (KES)', data: payables } : null;
          answerText =
            lang === 'sw'
              ? `**Uchunguzi (Observation):** Una madeni yaliyothibitishwa ya **${fmtKes(confirmedPay)}** na matumizi ya siku 30 zilizopita ya **${fmtKes(estMonthlyOpex)}** (salio la akaunti: **${fmtKes(cashRow.bal)}**).\n\n**Makadirio (Estimate):** Kwa kujumuisha gharama zilizothibitishwa + kinga ya 15%, panga takriban **${fmtKes(recommendedBuffer)}** kwa mwezi ujao.\n\n**Hatua Inayopendekezwa:** Fuatilia madeni ya wateja (receivables) na ulinganishe rekodi za M-Pesa mara kwa mara.`
              : `**Observation:** You have **${fmtKes(confirmedPay)}** in confirmed unpaid payables and **${fmtKes(estMonthlyOpex)}** in recorded operating expenses over the past 30 days (recorded cash balance: **${fmtKes(cashRow.bal)}**).\n\n**Estimate:** Combining confirmed bills with recurring outlays plus a 15% safety buffer suggests keeping roughly **${fmtKes(recommendedBuffer)}** available for the next 30 days.\n\n**Suggested Action:** Review your 30-day Cash-Flow Forecast in BizWave Predict and accelerate collection of open receivables.`;
          followUps =
            lang === 'sw'
              ? ['Gharama kubwa zaidi mwezi huu ni zipi?', 'Nifanye nini kuboresha mapato?']
              : ['Where are my biggest expense leaks this month?', 'What should I do to improve revenue?'];
        }
      } else if (intent === 'churn_customers') {
        periodLabel = 'Inactive Customer Cohort (>30 days since last order)';
        const dormant = await runTool(
          'tool_inactive_customers',
          `SELECT full_name, phone_number, total_orders::int AS orders, lifetime_value::float AS ltv, days_since_last_purchase::int AS inactive_days, marketing_opt_in
           FROM vw_customer_purchase_summary
           WHERE tenant_id = $1 AND total_orders > 0 AND COALESCE(days_since_last_purchase, 0) >= 30
           ORDER BY lifetime_value DESC LIMIT 8`,
          [ctx.tenantId],
        );
        verifiedContext = { dormantCustomers: dormant };
        kpis = [
          { label: lang === 'sw' ? 'Wateja Waliosimama (30d+)' : 'Inactive Customers (30d+)', value: String(dormant.length) },
          { label: lang === 'sw' ? 'Thamani ya Kihistoria Hatarini' : 'Historical LTV at Risk', value: fmtKes(dormant.reduce((s, d) => s + d.ltv, 0)) },
        ];
        chart = {
          type: 'bar',
          title: lang === 'sw' ? 'Siku Tangu Ununuzi wa Mwisho' : 'Days Since Last Purchase',
          data: dormant.map((d) => ({ label: d.full_name, value: d.inactive_days })),
        };
        const names = dormant
          .map((d) => `• **${d.full_name}** — ${d.inactive_days} days inactive (LTV: ${fmtKes(d.ltv)}, consent: ${d.marketing_opt_in ? 'opted-in' : 'no marketing consent'})`)
          .join('\n');
        answerText =
          dormant.length === 0
            ? lang === 'sw'
              ? '**Uchunguzi:** Hakuna wateja wa kawaida walioacha kununua kwa zaidi ya siku 30.'
              : '**Observation:** None of your repeat customers have been inactive for more than 30 days.'
            : lang === 'sw'
              ? `**Uchunguzi (Observation):** Wateja **${dormant.length}** hawajanunua kwa zaidi ya siku 30:\n${names}\n\n**Hatua Inayopendekezwa:** Tuma ujumbe wa kuwakaribisha tena kupitia BizWave Connect kwa wale tu waliotoa idhini ya ujumbe.`
              : `**Observation:** **${dormant.length} repeat customers** have not purchased in 30+ days:\n${names}\n\n**Suggested Action:** Re-engage opted-in buyers via a targeted BizWave Connect WhatsApp/SMS check-in (strictly respecting Kenya DPA 2019 consent flags).`;
        followUps = ['What should I do to improve revenue?', 'Which branch is performing best?'];
      } else if (intent === 'best_branch') {
        periodLabel = 'All Recorded Periods — Branch Comparison';
        const branches = await runTool(
          'tool_branch_comparison',
          `SELECT branch_name AS label, total_revenue::float AS value, gross_profit::float AS gross_profit, total_expenses::float AS expenses, net_contribution::float AS net_contribution, order_count::int AS orders
           FROM vw_branch_performance WHERE tenant_id = $1 ORDER BY total_revenue DESC`,
          [ctx.tenantId],
        );
        const best = branches[0];
        verifiedContext = { branches };
        kpis = branches.map((b) => ({
          label: b.label,
          value: `${fmtKes(b.value)} (${b.orders} orders)`,
        }));
        chart = { type: 'bar', title: lang === 'sw' ? 'Mapato kwa Kila Tawi (KES)' : 'Revenue by Branch (KES)', data: branches };
        answerText = !best
          ? 'No branch sales data found yet.'
          : lang === 'sw'
            ? `**Uchunguzi (Observation):** Tawi linaloongoza ni **${best.label}** likiwa na mapato ya **${fmtKes(best.value)}**, faida ghafi ya **${fmtKes(best.gross_profit)}**, na mchango halisi wa **${fmtKes(best.net_contribution)}** (${best.orders} oda).\n\n**Hatua Inayopendekezwa:** Linganisha upatikanaji wa stoo na bidhaa zinazouzika zaidi kati ya matawi ili kuinua matawi yenye mauzo ya chini.`
            : `**Observation:** **${best.label}** is your top-performing branch with **${fmtKes(best.value)}** in revenue, **${fmtKes(best.gross_profit)}** in gross profit, and **${fmtKes(best.net_contribution)}** net contribution across **${best.orders} orders**.\n\n**Suggested Action:** Replicate ${best.label}'s top-margin stock mix and resolve stockouts at lagging branches.`;
        followUps = ['Why did my sales decrease this week?', 'Which products generate the highest profit?'];
      } else {
        periodLabel = 'Last 30 days Holistic Business Diagnostic';
        const [kpiRow] = await runTool(
          'tool_30d_business_kpis',
          `SELECT * FROM fn_calculate_business_kpis($1, $2::uuid, CURRENT_DATE - 30, CURRENT_DATE)`,
          [ctx.tenantId, effectiveBranch],
        );
        const topProds = await runTool(
          'tool_top_3_products',
          `SELECT product_name, gross_profit::float AS gp, margin_pct::float AS margin FROM vw_product_performance WHERE tenant_id = $1 ORDER BY gross_profit DESC LIMIT 3`,
          [ctx.tenantId],
        );
        const stockRisk = await runTool(
          'tool_stock_risk_count',
          `SELECT COUNT(*) FILTER (WHERE stock_status IN ('stockout','low_stock'))::int AS risk_count FROM vw_inventory_status WHERE tenant_id = $1`,
          [ctx.tenantId],
        );
        verifiedContext = { kpis30d: kpiRow, topProds, stockRisk: stockRisk[0]?.risk_count || 0 };
        kpis = [
          { label: lang === 'sw' ? 'Mapato (Siku 30)' : '30d Revenue', value: fmtKes(Number(kpiRow.total_revenue)) },
          { label: lang === 'sw' ? 'Faida Ghafi' : 'Gross Profit', value: fmtKes(Number(kpiRow.gross_profit)) },
          { label: lang === 'sw' ? 'Wastani wa Oda' : 'Avg Order Value', value: fmtKes(Number(kpiRow.avg_order_value)) },
          { label: lang === 'sw' ? 'Tahadhari za Stoo' : 'Stock Risk Lines', value: String(stockRisk[0]?.risk_count || 0) },
        ];
        answerText =
          lang === 'sw'
            ? `**Muhtasari wa Biashara (Siku 30):** Mapato ni **${fmtKes(Number(kpiRow.total_revenue))}**, faida ghafi **${fmtKes(Number(kpiRow.gross_profit))}**, na jumla ya oda **${kpiRow.order_count}**.\n\n**Hatua 3 za Kuongeza Mapato:**\n1. **Zuia upotevu wa stoo:** Kuna bidhaa **${stockRisk[0]?.risk_count || 0}** zilizo kwenye hatari ya kuisha stoo.\n2. **Kuzingatia bidhaa zenye faida kubwa:** ${topProds.length ? topProds.map((p) => p.product_name).join(', ') : 'Pakia mauzo ya bidhaa ili kutambua viongozi wa faida'}.\n3. **Rejesha wateja waliopoa:** Tumia BizWave Connect kuwafikia wateja waliotoa idhini.`
            : `**Observation (Last 30 Days):** Revenue stands at **${fmtKes(Number(kpiRow.total_revenue))}** across **${kpiRow.order_count} orders** (AOV **${fmtKes(Number(kpiRow.avg_order_value))}**), generating **${fmtKes(Number(kpiRow.gross_profit))}** in gross profit.\n\n**Prioritized Growth Plan:**\n1. **Eliminate stockout leakage:** Resolve **${stockRisk[0]?.risk_count || 0}** stockout/low-stock SKU lines immediately.\n2. **Spotlight high-margin winners:** ${topProds.length ? `Feature **${topProds.map((p) => `${p.product_name} (${p.margin}%)`).join(', ')}** in bundles and promotions.` : 'Import itemized product sales to pinpoint your top-margin winners.'}\n3. **Win back dormant buyers:** Launch a consent-verified WhatsApp/SMS campaign via BizWave Connect.`;
        followUps =
          lang === 'sw'
            ? ['Nipe ripoti ya afya ya biashara yangu leo', 'Nikiongeza bei kwa 8% na kupunguza gharama kwa 10% faida itakuwaje?', 'Linganisha rekodi za mauzo ya M-Pesa na pesa taslimu']
            : ['Give me my executive business health briefing', 'What if I raise prices 8% and cut expenses 10%?', 'Break down my recorded M-Pesa vs cash sales'];
      }

      // Optional live LLM enhancement strictly grounded in verified SQL + Python Intelligence numbers
      const polished = await this.enhanceWithGroundedLlm({
        question,
        lang,
        tenantName: ctx.tenantName,
        industryCode: ctx.industryCode,
        verifiedContext,
        deterministicDraft: answerText,
      });
      answerText = polished.text;

      const provenance = {
        organization: ctx.tenantName,
        branchScope: branchLabel,
        period: periodLabel,
        toolsExecuted: toolsExecuted.map((t) => `${t.name} (${t.rows} rows, ${t.ms}ms)`),
        groundedInDatabase: true,
        synthesisMode: polished.llmUsed ? `grounded_llm (${polished.model})` : 'deterministic_sql_intelligence',
        generatedAt: new Date().toISOString(),
      };

      const msgIns = await client.query(
        `INSERT INTO ai_messages (tenant_id, conversation_id, role, content, language, intent, provenance, supporting_data, follow_up_questions)
         VALUES ($1,$2,'assistant',$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb) RETURNING *`,
        [
          ctx.tenantId,
          conversationId,
          answerText,
          lang,
          intent,
          JSON.stringify(provenance),
          JSON.stringify({ kpis, chart, recommendations }),
          JSON.stringify(followUps),
        ],
      );
      const assistantMessage = msgIns.rows[0];

      for (const t of toolsExecuted) {
        await client.query(
          `INSERT INTO ai_tool_executions (tenant_id, message_id, tool_name, row_count, execution_ms)
           VALUES ($1,$2,$3,$4,$5)`,
          [ctx.tenantId, assistantMessage.id, t.name, t.rows, t.ms],
        );
      }

      await client.query(
        `INSERT INTO ai_usage_records (tenant_id, user_id, conversation_id, prompt_tokens, completion_tokens, tools_invoked)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [ctx.tenantId, user.userId, conversationId, Math.ceil(question.length / 4), Math.ceil(answerText.length / 4), toolsExecuted.length],
      );
      await client.query(`UPDATE ai_conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);

      return { assistantMessage };
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
