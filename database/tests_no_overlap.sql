-- =====================================================
-- SmartStay IoT : tests de la base de données (PRD du 18 novembre 2026)
-- À ranger dans : database/tests_no_overlap.sql
--
-- À LANCER APRÈS le seed (python seed.py ou seed_demo.sql) : il faut au moins
-- une réservation confirmée et au moins deux logements.
-- Neon > SQL Editor > coller tout le fichier > Run.
--
-- Chaque test essaie une écriture, puis ANNULE tout : aucune donnée de test
-- ne reste dans la base.
-- Résultat attendu : 14 lignes, toutes avec "OK".
--   1      compte autre qu'Owner refusé                      (PRD 2)
--   2 à 4  réservations                                      (PRD 3.4, scénario 5)
--   5      statut de réservation invalide refusé
--   6      code lié à la réservation d'un autre logement refusé
--   7      même code actif deux fois sur un logement refusé
--   8      format du code (chiffres, 4 à 10) refusé
--   9      température cible hors 16-32 refusée             (PRD 3.2)
--   10     humidité hors 0-100 refusée
--   11     code actif sur réservation annulée refusé        (PRD 5.3)
--   12     annuler une réservation annule ses codes         (PRD 5.3)
--   13     deux logements avec le même numéro de maison refusés
--   14     valeurs par défaut des équipements
-- =====================================================

CREATE OR REPLACE FUNCTION pg_temp.test_no_overlap()
RETURNS TABLE (test text, resultat text)
LANGUAGE plpgsql AS $$
DECLARE
    v_apt    VARCHAR(20);
    v_other  VARCHAR(20);
    v_resa   INTEGER;
    v_in     TIMESTAMP;
    v_out    TIMESTAMP;
    v_r2     INTEGER;
    v_status TEXT;
    v_door   TEXT;
    v_target INTEGER;
    v_clean  BOOLEAN;
