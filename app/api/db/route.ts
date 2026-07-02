import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const sb = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ok = (req: NextRequest) => req.headers.get("x-passcode") === process.env.APP_PASSCODE;

export async function GET(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await sb().from("app_state").select("key,value");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const state: Record<string, unknown> = {};
  for (const row of data ?? []) state[row.key] = row.value;
  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json(); // { key, value }
  const { error } = await sb().from("app_state")
    .upsert({ key: body.key, value: body.value, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
