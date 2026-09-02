# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| master / latest | Yes |
| Older / unmaintained forks | No |

## Reporting a vulnerability

Please report security issues privately via GitHub Security Advisories on this repository:

https://github.com/mjmacfadden/photochop/security/advisories

If Advisories are unavailable, use a private maintainer contact path (GitHub security report / private issue to maintainers). Do not file a public issue with exploit details.

Do not email legacy miniPaint contacts for this fork; Vantage Point / PhotoChop security is handled by this repo's maintainers.

## Scope notes (client-side app)

- XSS / DOM sinks: Prefer reporting innerHTML / URL-parameter injection that can run script in the editor origin.
- Third-party service keys: Must not be committed. Supply Pixabay / Google Fonts (or other) keys only via local injection (e.g. window.__VP_KEYS__) or untracked env - never in git. Keys that ever appeared in history should be rotated.
- Remote URL open: Automatic ?image= remote fetch is disabled to reduce SSRF / privacy risk; use File -> Open URL explicitly when loading remote images.
