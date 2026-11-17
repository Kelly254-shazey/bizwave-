import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
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

@ApiTags('Forecasting & Anomaly Detection (BizWave Predict)')
@ApiBearerAuth()
@Controller('forecasts')
export class ForecastingController {
  constructor(private readonly db: DatabaseService) {}

  private async callIntelligence(path: string, payload: Record<string, any>): Promise<any> {
    try {
      const res = await fetch(`${envConfig.intelligenceUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`Intelligence service error ${res.status}`);
      }
      return await res.json();
    } catch (err: any) {
      throw new ServiceUnavailableException(
        `BizWave Intelligence engine is temporarily unreachable: ${err.message}`,
      );
    }
  }

  @Get()
  @RequireFeature('predict_basic')
  async listForecasts(
    @Query('type') type: string | undefined,
    @TenantCtx() ctx: TenantAuthContext,
  ) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const [runs, anomalies, stockAlerts] = await Promise.all([
        client.query(
          `SELECT fr.*, b.name AS branch_name, p.name AS product_name
           FROM forecast_runs fr
           LEFT JOIN branches b ON b.tenant_id = fr.tenant_id AND b.id = fr.branch_id
           LEFT JOIN products p ON p.tenant_id = fr.tenant_id AND p.id = fr.product_id
           WHERE fr.tenant_id = $1 AND ($2::varchar IS NULL OR fr.forecast_type = $2::varchar)
           ORDER BY fr.created_at DESC LIMIT 20`,
          [ctx.tenantId, type || null],
        ),
        client.query(
          `SELECT * FROM anomaly_events WHERE tenant_id = $1 ORDER BY event_date DESC, detected_at DESC LIMIT 20`,
          [ctx.tenantId],
        ),
        client.query(
          `SELECT sa.*, p.name AS product_name, p.sku, b.name AS branch_name
           FROM stock_alerts sa
           JOIN products p ON p.tenant_id = sa.tenant_id AND p.id = sa.product_id
           JOIN branches b ON b.tenant_id = sa.tenant_id AND b.id = sa.branch_id
           WHERE sa.tenant_id = $1 AND sa.status = 'open'
           ORDER BY CASE sa.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END`,
          [ctx.tenantId],
        ),
      ]);
      return { forecastRuns: runs.rows, anomalies: anomalies.rows, stockAlerts: stockAlerts.rows };
    });
  }

  @Get(':id')
  @RequireFeature('predict_basic')
  async getForecast(@Param('id') id: string, @TenantCtx() ctx: TenantAuthContext) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const runRes = await client.query(`SELECT * FROM forecast_runs WHERE tenant_id = $1 AND id = $2`, [
        ctx.tenantId,
        id,
      ]);
      if (runRes.rowCount === 0) throw new BadRequestException('Forecast run not found');
      const [values, explanations, actuals] = await Promise.all([
        client.query(`SELECT * FROM forecast_values WHERE tenant_id = $1 AND forecast_run_id = $2 ORDER BY target_date ASC`, [ctx.tenantId, id]),
        client.query(`SELECT * FROM prediction_explanations WHERE tenant_id = $1 AND forecast_run_id = $2`, [ctx.tenantId, id]),
        client.query(`SELECT * FROM forecast_actuals WHERE tenant_id = $1 AND forecast_run_id = $2 ORDER BY target_date ASC`, [ctx.tenantId, id]),
      ]);
      return {
        run: runRes.rows[0],
        values: values.rows,
        explanations: explanations.rows,
        actuals: actuals.rows,
      };
    });
  }

  @Post()
  @RequireFeature('predict_basic')
  async createForecast(
    @Body()
    body: {
      forecastType: 'sales' | 'demand' | 'cashflow';
      horizonDays?: number;
      branchId?: string;
      productId?: string;
    },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const fType = body.forecastType || 'sales';
    const horizonDays = Math.min(90, Math.max(7, body.horizonDays || 30));
    const effectiveBranch = body.branchId && body.branchId !== 'all' ? body.branchId : null;

    // Granular RBAC check per forecasting domain (e.g., Customer Service Agent CANNOT run financial cashflow forecasts!)
    const requiredPerm =
      fType === 'sales' ? 'predict:sales' : fType === 'demand' ? 'predict:demand' : 'predict:cashflow';
    if (!ctx.permissions.includes(requiredPerm)) {
      throw new ForbiddenException(`Your role does not have '${requiredPerm}' permission.`);
    }
    if (fType === 'cashflow' && !ctx.enabledFeatures.includes('predict_advanced')) {
      throw new ForbiddenException('Cash-flow forecasting requires the Intelligence or Enterprise plan.');
    }

    let intelResult: any;
    let resolvedProductId: string | null = body.productId || null;

    if (fType === 'sales') {
      const series = await this.db.withTenant(ctx.tenantId, async (client) => {
        const res = await client.query(
          `SELECT (transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE::text AS date,
                  SUM(total_amount)::float AS value
           FROM sales
           WHERE tenant_id = $1 AND payment_status NOT IN ('reversed','refunded')
             AND ($2::uuid IS NULL OR branch_id = $2::uuid)
             AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))
           GROUP BY 1 ORDER BY 1 ASC`,
          [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds],
        );
        return res.rows;
      });
      intelResult = await this.callIntelligence('/v1/forecasts/sales', {
        tenant_id: ctx.tenantId,
        branch_id: effectiveBranch,
        series,
        horizon_days: horizonDays,
      });
    } else if (fType === 'demand') {
      const prodData = await this.db.withTenant(ctx.tenantId, async (client) => {
        let pId = resolvedProductId;
        if (!pId) {
          const topP = await client.query(
            `SELECT id FROM products WHERE tenant_id = $1 AND is_active = TRUE ORDER BY created_at ASC LIMIT 1`,
            [ctx.tenantId],
          );
          pId = topP.rows[0]?.id || null;
        }
        if (!pId) throw new BadRequestException('No active products available for demand forecasting.');
        resolvedProductId = pId;

        const [pInfo, invInfo, salesHist] = await Promise.all([
          client.query(
            `SELECT p.id, p.name, COALESCE(sup.lead_time_days, 3) AS lead_time_days
             FROM products p LEFT JOIN suppliers sup ON sup.tenant_id = p.tenant_id AND sup.id = p.supplier_id
             WHERE p.tenant_id = $1 AND p.id = $2`,
            [ctx.tenantId, pId],
          ),
          client.query(
            `SELECT COALESCE(SUM(available_quantity), 0)::float AS avail
             FROM inventory WHERE tenant_id = $1 AND product_id = $2
               AND ($3::uuid IS NULL OR branch_id = $3::uuid)`,
            [ctx.tenantId, pId, effectiveBranch],
          ),
          client.query(
            `SELECT d::date::text AS date,
                    COALESCE(SUM(si.quantity), 0)::float AS units_sold
             FROM generate_series(CURRENT_DATE - 60, CURRENT_DATE, '1 day') d
             LEFT JOIN sales s ON s.tenant_id = $1
               AND (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE = d::date
               AND s.payment_status NOT IN ('reversed','refunded')
               AND ($3::uuid IS NULL OR s.branch_id = $3::uuid)
             LEFT JOIN sales_items si ON si.tenant_id = $1 AND si.sale_id = s.id AND si.product_id = $2
             GROUP BY 1 ORDER BY 1 ASC`,
            [ctx.tenantId, pId, effectiveBranch],
          ),
        ]);
        return {
          product: pInfo.rows[0],
          available: invInfo.rows[0]?.avail || 0,
          series: salesHist.rows.map((r) => ({
            date: r.date,
            units_sold: Number(r.units_sold),
            was_stockout: Number(invInfo.rows[0]?.avail || 0) <= 0 && Number(r.units_sold) === 0,
          })),
        };
      });

      intelResult = await this.callIntelligence('/v1/forecasts/demand', {
        tenant_id: ctx.tenantId,
        product_id: prodData.product.id,
        product_name: prodData.product.name,
        current_available_stock: prodData.available,
        lead_time_days: Number(prodData.product.lead_time_days),
        horizon_days: horizonDays,
        series: prodData.series,
      });
    } else {
      const cfData = await this.db.withTenant(ctx.tenantId, async (client) => {
        const [acctRes, inflowRes, outflowRes, payRes, recRes] = await Promise.all([
          client.query(`SELECT COALESCE(SUM(opening_balance), 0)::float AS bal FROM cash_accounts WHERE tenant_id = $1`, [ctx.tenantId]),
          client.query(
            `SELECT (transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE::text AS date, SUM(total_amount)::float AS value
             FROM sales WHERE tenant_id = $1 AND payment_status NOT IN ('reversed','refunded') GROUP BY 1 ORDER BY 1 ASC`,
            [ctx.tenantId],
          ),
          client.query(
            `SELECT expense_date::text AS date, SUM(amount)::float AS value
             FROM expenses WHERE tenant_id = $1 GROUP BY 1 ORDER BY 1 ASC`,
            [ctx.tenantId],
          ),
          client.query(
            `SELECT due_date::text AS due_date, (amount_due - amount_paid)::float AS amount, description
             FROM payables WHERE tenant_id = $1 AND status <> 'paid' AND is_confirmed_obligation = TRUE`,
            [ctx.tenantId],
          ),
          client.query(
            `SELECT due_date::text AS due_date, (amount_due - amount_paid)::float AS amount, invoice_ref AS description
             FROM receivables WHERE tenant_id = $1 AND status <> 'paid'`,
            [ctx.tenantId],
          ),
        ]);
        return {
          openingBalance: acctRes.rows[0]?.bal || 0,
          inflows: inflowRes.rows,
          outflows: outflowRes.rows,
          payables: payRes.rows,
          receivables: recRes.rows,
        };
      });

      intelResult = await this.callIntelligence('/v1/forecasts/cashflow', {
        tenant_id: ctx.tenantId,
        opening_cash_balance: cfData.openingBalance,
        inflows: cfData.inflows,
        outflows: cfData.outflows,
        confirmed_payables: cfData.payables,
        confirmed_receivables: cfData.receivables,
        horizon_days: horizonDays,
      });
    }

    // Persist forecast_runs, forecast_values & prediction_explanations (never overwrites original transactions!)
    const saved = await this.db.withTenant(ctx.tenantId, async (client) => {
      const mvRes = await client.query(
        `SELECT mv.id FROM model_versions mv
         JOIN forecasting_models fm ON fm.id = mv.model_id
         WHERE fm.domain = $1 AND mv.status = 'active' LIMIT 1`,
        [fType],
      );
      const runIns = await client.query(
        `INSERT INTO forecast_runs (
           tenant_id, branch_id, product_id, forecast_type, model_version_id,
           selected_algorithm, horizon_days, training_start, training_end,
           status, status_message, evaluation_metrics, summary, requested_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14)
         RETURNING *`,
        [
          ctx.tenantId,
          effectiveBranch,
          resolvedProductId,
          fType,
          mvRes.rows[0]?.id || null,
          intelResult.selected_algorithm || 'none',
          horizonDays,
          intelResult.training_start || null,
          intelResult.training_end || null,
          intelResult.status,
          intelResult.status_message || null,
          JSON.stringify(intelResult.evaluation_metrics || {}),
          JSON.stringify(intelResult.summary || {}),
          user.userId,
        ],
      );
      const run = runIns.rows[0];

      for (const v of intelResult.values || []) {
        await client.query(
          `INSERT INTO forecast_values (tenant_id, forecast_run_id, target_date, predicted_value, lower_bound, upper_bound, confidence_level, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
          [ctx.tenantId, run.id, v.target_date, v.predicted_value, v.lower_bound, v.upper_bound, v.confidence_level, JSON.stringify(v.metadata || {})],
        );
      }

      for (const exp of intelResult.explanations || []) {
        await client.query(
          `INSERT INTO prediction_explanations (tenant_id, forecast_run_id, feature_name, contribution_weight, explanation_text)
           VALUES ($1,$2,$3,$4,$5)`,
          [ctx.tenantId, run.id, exp.feature_name, exp.contribution_weight, exp.explanation_text],
        );
      }

      return { run, values: intelResult.values || [], explanations: intelResult.explanations || [] };
    });

    return saved;
  }

