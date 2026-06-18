import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt, getDecryptedToken } from '../lib/encryption.js';

// A valid 32-byte key as 64 hex characters
const TEST_KEY = 'a'.repeat(64);
// A different valid key for wrong-key tests
const WRONG_KEY = 'b'.repeat(64);

describe('Encryption Utilities', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  describe('encrypt and decrypt (round-trip)', () => {
    it('should encrypt then decrypt back to the original value', () => {
      const plaintext = 'gho_abc123_my_github_token';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty strings', () => {
      const plaintext = '';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode text', () => {
      const plaintext = '🚀 token with unicode — émojis';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('random IV ensures unique ciphertexts', () => {
    it('should produce different ciphertexts for the same plaintext', () => {
      const plaintext = 'same_token_value';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);

      // Both should still decrypt to the same value
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });
  });

  describe('decrypt with wrong key', () => {
    it('should throw when decrypting with a different key', () => {
      const plaintext = 'secret_token';
      const encrypted = encrypt(plaintext);

      // Switch to a different key for decryption
      process.env.ENCRYPTION_KEY = WRONG_KEY;

      expect(() => decrypt(encrypted)).toThrow();
    });
  });

  describe('GCM auth tag validation (tampered ciphertext)', () => {
    it('should throw when ciphertext is tampered with', () => {
      const plaintext = 'secret_token';
      const encrypted = encrypt(plaintext);

      const parts = encrypted.split(':');
      // Tamper with the ciphertext portion
      const tamperedCiphertext =
        parts[2].length > 0
          ? parts[2].slice(0, -2) +
            (parts[2].slice(-2) === 'ff' ? '00' : 'ff')
          : 'ff';
      const tampered = `${parts[0]}:${parts[1]}:${tamperedCiphertext}`;

      expect(() => decrypt(tampered)).toThrow();
    });

    it('should throw when auth tag is tampered with', () => {
      const plaintext = 'secret_token';
      const encrypted = encrypt(plaintext);

      const parts = encrypted.split(':');
      // Tamper with the auth tag portion
      const tamperedTag =
        parts[1].slice(0, -2) + (parts[1].slice(-2) === 'ff' ? '00' : 'ff');
      const tampered = `${parts[0]}:${tamperedTag}:${parts[2]}`;

      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe('ENCRYPTION_KEY validation', () => {
    it('should throw if ENCRYPTION_KEY is not set', () => {
      delete process.env.ENCRYPTION_KEY;

      expect(() => encrypt('test')).toThrow(
        'ENCRYPTION_KEY environment variable is not set'
      );
    });

    it('should throw if ENCRYPTION_KEY is too short', () => {
      process.env.ENCRYPTION_KEY = 'abcd1234'; // Only 8 hex chars

      expect(() => encrypt('test')).toThrow(
        'ENCRYPTION_KEY must be exactly 64 hex characters'
      );
    });

    it('should throw if ENCRYPTION_KEY is too long', () => {
      process.env.ENCRYPTION_KEY = 'a'.repeat(128);

      expect(() => encrypt('test')).toThrow(
        'ENCRYPTION_KEY must be exactly 64 hex characters'
      );
    });
  });

  describe('getDecryptedToken', () => {
    it('should decrypt the accessToken field from a user object', () => {
      const plainToken = 'gho_real_token_value_12345';
      const encryptedToken = encrypt(plainToken);

      const user = {
        id: 'user-123',
        accessToken: encryptedToken,
        username: 'testuser',
      };

      expect(getDecryptedToken(user)).toBe(plainToken);
    });
  });
});
