function uuid() {
  return "local_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function match(record, filters) {
  for (const [key, value] of Object.entries(filters)) {
    const keys = key.split(".");
    let val = record;
    for (const k of keys) {
      val = val?.[k];
    }
    if (val !== value) return false;
  }
  return true;
}

function orderBy(arr, field, dir = "desc") {
  const copy = [...arr];
  copy.sort((a, b) => {
    const av = a[field] ?? "";
    const bv = b[field] ?? "";
    if (typeof av === "string") {
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return dir === "asc" ? av - bv : bv - av;
  });
  return copy;
}

const tables = {
  users: new Map(),
  listings: new Map(),
  bookings: new Map(),
  slots: new Map(),
  exclusive_locks: new Map(),
  soft_holds: new Map(),
  processed_webhooks: new Map(),
};

function getTable(name) {
  if (!tables[name]) tables[name] = new Map();
  return tables[name];
}

export const localDb = {
  insert(tableName, data) {
    const table = getTable(tableName);
    const id = data.id || uuid();
    const record = { ...data, id, created_at: new Date().toISOString() };
    table.set(id, record);
    return { data: record, error: null };
  },

  update(tableName, id, updates) {
    const table = getTable(tableName);
    const existing = table.get(id);
    if (!existing) return { data: null, error: { message: "Not found", code: "PGRST116" } };
    const record = { ...existing, ...updates, updated_at: new Date().toISOString() };
    table.set(id, record);
    return { data: record, error: null };
  },

  findById(tableName, id) {
    const table = getTable(tableName);
    const record = table.get(id);
    return { data: record || null, error: null };
  },

  findOne(tableName, filters) {
    const table = getTable(tableName);
    for (const record of table.values()) {
      if (match(record, filters)) return { data: record, error: null };
    }
    return { data: null, error: null };
  },

  findMany(tableName, { filters = {}, order = { field: "created_at", dir: "desc" }, limit = 50, offset = 0 } = {}) {
    const table = getTable(tableName);
    let results = [];
    for (const record of table.values()) {
      if (match(record, filters)) results.push(record);
    }
    results = orderBy(results, order.field, order.dir);
    const page = results.slice(offset, offset + limit);
    return { data: page, error: null, count: results.length };
  },

  count(tableName, filters = {}) {
    const table = getTable(tableName);
    let count = 0;
    for (const record of table.values()) {
      if (match(record, filters)) count++;
    }
    return { count, error: null };
  },

  // Special helpers
  delete(tableName, id) {
    const table = getTable(tableName);
    const existed = table.delete(id);
    return { data: existed ? { id } : null, error: existed ? null : { message: "Not found" } };
  },

  clear(tableName) {
    const table = getTable(tableName);
    table.clear();
  },

  // Seed with demo data
  seed(tableName, records) {
    const table = getTable(tableName);
    for (const record of records) {
      const id = record.id || uuid();
      table.set(id, { ...record, id, created_at: record.created_at || new Date().toISOString() });
    }
  },

  all(tableName) {
    const table = getTable(tableName);
    return Array.from(table.values());
  },
};