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

    findByEmail(email: string): Promise<User | null> {
        return this.userModel.findOne({ email }).exec();
    }

    findById(id: string): Promise<User | null> {
        return this.userModel.findById(id).select('-password').exec();
    }

    findByIdWithPassword(id: string): Promise<User | null> {
        return this.userModel.findById(id).exec();
    }

    async findAll(query?: { role?: string; search?: string; limit?: number }): Promise<User[]> {
        const filter: any = {};
        if (query?.role) filter.role = query.role;
        if (query?.search) {
            filter.$or = [
                { name: { $regex: query.search, $options: 'i' } },
                { phone: { $regex: query.search, $options: 'i' } },
                { email: { $regex: query.search, $options: 'i' } },
            ];
        }
        const users = await this.userModel
            .find(filter)
            .select('-password -refreshToken -otp')
            .sort({ createdAt: -1 })
            .limit(query?.limit || 200)
            .exec();

        const usersWithReferralCount = await Promise.all(
            users.map(async (user) => {
                const referralCount = await this.userModel.countDocuments({ referredBy: user._id });
                return {
                    ...(user.toObject() as any),
                    referralCount,
                };
            }),
        );

        return usersWithReferralCount as any;
    }

    async updateRole(userId: string, role: string): Promise<User | null> {
        return this.userModel.findByIdAndUpdate(userId, { role }, { new: true }).select('-password').exec();
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

    async countByRole(): Promise<{ total: number; users: number; shopkeepers: number; admins: number }> {
        const [total, shopkeepers, admins] = await Promise.all([
            this.userModel.countDocuments(),
            this.userModel.countDocuments({ role: 'shopkeeper' }),
            this.userModel.countDocuments({ role: 'admin' }),
        ]);
        return { total, users: total - shopkeepers - admins, shopkeepers, admins };
    }

    async findByReferralCode(referralCode: string): Promise<User | null> {
        return this.userModel.findOne({ referralCode }).exec();
    }

    async generateUniqueReferralCode(): Promise<string> {
        let code: string;
        let exists = true;
        while (exists) {
            code = Math.random().toString(36).substring(2, 8).toUpperCase();
            exists = !!(await this.userModel.findOne({ referralCode: code }));
        }
        return code!;
    }

    async findAdminEmails(): Promise<string[]> {
        const admins = await this.userModel.find({ role: 'admin' }).select('email').exec();
        return admins.map(a => a.email);
    }

    async countReferrals(userId: string): Promise<number> {
        return this.userModel.countDocuments({ referredBy: userId });
    }

    async deleteUser(userId: string): Promise<boolean> {
        const deleted = await this.userModel.findByIdAndDelete(userId).exec();
        return !!deleted;
    }
}
