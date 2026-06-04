import type {
  SupabaseConnection,
  TableSchema,
  TableRLSInfo,
  EdgeFunction,
  ColumnInfo,
  ForeignKeyInfo,
  RLSPolicy,
} from '@/lib/supabase-types'

// ─── Demo Connection ───

export const DEMO_CONNECTION_ID = '__demo__'

export const DEMO_CONNECTION: SupabaseConnection = {
  id: DEMO_CONNECTION_ID,
  name: 'Demo Project',
  supabaseUrl: 'https://demo-project.supabase.co',
  anonKey: 'DEMO_ANON_KEY',
  serviceRoleKey: 'DEMO_SERVICE_ROLE_KEY',
  accessToken: 'DEMO_ACCESS_TOKEN',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

// ─── Demo Tables ───

const usersColumns: ColumnInfo[] = [
  { table_name: 'users', column_name: 'id', data_type: 'uuid', is_nullable: 'NO', column_default: 'gen_random_uuid()', ordinal_position: 1 },
  { table_name: 'users', column_name: 'email', data_type: 'text', is_nullable: 'NO', column_default: null, ordinal_position: 2 },
  { table_name: 'users', column_name: 'name', data_type: 'text', is_nullable: 'YES', column_default: null, ordinal_position: 3 },
  { table_name: 'users', column_name: 'created_at', data_type: 'timestamptz', is_nullable: 'NO', column_default: 'now()', ordinal_position: 4 },
]

const postsColumns: ColumnInfo[] = [
  { table_name: 'posts', column_name: 'id', data_type: 'uuid', is_nullable: 'NO', column_default: 'gen_random_uuid()', ordinal_position: 1 },
  { table_name: 'posts', column_name: 'title', data_type: 'text', is_nullable: 'NO', column_default: null, ordinal_position: 2 },
  { table_name: 'posts', column_name: 'content', data_type: 'text', is_nullable: 'YES', column_default: null, ordinal_position: 3 },
  { table_name: 'posts', column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO', column_default: null, ordinal_position: 4 },
  { table_name: 'posts', column_name: 'created_at', data_type: 'timestamptz', is_nullable: 'NO', column_default: 'now()', ordinal_position: 5 },
]

const commentsColumns: ColumnInfo[] = [
  { table_name: 'comments', column_name: 'id', data_type: 'uuid', is_nullable: 'NO', column_default: 'gen_random_uuid()', ordinal_position: 1 },
  { table_name: 'comments', column_name: 'content', data_type: 'text', is_nullable: 'NO', column_default: null, ordinal_position: 2 },
  { table_name: 'comments', column_name: 'post_id', data_type: 'uuid', is_nullable: 'NO', column_default: null, ordinal_position: 3 },
  { table_name: 'comments', column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO', column_default: null, ordinal_position: 4 },
  { table_name: 'comments', column_name: 'created_at', data_type: 'timestamptz', is_nullable: 'NO', column_default: 'now()', ordinal_position: 5 },
]

const likesColumns: ColumnInfo[] = [
  { table_name: 'likes', column_name: 'id', data_type: 'uuid', is_nullable: 'NO', column_default: 'gen_random_uuid()', ordinal_position: 1 },
  { table_name: 'likes', column_name: 'post_id', data_type: 'uuid', is_nullable: 'NO', column_default: null, ordinal_position: 2 },
  { table_name: 'likes', column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO', column_default: null, ordinal_position: 3 },
  { table_name: 'likes', column_name: 'created_at', data_type: 'timestamptz', is_nullable: 'NO', column_default: 'now()', ordinal_position: 4 },
]

const categoriesColumns: ColumnInfo[] = [
  { table_name: 'categories', column_name: 'id', data_type: 'uuid', is_nullable: 'NO', column_default: 'gen_random_uuid()', ordinal_position: 1 },
  { table_name: 'categories', column_name: 'name', data_type: 'text', is_nullable: 'NO', column_default: null, ordinal_position: 2 },
  { table_name: 'categories', column_name: 'slug', data_type: 'text', is_nullable: 'NO', column_default: null, ordinal_position: 3 },
]

const postCategoriesColumns: ColumnInfo[] = [
  { table_name: 'post_categories', column_name: 'id', data_type: 'uuid', is_nullable: 'NO', column_default: 'gen_random_uuid()', ordinal_position: 1 },
  { table_name: 'post_categories', column_name: 'post_id', data_type: 'uuid', is_nullable: 'NO', column_default: null, ordinal_position: 2 },
  { table_name: 'post_categories', column_name: 'category_id', data_type: 'uuid', is_nullable: 'NO', column_default: null, ordinal_position: 3 },
]

const auditLogsColumns: ColumnInfo[] = [
  { table_name: 'audit_logs', column_name: 'id', data_type: 'uuid', is_nullable: 'NO', column_default: 'gen_random_uuid()', ordinal_position: 1 },
  { table_name: 'audit_logs', column_name: 'action', data_type: 'text', is_nullable: 'NO', column_default: null, ordinal_position: 2 },
  { table_name: 'audit_logs', column_name: 'table_name', data_type: 'text', is_nullable: 'NO', column_default: null, ordinal_position: 3 },
  { table_name: 'audit_logs', column_name: 'user_id', data_type: 'uuid', is_nullable: 'YES', column_default: null, ordinal_position: 4 },
  { table_name: 'audit_logs', column_name: 'created_at', data_type: 'timestamptz', is_nullable: 'NO', column_default: 'now()', ordinal_position: 5 },
]

const notificationsColumns: ColumnInfo[] = [
  { table_name: 'notifications', column_name: 'id', data_type: 'uuid', is_nullable: 'NO', column_default: 'gen_random_uuid()', ordinal_position: 1 },
  { table_name: 'notifications', column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO', column_default: null, ordinal_position: 2 },
  { table_name: 'notifications', column_name: 'message', data_type: 'text', is_nullable: 'NO', column_default: null, ordinal_position: 3 },
  { table_name: 'notifications', column_name: 'read', data_type: 'boolean', is_nullable: 'NO', column_default: 'false', ordinal_position: 4 },
  { table_name: 'notifications', column_name: 'created_at', data_type: 'timestamptz', is_nullable: 'NO', column_default: 'now()', ordinal_position: 5 },
]

// ─── Demo Foreign Keys ───

const usersFKs: ForeignKeyInfo[] = []

const postsFKs: ForeignKeyInfo[] = [
  { table_name: 'posts', column_name: 'user_id', foreign_table_name: 'users', foreign_column_name: 'id' },
]

const commentsFKs: ForeignKeyInfo[] = [
  { table_name: 'comments', column_name: 'post_id', foreign_table_name: 'posts', foreign_column_name: 'id' },
  { table_name: 'comments', column_name: 'user_id', foreign_table_name: 'users', foreign_column_name: 'id' },
]

const likesFKs: ForeignKeyInfo[] = [
  { table_name: 'likes', column_name: 'post_id', foreign_table_name: 'posts', foreign_column_name: 'id' },
  { table_name: 'likes', column_name: 'user_id', foreign_table_name: 'users', foreign_column_name: 'id' },
]

const categoriesFKs: ForeignKeyInfo[] = []

const postCategoriesFKs: ForeignKeyInfo[] = [
  { table_name: 'post_categories', column_name: 'post_id', foreign_table_name: 'posts', foreign_column_name: 'id' },
  { table_name: 'post_categories', column_name: 'category_id', foreign_table_name: 'categories', foreign_column_name: 'id' },
]

const auditLogsFKs: ForeignKeyInfo[] = [
  { table_name: 'audit_logs', column_name: 'user_id', foreign_table_name: 'users', foreign_column_name: 'id' },
]

const notificationsFKs: ForeignKeyInfo[] = [
  { table_name: 'notifications', column_name: 'user_id', foreign_table_name: 'users', foreign_column_name: 'id' },
]

// ─── Demo Table Schemas ───

export const DEMO_TABLES: TableSchema[] = [
  { tableName: 'users', columns: usersColumns, foreignKeys: usersFKs },
  { tableName: 'posts', columns: postsColumns, foreignKeys: postsFKs },
  { tableName: 'comments', columns: commentsColumns, foreignKeys: commentsFKs },
  { tableName: 'likes', columns: likesColumns, foreignKeys: likesFKs },
  { tableName: 'categories', columns: categoriesColumns, foreignKeys: categoriesFKs },
  { tableName: 'post_categories', columns: postCategoriesColumns, foreignKeys: postCategoriesFKs },
  { tableName: 'audit_logs', columns: auditLogsColumns, foreignKeys: auditLogsFKs },
  { tableName: 'notifications', columns: notificationsColumns, foreignKeys: notificationsFKs },
]

// ─── Demo RLS Info ───

const usersPolicies: RLSPolicy[] = [
  {
    schemaname: 'public',
    tablename: 'users',
    policyname: 'Users can view own profile',
    permissive: 'PERMISSIVE',
    roles: '{authenticated}',
    cmd: 'SELECT',
    qual: 'auth.uid() = id',
    with_check: null,
  },
  {
    schemaname: 'public',
    tablename: 'users',
    policyname: 'Users can update own profile',
    permissive: 'PERMISSIVE',
    roles: '{authenticated}',
    cmd: 'UPDATE',
    qual: 'auth.uid() = id',
    with_check: 'auth.uid() = id',
  },
]

const postsPolicies: RLSPolicy[] = [
  {
    schemaname: 'public',
    tablename: 'posts',
    policyname: 'Anyone can view posts',
    permissive: 'PERMISSIVE',
    roles: '{anon,authenticated}',
    cmd: 'SELECT',
    qual: 'true',
    with_check: null,
  },
  {
    schemaname: 'public',
    tablename: 'posts',
    policyname: 'Authenticated users can create posts',
    permissive: 'PERMISSIVE',
    roles: '{authenticated}',
    cmd: 'INSERT',
    qual: null,
    with_check: 'auth.uid() = user_id',
  },
  {
    schemaname: 'public',
    tablename: 'posts',
    policyname: 'Authors can update own posts',
    permissive: 'PERMISSIVE',
    roles: '{authenticated}',
    cmd: 'UPDATE',
    qual: 'auth.uid() = user_id',
    with_check: 'auth.uid() = user_id',
  },
]

const commentsPolicies: RLSPolicy[] = [
  {
    schemaname: 'public',
    tablename: 'comments',
    policyname: 'Anyone can view comments',
    permissive: 'PERMISSIVE',
    roles: '{anon,authenticated}',
    cmd: 'SELECT',
    qual: 'true',
    with_check: null,
  },
  {
    schemaname: 'public',
    tablename: 'comments',
    policyname: 'Authenticated users can comment',
    permissive: 'PERMISSIVE',
    roles: '{authenticated}',
    cmd: 'INSERT',
    qual: null,
    with_check: 'auth.uid() = user_id',
  },
]

const categoriesPolicies: RLSPolicy[] = [
  {
    schemaname: 'public',
    tablename: 'categories',
    policyname: 'Anyone can view categories',
    permissive: 'PERMISSIVE',
    roles: '{anon,authenticated}',
    cmd: 'SELECT',
    qual: 'true',
    with_check: null,
  },
]

const notificationsPolicies: RLSPolicy[] = [
  {
    schemaname: 'public',
    tablename: 'notifications',
    policyname: 'Users can view own notifications',
    permissive: 'PERMISSIVE',
    roles: '{authenticated}',
    cmd: 'SELECT',
    qual: 'auth.uid() = user_id',
    with_check: null,
  },
  {
    schemaname: 'public',
    tablename: 'notifications',
    policyname: 'Users can update own notifications',
    permissive: 'PERMISSIVE',
    roles: '{authenticated}',
    cmd: 'UPDATE',
    qual: 'auth.uid() = user_id',
    with_check: 'auth.uid() = user_id',
  },
]

export const DEMO_RLS_STATUSES: TableRLSInfo[] = [
  { tableName: 'users', rlsEnabled: true, policies: usersPolicies },
  { tableName: 'posts', rlsEnabled: true, policies: postsPolicies },
  { tableName: 'comments', rlsEnabled: true, policies: commentsPolicies },
  { tableName: 'likes', rlsEnabled: false, policies: [] },
  { tableName: 'categories', rlsEnabled: true, policies: categoriesPolicies },
  { tableName: 'post_categories', rlsEnabled: false, policies: [] },
  { tableName: 'audit_logs', rlsEnabled: false, policies: [] },
  { tableName: 'notifications', rlsEnabled: true, policies: notificationsPolicies },
]

// ─── Demo Table Rows ───

export const DEMO_TABLE_ROWS: Record<string, Record<string, unknown>[]> = {
  users: [
    { id: 'a1b2c3', email: 'john@example.com', name: 'John', created_at: '2024-01-15T10:30:00Z' },
    { id: 'd4e5f6', email: 'jane@example.com', name: 'Jane', created_at: '2024-01-16T14:22:00Z' },
    { id: 'g7h8i9', email: 'bob@example.com', name: 'Bob', created_at: '2024-02-01T09:15:00Z' },
  ],
  posts: [
    { id: 'p1', title: 'Hello World', content: 'My first post about web development', user_id: 'a1b2c3', created_at: '2024-01-16T08:00:00Z' },
    { id: 'p2', title: 'RLS Best Practices', content: 'How to secure your Supabase database', user_id: 'd4e5f6', created_at: '2024-01-20T12:00:00Z' },
    { id: 'p3', title: 'Supabase Tips', content: 'Advanced tips for Supabase users', user_id: 'a1b2c3', created_at: '2024-02-05T16:30:00Z' },
  ],
  comments: [
    { id: 'c1', content: 'Great post!', post_id: 'p1', user_id: 'd4e5f6', created_at: '2024-01-16T10:00:00Z' },
    { id: 'c2', content: 'Very helpful, thanks!', post_id: 'p2', user_id: 'a1b2c3', created_at: '2024-01-21T09:30:00Z' },
    { id: 'c3', content: 'I learned a lot from this', post_id: 'p2', user_id: 'g7h8i9', created_at: '2024-01-22T11:15:00Z' },
  ],
  likes: [
    { id: 'l1', post_id: 'p1', user_id: 'd4e5f6', created_at: '2024-01-17T08:30:00Z' },
    { id: 'l2', post_id: 'p2', user_id: 'a1b2c3', created_at: '2024-01-20T14:00:00Z' },
  ],
  categories: [
    { id: 'cat1', name: 'Technology', slug: 'technology' },
    { id: 'cat2', name: 'Science', slug: 'science' },
  ],
  post_categories: [
    { id: 'pc1', post_id: 'p1', category_id: 'cat1' },
    { id: 'pc2', post_id: 'p2', category_id: 'cat1' },
    { id: 'pc3', post_id: 'p3', category_id: 'cat2' },
  ],
  audit_logs: [
    { id: 'al1', action: 'LOGIN', table_name: 'users', user_id: 'a1b2c3', created_at: '2024-01-15T10:30:00Z' },
    { id: 'al2', action: 'INSERT', table_name: 'posts', user_id: 'a1b2c3', created_at: '2024-01-16T08:00:00Z' },
    { id: 'al3', action: 'UPDATE', table_name: 'users', user_id: 'd4e5f6', created_at: '2024-01-20T13:45:00Z' },
  ],
  notifications: [
    { id: 'n1', user_id: 'a1b2c3', message: 'Welcome to the platform!', read: false, created_at: '2024-01-15T10:31:00Z' },
    { id: 'n2', user_id: 'd4e5f6', message: 'Your post received a comment', read: true, created_at: '2024-01-16T10:01:00Z' },
  ],
}

// ─── Demo Edge Functions ───

export const DEMO_EDGE_FUNCTIONS: EdgeFunction[] = [
  {
    id: 'demo-ef-1',
    name: 'hello-world',
    status: 'ACTIVE',
    version: 3,
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-06-20T14:22:00Z',
    verify_jwt: true,
    import_map: true,
    entrypoint_path: 'supabase/functions/hello-world/index.ts',
  },
  {
    id: 'demo-ef-2',
    name: 'send-notification',
    status: 'ACTIVE',
    version: 1,
    created_at: '2024-03-10T08:15:00Z',
    updated_at: '2024-03-10T08:15:00Z',
    verify_jwt: true,
    import_map: false,
    entrypoint_path: 'supabase/functions/send-notification/index.ts',
  },
  {
    id: 'demo-ef-3',
    name: 'process-webhook',
    status: 'ACTIVE',
    version: 2,
    created_at: '2024-02-05T16:45:00Z',
    updated_at: '2024-05-18T09:30:00Z',
    verify_jwt: false,
    import_map: true,
    entrypoint_path: 'supabase/functions/process-webhook/index.ts',
  },
]

// ─── Demo Edge Function Notes ───
// Pre-populated schema annotations for demo functions (keyed by "connectionId:functionName")

export const DEMO_FUNCTION_NOTES: Record<string, string> = {
  [`${DEMO_CONNECTION_ID}:hello-world`]: [
    '@description Returns a greeting message with a timestamp.',
    '',
    '@param name string optional - Name to include in the greeting (default: World)',
  ].join('\n'),
  [`${DEMO_CONNECTION_ID}:send-notification`]: [
    '@description Send a push or email notification to a user.',
    '',
    '@param userId string required - UUID of the recipient user',
    '@param message string required - Notification body text',
    '@param channel string optional - Delivery channel: push, email, sms (default: push)',
    '@param title string optional - Notification title (push/email only)',
  ].join('\n'),
  [`${DEMO_CONNECTION_ID}:process-webhook`]: [
    '@description Handle an inbound webhook payload from a third-party service.',
    '',
    '@param event string required - Webhook event type (e.g. payment.succeeded)',
    '@param payload object required - Raw webhook payload from the provider',
    '@param signature string optional - HMAC signature header for verification',
  ].join('\n'),
}

// ─── Demo OTLP Trace ───
// Hardcoded trace used in Demo Mode for the Traces panel (no real connection needed).
// Represents a schema-inspector agent run: discover_tables → inspect_columns → count_rows.

// Precomputed OTLP nanosecond timestamps (base: 1717200000000000000ns = ~2024-06-01)
// Each value = base + offsetMs * 1_000_000
const T0  = '1717200000000000000' // 0ms
const T5  = '1717200000005000000' // 5ms
const T110 = '1717200000110000000' // 110ms
const T115 = '1717200000115000000' // 115ms
const T285 = '1717200000285000000' // 285ms
const T290 = '1717200000290000000' // 290ms
const T435 = '1717200000435000000' // 435ms
const T440 = '1717200000440000000' // 440ms

export const DEMO_OTLP_TRACE = {
  resourceSpans: [{
    resource: {
      attributes: [{ key: 'service.name', value: { stringValue: 'supabase-edge-agent' } }],
    },
    scopeSpans: [{
      scope: { name: 'agent-query', version: '1.0.0' },
      spans: [
        {
          traceId: 'aabbccdd001122334455667788990011',
          spanId: 'aabb001122334455',
          name: 'agent_query',
          kind: 'SPAN_KIND_INTERNAL' as const,
          startTimeUnixNano: T0,
          endTimeUnixNano: T440,
          attributes: [
            { key: 'service.name', value: { stringValue: 'supabase-edge-agent' } },
            { key: 'gen_ai.agent.name', value: { stringValue: 'schema-inspector' } },
          ],
          status: { code: 'STATUS_CODE_OK' as const },
          flags: 1,
        },
        {
          traceId: 'aabbccdd001122334455667788990011',
          spanId: 'bbcc001122334455',
          parentSpanId: 'aabb001122334455',
          name: 'discover_tables',
          kind: 'SPAN_KIND_INTERNAL' as const,
          startTimeUnixNano: T5,
          endTimeUnixNano: T110,
          attributes: [
            { key: 'db.system', value: { stringValue: 'postgresql' } },
            { key: 'db.statement', value: { stringValue: "SELECT table_name, size FROM information_schema.tables WHERE table_schema='public' LIMIT 5" } },
            { key: 'gen_ai.agent.step', value: { stringValue: '1' } },
            { key: 'result.count', value: { stringValue: '3' } },
          ],
          status: { code: 'STATUS_CODE_OK' as const },
          flags: 1,
        },
        {
          traceId: 'aabbccdd001122334455667788990011',
          spanId: 'ccdd001122334455',
          parentSpanId: 'aabb001122334455',
          name: 'inspect_columns',
          kind: 'SPAN_KIND_INTERNAL' as const,
          startTimeUnixNano: T115,
          endTimeUnixNano: T285,
          attributes: [
            { key: 'db.system', value: { stringValue: 'postgresql' } },
            { key: 'db.statement', value: { stringValue: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='users'" } },
            { key: 'gen_ai.agent.step', value: { stringValue: '2' } },
            { key: 'db.table', value: { stringValue: 'users' } },
            { key: 'result.count', value: { stringValue: '6' } },
          ],
          status: { code: 'STATUS_CODE_OK' as const },
          flags: 1,
        },
        {
          traceId: 'aabbccdd001122334455667788990011',
          spanId: 'ddee001122334455',
          parentSpanId: 'aabb001122334455',
          name: 'count_rows',
          kind: 'SPAN_KIND_INTERNAL' as const,
          startTimeUnixNano: T290,
          endTimeUnixNano: T435,
          attributes: [
            { key: 'db.system', value: { stringValue: 'postgresql' } },
            { key: 'db.statement', value: { stringValue: 'SELECT COUNT(*) FROM users' } },
            { key: 'gen_ai.agent.step', value: { stringValue: '3' } },
            { key: 'db.table', value: { stringValue: 'users' } },
            { key: 'result.row_count', value: { stringValue: '117482' } },
          ],
          status: { code: 'STATUS_CODE_OK' as const },
          flags: 1,
        },
      ],
    }],
  }],
}

export const DEMO_TRACE_STEPS = [
  { name: 'discover_tables', durationMs: 105, result: [{ table_name: 'users', size: '12 MB' }, { table_name: 'posts', size: '8 MB' }, { table_name: 'comments', size: '4 MB' }] },
  { name: 'inspect_columns', durationMs: 170, result: { table: 'users', columns: [{ column_name: 'id', data_type: 'uuid', is_nullable: 'NO' }, { column_name: 'email', data_type: 'text', is_nullable: 'NO' }, { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }] } },
  { name: 'count_rows', durationMs: 145, result: { table: 'users', rowCount: 117482 } },
]
