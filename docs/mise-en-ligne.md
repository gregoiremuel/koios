# Mettre les maquettes en ligne (depuis un téléphone)

Une seule fois, environ 10 minutes. Ensuite, chaque modification poussée sur GitHub se publie toute seule.

1. Ouvre **dash.cloudflare.com/sign-up** dans Safari et crée un compte gratuit (email et mot de passe), puis confirme l'email.
2. Dans le tableau de bord, va dans **Workers & Pages**.
3. Touche **Create application**, puis l'onglet **Pages**, puis **Connect to Git**.
4. Choisis **GitHub**, connecte-toi en gregoiremuel, puis **Install & Authorize** en autorisant seulement le dépôt **koios**.
5. Sélectionne **koios**, puis **Begin setup**.
6. Réglages :
   - Project name : `koios`
   - Production branch : `main`
   - Framework preset : None
   - Build command : laisser vide
   - Build output directory : `maquettes`
7. Touche **Save and Deploy**. Au bout d'une minute environ, le site est à l'adresse `https://koios.pages.dev` (ou une adresse proche si le nom est pris).

Le lien est public mais non référencé : le site demande aux moteurs de recherche de ne pas l'indexer.

Source : [Cloudflare Pages, intégration Git](https://developers.cloudflare.com/pages/get-started/git-integration/).
