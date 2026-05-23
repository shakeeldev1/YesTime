import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = new Set(
    [
      process.env.FRONTEND_URL,
      process.env.CLIENT_URL,
      process.env.CORS_ORIGIN,
      'https://yestimeltd.com',
      'https://www.yestimeltd.com',
      'https://api.yestimeltd.com',
      'http://localhost:5173',
      'http://localhost:3000',
    ].filter(Boolean),
  );

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      try {
        const hostname = new URL(origin).hostname;
        if (hostname.endsWith('.yestimeltd.com')) {
          callback(null, true);
          return;
        }
      } catch {
        // Ignore invalid origins and fall through to rejection.
      }

      callback(new Error(`Origin not allowed by CORS: ${origin}`), false);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Length', 'Content-Range'],
    credentials: true,
    optionsSuccessStatus: 204,
  });
  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application is running on: http://localhost:${process.env.PORT ?? 3000}`);
}
bootstrap();
