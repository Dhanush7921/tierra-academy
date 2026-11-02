import { asService, type Tx } from "@/lib/db/client";

export interface AuditEntry {
  actorId: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/** Append-only audit trail (readable only by Super Admins through RLS). */
export async function audit(entry: AuditEntry, tx?: Tx) {
  const run = (t: Tx) =>
    t`insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata, ip)
      values (${entry.actorId}, ${entry.actorRole ?? null}, ${entry.action}, ${entry.entityType}, ${entry.entityId ?? null},
              ${t.json((entry.metadata ?? {}) as never)}, ${entry.ip ?? null})`;
  try {
    if (tx) await run(tx);
    else await asService(run);
  } catch (e) {
    // auditing must never break the primary action, but failures are surfaced in logs
    console.error("[audit] failed to write", entry.action, e);
  }
}
