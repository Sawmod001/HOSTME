import { pool } from "./connection.js";

class PgQuery {
  constructor(table) {
    this._table = table;
    this._select = "*";
    this._filters = [];
    this._order = null;
    this._rangeOffset = null;
    this._rangeLimit = null;
    this._single = false;
    this._maybeSingle = false;
    this._countExact = false;
    this._head = false;
    this._operation = null;
  }

  select(columns) {
    if (columns && typeof columns === "object" && "count" in columns) {
      this._countExact = columns.count === "exact";
      this._head = !!columns.head;
      this._select = columns;
    } else {
      this._select = columns || "*";
    }
    return this;
  }

  eq(key, value) {
    if (value === undefined || value === null) return this;
    this._filters.push({ op: "eq", key, value });
    return this;
  }

  gt(key, value) {
    if (value === undefined || value === null) return this;
    this._filters.push({ op: "gt", key, value });
    return this;
  }

  lt(key, value) {
    if (value === undefined || value === null) return this;
    this._filters.push({ op: "lt", key, value });
    return this;
  }

  gte(key, value) {
    if (value === undefined || value === null) return this;
    this._filters.push({ op: "gte", key, value });
    return this;
  }

  in(key, values) {
    if (!values || values.length === 0) return this;
    this._filters.push({ op: "in", key, values });
    return this;
  }

  contains(key, values) {
    if (!values) return this;
    const arr = Array.isArray(values) ? values : [values];
    this._filters.push({ op: "contains", key, values: arr });
    return this;
  }

  order(field, opts = {}) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
      throw new Error(`Invalid order field: ${field}`);
    }
    this._order = { field, dir: opts.ascending ? "ASC" : "DESC" };
    return this;
  }

  range(from, to) {
    this._rangeOffset = from;
    this._rangeLimit = to - from + 1;
    return this;
  }

  limit(n) {
    this._rangeLimit = n;
    if (this._rangeOffset === null) this._rangeOffset = 0;
    return this;
  }

  single() {
    this._single = true;
    this._maybeSingle = false;
    return this;
  }

  maybeSingle() {
    this._maybeSingle = true;
    this._single = false;
    return this;
  }

  insert(data) {
    this._operation = { type: "insert", data };
    return this;
  }

  rpc(fn, args = {}) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fn)) {
      throw new Error(`Invalid function name: ${fn}`);
    }
    this._operation = { type: "rpc", fn, args };
    return this;
  }

  update(data) {
    this._operation = { type: "update", data };
    return this;
  }

  delete() {
    this._operation = { type: "delete" };
    return this;
  }

  _mapColumn(key) {
    if (key.includes("->>")) {
      const parts = key.split("->>");
      return `${parts[0]}->>'${parts[1]}'`;
    }
    if (key.includes("->")) {
      const parts = key.split("->");
      return `${parts[0]}->'${parts[1]}'`;
    }
    return key;
  }

  async then(resolve, reject) {
    try {
      const result = await this._execute();
      resolve(result);
    } catch (err) {
      reject(err);
    }
  }

  async _execute() {
    if (this._operation) {
      return this._execOperation();
    }
    return this._execSelect();
  }

  _buildFilterSql(params, startIdx) {
    let idx = startIdx;
    const clauses = [];
    for (const f of this._filters) {
      if (f.op === "eq") {
        idx++;
        clauses.push({ sql: `${this._mapColumn(f.key)} = $${idx}`, params: [f.value] });
      } else if (f.op === "in") {
        const ph = f.values.map(() => { idx++; return `$${idx}`; }).join(", ");
        clauses.push({ sql: `${this._mapColumn(f.key)} IN (${ph})`, params: f.values });
      } else if (f.op === "gt") {
        idx++;
        clauses.push({ sql: `${this._mapColumn(f.key)} > $${idx}`, params: [f.value] });
      } else if (f.op === "lt") {
        idx++;
        clauses.push({ sql: `${this._mapColumn(f.key)} < $${idx}`, params: [f.value] });
      } else if (f.op === "gte") {
        idx++;
        clauses.push({ sql: `${this._mapColumn(f.key)} >= $${idx}`, params: [f.value] });
      } else if (f.op === "contains") {
        idx++;
        clauses.push({ sql: `${this._mapColumn(f.key)} @> $${idx}::text[]`, params: [f.values] });
      }
    }
    for (const c of clauses) {
      params.push(...c.params);
    }
    if (clauses.length === 0) return "";
    return " WHERE " + clauses.map((c) => c.sql).join(" AND ");
  }

  async _execSelect() {
    const params = [];
    let sql = `SELECT ${this._select === "*" ? "*" : this._select} FROM ${this._table}`;

    if (this._countExact && this._head) {
      sql = `SELECT COUNT(*) AS cnt FROM ${this._table}`;
    }

    sql += this._buildFilterSql(params, 0);

    if (this._countExact && this._head) {
      try {
        const result = await pool.query(sql, params);
        return { data: null, error: null, count: parseInt(result.rows[0].cnt, 10) };
      } catch (err) {
        return { data: null, error: { message: err.message }, count: 0 };
      }
    }

    if (this._order) {
      sql += ` ORDER BY ${this._order.field} ${this._order.dir}`;
    }
    if (this._rangeLimit !== null) sql += ` LIMIT ${this._rangeLimit}`;
    if (this._rangeOffset !== null) sql += ` OFFSET ${this._rangeOffset}`;
    if (this._single || this._maybeSingle) sql += " LIMIT 1";

    try {
      const result = await pool.query(sql, params);
      let data = result.rows;
      if (this._single) {
        data = data[0] || null;
        if (!data) return { data: null, error: { message: "Not found" } };
      }
      if (this._maybeSingle) data = data[0] || null;
      return { data, error: null };
    } catch (err) {
      return { data: null, error: { message: err.message, code: err.code } };
    }
  }

  async _execOperation() {
    const { type, data } = this._operation;
    const params = [];
    let sql = "";

    if (type === "insert") {
      const keys = Object.keys(data);
      const values = Object.values(data);
      const cols = keys.join(", ");
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
      sql = `INSERT INTO ${this._table} (${cols}) VALUES (${placeholders})`;
      params.push(...values);
    } else if (type === "update") {
      const keys = Object.keys(data);
      const values = Object.values(data);
      const sets = keys.map((_, i) => `${keys[i]} = $${i + 1}`).join(", ");
      sql = `UPDATE ${this._table} SET ${sets}`;
      params.push(...values);
    } else if (type === "delete") {
      sql = `DELETE FROM ${this._table}`;
    } else if (type === "rpc") {
      const fn = this._operation.fn;
      const values = Object.values(this._operation.args);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
      sql = `SELECT * FROM ${fn}(${placeholders})`;
      params.push(...values);
    }

    const filterSql = this._buildFilterSql(params, params.length);
    sql += filterSql;

    if (type === "insert" || type === "update") {
      sql += " RETURNING *";
    }

    try {
      const result = await pool.query(sql, params);
      let data = result.rows;
      if (this._single) {
        data = data[0] || null;
        if (!data) return { data: null, error: { message: "Not found" } };
      }
      if (this._maybeSingle) data = data[0] || null;
      return { data, error: null };
    } catch (err) {
      // Writes throw (preserving err.code e.g. 23505) so idempotency guards
      // and callers that expect exceptions keep working as designed.
      if (type !== "select") throw err;
      return { data: null, error: { message: err.message, code: err.code } };
    }
  }
}

export const supabase = {
  from: (table) => new PgQuery(table),
  rpc: (fn, args) => new PgQuery("").rpc(fn, args),
};
