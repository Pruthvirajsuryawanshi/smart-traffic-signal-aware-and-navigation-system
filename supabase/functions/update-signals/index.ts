import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Route signal ID to correct table
function getTableForSignal(signalId: string): string {
  if (signalId.startsWith('SIG-1')) return 'traffic_signals_int1'
  if (signalId.startsWith('SIG-2')) return 'traffic_signals_int2'
  // Future intersections: SIG-3xx -> int3, etc.
  const match = signalId.match(/^SIG-(\d)/)
  if (match) return `traffic_signals_int${match[1]}`
  return 'traffic_signals_int1' // fallback
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const body = await req.json()
  const requestId = crypto.randomUUID()
  console.log(`[update-signals:${requestId}] Received:`, JSON.stringify(body))

  // Support both flat and nested formats
  const flatEntries: [string, string][] = []

  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') {
      flatEntries.push([key, value])
    } else if (typeof value === 'object' && value !== null) {
      for (const [sigId, state] of Object.entries(value as Record<string, string>)) {
        flatEntries.push([sigId, state])
      }
    }
  }

  if (flatEntries.length === 0) {
    return new Response(JSON.stringify({ success: true, updated: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const normalizedEntries = flatEntries.map(([id, state]) => [id, String(state).toUpperCase()] as const)

  // Group by table to minimize queries and prevent cross-table interference
  const byTable = new Map<string, { id: string; state: string; index: number }[]>()
  normalizedEntries.forEach(([id, state], index) => {
    const table = getTableForSignal(id)
    if (!byTable.has(table)) byTable.set(table, [])
    byTable.get(table)!.push({ id, state, index })
  })

  console.log(`[update-signals:${requestId}] Tables:`, [...byTable.keys()])

  // Update each table independently - no cross-interference
  const allResults = await Promise.all(
    [...byTable.entries()].map(([table, signals]) =>
      Promise.all(
        signals.map(({ id, state, index }) => {
          const updateTime = new Date(Date.now() + index * 10).toISOString()
          return supabase
            .from(table)
            .update({ state, updated_at: updateTime })
            .eq('id', id)
        })
      )
    )
  )

  const errors = allResults.flat().filter(r => r.error)

  if (errors.length > 0) {
    console.log(`[update-signals:${requestId}] Errors:`, errors.map(e => e.error))
    return new Response(JSON.stringify({ error: 'Some updates failed', requestId, details: errors.map(e => e.error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  console.log(`[update-signals:${requestId}] Success: Updated ${flatEntries.length} signals across ${byTable.size} tables`)
  return new Response(JSON.stringify({ success: true, requestId, updated: flatEntries.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
