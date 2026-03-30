-- Add road_name column to traffic_signals so editable road names can persist.
ALTER TABLE public.traffic_signals
  ADD COLUMN IF NOT EXISTS road_name TEXT;

-- Existing traffic_signals policy already allows public updates, so this column will be covered.
