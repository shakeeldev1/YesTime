import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { UsersModule } from 'src/users/users.module';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';

@Module({
  imports: [UsersModule, CloudinaryModule],
  controllers: [ProfileController],
  providers: [ProfileService]
})
export class ProfileModule {}
