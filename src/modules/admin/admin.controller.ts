import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CreateApplicationDto, ApplicationResponseDto } from './dto/application.dto';

@ApiTags('HENU Administration Panel')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('apps')
  @ApiOperation({ summary: 'List all registered applications (admin paginated)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({ status: 200, description: 'Application list returned' })
  async listApps(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.adminService.listApplications(parseInt(page, 10) || 1, parseInt(limit, 10) || 20);
  }

  @Get('apps/:id')
  @ApiOperation({ summary: 'Retrieve full application configuration by ID' })
  @ApiResponse({ status: 200, description: 'Application found', type: ApplicationResponseDto })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async getAppById(@Param('id') id: string): Promise<ApplicationResponseDto> {
    return this.adminService.getApplicationById(id);
  }

  @Post('apps')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new application' })
  @ApiResponse({ status: 201, description: 'Application registered', type: ApplicationResponseDto })
  @ApiResponse({ status: 409, description: 'Application slug conflict' })
  async createApp(@Body() dto: CreateApplicationDto): Promise<ApplicationResponseDto> {
    return this.adminService.createApplication(dto);
  }
}
