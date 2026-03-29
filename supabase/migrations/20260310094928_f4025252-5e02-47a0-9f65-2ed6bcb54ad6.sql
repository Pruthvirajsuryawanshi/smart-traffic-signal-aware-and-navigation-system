
-- Delete old signals
DELETE FROM public.traffic_signals;

-- Insert new signals matching the user's intersection
INSERT INTO public.traffic_signals (id, latitude, longitude, state) VALUES
  ('SIG-101', 19.837521, 75.253234, 'GREEN'),
  ('SIG-102', 19.837125, 75.253271, 'RED'),
  ('SIG-103', 19.837518, 75.253679, 'RED');
