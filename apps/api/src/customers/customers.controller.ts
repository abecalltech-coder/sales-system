import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { ListQueryDto } from '../common/dto/list-query.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @RequirePermissions({ resource: 'customer', action: 'view' })
  @Get()
  list(@Query() query: ListQueryDto) {
    return this.customersService.list(query);
  }

  @RequirePermissions({ resource: 'customer', action: 'view' })
  @Get('duplicates')
  duplicates(@Query('phone') phone?: string, @Query('email') email?: string, @Query('corporateName') corporateName?: string) {
    return this.customersService.findDuplicateCandidates({ phone, email, corporateName });
  }

  @RequirePermissions({ resource: 'customer', action: 'view' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @RequirePermissions({ resource: 'customer', action: 'create' })
  @Post()
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthenticatedUser) {
    return this.customersService.create(dto, user.id);
  }

  @RequirePermissions({ resource: 'customer', action: 'edit' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @CurrentUser() user: AuthenticatedUser) {
    return this.customersService.update(id, dto, user.id);
  }

  @RequirePermissions({ resource: 'customer', action: 'delete' })
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.customersService.softDelete(id, user.id);
  }
}
