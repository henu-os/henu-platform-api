import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface CatalogueSignaturePayload {
  algorithm: 'ed25519';
  keyId: string;
  value: string; // Hex-encoded signature
  signedAt: string;
}

export interface TrustedSigningKey {
  keyId: string;
  algorithm: 'ed25519';
  publicKeyHex: string;
  status: 'ACTIVE' | 'ROTATED' | 'REVOKED';
  validFrom: string;
}

@Injectable()
export class CatalogueSignerService implements OnModuleInit {
  private readonly logger = new Logger(CatalogueSignerService.name);
  private keyId = process.env.CATALOGUE_SIGNING_KEY_ID || 'henu-root-2026-v1';
  private privateKey!: crypto.KeyObject;
  private publicKey!: crypto.KeyObject;
  private publicKeyHex!: string;

  onModuleInit() {
    this.initializeKeys();
  }

  private initializeKeys() {
    const candidates = [
      process.env.CATALOGUE_SIGNING_KEY_PATH,
      path.resolve(__dirname, '../../../.catalogue_signing_key.pem'),
      path.resolve(__dirname, '../../../../.catalogue_signing_key.pem'),
      path.resolve(process.cwd(), '.catalogue_signing_key.pem'),
      'H:/HENU-PLATFORM/henu-platform-api/.catalogue_signing_key.pem',
    ].filter(Boolean) as string[];

    const keyPath = candidates.find((p) => fs.existsSync(p)) || candidates[1];

    // 1. If key passed in environment variable
    if (process.env.CATALOGUE_SIGNING_PRIVATE_KEY) {
      try {
        this.privateKey = crypto.createPrivateKey(process.env.CATALOGUE_SIGNING_PRIVATE_KEY);
        this.publicKey = crypto.createPublicKey(this.privateKey);
        this.publicKeyHex = this.publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
        this.logger.log(`Loaded catalogue signing key [${this.keyId}] from environment variable`);
        return;
      } catch (err: any) {
        this.logger.warn(`Failed to parse CATALOGUE_SIGNING_PRIVATE_KEY: ${err.message}. Generating fresh key.`);
      }
    }

    // 2. If key exists in local persistent file
    if (fs.existsSync(keyPath)) {
      try {
        const pem = fs.readFileSync(keyPath, 'utf8');
        this.privateKey = crypto.createPrivateKey(pem);
        this.publicKey = crypto.createPublicKey(this.privateKey);
        this.publicKeyHex = this.publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
        this.logger.log(`Loaded catalogue signing key [${this.keyId}] from persistent file`);
        return;
      } catch (err: any) {
        this.logger.warn(`Failed to load key from ${keyPath}: ${err.message}`);
      }
    }

    // 3. Generate fresh deterministic / secure Ed25519 keypair
    const pair = crypto.generateKeyPairSync('ed25519');
    this.privateKey = pair.privateKey;
    this.publicKey = pair.publicKey;
    this.publicKeyHex = this.publicKey.export({ type: 'spki', format: 'der' }).toString('hex');

    try {
      const privatePem = this.privateKey.export({ type: 'pkcs8', format: 'pem' });
      fs.writeFileSync(keyPath, privatePem, { mode: 0o600 });
      this.logger.log(`Generated and persisted new Ed25519 signing key [${this.keyId}] to ${keyPath}`);
    } catch {
      this.logger.log(`Generated in-memory Ed25519 signing key [${this.keyId}]`);
    }
  }

  /**
   * Cryptographically sign a contentHash using Ed25519
   */
  sign(contentHash: string): CatalogueSignaturePayload {
    if (!this.privateKey) {
      this.initializeKeys();
    }

    const dataBuffer = Buffer.from(contentHash, 'utf8');
    const signatureBuffer = crypto.sign(null, dataBuffer, this.privateKey);

    return {
      algorithm: 'ed25519',
      keyId: this.keyId,
      value: signatureBuffer.toString('hex'),
      signedAt: new Date().toISOString(),
    };
  }

  /**
   * Verify an Ed25519 signature
   */
  verify(contentHash: string, signatureHex: string, publicKeyHex?: string): boolean {
    try {
      const key = publicKeyHex
        ? crypto.createPublicKey({
            key: Buffer.from(publicKeyHex, 'hex'),
            format: 'der',
            type: 'spki',
          })
        : this.publicKey;

      const dataBuffer = Buffer.from(contentHash, 'utf8');
      const signatureBuffer = Buffer.from(signatureHex, 'hex');

      return crypto.verify(null, dataBuffer, key, signatureBuffer);
    } catch (err: any) {
      this.logger.warn(`Signature verification failed with error: ${err.message}`);
      return false;
    }
  }

  /**
   * Retrieve active public keys for client distribution and key rotation
   */
  getTrustedKeys(): TrustedSigningKey[] {
    return [
      {
        keyId: this.keyId,
        algorithm: 'ed25519',
        publicKeyHex: this.publicKeyHex,
        status: 'ACTIVE',
        validFrom: '2026-01-01T00:00:00.000Z',
      },
    ];
  }

  getActivePublicKeyHex(): string {
    if (!this.publicKeyHex) {
      this.initializeKeys();
    }
    return this.publicKeyHex;
  }

  getActiveKeyId(): string {
    return this.keyId;
  }
}
