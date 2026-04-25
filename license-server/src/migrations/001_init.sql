CREATE TABLE IF NOT EXISTS licenses (
  id BIGSERIAL PRIMARY KEY,
  licenseKey TEXT NOT NULL UNIQUE,
  customerName TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  plan TEXT NOT NULL DEFAULT 'default',
  expiresAt TIMESTAMPTZ NULL,
  maxMachines INTEGER NOT NULL DEFAULT 1,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT now(),
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS license_bindings (
  id BIGSERIAL PRIMARY KEY,
  licenseId BIGINT NOT NULL,
  mt5Account TEXT NOT NULL,
  machineHash TEXT NOT NULL,
  firstSeenAt TIMESTAMPTZ NOT NULL DEFAULT now(),
  lastSeenAt TIMESTAMPTZ NOT NULL DEFAULT now(),
  lastIp TEXT NULL,
  FOREIGN KEY(licenseId) REFERENCES licenses(id) ON DELETE CASCADE,
  UNIQUE(licenseId, mt5Account, machineHash)
);

CREATE TABLE IF NOT EXISTS license_events (
  id BIGSERIAL PRIMARY KEY,
  licenseId BIGINT NULL,
  eventType TEXT NOT NULL,
  payloadJson TEXT NOT NULL DEFAULT '{}',
  createdAt TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(licenseId) REFERENCES licenses(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(licenseKey);
CREATE INDEX IF NOT EXISTS idx_bindings_lookup ON license_bindings(licenseId, mt5Account, machineHash);
CREATE INDEX IF NOT EXISTS idx_events_license ON license_events(licenseId, createdAt);