  @Post('anomalies/scan')
  @RequireFeature('predict_advanced')
  @RequirePermissions('predict:sales')
  async scanAnomalies(@Query('branchId') branchId: string | undefined, @TenantCtx() ctx: TenantAuthContext) {
    const effectiveBranch = branchId && branchId !== 'all' ? branchId : null;
    const { salesSeries, expenseSeries } = await this.db.withTenant(ctx.tenantId, async (client) => {
      const [sRes, eRes] = await Promise.all([
        client.query(
          `SELECT (transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE::text AS date, SUM(total_amount)::float AS value
           FROM sales WHERE tenant_id = $1 AND payment_status NOT IN ('reversed','refunded')
             AND ($2::uuid IS NULL OR branch_id = $2::uuid)
           GROUP BY 1 ORDER BY 1 ASC`,
          [ctx.tenantId, effectiveBranch],
        ),
        client.query(
          `SELECT expense_date::text AS date, SUM(amount)::float AS value
           FROM expenses WHERE tenant_id = $1 AND ($2::uuid IS NULL OR branch_id = $2::uuid)
           GROUP BY 1 ORDER BY 1 ASC`,
          [ctx.tenantId, effectiveBranch],
        ),
      ]);
      return { salesSeries: sRes.rows, expenseSeries: eRes.rows };
    });

    const [salesAnom, expAnom] = await Promise.all([
      this.callIntelligence('/v1/anomalies/detect', {
        tenant_id: ctx.tenantId,
        metric_name: 'daily_revenue',
        series: salesSeries,
        z_threshold: 2.0,
      }),
      this.callIntelligence('/v1/anomalies/detect', {
        tenant_id: ctx.tenantId,
        metric_name: 'daily_expenses',
        direction_sensitivity: 'spike',
        series: expenseSeries,
        z_threshold: 2.0,
      }),
    ]);

    const allAnoms = [...(salesAnom.anomalies || []), ...(expAnom.anomalies || [])];

    await this.db.withTenant(ctx.tenantId, async (client) => {
      const det = await client.query(
        `INSERT INTO anomaly_detections (tenant_id, branch_id, detector_name, metric_name, analyzed_from, analyzed_to, anomalies_found)
         VALUES ($1,$2,'rolling_median_zscore','revenue_and_expenses', CURRENT_DATE - 90, CURRENT_DATE, $3) RETURNING id`,
        [ctx.tenantId, effectiveBranch, allAnoms.length],
      );
      // Avoid cluttering duplicates for the same date+metric
      await client.query(`DELETE FROM anomaly_events WHERE tenant_id = $1 AND status = 'open'`, [ctx.tenantId]);
      for (const a of allAnoms) {
        await client.query(
          `INSERT INTO anomaly_events (tenant_id, detection_id, branch_id, anomaly_type, severity, event_date, metric_name, expected_value, observed_value, deviation_score, explanation)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [ctx.tenantId, det.rows[0].id, effectiveBranch, a.anomaly_type, a.severity, a.event_date, a.metric_name, a.expected_value, a.observed_value, a.deviation_score, a.explanation],
        );
      }
    });

    return { anomaliesFound: allAnoms.length, anomalies: allAnoms };
  }

  @Get('segmentation/rfm')
  @RequireFeature('predict_advanced')
  @RequirePermissions('analytics:read')
  async rfmSegmentation(@TenantCtx() ctx: TenantAuthContext) {
    const customers = await this.db.withTenant(ctx.tenantId, async (client) => {
      const res = await client.query(
        `SELECT customer_id::text, full_name, days_since_last_purchase, total_orders::int, lifetime_value::float
         FROM vw_customer_purchase_summary WHERE tenant_id = $1`,
        [ctx.tenantId],
      );
      return res.rows;
    });
    return this.callIntelligence('/v1/segmentation/rfm', {
      tenant_id: ctx.tenantId,
      customers,
    });
  }
}
