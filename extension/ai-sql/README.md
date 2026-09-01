# ai-sql (moved)

This extension now lives in its own repo as `supa_aisql`: https://github.com/JesseVent/supabase-ai-sql

The copy that used to sit here was pinned to 1.0.0 and predates the SQL-only edge function.
Running it against a project would replace `public._ai_call()` with a version that sends no
`x-ai-sql-secret` header, and every `ai_*` function would start returning 403. Install from
`supa_aisql--1.0.1.sql` in that repo, or from database.dev:

```sql
select dbdev.install('JesseVent/supa_aisql');
```
