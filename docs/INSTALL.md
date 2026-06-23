# Install

Glassview is most useful when the skill is installed in your agent and pointed at a deployed Glassview service.

## Install With Agent Skills

Install project-locally:

```bash
npx skills add regenrek/glassview --skill glassview
```

Install globally for your user-level agent environment:

```bash
npx skills add regenrek/glassview --skill glassview -g
```

List available skills in the repo:

```bash
npx skills add regenrek/glassview --list
```

Use `-g` for a global install. Omit it for a project-local install. Add `--agent <agent>` only when you want to target a specific supported agent, such as `openclaw`, `hermes-agent`, `codex`, or `claude-code`. Add `--copy` if you prefer copied files instead of symlinks.

## Codex Clone-Based Install

```bash
git clone https://github.com/regenrek/glassview.git
cd glassview
pnpm install
pnpm skill:install
```

`pnpm skill:install` copies `skills/glassview` into `${CODEX_HOME:-$HOME/.codex}/skills/glassview`.

## Configure The Skill

Set the service URL and upload token in the shell or agent environment:

```bash
export GLASSVIEW_URL="https://your-glassview-worker.example"
export GLASSVIEW_UPLOAD_TOKEN="your-upload-token"
```

For local backend development, use `GLASSVIEW_LOCAL_URL` instead:

```bash
export GLASSVIEW_LOCAL_URL="http://localhost:8787"
export GLASSVIEW_UPLOAD_TOKEN="your-upload-token"
```

The skill prefers `GLASSVIEW_URL` when both URLs are set.
