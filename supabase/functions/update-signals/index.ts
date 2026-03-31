import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  
  // Generate request ID for tracking
  const requestId = crypto.randomUUID()
  
  // Log incoming request for debugging
  console.log(`[update-signals:${requestId}] Received:`, JSON.stringify(body))
  console.log(`[update-signals:${requestId}] From IP:`, req.headers.get('x-forwarded-for') || 'unknown')

  // Support both flat and nested formats:
  // Flat:   { "SIG-101": "RED", "SIG-102": "GREEN" }
  // Nested: { "INT-1": { "SIG-101": "RED" }, "INT-2": { "SIG-201": "GREEN" } }
  const flatEntries: [string, string][] = []

  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') {
      // Flat format
      flatEntries.push([key, value])
    } else if (typeof value === 'object' && value !== null) {
      // Nested format - value is { "SIG-XXX": "STATE" }
      for (const [sigId, state] of Object.entries(value as Record<string, string>)) {
        flatEntries.push([sigId, state])
      }
    }
  }
  
  console.log(`[update-signals:${requestId}] Processing entries:`, flatEntries)

  if (flatEntries.length === 0) {
    return new Response(JSON.stringify({ success: true, updated: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const normalizedEntries = flatEntries.map(([id, state]) => [id, String(state).toUpperCase()] as const)

  // Update each signal - single table approach with strict isolation
  const results = await Promise.all(
    normalizedEntries.map(([id, state], index) => {
      // Add small offset (10ms per signal) to prevent identical timestamps
      const updateTime = new Date(Date.now() + index * 10).toISOString()
      return supabase
        .from('traffic_signals')
        .update({ state, updated_at: updateTime })
        .eq('id', id)
    })
  )

  const errors = results.filter((r: { error: any }) => r.error)

  if (errors.length > 0) {
    console.log(`[update-signals:${requestId}] Errors:`, errors.map((e: { error: any }) => e.error))
    return new Response(JSON.stringify({ error: 'Some updates failed', requestId, details: errors.map((e: { error: any }) => e.error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  console.log(`[update-signals:${requestId}] Success: Updated ${flatEntries.length} signals`)
  return new Response(JSON.stringify({ success: true, requestId, updated: flatEntries.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
