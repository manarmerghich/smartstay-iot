# Contrat technique SmartStay IoT

Ce document fixe les décisions communes de l'équipe. Les simulations d'Imane (PR #10) servent de référence : le serveur et le dashboard s'adaptent à elles. Toute modification de ce contrat doit être annoncée à toute l'équipe.

Dernière mise à jour : 2 novembre 2026

---

## 1. Logements et simulations

| Maison | Identifiant | Ville | Lien Wokwi |
|---|---|---|---|
| 1 | maison1 | Fès | https://wokwi.com/projects/479334153761289217 |
| 2 | maison2 | Rabat | https://wokwi.com/projects/479414516757798913 |
| 3 | maison3 | Tanger | https://wokwi.com/projects/479415742997385217 |
| 4 | maison4 | Fès | https://wokwi.com/projects/479417108883200001 |
| 5 | maison5 | Tanger | https://wokwi.com/projects/479417747657997313 |
| 6 | maison6 | Marrakech | https://wokwi.com/projects/479418265968172033 |

---

## 2. MQTT

- Broker : `broker.emqx.io`
- Port : `1883`
- Préfixe : `smartstay-manar/maisonN/...` (N de 1 à 6)
- Données fictives uniquement (broker public).

| Sujet | Direction | Fonction |
|---|---|---|
| `smartstay-manar/maisonN/telemetry` | Simulation → serveur | Mesures (toutes les 5 s) |
| `smartstay-manar/maisonN/command` | Serveur → simulation | Commandes des équipements |
| `smartstay-manar/maisonN/access/request` | Simulation → serveur | Code saisi sur le clavier |
| `smartstay-manar/maisonN/access/response` | Serveur → simulation | Réponse d'accès |

---

## 3. Formats des messages

### Mesures (telemetry)
```json
{ "temperature": 26.5, "humidity": 41, "presence": true }
```

### Commandes (command)
```json
{ "device": "door",   "value": "open" }
{ "device": "door",   "value": "close" }
{ "device": "window", "value": "open" }
{ "device": "window", "value": "close" }
{ "device": "ac",     "value": "on" }
{ "device": "ac",     "value": "off" }
```

### Demande d'accès (access/request)
```json
{ "code": "482915" }
```

### Réponse d'accès (access/response)
```json
{ "result": "open" }
{ "result": "denied" }
```

---

## 4. Vocabulaire

| Dashboard | Simulation (MQTT) |
|---|---|
| porte `locked` | `close` |
| porte `unlocked` | `open` |
| fenêtre ouverte / fermée | `open` / `close` |
| clim allumée / éteinte | `on` / `off` |

---

## 5. Comportement de la simulation (ne change plus)

- La porte se referme toute seule 5 secondes après une ouverture (par code ou par commande).
- La présence n'ouvre jamais la porte.
- La simulation n'a aucune règle d'automatisation : toutes les règles sont dans le serveur.
- Les mesures viennent du capteur DHT22, sans température forcée.
- Clavier : `#` envoie le code, `*` efface, 10 chiffres maximum.
- La clim est une LED : elle ne comprend que `on` et `off`.

---

## 6. Responsabilités du serveur (Basma)

1. Envoyer les commandes telles que définies à la section 3.
2. **Température cible et mode de la clim** (16 à 32 °C, Cool / Auto / Dry) : stockés côté serveur seulement. La simulation reçoit uniquement `on` ou `off`.
3. **États des équipements** (porte, fenêtre, clim) : déduits du dernier ordre envoyé, puis enregistrés dans `device_states`.
4. **Porte** : après une ouverture, remettre l'état à `locked` au bout de 5 s, car la simulation se referme seule.
5. **Date et heure** : ajoutées par le serveur à chaque mesure reçue.
6. Vérifier les codes d'accès (existence, logement, période, annulation, réservation valide) et répondre `open` ou `denied`.
7. Enregistrer chaque commande et chaque tentative d'accès dans le journal.
8. Appliquer les automatisations (climatisation : température ≥ 28 °C, présence détectée, clim éteinte).

---

## 7. Responsabilités du dashboard (Fatima)

- Garder `locked` = `close` et `unlocked` = `open`.
- Envoyer au serveur `{on: true}`, `{target: 24}` ou `{mode: "cool"}` : c'est le serveur qui traduit en `on` / `off` pour la simulation.
- Afficher la mention « Simulated data ».
- Afficher un message d'erreur si le serveur est arrêté.

---

## 8. Routes API (proposées, à valider par Basma et Fatima)

| Route | Fonction |
|---|---|
| GET /apartments | Récupérer les logements et leurs états |
| POST /apartments/{id}/commands | Envoyer une commande |
| GET /reservations | Consulter les réservations |
| POST /reservations | Créer une réservation |
| PUT /reservations/{id} | Modifier une réservation |
| DELETE /reservations/{id} | Supprimer une réservation |
| POST /reservations/{id}/access-code | Générer un code d'accès |
| POST /access/verify | Vérifier un code d'accès |
| GET /logs | Consulter le journal d'activité |

---

## 9. Décisions encore ouvertes

- [ ] Villes des six logements (section 1)
- [ ] Règle de la fenêtre (proposition du PRD : fermer la fenêtre quand la clim fonctionne)
- [ ] Méthode de génération et de stockage des codes d'accès
- [ ] Routes API (section 8)
- [ ] Solutions de déploiement (frontend, backend, base)
- [ ] Vérification du clavier et de MQTT dans Wokwi (test de Manar sur les 6 maisons)

## 10. Corrections en attente

- [ ] Maison 3 : ajouter la commande `door` (open/close) dans `mqttCallback` (Imane)
- [ ] Maison 3 : limiter le code saisi à 10 chiffres (Imane)
