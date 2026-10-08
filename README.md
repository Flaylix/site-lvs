# Site PesentiRenov38

Site vitrine + envoi d'un SMS à Jérémy (via Brevo) à chaque demande de devis.

## Contenu
- `public/index.html` : le site complet (photos incluses)
- `server.js` : sert le site et reçoit le formulaire sur `/api/devis`
- `.env.example` : la liste des réglages

## Brevo (à faire une fois)
1. Créer un compte sur brevo.com.
2. Acheter des crédits SMS (les SMS sont payants, à l'unité).
3. Créer une clé API : menu du compte > SMTP & API > Clés API.
4. Optionnel, pour la copie par e-mail : valider une adresse d'expéditeur.

## Railway
1. Pousser ce dossier sur GitHub.
2. Railway > New Project > Deploy from GitHub repo.
3. Onglet Variables : ajouter `BREVO_API_KEY`, `SMS_TO`, `SMS_SENDER` (et `EMAIL_TO`, `EMAIL_FROM` si copie e-mail).
4. Settings > Networking : générer un domaine, puis ajouter le nom de domaine acheté.

## Tester en local
```
BREVO_API_KEY=xxx node server.js
```
Puis ouvrir http://localhost:3000 et envoyer une demande.

## Réglages
| Variable | Rôle |
|---|---|
| `BREVO_API_KEY` | Clé API Brevo (obligatoire) |
| `SMS_TO` | Numéro qui reçoit le SMS, format `33767026515` |
| `SMS_SENDER` | Nom affiché comme expéditeur, 11 caractères max |
| `EMAIL_TO` / `EMAIL_FROM` | Copie complète par e-mail (optionnel) |
