import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter;
  private readonly senderName = 'Yes Time';

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  private get fromAddress(): string {
    const smtpUser = process.env.SMTP_USER?.trim();
    const configuredFrom = process.env.SMTP_FROM?.trim();

    if (!configuredFrom) {
      return smtpUser || 'noreply@yestime.com';
    }

    if (!smtpUser) {
      return configuredFrom;
    }

    const smtpHost = (process.env.SMTP_HOST || '').toLowerCase();
    const usingGmailRelay = smtpHost.includes('gmail.com') || smtpHost.includes('googlemail.com');

    if (usingGmailRelay) {
      return smtpUser;
    }

    return configuredFrom;
  }

  private buildMailOptions(to: string, subject: string, html: string, text: string): nodemailer.SendMailOptions {
    return {
      from: `"${this.senderName}" <${this.fromAddress}>`,
      to,
      replyTo: this.fromAddress,
      subject,
      text,
      html,
      headers: {
        'X-Mailer': this.senderName,
      },
    };
  }

  private async sendMail(options: nodemailer.SendMailOptions): Promise<void> {
    await this.transporter.sendMail(options);
  }

  async sendOtpEmail(to: string, otp: string, name: string): Promise<void> {
    try {
      await this.sendMail(this.buildMailOptions(
        to,
        'Your OTP Verification Code - Yes Time',
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #003366, #1A539B); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Yes Time</h1>
              <p style="color: #82B1FF; margin: 5px 0 0;">Verification Code</p>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px;">
              <p style="color: #333;">Hello <strong>${name}</strong>,</p>
              <p style="color: #555;">Your OTP verification code is:</p>
              <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #003366;">${otp}</span>
              </div>
              <p style="color: #555; font-size: 14px;">This code is valid for 10 minutes. Do not share it with anyone.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">If you didn't request this code, please ignore this email.</p>
            </div>
          </div>
        `,
        `Yes Time\n\nHello ${name},\n\nYour OTP verification code is: ${otp}\n\nThis code is valid for 10 minutes. Do not share it with anyone.\n\nIf you didn't request this code, please ignore this email.`
      ));
      this.logger.log(`OTP email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${to}: ${error.message}`);
      throw error;
    }
  }

  async sendPasswordResetEmail(to: string, otp: string, name: string): Promise<void> {
    try {
      await this.sendMail(this.buildMailOptions(
        to,
        'Password Reset Code - Yes Time',
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #003366, #1A539B); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Yes Time</h1>
              <p style="color: #82B1FF; margin: 5px 0 0;">Password Reset</p>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px;">
              <p style="color: #333;">Hello <strong>${name}</strong>,</p>
              <p style="color: #555;">Use this code to reset your password:</p>
              <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #003366;">${otp}</span>
              </div>
              <p style="color: #555; font-size: 14px;">This code is valid for 10 minutes. If you did not request a reset, you can ignore this email.</p>
            </div>
          </div>
        `,
        `Yes Time\n\nHello ${name},\n\nUse this code to reset your password: ${otp}\n\nThis code is valid for 10 minutes. If you did not request a reset, you can ignore this email.`
      ));
      this.logger.log(`Password reset email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${to}: ${error.message}`);
      throw error;
    }
  }

  async sendShopkeeperApprovalEmail(to: string, name: string, shopName: string): Promise<void> {
    try {
      await this.sendMail(this.buildMailOptions(
        to,
        'Shopkeeper Request Approved! - Yes Time',
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #003366, #1A539B); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0;">🎉 Congratulations!</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px;">
              <p>Hello <strong>${name}</strong>,</p>
              <p>Your shopkeeper request for <strong>"${shopName}"</strong> has been <span style="color: green; font-weight: bold;">APPROVED</span>!</p>
              <p>PKR 1,500 registration fee has been deducted from your wallet. You can now start managing your shop.</p>
              <div style="text-align: center; margin: 20px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/shopkeeper-dashboard" 
                   style="background: #003366; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                  Go to Shopkeeper Dashboard
                </a>
              </div>
            </div>
          </div>
        `,
        `Yes Time\n\nHello ${name},\n\nYour shopkeeper request for "${shopName}" has been approved.\n\nPKR 1,500 registration fee has been deducted from your wallet. You can now start managing your shop.\n\nOpen your shopkeeper dashboard: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/shopkeeper-dashboard`
      ));
    } catch (error) {
      this.logger.error(`Failed to send approval email to ${to}: ${error.message}`);
    }
  }

  async sendShopkeeperRejectionEmail(to: string, name: string, shopName: string, reason?: string): Promise<void> {
    try {
      await this.sendMail(this.buildMailOptions(
        to,
        'Shopkeeper Request Update - Yes Time',
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #003366, #1A539B); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0;">Request Update</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px;">
              <p>Hello <strong>${name}</strong>,</p>
              <p>Your shopkeeper request for <strong>"${shopName}"</strong> has been <span style="color: red; font-weight: bold;">REJECTED</span>.</p>
              ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
              <p>You can re-apply with updated information. If you have questions, please contact our support team.</p>
            </div>
          </div>
        `,
        `Yes Time\n\nHello ${name},\n\nYour shopkeeper request for "${shopName}" has been rejected.${reason ? `\n\nReason: ${reason}` : ''}\n\nYou can re-apply with updated information. If you have questions, please contact our support team.`
      ));
    } catch (error) {
      this.logger.error(`Failed to send rejection email to ${to}: ${error.message}`);
    }
  }

  async sendAdminNewShopkeeperRequest(adminEmail: string, shopName: string, ownerName: string): Promise<void> {
    try {
      await this.sendMail(this.buildMailOptions(
        adminEmail,
        'New Shopkeeper Request Pending - Yes Time',
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #003366, #1A539B); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0;">New Shopkeeper Request</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px;">
              <p>A new shopkeeper request has been submitted:</p>
              <ul>
                <li><strong>Shop Name:</strong> ${shopName}</li>
                <li><strong>Owner:</strong> ${ownerName}</li>
              </ul>
              <div style="text-align: center; margin: 20px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/shopkeeper" 
                   style="background: #003366; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                  Review Request
                </a>
              </div>
            </div>
          </div>
        `,
        `Yes Time\n\nA new shopkeeper request has been submitted.\n\nShop Name: ${shopName}\nOwner: ${ownerName}\n\nReview request: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/shopkeeper`
      ));
    } catch (error) {
      this.logger.error(`Failed to send admin notification: ${error.message}`);
    }
  }

  async sendRegistrationCouponEmail(to: string, name: string, couponNumber: string): Promise<void> {
    try {
      await this.sendMail(this.buildMailOptions(
        to,
        'Registration Successful - Your Lucky Coupon! - Yes Time',
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #003366, #1A539B); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0;">🎉 Registration Complete!</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px;">
              <p>Hello <strong>${name}</strong>,</p>
              <p>Thank you for paying the registration fee of <strong>PKR 1,500</strong>. Your permanent lucky coupon is:</p>
              <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #003366;">${couponNumber}</span>
              </div>
              <p style="color: #555;">This coupon is <strong>permanent</strong> and will participate in every lucky draw. Each win awards you <strong>PKR 1,000</strong>!</p>
              <p style="color: #999; font-size: 13px;">Good luck! 🍀</p>
            </div>
          </div>
        `,
        `Yes Time\n\nHello ${name},\n\nThank you for paying the registration fee of PKR 1,500. Your permanent lucky coupon is: ${couponNumber}\n\nThis coupon is permanent and will participate in every lucky draw. Each win awards you PKR 1,000!\n\nGood luck!`
      ));
    } catch (error) {
      this.logger.error(`Failed to send registration coupon email to ${to}: ${error.message}`);
    }
  }

  async sendLotteryWinEmail(to: string, name: string, couponNumber: string, prizeAmount: number, moduleName: string): Promise<void> {
    try {
      await this.sendMail(this.buildMailOptions(
        to,
        `🎉 You Won PKR ${prizeAmount} in ${moduleName}! - Yes Time`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #FFD700, #FFA500); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; text-shadow: 1px 1px 2px rgba(0,0,0,0.3);">🏆 CONGRATULATIONS! 🏆</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px;">
              <p>Hello <strong>${name}</strong>,</p>
              <p>Your coupon <strong>${couponNumber}</strong> won in the <strong>${moduleName}</strong> lucky draw!</p>
              <div style="background: #f0fff4; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; border: 2px solid #48bb78;">
                <p style="margin: 0; color: #666;">Prize Amount</p>
                <span style="font-size: 36px; font-weight: bold; color: #2d8a4e;">PKR ${prizeAmount.toLocaleString()}</span>
              </div>
              <p>The prize amount has been credited to your wallet.</p>
            </div>
          </div>
        `,
        `Yes Time\n\nHello ${name},\n\nYour coupon ${couponNumber} won in the ${moduleName} lucky draw.\n\nPrize Amount: PKR ${prizeAmount.toLocaleString()}\n\nThe prize amount has been credited to your wallet.`
      ));
    } catch (error) {
      this.logger.error(`Failed to send lottery win email to ${to}: ${error.message}`);
    }
  }

  async sendCarAwardEmail(to: string, name: string, winType: 'lottery' | 'direct'): Promise<void> {
    try {
      await this.sendMail(this.buildMailOptions(
        to,
        '🚗 Car Awarded! - Yes Time',
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #003366, #1A539B); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0;">🚗 Car Awarded!</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px;">
              <p>Hello <strong>${name}</strong>,</p>
              <p>Congratulations! You have been awarded a car ${winType === 'lottery' ? 'through the lucky draw' : 'by reaching the threshold amount of PKR 4,65,500'}!</p>
              <p>Your monthly payment will now be <strong>PKR 36,000</strong> until the total car price of <strong>PKR 30,00,000</strong> is fully paid.</p>
              <p>Please contact our office for car delivery details.</p>
            </div>
          </div>
        `,
        `Yes Time\n\nHello ${name},\n\nCongratulations! You have been awarded a car ${winType === 'lottery' ? 'through the lucky draw' : 'by reaching the threshold amount of PKR 4,65,500'}.\n\nYour monthly payment will now be PKR 36,000 until the total car price of PKR 30,00,000 is fully paid.\n\nPlease contact our office for car delivery details.`
      ));
    } catch (error) {
      this.logger.error(`Failed to send car award email to ${to}: ${error.message}`);
    }
  }

  async sendReferralBonusEmail(to: string, name: string, amount: number, referredUserName: string): Promise<void> {
    try {
      await this.sendMail(this.buildMailOptions(
        to,
        `Referral Bonus Earned - PKR ${amount}! - Yes Time`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #003366, #1A539B); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0;">Referral Bonus!</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px;">
              <p>Hello <strong>${name}</strong>,</p>
              <p>Your referral <strong>${referredUserName}</strong> made a payment and you earned a bonus of <strong>PKR ${amount}</strong>!</p>
              <p>The amount has been credited to your wallet. Keep referring to earn more!</p>
            </div>
          </div>
        `,
        `Yes Time\n\nHello ${name},\n\nYour referral ${referredUserName} made a payment and you earned a bonus of PKR ${amount}.\n\nThe amount has been credited to your wallet. Keep referring to earn more!`
      ));
    } catch (error) {
      this.logger.error(`Failed to send referral bonus email to ${to}: ${error.message}`);
    }
  }

  async sendGenericEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.sendMail(this.buildMailOptions(to, subject, html, 'Yes Time'));
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
    }
  }
}
