#!/usr/bin/env node
/**
 * Skill coverage eval runner.
 *
 * Uses OpenRouter (OpenAI-compatible) so any cheap model works.
 *
 * Usage:
 *   pnpm eval                               # run all prompts
 *   pnpm eval --concurrency 15              # control parallelism (default: 12)
 *   pnpm eval --model mistralai/mistral-7b-instruct
 *
 * Requires: OPENROUTER_API_KEY env var
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverSkills } from "./lib/discover.ts";
import { prompts } from "./prompts.ts";
import { pickContext, type ContextMessage } from "./contexts.ts";

const RESULTS_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	"results",
);
const RESULTS_FILE = join(RESULTS_DIR, "matrix.json");

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag: string, fallback: string): string {
	const i = args.indexOf(flag);
	return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const concurrency = Number(getArg("--concurrency", "12"));
const model = getArg("--model", "google/gemini-2.5-flash-lite");
const noisy = args.includes("--noisy");
const contextName = getArg("--context", ""); // pin a specific context template

// ── Types ─────────────────────────────────────────────────────────────────────

export type EvalResult = {
	prompt: string;
	category: string;
	skills: string[];
	/** Full IDs: "skill-name/reference-file.md" */
	references: string[];
};

export type MatrixData = {
	run_at: string;
	model: string;
	noisy: boolean;
	context_template?: string;
	total_prompts: number;
	results: EvalResult[];
};

// ── OpenRouter call ───────────────────────────────────────────────────────────

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_KEY) {
	console.error("Missing OPENROUTER_API_KEY");
	process.exit(1);
}

const skills = discoverSkills();

const SKILL_BLOCK = skills
	.map(
		(s) =>
			`Skill "${s.name}"\nDescription: ${s.description}\nReferences:\n${
				s.references
					.map((r) => `  - ${s.name}/${r.file}: ${r.title}`)
					.join("\n")
			}`,
	)
	.join("\n\n");

const SYSTEM = `You are simulating a Claude Code agent that has Supabase skills loaded.
For a given user request decide:
1. Which skills would be triggered (based on each skill's description)
2. Which specific reference files from those skills would the agent read to answer the request

Rules:
- Only include references that are directly relevant to answering the request
- Do NOT include all references by default — be selective
- A reference is relevant only if it directly helps answer what the user asked
- Return ONLY valid JSON: {"skills": ["skill-name", ...], "references": ["skill-name/file.md", ...]}`;

async function evaluate(
	prompt: string,
	contextMessages: ContextMessage[] = [],
): Promise<{ skills: string[]; references: string[] }> {
	const finalUserMsg = `User request: "${prompt}"\n\n${SKILL_BLOCK}\n\nWhich skills trigger? Which reference files would the agent load?`;

	const messages = [
		...contextMessages,
		{ role: "user" as const, content: finalUserMsg },
	];

	const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${OPENROUTER_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model,
			max_tokens: 300,
			messages: [{ role: "system", content: SYSTEM }, ...messages],
		}),
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`OpenRouter ${res.status}: ${body}`);
	}

	const data = await res.json() as { choices: { message: { content: string } }[] };
	const text = data.choices?.[0]?.message?.content?.trim() ?? "{}";
	try {
		const match = text.match(/\{[\s\S]*\}/);
		const parsed = match ? JSON.parse(match[0]) : {};
		return {
			skills: Array.isArray(parsed.skills) ? parsed.skills : [],
			references: Array.isArray(parsed.references) ? parsed.references : [],
		};
	} catch {
		return { skills: [], references: [] };
	}
}

// ── Semaphore ─────────────────────────────────────────────────────────────────

class Semaphore {
	private slots: number;
	private queue: (() => void)[] = [];
	constructor(n: number) {
		this.slots = n;
	}
	acquire() {
		if (this.slots > 0) {
			this.slots--;
			return Promise.resolve();
		}
		return new Promise<void>((res) => this.queue.push(res));
	}
	release() {
		this.slots++;
		this.queue.shift()?.();
	}
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
	mkdirSync(RESULTS_DIR, { recursive: true });

	const outFile = noisy
		? join(RESULTS_DIR, "matrix-noisy.json")
		: RESULTS_FILE;

	// Resume from previous run if exists
	const previous: Map<string, EvalResult> = new Map();
	if (existsSync(outFile)) {
		const prev: MatrixData = JSON.parse(readFileSync(outFile, "utf8"));
		for (const r of prev.results) previous.set(r.prompt, r);
	}

	const todo = prompts.filter((p) => !previous.has(p.text));
	const cached = prompts.filter((p) => previous.has(p.text));

	// For noisy runs: each prompt gets its own random context draw so the
	// noise varies across prompts (simulates different points mid-session).
	// Pin with --context <name> to use the same template for all prompts.
	const pinned = contextName ? pickContext(contextName) : null;

	console.log(`\nRunning eval  model=${model}  concurrency=${concurrency}${noisy ? `  noisy=true${pinned ? ` (${pinned.name})` : " (random)"}` : ""}`);
	console.log(`Prompts: ${prompts.length} total  ${todo.length} new  ${cached.length} cached\n`);

	let done = 0;
	const sem = new Semaphore(concurrency);
	const newResults = await Promise.all(
		todo.map(async ({ text, category }) => {
			await sem.acquire();
			try {
				const ctx = noisy ? (pinned ?? pickContext()).messages : [];
				const { skills: hitSkills, references } = await evaluate(text, ctx);
				done++;
				const pct = Math.round((done / todo.length) * 100);
				process.stdout.write(
					`\r  [${pct}%] ${done}/${todo.length}  ${text.slice(0, 55).padEnd(55)}`,
				);
				return {
					prompt: text,
					category,
					skills: hitSkills,
					references,
				} satisfies EvalResult;
			} finally {
				sem.release();
			}
		}),
	);

	console.log("\n");

	const allResults: EvalResult[] = [
		...cached.map((p) => previous.get(p.text)!),
		...newResults,
	].sort(
		(a, b) =>
			prompts.findIndex((p) => p.text === a.prompt) -
			prompts.findIndex((p) => p.text === b.prompt),
	);

	const ctx0 = noisy ? (pinned ?? pickContext()) : null;
	const matrix: MatrixData = {
		run_at: new Date().toISOString(),
		model,
		noisy,
		...(noisy && { context_template: pinned?.name ?? "random" }),
		total_prompts: allResults.length,
		results: allResults,
	};

	writeFileSync(outFile, JSON.stringify(matrix, null, 2));
	console.log(`Saved → ${outFile}`);
	console.log(
		noisy
			? `Run "pnpm eval:report --noisy" to compare against the clean run.\n`
			: `Run "pnpm eval:report" to view the coverage matrix.\n`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
