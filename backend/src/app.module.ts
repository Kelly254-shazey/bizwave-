import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { QueueService } from './jobs/queue.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TenantRbacGuard } from './guards/tenant-rbac.guard';
import { AuthService } from './modules/auth/auth.service';
import { AuthController } from './modules/auth/auth.controller';
import { TenantsController } from './modules/tenants/tenants.controller';
import { BranchesController } from './modules/branches/branches.controller';
import { UsersRolesController } from './modules/users/users-roles.controller';
import { ImportsController } from './modules/imports/imports.controller';
import { SalesController } from './modules/sales/sales.controller';
import { InventoryController } from './modules/inventory/inventory.controller';
import { FinanceController } from './modules/finance/finance.controller';
import { CustomersController } from './modules/customers/customers.controller';
import { AnalyticsController } from './modules/analytics/analytics.controller';
import { ReportsController } from './modules/reports/reports.controller';
import { ForecastingController } from './modules/forecasting/forecasting.controller';
import { AiController } from './modules/ai/ai.controller';
import { MsingiLanguageService } from './modules/ai/msingi.service';
import { CommunicationsController } from './modules/communications/communications.controller';
import { BusinessNetworkController } from './modules/communications/business-network.controller';
import { SubscriptionsController } from './modules/subscriptions/subscriptions.controller';
import { AuditController } from './modules/audit/audit.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [
    AuthController,
    TenantsController,
    BranchesController,
    UsersRolesController,
    ImportsController,
    SalesController,
    InventoryController,
    FinanceController,
    CustomersController,
    AnalyticsController,
    ReportsController,
    ForecastingController,
    AiController,
    CommunicationsController,
    BusinessNetworkController,
    SubscriptionsController,
    AuditController,
  ],
  providers: [
    AuthService,
    QueueService,
    MsingiLanguageService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantRbacGuard },
  ],
})
export class AppModule {}
