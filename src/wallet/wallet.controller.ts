import { Controller, Get, Param, Post, Body, Query, Request, UseGuards, BadRequestException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { GetTransactionsDto } from './dto/transaction.dto';

@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
    constructor(private readonly walletService: WalletService) {}

    // Get balance for the logged-in user
    @Get('my-balance')
    async getMyBalance(@Request() req) {
        const balance = await this.walletService.getBalance(req.user.userId);
        return { balance };
    }

    // Add balance (top-up) for the logged-in user
    @Post('add-balance')
    async addBalance(@Request() req, @Body() body: { amount: number }) {
        const amount = Number(body.amount);
        if (!amount || amount <= 0) {
            throw new BadRequestException('Amount must be greater than 0');
        }
        if (amount > 100000) {
            throw new BadRequestException('Maximum top-up amount is PKR 1,00,000');
        }
        const wallet = await this.walletService.credit(req.user.userId, amount);
        return { message: `PKR ${amount} added to wallet successfully`, balance: wallet.balance };
    }

    // Get transactions for logged-in user
    @Get('my-transactions')
    async getMyTransactions(@Request() req, @Query() query: GetTransactionsDto) {
        return await this.walletService.getTransactions(req.user.userId, query);
    }

    // Admin-only routes
    @UseGuards(RolesGuard)
    @Roles('admin')
    @Get(':userId/balance')
    async getBalance(@Param('userId') userId: string) {
        return await this.walletService.getBalance(userId);
    }

    @UseGuards(RolesGuard)
    @Roles('admin')
    @Post(':userId/credit/:amount')
    async credit(@Param('userId') userId: string, @Param('amount') amount: number) {
        return await this.walletService.credit(userId, amount);
    }

    @UseGuards(RolesGuard)
    @Roles('admin')
    @Post(':userId/debit/:amount')
    async debit(@Param('userId') userId: string, @Param('amount') amount: number) {
        return await this.walletService.debit(userId, amount);
    }

    @UseGuards(RolesGuard)
    @Roles('admin')
    @Get(':userId/transactions')
    async getTransactions(@Param('userId') userId: string, @Query() query: GetTransactionsDto) {
        return await this.walletService.getTransactions(userId, query);
    }
}
