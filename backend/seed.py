"""Crée les 6 logements + comptes de démo. Usage : python seed.py"""
from app.db import Base, engine, SessionLocal
from datetime import timedelta
from app.db import now
from app.models import Apartment, DeviceState, User, EnergyDaily
from app.security import hash_password

# Historique simulé : 6 jours passés, mêmes valeurs que le dashboard (mockData.js)
HISTORY = {"maison1": [9.8, 10.4, 8.9, 11.2, 12.1, 10.7], "maison2": [7.5, 8.1, 7.7, 9.3, 8.4, 7.9],
           "maison3": [4.2, 4.9, 5.3, 4.6, 5.8, 5.1], "maison4": [5.2, 4.8, 5.9, 6.4, 5.5, 5.0],
           "maison5": [6.3, 6.9, 7.4, 6.1, 7.0, 6.6], "maison6": [11.4, 12.8, 13.5, 12.2, 14.1, 13.0]}

# Villes : voir contrat §1 (décision encore ouverte, à confirmer avec Manar)
HOUSES = [("maison1", "Fès"), ("maison2", "Rabat"), ("maison3", "Tanger"),
          ("maison4", "Fès"), ("maison5", "Tanger"), ("maison6", "Marrakech")]
USERS = [("owner@smartstay.test", "Propriétaire", "owner")]   # un seul compte : l'Owner

Base.metadata.create_all(engine)
with SessionLocal() as db:
    for i, (hid, city) in enumerate(HOUSES, 1):
        if not db.get(Apartment, hid):
            db.add(Apartment(id=hid, name=f"Maison {i}", city=city))
            db.add(DeviceState(apartment_id=hid))
    # anciennes bases : supprimer les comptes manager / cleaning de la première version du PRD
    for old in db.query(User).filter(User.role != "owner").all():
        db.delete(old)
    for email, name, role in USERS:
        if not db.query(User).filter_by(email=email).first():
            db.add(User(email=email, full_name=name, role=role,
                        password_hash=hash_password("demo1234")))  # démo uniquement
    db.commit()
    today = now().date()
    for hid, vals in HISTORY.items():
        if not db.query(EnergyDaily).filter_by(apartment_id=hid).first():
            for i, kwh in enumerate(vals):                 # du plus ancien (J-6) à J-1
                db.add(EnergyDaily(apartment_id=hid, day=today - timedelta(days=6 - i), kwh=kwh))
    db.commit()
print("Base initialisée.")
