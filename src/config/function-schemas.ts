// Built-in schema annotations for functions deployed in this project.
// Used as a fallback when source cannot be read (e.g. eszip bundles from CLI deploys).
// Keyed by function slug (the `name` field from the Management API).
export const BUILT_IN_FUNCTION_SCHEMAS: Record<string, string> = {
  'agent-query': [
    '@description Demonstrates OpenTelemetry instrumentation in a Supabase edge function.',
    '  Runs 3 chained SQL queries against the project database (discover_tables →',
    '  inspect_columns → count_rows), wraps each in an OTLP span under a single root',
    '  span, and returns { steps, otlpTrace } for rendering in AgentPrism.',
    '  Takes no JSON body — only auth via apikey/Authorization header.',
  ].join('\n'),

  'catalog-generator': [
    '@description Generates AI-authored data-catalog descriptions for a single table.',
    '  Takes a column profile (types, null %, distinct counts, sample values), prompts',
    '  GPT-4o, and returns { tableDescription, columnDescriptions } as plain-English',
    '  business definitions. Requires the OPENAI_API_KEY secret.',
    '',
    '@param tableName string required - Name of the target table (without schema prefix)',
    '@param schemaName string required - PostgreSQL schema containing the table (e.g. public)',
    '@param rowCount number required - Total row count for the table',
    '@param columns array required - Column profiles: { name, type, nullable, nullPct, distinctCount, sampleValues[] }',
  ].join('\n'),

  'insert-person': [
    '@description Inserts a single OMOP CDM v5.4 person record into public.person.',
    '  Returns the created row (201) or a structured error (400 on missing/invalid body,',
    '  401 unauthorized, 409 on duplicate person_id, 500 on insert failure).',
    '',
    '@param person_id number required - Unique OMOP person identifier (primary key)',
    '@param gender_concept_id number required - OMOP concept ID for gender (e.g. 8507 male, 8532 female)',
    '@param year_of_birth number required - 4-digit year of birth',
    '@param race_concept_id number required - OMOP concept ID for race (e.g. 8527 white)',
    '@param ethnicity_concept_id number required - OMOP concept ID for ethnicity (e.g. 38003564 not hispanic)',
    '@param month_of_birth number optional - Month of birth (1-12)',
    '@param day_of_birth number optional - Day of birth (1-31)',
    '@param birth_datetime string optional - Full birth datetime in ISO 8601 format',
    '@param location_id number optional - FK to public.location',
    '@param provider_id number optional - FK to public.provider (primary care provider)',
    '@param care_site_id number optional - FK to public.care_site',
    '@param person_source_value string optional - Source system patient identifier (e.g. PAT-123456)',
    '@param gender_source_value string optional - Raw gender value from source system',
    '@param gender_source_concept_id number optional - Source vocabulary concept for gender',
    '@param race_source_value string optional - Raw race value from source system',
    '@param race_source_concept_id number optional - Source vocabulary concept for race',
    '@param ethnicity_source_value string optional - Raw ethnicity value from source system',
    '@param ethnicity_source_concept_id number optional - Source vocabulary concept for ethnicity',
  ].join('\n'),
}
