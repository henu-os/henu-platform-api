import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDesktopShortcutDto {
  @ApiProperty({
    description: 'Display name of the application for desktop shortcut label',
    example: 'HENU AI Studio',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Target executable path on local filesystem, or URL for web applications',
    example: 'https://records.henuos.in',
  })
  @IsString()
  @IsNotEmpty()
  targetPath: string;

  @ApiProperty({
    description: 'Whether application is a web app (generates .url shortcut) or native desktop app (.lnk)',
    example: false,
  })
  @IsBoolean()
  isWebApp: boolean;

  @ApiPropertyOptional({
    description: 'Optional URL or icon path for custom shortcut icon',
    example: 'https://cdn.henuos.in/assets/icons/henu-ai.ico',
  })
  @IsString()
  @IsOptional()
  iconUrl?: string;
}

export class DesktopShortcutResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: ['C:\\Users\\henus\\Desktop\\HENU AI Studio.lnk'] })
  createdShortcuts: string[];

  @ApiPropertyOptional({ example: 'Desktop shortcut created successfully' })
  message?: string;
}
