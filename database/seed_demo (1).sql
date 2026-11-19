-- =====================================================
-- SmartStay IoT : données de démonstration (OPTIONNEL)
-- À ranger dans : database/seed_demo.sql
--
-- A lancer APRES smartstay_database_complete.sql, et SEULEMENT si on n'utilise
-- pas  python seed.py  (sinon doublons). Données 100 % fictives.
-- Le compte Owner n'est PAS créé ici : le mot de passe doit être haché par
-- le backend (voir la création d'utilisateur de seed.py).
--
-- IDs des logements = maison1 à maison6 (comme le backend et les topics MQTT).
-- Règles : comfort-guard (active) et save-energy (désactivée par défaut, PRD 6.3).
--
-- Les ids des logements (maison1 à maison6) sont ceux utilisés par le backend et
-- par les topics MQTT des simulations.
-- Heures de séjour : arrivée 13:00 UTC (14h Maroc), départ 10:00 UTC (11h Maroc).
-- =====================================================

INSERT INTO apartments (id, name, city, cleaning, house, mqtt_prefix) VALUES
('maison1',  'Riad Atlas Suite',       'Fès',       FALSE, 1, 'smartstay-manar/maison1'),
('maison2',  'Oudaya Sea Apartment',   'Rabat',     TRUE,  2, 'smartstay-manar/maison2'),
('maison3',  'Marina Bay Studio',      'Tanger',    FALSE, 3, 'smartstay-manar/maison3'),
('maison4', 'Batha Garden Flat',      'Fès',       FALSE, 4, 'smartstay-manar/maison4'),
('maison5', 'Kasbah Terrace Loft',    'Tanger',    FALSE, 5, 'smartstay-manar/maison5'),
('maison6',  'Majorelle Garden Suite', 'Marrakech', TRUE,  6, 'smartstay-manar/maison6');

-- Etat initial = celui des simulations Wokwi au démarrage : tout fermé et éteint.
-- Etat de départ = celui des simulations Wokwi au démarrage (tout fermé / éteint).
-- Les valeurs par défaut de la table suffisent : porte locked, fenêtre closed,
-- clim éteinte, 24 °C, mode cool.
INSERT INTO device_states (apartment_id)
SELECT id FROM apartments;

INSERT INTO rules (id, name, description, enabled, threshold, conditions, action_text) VALUES
('comfort-guard', 'Comfort guard',
 'Garde les logements occupés confortables pendant les pics de chaleur.',
 TRUE, 28,
 '["Temperature >= 28 C","Presence detected","Air conditioner is OFF"]'::jsonb,
 'Turn the air conditioner ON at its target temperature'),
-- Règle de la fenêtre : à valider par l'équipe (PRD 6.3), donc désactivée par défaut.
('save-energy', 'Save energy',
 'Ferme la fenêtre quand la clim fonctionne fenêtre ouverte.',
 FALSE, NULL,
 '["Air conditioner is ON","Window is OPEN"]'::jsonb,
 'Close the window automatically');

-- Consommation : 6 jours passés + aujourd'hui
INSERT INTO energy_daily (apartment_id, day, kwh)
SELECT v.apt, (now() AT TIME ZONE 'utc')::date - (7 - t.n::int), t.kwh
FROM (VALUES
    ('maison1',  ARRAY[9.8, 10.4, 8.9, 11.2, 12.1, 10.7, 6.2]),
    ('maison2',  ARRAY[7.5, 8.1, 7.7, 9.3, 8.4, 7.9, 3.1]),
    ('maison3',  ARRAY[4.2, 4.9, 5.3, 4.6, 5.8, 5.1, 2.7]),
    ('maison4', ARRAY[5.2, 4.8, 5.9, 6.4, 5.5, 5.0, 1.9]),
    ('maison5', ARRAY[6.3, 6.9, 7.4, 6.1, 7.0, 6.6, 3.4]),
    ('maison6',  ARRAY[11.4, 12.8, 13.5, 12.2, 14.1, 13.0, 5.6])
) AS v(apt, vals),
unnest(v.vals) WITH ORDINALITY AS t(kwh, n);

-- Réservations (d(n) = aujourd'hui + n jours)
INSERT INTO reservations (apartment_id, reference, check_in, check_out, status)
SELECT v.apt, v.ref,
       date_trunc('day', now() AT TIME ZONE 'utc') + (v.d_in  || ' days')::interval + interval '13 hours',
       date_trunc('day', now() AT TIME ZONE 'utc') + (v.d_out || ' days')::interval + interval '10 hours',
       'confirmed'
FROM (VALUES
    ('maison1',  'Booking #1021', -2,  3),
    ('maison2',  'Booking #1018', -6, -1),
    ('maison2',  'Booking #1024',  2,  6),
    ('maison3',  'Booking #1027',  4,  9),
    ('maison1',  'Booking #1030',  6, 10),
    ('maison5', 'Booking #1033', -3,  1),
    ('maison4', 'Booking #1036',  1,  4),
    ('maison6',  'Booking #1012', -5, -1),
    ('maison6',  'Booking #1039',  3,  8)
) AS v(apt, ref, d_in, d_out);

-- !!! DEMO UNIQUEMENT !!! Code 1234 pour la réservation en cours du Riad Atlas Suite.
-- A supprimer avant la démo finale : DELETE FROM access_codes WHERE code = '1234';
INSERT INTO access_codes (code, reservation_id, apartment_id, valid_from, valid_until)
SELECT '1234', r.id, r.apartment_id, r.check_in, r.check_out
FROM reservations r WHERE r.reference = 'Booking #1021';
