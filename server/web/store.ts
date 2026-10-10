// Accounts for the hosted app: users, sign-in sessions, the AI credit ledger,
// AI call log and payments, in one SQLite file (Node's built-in node:sqlite,
// no extra service to run). Lessons themselves stay in each teacher's browser.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export interface User {
  id: string;
  provider: "google" | "zalo";
  subject: string;
  email: string;
  name: string;
  picture: string;
  createdAt: number;
}
export interface Payment {
  orderCode: number;
  userId: string;
  plan: string;
  amount: number;
  credits: number;
  status: "PENDING" | "PAID" | "CANCELLED";
  createdAt: number;
  paidAt: number | null;
}
export interface AiCallRecord {
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  ok: boolean;
  error: string;
  ms: number;
}

const schema = `
create table if not exists users (
  id text primary key,
  provider text not null,
  subject text not null,
  email text not null default '',
  name text not null default '',
  picture text not null default '',
  created_at integer not null,
  unique (provider, subject)
);
create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users(id),
  created_at integer not null,
  expires_at integer not null
);
-- Credits are only ever added as rows; the balance is their sum. (reason, ref)
-- is unique so a payment or an AI call is never counted twice.
create table if not exists credit_ledger (
  id integer primary key autoincrement,
  user_id text not null references users(id),
  delta integer not null,
  reason text not null,
  ref text not null,
  created_at integer not null,
  unique (reason, ref)
);
create table if not exists ai_calls (
  id text primary key,
  user_id text not null references users(id),
  model text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  ok integer not null,
  error text not null,
  ms integer not null,
  created_at integer not null
);
create table if not exists payments (
  order_code integer primary key,
  user_id text not null references users(id),
  plan text not null,
  amount integer not null,
  credits integer not null,
  status text not null,
  created_at integer not null,
  paid_at integer
);
`;

const hash = (token: string) =>
  createHash("sha256").update(token).digest("base64url");

type Row = Record<string, unknown>;
const toUser = (r: Row): User => ({
  id: String(r.id),
  provider: r.provider as User["provider"],
  subject: String(r.subject),
  email: String(r.email),
  name: String(r.name),
  picture: String(r.picture),
  createdAt: Number(r.created_at),
});
const toPayment = (r: Row): Payment => ({
  orderCode: Number(r.order_code),
  userId: String(r.user_id),
  plan: String(r.plan),
  amount: Number(r.amount),
  credits: Number(r.credits),
  status: r.status as Payment["status"],
  createdAt: Number(r.created_at),
  paidAt: r.paid_at === null ? null : Number(r.paid_at),
});

export class Store {
  private db: DatabaseSync;
  constructor(
    path = ":memory:",
    private now: () => number = Date.now,
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec("pragma journal_mode = wal; pragma foreign_keys = on;");
    this.db.exec(schema);
  }
  close() {
    this.db.close();
  }
  private tx<T>(fn: () => T): T {
    this.db.exec("begin immediate");
    try {
      const out = fn();
      this.db.exec("commit");
      return out;
    } catch (e) {
      this.db.exec("rollback");
      throw e;
    }
  }

  /** Finds or creates the user for a sign-in; profile details are refreshed. */
  upsertUser(p: Omit<User, "id" | "createdAt">): {
    user: User;
    created: boolean;
  } {
    return this.tx(() => {
      const found = this.db
        .prepare("select * from users where provider = ? and subject = ?")
        .get(p.provider, p.subject) as Row | undefined;
      if (found) {
        this.db
          .prepare(
            "update users set email = ?, name = ?, picture = ? where id = ?",
          )
          .run(p.email, p.name, p.picture, String(found.id));
        return {
          user: { ...toUser(found), ...p },
          created: false,
        };
      }
      const user: User = { ...p, id: randomUUID(), createdAt: this.now() };
      this.db
        .prepare(
          "insert into users (id, provider, subject, email, name, picture, created_at) values (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          user.id,
          user.provider,
          user.subject,
          user.email,
          user.name,
          user.picture,
          user.createdAt,
        );
      return { user, created: true };
    });
  }
  user(id: string): User | null {
    const r = this.db.prepare("select * from users where id = ?").get(id) as
      | Row
      | undefined;
    return r ? toUser(r) : null;
  }

