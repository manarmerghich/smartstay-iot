# Contrat d'intégration SmartStay IoT

Ce fichier décrit ce que le dashboard, le serveur et les simulations doivent respecter pour communiquer.
Les points marqués **À DÉCIDER** ne sont pas encore validés par l'équipe.

## 1. Broker MQTT

- Serveur : `broker.emqx.io`, port `1883`
- Préfixe des sujets : `smartstay-manar`
- Broker public : uniquement des données fictives.

## 2. Sujets MQTT (N = numéro de la maison, de 1 à 6)

| Sujet | Direction | Contenu |
|---|---|---|
| `smartstay-manar/maisonN/telemetry` | Simulation → serveur | Mesures |
| `smartstay-manar/maisonN/command` | Serveur → simulation | Commande d'un équipement |
| `smartstay-manar/maisonN/access/request` | Simulation → serveur | Code saisi au clavier |
| `smartstay-manar/maisonN/access/response` | Serveur → simulation | Réponse `open` ou `denied` |

## 3. Formats des messages

Mesures (toutes les 5 secondes) :

```json
{ "temperature": 26.5, "humidity": 41, "presence": true }
```

Commande fenêtre ou porte :

```json
{ "device": "window", "value": "open" }
{ "device": "door", "value": "close" }
```

Commande climatisation (format actuel de la simulation) :

```json
{ "device": "ac", "value": "on" }
```

Demande d'accès :

```json
{ "code": "482915" }
```

Réponse d'accès :

```json
{ "result": "open" }
```

## 4. Association maisons et logements (proposition à valider)

| Simulation | Logement du dashboard | Ville |
|---|---|---|
| Maison1 | Riad Atlas Suite | À DÉCIDER |
| Maison2 | Oudaya Sea Apartment | À DÉCIDER |
| Maison3 | Marina Bay Studio | À DÉCIDER |
| Maison4 | Batha Garden Flat | À DÉCIDER |
| Maison5 | Kasbah Terrace Loft | À DÉCIDER |
| Maison6 | Majorelle Garden Suite | À DÉCIDER |

## 5. Points à décider

- [ ] **Format de la clim** : le dashboard envoie `{on: true}`, `{target: 24}` ou `{mode: "cool"}`, la simulation attend `{"device":"ac","value":"on"/"off"}`. Choisir un format commun puis l'appliquer aux 6 maisons.
- [ ] **État des équipements** : ajouter l'état de la porte, de la fenêtre et de la clim au telemetry ?
- [ ] **Durée d'ouverture de la porte** : limiter les 5 secondes au code du clavier ? Après une commande du propriétaire, la porte devrait rester déverrouillée jusqu'à la commande suivante.
- [ ] **Vocabulaire de la porte** : la simulation comprend `open` / `close`, le dashboard utilise `unlocked` / `locked`. Correspondance proposée : `open` = `unlocked`, `close` = `locked`.
- [ ] **Date et heure des mesures** : ajoutées par le serveur à la réception ?
- [ ] **Règle de la fenêtre** : à définir (voir le PRD, section 6.3).
- [ ] **Villes définitives** des six logements.
