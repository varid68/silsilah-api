import { Body, Controller, Get, Header, Param, Patch, Query } from '@nestjs/common';
import { AdminMembersService } from './admin-members.service';
import { memberFilter, parsePatch } from './admin-member-validation';
import { AdminRoute } from './read-access.guard';

@AdminRoute(true)
@Controller('admin/members')
export class AdminMembersController {
  constructor(private readonly members: AdminMembersService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Query() query: Record<string, unknown>) {
    const { q, generation, page } = memberFilter(query);
    return this.members.list(q, generation, page);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  get(@Param('id') id: string) {
    return this.members.get(id);
  }

  @Patch(':id')
  @Header('Cache-Control', 'private, no-store')
  save(@Param('id') id: string, @Body() body: unknown) {
    return this.members.save(id, parsePatch(body));
  }
}
