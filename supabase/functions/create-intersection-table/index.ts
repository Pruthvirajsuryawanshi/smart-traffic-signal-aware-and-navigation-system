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

  try {
    const { intersectionNumber, signals } = await req.json()

    if (!intersectionNumber || !Number.isInteger(intersectionNumber) || intersectionNumber < 1 || intersectionNumber > 99) {
      return new Response(JSON.stringify({ error: 'Invalid intersection number (1-99)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const tableName = `traffic_signals_int${intersectionNumber}`
    console.log(`[create-intersection-table] Creating table: ${tableName}`)

    // Create the table if it doesn't exist
    const { error: createError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS public.${tableName} (
          id text NOT NULL PRIMARY KEY,
          state text NOT NULL DEFAULT 'RED',
          latitude double precision,
          longitude double precision,
          intersection text DEFAULT 'INT-${intersectionNumber}',
          road_name text,
          type text DEFAULT 'highway',
          updated_at timestamptz DEFAULT now()
        );

        ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;

        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = '${tableName}' AND policyname = 'Allow public read') THEN
            CREATE POLICY "Allow public read" ON public.${tableName} FOR SELECT USING (true);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = '${tableName}' AND policyname = 'Allow public insert') THEN
            CREATE POLICY "Allow public insert" ON public.${tableName} FOR INSERT WITH CHECK (true);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = '${tableName}' AND policyname = 'Allow public update') THEN
            CREATE POLICY "Allow public update" ON public.${tableName} FOR UPDATE USING (true);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = '${tableName}' AND policyname = 'Allow public delete') THEN
            CREATE POLICY "Allow public delete" ON public.${tableName} FOR DELETE USING (true);
          END IF;
        END $$;
      `
    })

    if (createError) {
      console.error('[create-intersection-table] RPC error:', createError)
      // Table might already exist, try inserting directly
    }

    // Insert signals if provided
    if (signals && Array.isArray(signals) && signals.length > 0) {
      const payload = signals.map((s: any) => ({
        id: s.id,
        latitude: s.latitude,
        longitude: s.longitude,
        intersection: s.intersection || `INT-${intersectionNumber}`,
        road_name: s.roadName || s.road_name || s.id,
        type: s.type || 'highway',
        state: 'RED',
        updated_at: new Date().toISOString(),
      }))

      const { error: insertError } = await supabase
        .from(tableName)
        .upsert(payload, { onConflict: 'id' })

      if (insertError) {
        console.error('[create-intersection-table] Insert error:', insertError)
        return new Response(JSON.stringify({ error: insertError.message, step: 'insert' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    console.log(`[create-intersection-table] Success: ${tableName}`)
    return new Response(JSON.stringify({ success: true, table: tableName }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[create-intersection-table] Error:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
