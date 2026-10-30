import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import config from './mikro-orm.config.js';
import { ProcessTransactionService } from './wagering/process-transaction.service.js';
import { WagerTransactionRepository } from './wagering/wager-transaction.repository.js';
import { CreateWalletService } from './wallets/create-wallet.service.js';
import { LedgerRepository } from './wallets/ledger.repository.js';
import { WalletRepository } from './wallets/wallet.repository.js';
import { WalletsController } from './wallets/wallets.controller.js';
import { OutboxRepository } from './outbox/outbox.repository.js';
import { APP_FILTER } from '@nestjs/core';
import { DomainExceptionFilter } from './common/domain-exception.filter.js';
import { WageringController } from './wagering/wagering.controller.js';
import { GetWalletService } from './wallets/get-wallet.service.js';
import { HealthController } from './health/health.controller.js';
import { GetTransactionService } from './wagering/get-transaction.service.js';


export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    MikroOrmModule.forRoot(config),
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'wagering-processor',
    }),
  ],
  controllers: [AppController, WalletsController, WageringController, HealthController],
  providers: [
    AppService,
    CreateWalletService,
    ProcessTransactionService,
    WalletRepository,
    WagerTransactionRepository,
    LedgerRepository,
    OutboxRepository,
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    GetWalletService,
    GetTransactionService,
  ],
})
export class AppModule { }