import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class MemberQueryDto {
  @IsOptional() @IsString() @MaxLength(120)
  q?: string;

  @IsOptional() @IsString() @MaxLength(150)
  branchId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12)
  generation?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
}
