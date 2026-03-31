-- Create separate tables for each intersection

-- Table for INT-1 signals
CREATE TABLE IF NOT EXISTS traffic_signals_int1 (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'RED',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  intersection TEXT DEFAULT 'INT-1',
  road_name TEXT,
  type TEXT DEFAULT 'highway'
);

-- Table for INT-2 signals  
CREATE TABLE IF NOT EXISTS traffic_signals_int2 (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'RED',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  intersection TEXT DEFAULT 'INT-2',
  road_name TEXT,
  type TEXT DEFAULT 'highway'
);

-- Insert INT-1 signals
INSERT INTO traffic_signals_int1 (id, latitude, longitude, road_name) VALUES
  ('SIG-101', 19.8385, 75.2497, 'Main Road North'),
  ('SIG-102', 19.8380, 75.2500, 'Main Road East'),
  ('SIG-103', 19.8375, 75.2495, 'Main Road South')
ON CONFLICT (id) DO NOTHING;

-- Insert INT-2 signals
INSERT INTO traffic_signals_int2 (id, latitude, longitude, road_name) VALUES
  ('SIG-201', 19.8400, 75.2520, 'Highway North'),
  ('SIG-202', 19.8395, 75.2525, 'Highway East'),
  ('SIG-203', 19.8390, 75.2520, 'Highway South'),
  ('SIG-204', 19.8395, 75.2515, 'Highway West')
ON CONFLICT (id) DO NOTHING;

-- Enable RLS (optional, for security)
ALTER TABLE traffic_signals_int1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_signals_int2 ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read" ON traffic_signals_int1 FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON traffic_signals_int2 FOR SELECT USING (true);

-- Allow public update access (for ESP32)
CREATE POLICY "Allow public update" ON traffic_signals_int1 FOR UPDATE USING (true);
CREATE POLICY "Allow public update" ON traffic_signals_int2 FOR UPDATE USING (true);
