import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { EventsService } from './events.service';

const eventUploadLimits = {
  limits: {
    fileSize: 200 * 1024 * 1024,
  },
};

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  async getPublicEvents(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('filter') filter?: string,
  ) {
    return this.eventsService.listPublicEvents({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      filter,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('admin')
  async getAdminEvents(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.eventsService.listAdminEvents({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
      status,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('admin/:identifier')
  async getAdminEvent(@Param('identifier') identifier: string) {
    return this.eventsService.getAdminEvent(identifier);
  }

  @Get(':identifier')
  async getPublicEvent(@Param('identifier') identifier: string) {
    return this.eventsService.getVisibleEvent(identifier);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'coverImage', maxCount: 1 },
      { name: 'mediaFiles', maxCount: 20 },
    ], eventUploadLimits),
  )
  async createEvent(
    @Request() req,
    @Body() body: any,
    @UploadedFiles()
    files: {
      coverImage?: Express.Multer.File[];
      mediaFiles?: Express.Multer.File[];
    },
  ) {
    return this.eventsService.createEvent(
      body,
      files?.coverImage?.[0],
      files?.mediaFiles,
      req.user.userId,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Put(':id')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'coverImage', maxCount: 1 },
      { name: 'mediaFiles', maxCount: 20 },
    ], eventUploadLimits),
  )
  async updateEvent(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles()
    files: {
      coverImage?: Express.Multer.File[];
      mediaFiles?: Express.Multer.File[];
    },
  ) {
    return this.eventsService.updateEvent(id, body, files?.coverImage?.[0], files?.mediaFiles);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id/toggle-publish')
  async togglePublish(@Param('id') id: string) {
    return this.eventsService.togglePublishStatus(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete(':id')
  async deleteEvent(@Param('id') id: string) {
    return this.eventsService.deleteEvent(id);
  }
}