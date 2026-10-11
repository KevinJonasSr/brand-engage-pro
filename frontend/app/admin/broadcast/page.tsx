import { getAdminContext } from "@/lib/admin";
import { canSendBlasts } from "@/lib/blast-permissions";
import BroadcastForm from "./broadcast-form";

export const dynamic = "force-dynamic";

export default async function BroadcastPage() {
  const ctx = await getAdminContext();
  if (!ctx || !canSendBlasts(ctx)) {
    return (
      <div className="max-w-2xl space-y-3">
        <p className="text-xs uppercase tracking-wide text-iron/70">Admin · Broadcast</p>
        <h1 className="text-2xl font-semibold">Send a broadcast</h1>
        <p className="text-sm text-iron/70">
          Only the brand owner can send a text or email blast. Ask the owner
          if this message needs to go out.
        </p>
      </div>
    );
  }
  return <BroadcastForm />;
}