  /** A new random session token; only its hash is stored. */
  createSession(userId: string, ttlMs: number): string {
    const token = randomBytes(32).toString("base64url");
    const now = this.now();
    this.db
      .prepare(
        "insert into sessions (token_hash, user_id, created_at, expires_at) values (?, ?, ?, ?)",
      )
      .run(hash(token), userId, now, now + ttlMs);
    return token;
  }
  sessionUser(token: string | undefined): User | null {
    if (!token) return null;
    const r = this.db
      .prepare(
        "select u.* from sessions s join users u on u.id = s.user_id where s.token_hash = ? and s.expires_at > ?",
      )
      .get(hash(token), this.now()) as Row | undefined;
    return r ? toUser(r) : null;
  }
  deleteSession(token: string | undefined) {
    if (token)
      this.db
        .prepare("delete from sessions where token_hash = ?")
        .run(hash(token));
  }

  balance(userId: string): number {
    const r = this.db
      .prepare(
        "select coalesce(sum(delta), 0) as total from credit_ledger where user_id = ?",
      )
      .get(userId) as Row;
    return Number(r.total);
  }
  /**
   * Adds (or with a negative delta, spends) credits. Returns false when this
   * reason/ref was already recorded, so retries and repeated webhooks are safe.
   */
  addCredits(userId: string, delta: number, reason: string, ref: string) {
    const r = this.db
      .prepare(
        "insert or ignore into credit_ledger (user_id, delta, reason, ref, created_at) values (?, ?, ?, ?, ?)",
      )
      .run(userId, delta, reason, ref, this.now());
    return Number(r.changes) === 1;
  }
  /** Spends one credit if the balance allows it, atomically. */
  spendCredit(userId: string, ref: string): boolean {
    return this.tx(() => {
      if (this.balance(userId) < 1) return false;
      return this.addCredits(userId, -1, "ai", ref);
    });
  }

  recordAiCall(c: AiCallRecord): string {
    const id = randomUUID();
    this.db
      .prepare(
        "insert into ai_calls (id, user_id, model, input_tokens, output_tokens, ok, error, ms, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        c.userId,
        c.model,
        c.inputTokens,
        c.outputTokens,
        c.ok ? 1 : 0,
        c.error,
        c.ms,
        this.now(),
      );
    return id;
  }
  /** Tokens used per model, for the owner's cost check. */
  usageSummary() {
    return this.db
      .prepare(
        "select model, count(*) as calls, sum(ok) as ok, sum(input_tokens) as input, sum(output_tokens) as output from ai_calls group by model",
      )
      .all() as {
      model: string;
      calls: number;
      ok: number;
      input: number;
      output: number;
    }[];
  }

  createPayment(
    p: Omit<Payment, "status" | "createdAt" | "paidAt">,
  ): Payment {
    const payment: Payment = {
      ...p,
      status: "PENDING",
      createdAt: this.now(),
      paidAt: null,
    };
    this.db
      .prepare(
        "insert into payments (order_code, user_id, plan, amount, credits, status, created_at, paid_at) values (?, ?, ?, ?, ?, ?, ?, null)",
      )
      .run(
        p.orderCode,
        p.userId,
        p.plan,
        p.amount,
        p.credits,
        "PENDING",
        payment.createdAt,
      );
    return payment;
  }
  payment(orderCode: number): Payment | null {
    const r = this.db
      .prepare("select * from payments where order_code = ?")
      .get(orderCode) as Row | undefined;
    return r ? toPayment(r) : null;
  }
  /**
   * Marks a payment paid and adds its credits, once. Returns the payment when
   * this call did it, null when it was unknown or already paid.
   */
  completePayment(orderCode: number, amount: number): Payment | null {
    return this.tx(() => {
      const p = this.payment(orderCode);
      if (!p || p.status !== "PENDING" || p.amount !== amount) return null;
      const paidAt = this.now();
      this.db
        .prepare(
          "update payments set status = 'PAID', paid_at = ? where order_code = ?",
        )
        .run(paidAt, orderCode);
      this.addCredits(p.userId, p.credits, "payment", String(orderCode));
      return { ...p, status: "PAID", paidAt };
    });
  }
}
