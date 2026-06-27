import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { MASTER_DATA_CONTROLLERS } from './api/master-data.controllers';
import { MasterDataService } from './application/master-data.service';
import { MasterDataStore } from './application/master-data.store';
import { PostgresMasterDataRepository } from './persistence/postgres-master-data.repository';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule],
  controllers: [...MASTER_DATA_CONTROLLERS],
  providers: [
    MasterDataService,
    {
      provide: MasterDataStore,
      useClass: PostgresMasterDataRepository,
    },
  ],
  exports: [MasterDataService],
})
export class MasterDataModule {}
