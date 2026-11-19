# SmartStay IoT — Backend (Basma)

## Lancer
    py -3.11 -m venv .venv ; .venv\Scripts\Activate.ps1
    python -m pip install -r requirements.txt
    copy .env.example .env      # Windows (Linux/Mac : cp) ; .env est lu automatiquement
    python seed.py              # 6 logements + comptes démo (mot de passe : demo1234)
    uvicorn app.main:app --reload
    Docs interactives : http://localhost:8000/docs

## Tester (sans broker réel)
    python -m pytest -q tests

## Compte démo
owner@smartstay.test #Compte du "owner"

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
