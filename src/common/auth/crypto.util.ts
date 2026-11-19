import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { authenticator } from 'otplib';

export class CryptoUtil {
  /**
   * Hashes a password using Argon2id with memory-hard parameters.
   */
  static async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });
  }

  /**
   * Verifies an Argon2id password hash.
   */
  static async verifyPassword(hash: string, plainText: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plainText);
    } catch {
      return false;
    }
  }

  /**
   * Generates a deterministic SHA-256 hash for single-use refresh tokens or recovery codes.
   */
  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token.trim()).digest('hex');
  }

  /**
   * Generates a cryptographically random refresh token.
   */
  static generateRandomToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Generates a new TOTP secret.
   */
  static generateMfaSecret(): string {
    return authenticator.generateSecret();
  }

  /**
   * Generates the standard OTP Auth URI for scanning in authenticator apps.
   */
  static generateMfaKeyUri(email: string, secret: string): string {
    return authenticator.keyuri(email, 'HENU OS Platform', secret);
  }

  /**
   * Verifies a 6-digit TOTP token against a secret.
   */
  static verifyMfaToken(token: string, secret: string): boolean {
    try {
      return authenticator.verify({ token: token.trim(), secret });
    } catch {
      return false;
    }
  }

  /**
   * Generates a set of single-use backup recovery codes.
   */
  static generateRecoveryCodes(count = 8): { rawCodes: string[]; hashedCodes: string[] } {
    const rawCodes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8-char hex code
      rawCodes.push(code);
      hashedCodes.push(this.hashToken(code));
    }

    return { rawCodes, hashedCodes };
  }
}
