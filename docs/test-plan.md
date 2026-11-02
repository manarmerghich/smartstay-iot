# SmartStay IoT : Plan de tests

Responsable : Manar (intégration et tests)
Légende : OK = réussi, KO = échec (noter le problème dans la colonne Remarque)

---

## 0. Préparation

- Contrat technique : `docs/contrat.md`
- Broker : `broker.emqx.io`, port 1883, préfixe `smartstay-manar/maisonN/...`
- Outil pour envoyer et lire des messages MQTT sans le serveur : https://www.hivemq.com/demos/websocket-client/ (Connect, puis Subscriptions et Publish)
- S'abonner à `smartstay-manar/#` pour voir tous les messages des 6 maisons.

---

## 1. Tests des 6 simulations Wokwi (sans serveur)

### 1.1 Démarrage

Pour chaque maison : ouvrir le lien Wokwi, cliquer sur **Start**, attendre 10 secondes.

| Maison | Wi-Fi connecté | MQTT connecté | Mesures toutes les 5 s | Remarque |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |

### 1.2 Commandes (à envoyer avec HiveMQ, une maison à la fois)

Sujet : `smartstay-manar/maisonN/command`

| Message | Résultat attendu | M1 | M2 | M3 | M4 | M5 | M6 |
|---|---|---|---|---|---|---|---|
| `{"device":"ac","value":"on"}` | La LED s'allume | | | | | | |
| `{"device":"ac","value":"off"}` | La LED s'éteint | | | | | | |
| `{"device":"window","value":"open"}` | Le servo de la fenêtre tourne | | | | | | |
| `{"device":"window","value":"close"}` | Le servo de la fenêtre revient | | | | | | |
| `{"device":"door","value":"open"}` | Le servo de la porte tourne, puis se referme après 5 s | | | | | | |
| `{"device":"door","value":"close"}` | Le servo de la porte revient | | | | | | |

Note : la commande `door` de la Maison 3 est en attente de correction (Imane). Elle doit être retestée après sa nouvelle PR.

### 1.3 Accès par code (sans serveur)

| Test | Résultat attendu | M1 | M2 | M3 | M4 | M5 | M6 |
|---|---|---|---|---|---|---|---|
| Taper `1234` puis `#` sur le clavier | Message reçu sur `maisonN/access/request` : `{"code":"1234"}` | | | | | | |
| Publier `{"result":"open"}` sur `access/response` | La porte s'ouvre 5 s | | | | | | |
| Publier `{"result":"denied"}` sur `access/response` | La porte reste fermée | | | | | | |
| Taper des chiffres puis `*` | Le code est effacé | | | | | | |
| Taper plus de 10 chiffres | Maximum 10 chiffres pris en compte (la Maison 3 est à corriger) | | | | | | |

### 1.4 Isolation entre maisons

| Test | Résultat attendu | OK / KO |
|---|---|---|
| Envoyer une commande à `maison5/command` pendant que les 6 maisons tournent | Seule la maison 5 réagit | |
| Lancer deux maisons en même temps | Aucune ne se déconnecte en boucle | |

---

## 2. Données de test

À créer dans le serveur avant les scénarios.

**Utilisateurs**
- Owner (Manar ou compte de test)
- Manager
- Cleaning staff

**Réservations pour la maison 1**
- R1 : du 10 au 15 du mois en cours
- R2 (chevauche R1) : du 13 au 18 du mois en cours (doit être refusée)
- R3 (valide, sans chevauchement) : du 20 au 25

**Codes d'accès**
- Code valide : associé à une réservation en cours
- Code expiré : réservation dont la date de départ est passée
- Code annulé : code valide puis annulé
- Code d'une autre maison : code de la maison 2 saisi sur la maison 1
- Code inexistant : par exemple `000000`

---

## 3. Scénarios de bout en bout (PRD section 12)

