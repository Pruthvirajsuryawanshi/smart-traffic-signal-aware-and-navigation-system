-- Allow insert on int1
CREATE POLICY "Allow public insert" ON public.traffic_signals_int1 FOR INSERT TO public WITH CHECK (true);

-- Allow delete on int1
CREATE POLICY "Allow public delete" ON public.traffic_signals_int1 FOR DELETE TO public USING (true);

-- Allow insert on int2
CREATE POLICY "Allow public insert" ON public.traffic_signals_int2 FOR INSERT TO public WITH CHECK (true);

-- Allow delete on int2
CREATE POLICY "Allow public delete" ON public.traffic_signals_int2 FOR DELETE TO public USING (true);

-- Also fix traffic_signals table
CREATE POLICY "Allow public insert" ON public.traffic_signals FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.traffic_signals FOR DELETE TO public USING (true);