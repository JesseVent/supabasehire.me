// supabase/functions/insert-person/index.ts
// Inserts a single OMOP CDM v5.4 person record into public.person

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { isAuthorized } from '../_shared/auth.ts';

interface PersonInsert {
  person_id: number;
  gender_concept_id: number;
  year_of_birth: number;
  race_concept_id: number;
  ethnicity_concept_id: number;
  month_of_birth?: number;
  day_of_birth?: number;
  birth_datetime?: string;
  location_id?: number;
  provider_id?: number;
  care_site_id?: number;
  person_source_value?: string;
  gender_source_value?: string;
  gender_source_concept_id?: number;
  race_source_value?: string;
  race_source_concept_id?: number;
  ethnicity_source_value?: string;
  ethnicity_source_concept_id?: number;
}

const REQUIRED_FIELDS: (keyof PersonInsert)[] = [
  'person_id',
  'gender_concept_id',
  'year_of_birth',
  'race_concept_id',
  'ethnicity_concept_id',
];


Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: PersonInsert;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const missing = REQUIRED_FIELDS.filter((f) => body[f] === undefined || body[f] === null);
  if (missing.length > 0) {
    return new Response(
      JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    secretKeys['default'] ?? '',
  );

  const { data, error } = await supabase
    .from('person')
    .insert(body)
    .select()
    .single();

  if (error) {
    const status = error.code === '23505' ? 409 : 500;
    return new Response(JSON.stringify({ error: error.message, code: error.code }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ data }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
});
