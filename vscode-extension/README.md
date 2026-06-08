# Supabase Edge Debug

One-click debugging and testing for Supabase Edge Functions (Deno runtime) in VS Code.

The official Supabase debugging docs only cover Chrome DevTools. This extension wires up VS Code's built-in Node debugger to the Deno V8 inspector — breakpoints, stepping, locals, and watch expressions work directly in your TypeScript source files.

## Requirements

- [Supabase CLI](https://supabase.com/docs/guides/cli) v1.171.0 or later
- `supabase start` running (local Docker stack)
- VS Code 1.91+

## Usage

### Debug a function

1. Open a workspace containing `supabase/functions/`
2. Set a breakpoint in any `.ts` function file
3. Open the Command Palette (`⇧⌘P`) → **Supabase Edge: Start Edge Function Debugger**
4. Trigger your function (HTTP request, Supabase client call, etc.)
5. VS Code pauses at your breakpoint

The status bar shows `Edge: Running` while the serve process is active. Click it to stop.

### Run tests

Open any function file (e.g. `supabase/functions/my-func/index.ts`) then run:

**Supabase Edge: Run Edge Function Tests** → runs `supabase/functions/tests/my-func-test.ts`

If no function file is active, runs all tests in `supabase/functions/tests/`.

Test file naming convention (per Supabase docs): `<function-name>-test.ts`

## How It Works

1. Runs `supabase functions serve --inspect-mode brk` in a terminal
2. Polls `127.0.0.1:8083` until the V8 inspector is ready
3. Attaches VS Code's Node debugger via `type: "node"` + `request: "attach"`

No custom debug adapter required — the built-in Node debugger speaks V8 inspector protocol directly to the Deno runtime.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `supabaseEdgeDebug.port` | `8083` | V8 inspector port |
| `supabaseEdgeDebug.inspectMode` | `brk` | `brk` = pause on first line; `wait` = wait for attach |
| `supabaseEdgeDebug.functionsPath` | `supabase/functions` | Relative path to functions dir |
| `supabaseEdgeDebug.supabaseCli` | `supabase` | Path to supabase CLI binary |

## Manual `launch.json` Config

Add this to `.vscode/launch.json` for a persistent debug config (or use **Add Configuration** → Supabase Edge):

```json
{
  "type": "node",
  "request": "attach",
  "name": "Supabase Edge: Attach",
  "port": 8083,
  "host": "127.0.0.1",
  "localRoot": "${workspaceFolder}/supabase/functions",
  "remoteRoot": "/home/deno/functions",
  "sourceMaps": true,
  "skipFiles": ["<node_internals>/**"],
  "restart": true,
  "timeout": 10000
}
```

## Deno Language Support

For TypeScript IntelliSense inside function files, install the [Deno VS Code extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno) and add this to `.vscode/settings.json`:

```json
{
  "deno.enablePaths": ["supabase/functions"],
  "deno.importMap": "./supabase/functions/import_map.json"
}
```
