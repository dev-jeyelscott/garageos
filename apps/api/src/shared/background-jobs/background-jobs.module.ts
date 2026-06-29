import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { BackgroundJobStore } from './background-job.store';
import { BackgroundJobService } from './background-job.service';
import { PostgresBackgroundJobRepository } from './postgres-background-job.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    BackgroundJobService,
    {
      provide: BackgroundJobStore,
      useClass: PostgresBackgroundJobRepository,
    },
  ],
  exports: [BackgroundJobService],
})
export class BackgroundJobsModule {}
