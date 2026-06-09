// supabase/functions/insert-person/index.ts
//
// @description Inserts a single OMOP CDM v5.4 person record into public.person.
//   Returns the created row (201) or a structured error (400 on missing/invalid body,
//   401 unauthorized, 409 on duplicate person_id, 500 on insert failure).
//
// @param person_id number required - Unique OMOP person identifier (primary key)
// @param gender_concept_id number required - OMOP concept ID for gender (e.g. 8507 male, 8532 female)
// @param year_of_birth number required - 4-digit year of birth
// @param race_concept_id number required - OMOP concept ID for race (e.g. 8527 white)
// @param ethnicity_concept_id number required - OMOP concept ID for ethnicity (e.g. 38003564 not hispanic)
// @param month_of_birth number optional - Month of birth (1-12)
// @param day_of_birth number optional - Day of birth (1-31)
// @param birth_datetime string optional - Full birth datetime in ISO 8601 format
// @param location_id number optional - FK to public.location
// @param provider_id number optional - FK to public.provider (primary care provider)
// @param care_site_id number optional - FK to public.care_site
// @param person_source_value string optional - Source system patient identifier (e.g. PAT-123456)
// @param gender_source_value string optional - Raw gender value from source system
// @param gender_source_concept_id number optional - Source vocabulary concept for gender
// @param race_source_value string optional - Raw race value from source system
// @param race_source_concept_id number optional - Source vocabulary concept for race
// @param ethnicity_source_value string optional - Raw ethnicity value from source system
// @param ethnicity_source_concept_id number optional - Source vocabulary concept for ethnicity

import { withSupabase } from 'npm:@supabase/server'

interface PersonInsert {
  person_id: number
  gender_concept_id: number
  year_of_birth: number
  race_concept_id: number
  ethnicity_concept_id: number
  month_of_birth?: number
  day_of_birth?: number
  birth_datetime?: string
  location_id?: number
  provider_id?: number
  care_site_id?: number
  person_source_value?: string
  gender_source_value?: string
  gender_source_concept_id?: number
  race_source_value?: string
  race_source_concept_id?: number
  ethnicity_source_value?: string
  ethnicity_source_concept_id?: number
}

const REQUIRED_FIELDS: (keyof PersonInsert)[] = [
  'person_id',
  'gender_concept_id',
  'year_of_birth',
  'race_concept_id',
  'ethnicity_concept_id',
]

export default {
  fetch: withSupabase({ auth: ['secret', 'publishable'] }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let body: PersonInsert
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const missing = REQUIRED_FIELDS.filter((f) => body[f] === undefined || body[f] === null)
    if (missing.length > 0) {
      return new Response(
        JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { data, error } = await ctx.supabaseAdmin
      .from('person')
      // deno-lint-ignore no-explicit-any
      .insert(body as unknown as any)
      .select()
      .single()

    if (error) {
      const status = error.code === '23505' ? 409 : 500
      return new Response(JSON.stringify({ error: error.message, code: error.code }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ data }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  }),
}
