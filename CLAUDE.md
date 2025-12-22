# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mioki is a QQ bot framework built on NapCat and TypeScript, providing a simple plugin-based architecture for building bots. The project is a pnpm workspace monorepo containing two main packages:

- **packages/mioki**: The core framework with plugin system, configuration management, and bot lifecycle
- **packages/napcat-sdk**: A standalone TypeScript SDK for interacting with NapCat's OneBot v11 implementation

## Common Commands

### Development
```sh
# Start development mode (watches all packages)
pnpm dev

# Build all packages
pnpm build

# Run example bot
pnpm start
```

### Package-Specific Commands
```sh
# Work on mioki package
pnpm --filter mioki run dev
pnpm --filter mioki run build

# Work on napcat-sdk package
pnpm --filter napcat-sdk run dev
pnpm --filter napcat-sdk run build
```

### Release
```sh
# Bump version and create release
pnpm release

# CI publish (automated)
pnpm publish:ci
```

## Architecture

### Core Components

**Plugin System (packages/mioki/src/plugin.ts)**
- Plugins are the primary extension mechanism for mioki
- Each plugin has a unique `name`, optional `version`, `priority`, and `setup` function
- Plugin setup receives a `MiokiContext` with full framework access (bot instance, utils, config, actions, services)
- Plugins can register event handlers via `ctx.handle()`, schedule cron jobs via `ctx.cron()`, and add services via `ctx.addService()`
- All registered handlers/jobs are automatically cleaned up when plugins are disabled
- Builtin plugins are loaded first, then user plugins are loaded in priority order (lower priority = loads first)

**Configuration (packages/mioki/src/config.ts)**
- Bot configuration lives in the project's `package.json` under the `mioki` field
- Required fields: `owners` (QQ numbers), `admins`, `plugins` (directory names), `napcat.token`
- Optional fields: `prefix`, `online_push`, `log_level`, `plugins_dir`
- Configuration changes can be persisted via `updateBotConfig()` which modifies package.json

**Bot Startup (packages/mioki/src/start.ts)**
- Entry point is `start({ cwd })` which initializes the framework
- Establishes WebSocket connection to NapCat instance
- Loads builtin plugins first, then user plugins from the plugins directory
- User plugins must match their directory name to the plugin's `name` field
- Plugins with the same priority load in parallel; different priorities load sequentially

**NapCat SDK (packages/napcat-sdk/src/napcat.ts)**
- Core SDK class provides WebSocket connection management and event handling
- Uses `mitt` for event emission with strongly-typed EventMap
- Provides high-level helpers: `pickGroup()`, `pickFriend()`, `sendGroupMsg()`, `sendPrivateMsg()`
- Events are automatically enhanced with convenience methods (e.g., `event.reply()`, `event.recall()`)
- Supports cookie management and GTK calculation for QQ API interactions

**Message Segments (packages/napcat-sdk/src/segment.ts)**
- Message construction uses CQ-code-like segment objects
- Common segments: `segment.text()`, `segment.at()`, `segment.image()`, `segment.face()`
- Messages can be strings, segment objects, or arrays of both

### Plugin Development Pattern

Plugins should follow this structure:

```typescript
import { definePlugin } from 'mioki'

export default definePlugin({
  name: 'my-plugin', // Must match directory name
  version: '1.0.0',
  priority: 100, // Optional, default 100
  description: 'My plugin description',

  setup(ctx) {
    // Register event handlers
    ctx.handle('message.group', async (event) => {
      // Handle group messages
    })

    // Schedule cron jobs
    ctx.cron('0 0 * * *', (ctx, task) => {
      // Daily task
    })

    // Return cleanup function
    return () => {
      // Clean up resources
    }
  }
})
```

### Testing Plugins

There is no formal test suite. To test plugins:
1. Place plugin in `example/plugins/` directory
2. Add plugin directory name to `example/package.json` mioki.plugins array
3. Run `pnpm start` to test

## Building and Packaging

Both packages use `tsdown` for building:
- Outputs to `dist/` with both ESM (`.mjs`) and CJS (`.cjs`) formats
- TypeScript source is in `src/`, no intermediate build artifacts
- `pnpm build` must be run before publishing

## NapCat Integration

Mioki requires a running NapCat instance:
- Default connection: `ws://localhost:3001`
- NapCat runs in Docker (port 3001 inside, forwarded to 3001)
- Configure WebSocket server in NapCat UI at http://localhost:6099
- Token from NapCat config must match `napcat.token` in mioki config

## Code Style

- Uses Prettier with custom config: no semicolons, single quotes, trailing commas
- Import organization: node builtins → external → internal (relative)
- Prefer type inference over explicit types where clear
- Use `@types/node` catalog reference for consistency
