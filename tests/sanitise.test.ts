import { describe, it, expect } from 'vitest'
import { detectSecrets, assertSafe } from '../src/sanitise.js'

describe('detectSecrets', () => {
  it('returns false for plain architectural text', () => {
    expect(detectSecrets('Use React Query for all server state management')).toBe(false)
  })

  it('detects AWS access key format', () => {
    expect(detectSecrets('key: AKIAIOSFODNN7EXAMPLE')).toBe(true)
  })

  it('detects a Bearer JWT token', () => {
    expect(detectSecrets('Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.abc.def')).toBe(true)
  })

  it('detects a database connection string with password', () => {
    expect(detectSecrets('postgresql://user:secretpassword@localhost/db')).toBe(true)
  })

  it('detects a PEM private key header', () => {
    expect(detectSecrets('-----BEGIN RSA PRIVATE KEY-----')).toBe(true)
  })

  it('detects a GitHub personal access token', () => {
    expect(detectSecrets('ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456')).toBe(true)
  })

  it('detects a GitHub app token (ghs_)', () => {
    expect(detectSecrets('ghs_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456')).toBe(true)
  })

  it('detects a standalone OpenAI-style sk- key', () => {
    expect(detectSecrets('sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ12345678')).toBe(true)
  })

  it('detects a generic api_key assignment', () => {
    expect(detectSecrets('api_key=sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ12345678')).toBe(true)
  })

  it('detects password assignment', () => {
    expect(detectSecrets('password=mysecretpassword123')).toBe(true)
  })
})

describe('assertSafe', () => {
  it('does not throw for safe content', () => {
    expect(() => assertSafe('A safe architectural decision about state management')).not.toThrow()
  })

  it('throws for content containing an AWS key', () => {
    expect(() => assertSafe('AKIAIOSFODNN7EXAMPLE')).toThrow(/secret/)
  })
})
