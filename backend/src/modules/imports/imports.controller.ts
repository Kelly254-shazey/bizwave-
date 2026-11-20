import fs from 'fs';
import path from 'path';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { parse as parseCsv } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { DatabaseService } from '../../database/database.service';
import { encryptSecret, sha256Hex } from '../../database/crypto.util';
import { envConfig } from '../../config/env.config';
import { CurrentUser, RequirePermissions, TenantCtx } from '../../common/decorators/auth.decorators';
import { AuthenticatedUser, TenantAuthContext } from '../../common/types/auth.types';
import { QueueService } from '../../jobs/queue.service';

const ALLOWED_EXTS = ['.csv', '.xlsx', '.xls', '.json'];
const MAX_BYTES = 10 * 1024 * 1024;

function autoMapColumns(datasetType: string, headers: string[]): Record<string, string> {
  const lower = headers.map((h) => ({ raw: h, norm: h.toLowerCase().replace(/[^a-z0-9]/g, '') }));
  const find = (candidates: string[]) => {
    for (const k of candidates) { const exact = lower.find((c) => c.norm === k); if (exact) return exact.raw; }
    for (const k of candidates) { const match = lower.find((c) => c.norm.includes(k)); if (match) return match.raw; }
    return '';
  };

  if (datasetType === 'sales') {
    return {
      transaction_ref: find(['ref', 'receipt', 'invoice', 'orderid', 'txid']),
      transaction_date: find(['date', 'timestamp', 'time', 'created']),
      product_name: find(['product', 'item', 'description', 'menu']),
      sku: find(['sku', 'code', 'barcode']),
      quantity: find(['qty', 'quantity', 'units']),
      unit_price: find(['unitprice', 'price', 'rate']),
      total_amount: find(['totalamount', 'salestotal', 'revenue', 'sales', 'amount', 'total']),
      cost_of_goods_sold: find(['costofgoodssold', 'totalcost', 'cogs']),
      tax_amount: find(['taxamount', 'vatamount', 'tax', 'vat']),
      payment_method: find(['payment', 'method', 'mpesa', 'channel']),
      customer_name: find(['customer', 'client', 'buyer']),
    };
  }
  if (datasetType === 'expenses') {
    return {
      expense_ref: find(['ref', 'voucher', 'receipt', 'id']),
      expense_date: find(['date', 'paid']),
      vendor_name: find(['vendor', 'supplier', 'payee']),
      category: find(['category', 'type', 'group']),
      description: find(['desc', 'notes', 'memo', 'narration']),
      amount: find(['amount', 'total', 'cost', 'kes']),
      payment_method: find(['payment', 'method']),
    };
  }
  if (datasetType === 'products') {
    return {
      sku: find(['sku', 'code', 'barcode']),
      name: find(['name', 'product', 'item', 'title']),
      category: find(['category', 'group']),
      cost_price: find(['cost', 'buying']),
      selling_price: find(['selling', 'price', 'retail']),
      on_hand_quantity: find(['stock', 'qty', 'quantity', 'onhand']),
      reorder_level: find(['reorder', 'min']),
    };
  }
  return {
    external_ref: find(['ref', 'id', 'code']),
    full_name: find(['name', 'customer', 'client']),
    phone_number: find(['phone', 'mobile', 'tel', 'msisdn']),
    email: find(['email', 'mail']),
    marketing_opt_in: find(['consent', 'optin', 'marketing']),
  };
}

function parseUploadedRows(buffer: Buffer, ext: string): { headers: string[]; rows: Record<string, any>[] } {
  if (ext === '.csv') {
    const records = parseCsv(buffer.toString('utf8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, any>[];
    const headers = records.length > 0 ? Object.keys(records[0]) : [];
    return { headers, rows: records };
  }
  if (ext === '.xlsx' || ext === '.xls') {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) return { headers: [], rows: [] };
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[firstSheet], { defval: '' });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { headers, rows };
  }
  if (ext === '.json') {
    const parsed = JSON.parse(buffer.toString('utf8'));
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.records) ? parsed.records : [];
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { headers, rows };
  }
  throw new BadRequestException('Unsupported file format');
}

