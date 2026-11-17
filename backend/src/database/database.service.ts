import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { envConfig } from '../config/env.config';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Wraps a pg PoolClient so concurrent Promise.all() calls inside a single
 * transaction execute sequentially on that wire connection — eliminating pg@9
 * concurrent-client deprecation warnings and subtle protocol race conditions.
 */
function createSerializedClient(client: PoolClient): PoolClient {
  let chain: Promise<any> = Promise.resolve();
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'query') {
        return (...args: any[]) => {
          const next = chain.then(() => (target.query as any)(...args));
          chain = next.catch(() => {});
          return next;
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: envConfig.databaseUrl,
      max: 25,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    // Prevent idle PG disconnects or failovers from crashing the Node process
    this.pool.on('error', (err) => {
      console.warn('[DatabaseService] Idle pool client error (auto-recovering):', err.message);
    });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  /**
   * Non-tenant system query (auth tables, global reference catalogs, public contact form).
   */
  async query<T extends QueryResultRow = any>(text: string, params: any[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  /**
   * Transaction-scoped PostgreSQL RLS execution for a verified tenant.
   * Uses `SET LOCAL app.tenant_id` inside BEGIN..COMMIT so pooled connections never leak tenant identity.
   */
  async withTenant<T>(
    tenantId: string,
    fn: (client: PoolClient) => Promise<T>,
    options: { isPlatformAdmin?: boolean } = {},
  ): Promise<T> {
    if (!UUID_REGEX.test(tenantId)) {
      throw new Error('Invalid tenant UUID supplied to RLS context');
    }
    const rawClient = await this.pool.connect();
    try {
      await rawClient.query('BEGIN');
      await rawClient.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      await rawClient.query(`SELECT set_config('app.is_platform_admin', $1, true)`, [
        options.isPlatformAdmin ? 'true' : 'false',
      ]);
      const safeClient = createSerializedClient(rawClient);
      const result = await fn(safeClient);
      await rawClient.query('COMMIT');
      return result;
    } catch (err) {
      await rawClient.query('ROLLBACK');
      throw err;
    } finally {
      rawClient.release();
    }
  }

  /**
   * Explicit cross-tenant transaction for audited platform administration or registration bootstrapping.
   */
  async withSystemTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const rawClient = await this.pool.connect();
    try {
      await rawClient.query('BEGIN');
      await rawClient.query(`SELECT set_config('app.is_platform_admin', 'true', true)`);
      const safeClient = createSerializedClient(rawClient);
      const result = await fn(safeClient);
      await rawClient.query('COMMIT');
      return result;
    } catch (err) {
      await rawClient.query('ROLLBACK');
      throw err;
    } finally {
      rawClient.release();
    }
  }

  async appendAuditLog(params: {
    tenantId?: string | null;
    actorUserId?: string | null;
    actorEmail?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    changes?: Record<string, any>;
  }): Promise<void> {
    try {
      await this.pool.query(
        `SELECT fn_append_audit_log($1::uuid, $2::uuid, $3::varchar, $4::varchar, $5::varchar, $6::varchar, $7::inet, $8::text, $9::jsonb)`,
        [
          params.tenantId || null,
          params.actorUserId || null,
          params.actorEmail || null,
          params.action,
          params.resourceType,
          params.resourceId || null,
          params.ipAddress || null,
          params.userAgent || null,
          JSON.stringify(params.changes || {}),
        ],
      );
    } catch {
      // Never leak audit DB errors to mask caller exception
    }
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    await this.pool.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - start };
  }
}
