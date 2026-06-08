import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig } from './config';
import { EdgeDebugConfigurationProvider } from './debugProvider';
import { ServeManager, ServeStatus, getWorkspaceRoot } from './serveManager';
import { runEdgeFunctionTests } from './testRunner';

export function activate(context: vscode.ExtensionContext): void {
  warnIfFunctionsMissing();

  const serveManager = new ServeManager(context);
  const statusBar = createStatusBar(context);

  serveManager.onStatusChange((status) => updateStatusBar(statusBar, status), null, context.subscriptions);

  // DebugConfigurationProvider — registered for both Initial (no launch.json) and Dynamic (Add Config)
  const provider = new EdgeDebugConfigurationProvider(serveManager);
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(
      'node',
      provider,
      vscode.DebugConfigurationProviderTriggerKind.Initial,
    ),
    vscode.debug.registerDebugConfigurationProvider(
      'node',
      provider,
      vscode.DebugConfigurationProviderTriggerKind.Dynamic,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('supabase-edge-debug.start', async () => {
      if (serveManager.status === 'running') {
        await startDebugging();
      } else {
        await serveManager.start();
        await startDebugging();
      }
    }),

    vscode.commands.registerCommand('supabase-edge-debug.stop', () => {
      serveManager.stop();
    }),

    vscode.commands.registerCommand('supabase-edge-debug.test', () => {
      runEdgeFunctionTests();
    }),
  );
}

export function deactivate(): void {
  // All disposables cleaned up via context.subscriptions
}

async function startDebugging(): Promise<void> {
  const cfg = getConfig();
  const folder = vscode.workspace.workspaceFolders?.[0];

  const started = await vscode.debug.startDebugging(folder, {
    type: 'node',
    request: 'attach',
    name: 'Supabase Edge: Attach',
    port: cfg.port,
    host: '127.0.0.1',
    localRoot: '${workspaceFolder}/' + cfg.functionsPath,
    remoteRoot: '/home/deno/functions',
    sourceMaps: true,
    skipFiles: ['<node_internals>/**'],
    restart: true,
    timeout: 10000,
  });

  if (!started) {
    vscode.window.showWarningMessage(
      `Supabase Edge Debug: Could not attach to port ${cfg.port}. ` +
        'Run "supabase functions serve --inspect-mode brk" first.',
    );
  }
}

function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.tooltip = 'Supabase Edge Functions — click to toggle serve/debug';
  context.subscriptions.push(item);
  updateStatusBar(item, 'stopped');
  item.show();
  return item;
}

function updateStatusBar(item: vscode.StatusBarItem, status: ServeStatus): void {
  switch (status) {
    case 'running':
      item.text = '$(debug-start) Edge: Running';
      item.backgroundColor = undefined;
      item.command = 'supabase-edge-debug.stop';
      break;
    case 'starting':
      item.text = '$(sync~spin) Edge: Starting';
      item.backgroundColor = undefined;
      item.command = undefined;
      break;
    case 'stopped':
      item.text = '$(circle-slash) Edge: Stopped';
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      item.command = 'supabase-edge-debug.start';
      break;
  }
}

function warnIfFunctionsMissing(): void {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) return;

  const cfg = getConfig();
  const functionsDir = path.join(workspaceRoot, cfg.functionsPath);

  if (!fs.existsSync(functionsDir)) {
    vscode.window.showWarningMessage(
      `Supabase Edge Debug: "${cfg.functionsPath}" not found in workspace. ` +
        'Check the supabaseEdgeDebug.functionsPath setting.',
    );
  }
}