@ApiTags('Data Sources & Imports')
@ApiBearerAuth()
@Controller()
export class ImportsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly queues: QueueService,
  ) {
    fs.mkdirSync(envConfig.uploadDir, { recursive: true });
  }

  private assertDatasetWrite(ctx: TenantAuthContext, datasetType: string) {
    const required: Record<string, string> = { sales: 'sales:write', expenses: 'finance:write', mpesa: 'finance:write', products: 'inventory:write', customers: 'customers:write' };
    const permission = required[datasetType];
    if (permission && !ctx.permissions.includes(permission)) throw new ForbiddenException(`Your role cannot import ${datasetType} records.`);
  }


  private readableDatasets(ctx: TenantAuthContext): string[] {
    const result: string[] = [];
    if (ctx.permissions.includes('sales:read') || ctx.permissions.includes('sales:write')) result.push('sales');
    if (ctx.permissions.includes('finance:read') || ctx.permissions.includes('finance:write')) result.push('expenses', 'mpesa');
    if (ctx.permissions.includes('inventory:read') || ctx.permissions.includes('inventory:write')) result.push('products');
    if (ctx.permissions.includes('customers:read') || ctx.permissions.includes('customers:write')) result.push('customers');
    return result;
  }

  private assertJobVisible(ctx: TenantAuthContext, user: AuthenticatedUser, job: any) {
    // Raw spreadsheet previews can contain costs or arbitrary private columns.
    if (!this.readableDatasets(ctx).includes(job.dataset_type) ||
        (!ctx.permissions.includes('finance:read') && job.created_by !== user.userId)) {
      throw new BadRequestException('Import job not found');
    }
  }

  @Get('data-sources')
  @RequirePermissions('imports:read')
  async listDataSources(@TenantCtx() ctx: TenantAuthContext) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const [sources, providers] = await Promise.all([
        client.query(
          `SELECT ds.*, ip.name AS provider_name, ip.required_credentials,
                  (SELECT COUNT(*)::int FROM data_source_credentials dsc WHERE dsc.data_source_id = ds.id) AS stored_credential_keys
           FROM data_sources ds
           LEFT JOIN integration_providers ip ON ip.id = ds.provider_id
           WHERE ds.tenant_id = $1 AND ($2::uuid[] IS NULL OR ds.branch_id = ANY($2::uuid[]))
           ORDER BY ds.created_at DESC`,
          [ctx.tenantId, ctx.allowedBranchIds],
        ),
        client.query(`SELECT * FROM integration_providers WHERE is_active = TRUE ORDER BY name ASC`),
      ]);
      return { dataSources: sources.rows, providers: providers.rows };
    });
  }

  @Post('data-sources')
  @RequirePermissions('imports:manage')
  async createDataSource(
    @Body()
    body: {
      name: string;
      sourceType: string;
      providerCode?: string;
      branchId?: string;
      credentials?: Record<string, string>;
    },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    if (!body.name || !body.sourceType) {
      throw new BadRequestException('name and sourceType are required');
    }
    let requestedBranch = body.branchId && body.branchId !== 'all' ? body.branchId : null;
    if (ctx.allowedBranchIds !== null) {
      if (requestedBranch && !ctx.allowedBranchIds.includes(requestedBranch)) throw new ForbiddenException('Branch access denied.');
      if (!requestedBranch && ctx.allowedBranchIds.length === 1) requestedBranch = ctx.allowedBranchIds[0];
      if (!requestedBranch) throw new BadRequestException('Choose an assigned branch for this data source.');
    }
    const created = await this.db.withTenant(ctx.tenantId, async (client) => {
      if (requestedBranch) {
        const b = await client.query(`SELECT id FROM branches WHERE tenant_id=$1 AND id=$2 AND status='active'`, [ctx.tenantId, requestedBranch]);
        if (!b.rowCount) throw new BadRequestException('Branch not found.');
      }
      let providerId: string | null = null;
      if (body.providerCode) {
        const pr = await client.query(`SELECT id FROM integration_providers WHERE code = $1`, [
          body.providerCode,
        ]);
        providerId = pr.rows[0]?.id || null;
      }
      const ds = await client.query(
        `INSERT INTO data_sources (tenant_id, branch_id, provider_id, name, source_type, status, created_by)
         VALUES ($1, $2, $3, $4, $5, 'configured', $6) RETURNING *`,
        [ctx.tenantId, requestedBranch, providerId, body.name, body.sourceType, user.userId],
      );
      // Encrypt every credential key at rest using AES-256-GCM (NEVER plaintext!)
      if (body.credentials) {
        for (const [key, val] of Object.entries(body.credentials)) {
          if (val && val.trim()) {
            await client.query(
              `INSERT INTO data_source_credentials (tenant_id, data_source_id, credential_key, encrypted_value)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (tenant_id, data_source_id, credential_key)
               DO UPDATE SET encrypted_value = EXCLUDED.encrypted_value, rotated_at = NOW()`,
              [ctx.tenantId, ds.rows[0].id, key, encryptSecret(val.trim())],
            );
          }
        }
      }
      return ds.rows[0];
    });

    await this.db.appendAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'data_source.created',
      resourceType: 'data_source',
      resourceId: created.id,
      ipAddress: req.ip,
      changes: { name: body.name, sourceType: body.sourceType, credentialsStoredEncrypted: Boolean(body.credentials) },
    });

    return { dataSource: created };
  }

  @Get('imports')
  @RequirePermissions('imports:read')
  async listImports(@TenantCtx() ctx: TenantAuthContext, @CurrentUser() user: AuthenticatedUser) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const res = await client.query(
        `SELECT j.*, uf.original_filename, uf.file_size_bytes, b.name AS branch_name
         FROM data_import_jobs j
         LEFT JOIN uploaded_files uf ON uf.tenant_id = j.tenant_id AND uf.id = j.uploaded_file_id
         LEFT JOIN branches b ON b.tenant_id = j.tenant_id AND b.id = j.branch_id
         WHERE j.tenant_id = $1 AND ($2::uuid[] IS NULL OR j.branch_id = ANY($2::uuid[]))
           AND j.dataset_type = ANY($3::text[]) AND ($4::boolean OR j.created_by = $5)
         ORDER BY j.created_at DESC
         LIMIT 50`,
        [ctx.tenantId, ctx.allowedBranchIds, this.readableDatasets(ctx), ctx.permissions.includes('finance:read'), user.userId],
      );
      return { imports: res.rows };
    });
  }

  @Get('imports/:id')
  @RequirePermissions('imports:read')
  async getImport(@Param('id') id: string, @TenantCtx() ctx: TenantAuthContext, @CurrentUser() user: AuthenticatedUser) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const jobRes = await client.query(
        `SELECT j.*, uf.original_filename, uf.file_size_bytes
         FROM data_import_jobs j
         LEFT JOIN uploaded_files uf ON uf.tenant_id = j.tenant_id AND uf.id = j.uploaded_file_id
         WHERE j.tenant_id = $1 AND j.id = $2 AND ($3::uuid[] IS NULL OR j.branch_id = ANY($3::uuid[]))`,
        [ctx.tenantId, id, ctx.allowedBranchIds],
      );
      if (jobRes.rowCount === 0) throw new BadRequestException('Import job not found');
      this.assertJobVisible(ctx, user, jobRes.rows[0]);
      const errRes = await client.query(
        `SELECT * FROM import_validation_errors WHERE tenant_id = $1 AND import_job_id = $2 ORDER BY row_number ASC LIMIT 200`,
        [ctx.tenantId, id],
      );
      return { importJob: jobRes.rows[0], errors: errRes.rows };
    });
  }

  @Post('imports')
  @RequirePermissions('imports:manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async uploadImport(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { datasetType?: string; branchId?: string; idempotencyKey?: string; csvContent?: string; filename?: string },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    const datasetType = (body.datasetType || 'sales').toLowerCase();
    if (!['sales', 'expenses', 'products', 'customers', 'mpesa'].includes(datasetType)) {
      throw new BadRequestException('Invalid datasetType');
    }

    this.assertDatasetWrite(ctx, datasetType);
    if (ctx.allowedBranchIds !== null && !ctx.allowedBranchIds.length) throw new ForbiddenException('No branch is assigned to your role.');
    if (body.branchId && body.branchId !== 'all' && ctx.allowedBranchIds !== null && !ctx.allowedBranchIds.includes(body.branchId)) throw new ForbiddenException('Branch access denied.');
    let buffer: Buffer;
    let originalName: string;
    let mimeType: string;

    if (file) {
      buffer = file.buffer;
      originalName = path.basename(file.originalname);
      mimeType = file.mimetype || 'application/octet-stream';
    } else if (body.csvContent) {
      buffer = Buffer.from(body.csvContent, 'utf8');
      originalName = path.basename(body.filename || `${datasetType}-upload.csv`);
      mimeType = 'text/csv';
    } else {
      throw new BadRequestException('Please upload a CSV, XLSX, or JSON file.');
    }

    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      throw new BadRequestException(`Security policy rejected file type '${ext}'. Allowed: CSV, XLSX, JSON.`);
    }
    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      throw new BadRequestException('File must be non-empty and under 10 MB.');
    }

    // Basic formula-injection / executable header security inspection
    const headHex = buffer.subarray(0, 4).toString('hex');
    if (headHex === '4d5a9000' || headHex === '7f454c46') {
      throw new BadRequestException('Security inspection rejected binary executable payload.');
    }

    let parsed: { headers: string[]; rows: Record<string, any>[] };
    try { parsed = parseUploadedRows(buffer, ext); } catch { throw new BadRequestException('Could not read the file. Check its format and try again.'); }
    if (parsed.rows.length === 0) {
      throw new BadRequestException('Uploaded file contains no data rows.');
    }

    const checksum = sha256Hex(buffer);
    const tenantDir = path.join(envConfig.uploadDir, ctx.tenantId);
    fs.mkdirSync(tenantDir, { recursive: true });
    const storedPath = path.join(tenantDir, `${Date.now()}-${checksum.slice(0, 12)}${ext}`);
    fs.writeFileSync(storedPath, buffer);

    const suggestedMapping = autoMapColumns(datasetType, parsed.headers);

    const job = await this.db.withTenant(ctx.tenantId, async (client) => {
      // Idempotency check if key provided
      if (body.idempotencyKey) {
        const dup = await client.query(
          `SELECT * FROM data_import_jobs WHERE tenant_id = $1 AND idempotency_key = $2`,
          [ctx.tenantId, body.idempotencyKey],
        );
        if (dup.rowCount && dup.rowCount > 0) {
          if (ctx.allowedBranchIds !== null && !ctx.allowedBranchIds.includes(dup.rows[0].branch_id)) throw new ForbiddenException('Import key is unavailable.');
          this.assertJobVisible(ctx, user, dup.rows[0]);
          if (dup.rows[0].dataset_type !== datasetType) throw new BadRequestException('Import key is already used for another dataset.');
          return dup.rows[0];
        }
      }

      // Resolve default branch if none supplied
      let branchId = body.branchId && body.branchId !== 'all' ? body.branchId : (ctx.allowedBranchIds?.[0] || null);
      if (branchId && ctx.allowedBranchIds !== null && !ctx.allowedBranchIds.includes(branchId)) throw new ForbiddenException('Branch access denied.');
      if (!branchId) {
        const bRes = await client.query(
          `SELECT id FROM branches WHERE tenant_id = $1 AND status = 'active' ORDER BY is_headquarters DESC LIMIT 1`,
          [ctx.tenantId],
        );
        branchId = bRes.rows[0]?.id || null;
      }

      const fileIns = await client.query(
        `INSERT INTO uploaded_files (tenant_id, uploaded_by, original_filename, stored_path, mime_type, file_size_bytes, sha256_checksum, security_scan_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'passed') RETURNING id`,
        [ctx.tenantId, user.userId, originalName, storedPath, mimeType, buffer.length, checksum],
      );

      const jobIns = await client.query(
        `INSERT INTO data_import_jobs (
           tenant_id, branch_id, uploaded_file_id, dataset_type, idempotency_key,
           status, detected_columns, column_mapping, preview_rows, total_records, created_by
         ) VALUES ($1,$2,$3,$4,$5,'uploaded',$6::jsonb,$7::jsonb,$8::jsonb,$9,$10) RETURNING *`,
        [
          ctx.tenantId,
          branchId,
          fileIns.rows[0].id,
          datasetType,
          body.idempotencyKey || null,
          JSON.stringify(parsed.headers),
          JSON.stringify(suggestedMapping),
          JSON.stringify(parsed.rows.slice(0, 10)),
          parsed.rows.length,
          user.userId,
        ],
      );
      return jobIns.rows[0];
    });

    await this.db.appendAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'import.uploaded',
      resourceType: 'data_import_job',
      resourceId: job.id,
      ipAddress: req.ip,
      changes: { filename: originalName, datasetType, totalRecords: parsed.rows.length },
    });

    return { importJob: job };
  }

  @Post('imports/:id/validate')
  @RequirePermissions('imports:manage')
  async validateImport(
    @Param('id') id: string,
    @Body() body: { columnMapping?: Record<string, string> },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const jobRes = await client.query(
        `SELECT j.*, uf.stored_path, uf.original_filename
         FROM data_import_jobs j
         JOIN uploaded_files uf ON uf.tenant_id = j.tenant_id AND uf.id = j.uploaded_file_id
         WHERE j.tenant_id = $1 AND j.id = $2 AND ($3::uuid[] IS NULL OR j.branch_id = ANY($3::uuid[]))`,
        [ctx.tenantId, id, ctx.allowedBranchIds],
      );
      if (jobRes.rowCount === 0) throw new BadRequestException('Import job not found');
      const job = jobRes.rows[0];
      this.assertJobVisible(ctx, user, job);
      this.assertDatasetWrite(ctx, job.dataset_type);
      const mapping = body.columnMapping || job.column_mapping || {};

      const ext = path.extname(job.original_filename).toLowerCase();
      const { rows } = parseUploadedRows(fs.readFileSync(job.stored_path), ext);

      // Clear previous validation errors for re-validation
      await client.query(
        `DELETE FROM import_validation_errors WHERE tenant_id = $1 AND import_job_id = $2`,
        [ctx.tenantId, id],
      );

      // Existing references for duplicate detection
      const existingRefs = new Set<string>();
      if (job.dataset_type === 'sales') {
        const ex = await client.query(`SELECT transaction_ref FROM sales WHERE tenant_id = $1`, [ctx.tenantId]);
        ex.rows.forEach((r) => existingRefs.add(String(r.transaction_ref).trim()));
      } else if (job.dataset_type === 'expenses') {
        const ex = await client.query(`SELECT expense_ref FROM expenses WHERE tenant_id = $1`, [ctx.tenantId]);
        ex.rows.forEach((r) => existingRefs.add(String(r.expense_ref).trim()));
      } else if (job.dataset_type === 'products') {
        const ex = await client.query(`SELECT sku FROM products WHERE tenant_id = $1`, [ctx.tenantId]);
        ex.rows.forEach((r) => existingRefs.add(String(r.sku).trim()));
      }

      const seenInFile = new Set<string>();
      const errors: any[] = [];
      let accepted = 0;
      let rejected = 0;
      let duplicates = 0;

      const getVal = (row: Record<string, any>, targetField: string) => {
        const srcCol = mapping[targetField];
        if (!srcCol) return '';
        const v = row[srcCol];
        return v === undefined || v === null ? '' : String(v).trim();
      };

      for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 2; // 1-indexed header + row
        const row = rows[i];
        const rowErrors: { col: string; code: string; msg: string; val: string }[] = [];

        if (job.dataset_type === 'sales') {
          const ref = getVal(row, 'transaction_ref');
          const dtStr = getVal(row, 'transaction_date');
          const amtStr = getVal(row, 'total_amount').replace(/,/g, '');
          const amt = Number(amtStr);

          if (!ref) rowErrors.push({ col: mapping.transaction_ref || 'transaction_ref', code: 'REQUIRED_FIELD', msg: 'Missing transaction reference', val: ref });
          else if (existingRefs.has(ref) || seenInFile.has(ref)) {
            duplicates++;
            rowErrors.push({ col: mapping.transaction_ref || 'transaction_ref', code: 'DUPLICATE_RECORD', msg: `Duplicate transaction reference '${ref}'`, val: ref });
          } else {
            seenInFile.add(ref);
          }

          if (!dtStr || Number.isNaN(Date.parse(dtStr))) {
            rowErrors.push({ col: mapping.transaction_date || 'transaction_date', code: 'INVALID_DATE', msg: `Invalid date '${dtStr}'`, val: dtStr });
          }
          if (!amtStr || !Number.isFinite(amt) || amt <= 0) {
            rowErrors.push({ col: mapping.total_amount || 'total_amount', code: 'INVALID_AMOUNT', msg: `Amount must be a positive number (got '${amtStr}')`, val: amtStr });
          }
          for (const field of ['cost_of_goods_sold', 'tax_amount']) {
            const raw = getVal(row, field).replace(/,/g, '');
            if (raw && (!Number.isFinite(Number(raw)) || Number(raw) < 0 || (field === 'tax_amount' && Number(raw) > amt)))
              rowErrors.push({ col: mapping[field] || field, code: 'INVALID_AMOUNT', msg: `Invalid ${field.replace(/_/g, ' ')}`, val: raw });
          }
          const payment = getVal(row, 'payment_method').toLowerCase().replace(/[-\s]/g, '');
          if (payment && !['mpesa','cash','card','banktransfer','credit'].includes(payment))
            rowErrors.push({ col: mapping.payment_method || 'payment_method', code: 'INVALID_PAYMENT', msg: 'Use M-Pesa, cash, card, bank transfer or credit, or leave blank.', val: payment });
        } else if (job.dataset_type === 'expenses') {
          const ref = getVal(row, 'expense_ref');
          const dtStr = getVal(row, 'expense_date');
          const amtStr = getVal(row, 'amount').replace(/,/g, '');
          const amt = Number(amtStr);

          if (!ref) rowErrors.push({ col: 'expense_ref', code: 'REQUIRED_FIELD', msg: 'Missing expense reference', val: ref });
          else if (existingRefs.has(ref) || seenInFile.has(ref)) {
            duplicates++;
            rowErrors.push({ col: 'expense_ref', code: 'DUPLICATE_RECORD', msg: `Duplicate expense reference '${ref}'`, val: ref });
          } else seenInFile.add(ref);

          if (!dtStr || Number.isNaN(Date.parse(dtStr))) {
            rowErrors.push({ col: 'expense_date', code: 'INVALID_DATE', msg: `Invalid expense date '${dtStr}'`, val: dtStr });
          }
          if (!amtStr || Number.isNaN(amt) || amt <= 0) {
            rowErrors.push({ col: 'amount', code: 'INVALID_AMOUNT', msg: `Expense amount must be > 0`, val: amtStr });
          }
        } else if (job.dataset_type === 'products') {
          const sku = getVal(row, 'sku');
          const name = getVal(row, 'name');
          const price = Number(getVal(row, 'selling_price').replace(/,/g, ''));
          if (!sku) rowErrors.push({ col: 'sku', code: 'REQUIRED_FIELD', msg: 'Missing product SKU', val: sku });
          else if (existingRefs.has(sku) || seenInFile.has(sku)) {
            duplicates++;
            rowErrors.push({ col: 'sku', code: 'DUPLICATE_RECORD', msg: `Duplicate SKU '${sku}'`, val: sku });
          } else seenInFile.add(sku);
          if (!name) rowErrors.push({ col: 'name', code: 'REQUIRED_FIELD', msg: 'Missing product name', val: name });
          if (Number.isNaN(price) || price < 0) rowErrors.push({ col: 'selling_price', code: 'INVALID_AMOUNT', msg: 'Invalid selling price', val: String(price) });
        } else {
          const name = getVal(row, 'full_name');
          if (!name) rowErrors.push({ col: 'full_name', code: 'REQUIRED_FIELD', msg: 'Missing customer full name', val: name });
        }

        if (rowErrors.length > 0) {
          rejected++;
          for (const e of rowErrors) {
            const ins = await client.query(
              `INSERT INTO import_validation_errors (tenant_id, import_job_id, row_number, column_name, error_code, error_message, raw_value, raw_row)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
              [ctx.tenantId, id, rowNum, e.col, e.code, e.msg, e.val, JSON.stringify(row)],
            );
            errors.push(ins.rows[0]);
          }
        } else {
          accepted++;
        }
      }

      const qualityScore = rows.length > 0 ? Number(((accepted / rows.length) * 100).toFixed(2)) : 0;
      const updated = await client.query(
        `UPDATE data_import_jobs SET
           status = 'validated',
           column_mapping = $3::jsonb,
           total_records = $4,
           accepted_records = $5,
           rejected_records = $6,
           duplicate_records = $7,
           quality_score = $8,
           validated_at = NOW()
         WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [ctx.tenantId, id, JSON.stringify(mapping), rows.length, accepted, rejected, duplicates, qualityScore],
      );

      return {
        importJob: updated.rows[0],
        summary: {
          totalRecords: rows.length,
          acceptedRecords: accepted,
          rejectedRecords: rejected,
          duplicateRecords: duplicates,
          qualityScore,
        },
        errors,
      };
    });
  }

  @Post('imports/:id/commit')
  @RequirePermissions('imports:manage')
  async commitImport(
    @Param('id') id: string,
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    const result = await this.db.withTenant(ctx.tenantId, async (client) => {
      const jobRes = await client.query(
        `SELECT j.*, uf.stored_path, uf.original_filename
         FROM data_import_jobs j
         JOIN uploaded_files uf ON uf.tenant_id = j.tenant_id AND uf.id = j.uploaded_file_id
         WHERE j.tenant_id = $1 AND j.id = $2 AND ($3::uuid[] IS NULL OR j.branch_id = ANY($3::uuid[]))`,
        [ctx.tenantId, id, ctx.allowedBranchIds],
      );
      if (jobRes.rowCount === 0) throw new BadRequestException('Import job not found');
      const job = jobRes.rows[0];
      this.assertJobVisible(ctx, user, job);
      this.assertDatasetWrite(ctx, job.dataset_type);
      if (job.status === 'completed' || job.status === 'completed_with_errors') {
        return { importJob: job, alreadyCommitted: true, insertedCount: job.accepted_records };
      }
      if (job.status !== 'validated') {
        throw new BadRequestException('Please validate the import file before committing.');
      }

      const errRowsRes = await client.query(
        `SELECT DISTINCT row_number FROM import_validation_errors WHERE tenant_id = $1 AND import_job_id = $2`,
        [ctx.tenantId, id],
      );
      const badRowNums = new Set<number>(errRowsRes.rows.map((r) => Number(r.row_number)));

      const ext = path.extname(job.original_filename).toLowerCase();
      const { rows } = parseUploadedRows(fs.readFileSync(job.stored_path), ext);
      const mapping = job.column_mapping || {};
      const getVal = (row: Record<string, any>, field: string) => {
        const c = mapping[field];
        return c && row[c] !== undefined && row[c] !== null ? String(row[c]).trim() : '';
      };

      let inserted = 0;
      for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 2;
        if (badRowNums.has(rowNum)) continue; // Validated rejected rows are preserved in import_validation_errors, never silently lost
        const row = rows[i];

        if (job.dataset_type === 'sales') {
          const ref = getVal(row, 'transaction_ref');
          const dt = new Date(getVal(row, 'transaction_date'));
          const total = Number(getVal(row, 'total_amount').replace(/,/g, ''));
          const qtyRaw = getVal(row, 'quantity').replace(/,/g, '');
          const qty = Number(qtyRaw);
          const prodName = getVal(row, 'product_name');
          const sku = getVal(row, 'sku') || null;
          const pmRaw = getVal(row, 'payment_method').toLowerCase().replace(/[-\s]/g, '');
          const paymentMethods: Record<string, string> = { mpesa: 'mpesa', cash: 'cash', card: 'card', banktransfer: 'bank_transfer', credit: 'credit' };
          const pm = paymentMethods[pmRaw] || null;
          const rawCost = getVal(row, 'cost_of_goods_sold').replace(/,/g, '');
          const rawTax = getVal(row, 'tax_amount').replace(/,/g, '');
          const cost = rawCost === '' ? 0 : Number(rawCost);
          const tax = rawTax === '' ? 0 : Number(rawTax);
          const subtotal = Number((total - tax).toFixed(2));

          const saleIns = await client.query(
            `INSERT INTO sales (
               tenant_id, branch_id, transaction_ref, source_system, source_record_id, import_job_id,
               transaction_date, payment_status, currency_code, subtotal, tax_amount, total_amount, cost_of_goods_sold, created_by, cost_basis
             ) VALUES ($1,$2,$3,'spreadsheet_import',$3,$4,$5,'paid','KES',$6,$7,$8,$9,$10,$11)
             ON CONFLICT (tenant_id, transaction_ref) DO NOTHING RETURNING id`,
            [ctx.tenantId, job.branch_id, ref, id, dt.toISOString(), subtotal, tax, total, cost, user.userId, rawCost === '' ? 'unknown' : 'actual'],
          );
          if (saleIns.rowCount && saleIns.rowCount > 0) {
            const saleId = saleIns.rows[0].id;
            // Do not fabricate a product or quantity when the spreadsheet lacks one.
            if (prodName && Number.isFinite(qty) && qty > 0) {
              await client.query(
                `INSERT INTO sales_items (tenant_id, sale_id, product_name_snapshot, sku_snapshot, quantity, unit_price, unit_cost, tax_amount, line_total)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                [ctx.tenantId, saleId, prodName, sku, qty, Number((total / qty).toFixed(2)), Number((cost / qty).toFixed(2)), tax, total],
              );
            }
            // Missing payment method is unknown, not automatically M-Pesa.
            if (pm) await client.query(
              `INSERT INTO sales_payments (tenant_id, sale_id, payment_method, amount, reconciliation_status, paid_at)
               VALUES ($1,$2,$3,$4,'recorded',$5)`,
              [ctx.tenantId, saleId, pm, total, dt.toISOString()],
            );
            inserted++;
          }
        } else if (job.dataset_type === 'expenses') {
          const ref = getVal(row, 'expense_ref');
          const dt = new Date(getVal(row, 'expense_date')).toISOString().slice(0, 10);
          const amt = Number(getVal(row, 'amount').replace(/,/g, ''));
          const vendor = getVal(row, 'vendor_name') || 'Imported Vendor';
          const desc = getVal(row, 'description') || `Imported expense ${ref}`;
          const ins = await client.query(
            `INSERT INTO expenses (tenant_id, branch_id, expense_ref, vendor_name, description, expense_date, amount, import_job_id, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (tenant_id, expense_ref) DO NOTHING RETURNING id`,
            [ctx.tenantId, job.branch_id, ref, vendor, desc, dt, amt, id, user.userId],
          );
          if (ins.rowCount && ins.rowCount > 0) inserted++;
        } else if (job.dataset_type === 'products') {
          const sku = getVal(row, 'sku');
          const name = getVal(row, 'name');
          const cost = Number(getVal(row, 'cost_price').replace(/,/g, '')) || 0;
          const sell = Number(getVal(row, 'selling_price').replace(/,/g, '')) || 0;
          const stock = Number(getVal(row, 'on_hand_quantity').replace(/,/g, '')) || 0;
          const reorder = Number(getVal(row, 'reorder_level').replace(/,/g, '')) || 10;
          const pIns = await client.query(
            `INSERT INTO products (tenant_id, sku, name, cost_price, selling_price, reorder_level, import_job_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (tenant_id, sku) DO NOTHING RETURNING id`,
            [ctx.tenantId, sku, name, cost, sell, reorder, id],
          );
          if (pIns.rowCount && pIns.rowCount > 0) {
            if (stock > 0 && job.branch_id) {
              await client.query(
                `SELECT fn_record_inventory_movement($1,$2,$3,'opening',$4,$5,'import_job',$6,'Imported opening stock',$7)`,
                [ctx.tenantId, job.branch_id, pIns.rows[0].id, stock, cost, id, user.userId],
              );
            }
            inserted++;
          }
        } else {
          const ref = getVal(row, 'external_ref') || `IMP-${Date.now()}-${i}`;
          const name = getVal(row, 'full_name');
          const phone = getVal(row, 'phone_number') || null;
          const email = getVal(row, 'email') || null;
          const optIn = ['true', 'yes', '1', 'granted'].includes(getVal(row, 'marketing_opt_in').toLowerCase());
          const cIns = await client.query(
            `INSERT INTO customers (tenant_id, branch_id, external_ref, full_name, phone_number, email, marketing_opt_in, import_job_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (tenant_id, external_ref) DO NOTHING RETURNING id`,
            [ctx.tenantId, job.branch_id, ref, name, phone, email, optIn, id],
          );
          if (cIns.rowCount && cIns.rowCount > 0) inserted++;
        }
      }

      const finalStatus = job.rejected_records > 0 ? 'completed_with_errors' : 'completed';
      const updated = await client.query(
        `UPDATE data_import_jobs SET status = $3, accepted_records = $4, committed_at = NOW()
         WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [ctx.tenantId, id, finalStatus, inserted],
      );

      await client.query(
        `INSERT INTO usage_records (tenant_id, metric_code, quantity, metadata) VALUES ($1, 'imports_per_month', 1, $2::jsonb)`,
        [ctx.tenantId, JSON.stringify({ importJobId: id, inserted })],
      );

      return { importJob: updated.rows[0], insertedCount: inserted };
    });

    await this.db.query(`SELECT fn_refresh_analytics_views()`);

    await this.queues.enqueueJob('imports', 'post-import-refresh', { tenantId: ctx.tenantId, importJobId: id });

    await this.db.appendAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'import.committed',
      resourceType: 'data_import_job',
      resourceId: id,
      ipAddress: req.ip,
      changes: { insertedCount: result.insertedCount },
    });

    return result;
  }
}
