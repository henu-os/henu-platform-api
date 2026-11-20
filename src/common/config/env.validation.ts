import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(1)
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  API_PREFIX: string = 'api/v1';

  @IsString()
  @IsOptional()
  API_BASE_URL?: string = 'https://henu-platform-api.onrender.com';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN: string = '15m';

  @IsString()
  @IsOptional()
  REFRESH_TOKEN_EXPIRES_IN: string = '7d';

  @IsString()
  @IsOptional()
  GITHUB_APP_ID?: string;

  @IsString()
  @IsOptional()
  GITHUB_APP_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  GITHUB_APP_PRIVATE_KEY_BASE64?: string;

  @IsString()
  @IsOptional()
  GITHUB_WEBHOOK_SECRET?: string;

  @IsString()
  @IsOptional()
  ADMIN_CORS_ORIGIN?: string = 'http://localhost:5173,http://localhost:3001';

  @IsString()
  @IsOptional()
  HUB_CORS_ORIGIN?: string = 'http://localhost:8080,tauri://localhost,http://tauri.localhost';

  @IsInt()
  @Min(1)
  @IsOptional()
  THROTTLE_TTL: number = 60;

  @IsInt()
  @Min(1)
  @IsOptional()
  THROTTLE_LIMIT: number = 120;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const formattedErrors = errors
      .map((err) => `${err.property}: ${Object.values(err.constraints || {}).join(', ')}`)
      .join('; ');
    throw new Error(`Environment configuration validation error: ${formattedErrors}`);
  }

  return validatedConfig;
}
