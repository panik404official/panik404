"""Hand-written: things the ORM cannot express.

* turns `events` into a RANGE-partitioned (monthly) table, plus helper functions
* creates the order number sequence
* seeds the product price list (prices live in the DB; the API never trusts client prices)

The Event model state is unchanged, so `makemigrations` will not try to undo any of this.
"""
from tortoise import migrations
from tortoise.migrations import operations as ops

ENSURE_PARTITIONS = """
CREATE OR REPLACE FUNCTION ensure_event_partitions(months_ahead int DEFAULT 3)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  start_m timestamptz; end_m timestamptz; part text; i int;
BEGIN
  FOR i IN -1..months_ahead LOOP
    start_m := (date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => i)) AT TIME ZONE 'UTC';
    end_m   := (date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => i + 1)) AT TIME ZONE 'UTC';
    part    := 'events_' || to_char(start_m AT TIME ZONE 'UTC', 'YYYY_MM');
    IF to_regclass(part) IS NULL THEN
      BEGIN
        EXECUTE format('CREATE TABLE %I PARTITION OF events FOR VALUES FROM (%L) TO (%L)', part, start_m, end_m);
      EXCEPTION WHEN duplicate_table OR check_violation THEN NULL;
      END;
    END IF;
  END LOOP;
END $$
"""

DROP_OLD_PARTITIONS = """
CREATE OR REPLACE FUNCTION drop_event_partitions_older_than(keep_months int)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  r record; n int := 0;
  cutoff text := to_char(date_trunc('month', now() AT TIME ZONE 'UTC') - make_interval(months => keep_months), 'YYYY_MM');
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'events'::regclass
      AND c.relname ~ '^events_[0-9]{4}_[0-9]{2}$' AND substring(c.relname from 8) < cutoff
  LOOP
    EXECUTE format('DROP TABLE %I', r.relname); n := n + 1;
  END LOOP;
  RETURN n;
END $$
"""


class Migration(migrations.Migration):
    dependencies = [("models", "0001_initial")]

    operations = [
        ops.RunSQL(
            [
                "DROP TABLE IF EXISTS events CASCADE",
                "DROP SEQUENCE IF EXISTS events_id_seq",
                "CREATE SEQUENCE events_id_seq",
                """CREATE TABLE events (
                     id          bigint      NOT NULL DEFAULT nextval('events_id_seq'),
                     occurred_at timestamptz NOT NULL,
                     visitor_id  uuid        NOT NULL,
                     session_id  uuid        NOT NULL,
                     type        varchar(32) NOT NULL,
                     path        varchar(500),
                     props       jsonb       NOT NULL DEFAULT '{}'::jsonb,
                     received_at timestamptz NOT NULL DEFAULT now(),
                     PRIMARY KEY (occurred_at, id)
                   ) PARTITION BY RANGE (occurred_at)""",
                "ALTER SEQUENCE events_id_seq OWNED BY events.id",
                "CREATE INDEX events_visitor_idx ON events (visitor_id, occurred_at DESC)",
                "CREATE INDEX events_type_idx ON events (type, occurred_at DESC)",
                "CREATE TABLE events_default PARTITION OF events DEFAULT",
                ENSURE_PARTITIONS,
                DROP_OLD_PARTITIONS,
                "SELECT ensure_event_partitions(3)",
                "CREATE SEQUENCE order_no_seq START 1001",
                """INSERT INTO products (id, name, kind, unit_price, active, created_at) VALUES
                     ('addiction-recovery-journal', 'Addiction Recovery Journal',    'product', 3995, true, now()),
                     ('breakup-recovery-journal',   'Breakup Recovery Journal',      'product', 3999, true, now()),
                     ('overthinking-reset-journal', 'Overthinking Reset Journal',    'product', 3850, true, now()),
                     ('gift-session',               'Therapy session gift voucher',  'gift',    8990, true, now()),
                     ('booking-consultation',       '45-minute 1-on-1 consultation', 'booking', 9995, true, now())
                   ON CONFLICT (id) DO NOTHING""",
            ],
            reverse_sql=None,
        ),
    ]
