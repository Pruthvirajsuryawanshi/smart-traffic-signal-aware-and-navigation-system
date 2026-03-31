-- Enable realtime for traffic_signals table
-- This allows the frontend to receive instant updates when ESP32 changes signal states

ALTER TABLE public.traffic_signals REPLICA IDENTITY FULL;

-- Add table to realtime publication
BEGIN;
  -- Check if the publication exists, if not create it
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END $$;

  -- Add traffic_signals table to the publication if not already added
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'traffic_signals'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.traffic_signals;
    END IF;
  END $$;
COMMIT;
