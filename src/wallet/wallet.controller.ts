import { Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GetTransactionsDto } from './dto/transaction.dto';

@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
    constructor(private readonly walletService: WalletService) {}

    @Get(':userId/balance')
    async getBalance(@Param('userId') userId: string) {
        return await this.walletService.getBalance(userId);
    }

    @Post(':userId/credit/:amount')
    async credit(@Param('userId') userId: string, @Param('amount') amount: number) {
        return await this.walletService.credit(userId, amount);
    }

    @Post(':userId/debit/:amount')
    async debit(@Param('userId') userId: string, @Param('amount') amount: number) {
        return await this.walletService.debit(userId, amount);
    }

    @Get(':userId/transactions')
    async getTransactions(@Request() req,@Query() query:GetTransactionsDto) {
        return await this.walletService.getTransactions(req.user.userId, query);
    }
}
