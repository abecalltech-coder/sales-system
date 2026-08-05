import { Controller, Get, Query } from '@nestjs/common';
import { SummaryService } from './summary.service';
import { SummaryQueryDto } from './dto/summary-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@Controller('summary')
export class SummaryController {
  constructor(private readonly summaryService: SummaryService) {}

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Get('kpi')
  kpi(@Query() query: SummaryQueryDto) {
    return this.summaryService.kpi(query);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Get('by-department')
  byDepartment(@Query() query: SummaryQueryDto) {
    return this.summaryService.byDepartment(query);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Get('by-team')
  byTeam(@Query() query: SummaryQueryDto) {
    return this.summaryService.byTeam(query);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Get('by-user')
  byUser(@Query() query: SummaryQueryDto) {
    return this.summaryService.byUser(query);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Get('timeseries')
  timeseries(@Query() query: SummaryQueryDto) {
    return this.summaryService.timeseries(query);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Get('funnel')
  funnel(@Query() query: SummaryQueryDto) {
    return this.summaryService.funnel(query);
  }

  @RequirePermissions({ resource: 'visit', action: 'view' })
  @Get('visits')
  visits(@Query() query: SummaryQueryDto) {
    return this.summaryService.visits(query);
  }
}
