import { Controller, Get, Put, Param, Body, Query, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from './schemas/user.schema';

@Controller('users')
export class UsersController {
    constructor(private usersService: UsersService) {}

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Get()
    async getAllUsers(@Query('role') role?: string, @Query('search') search?: string, @Query('limit') limit?: string) {
        return this.usersService.findAll({ role, search, limit: limit ? parseInt(limit) : undefined });
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Get('stats')
    async getUserStats() {
        return this.usersService.countByRole();
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Put(':userId/role')
    async changeRole(@Param('userId') userId: string, @Body('role') role: string) {
        if (!Object.values(UserRole).includes(role as UserRole)) {
            throw new BadRequestException('Invalid role. Must be user, shopkeeper, or admin');
        }
        const user = await this.usersService.updateRole(userId, role);
        if (!user) throw new BadRequestException('User not found');
        return { message: `Role updated to ${role}`, user };
    }
}
