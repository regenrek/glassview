# Glassview

![Glassview — shareable screenshot links for agent visual proof](public/glassview_banner.webp)

Glassview gives coding agents a comfortable way to turn local screenshots into encrypted, expiring proof links.

The repo contains two pieces:

- a **Glassview skill** that agents can use to capture or upload real screenshots
- a **self-hosted Cloudflare Worker + R2 backend** provisioned with Alchemy

The normal flow is:

```text
agent captures screenshot -> encrypted upload -> expiring viewer URL with #k key -> share the proof
```

## Install The Skill

Install the skill with the open Agent Skills CLI:

```bash
npx skills add regenrek/glassview --skill glassview --agent codex -g
```

Use `--agent claude-code` for Claude Code, or omit `-g` for a project-local install.

Clone-based fallback:

```bash
git clone https://github.com/regenrek/glassview.git
cd glassview
pnpm install
pnpm skill:install
```

Skill install details and variants: [Install Guide](docs/INSTALL.md).

## Connect A Service

The skill needs a deployed Glassview URL and upload token:

```bash
export GLASSVIEW_URL="https://your-glassview-worker.example"
export GLASSVIEW_UPLOAD_TOKEN="your-upload-token"
```

Deploy your own backend with Alchemy:

```bash
git clone https://github.com/regenrek/glassview.git
cd glassview
pnpm install
pnpm setup:deploy
```

Deployment and environment details: [Deploy Guide](docs/DEPLOY.md).

Default sharing is private: screenshots are encrypted before upload, expire after 7 days, and the decrypt key stays in the URL fragment. Use `--public` only for screenshots that are safe to store as public-by-link plaintext.

## Tell Your Agent

Use the skill when the proof must be visual and shareable:

```text
Use $glassview.

Capture http://localhost:5173/ and return a verified Glassview link.
```

For an existing image:

```text
Use $glassview.

Upload /tmp/screenshot.png as "Browser proof" and return the verified view URL.
```

More prompts and direct CLI commands: [Usage Guide](docs/USAGE.md).

## Docs

- [Install](docs/INSTALL.md)
- [Usage](docs/USAGE.md)
- [Deploy](docs/DEPLOY.md)
- [API](docs/API.md)
- [Security](docs/SECURITY.md)
- [Testing](docs/TESTING.md)
- [Changelog](CHANGELOG.md)

## License

MIT. See [LICENSE.md](LICENSE.md).
