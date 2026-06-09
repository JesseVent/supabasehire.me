import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { getConfig } from './config'
import { getWorkspaceRoot } from './serveManager'

export async function runEdgeFunctionTests(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot()
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Supabase Edge Debug: No workspace folder found.')
    return
  }

  const cfg = getConfig()
  const testsDir = path.join(workspaceRoot, cfg.functionsPath, 'tests')

  // Try to resolve a test file from the currently active editor
  const testFile = resolveTestFile(workspaceRoot, cfg.functionsPath)

  let testTarget: string
  if (testFile && fs.existsSync(testFile)) {
    testTarget = testFile
  } else if (fs.existsSync(testsDir)) {
    // Fall back to running all tests in the tests directory
    testTarget = testsDir
  } else {
    vscode.window.showWarningMessage(
      `Supabase Edge Debug: No test file found. ` +
        `Open a function file or create tests in ${cfg.functionsPath}/tests/.`
    )
    return
  }

  const terminal = vscode.window.createTerminal({
    name: 'Supabase Edge Tests',
    cwd: workspaceRoot,
    iconPath: new vscode.ThemeIcon('beaker'),
  })

  terminal.show(true)
  terminal.sendText(`deno test --allow-all "${testTarget}"`)
}

function resolveTestFile(workspaceRoot: string, functionsPath: string): string | undefined {
  const editor = vscode.window.activeTextEditor
  if (!editor) return undefined

  const filePath = editor.document.uri.fsPath
  const functionsDir = path.join(workspaceRoot, functionsPath)

  // Must be inside the functions directory
  if (!filePath.startsWith(functionsDir)) return undefined

  // Extract the function name: functions/<fn-name>/index.ts → fn-name
  const relative = path.relative(functionsDir, filePath)
  const parts = relative.split(path.sep)

  // Skip _shared and tests dirs
  if (parts[0].startsWith('_') || parts[0] === 'tests') return undefined

  const functionName = parts[0]
  return path.join(functionsDir, 'tests', `${functionName}-test.ts`)
}
