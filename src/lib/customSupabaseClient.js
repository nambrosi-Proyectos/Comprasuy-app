// Cliente de datos del sistema. Reemplaza a Supabase: mantiene la misma forma de uso
// (supabase.from('tabla').select().eq()..., supabase.rpc, supabase.functions.invoke)
// pero todo va contra la API propia del servidor, que guarda los datos en MySQL.

const toError = (body, status) => {
  const err = body?.error;
  if (err && typeof err === 'object') return { message: err.message || 'Error inesperado.', code: err.code, status };
  return { message: typeof err === 'string' ? err : `Error ${status} del servidor.`, status };
};

/** Llama a la API. Devuelve { ok, status, body }. Nunca lanza por errores HTTP. */
export async function apiRequest(path, { method = 'GET', body } = {}) {
  try {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { error: text.slice(0, 300) };
    }
    return { ok: response.ok, status: response.status, body: parsed };
  } catch (error) {
    return { ok: false, status: 0, body: { error: 'No se pudo conectar con el servidor. Revisá tu conexión.' } };
  }
}

class QueryBuilder {
  constructor(table) {
    this.query = { table, action: 'select', select: '*', filters: [], order: [] };
  }

  select(columns = '*', options = {}) {
    if (this.query.action === 'select') {
      this.query.select = columns;
      if (options.count) this.query.count = options.count;
      if (options.head) this.query.head = true;
    } else {
      this.query.returning = true;
      this.query.select = columns;
    }
    return this;
  }

  insert(values) {
    Object.assign(this.query, { action: 'insert', values, select: '*' });
    return this;
  }

  upsert(values, options = {}) {
    Object.assign(this.query, {
      action: 'upsert',
      values,
      select: '*',
      onConflict: options.onConflict,
      ignoreDuplicates: Boolean(options.ignoreDuplicates),
    });
    return this;
  }

  update(values) {
    Object.assign(this.query, { action: 'update', values, select: '*' });
    return this;
  }

  delete() {
    Object.assign(this.query, { action: 'delete', select: '*' });
    return this;
  }

  filter(column, type, value) {
    this.query.filters.push({ type, column, value });
    return this;
  }

  eq(column, value) { return this.filter(column, 'eq', value); }
  neq(column, value) { return this.filter(column, 'neq', value); }
  gt(column, value) { return this.filter(column, 'gt', value); }
  gte(column, value) { return this.filter(column, 'gte', value); }
  lt(column, value) { return this.filter(column, 'lt', value); }
  lte(column, value) { return this.filter(column, 'lte', value); }
  like(column, value) { return this.filter(column, 'like', value); }
  ilike(column, value) { return this.filter(column, 'ilike', value); }
  in(column, values) { return this.filter(column, 'in', values); }
  is(column, value) { return this.filter(column, 'is', value); }

  match(conditions) {
    Object.entries(conditions).forEach(([column, value]) => this.eq(column, value));
    return this;
  }

  or(expression) {
    this.query.filters.push({ type: 'or', value: expression });
    return this;
  }

  order(column, { ascending = true } = {}) {
    this.query.order.push({ column, ascending });
    return this;
  }

  limit(count) {
    this.query.limit = count;
    return this;
  }

  range(from, to) {
    this.query.offset = from;
    this.query.limit = to - from + 1;
    return this;
  }

  single() {
    this.query.single = 'single';
    return this;
  }

  maybeSingle() {
    this.query.single = 'maybe';
    return this;
  }

  async execute() {
    const { ok, status, body } = await apiRequest('/api/db/query', { method: 'POST', body: this.query });
    if (!ok) return { data: null, error: toError(body, status), count: null, status };
    return { data: body?.data ?? null, error: null, count: body?.count ?? null, status };
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Ejecuta una función del servidor. Si tarda, consulta cada 2 segundos hasta que termina. */
async function invoke(name, { body } = {}) {
  let response = await apiRequest(`/api/functions/${encodeURIComponent(name)}`, { method: 'POST', body: body ?? {} });
  const startedAt = Date.now();
  while (response.status === 202 && response.body?.id) {
    if (Date.now() - startedAt > 10 * 60 * 1000) {
      return { data: null, error: { message: 'La operación tardó demasiado. Probá de nuevo.' } };
    }
    await sleep(2000);
    response = await apiRequest(`/api/functions/jobs/${response.body.id}`);
  }
  if (!response.ok) return { data: null, error: toError(response.body, response.status) };
  return { data: response.body?.data ?? null, error: null };
}

async function rpc(fn, args = {}) {
  const { ok, status, body } = await apiRequest(`/api/db/rpc/${encodeURIComponent(fn)}`, { method: 'POST', body: args });
  if (!ok) return { data: null, error: toError(body, status) };
  return { data: body?.data ?? null, error: null };
}

// Sin tiempo real: las vistas ya vuelven a cargar los datos después de cada cambio.
const channel = () => {
  const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => {} };
  return ch;
};

/** Sesión y usuarios. */
export const authApi = {
  async me() {
    const { ok, body } = await apiRequest('/api/auth/me');
    return ok ? body : { user: null };
  },
  async login(email, password) {
    const { ok, status, body } = await apiRequest('/api/auth/login', { method: 'POST', body: { email, password } });
    return ok ? { user: body.user, error: null } : { user: null, error: toError(body, status) };
  },
  async logout() {
    const { ok, status, body } = await apiRequest('/api/auth/logout', { method: 'POST' });
    return { error: ok ? null : toError(body, status) };
  },
  async forgot(email) {
    const { ok, status, body } = await apiRequest('/api/auth/forgot', { method: 'POST', body: { email } });
    return { error: ok ? null : toError(body, status) };
  },
  async reset(token, password) {
    const { ok, status, body } = await apiRequest('/api/auth/reset', { method: 'POST', body: { token, password } });
    return { error: ok ? null : toError(body, status) };
  },
  async changePassword(password) {
    const { ok, status, body } = await apiRequest('/api/auth/password', { method: 'POST', body: { password } });
    return { error: ok ? null : toError(body, status) };
  },
};

/** Administración de usuarios (solo administradores). */
export const adminApi = {
  async listUsers() {
    const { ok, status, body } = await apiRequest('/api/admin/users');
    return ok ? { data: body.users, error: null } : { data: null, error: toError(body, status) };
  },
  async createUser(user) {
    const { ok, status, body } = await apiRequest('/api/admin/users', { method: 'POST', body: user });
    return ok ? { data: body.user, error: null } : { data: null, error: toError(body, status) };
  },
  async updateUser(id, changes) {
    const { ok, status, body } = await apiRequest(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes });
    return ok ? { data: body.user, error: null } : { data: null, error: toError(body, status) };
  },
  async deleteUser(id) {
    const { ok, status, body } = await apiRequest(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return { error: ok ? null : toError(body, status) };
  },
};

export const supabase = {
  from: (table) => new QueryBuilder(table),
  rpc,
  functions: { invoke },
  channel,
  removeChannel: () => {},
};

export const customSupabaseClient = supabase;
export default supabase;
