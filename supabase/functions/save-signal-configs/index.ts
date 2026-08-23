import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SIGNAL_ID = /^SIG-\d{1,4}$/
const TABLE = /^traffic_signals_int\d{1,3}$/

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const table = String(body?.table ?? '')
  if (!TABLE.test(table)) return json({ error: 'Invalid table' }, 400)

  const deleteIds: string[] = Array.isArray(body?.deleteIds) ? body.deleteIds : []
  const upsert: any[] = Array.isArray(body?.upsert) ? body.upsert : []

  if (deleteIds.length > 200 || upsert.length > 200) {
    return json({ error: 'Too many rows' }, 400)
  }
  if (!deleteIds.every((id) => typeof id === 'string' && SIGNAL_ID.test(id))) {
    return json({ error: 'Invalid signal id in deleteIds' }, 400)
  }

  const rows = upsert.map((c: any) => {
    if (typeof c?.id !== 'string' || !SIGNAL_ID.test(c.id)) throw new Error('bad id')
    return {
      id: c.id,
      latitude: Number(c.latitude),
      longitude: Number(c.longitude),
      intersection: typeof c.intersection === 'string' ? c.intersection.slice(0, 64) : null,
      type: c.type === 'side' ? 'side' : 'highway',
      road_name: typeof c.road_name === 'string' ? c.road_name.slice(0, 120) : null,
      state: 'RED',
      updated_at: new Date().toISOString(),
    }
  })

  if (rows.some((r) => !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude))) {
    return json({ error: 'Invalid coordinates' }, 400)
  }

  try {
    if (deleteIds.length > 0) {
      const { error } = await supabase.from(table).delete().in('id', deleteIds)
      if (error) throw error
    }
    if (rows.length > 0) {
      const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' })
      if (error) throw error
    }
    return json({ success: true, upserted: rows.length, deleted: deleteIds.length })
  } catch (e) {
    console.error('[save-signal-configs] failed:', e)
    return json({ error: 'Failed to save signal configuration' }, 500)
  }
})
