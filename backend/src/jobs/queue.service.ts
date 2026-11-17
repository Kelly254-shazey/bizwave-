import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { envConfig } from '../config/env.config';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private redis: Redis | null = null;
  private importQueue: Queue | null = null;
  private reportQueue: Queue | null = null;
  private forecastQueue: Queue | null = null;
  private redisReady = false;

  constructor() {
    try {
      this.redis = new Redis(envConfig.redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        lazyConnect: true,
      });
      this.redis
        .connect()
        .then(() => {
          this.redisReady = true;
          const connection = { url: envConfig.redisUrl };
          this.importQueue = new Queue('bizwave-imports', { connection });
          this.reportQueue = new Queue('bizwave-reports', { connection });
          this.forecastQueue = new Queue('bizwave-forecasts', { connection });
        })
        .catch(() => {
          this.redisReady = false;
        });
    } catch {
      this.redisReady = false;
    }
  }

  async onModuleDestroy() {
    await Promise.allSettled([
      this.importQueue?.close(),
      this.reportQueue?.close(),
      this.forecastQueue?.close(),
      this.redis?.quit(),
    ]);
  }

  async enqueueJob(
    queueName: 'imports' | 'reports' | 'forecasts',
    jobName: string,
    data: Record<string, any>,
  ): Promise<{ queued: boolean; jobId?: string }> {
    const q =
      queueName === 'imports'
        ? this.importQueue
        : queueName === 'reports'
          ? this.reportQueue
          : this.forecastQueue;
    if (!q || !this.redisReady) {
      return { queued: false };
    }
    const job = await q.add(jobName, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });
    return { queued: true, jobId: job.id };
  }

  async getHealth(): Promise<{ ok: boolean; queues: Record<string, any> }> {
    if (!this.redis || !this.redisReady) {
      return { ok: false, queues: {} };
    }
    try {
      const pong = await this.redis.ping();
      const [imp, rep, fc] = await Promise.all([
        this.importQueue?.getJobCounts('waiting', 'active', 'completed', 'failed'),
        this.reportQueue?.getJobCounts('waiting', 'active', 'completed', 'failed'),
        this.forecastQueue?.getJobCounts('waiting', 'active', 'completed', 'failed'),
      ]);
      return {
        ok: pong === 'PONG',
        queues: {
          imports: imp || {},
          reports: rep || {},
          forecasts: fc || {},
        },
      };
    } catch {
      return { ok: false, queues: {} };
    }
  }
}
