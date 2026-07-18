import { Controller, Get, Req, UseGuards, Put, Delete, Body, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { UsersService } from 'src/users/users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';

@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
    constructor(
        private userService: UsersService,
        private cloudinaryService: CloudinaryService
    ){}

    @Get('me')
    getProfile(@Req() req){
        return this.userService.findById(req?.user?.userId);
    }

    @Put('update')
    @UseInterceptors(FileInterceptor('profileImage'))
    async updateProfile(
        @Req() req,
        @Body() dto: UpdateProfileDto,
        @UploadedFile() file?: Express.Multer.File
    ){
        let profileImageUrl: string | undefined;
        
        // Upload profile image to Cloudinary if provided
        if (file) {
            const uploadResult = await this.cloudinaryService.uploadImage(file, 'yes-time/profile-images');
            profileImageUrl = uploadResult.secure_url;
        }
        
        const updateData = {
            ...dto,
            ...(profileImageUrl && { profileImage: profileImageUrl })
        };
        
        return this.userService.updateProfile(req.user.userId, updateData);
    }

    @Delete('delete-account')
    async deleteAccount(@Req() req) {
        const deleted = await this.userService.deleteUser(req.user.userId);
        if (!deleted) throw new BadRequestException('User not found');
        return { message: 'Account deleted successfully' };
    }
}
