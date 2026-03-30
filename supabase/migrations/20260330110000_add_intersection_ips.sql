-- Create intersection_ips table for one ESP32 IP per intersection
CREATE TABLE public.intersection_ips (
  intersection TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.intersection_ips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read intersection IPs" ON public.intersection_ips FOR SELECT USING (true);
CREATE POLICY "Anyone can insert or update intersection IPs" ON public.intersection_ips FOR INSERT, UPDATE USING (true);
