import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  )

  // Fetch from both intersection tables independently
  const [int1Result, int2Result] = await Promise.all([
    supabase.from('traffic_signals_int1').select('*'),
    supabase.from('traffic_signals_int2').select('*'),
  ])

  if (int1Result.error || int2Result.error) {
    const errMsg = int1Result.error?.message || int2Result.error?.message
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Merge results from both tables
  const allSignals = [...(int1Result.data || []), ...(int2Result.data || [])]

  return new Response(JSON.stringify(allSignals), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
