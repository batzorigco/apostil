# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.3.x | Yes |
| 0.2.x and older | No. Upgrade to the latest 0.3.x |

Apostil is pre-1.0. Security fixes are released as a new patch of the latest minor version.

## Reporting a vulnerability

Please do not open a public issue.

Report privately through GitHub: open the [Security tab](https://github.com/batzorigco/apostil/security/advisories/new) of the repository and choose **Report a vulnerability**. Include the affected version, how to reproduce it, and what an attacker could do.

You can expect a first reply within 7 days. Once a fix is released, the advisory is published and you are credited unless you ask not to be.

## What is in scope

- The storage endpoint (`apostil/adapters/nextjs`, `apostil/adapters/vite`): reading or writing comments from another site, or files outside the comment directory.
- The MCP server and `apostil mcp init`: acting outside the project's comment directory or changing client configuration beyond the Apostil entry.
- Captured element context storing data it is documented not to store.

## Known limits, by design

- The storage endpoint is same-origin only but has no authentication. Anyone who can load a page that serves it can read and write comments. Put your own authentication in front of it before deploying it publicly.
- Comment text is passed to coding agents through MCP and must be treated as untrusted input.

See the [Security section of the README](README.md#security) for details.
