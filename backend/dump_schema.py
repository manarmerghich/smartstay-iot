"""Affiche la structure EXACTE de la base (Neon) pour adapter le backend.
Usage : python dump_schema.py > schema_dump.txt      (lit DATABASE_URL dans .env)
N'affiche aucun mot de passe : seulement tables, colonnes, contraintes, vues et petites tables de référence."""
import os
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy import create_engine, inspect, text

url = os.environ["DATABASE_URL"]
eng = create_engine(url)
insp = inspect(eng)
print("DIALECT:", eng.dialect.name)

for t in sorted(insp.get_table_names()):
    print(f"\n=== TABLE {t} ===")
    for c in insp.get_columns(t):
        print(f"  {c['name']:22} {str(c['type']):24} null={c['nullable']} default={c.get('default')}")
    print("  PK:", insp.get_pk_constraint(t).get("constrained_columns"))
    for fk in insp.get_foreign_keys(t):
        print("  FK:", fk["constrained_columns"], "->", fk["referred_table"], fk["referred_columns"],
              fk.get("options"))
    for ck in insp.get_check_constraints(t):
        print("  CHECK:", ck["name"], ck["sqltext"])
    for u in insp.get_unique_constraints(t):
        print("  UNIQUE:", u["column_names"])

print("\n=== VUES ===")
for v in insp.get_view_names():
    print(f"\n-- {v}\n{insp.get_view_definition(v)}")

with eng.connect() as cx:
    if eng.dialect.name == "postgresql":
        print("\n=== CONTRAINTES (dont EXCLUDE) ===")
        for r in cx.execute(text("SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) "
                                 "FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2")):
            print(" ", *r)
    print("\n=== NOMBRE DE LIGNES ===")
    for t in sorted(insp.get_table_names()):
        print(f"  {t}: {cx.execute(text(f'SELECT count(*) FROM {t}')).scalar()}")
    print("\n=== PETITES TABLES (données fictives) ===")
    for t in ("cities", "automation_rules", "users", "apartments"):
        if t in insp.get_table_names():
            print(f"\n-- {t}")
            for r in cx.execute(text(f"SELECT * FROM {t} LIMIT 10")).mappings():
                print(" ", dict(r))