// Common secret patterns. Refuses entries that appear to contain credentials.
// IMPORTANT: Do not add the 'g' (global) flag to any pattern in this array.
// RegExp instances with /g are stateful — .test() advances lastIndex on each call,
// producing alternating true/false results when the same instance is called repeatedly.
const SECRET_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/,                                          // AWS Access Key ID
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY/,                       // PEM private key
  /ghp_[a-zA-Z0-9]{32,}/,                                      // GitHub personal access token
  /ghs_[a-zA-Z0-9]{32,}/,                                      // GitHub app token
  /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,      // JWT
  /(?:api[_-]?key|apikey|secret[_-]?key)\s*[:=]\s*\S{16,}/i,  // generic API key assignment
  /(?:password|passwd|pwd)\s*[:=]\s*\S{4,}/i,                  // password assignment
  /(?:postgresql|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/,       // DB connection string with password
  /sk-[a-zA-Z0-9]{32,}/,                                       // OpenAI-style secret key
]

export function detectSecrets(content: string): boolean {
  return SECRET_PATTERNS.some(pattern => pattern.test(content))
}

export function assertSafe(content: string): void {
  if (detectSecrets(content)) {
    throw new Error(
      'Content appears to contain a secret or credential. ' +
      'Memory entries must not contain API keys, tokens, passwords, or private keys.'
    )
  }
}
