import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from './users/users.module';
import { ProfileModule } from './profile/profile.module';

@Module({
  imports: [MongooseModule.forRoot('mongodb://localhost/yes-time'), AuthModule, UsersModule, ProfileModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