BEGIN
    -- TEST 1 : un compte Manager doit être REFUSÉ
    test := 'Test 1 : compte Manager (doit être refusé)';
    BEGIN
        INSERT INTO users (email, full_name, password_hash, role)
        VALUES ('test-manager@smartstay.example', 'Test Manager', 'x', 'manager');
        RAISE EXCEPTION 'insert_accepted';
    EXCEPTION
        WHEN check_violation THEN resultat := 'OK : refusé par chk_users_owner_only';
        WHEN raise_exception THEN resultat := 'ÉCHEC : accepté alors qu''il devait être refusé';
    END;
    RETURN NEXT;

    -- Séjour confirmé qui finit en dernier sur son logement
    SELECT id, apartment_id, check_in, check_out INTO v_resa, v_apt, v_in, v_out
    FROM reservations WHERE status = 'confirmed'
    ORDER BY check_out DESC LIMIT 1;

    IF v_apt IS NULL THEN
        test := '-'; resultat := 'Aucune réservation confirmée : lance d''abord le seed';
        RETURN NEXT; RETURN;
    END IF;

    -- TEST 2 : même période que le séjour existant -> REFUSÉ
    test := 'Test 2 : chevauchement (doit être refusé)';
    BEGIN
        INSERT INTO reservations (apartment_id, reference, check_in, check_out, status)
        VALUES (v_apt, 'TEST-OVERLAP', v_in, v_out, 'confirmed');
        RAISE EXCEPTION 'insert_accepted';
    EXCEPTION
        WHEN exclusion_violation THEN resultat := 'OK : refusé par no_overlap';
        WHEN raise_exception     THEN resultat := 'ÉCHEC : accepté alors qu''il devait être refusé';
    END;
    RETURN NEXT;

    -- TEST 3 : arrivée à l'instant exact du départ -> ACCEPTÉ
    test := 'Test 3 : arrivée le jour du départ (doit être accepté)';
    BEGIN
        INSERT INTO reservations (apartment_id, reference, check_in, check_out, status)
        VALUES (v_apt, 'TEST-SAMEDAY', v_out, v_out + interval '2 days', 'confirmed');
        RAISE EXCEPTION 'insert_accepted';
    EXCEPTION
        WHEN exclusion_violation THEN resultat := 'ÉCHEC : refusé alors qu''il devait être accepté';
        WHEN raise_exception     THEN resultat := 'OK : accepté';
    END;
    RETURN NEXT;

    -- TEST 4 : même période mais réservation ANNULÉE -> ACCEPTÉ
    test := 'Test 4 : chevauchement mais annulée (doit être accepté)';
    BEGIN
        INSERT INTO reservations (apartment_id, reference, check_in, check_out, status)
        VALUES (v_apt, 'TEST-CANCELLED', v_in, v_out, 'cancelled');
        RAISE EXCEPTION 'insert_accepted';
    EXCEPTION
        WHEN exclusion_violation THEN resultat := 'ÉCHEC : refusé alors qu''il devait être accepté';
        WHEN raise_exception     THEN resultat := 'OK : accepté (les annulées sont ignorées)';
    END;
    RETURN NEXT;

    -- TEST 5 : statut de réservation invalide -> REFUSÉ
    test := 'Test 5 : statut de réservation invalide (doit être refusé)';
    BEGIN
        INSERT INTO reservations (apartment_id, reference, check_in, check_out, status)
        VALUES (v_apt, 'TEST-STATUS', v_out + interval '10 days', v_out + interval '12 days', 'bidon');
        RAISE EXCEPTION 'insert_accepted';
    EXCEPTION
        WHEN check_violation THEN resultat := 'OK : refusé par chk_resa_status';
        WHEN raise_exception THEN resultat := 'ÉCHEC : accepté alors qu''il devait être refusé';
    END;
    RETURN NEXT;

    -- TEST 6 : code du logement B avec la réservation du logement A -> REFUSÉ
    SELECT id INTO v_other FROM apartments WHERE id <> v_apt LIMIT 1;
    test := 'Test 6 : code d''un autre logement (doit être refusé)';
    IF v_other IS NULL THEN
        resultat := 'Ignoré : il faut au moins deux logements';
    ELSE
        BEGIN
            INSERT INTO access_codes (code, reservation_id, apartment_id, valid_from, valid_until, status)
            VALUES ('000000', v_resa, v_other, v_in, v_out, 'active');
            RAISE EXCEPTION 'insert_accepted';
        EXCEPTION
            WHEN foreign_key_violation THEN resultat := 'OK : refusé par fk_code_resa_apt';
            WHEN raise_exception       THEN resultat := 'ÉCHEC : accepté alors qu''il devait être refusé';
        END;
    END IF;
    RETURN NEXT;

    -- TEST 7 : même code actif deux fois sur le même logement -> REFUSÉ
    test := 'Test 7 : code actif en double (doit être refusé)';
    BEGIN
        INSERT INTO access_codes (code, reservation_id, apartment_id, valid_from, valid_until)
        VALUES ('000001', v_resa, v_apt, v_in, v_out);
        INSERT INTO access_codes (code, reservation_id, apartment_id, valid_from, valid_until)
        VALUES ('000001', v_resa, v_apt, v_in, v_out);
        RAISE EXCEPTION 'insert_accepted';
    EXCEPTION
        WHEN unique_violation THEN resultat := 'OK : refusé par uq_access_codes_active';
        WHEN raise_exception  THEN resultat := 'ÉCHEC : accepté alors qu''il devait être refusé';
    END;
    RETURN NEXT;

    -- TEST 8 : code avec des lettres -> REFUSÉ
    test := 'Test 8 : code non numérique (doit être refusé)';
    BEGIN
        INSERT INTO access_codes (code, reservation_id, apartment_id, valid_from, valid_until)
        VALUES ('12ab', v_resa, v_apt, v_in, v_out);
        RAISE EXCEPTION 'insert_accepted';
    EXCEPTION
        WHEN check_violation THEN resultat := 'OK : refusé par chk_code_format';
        WHEN raise_exception THEN resultat := 'ÉCHEC : accepté alors qu''il devait être refusé';
    END;
    RETURN NEXT;

    -- TEST 9 : température cible 40 °C -> REFUSÉ
    test := 'Test 9 : température cible hors 16-32 (doit être refusé)';
    BEGIN
        INSERT INTO apartments (id, name, city) VALUES ('zz-test', 'Test', 'Test');
        INSERT INTO device_states (apartment_id, ac_target) VALUES ('zz-test', 40);
        RAISE EXCEPTION 'insert_accepted';
    EXCEPTION
        WHEN check_violation THEN resultat := 'OK : refusé par chk_ac_target';
        WHEN raise_exception THEN resultat := 'ÉCHEC : accepté alors qu''il devait être refusé';
    END;
    RETURN NEXT;

    -- TEST 10 : humidité 150 % -> REFUSÉ
    test := 'Test 10 : humidité hors 0-100 (doit être refusé)';
    BEGIN
        INSERT INTO measurements (apartment_id, temperature, humidity, presence)
        VALUES (v_apt, 25, 150, FALSE);
        RAISE EXCEPTION 'insert_accepted';
    EXCEPTION
        WHEN check_violation THEN resultat := 'OK : refusé par chk_humidity';
        WHEN raise_exception THEN resultat := 'ÉCHEC : accepté alors qu''il devait être refusé';
    END;
    RETURN NEXT;

    -- TEST 11 : code ACTIF sur une réservation ANNULÉE -> REFUSÉ
    test := 'Test 11 : code actif sur réservation annulée (doit être refusé)';
    BEGIN
        INSERT INTO reservations (apartment_id, reference, check_in, check_out, status)
        VALUES (v_apt, 'TEST-T11', v_out + interval '30 days', v_out + interval '32 days', 'cancelled')
        RETURNING id INTO v_r2;
        INSERT INTO access_codes (code, reservation_id, apartment_id, valid_from, valid_until, status)
        VALUES ('000002', v_r2, v_apt, v_out + interval '30 days', v_out + interval '32 days', 'active');
        RAISE EXCEPTION 'insert_accepted';
    EXCEPTION
        WHEN check_violation THEN resultat := 'OK : refusé par trg_code_needs_valid_resa';
        WHEN raise_exception THEN resultat := 'ÉCHEC : accepté alors qu''il devait être refusé';
    END;
    RETURN NEXT;

    -- TEST 12 : annuler une réservation annule automatiquement ses codes
    test := 'Test 12 : annulation de réservation => codes annulés';
    BEGIN
        INSERT INTO reservations (apartment_id, reference, check_in, check_out, status)
        VALUES (v_apt, 'TEST-T12', v_out + interval '40 days', v_out + interval '42 days', 'confirmed')
        RETURNING id INTO v_r2;
        INSERT INTO access_codes (code, reservation_id, apartment_id, valid_from, valid_until, status)
        VALUES ('000003', v_r2, v_apt, v_out + interval '40 days', v_out + interval '42 days', 'active');
        UPDATE reservations SET status = 'cancelled' WHERE id = v_r2;
        SELECT status INTO v_status FROM access_codes WHERE reservation_id = v_r2;
        IF v_status = 'cancelled' THEN
            RAISE EXCEPTION 'cascade_ok';
        ELSE
            RAISE EXCEPTION 'cascade_fail';
        END IF;
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM = 'cascade_ok' THEN
                resultat := 'OK : le code est passé à cancelled (trg_cancel_codes)';
            ELSE
                resultat := 'ÉCHEC : le code est resté actif';
            END IF;
    END;
    RETURN NEXT;

    -- TEST 13 : deux logements avec le même numéro de maison -> REFUSÉ
    -- (autonome : ne dépend pas de house/mqtt_prefix rempli par le seed)
    test := 'Test 13 : même numéro de maison (doit être refusé)';
    BEGIN
        INSERT INTO apartments (id, name, city, house) VALUES ('zz-test-a', 'Test', 'Test', 6);
        INSERT INTO apartments (id, name, city, house) VALUES ('zz-test-b', 'Test', 'Test', 6);
        RAISE EXCEPTION 'insert_accepted';
    EXCEPTION
        WHEN unique_violation THEN resultat := 'OK : refusé par uq_apartments_house';
        WHEN raise_exception  THEN resultat := 'ÉCHEC : accepté alors qu''il devait être refusé';
    END;
    RETURN NEXT;

    -- TEST 14 : valeurs par défaut (porte verrouillée, fenêtre fermée, clim 24 °C)
    test := 'Test 14 : valeurs par défaut des équipements';
    BEGIN
        INSERT INTO apartments (id, name, city) VALUES ('zz-test', 'Test', 'Test');
        INSERT INTO device_states (apartment_id) VALUES ('zz-test');
        SELECT a.cleaning, d.door, d.ac_target INTO v_clean, v_door, v_target
        FROM apartments a JOIN device_states d ON d.apartment_id = a.id WHERE a.id = 'zz-test';
        IF NOT v_clean AND v_door = 'locked' AND v_target = 24 THEN
            RAISE EXCEPTION 'defaults_ok';
        ELSE
            RAISE EXCEPTION 'defaults_fail';
        END IF;
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM = 'defaults_ok' THEN
                resultat := 'OK : locked / closed / clim éteinte / 24 / cool';
            ELSE
                resultat := 'ÉCHEC : valeurs par défaut incorrectes';
            END IF;
    END;
    RETURN NEXT;
END;
$$;

SELECT * FROM pg_temp.test_no_overlap();
