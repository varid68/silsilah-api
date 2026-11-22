import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { FamilyService } from './family.service';
import { MemberQueryDto } from './member-query.dto';

@Controller()
export class FamilyController {
  constructor(private readonly family: FamilyService) {}

  @Get('family')
  @Header('Cache-Control', 'private, max-age=30')
  summary() { return this.family.summary(); }

  @Get('tree')
  @Header('Cache-Control', 'private, max-age=30')
  tree() { return this.family.graph(); }

  @Get('tree/:personId')
  focus(@Param('personId') id: string) { return this.family.focus(id); }

  @Get('members')
  list(@Query() query: MemberQueryDto) { return this.family.list(query); }

  @Get('members/:personId')
  detail(@Param('personId') id: string) { return this.family.focus(id); }
}