| N° | Scénario | Étapes | Résultat attendu | OK / KO | Remarque |
|---|---|---|---|---|---|
| 1 | Connexion et consultation | Se connecter comme propriétaire, ouvrir le dashboard | Les 6 logements s'affichent, avec ville, statut et mesures | | |
| 2 | Allumer la clim | Allumer la clim du logement N | La LED de la maison N s'allume, et seulement elle | | |
| 3 | Ouvrir la fenêtre | Ouvrir la fenêtre du logement N | Le servo fenêtre de la maison N bouge, et seulement lui | | |
| 4 | Cleaning staff et porte | Se connecter comme Cleaning staff, tenter de commander la porte | Le serveur refuse, l'action est notée dans le journal | | |
| 5 | Chevauchement | Créer R1 puis R2 sur la maison 1 | R2 est refusée avec un message clair | | |
| 6 | Code valide | Générer un code, le taper sur le clavier de la maison, appuyer sur `#` | La porte se déverrouille, tentative acceptée dans le journal | | |
| 7 | Code erroné ou expiré | Taper un code faux, puis un code expiré | La porte reste verrouillée, tentatives refusées dans le journal | | |
| 8 | Code annulé | Annuler un code, puis le taper | Accès refusé | | |
| 9 | Nouvelle mesure | Changer la température du DHT22 dans Wokwi | La valeur apparaît dans le dashboard en moins de 5 s | | |
| 10 | Serveur arrêté | Arrêter le serveur, recharger le dashboard | Un message d'erreur s'affiche, le dashboard ne plante pas | | |

---

## 4. Tests complémentaires

### Permissions
| Test | Résultat attendu | OK / KO |
|---|---|---|
| Manager commande la porte | Accepté | |
| Cleaning staff marque un logement « en nettoyage » | Accepté | |
| Cleaning staff commande la clim | Refusé | |
| Modifier le rôle depuis le navigateur | Impossible, le serveur décide | |
| Voyageur accède au dashboard | Impossible (pas de compte) | |

### Automatisations
| Test | Résultat attendu | OK / KO |
|---|---|---|
| Température ≥ 28 °C, présence détectée, clim éteinte | Le serveur allume la clim | |
| Présence détectée seule | La porte ne s'ouvre jamais | |
| Clim allumée et fenêtre ouverte | Une alerte s'affiche | |

### Statut du logement
| Test | Résultat attendu | OK / KO |
|---|---|---|
| Présence détectée sans réservation | Le statut ne devient pas « occupé » | |
| Réservation en cours | Statut cohérent avec les dates | |
| Nettoyage lancé puis terminé | Le statut change en conséquence | |

### Énergie
| Test | Résultat attendu | OK / KO |
|---|---|---|
| Consommation journalière | Affichée pour chaque logement | |
| Historique 7 jours | Affiché | |
| Comparaison entre logements | Affichée | |

### Sécurité et qualité
| Test | Résultat attendu | OK / KO |
|---|---|---|
| Mention « Simulated data » | Visible sur les mesures | |
| Mots de passe | Stockés hachés dans la base | |
| Secrets dans GitHub | Aucun (`.env` non versionné) | |
| Site déployé | HTTPS actif | |
| Commande vers la simulation | Moins de 3 secondes | |
| Retard d'affichage des mesures | Moins de 5 secondes | |

---

## 5. Checklist générale

### Frontend
- [ ] Vérifier l'affichage du dashboard
- [ ] Vérifier la liste des logements
- [ ] Vérifier les températures et états des appareils

### Backend
- [ ] Vérifier les routes API avec Basma
- [ ] Tester les réponses en cas d'erreur

### Simulation IoT
- [ ] Vérifier les changements d'état des appareils
- [ ] Vérifier la transmission des données au backend

### Base de données
- [ ] Vérifier la sauvegarde des logements
- [ ] Vérifier la sauvegarde des états des appareils

### Intégration
- [ ] Tester la communication entre les composants
- [ ] Corriger les bugs
- [ ] Vérifier le fonctionnement global

---

## 6. Bugs trouvés

| N° | Maison / composant | Description | Responsable | Statut |
|---|---|---|---|---|
| 1 | Maison 3 | Commande `door` non gérée | Imane | À corriger |
| 2 | Maison 3 | Pas de limite de 10 chiffres pour le code | Imane | À corriger |
