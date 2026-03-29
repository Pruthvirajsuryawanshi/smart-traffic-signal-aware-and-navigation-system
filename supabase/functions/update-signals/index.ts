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

  if (flatEntries.length === 0) {
    return new Response(JSON.stringify({ success: true, updated: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const now = new Date().toISOString()

  const normalizedEntries = flatEntries.map(([id, state]) => [id, String(state).toUpperCase()] as const)
  const greenEntries = normalizedEntries.filter(([, state]) => state === 'GREEN')

  let results
  if (greenEntries.length > 0) {
    const [activeGreenId] = greenEntries[greenEntries.length - 1]

    const resetAll = await supabase
      .from('traffic_signals')
      .update({ state: 'RED', updated_at: now })
      .not('id', 'is', null)

    const applyGreen = await supabase
      .from('traffic_signals')
      .update({ state: 'GREEN', updated_at: now })
      .eq('id', activeGreenId)

    const extraEntries = normalizedEntries.filter(([id, state]) => id !== activeGreenId && state !== 'GREEN')
    const extraUpdates = await Promise.all(
      extraEntries.map(([id, state]) =>
        supabase
          .from('traffic_signals')
          .update({ state, updated_at: now })
          .eq('id', id)
      )
    )

    results = [resetAll, applyGreen, ...extraUpdates]
  } else {
    results = await Promise.all(
      normalizedEntries.map(([id, state]) =>
        supabase
          .from('traffic_signals')
          .update({ state, updated_at: now })
          .eq('id', id)
      )
    )
  }

  const errors = results.filter(r => r.error)

  if (errors.length > 0) {
    return new Response(JSON.stringify({ error: 'Some updates failed', details: errors.map(e => e.error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
