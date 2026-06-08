import * as net from 'net';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig } from './config';
import { ServeManager } from './serveManager';

interface EdgeAttachConfig extends vscode.DebugConfiguration {
  type: 'node';
  request: 'attach';
  port: number;
  host: string;
  localRoot: string;
  remoteRoot: string;
  sourceMaps: boolean;
  skipFiles: string[];
  restart: boolean;
  timeout: number;
}

export class EdgeDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  constructor(private readonly serveManager: ServeManager) {}

  provideDebugConfigurations(
    folder: vscode.WorkspaceFolder | undefined,
  ): vscode.DebugConfiguration[] {
    const cfg = getConfig();
    return [
      {
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
      },
    ];
  }

  async resolveDebugConfiguration(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
  ): Promise<vscode.DebugConfiguration | undefined> {
    const cfg = getConfig();

    // Only intercept attach configs targeting our port or named for Supabase/Edge
    const isOurs =
      config.request === 'attach' &&
      (config.port === cfg.port ||
        (typeof config.name === 'string' &&
          /supabase|edge/i.test(config.name)));

    if (!isOurs) {
      return config;
    }

    if (this.serveManager.status === 'stopped') {
      await this.serveManager.start();
    }

    const ready = await waitForInspector(cfg.port, 8000);
    if (!ready) {
      vscode.window.showErrorMessage(
        `Supabase Edge Debug: V8 inspector not responding on port ${cfg.port}. ` +
          'Is supabase functions serve running? (requires CLI ≥ v1.171.0)',
      );
      return undefined;
    }

    const workspaceRoot = folder?.uri.fsPath ?? '';
    const resolved: EdgeAttachConfig = {
      type: 'node',
      request: 'attach',
      name: config.name ?? 'Supabase Edge: Attach',
      port: (config.port as number | undefined) ?? cfg.port,
      host: (config.host as string | undefined) ?? '127.0.0.1',
      localRoot:
        (config.localRoot as string | undefined) ??
        path.join(workspaceRoot, cfg.functionsPath),
      remoteRoot: (config.remoteRoot as string | undefined) ?? '/home/deno/functions',
      sourceMaps: (config.sourceMaps as boolean | undefined) ?? true,
      skipFiles: (config.skipFiles as string[] | undefined) ?? ['<node_internals>/**'],
      restart: (config.restart as boolean | undefined) ?? true,
      timeout: (config.timeout as number | undefined) ?? 10000,
    };

    return resolved;
  }
}

function waitForInspector(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;

    const attempt = () => {
      const socket = net.createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() < deadline) {
          setTimeout(attempt, 300);
        } else {
          resolve(false);
        }
      });
    };

    attempt();
  });
}
