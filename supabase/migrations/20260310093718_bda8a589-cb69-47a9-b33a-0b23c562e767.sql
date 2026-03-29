
-- Create traffic_signals table
CREATE TABLE public.traffic_signals (
  id TEXT PRIMARY KEY,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  state TEXT NOT NULL DEFAULT 'RED' CHECK (state IN ('RED', 'GREEN', 'YELLOW')),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.traffic_signals ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Anyone can read signals" ON public.traffic_signals FOR SELECT USING (true);

-- Allow public update for ESP32/admin
CREATE POLICY "Anyone can update signals" ON public.traffic_signals FOR UPDATE USING (true);

-- Insert dummy signals (Bangalore area)
INSERT INTO public.traffic_signals (id, latitude, longitude, state) VALUES
  ('SIG-101', 12.9716, 77.5946, 'GREEN'),
  ('SIG-102', 12.9750, 77.5900, 'RED'),
  ('SIG-103', 12.9680, 77.5990, 'RED'),
  ('SIG-104', 12.9730, 77.6020, 'YELLOW'),
  ('SIG-105', 12.9700, 77.5870, 'RED');
