import { createClient } from "@supabase/supabase-js";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function logRunEvent(payload: {
  runId: string;
  stage: string;
  decision: string;
  reason: string;
  metadata?: Json;
}) {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from("moderation_events").insert({
    run_id: payload.runId,
    stage: payload.stage,
    decision: payload.decision,
    reason: payload.reason,
    metadata: payload.metadata ?? {}
  });
}

export async function logRunCreated(payload: {
  runId: string;
  status: string;
  stage: string;
}) {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from("runs").upsert({
    id: payload.runId,
    status: payload.status,
    stage: payload.stage
  });
}
