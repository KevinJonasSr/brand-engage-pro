import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Minimal thenable query-builder fake. Every chained call is recorded; the
 * promise resolves with whatever `respond` returns for that call.
 */
type Call = { table: string; op: string; args: unknown[]; chain: string[] };

export function fakeSupabase(
  respond: (call: Call) => { data?: unknown; error?: { code?: string; message?: string } | null },
) {
  const calls: Call[] = [];
  const rpcs: Array<{ fn: string; args: unknown }> = [];

  function builder(table: string) {
    const call: Call = { table, op: "", args: [], chain: [] };
    const b: Record<string, unknown> = {};
    const chainable = (name: string) =>
      (...args: unknown[]) => {
        if (!call.op) {
          call.op = name;
          call.args = args;
        } else {
          call.chain.push(name);
        }
        return b;
      };
    for (const m of ["select", "insert", "update", "upsert", "eq", "neq", "gt", "lt", "or", "order", "limit"]) {
      b[m] = chainable(m);
    }
    b.maybeSingle = chainable("maybeSingle");
    b.single = chainable("single");
    b.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      calls.push(call);
      try {
        resolve(respond(call));
      } catch (e) {
        reject(e);
      }
    };
    return b;
  }

  const client = {
    from: (table: string) => builder(table),
    rpc: async (fn: string, args: unknown) => {
      rpcs.push({ fn, args });
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;

  return { client, calls, rpcs };
}
