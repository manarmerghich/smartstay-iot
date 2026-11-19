# SmartStay IoT — Backend (Basma)

API FastAPI + client MQTT + base de données (SQLite en local, PostgreSQL/Neon en déploiement).

## Lancer en local (sans Neon)
    py -3.11 -m venv .venv ; .venv\Scripts\Activate.ps1      # Linux/Mac : python3 -m venv .venv && source .venv/bin/activate
    python -m pip install -r requirements.txt
    copy .env.example .env                                   # Linux/Mac : cp ; .env est lu automatiquement
    $env:DATABASE_URL = "sqlite:///./local.db"               # base locale, ne touche pas à Neon
    python seed.py                                           # 6 logements + compte Owner
    uvicorn app.main:app --reload
    Docs interactives : http://localhost:8000/docs

## Variables d'environnement (.env, jamais sur GitHub)
- DATABASE_URL : sqlite:///./local.db en local, adresse PostgreSQL de Neon en déploiement.
- JWT_SECRET : obligatoire avec PostgreSQL (24 caractères minimum, valeur aléatoire). Le serveur refuse de démarrer sinon.
      python -c "import secrets; print(secrets.token_urlsafe(48))"
- MQTT_ENABLED, MQTT_HOST, MQTT_PORT, MQTT_PREFIX : connexion au broker.
- WINDOW_RULE_ENABLED : règle de la fenêtre (désactivée par défaut, en attente de validation).
- CORS_ORIGINS : adresses du dashboard autorisées (ajouter l'adresse déployée).

## Base de données Neon
Ordre pour une base neuve (fichiers dans database/) :
1. smartstay_database_complete.sql (remplace les anciennes tables)
2. seed_demo.sql (optionnel : données de démo, crée un code de démo 1234 à supprimer avant la démo finale)
3. python seed.py (recrée le compte Owner, sans doublons)
Vérification : tests_no_overlap.sql doit afficher 14 lignes "OK".

## Compte Owner (démo uniquement)
owner@smartstay.test / demo1234 — seul compte existant. À changer avant toute mise en ligne.

## Tester
    python -m pytest -q
Les tests utilisent leur propre base SQLite temporaire : ils ne touchent jamais à Neon.

## Routes principales (détail et essais : /docs)
- POST /auth/login → token (en-tête Authorization: Bearer ... sur toutes les autres routes)
- GET /apartments, POST /apartments/{id}/commands
- GET/POST /reservations, PUT/DELETE /reservations/{id}
- POST /reservations/{id}/access-code, GET /reservations/{id}/access-codes, POST /access-codes/{id}/cancel
- POST /access/verify, GET /logs, GET /alerts, GET /rules, GET /energy
Les conflits de réservation (chevauchement, réservation annulée, changement de logement avec code existant) renvoient un 409 avec un message lisible.

## Corps de POST /apartments/{id}/commands (un seul champ à la fois)
    {"door":"unlocked"} | {"door":"locked"} | {"window":"open"} | {"window":"closed"}
    {"on":true} | {"target":24} | {"mode":"cool"}

## Test réel avec la maison 1 (broker public)
    # terminal 1
    python seed.py
    uvicorn app.main:app --reload
    # terminal 2 (joue le rôle de la simulation maison1)
    python smoke_maison.py maison1
    # puis POST /apartments/maison1/commands depuis /docs et observer le terminal 2