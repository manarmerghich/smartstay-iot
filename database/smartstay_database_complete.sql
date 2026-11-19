-- =====================================================
-- SmartStay IoT : base de données PostgreSQL COMPLÈTE (Neon)
-- À ranger dans : database/smartstay_database_complete.sql
--
-- Conforme au PRD du 18 novembre 2026 : un SEUL type de compte (l'Owner).
-- Ce script ne contient AUCUNE donnée (voir seed_demo.sql, optionnel).
--
-- ATTENTION : le début du script SUPPRIME les tables existantes.
--
-- ORDRE (Neon > SQL Editor) :
--   1. Exécuter ce script en entier.
--   2. Remplir la base : soit  python seed.py  (backend), soit seed_demo.sql.
--      Le compte Owner est TOUJOURS créé par le backend (mot de passe haché).
--   3. Vérifier les contraintes et les triggers :
--        SELECT conname FROM pg_constraint
--        WHERE conname IN ('no_overlap','chk_ac_target','fk_code_resa_apt');   -- 3 lignes
--        SELECT tgname FROM pg_trigger
--        WHERE tgname IN ('trg_cancel_codes','trg_code_needs_valid_resa');      -- 2 lignes
--      (Si ça manque : seed.py a recréé les tables, préviens Basma.)
--   4. Lancer tests_no_overlap.sql (résultat attendu : 14 lignes "OK").
--
-- NE PAS renommer ni supprimer de table ou de colonne sans prévenir Basma.
--
-- CONVENTION DES DATES (à respecter par le serveur)
--   * Tout est stocké en UTC dans des TIMESTAMP sans fuseau.
--     "maintenant en UTC" s'écrit  (now() AT TIME ZONE 'utc').
--   * Heures de séjour proposées : arrivée 14h00, départ 11h00 (heure du Maroc).
--     Le Maroc est à UTC+1 : le serveur stocke donc 13:00 UTC et 10:00 UTC
--     (le dashboard convertit à l'affichage).
--   * Une réservation "10 -> 10" du même jour est possible si les heures
--     diffèrent (check_out > check_in strict).
--   * Un code d'accès est valable de valid_from à valid_until : le serveur
--     reprend les dates de la réservation (arrivée -> départ).
--
-- VALEURS CONFIRMÉES PAR BASMA
--   reservations.status = 'confirmed' | 'cancelled'
--   access_codes.status = 'active'    | 'cancelled'
--   commands_log.result = 'accepted'  | 'refused'
--   apartments.id       = 'maison1' ... 'maison6'
--   rules.id            = 'comfort-guard' | 'save-energy'
-- =====================================================

-- ---------- 0. NETTOYAGE ----------
DROP VIEW IF EXISTS v_alerts, v_dashboard_kpis, v_access_codes_state, v_energy_week,
                    v_apartment_status, v_latest_measurements;

DROP TABLE IF EXISTS access_codes, reservations, measurements, energy_daily,
                     device_states, users, rules, commands_log, apartments CASCADE;
-- Tables des anciens schémas, au cas où elles existent encore
DROP TABLE IF EXISTS access_attempts, activity_logs, automation_rules,
                     telemetry_readings, role_permissions, cities CASCADE;

DROP FUNCTION IF EXISTS fn_cancel_codes_of_reservation();
DROP FUNCTION IF EXISTS fn_code_needs_valid_reservation();

-- Nécessaire pour la contrainte anti-chevauchement des réservations
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------- 1. TABLES ----------

-- Les six logements. "house" et "mqtt_prefix" relient le logement à sa
-- simulation Wokwi (PRD 3.1). Colonnes NULLABLE pour ne pas casser seed.py.
CREATE TABLE apartments (
    id          VARCHAR(20)  NOT NULL,
    name        VARCHAR(50)  NOT NULL,
    city        VARCHAR(100) NOT NULL,
    cleaning    BOOLEAN      NOT NULL DEFAULT FALSE,
    house       INTEGER,                       -- N de maisonN (1 à 6)
    mqtt_prefix VARCHAR(50),                   -- ex : 'smartstay-manar/maison1'
    PRIMARY KEY (id),
    CONSTRAINT uq_apartments_house  UNIQUE (house),
    CONSTRAINT uq_apartments_prefix UNIQUE (mqtt_prefix),
    CONSTRAINT chk_apartments_house CHECK (house IS NULL OR house BETWEEN 1 AND 6)
);

-- Journal des commandes, des accès au clavier et des actions automatiques
-- (PRD 3.7 : date, logement, origine, action, résultat)
CREATE TABLE commands_log (
    id           SERIAL       NOT NULL,
    ts           TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    apartment_id VARCHAR(20),                  -- NULL possible (événement global)
    actor        VARCHAR(100) NOT NULL,        -- 'Owner', 'Automation', 'Keypad'...
    action       VARCHAR(100) NOT NULL,
    result       VARCHAR(20)  NOT NULL,
    detail       TEXT         NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    FOREIGN KEY (apartment_id) REFERENCES apartments (id)
);
CREATE INDEX ix_commands_log_ts     ON commands_log (ts);
CREATE INDEX ix_commands_log_apt_ts ON commands_log (apartment_id, ts DESC);
-- Valeurs écrites par le backend : 'accepted' / 'refused' (confirmé par Basma).
-- Contrainte facultative, à activer seulement si le backend n'écrit rien d'autre.
-- Ne PAS stocker le code saisi dans "detail".
--   ALTER TABLE commands_log ADD CONSTRAINT chk_log_result
--     CHECK (result IN ('accepted','refused'));

-- Règles d'automatisation. Les colonnes threshold / conditions / action_text
-- sont optionnelles (le dashboard les affiche) ; le serveur peut aussi les
-- garder en dur (PRD 6.2).
CREATE TABLE rules (
    id          VARCHAR(40)  NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(300) NOT NULL,
    enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
    threshold   NUMERIC(4,1),
    conditions  JSONB,
    action_text VARCHAR(200),
    PRIMARY KEY (id)
);

-- Utilisateurs : uniquement le compte Owner (PRD 2.1 et 8).
-- Mot de passe stocké haché par le serveur (jamais en clair).
CREATE TABLE users (
    id            SERIAL       NOT NULL,
    email         VARCHAR(150) NOT NULL,
    full_name     VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'owner',
    PRIMARY KEY (id),
    UNIQUE (email),
    CONSTRAINT chk_users_owner_only CHECK (lower(role) = 'owner')
);
CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(email));
-- Option si l'équipe veut un seul compte Owner en tout (non activé) :
--   CREATE UNIQUE INDEX uq_single_owner ON users ((true));

-- États actuels des équipements (1 ligne par logement).
-- Valeurs par défaut = état de démarrage des simulations (tout fermé / éteint).
CREATE TABLE device_states (
    apartment_id VARCHAR(20) NOT NULL,
    door         VARCHAR(10) NOT NULL DEFAULT 'locked',
    "window"     VARCHAR(10) NOT NULL DEFAULT 'closed',
    ac_on        BOOLEAN     NOT NULL DEFAULT FALSE,
    ac_target    INTEGER     NOT NULL DEFAULT 24,
    ac_mode      VARCHAR(10) NOT NULL DEFAULT 'cool',
    updated_at   TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    PRIMARY KEY (apartment_id),
    FOREIGN KEY (apartment_id) REFERENCES apartments (id),
    CONSTRAINT chk_door      CHECK (door IN ('locked','unlocked')),
    CONSTRAINT chk_window    CHECK ("window" IN ('open','closed')),
    CONSTRAINT chk_ac_target CHECK (ac_target BETWEEN 16 AND 32),            -- PRD 3.2
    CONSTRAINT chk_ac_mode   CHECK (ac_mode IN ('cool','auto','dry'))
);

-- Consommation journalière simulée
CREATE TABLE energy_daily (
    apartment_id VARCHAR(20) NOT NULL,
    day          DATE        NOT NULL,
    kwh          FLOAT       NOT NULL,
    PRIMARY KEY (apartment_id, day),
    FOREIGN KEY (apartment_id) REFERENCES apartments (id),
    CONSTRAINT chk_kwh CHECK (kwh >= 0)
);

-- Historique des mesures reçues des simulations (date ajoutée par le serveur)
CREATE TABLE measurements (
    id           SERIAL      NOT NULL,
    apartment_id VARCHAR(20) NOT NULL,
    temperature  FLOAT       NOT NULL,
    humidity     FLOAT       NOT NULL,
    presence     BOOLEAN     NOT NULL,
    recorded_at  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    PRIMARY KEY (id),
    FOREIGN KEY (apartment_id) REFERENCES apartments (id),
    CONSTRAINT chk_humidity CHECK (humidity BETWEEN 0 AND 100)
);
CREATE INDEX ix_measurements_recorded_at ON measurements (recorded_at);
-- Couvre aussi les recherches par apartment_id seul
CREATE INDEX ix_measurements_apt_time    ON measurements (apartment_id, recorded_at DESC);

-- Réservations : plage [check_in, check_out[ (départ et arrivée le même jour possibles)
CREATE TABLE reservations (
    id           SERIAL      NOT NULL,
    apartment_id VARCHAR(20) NOT NULL,
    reference    VARCHAR(50) NOT NULL,
    check_in     TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    check_out    TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    PRIMARY KEY (id),
    FOREIGN KEY (apartment_id) REFERENCES apartments (id),
    CONSTRAINT chk_resa_dates  CHECK (check_out > check_in),
    CONSTRAINT chk_resa_status CHECK (status IN ('confirmed','cancelled')),
    -- Nécessaire pour la clé étrangère composite de access_codes
    CONSTRAINT uq_resa_id_apt  UNIQUE (id, apartment_id),
    -- Deux réservations CONFIRMÉES ne se chevauchent pas sur un même logement.
    -- Les annulées sont ignorées. Erreur en cas de conflit : code 23P01.
    CONSTRAINT no_overlap EXCLUDE USING gist (
        apartment_id WITH =,
        tsrange(check_in, check_out) WITH &&
    ) WHERE (status = 'confirmed')
);
CREATE INDEX ix_reservations_apartment_id ON reservations (apartment_id);

-- Codes d'accès temporaires (code en clair : le PRD demande de l'afficher)
-- Supprimer une réservation supprime ses codes (route DELETE /reservations/{id}).
CREATE TABLE access_codes (
    id             SERIAL      NOT NULL,
    code           VARCHAR(10) NOT NULL,
    reservation_id INTEGER     NOT NULL,
    apartment_id   VARCHAR(20) NOT NULL,
    valid_from     TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    valid_until    TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at     TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    PRIMARY KEY (id),
    FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE CASCADE,
    FOREIGN KEY (apartment_id)   REFERENCES apartments (id),
    -- Le logement du code doit être celui de la réservation
    CONSTRAINT fk_code_resa_apt FOREIGN KEY (reservation_id, apartment_id)
        REFERENCES reservations (id, apartment_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_code_period CHECK (valid_until > valid_from),
    CONSTRAINT chk_code_status CHECK (status IN ('active','cancelled')),
    CONSTRAINT chk_code_format CHECK (code ~ '^[0-9]{4,10}$')   -- le clavier n'envoie que des chiffres
);
CREATE INDEX ix_access_codes_code ON access_codes (code);
-- Un même code ne peut pas être actif deux fois sur le même logement
CREATE UNIQUE INDEX uq_access_codes_active
    ON access_codes (apartment_id, code) WHERE status = 'active';

-- ---------- 2. TRIGGERS (cohérence réservation <-> code, PRD 5.3) ----------

-- (a) Réservation annulée => ses codes actifs passent à 'cancelled'
CREATE FUNCTION fn_cancel_codes_of_reservation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE access_codes
       SET status = 'cancelled'
     WHERE reservation_id = NEW.id AND status = 'active';
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cancel_codes
AFTER UPDATE OF status ON reservations
FOR EACH ROW
WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
EXECUTE FUNCTION fn_cancel_codes_of_reservation();

-- (b) Impossible d'avoir un code 'active' sur une réservation non confirmée
CREATE FUNCTION fn_code_needs_valid_reservation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'active' AND NOT EXISTS (
        SELECT 1 FROM reservations r
         WHERE r.id = NEW.reservation_id AND r.status = 'confirmed'
    ) THEN
        RAISE EXCEPTION 'Code actif impossible : la réservation % n''est pas confirmée',
            NEW.reservation_id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_code_needs_valid_resa
BEFORE INSERT OR UPDATE OF status, reservation_id ON access_codes
FOR EACH ROW
EXECUTE FUNCTION fn_code_needs_valid_reservation();

-- ---------- 3. VUES (lecture seule) ----------

-- Dernière mesure de chaque logement (utile pour GET /apartments)
CREATE VIEW v_latest_measurements AS
SELECT DISTINCT ON (apartment_id)
       apartment_id, temperature, humidity, presence, recorded_at
FROM measurements
ORDER BY apartment_id, recorded_at DESC;

-- Statut d'un logement (PRD 3.4), jamais calculé à partir du capteur de présence.
-- Priorité : cleaning > occupied > reserved > available
--   cleaning  = logement marqué « en nettoyage » par l'Owner
--   occupied  = réservation confirmée en cours
--   reserved  = pas de séjour en cours, mais une réservation confirmée à venir
--   available = aucun des cas ci-dessus
-- (DECISION D'EQUIPE : le statut "reserved" est à ajouter au dashboard et au PRD §13)
CREATE VIEW v_apartment_status AS
SELECT a.id AS apartment_id, a.name, a.city,
       CASE WHEN a.cleaning         THEN 'cleaning'
            WHEN cur.id IS NOT NULL THEN 'occupied'
            WHEN nxt.id IS NOT NULL THEN 'reserved'
            ELSE 'available' END AS status,
       cur.id        AS current_reservation_id,
       cur.reference AS current_reference,
       nxt.id        AS next_reservation_id,
       nxt.reference AS next_reference
FROM apartments a
LEFT JOIN LATERAL (
    SELECT r.id, r.reference FROM reservations r
    WHERE r.apartment_id = a.id AND r.status = 'confirmed'
      AND (now() AT TIME ZONE 'utc') >= r.check_in
      AND (now() AT TIME ZONE 'utc') <  r.check_out
    LIMIT 1
) cur ON TRUE
LEFT JOIN LATERAL (
    SELECT r.id, r.reference FROM reservations r
    WHERE r.apartment_id = a.id AND r.status = 'confirmed'
      AND r.check_in > (now() AT TIME ZONE 'utc')
    ORDER BY r.check_in
    LIMIT 1
) nxt ON TRUE;

-- Consommation : aujourd'hui et sur 7 jours, par logement
CREATE VIEW v_energy_week AS
SELECT a.id AS apartment_id, a.name, a.city,
       ROUND(COALESCE(SUM(e.kwh), 0)::numeric, 2) AS kwh_7_days,
       ROUND(COALESCE(SUM(CASE WHEN e.day = (now() AT TIME ZONE 'utc')::date THEN e.kwh END), 0)::numeric, 2) AS kwh_today
FROM apartments a
LEFT JOIN energy_daily e
       ON e.apartment_id = a.id
      AND e.day BETWEEN (now() AT TIME ZONE 'utc')::date - 6 AND (now() AT TIME ZONE 'utc')::date
GROUP BY a.id, a.name, a.city;

-- État d'un code : valid / upcoming / expired, ou son statut s'il n'est plus actif
CREATE VIEW v_access_codes_state AS
SELECT c.id, c.apartment_id, c.reservation_id, c.code, c.valid_from, c.valid_until, c.created_at,
       CASE WHEN c.status <> 'active'                       THEN c.status
            WHEN (now() AT TIME ZONE 'utc') < c.valid_from  THEN 'upcoming'
            WHEN (now() AT TIME ZONE 'utc') > c.valid_until THEN 'expired'
            ELSE 'valid' END AS state
FROM access_codes c;

-- Chiffres du dashboard
CREATE VIEW v_dashboard_kpis AS
SELECT
    (SELECT COUNT(*) FROM apartments)                                   AS apartments,
    (SELECT COUNT(DISTINCT city) FROM apartments)                       AS cities,
    (SELECT COUNT(*) FROM v_apartment_status WHERE status = 'occupied') AS occupied,
    (SELECT COUNT(*) FROM v_apartment_status WHERE status = 'reserved') AS reserved,
    (SELECT COUNT(*) FROM v_apartment_status WHERE status = 'cleaning') AS in_cleaning,
    (SELECT COUNT(*) FROM device_states WHERE door = 'unlocked')        AS doors_unlocked,
    (SELECT COUNT(*) FROM device_states WHERE ac_on AND "window" = 'open') AS alerts,
    (SELECT ROUND(COALESCE(SUM(kwh), 0)::numeric, 2)
       FROM energy_daily WHERE day = (now() AT TIME ZONE 'utc')::date)  AS kwh_today;

-- Alertes (PRD 3.7) : climatisation en marche alors que la fenêtre est ouverte
CREATE VIEW v_alerts AS
SELECT a.id AS apartment_id, a.name, a.city,
       'ac_on_window_open' AS alert_type,
       'Climatisation en marche avec la fenêtre ouverte' AS message,
       d.updated_at AS since
FROM device_states d
JOIN apartments a ON a.id = d.apartment_id
WHERE d.ac_on AND d."window" = 'open';

-- ---------- 4. NOTES POUR LE SERVEUR (Basma) ----------
-- * Annulation d'une réservation : UPDATE reservations SET status='cancelled'.
--   Le trigger passe automatiquement ses codes à 'cancelled'.
-- * Vérification d'un code (PRD 5.3), une seule requête :
--     SELECT 1 FROM access_codes c JOIN reservations r ON r.id = c.reservation_id
--     WHERE c.apartment_id = :apt AND c.code = :code AND c.status = 'active'
--       AND r.status = 'confirmed'
--       AND (now() AT TIME ZONE 'utc') BETWEEN c.valid_from AND c.valid_until;
--   Chaque tentative (acceptée ou refusée) va dans commands_log, SANS le code saisi.
-- * Si on MODIFIE les dates d'une réservation, mettre à jour valid_from/valid_until
--   de son code (la base ne le fait pas).
-- * Au démarrage, une simulation Wokwi remet tout à "fermé / éteint" : le serveur
--   doit renvoyer l'état de device_states par MQTT, ou accepter cette limite en démo.
-- * Les mesures arrivent toutes les 5 s par maison (~100 000 lignes/jour pour 6 maisons) :
--   prévoir une purge, par exemple
--     DELETE FROM measurements WHERE recorded_at < (now() AT TIME ZONE 'utc') - interval '7 days';

-- ---------- 5. TESTS RAPIDES (après le seed) ----------
--   SELECT * FROM v_dashboard_kpis;
--   SELECT * FROM v_apartment_status;
--   SELECT * FROM v_access_codes_state;
--   SELECT * FROM v_alerts;
