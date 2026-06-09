import * as vscode from 'vscode'
import { getConfig } from './config'

export type ServeStatus = 'stopped' | 'starting' | 'running'

export class ServeManager {
  private terminal: vscode.Terminal | undefined
  private _status: ServeStatus = 'stopped'
  private readonly _onStatusChange = new vscode.EventEmitter<ServeStatus>()
  readonly onStatusChange = this._onStatusChange.event

  constructor(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.window.onDidCloseTerminal((closed) => {
        if (closed === this.terminal) {
          this.terminal = undefined
          this.setStatus('stopped')
        }
      }),
      this._onStatusChange
    )
  }

  get status(): ServeStatus {
    return this._status
  }

  private setStatus(s: ServeStatus): void {
    this._status = s
    this._onStatusChange.fire(s)
  }

  async start(): Promise<void> {
    if (this.terminal) {
      this.terminal.show(true)
      return
    }

    const workspaceRoot = getWorkspaceRoot()
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Supabase Edge Debug: No workspace folder found.')
      return
    }

    const cfg = getConfig()
    const command = `${cfg.supabaseCli} functions serve --inspect-mode ${cfg.inspectMode}`

    this.setStatus('starting')

    this.terminal = vscode.window.createTerminal({
      name: 'Supabase Edge Serve',
      cwd: workspaceRoot,
      iconPath: new vscode.ThemeIcon('debug'),
      isTransient: false,
    })

    this.terminal.show(true)
    this.terminal.sendText(command)

    // Give the Deno process ~1.5s to open the V8 inspector before marking running.
    // If the terminal closes immediately (e.g. CLI not found), onDidCloseTerminal fires
    // and status reverts to 'stopped'.
    await new Promise<void>((resolve) => setTimeout(resolve, 1500))

    if (this.terminal) {
      this.setStatus('running')
    }
  }

  stop(): void {
    if (this.terminal) {
      this.terminal.sendText('\x03') // Ctrl-C → SIGINT
      setTimeout(() => {
        this.terminal?.dispose()
        this.terminal = undefined
      }, 500)
    }
    this.setStatus('stopped')
  }
}

export function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
}
