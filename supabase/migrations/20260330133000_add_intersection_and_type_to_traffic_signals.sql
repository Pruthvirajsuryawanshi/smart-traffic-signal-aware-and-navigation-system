ALTER TABLE traffic_signals
  ADD COLUMN IF NOT EXISTS intersection TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT;

UPDATE traffic_signals
SET intersection = CASE id
  WHEN 'SIG-101' THEN 'INT-1'
  WHEN 'SIG-102' THEN 'INT-1'
  WHEN 'SIG-103' THEN 'INT-1'
  WHEN 'SIG-201' THEN 'INT-2'
  WHEN 'SIG-202' THEN 'INT-2'
  WHEN 'SIG-203' THEN 'INT-2'
  WHEN 'SIG-204' THEN 'INT-2'
  ELSE intersection
END
WHERE intersection IS NULL;

UPDATE traffic_signals
SET type = CASE id
  WHEN 'SIG-101' THEN 'highway'
  WHEN 'SIG-102' THEN 'highway'
  WHEN 'SIG-103' THEN 'side'
  WHEN 'SIG-201' THEN 'highway'
  WHEN 'SIG-202' THEN 'highway'
  WHEN 'SIG-203' THEN 'side'
  WHEN 'SIG-204' THEN 'side'
  ELSE type
END
WHERE type IS NULL;
