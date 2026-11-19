import hashlib, hmac, os
from datetime import timedelta
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from . import config
from .db import get_db, now
from .models import User

_bearer = HTTPBearer(auto_error=False)
OWNER_ROLE = "owner"   # un seul rôle dans le système (PRD v. 18 novembre 2026)

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return salt.hex() + "$" + h.hex()

def verify_password(password: str, stored: str) -> bool:
    salt_hex, h_hex = stored.split("$")
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 200_000)
    return hmac.compare_digest(h.hex(), h_hex)

def create_token(user: User) -> str:
    payload = {"sub": str(user.id), "exp": now() + timedelta(hours=config.JWT_HOURS)}
    return jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")

def current_user(cred: HTTPAuthorizationCredentials = Depends(_bearer),
                 db: Session = Depends(get_db)) -> User:
    if cred is None:
        raise HTTPException(401, "Authentification requise")
    try:
        data = jwt.decode(cred.credentials, config.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Jeton invalide ou expiré")
    user = db.get(User, int(data["sub"]))
    if not user:
        raise HTTPException(401, "Utilisateur inconnu")
    if user.role != OWNER_ROLE:       # PRD §2 : le seul compte autorisé est l'Owner
        raise HTTPException(403, "Accès réservé à l'Owner")
    return user   # le rôle vient TOUJOURS de la base, jamais du navigateur
