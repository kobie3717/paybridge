# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.3.x   | :white_check_mark: |
| 0.2.x   | :x:                |
| 0.1.x   | :x:                |

## Reporting a Vulnerability

PayBridge handles sensitive payment data and webhook signing. We take security vulnerabilities seriously.

**Report security issues privately via GitHub Security Advisories:**  
https://github.com/kobie3717/paybridge/security/advisories/new

**DO NOT open public issues for security findings.**

### What to include

- Description of the vulnerability
- Steps to reproduce
- Impact assessment (what could an attacker do?)
- Affected versions
- Any suggested fixes

### Response timeline

- **Initial response:** Within 5 business days
- **Triage & assessment:** Within 10 business days
- **Fix timeline:**
  - **High/Critical:** 30 days
  - **Medium/Low:** 90 days
- **Disclosure:** We coordinate public disclosure with the reporter after the fix ships

### What happens next

1. We'll acknowledge receipt within 5 business days
2. We'll investigate and provide an initial assessment within 10 business days
3. We'll work on a fix and keep you updated on progress
4. Once fixed, we'll credit you in the release notes (unless you opt out)
5. After the fix is released, we'll coordinate public disclosure timing with you

## Scope

### In Scope

The following are within the security scope of PayBridge:

- **Webhook signature verification flaws** — forgeable signatures, timing leaks, replay attacks
- **Secret leakage** — logged secrets, secrets in error messages, secrets in `raw` response objects
- **Authentication/Authorization flaws** in provider integrations — credential bypass, token leakage
- **Input validation flaws** — amount handling (negative, zero, floating-point precision), currency injection, URL injection
- **Cryptographic flaws** — weak algorithms, predictable randomness, insecure defaults

### Out of Scope

The following are NOT within the security scope of PayBridge:

- **Issues with provider APIs themselves** — report directly to the payment provider (Stripe, PayStack, MoonPay, etc.)
- **Issues with user-deployed infrastructure** — Redis security, web server configs, OS vulnerabilities
- **Theoretical attacks without proof of concept** — we prioritize exploitable vulnerabilities
- **Social engineering** — phishing, pretexting, impersonation
- **Denial of Service (DoS)** — unless it leads to a security compromise (e.g., hash collision attack)

## Acknowledgements

We acknowledge security researchers who responsibly disclose vulnerabilities:

- *No confirmed reports yet*

Thank you for helping keep PayBridge secure!
