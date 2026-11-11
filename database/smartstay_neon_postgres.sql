-- =====================================================
-- SmartStay IoT : PostgreSQL (Neon)
-- Aligné sur frontend/src (mockData.js, api.js, pages)
-- et sur iot-simulation/Maison1 (ESP32 + MQTT)
-- À ranger dans : database/smartstay_neon_postgres.sql
--
-- Utilisation : Neon Console > ton projet > SQL Editor > coller > Run
-- Attention : le début du script SUPPRIME les tables existantes.
-- Note : Neon tourne en UTC, donc CURRENT_DATE = date UTC.
-- Sécurité : l'adresse de connexion Neon ne va JAMAIS dans GitHub.
--            Elle se met dans backend/.env (ignoré par Git), partagée en privé.
-- =====================================================

-- ---------- 0. NETTOYAGE ----------
DROP VIEW  IF EXISTS v_energy_week, v_dashboard_kpis, v_apartment_status;
DROP TABLE IF EXISTS access_attempts, access_codes, activity_logs, automation_rules,
                     telemetry_readings, energy_daily, reservations, apartments,
                     role_permissions, users, cities CASCADE;

-- Nécessaire pour la contrainte anti-chevauchement des réservations
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------- 1. TABLES ----------

-- Villes (+ température extérieure simulée : OUTSIDE_TEMP du frontend)
CREATE TABLE cities (
    id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name         VARCHAR(80) NOT NULL UNIQUE,
    outside_temp NUMERIC(4,1) NOT NULL DEFAULT 25.0
);

-- Utilisateurs (USERS du frontend : u1, u2, u3)
CREATE TABLE users (
    id           VARCHAR(30) PRIMARY KEY,                 -- 'u1'
    name         VARCHAR(80) NOT NULL,
    label        VARCHAR(80) NOT NULL,
    email        VARCHAR(120) NOT NULL,                   -- identifiant de connexion
    role         VARCHAR(10) NOT NULL CHECK (role IN ('owner','manager','staff')),
    avatar_color VARCHAR(9),
    password_hash VARCHAR(255) NULL                       -- hash (bcrypt/argon2) calculé par le backend, JAMAIS le mot de passe en clair
);
-- Email unique sans tenir compte des majuscules (Owner@x.com = owner@x.com)
CREATE UNIQUE INDEX uq_users_email ON users (lower(email));

-- Droits par rôle (PERMISSIONS du frontend)
CREATE TABLE role_permissions (
    role   VARCHAR(10) NOT NULL CHECK (role IN ('owner','manager','staff')),
    device VARCHAR(10) NOT NULL CHECK (device IN ('door','ac','window')),
    PRIMARY KEY (role, device)
);

-- Appartements + ÉTAT COURANT des équipements et capteurs
-- (forme renvoyée par GET /apartments)
CREATE TABLE apartments (
    id                VARCHAR(30) PRIMARY KEY,            -- 'apt-fes'
    city_id           INT NOT NULL REFERENCES cities(id),
    name              VARCHAR(100) NOT NULL,
    address           VARCHAR(200),
    image_url         VARCHAR(300),
    cleaning          BOOLEAN NOT NULL DEFAULT FALSE,
    door_state        VARCHAR(10) NOT NULL DEFAULT 'locked'  CHECK (door_state IN ('locked','unlocked')),
    window_state      VARCHAR(10) NOT NULL DEFAULT 'closed'  CHECK (window_state IN ('open','closed')),
    ac_on             BOOLEAN NOT NULL DEFAULT FALSE,
    ac_target         SMALLINT NOT NULL DEFAULT 24 CHECK (ac_target BETWEEN 10 AND 35),
    ac_mode           VARCHAR(10) NOT NULL DEFAULT 'cool'    CHECK (ac_mode IN ('cool','auto','dry')),
    temperature       NUMERIC(4,1),
    humidity          SMALLINT CHECK (humidity BETWEEN 0 AND 100),
    presence          BOOLEAN NOT NULL DEFAULT FALSE,
    last_update       TIMESTAMPTZ NULL,                   -- NULL = "waiting for the first reading"
    mqtt_topic_prefix VARCHAR(80) NULL UNIQUE             -- ex : 'smartstay-manar/maison1'
);
CREATE INDEX idx_apartments_city ON apartments(city_id);

