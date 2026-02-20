import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './schemas/user.schema';
import { Model } from 'mongoose';

@Injectable()
export class UsersService {
    constructor(@InjectModel(User.name) private userModel: Model<User>) { }

    createUser(userData: Partial<User>): Promise<User> {
        const newUser = new this.userModel(userData);
        return newUser.save();
    }

    findByPhone(phone: string): Promise<User | null> {
        return this.userModel.findOne({ phone }).exec();
    }

    findById(id: string): Promise<User | null> {
        return this.userModel.findById(id).select('-password').exec();
    }

    findByIdWithPassword(id: string): Promise<User | null> {
        return this.userModel.findById(id).exec();
    }

    async updatePassword(userId: string, hashedPassword: string): Promise<User | null> {
        return this.userModel.findByIdAndUpdate(userId, { password: hashedPassword }, { new: true }).select('-password').exec();
    }

    async updateRefreshToken(userId: string, data: { refreshToken: string | null }): Promise<User | null> {
        return this.userModel.findByIdAndUpdate(userId, { refreshToken: data.refreshToken }, { new: true }).exec();
    }

    async updateProfile(userId: string, updateData: Partial<User>): Promise<User | null> {
        return this.userModel.findByIdAndUpdate(
            userId, 
            { $set: updateData }, 
            { new: true }
        ).select('-password').exec();
    }
}
