var L60 = "Corindon synthétique obtenu par fusion à la flamme Verneuil"; // ~60
var VISUELS = [
 {type:"echelle", titre:"Dureté de Mohs des minéraux de référence et des gemmes", unite:"", points:[
  {etiquette:"Talc",valeur:1},{etiquette:"Gypse",valeur:2},{etiquette:"Calcite",valeur:3},{etiquette:"Fluorite",valeur:4},{etiquette:"Apatite",valeur:5},
  {etiquette:"Orthose (feldspath potassique des granites)",valeur:6},{etiquette:"Quartz",valeur:7},{etiquette:"Topaze",valeur:8},{etiquette:L60,valeur:9},{etiquette:"Diamant",valeur:10}]},
 {type:"echelle", titre:"Distances extrêmes", unite:"km", points:[{etiquette:"Paris–Lyon",valeur:465},{etiquette:"Terre–Lune",valeur:384400},{etiquette:"Terre–Soleil",valeur:149597870.7},{etiquette:"Proxima",valeur:999999999999}]},
 {type:"courbe", titre:"Population de Paris et de Londres (1800-2020)", x:{nom:"Année",unite:""}, y:{nom:"Habitants",unite:"millions d’habitants"},
  series:[{nom:"Paris intra-muros",points:[[1800,0.55],[1850,1.05],[1900,2.71],[1950,2.85],[2000,2.13],[2020,2.17]]},
          {nom:"Londres (Grand Londres, limites actuelles)",points:[[1800,1.1],[1850,2.65],[1900,6.5],[1950,8.2],[2000,7.2],[2020,9.0]]},
          {nom:"Ville témoin",points:[[1800,0.1],[1900,0.2],[2020,0.3]]}]},
 {type:"courbe", titre:"Valeurs extrêmes", x:{nom:"Temps",unite:"s"}, y:{nom:"Énergie",unite:"J"}, series:[{nom:"A",points:[[-1000000000000,-1000000000000],[0,0.0001],[1000000000000,1000000000000]]}]},
 {type:"barres", titre:"Hauteur des plus hauts édifices", unite:"m", barres:[
  {etiquette:"Burj Khalifa (Dubaï, Émirats arabes unis, 2010)",valeur:828},{etiquette:"Tour Eiffel",valeur:330},{etiquette:L60,valeur:12.5},{etiquette:"Pyramide de Khéops",valeur:138.5},
  {etiquette:"Tokyo Skytree",valeur:634},{etiquette:"Shanghai Tower",valeur:632},{etiquette:"Merdeka 118",valeur:678.9},{etiquette:"Zéro",valeur:0}]},
 {type:"barres", titre:"Grandes valeurs", unite:"km²", barres:[{etiquette:"Surface des océans terrestres",valeur:361000000},{etiquette:"Petit",valeur:0.001}]},
 {type:"tableau", titre:"Les quatre C du diamant et leur mesure", colonnes:["Critère","Ce qu’il mesure","Échelle utilisée par le GIA","Exemple"],
  lignes:[["Carat","Masse","0,2 g par carat","1 ct = 0,2 g"],["Couleur","Absence de teinte",L60,"D à Z"],["Pureté","Inclusions","FL à I3","VS1"],["Taille","Proportions et symétrie","Excellent à Poor","Excellent"],["Anticonstitutionnellementxxxxxxxxxxxxx","x","y","z"],["a","b","c","d"]]},
 {type:"frise", titre:"Construction de la tour Eiffel", evenements:[
  {date:"28 janvier 1887",texte:"Début des fondations sur le Champ-de-Mars"},{date:"1er juillet 1887",texte:"Début du montage des piliers métalliques"},
  {date:"7 décembre 1887",texte:L60},{date:"Entre le 14 février et le 31 mars 1889 environ",texte:"Pose du campanile et des derniers éléments du sommet"},
  {date:"31 mars 1889",texte:"Eiffel hisse le drapeau au sommet"},{date:"6 mai 1889",texte:"Ouverture de l’Exposition universelle"},
  {date:"15 mai 1889",texte:"Ouverture au public des ascenseurs jusqu’au sommet de la tour"},{date:"1909",texte:"La tour est sauvée grâce à la TSF"}]},
 {type:"schema", titre:"Du minerai au bijou : étapes de la taille", noeuds:[
  {id:"a",texte:"Extraction du brut dans la mine alluviale ou primaire"},{id:"b",texte:"Tri"},{id:"c",texte:L60},{id:"d",texte:"Clivage ou sciage"},
  {id:"e",texte:"Débrutage"},{id:"f",texte:"Facettage"},{id:"g",texte:"Polissage final des facettes et de la table"},{id:"h",texte:"Sertissage"}],
  liens:[{de:"a",vers:"b",texte:"transport vers l’atelier de tri régional"},{de:"b",vers:"c"},{de:"c",vers:"d",texte:"si clivable"},{de:"d",vers:"e"},{de:"e",vers:"f"},{de:"f",vers:"g"},{de:"g",vers:"h"},
   {de:"b",vers:"e",texte:"pierre petite"},{de:"g",vers:"f",texte:"défaut"},{de:"a",vers:"h"},{de:"c",vers:"f"},{de:"h",vers:"a"}]},
 {type:"carte_mentale", centre:"Les propriétés optiques des pierres précieuses taillées", branches:[
  {texte:"Indice de réfraction",sous:["Mesuré au réfractomètre","Diamant : 2,42",L60]},{texte:L60,sous:["Pléochroïsme","Biréfringence"]},
  {texte:"Dispersion",sous:["Feu du diamant : 0,044"]},{texte:"Éclat",sous:[]},{texte:"Couleur",sous:["Chromophores","Centres colorés","Traitements","Origine"]},{texte:"Transparence",sous:["Opaque","Translucide"]}]}
];
var PLAN = {titre:"Gemmologie", niveaux:[
 {titre:"Niveau 1 · Bases de la gemmologie et des minéraux",modules:[1,2,3,4,5,6,7,8,9,10].map(function(n){return {numero:n,etat:n<4?"fait":n===4?"cours":n===5?"ouvert":"ferme"};})},
 {titre:"Niveau 2 · Intermédiaire",modules:[11,12,13,14,15,16,17,18,19,20,21,22,23,24,25].map(function(n){return {numero:n,etat:"ferme"};})},
 {titre:"Maîtrise 1",modules:[{numero:101,etat:"ferme"},{numero:102,etat:"ferme"}]}],
 courant:{titre:"La dureté et la ténacité des gemmes : de Mohs aux essais de rayure modernes",lecons:[1,2,3,4,5,6,7,8,9,10,11,12].map(function(n){return {numero:n,fait:n<6};})}};
