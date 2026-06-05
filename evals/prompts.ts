export type Category =
	| "schema"
	| "security"
	| "performance"
	| "connections"
	| "data-ops"
	| "locking"
	| "monitoring"
	| "general";

export type Prompt = { text: string; category: Category };

export const prompts: Prompt[] = [
	// ── Schema & table design ────────────────────────────────────────────────
	{ text: "I want to create a supabase table", category: "schema" },
	{ text: "how do I create a users table", category: "schema" },
	{ text: "add a new table for blog posts", category: "schema" },
	{ text: "what primary key should I use, UUID or serial?", category: "schema" },
	{ text: "I need to store user profiles", category: "schema" },
	{ text: "how do I add a foreign key relationship", category: "schema" },
	{ text: "what column type should I use for JSON data", category: "schema" },
	{ text: "best data type for timestamps in postgres", category: "schema" },
	{ text: "I need to prevent duplicate email addresses", category: "schema" },
	{ text: "my table is growing huge, how do I handle it", category: "schema" },
	{ text: "add a column that references another table", category: "schema" },
	{ text: "should column names be lowercase or uppercase", category: "schema" },
	{ text: "create a many-to-many relationship between tables", category: "schema" },
	{ text: "I need to partition a really large table", category: "schema" },
	{ text: "add a constraint to validate column values", category: "schema" },
	{ text: "how do I make a column not null", category: "schema" },
	{ text: "store user settings as key-value pairs", category: "schema" },
	{ text: "I need an auto-incrementing ID column", category: "schema" },
	{ text: "how do I model a tree hierarchy in postgres", category: "schema" },
	{ text: "what's wrong with using TEXT for everything", category: "schema" },

	// ── Security & RLS ───────────────────────────────────────────────────────
	{ text: "users should only see their own data", category: "security" },
	{ text: "how do I set up row level security", category: "security" },
	{ text: "restrict table access based on the logged-in user", category: "security" },
	{ text: "I'm building a multi-tenant app", category: "security" },
	{ text: "give read-only access to an analytics role", category: "security" },
	{ text: "RLS is making my queries really slow", category: "security" },
	{ text: "how do I write an RLS policy", category: "security" },
	{ text: "apply least privilege to database roles", category: "security" },
	{ text: "enable RLS on an existing table", category: "security" },
	{ text: "how do I isolate data between tenants", category: "security" },
	{ text: "grant minimal permissions to a service account", category: "security" },
	{ text: "my RLS policies aren't working as expected", category: "security" },
	{ text: "I accidentally gave too many permissions", category: "security" },

	// ── Query performance & indexes ──────────────────────────────────────────
	{ text: "my queries are slow", category: "performance" },
	{ text: "how do I speed up this query", category: "performance" },
	{ text: "what index should I add", category: "performance" },
	{ text: "I'm getting N+1 queries in my app", category: "performance" },
	{ text: "pagination is really slow on large tables", category: "performance" },
	{ text: "I need full text search", category: "performance" },
	{ text: "how do I query JSONB columns efficiently", category: "performance" },
	{ text: "composite index or multiple separate indexes", category: "performance" },
	{ text: "when should I use a partial index", category: "performance" },
	{ text: "SELECT * is probably bad right", category: "performance" },
	{ text: "my count query takes forever", category: "performance" },
	{ text: "index on a low-cardinality column like status", category: "performance" },
	{ text: "how do I avoid sequential scans", category: "performance" },
	{ text: "I need to filter and sort by multiple columns", category: "performance" },
	{ text: "GIN vs GiST vs BRIN indexes", category: "performance" },
	{ text: "how do I search across multiple text columns", category: "performance" },

	// ── Connection management ────────────────────────────────────────────────
	{ text: "I keep getting too many connections error", category: "connections" },
	{ text: "how do I set up connection pooling", category: "connections" },
	{ text: "what is pgbouncer", category: "connections" },
	{ text: "how many database connections should I allow", category: "connections" },
	{ text: "I'm getting connection timeout errors", category: "connections" },
	{ text: "prepared statements not working with pooler", category: "connections" },
	{ text: "idle connections piling up", category: "connections" },
	{ text: "supabase connection limits", category: "connections" },
	{ text: "transaction mode vs session mode pooling", category: "connections" },
	{ text: "running out of connections in production", category: "connections" },
	{ text: "should I use a connection pool from my app", category: "connections" },

	// ── Data operations ──────────────────────────────────────────────────────
	{ text: "how do I insert many rows at once", category: "data-ops" },
	{ text: "I need to upsert records", category: "data-ops" },
	{ text: "how do I avoid duplicate inserts", category: "data-ops" },
	{ text: "bulk import a CSV into postgres", category: "data-ops" },
	{ text: "insert or update in a single query", category: "data-ops" },
	{ text: "how do I paginate through millions of rows", category: "data-ops" },
	{ text: "cursor-based vs offset pagination", category: "data-ops" },
	{ text: "process records in batches without locking everything", category: "data-ops" },
	{ text: "efficiently migrate data between tables", category: "data-ops" },
	{ text: "how do I handle concurrent upserts", category: "data-ops" },

	// ── Locking & concurrency ────────────────────────────────────────────────
	{ text: "my queries are blocking each other", category: "locking" },
	{ text: "how do I avoid deadlocks in postgres", category: "locking" },
	{ text: "long running transactions blocking other queries", category: "locking" },
	{ text: "I need to process a job queue concurrently", category: "locking" },
	{ text: "I need distributed application-level locking", category: "locking" },
	{ text: "transactions are timing out waiting for locks", category: "locking" },
	{ text: "how do SKIP LOCKED queues work", category: "locking" },
	{ text: "lock contention is killing performance", category: "locking" },
	{ text: "how do I safely run migrations without downtime", category: "locking" },

	// ── Monitoring & observability ───────────────────────────────────────────
	{ text: "how do I find slow queries", category: "monitoring" },
	{ text: "explain this query with EXPLAIN ANALYZE", category: "monitoring" },
	{ text: "postgres query statistics and logging", category: "monitoring" },
	{ text: "table bloat and when to vacuum", category: "monitoring" },
	{ text: "how do I monitor database performance", category: "monitoring" },
	{ text: "autovacuum is not keeping up", category: "monitoring" },
	{ text: "track which queries run most often", category: "monitoring" },
	{ text: "how do I read a query plan", category: "monitoring" },

	// ── General / ambiguous ──────────────────────────────────────────────────
	{ text: "I'm building a new app with Supabase", category: "general" },
	{ text: "my Supabase database is running slow", category: "general" },
	{ text: "best practices for a Supabase project", category: "general" },
	{ text: "I'm new to Supabase, where do I start", category: "general" },
	{ text: "how do I structure my database schema", category: "general" },
	{ text: "migrating from Firebase to Supabase", category: "general" },
	{ text: "set up Supabase for a SaaS app", category: "general" },
	{ text: "how do I use Supabase auth with my tables", category: "general" },
	{ text: "I need to optimize my Supabase database", category: "general" },
	{ text: "what are the Supabase database limits", category: "general" },
];
