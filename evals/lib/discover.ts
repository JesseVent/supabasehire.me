import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const SKILLS_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	"../skills",
);

export type Reference = {
	file: string;
	title: string;
	skill: string;
};

export type SkillMeta = {
	name: string;
	description: string;
	references: Reference[];
};

export function discoverSkills(): SkillMeta[] {
	return readdirSync(SKILLS_DIR, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.filter((name) => existsSync(join(SKILLS_DIR, name, "SKILL.md")))
		.map((name) => {
			const { data } = matter(
				readFileSync(join(SKILLS_DIR, name, "SKILL.md"), "utf8"),
			);
			const refsDir = join(SKILLS_DIR, name, "references");
			const references: Reference[] = existsSync(refsDir)
				? readdirSync(refsDir)
						.filter((f) => f.endsWith(".md") && !f.startsWith("_"))
						.map((f) => {
							const { data: rd } = matter(
								readFileSync(join(refsDir, f), "utf8"),
							);
							return { file: f, title: String(rd.title ?? f), skill: name };
						})
				: [];
			return { name, description: String(data.description ?? ""), references };
		});
}

export function allReferenceIds(skills: SkillMeta[]): string[] {
	return skills.flatMap((s) => s.references.map((r) => `${s.name}/${r.file}`));
}
