# Security Policy

## Supported versions

Only the currently deployed version of Optiq (https://code-optimizer.instaluxe.in) is supported.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately through GitHub's ["Report a vulnerability"](../../security/advisories/new) form
(Security → Advisories). Include:

- affected URL or file
- steps to reproduce
- impact assessment
- any suggested remediation

We aim to acknowledge reports within 72 hours and to ship a fix or mitigation for confirmed
high-severity issues within 14 days.

## Scope

In scope: the Optiq web app, its server functions, and the public optimize API
(`/api/public/v1/optimize`).

Out of scope: findings that require a compromised browser/extension, denial of service through
volumetric traffic, and reports about third-party services we merely link to.

## Application security posture

- All pasted SQL / Python / JSON is treated as untrusted input: it is never evaluated on the
  server, never rendered as HTML, and is size-capped per editor.
- In-browser Python/SQL execution runs inside a sandboxed web worker with a hard execution
  timeout, so runaway user code cannot freeze the page or reach the host.
- No API keys or provider secrets are shipped to the browser; AI optimization runs through a
  server function.
- The public API validates input with a schema, caps the payload size, and rate limits per IP.
- Security headers (CSP, HSTS, frame/deny, referrer policy, permissions policy, COOP) are set on
  every HTML response.
- Dependencies are audited in CI and patched through Dependabot security updates.