-- Réservations (dates inclusives, comme dans Reservations.jsx)
CREATE TABLE reservations (
    id           VARCHAR(30) PRIMARY KEY,                 -- 'r1' ou 'r<timestamp>' généré par le frontend
    apartment_id VARCHAR(30) NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
    guest        VARCHAR(80) NOT NULL,                    -- 'Booking #1021'
    start_date   DATE NOT NULL,
    end_date     DATE NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date),
    -- Interdit deux réservations qui se chevauchent sur le même appartement
    -- ('[]' = bornes incluses : même règle que le frontend)
    CONSTRAINT no_overlap EXCLUDE USING gist (
        apartment_id WITH =,
        daterange(start_date, end_date, '[]') WITH &&
    )
);

-- Consommation journalière simulée (energyHistory = 6 jours + energyToday)
CREATE TABLE energy_daily (
    apartment_id VARCHAR(30) NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
    day_date     DATE NOT NULL,
    kwh          NUMERIC(6,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (apartment_id, day_date)
);

-- Historique des mesures reçues de l'ESP32 (topic .../telemetry)
CREATE TABLE telemetry_readings (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    apartment_id VARCHAR(30) NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
    temperature  NUMERIC(4,1),
    humidity     SMALLINT,
    presence     BOOLEAN,
    recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tele ON telemetry_readings(apartment_id, recorded_at DESC);

-- Règles d'automatisation (initialRules du frontend)
CREATE TABLE automation_rules (
    id          VARCHAR(40) PRIMARY KEY,                  -- 'close-window-ac'
    name        VARCHAR(80) NOT NULL,
    description VARCHAR(300),
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    threshold   NUMERIC(4,1) NULL,
    conditions  JSONB NOT NULL,                           -- ["Air conditioner is ON", ...]
    action_text VARCHAR(200) NOT NULL
);

-- Journal d'activité (page Activity log + "Latest commands")
CREATE TABLE activity_logs (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    apartment_id VARCHAR(30) NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
    user_id      VARCHAR(30) NULL REFERENCES users(id) ON DELETE SET NULL,  -- NULL si automation ou keypad
    user_label   VARCHAR(80) NOT NULL,
    command      VARCHAR(150) NOT NULL,
    result       VARCHAR(10) NOT NULL CHECK (result IN ('success','rejected')),
    source       VARCHAR(12) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','automation','keypad')),
    rule_id      VARCHAR(40) NULL REFERENCES automation_rules(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_logs ON activity_logs(apartment_id, created_at DESC);

-- Codes du keypad 4x4 (topics access/request et access/response)
CREATE TABLE access_codes (
    id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    apartment_id   VARCHAR(30) NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
    reservation_id VARCHAR(30) NULL REFERENCES reservations(id) ON DELETE SET NULL,
    code_hash      CHAR(64) NOT NULL,                     -- SHA-256 en hexadécimal, jamais le code en clair
    valid_from     TIMESTAMPTZ NOT NULL,                  -- date ET heure de début de validité
    valid_to       TIMESTAMPTZ NOT NULL,                  -- date ET heure de fin de validité
    active         BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK (valid_to > valid_from)
);
CREATE INDEX idx_code ON access_codes(apartment_id, code_hash);

CREATE TABLE access_attempts (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    apartment_id VARCHAR(30) NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
    success      BOOLEAN NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 2. VUES (aident le backend et le dashboard) ----------

-- Statut DÉRIVÉ DES RÉSERVATIONS (comme apartmentStatus() dans helpers.js)
CREATE VIEW v_apartment_status AS
SELECT a.id AS apartment_id, a.name, c.name AS city,
       CASE WHEN r.id IS NOT NULL THEN 'occupied'
            WHEN a.cleaning       THEN 'cleaning'
            ELSE 'available' END AS status,
       r.id AS current_reservation_id, r.guest
FROM apartments a
JOIN cities c ON c.id = a.city_id
LEFT JOIN reservations r ON r.apartment_id = a.id
     AND CURRENT_DATE BETWEEN r.start_date AND r.end_date;

-- KPI de Dashboard.jsx
CREATE VIEW v_dashboard_kpis AS
SELECT
    (SELECT COUNT(*) FROM apartments)                                     AS apartments,
    (SELECT COUNT(*) FROM cities)                                         AS cities,
    (SELECT COUNT(*) FROM v_apartment_status WHERE status = 'occupied')   AS occupied,
    (SELECT COUNT(*) FROM v_apartment_status WHERE status = 'cleaning')   AS in_cleaning,
    (SELECT COUNT(*) FROM apartments WHERE door_state = 'unlocked')       AS doors_unlocked,
    (SELECT COUNT(*) FROM apartments WHERE ac_on AND window_state = 'open') AS alerts,
    (SELECT COALESCE(SUM(kwh), 0) FROM energy_daily WHERE day_date = CURRENT_DATE) AS kwh_today;

-- Page Energy : total 7 jours par appartement
CREATE VIEW v_energy_week AS
SELECT a.id AS apartment_id, a.name, c.name AS city,
       COALESCE(SUM(e.kwh), 0) AS kwh_7_days,
       COALESCE(SUM(CASE WHEN e.day_date = CURRENT_DATE THEN e.kwh END), 0) AS kwh_today
FROM apartments a
JOIN cities c ON c.id = a.city_id
LEFT JOIN energy_daily e ON e.apartment_id = a.id
     AND e.day_date BETWEEN CURRENT_DATE - 6 AND CURRENT_DATE
GROUP BY a.id, a.name, c.name;

-- ---------- 3. DONNÉES DE DÉPART (copie de mockData.js) ----------

INSERT INTO cities (name, outside_temp) VALUES
('Fès',29),('Rabat',24),('Tanger',22),('Marrakech',33);

-- Emails fictifs de démo (domaine .example) : à remplacer par les vrais
INSERT INTO users (id, name, label, email, role, avatar_color) VALUES
('u1','Owner','Owner','owner@smartstay.example','owner','#8fbf9f'),
('u2','Manager','Manager','manager@smartstay.example','manager','#c9a27e'),
('u3','Cleaning staff','Cleaning staff','staff@smartstay.example','staff','#9a9ab8');
-- password_hash reste NULL ici : le hash doit être calculé par le backend (bcrypt/argon2).
-- Exemple pour définir le mot de passe du propriétaire depuis le backend :
--   UPDATE users SET password_hash = '<hash calculé par le backend>' WHERE id = 'u1';

INSERT INTO role_permissions (role, device) VALUES
('owner','door'),('owner','ac'),('owner','window'),
('manager','door'),('manager','ac'),('manager','window'),
('staff','window');

INSERT INTO apartments
(id, city_id, name, address, image_url, cleaning, door_state, window_state,
 ac_on, ac_target, ac_mode, temperature, humidity, presence, mqtt_topic_prefix) VALUES
('apt-fes',  (SELECT id FROM cities WHERE name='Fès'),       'Riad Atlas Suite', '12 Rue Talaa Kebira (fictional)',
 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&q=70',
 FALSE,'locked','open',  TRUE, 24,'cool',26.4,41,TRUE,'smartstay-manar/maison1'),
('apt-rab',  (SELECT id FROM cities WHERE name='Rabat'),     'Oudaya Sea Apartment', '27 Boulevard Al Marsa (fictional)',
 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=70',
 TRUE, 'locked','closed',FALSE,22,'cool',24.2,52,TRUE,'smartstay-manar/maison2'),
('apt-tng',  (SELECT id FROM cities WHERE name='Tanger'),    'Marina Bay Studio', '3 Avenue Mohammed VI (fictional)',
 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=900&q=70',
 FALSE,'locked','closed',TRUE, 22,'cool',22.8,58,FALSE,'smartstay-manar/maison3'),
('apt-fes2', (SELECT id FROM cities WHERE name='Fès'),       'Batha Garden Flat', '8 Rue Batha (fictional)',
 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=900&q=70',
 FALSE,'locked','closed',FALSE,24,'cool',25.3,44,FALSE,'smartstay-manar/maison4'),
('apt-tng2', (SELECT id FROM cities WHERE name='Tanger'),    'Kasbah Terrace Loft', '19 Rue de la Kasbah (fictional)',
 'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=900&q=70',
 FALSE,'locked','closed',TRUE, 23,'cool',23.4,61,TRUE,'smartstay-manar/maison5'),
('apt-mrk',  (SELECT id FROM cities WHERE name='Marrakech'), 'Majorelle Garden Suite', '14 Rue Yves Saint Laurent (fictional)',
 'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?auto=format&fit=crop&w=900&q=70',
 TRUE, 'locked','closed',FALSE,24,'cool',29.8,33,TRUE,'smartstay-manar/maison6');

-- Énergie : 6 jours passés + aujourd'hui (7e valeur), dates relatives à CURRENT_DATE
INSERT INTO energy_daily (apartment_id, day_date, kwh)
SELECT v.apt, CURRENT_DATE - (7 - t.n::int), t.kwh
FROM (VALUES
    ('apt-fes',  ARRAY[9.8, 10.4, 8.9, 11.2, 12.1, 10.7, 6.2]),
    ('apt-rab',  ARRAY[7.5, 8.1, 7.7, 9.3, 8.4, 7.9, 3.1]),
    ('apt-tng',  ARRAY[4.2, 4.9, 5.3, 4.6, 5.8, 5.1, 2.7]),
    ('apt-fes2', ARRAY[5.2, 4.8, 5.9, 6.4, 5.5, 5.0, 1.9]),
    ('apt-tng2', ARRAY[6.3, 6.9, 7.4, 6.1, 7.0, 6.6, 3.4]),
    ('apt-mrk',  ARRAY[11.4, 12.8, 13.5, 12.2, 14.1, 13.0, 5.6])
) AS v(apt, vals),
unnest(v.vals) WITH ORDINALITY AS t(kwh, n);

-- Réservations (buildInitialReservations : d(n) = aujourd'hui + n jours)
INSERT INTO reservations (id, apartment_id, guest, start_date, end_date) VALUES
('r1',  'apt-fes',  'Booking #1021', CURRENT_DATE - 2, CURRENT_DATE + 3),
('r3',  'apt-rab',  'Booking #1018', CURRENT_DATE - 6, CURRENT_DATE - 1),
('r4',  'apt-rab',  'Booking #1024', CURRENT_DATE + 2, CURRENT_DATE + 6),
('r5',  'apt-tng',  'Booking #1027', CURRENT_DATE + 4, CURRENT_DATE + 9),
('r6',  'apt-fes',  'Booking #1030', CURRENT_DATE + 6, CURRENT_DATE + 10),
('r7',  'apt-tng2', 'Booking #1033', CURRENT_DATE - 3, CURRENT_DATE + 1),
('r8',  'apt-fes2', 'Booking #1036', CURRENT_DATE + 1, CURRENT_DATE + 4),
('r9',  'apt-mrk',  'Booking #1012', CURRENT_DATE - 5, CURRENT_DATE - 1),
('r10', 'apt-mrk',  'Booking #1039', CURRENT_DATE + 3, CURRENT_DATE + 8);

INSERT INTO automation_rules (id, name, description, enabled, threshold, conditions, action_text) VALUES
('close-window-ac','Save energy',
 'Avoids cooling the street: the window closes as soon as the A/C runs with it open.',
 TRUE, NULL,
 jsonb_build_array('Air conditioner is ON','Window is OPEN'),
 'Close the window automatically'),
('auto-cool','Comfort guard',
 'Keeps occupied apartments comfortable during heat peaks.',
 TRUE, 28,
 jsonb_build_array('Temperature ≥ 28 °C','Presence detected','Air conditioner is OFF'),
 'Turn the air conditioner ON at its target temperature');

-- !!! DÉMO UNIQUEMENT !!!
-- Code keypad de test (1234) pour la réservation r1 (Riad Atlas Suite).
-- À ne PAS garder en production : supprime-le avec
--   DELETE FROM access_codes WHERE reservation_id = 'r1';
INSERT INTO access_codes (apartment_id, reservation_id, code_hash, valid_from, valid_to) VALUES
('apt-fes','r1', encode(sha256(convert_to('1234','UTF8')),'hex'),
 now() - interval '2 days', now() + interval '3 days');

-- ---------- 4. REQUÊTES UTILES POUR LE BACKEND ----------
-- GET /apartments (état courant) :
--   SELECT a.*, c.name AS city FROM apartments a JOIN cities c ON c.id = a.city_id;
-- Historique énergie d'un appartement (6 jours + aujourd'hui) :
--   SELECT day_date, kwh FROM energy_daily
--   WHERE apartment_id = 'apt-fes' AND day_date >= CURRENT_DATE - 6 ORDER BY day_date;
-- Connexion : récupérer l'utilisateur et son hash à comparer côté backend :
--   SELECT id, name, label, role, password_hash FROM users WHERE lower(email) = lower('owner@smartstay.example');
-- Droit d'un utilisateur sur un équipement (1 ligne = autorisé, sinon 403) :
--   SELECT 1 FROM role_permissions rp JOIN users u ON u.role = rp.role
--   WHERE u.id = 'u3' AND rp.device = 'door';
-- Vérification d'un code keypad (appartement connu via le topic MQTT) :
--   SELECT 1 FROM access_codes
--   WHERE apartment_id = 'apt-fes'
--     AND code_hash = encode(sha256(convert_to('1234','UTF8')),'hex')
--     AND active AND now() BETWEEN valid_from AND valid_to;
-- Statut dérivé des réservations : SELECT * FROM v_apartment_status;
-- KPI du dashboard :              SELECT * FROM v_dashboard_kpis;
-- Test du chevauchement (doit échouer avec "no_overlap") :
--   INSERT INTO reservations (id, apartment_id, guest, start_date, end_date)
--   VALUES ('rX','apt-fes','Test', CURRENT_DATE, CURRENT_DATE + 1);
