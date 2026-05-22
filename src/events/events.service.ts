import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { Event, EventMediaAsset } from './schemas/event.schema';

type EventStatus = 'draft' | 'published';

type EventMediaInput = {
  url: string;
  publicId: string;
  resourceType: 'image' | 'video' | 'raw';
  caption?: string;
  title?: string;
};

type EventQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  filter?: string;
};

@Injectable()
export class EventsService {
  constructor(
    @InjectModel(Event.name) private readonly eventModel: Model<Event>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  private normalizeDate(value?: string | Date) {
    if (!value) {
      return undefined;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date value supplied');
    }

    return date;
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'event';
  }

  private async createUniqueSlug(title: string) {
    const baseSlug = this.slugify(title);
    let slug = baseSlug;
    let suffix = 1;

    while (await this.eventModel.exists({ slug })) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return slug;
  }

  private mapUploadedFiles(files?: Express.Multer.File[]): Promise<EventMediaInput[]> {
    if (!files?.length) {
      return Promise.resolve([]);
    }

    return Promise.all(
      files.map(async (file) => {
        const uploaded = await this.cloudinaryService.uploadImage(file, 'yes-time/events');
        return {
          url: uploaded.secure_url,
          publicId: uploaded.public_id,
          resourceType: (uploaded.resource_type as 'image' | 'video' | 'raw') || 'image',
        };
      }),
    );
  }

  private isVisibleNow(event: Event) {
    const now = new Date();
    const publishAt = event.publishAt ? new Date(event.publishAt) : null;
    const expiresAt = event.expiresAt ? new Date(event.expiresAt) : null;

    if (event.status !== 'published') {
      return false;
    }

    if (publishAt && publishAt.getTime() > now.getTime()) {
      return false;
    }

    if (expiresAt && expiresAt.getTime() < now.getTime()) {
      return false;
    }

    return true;
  }

  private async paginate(query: EventQuery, filter: Record<string, any> = {}) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(query.limit || 12)));
    const skip = (page - 1) * limit;

    if (query.search?.trim()) {
      const search = query.search.trim();
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.eventModel.find(filter).sort({ eventDate: -1, createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.eventModel.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async createEvent(
    dto: any,
    coverImage?: Express.Multer.File,
    mediaFiles?: Express.Multer.File[],
    createdBy?: string,
  ) {
    if (!coverImage) {
      throw new BadRequestException('Cover image is required');
    }

    if (!dto?.title?.trim()) {
      throw new BadRequestException('Title is required');
    }

    if (!dto?.description?.trim()) {
      throw new BadRequestException('Description is required');
    }

    const eventDate = this.normalizeDate(dto.eventDate);
    if (!eventDate) {
      throw new BadRequestException('Event date is required');
    }

    const publishAt = this.normalizeDate(dto.publishAt);
    const expiresAt = this.normalizeDate(dto.expiresAt);
    const slug = await this.createUniqueSlug(dto.title.trim());
    const coverUpload = await this.cloudinaryService.uploadImage(coverImage, 'yes-time/events');
    const uploadedMedia = await this.mapUploadedFiles(mediaFiles);

    const event = await this.eventModel.create({
      title: dto.title.trim(),
      slug,
      description: dto.description.trim(),
      coverImage: {
        url: coverUpload.secure_url,
        publicId: coverUpload.public_id,
        resourceType: (coverUpload.resource_type as 'image' | 'video' | 'raw') || 'image',
      },
      media: uploadedMedia,
      eventDate,
      location: dto.location?.trim() || undefined,
      status: (dto.status === 'published' ? 'published' : 'draft') as EventStatus,
      publishAt,
      expiresAt,
      createdBy,
    });

    return event;
  }

  async updateEvent(id: string, dto: any, coverImage?: Express.Multer.File, mediaFiles?: Express.Multer.File[]) {
    const event = await this.eventModel.findById(id);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (dto?.title?.trim()) {
      event.title = dto.title.trim();
    }

    if (dto?.description?.trim()) {
      event.description = dto.description.trim();
    }

    const eventDate = this.normalizeDate(dto?.eventDate);
    if (eventDate) {
      event.eventDate = eventDate;
    }

    if (dto?.location !== undefined) {
      event.location = dto.location?.trim() || undefined;
    }

    if (dto?.status === 'draft' || dto?.status === 'published') {
      event.status = dto.status;
    }

    const publishAt = this.normalizeDate(dto?.publishAt);
    if (dto?.publishAt !== undefined) {
      event.publishAt = publishAt;
    }

    const expiresAt = this.normalizeDate(dto?.expiresAt);
    if (dto?.expiresAt !== undefined) {
      event.expiresAt = expiresAt;
    }

    if (coverImage) {
      if (event.coverImage?.publicId) {
        await this.cloudinaryService.deleteAsset(event.coverImage.publicId, event.coverImage.resourceType as 'image' | 'video' | 'raw');
      }

      const coverUpload = await this.cloudinaryService.uploadImage(coverImage, 'yes-time/events');
      event.coverImage = {
        url: coverUpload.secure_url,
        publicId: coverUpload.public_id,
        resourceType: (coverUpload.resource_type as 'image' | 'video' | 'raw') || 'image',
      };
    }

    const uploadedMedia = await this.mapUploadedFiles(mediaFiles);
    if (uploadedMedia.length) {
      event.media = [...(event.media || []), ...uploadedMedia] as EventMediaAsset[];
    }

    await event.save();
    return event;
  }

  async deleteEvent(id: string) {
    const event = await this.eventModel.findById(id);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const assets = [event.coverImage, ...(event.media || [])].filter(Boolean);
    await Promise.allSettled(
      assets.map((asset) => this.cloudinaryService.deleteAsset(asset.publicId, asset.resourceType as 'image' | 'video' | 'raw')),
    );

    await event.deleteOne();
    return { message: 'Event deleted successfully' };
  }

  async togglePublishStatus(id: string) {
    const event = await this.eventModel.findById(id);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    event.status = event.status === 'published' ? 'draft' : 'published';
    if (event.status === 'published' && !event.publishAt) {
      event.publishAt = new Date();
    }

    await event.save();
    return event;
  }

  async listPublicEvents(query: EventQuery) {
    const now = new Date();
    const filter: Record<string, any> = {
      status: 'published',
      $and: [
        { $or: [{ publishAt: null }, { publishAt: { $lte: now } }] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }] },
      ],
    };

    if (query.filter === 'upcoming') {
      filter.eventDate = { $gte: now };
    } else if (query.filter === 'past') {
      filter.eventDate = { $lt: now };
    }

    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(query.limit || 12)));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.eventModel.find(filter).sort({ eventDate: query.filter === 'past' ? -1 : 1, createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.eventModel.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async listAdminEvents(query: EventQuery) {
    const filter: Record<string, any> = {};
    if (query.status === 'draft' || query.status === 'published') {
      filter.status = query.status;
    }

    return this.paginate(query, filter);
  }

  async getVisibleEvent(identifier: string) {
    const event = await this.findByIdentifier(identifier);
    if (!event || !this.isVisibleNow(event)) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  async getAdminEvent(identifier: string) {
    const event = await this.findByIdentifier(identifier);
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  private async findByIdentifier(identifier: string) {
    const isObjectId = /^[a-f\d]{24}$/i.test(identifier);
    if (isObjectId) {
      const byId = await this.eventModel.findById(identifier).exec();
      if (byId) {
        return byId;
      }
    }

    return this.eventModel.findOne({ slug: identifier }).exec();
  }
}