import * as vscode from 'vscode';

export interface EdgeDebugConfig {
  port: number;
  inspectMode: 'brk' | 'wait';
  functionsPath: string;
  supabaseCli: string;
}

export function getConfig(): EdgeDebugConfig {
  const cfg = vscode.workspace.getConfiguration('supabaseEdgeDebug');
  return {
    port: cfg.get<number>('port', 8083),
    inspectMode: cfg.get<'brk' | 'wait'>('inspectMode', 'brk'),
    functionsPath: cfg.get<string>('functionsPath', 'supabase/functions'),
    supabaseCli: cfg.get<string>('supabaseCli', 'supabase'),
  };
}
