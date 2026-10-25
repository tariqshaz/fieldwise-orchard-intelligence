CREATE TYPE sensor_status AS ENUM ('ok', 'warn', 'offline');
CREATE TYPE action_status AS ENUM ('pending', 'approved', 'dispatched', 'completed', 'rejected');
CREATE TYPE alert_kind AS ENUM ('anomaly', 'irrigation', 'harvest');
CREATE TYPE sector_status AS ENUM ('healthy', 'watch', 'critical');
CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high');

CREATE TABLE estates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC+05:00',
  acreage NUMERIC(10,2) NOT NULL,
  crop_focus TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estate_id UUID NOT NULL REFERENCES estates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  acreage NUMERIC(10,2) NOT NULL,
  crop_type TEXT NOT NULL,
  ndvi NUMERIC(4,2) NOT NULL DEFAULT 0.00,
  moisture NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  status sector_status NOT NULL DEFAULT 'healthy',
  risk_level risk_level NOT NULL DEFAULT 'low',
  location_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE drones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estate_id UUID NOT NULL REFERENCES estates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'autonomous',
  battery NUMERIC(5,2) NOT NULL DEFAULT 0,
  payload_level NUMERIC(5,2) NOT NULL DEFAULT 0,
  altitude NUMERIC(5,2) NOT NULL DEFAULT 0,
  speed NUMERIC(5,2) NOT NULL DEFAULT 0,
  signal_dbm NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sensor_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status sensor_status NOT NULL DEFAULT 'ok',
  moisture NUMERIC(5,2) NOT NULL DEFAULT 0,
  temperature NUMERIC(5,2) NOT NULL DEFAULT 0,
  salinity NUMERIC(5,2) NOT NULL DEFAULT 0,
  battery_level NUMERIC(5,2) NOT NULL DEFAULT 0,
  rssi NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence NUMERIC(4,2) NOT NULL DEFAULT 0,
  status action_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  kind alert_kind NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  confidence NUMERIC(4,2) NOT NULL DEFAULT 0,
  severity TEXT NOT NULL DEFAULT 'medium',
  action_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID REFERENCES recommendations(id) ON DELETE SET NULL,
  alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  status action_status NOT NULL DEFAULT 'pending',
  user_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sectors_estate_id ON sectors (estate_id);
CREATE INDEX idx_sensor_nodes_sector_id ON sensor_nodes (sector_id);
CREATE INDEX idx_recommendations_sector_id ON recommendations (sector_id);
CREATE INDEX idx_alerts_sector_id ON alerts (sector_id);
CREATE INDEX idx_action_logs_recommendation_id ON action_logs (recommendation_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_estates
BEFORE UPDATE ON estates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_sectors
BEFORE UPDATE ON sectors
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_drones
BEFORE UPDATE ON drones
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_sensor_nodes
BEFORE UPDATE ON sensor_nodes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_recommendations
BEFORE UPDATE ON recommendations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_alerts
BEFORE UPDATE ON alerts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_action_logs
BEFORE UPDATE ON action_logs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
