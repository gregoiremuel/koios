// Contenus simulés de l'API v2 pour scripts/serveur_local.mjs : pages Wikipédia (FR et EN), plans d'étape,
// paliers (sections, définitions, frise, chiffres, notions, questions), quiz et vérification.
// Trois sujets ont de vraies fiches (Tour Eiffel, mont Blanc, Sparte) ; les autres reçoivent un contenu de
// forme valide, étiqueté « simulé ». Les faits des fiches sont exacts, mais tout est écrit à la main : rien ne
// vient d'une IA ni d'un site. Aucune dépendance, aucun secret.

import { sansAccents } from '../lib/wiki.js';

const qcm = (enonce, bonne, fausses, explication) => ({
  type: 'qcm', enonce, reponses: [bonne, ...fausses], bonne: 0, explication,
});
const vf = (affirmation, vrai, explication) => ({ type: 'vraifaux', affirmation, vrai, explication });
const fiche = (f) => f;

// --- Fiches ----------------------------------------------------------------

const EIFFEL = fiche({
  cle: 'eiffel',
  titre: 'Tour Eiffel',
  titreEn: 'Eiffel Tower',
  motImage: 'Eiffel Tower Paris',
  etape1: 'Les bases de la tour',
  etape2: 'La tour de plus près',
  resume: 'La tour Eiffel est une tour de fer puddlé bâtie à Paris pour l’Exposition universelle de 1889. Son histoire mêle ingénierie, polémique artistique et progrès de la radio.',
  paliers1: ['Une tour pour l’Exposition de 1889', 'Gustave Eiffel et son entreprise', 'Le projet de Koechlin et Nouguier', 'Stephen Sauvestre et l’allure de la tour', 'Le fer puddlé et les rivets', 'Un chantier de deux ans', 'La protestation des artistes', 'Du record de hauteur à la radio', 'Une tour souvent repeinte', 'Un monument visité dans le monde entier'],
  paliers2: ['Les 18 038 pièces de la structure', 'Les fondations du Champ-de-Mars', 'Les expériences de Gustave Ferrié', 'Le laboratoire d’aérodynamique d’Eiffel', 'La tour et le viaduc de Garabit', 'La statue de la Liberté et son armature', 'Les illuminations de la tour', 'Les restaurations du vingtième siècle', 'La tour au cinéma', 'Les répliques dans le monde'],
  fr: 'La tour Eiffel est une tour de fer puddlé construite à Paris, sur le Champ-de-Mars, pour l’Exposition universelle de 1889. Elle porte le nom de l’ingénieur Gustave Eiffel, dont l’entreprise la réalise d’après le projet de Maurice Koechlin et d’Émile Nouguier, ingénieurs de son bureau d’études, avec l’architecte Stephen Sauvestre.\n\nLe chantier s’ouvre le 28 janvier 1887 et s’achève le 31 mars 1889. La tour compte 18 038 pièces de fer assemblées par 2,5 millions de rivets. Haute de 312 mètres à l’origine, elle reste la plus haute construction du monde jusqu’en 1930, année où le Chrysler Building, à New York, la dépasse.\n\nEn février 1887, des artistes et des écrivains publient dans le journal Le Temps une protestation contre le projet. Prévue pour être démontée au bout de vingt ans, la tour est conservée notamment parce qu’elle sert d’antenne pour la télégraphie sans fil, grâce aux expériences de radiotélégraphie du capitaine Gustave Ferrié. Elle est repeinte environ tous les sept ans et reçoit aujourd’hui environ 6 millions de visiteurs par an. (Texte simulé.)',
  en: 'The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris, built for the 1889 World\'s Fair. It is named after the engineer Gustave Eiffel, whose company designed and built it from a project by Maurice Koechlin and Émile Nouguier, with the architect Stephen Sauvestre.\n\nConstruction began on 28 January 1887 and ended on 31 March 1889. The tower has 18,038 iron parts joined by 2.5 million rivets. At 312 metres when it was built, it was the tallest structure in the world until 1930, when the Chrysler Building in New York City surpassed it.\n\nIn February 1887, artists and writers published a protest against the project in the newspaper Le Temps. Meant to be dismantled after twenty years, the tower was kept partly because it served as an antenna for wireless telegraphy. It is repainted about every seven years and receives about 6 million visitors a year. (Simulated text.)',
  enBref: ['La tour Eiffel est une tour de fer puddlé, construite à Paris sur le Champ-de-Mars.', 'Elle est bâtie pour l’Exposition universelle de 1889.', 'Elle porte le nom de Gustave Eiffel, dont l’entreprise la réalise.', 'Haute de 312 mètres à l’origine, elle reste la plus haute construction du monde jusqu’en 1930.', 'Elle reçoit aujourd’hui environ 6 millions de visiteurs par an.'],
  comment: ['Le projet vient de Maurice Koechlin et d’Émile Nouguier, ingénieurs du bureau d’études de l’entreprise Eiffel.', 'L’architecte Stephen Sauvestre dessine l’allure générale de la tour.', 'La tour compte 18 038 pièces de fer, assemblées par 2,5 millions de rivets.', 'Elle est repeinte environ tous les sept ans.'],
  pourquoi: ['La tour est construite pour l’Exposition universelle de 1889, à Paris.', 'Elle est prévue pour être démontée au bout de vingt ans.', 'Elle est conservée notamment parce qu’elle sert d’antenne pour la télégraphie sans fil.', 'Les expériences de radiotélégraphie du capitaine Gustave Ferrié lui donnent une utilité scientifique.'],
  ouQuand: ['Le chantier s’ouvre le 28 janvier 1887.', 'Il s’achève le 31 mars 1889, en un peu plus de deux ans.', 'Le Chrysler Building, à New York, dépasse la tour en 1930.', 'En février 1887, des artistes et des écrivains publient une protestation dans le journal Le Temps.'],
  definitions: [
    ['Fer puddlé', 'Fer obtenu en brassant de la fonte en fusion pour en retirer le carbone, plus malléable que la fonte.'],
    ['Rivet', 'Tige métallique à tête, posée à chaud puis écrasée pour assembler deux pièces.'],
    ['Exposition universelle', 'Grande manifestation internationale qui présente les arts, l’industrie et les techniques de plusieurs pays.'],
    ['Bureau d’études', 'Service d’une entreprise qui conçoit les plans et calcule les structures avant la fabrication.'],
    ['Radiotélégraphie', 'Transmission de signaux par ondes radio, sans fil entre l’émetteur et le récepteur.'],
    ['Champ-de-Mars', 'Vaste esplanade de Paris, ancien terrain d’exercice militaire, qui accueille les expositions universelles.'],
  ],
  frise: [['1832', 'Naissance de Gustave Eiffel à Dijon.'], ['28 janvier 1887', 'Début du chantier de la tour.'], ['Février 1887', 'Protestation d’artistes et d’écrivains publiée dans Le Temps.'], ['31 mars 1889', 'Fin du chantier de la tour.'], ['1930', 'Le Chrysler Building dépasse la tour en hauteur.']],
  chiffres: { unite: 'm', valeurs: [['Chrysler Building (1930)', 319], ['Tour Eiffel (1889)', 312], ['Washington Monument', 169], ['Cathédrale de Cologne', 157]] },
  notions: { noeuds: ['Tour Eiffel', 'Gustave Eiffel', 'Exposition universelle', 'Paris', 'Radio'], liens: [['Gustave Eiffel', 'Tour Eiffel', 'entreprise constructrice'], ['Tour Eiffel', 'Exposition universelle', 'bâtie pour'], ['Exposition universelle', 'Paris', 'se tient à'], ['Tour Eiffel', 'Radio', 'sert d’antenne']] },
  histoire: ['Prévue pour être démontée au bout de vingt ans, la tour est conservée en partie grâce à son usage comme antenne de radio.', 'En février 1887, des artistes et des écrivains publient dans Le Temps une protestation contre la construction de la tour.'],
  qcm: [
    qcm('Pour quelle occasion la tour Eiffel est-elle construite ?', 'L’Exposition universelle de 1889', ['Les Jeux olympiques de 1900', 'Le sacre de Napoléon III', 'L’ouverture du métro'], 'La tour est construite pour l’Exposition universelle de 1889, à Paris. Les trois autres événements ne sont pas ceux pour lesquels elle est bâtie.'),
    qcm('Quel matériau compose la structure de la tour ?', 'Du fer puddlé', ['De la pierre de taille', 'Du béton armé', 'Du bois'], 'La structure est en fer puddlé, assemblé par des rivets. Les trois autres matériaux ne sont pas ceux de la tour.'),
    qcm('Combien de rivets assemblent les pièces de la tour ?', '2,5 millions', ['25 000', '250 000', '25 millions'], 'La tour compte 18 038 pièces de fer assemblées par 2,5 millions de rivets. Les autres nombres ne correspondent pas.'),
    qcm('Quel architecte dessine l’allure générale de la tour ?', 'Stephen Sauvestre', ['Charles Garnier', 'Victor Baltard', 'Gustave Ferrié'], 'L’architecte Stephen Sauvestre dessine l’allure de la tour, dont les ingénieurs Koechlin et Nouguier conçoivent la structure.'),
    qcm('Quel monument dépasse la tour Eiffel en hauteur en 1930 ?', 'Le Chrysler Building', ['Le Washington Monument', 'La cathédrale de Cologne', 'La statue de la Liberté'], 'Le Chrysler Building, à New York, dépasse la tour en 1930. Les trois autres monuments sont plus bas qu’elle.'),
    qcm('Dans quel journal paraît la protestation des artistes contre la tour ?', 'Le Temps', ['Le Figaro', 'La Presse', 'Le Petit Journal'], 'La protestation d’artistes et d’écrivains paraît dans Le Temps en février 1887, avant la fin du chantier.'),
    qcm('Qui mène des expériences de radiotélégraphie depuis la tour ?', 'Le capitaine Gustave Ferrié', ['Louis Pasteur', 'Pierre Curie', 'Maurice Koechlin'], 'Les expériences du capitaine Gustave Ferrié font de la tour une antenne utile, ce qui contribue à sa conservation.'),
  ],
  vf: [
    vf('La tour Eiffel devait rester debout définitivement dès 1889.', false, 'Faux. La tour était prévue pour être démontée au bout de vingt ans.'),
    vf('Le chantier de la tour dure un peu plus de deux ans.', true, 'Vrai. Il s’ouvre le 28 janvier 1887 et s’achève le 31 mars 1889.'),
    vf('La tour Eiffel est repeinte environ tous les sept ans.', true, 'Vrai. La tour est repeinte régulièrement, environ tous les sept ans.'),
  ],
});

const BLANC = fiche({
  cle: 'blanc',
  titre: 'Mont Blanc',
  titreEn: 'Mont Blanc',
  motImage: 'Mont Blanc Alps',
  etape1: 'Le plus haut sommet des Alpes',
  etape2: 'Le massif de plus près',
  resume: 'Le mont Blanc est le plus haut sommet des Alpes, à la frontière entre la France et l’Italie. Sa première ascension, en 1786, marque les débuts de l’alpinisme.',
  paliers1: ['Un sommet à la frontière', 'L’altitude du mont Blanc', 'La première ascension de 1786', 'Horace-Bénédict de Saussure', 'Chamonix, ville de départ', 'La mer de Glace', 'Le tunnel du Mont-Blanc', 'L’aiguille du Midi', 'Les Jeux olympiques de 1924', 'Un massif pour alpinistes et randonneurs'],
  paliers2: ['Mesurer un sommet', 'Les glaciers du massif', 'La dent du Géant', 'La route vers Courmayeur', 'Les premières cordées', 'Le téléphérique de l’aiguille du Midi', 'Le climat en haute montagne', 'Les risques de l’ascension', 'La faune et la flore du massif', 'Le massif et le changement climatique'],
  fr: 'Le mont Blanc est le plus haut sommet des Alpes et de l’Europe occidentale, à la frontière entre la France et l’Italie. Son altitude, mesurée en 2021, est de 4 805,59 mètres. Le massif compte de nombreux glaciers, dont la mer de Glace, longue d’environ 7 kilomètres.\n\nSa première ascension est réalisée le 8 août 1786 par Jacques Balmat et le docteur Michel-Gabriel Paccard, partis de Chamonix. Horace-Bénédict de Saussure, naturaliste genevois, avait promis dès 1760 une récompense à qui trouverait une voie vers le sommet, et il y monte lui-même en 1787.\n\nLe tunnel du Mont-Blanc, long de 11,6 kilomètres, relie Chamonix à Courmayeur depuis 1965. L’aiguille du Midi, accessible par téléphérique depuis Chamonix, culmine à 3 842 mètres et la dent du Géant à 4 013 mètres. Les Jeux olympiques d’hiver de 1924 ont lieu à Chamonix. (Texte simulé.)',
  en: 'Mont Blanc is the highest mountain in the Alps and in Western Europe, on the border between France and Italy. Its height, measured in 2021, is 4,805.59 metres. The massif has many glaciers, including the Mer de Glace, about 7 kilometres long.\n\nThe first ascent was made on 8 August 1786 by Jacques Balmat and Dr Michel-Gabriel Paccard, who set out from Chamonix. The Genevan naturalist Horace-Bénédict de Saussure had promised a reward in 1760 to anyone who found a route to the summit, and he climbed it himself in 1787.\n\nThe Mont Blanc Tunnel, 11.6 kilometres long, has linked Chamonix to Courmayeur since 1965. The Aiguille du Midi, reached by cable car from Chamonix, rises to 3,842 metres and the Dent du Géant to 4,013 metres. The 1924 Winter Olympics took place in Chamonix. (Simulated text.)',
  enBref: ['Le mont Blanc est le plus haut sommet des Alpes et de l’Europe occidentale.', 'Il se situe à la frontière entre la France et l’Italie.', 'Son altitude, mesurée en 2021, est de 4 805,59 mètres.', 'Le massif compte de nombreux glaciers, dont la mer de Glace.', 'Le tunnel du Mont-Blanc relie Chamonix à Courmayeur depuis 1965.'],
  comment: ['La première ascension part de Chamonix, avec Jacques Balmat et le docteur Michel-Gabriel Paccard.', 'Horace-Bénédict de Saussure monte à son tour au sommet l’année suivante, en 1787.', 'La mer de Glace s’étend sur environ 7 kilomètres de long.', 'Le tunnel du Mont-Blanc mesure 11,6 kilomètres de long.'],
  pourquoi: ['Saussure avait promis dès 1760 une récompense à qui trouverait une voie vers le sommet.', 'Les ascensions de 1786 et de 1787 font de Chamonix un point de départ pour les alpinistes.', 'Le tunnel relie directement Chamonix, en France, à Courmayeur, en Italie.', 'Le massif attire aujourd’hui des alpinistes et des randonneurs venus du monde entier.'],
  ouQuand: ['La première ascension a lieu le 8 août 1786.', 'Saussure atteint le sommet en 1787.', 'Le tunnel du Mont-Blanc ouvre en 1965.', 'Les Jeux olympiques d’hiver de 1924 se tiennent à Chamonix.'],
  definitions: [
    ['Massif', 'Ensemble de montagnes qui forme un bloc bien distinct dans le relief.'],
    ['Glacier', 'Masse de glace formée par l’accumulation de neige, qui s’écoule lentement sur une pente.'],
    ['Ascension', 'Montée vers un sommet, à pied ou en escaladant.'],
    ['Altitude', 'Hauteur d’un point par rapport au niveau de la mer.'],
    ['Naturaliste', 'Savant qui étudie les êtres vivants, les roches et les paysages.'],
    ['Téléphérique', 'Cabine suspendue à un câble, qui monte des passagers en montagne.'],
  ],
  frise: [['1760', 'Saussure promet une récompense à qui trouvera une voie vers le sommet.'], ['8 août 1786', 'Première ascension du mont Blanc.'], ['1787', 'Saussure atteint le sommet.'], ['1924', 'Jeux olympiques d’hiver à Chamonix.'], ['1965', 'Ouverture du tunnel du Mont-Blanc.']],
  chiffres: { unite: 'm', valeurs: [['Mont Blanc', 4805.59], ['Dent du Géant', 4013], ['Aiguille du Midi', 3842]] },
  notions: { noeuds: ['Mont Blanc', 'Chamonix', 'Saussure', 'Courmayeur', 'Mer de Glace'], liens: [['Chamonix', 'Mont Blanc', 'point de départ'], ['Saussure', 'Mont Blanc', 'monte en 1787'], ['Chamonix', 'Courmayeur', 'relie le tunnel'], ['Mont Blanc', 'Mer de Glace', 'porte le glacier']] },
  histoire: ['Horace-Bénédict de Saussure, qui monte au sommet en 1787, avait promis dès 1760 une récompense à qui trouverait une voie vers le sommet.', 'Les Jeux olympiques d’hiver de 1924, à Chamonix, sont les premiers de l’histoire à se tenir dans cette ville du pied du mont Blanc.'],
  qcm: [
    qcm('Quelle est l’altitude du mont Blanc mesurée en 2021 ?', '4 805,59 mètres', ['4 810 mètres', '4 478 mètres', '5 642 mètres'], 'L’altitude mesurée en 2021 est de 4 805,59 mètres. Les autres valeurs ne sont pas celles du mont Blanc.'),
    qcm('Qui réalise la première ascension du mont Blanc en 1786 ?', 'Jacques Balmat et Michel-Gabriel Paccard', ['Horace-Bénédict de Saussure seul', 'Edward Whymper', 'Walter Bonatti'], 'La première ascension est réalisée le 8 août 1786 par Jacques Balmat et le docteur Paccard. Saussure y monte l’année suivante.'),
    qcm('De quelle ville part la première ascension ?', 'Chamonix', ['Grenoble', 'Annecy', 'Turin'], 'Balmat et Paccard partent de Chamonix, au pied du massif, pour la première ascension de 1786.'),
    qcm('Quelle est la longueur du tunnel du Mont-Blanc ?', '11,6 kilomètres', ['3,2 kilomètres', '24 kilomètres', '7 kilomètres'], 'Le tunnel du Mont-Blanc mesure 11,6 kilomètres de long. Les autres longueurs ne sont pas les siennes.'),
    qcm('Quelle ville italienne le tunnel relie-t-il à Chamonix ?', 'Courmayeur', ['Aoste', 'Turin', 'Milan'], 'Le tunnel relie Chamonix à Courmayeur depuis 1965. Les autres villes italiennes ne sont pas ses extrémités.'),
    qcm('En quelle année Saussure atteint-il le sommet ?', '1787', ['1786', '1760', '1865'], 'Saussure monte au sommet en 1787, un an après la première ascension. En 1760, il avait seulement promis une récompense.'),
    qcm('Quelle ville du massif accueille les Jeux olympiques d’hiver de 1924 ?', 'Chamonix', ['Grenoble', 'Albertville', 'Cortina d’Ampezzo'], 'Les Jeux olympiques d’hiver de 1924 ont lieu à Chamonix. Les trois autres villes ne les accueillent pas cette année-là.'),
  ],
  vf: [
    vf('Le mont Blanc se situe entièrement en France.', false, 'Faux. Le sommet se trouve à la frontière entre la France et l’Italie.'),
    vf('La première ascension du mont Blanc a lieu le 8 août 1786.', true, 'Vrai. Jacques Balmat et Michel-Gabriel Paccard atteignent le sommet ce jour-là.'),
    vf('Le tunnel du Mont-Blanc est ouvert depuis 1965.', true, 'Vrai. Il relie Chamonix à Courmayeur depuis 1965.'),
  ],
});

const SPARTE = fiche({
  cle: 'sparte',
  titre: 'Sparte',
  titreEn: 'Sparta',
  motImage: 'Sparta Greece ruins',
  etape1: 'La cité de Laconie',
  etape2: 'Sparte de plus près',
  resume: 'Sparte est une cité de la Grèce antique, connue pour son organisation militaire et son éducation exigeante. Rivale d’Athènes, elle domine le Péloponnèse pendant plusieurs siècles.',
  paliers1: ['Sparte en Laconie', 'Une société militaire', 'L’agôgê, éducation des jeunes', 'Les Égaux et les hilotes', 'Deux rois à la tête de la cité', 'La gérousie et les éphores', 'Léonidas aux Thermopyles', 'La guerre du Péloponnèse', 'La défaite de Leuctres', 'Le déclin de la puissance spartiate'],
  paliers2: ['L’hoplite et sa phalange', 'Les périèques', 'La vie quotidienne des Spartiates', 'Le rôle des femmes à Sparte', 'Les repas en commun', 'Sparte et les guerres médiques', 'Athènes face à Sparte', 'Thèbes et Épaminondas', 'Les ruines de Sparte', 'Sparte dans la mémoire occidentale'],
  fr: 'Sparte est une cité de la Grèce antique, située en Laconie, dans le sud du Péloponnèse. Sa société est organisée autour de l’éducation militaire : les jeunes Spartiates suivent l’agôgê, un système d’éducation public, dès l’âge de sept ans. Les citoyens à part entière, les Égaux, vivent de domaines cultivés par les hilotes, population asservie.\n\nLa cité est dirigée par deux rois, une assemblée d’anciens appelée gérousie et cinq éphores élus chaque année. En 480 avant notre ère, le roi Léonidas et 300 Spartiates résistent aux Perses aux Thermopyles.\n\nLa guerre du Péloponnèse oppose Sparte à Athènes de 431 à 404 avant notre ère et se termine par la victoire de Sparte. En 371 avant notre ère, Thèbes la bat à Leuctres. Sparte perd ensuite sa puissance. (Texte simulé.)',
  en: 'Sparta was a city-state of ancient Greece, located in Laconia, in the south of the Peloponnese. Its society was organised around military training: young Spartans followed the agoge, a public education system, from the age of seven. Full citizens, the Equals, lived off estates farmed by the helots, an enslaved population.\n\nThe city was led by two kings, a council of elders called the gerousia and five ephors elected each year. In 480 BC, King Leonidas and 300 Spartans resisted the Persians at Thermopylae.\n\nThe Peloponnesian War pitted Sparta against Athens from 431 to 404 BC and ended in a Spartan victory. In 371 BC, Thebes defeated Sparta at Leuctra. Sparta lost its power afterwards. (Simulated text.)',
  enBref: ['Sparte est une cité de la Grèce antique, située en Laconie, dans le sud du Péloponnèse.', 'Sa société est organisée autour de l’éducation militaire.', 'Les citoyens à part entière, appelés les Égaux, vivent de domaines cultivés par les hilotes.', 'La cité est dirigée par deux rois, une assemblée d’anciens et cinq éphores.', 'Rivale d’Athènes, elle domine le Péloponnèse pendant plusieurs siècles.'],
  comment: ['Les jeunes Spartiates suivent l’agôgê, un système d’éducation public, dès l’âge de sept ans.', 'Les hilotes, population asservie, cultivent les domaines des citoyens.', 'La gérousie, assemblée d’anciens, siège avec les deux rois.', 'Les cinq éphores sont élus chaque année.'],
  pourquoi: ['L’éducation militaire prépare chaque citoyen à servir comme hoplite, soldat lourdement armé.', 'Le travail des hilotes libère les citoyens des tâches agricoles.', 'Deux rois se partagent le pouvoir à la tête de la cité.', 'Les éphores, élus chaque année, participent à la direction de la cité.'],
  ouQuand: ['En 480 avant notre ère, le roi Léonidas et ses hoplites résistent aux Perses aux Thermopyles.', 'La guerre du Péloponnèse oppose Sparte à Athènes de 431 à 404 avant notre ère.', 'En 371 avant notre ère, Thèbes bat Sparte à Leuctres.', 'Sparte perd ensuite sa puissance.'],
  definitions: [
    ['Agôgê', 'Système d’éducation public et militaire que suivent les jeunes Spartiates dès l’âge de sept ans.'],
    ['Hilotes', 'Population asservie qui cultive les terres des citoyens de Sparte.'],
    ['Éphore', 'Magistrat spartiate élu chaque année, au nombre de cinq.'],
    ['Gérousie', 'Assemblée d’anciens qui siège avec les deux rois de Sparte.'],
    ['Hoplite', 'Soldat grec lourdement armé, qui combat en rangs serrés.'],
    ['Péloponnèse', 'Grande péninsule du sud de la Grèce, où se trouve Sparte.'],
  ],
  frise: [['480 av. J.-C.', 'Léonidas et 300 Spartiates résistent aux Perses aux Thermopyles.'], ['431 av. J.-C.', 'Début de la guerre du Péloponnèse entre Sparte et Athènes.'], ['404 av. J.-C.', 'Fin de la guerre du Péloponnèse, par la victoire de Sparte.'], ['371 av. J.-C.', 'Thèbes bat Sparte à Leuctres.']],
  chiffres: { unite: 'personnes', valeurs: [['Rois à la tête de la cité', 2], ['Éphores élus chaque année', 5], ['Spartiates avec Léonidas', 300]] },
  notions: { noeuds: ['Sparte', 'Athènes', 'Thèbes', 'Léonidas', 'Hilotes'], liens: [['Sparte', 'Athènes', 'rivales'], ['Thèbes', 'Sparte', 'bat à Leuctres'], ['Léonidas', 'Sparte', 'roi de'], ['Hilotes', 'Sparte', 'cultivent ses terres']] },
  histoire: ['En 480 avant notre ère, le roi Léonidas commande 300 Spartiates qui résistent aux Perses aux Thermopyles.', 'Sparte sort victorieuse de la guerre du Péloponnèse contre Athènes, mais Thèbes la bat à Leuctres en 371 avant notre ère.'],
  qcm: [
    qcm('Dans quelle région de la Grèce se trouve Sparte ?', 'La Laconie', ['L’Attique', 'La Béotie', 'La Thessalie'], 'Sparte se trouve en Laconie, dans le sud du Péloponnèse. Les trois autres régions ne sont pas la sienne.'),
    qcm('À quel âge les jeunes Spartiates entrent-ils dans l’agôgê ?', 'Sept ans', ['Douze ans', 'Seize ans', 'Vingt ans'], 'Les jeunes Spartiates suivent l’agôgê dès l’âge de sept ans. Les autres âges sont trop tardifs.'),
    qcm('Combien d’éphores sont élus chaque année ?', 'Cinq', ['Deux', 'Douze', 'Trente'], 'La cité compte cinq éphores élus chaque année. Deux est le nombre de rois, non d’éphores.'),
    qcm('Comment s’appelle la population asservie qui cultive les terres de Sparte ?', 'Les hilotes', ['Les métèques', 'Les clients', 'Les sophistes'], 'Les hilotes sont la population asservie qui cultive les domaines des citoyens spartiates.'),
    qcm('Quel roi défend les Thermopyles en 480 avant notre ère ?', 'Léonidas', ['Agésilas', 'Xerxès', 'Périclès'], 'Le roi Léonidas et 300 Spartiates résistent aux Perses aux Thermopyles. Xerxès est le roi des Perses, Périclès un Athénien.'),
    qcm('Quelle cité bat Sparte à Leuctres en 371 avant notre ère ?', 'Thèbes', ['Athènes', 'Corinthe', 'Argos'], 'Thèbes bat Sparte à Leuctres en 371 avant notre ère. Athènes est l’adversaire de la guerre du Péloponnèse.'),
    qcm('Quelle guerre oppose Sparte à Athènes de 431 à 404 avant notre ère ?', 'La guerre du Péloponnèse', ['Les guerres médiques', 'La guerre de Troie', 'La guerre de Corinthe'], 'La guerre du Péloponnèse dure de 431 à 404 avant notre ère et se termine par la victoire de Sparte.'),
  ],
  vf: [
    vf('Sparte est gouvernée par un seul roi.', false, 'Faux. La cité est dirigée par deux rois, avec une assemblée d’anciens et cinq éphores.'),
    vf('Les hilotes sont des citoyens à part entière de Sparte.', false, 'Faux. Les hilotes sont une population asservie ; les citoyens à part entière sont les Égaux.'),
    vf('Sparte sort victorieuse de la guerre du Péloponnèse.', true, 'Vrai. La guerre se termine en 404 avant notre ère par la victoire de Sparte sur Athènes.'),
  ],
});

// Fiche d'un autre sujet : forme valide, contenu étiqueté « simulé ».
function generique(titre) {
  const T = titre.length > 30 ? titre.slice(0, 29).trimEnd() + '…' : titre; // les titres de paliers tiennent en 60 caractères
  return fiche({
    cle: 'generique',
    titre: T,
    titreEn: T,
    motImage: 'landscape nature',
    etape1: 'Les premières notions',
    etape2: 'Pour aller plus loin',
    resume: `« ${T} » est un sujet simulé par le serveur local. Cette IA factice écrit des plans et des paliers de forme valide, pour essayer l’écran.`,
    paliers1: ['les origines', 'les grandes dates', 'les acteurs', 'les lieux', 'les techniques', 'les chiffres clés', 'les idées reçues', 'les débats', 'les exemples', 'l’héritage'].map((a) => `${T} : ${a}`.slice(0, 60)),
    paliers2: ['cas particuliers', 'personnages', 'vocabulaire', 'controverses', 'anecdotes', 'méthodes', 'comparaisons', 'évolutions', 'sources', 'aujourd’hui'].map((a) => `${T} : ${a}`.slice(0, 60)),
    enBref: [`« ${T} » est traité ici par une page simulée du serveur local.`, 'Ce texte est écrit à la main pour essayer l’écran, pas pour apprendre.', 'Les vrais paliers sont rédigés à partir de Wikipédia et recoupés par une seconde IA.', 'Chaque palier montre ses sources et le résultat de la vérification.', 'Les contenus simulés ne contiennent aucun fait réel sur le sujet.'],
    comment: ['Le serveur local remplace Wikipédia et les IA par des réponses écrites d’avance.', 'La rédaction et la vérification sont deux appels distincts, comme en production.', 'Une phrase non confirmée est retirée avant l’enregistrement du palier.', 'Un palier enregistré est ensuite servi à tous les lecteurs sans nouvel appel.'],
    pourquoi: ['Essayer l’écran sans réseau permet de repérer les défauts d’affichage.', 'Les questions et les explications sont vérifiées de la même façon que le texte.', 'Les définitions rendent le palier lisible sans connaissance préalable.', 'La frise et les chiffres s’affichent seulement quand les sources les fournissent.'],
    ouQuand: ['Ce palier est simulé au moment où vous le demandez.', 'Il reste ensuite en mémoire tant que le serveur local tourne.', 'La base repart de zéro à chaque lancement du serveur local.', 'Aucune date réelle n’est associée à ce sujet.'],
    definitions: [['Palier', 'Étape d’un parcours, qui explique une idée précise du sujet.'], ['Parcours', 'Suite de paliers qui va du général au précis sur un sujet.'], ['Source', 'Page consultée pour écrire et vérifier un palier.'], ['Recoupement', 'Vérification d’un texte par une seconde source ou une seconde IA.'], ['Simulation', 'Reproduction d’un service réel avec des réponses écrites d’avance.'], ['Extrait', 'Passage d’une page fourni à l’IA pour écrire le palier.']],
    frise: [['Étape 1', 'Le lecteur choisit un sujet.'], ['Étape 2', 'Koîos cherche les sources et écrit le plan.'], ['Étape 3', 'Une IA rédige le palier.'], ['Étape 4', 'Une seconde IA le vérifie.'], ['Étape 5', 'Le palier est enregistré pour tous.']],
    chiffres: { unite: 'éléments', valeurs: [['Paliers par étape', 10], ['Questions par palier', 4], ['Sections par palier', 4]] },
    notions: { noeuds: [T.slice(0, 30), 'Parcours', 'Palier', 'Sources', 'Vérification'], liens: [[T.slice(0, 30), 'Parcours', 'ouvre un'], ['Parcours', 'Palier', 'se découpe en'], ['Palier', 'Sources', 'cite ses'], ['Vérification', 'Palier', 'recoupe chaque']] },
    histoire: ['Ce palier est simulé : il n’a aucune valeur historique et sert seulement à essayer l’affichage de l’anecdote.', 'Les anecdotes d’un vrai palier sont tirées des extraits de Wikipédia et vérifiées par une seconde IA.'],
    qcm: Array.from({ length: 7 }, (_, i) => qcm(
      `Question simulée numéro ${i + 1} sur « ${T} », laquelle est exacte ?`.slice(0, 280),
      `Le contenu est simulé (${i + 1})`,
      [`Le contenu vient de l’histoire réelle (${i + 1})`, `Le contenu est tiré d’un livre (${i + 1})`, `Le contenu vient d’un archiviste (${i + 1})`],
      `Ce contenu vient du serveur local, qui écrit des réponses d’avance pour la question ${i + 1}. Les trois autres choix sont faux.`,
    )),
    vf: [
      vf('Un palier simulé contient des faits réels sur son sujet.', false, 'Faux. Les contenus simulés par le serveur local ne contiennent aucun fait réel.'),
      vf('Le serveur local remplace Wikipédia par des pages écrites d’avance.', true, 'Vrai. Wikipédia et les IA sont simulés pour essayer l’application sans réseau.'),
      vf('Un palier enregistré est écrit de nouveau pour chaque lecteur.', false, 'Faux. Un palier enregistré est servi à tous les lecteurs sans nouvel appel.'),
    ],
  });
}

const FICHES = [EIFFEL, BLANC, SPARTE];

// Fiche d'un sujet, d'après des mots de sa demande (« La tour Eiffel », « mont Blanc », « Sparte »).
export function ficheDe(texte) {
  const t = sansAccents(texte);
  if (/eiffel/.test(t)) return EIFFEL;
  if (/mont[- ]?blanc/.test(t)) return BLANC;
  if (/sparte|spartiate/.test(t)) return SPARTE;
  return null;
}

// --- Pages Wikipédia simulées ----------------------------------------------

const PAGE_EIFFEL_GUSTAVE = {
  titre: 'Gustave Eiffel',
  titreEn: 'Gustave Eiffel',
  fr: 'Gustave Eiffel, né à Dijon le 15 décembre 1832 et mort à Paris le 27 décembre 1923, est un ingénieur français. Sorti de l’École centrale des arts et manufactures en 1855, il fonde son entreprise en 1866 et construit de nombreux ponts et viaducs métalliques, dont le viaduc de Garabit, achevé en 1884. Il conçoit aussi l’armature interne de la statue de la Liberté, inaugurée à New York en 1886. Après la tour qui porte son nom, il consacre la fin de sa vie à la météorologie et à l’aérodynamique, avec un laboratoire installé au pied de la tour puis à Auteuil. (Texte simulé.)',
  en: 'Gustave Eiffel, born in Dijon on 15 December 1832 and died in Paris on 27 December 1923, was a French engineer. A graduate of the École centrale des arts et manufactures in 1855, he founded his company in 1866 and built many metal bridges and viaducts, including the Garabit Viaduct, completed in 1884. He also designed the internal framework of the Statue of Liberty, inaugurated in New York in 1886. After the tower that bears his name, he devoted the end of his life to meteorology and aerodynamics. (Simulated text.)',
  image: 'Gustave_Eiffel_Wikimedia_Commons.jpg',
};

const imagePrincipale = {
  eiffel: 'Tour_Eiffel_Wikimedia_Commons.jpg',
  blanc: 'Mont_Blanc_Wikimedia_Commons.jpg',
  sparte: 'Sparte_Wikimedia_Commons.jpg',
};

// Pages connues : { titre, titreEn, fr, en, image }.
export const PAGES = [
  ...FICHES.map((f) => ({ titre: f.titre, titreEn: f.titreEn, fr: f.fr, en: f.en, image: imagePrincipale[f.cle] })),
  PAGE_EIFFEL_GUSTAVE,
];

// Page d'une requête de recherche, dans la langue demandée : la page connue citée le plus tôt, sinon une page
// générique. Une requête contenant « zzz » ne trouve rien (pour voir « aucune source »).
export function trouverPage(requete, langue) {
  const q = sansAccents(requete);
  if (/zzz/.test(q)) return null;
  const connues = PAGES.map((p) => ({ p, rang: Math.min(...[p.titre, p.titreEn].map((t) => { const r = q.indexOf(sansAccents(t)); return r === -1 ? 1e9 : r; })) }))
    .filter((x) => x.rang < 1e9);
  if (connues.length) return connues.sort((a, b) => a.rang - b.rang)[0].p;
  const mots = requete.split(':')[0].trim().split(/\s+/).slice(0, 4).join(' ');
  const titre = mots.charAt(0).toUpperCase() + mots.slice(1);
  const t = langue === 'en'
    ? `${titre} is a subject that this simulated page describes to try out the application. It contains no real fact.\n\nThe local server replaces Wikipedia with this text, so that sources and display can be tested without network access.\n\nA query containing "zzz" finds no page.`
    : `${titre} est un sujet que cette page simulée décrit pour essayer l’application. Elle ne contient aucun fait réel.\n\nLe serveur local remplace Wikipédia par ce texte : il permet de voir les sources et l’affichage sans accès au réseau.\n\nUne requête contenant « zzz » ne trouve aucune page.`;
  return { titre, titreEn: titre, fr: t, en: t, image: null };
}

// --- Lecture des demandes --------------------------------------------------

const premier = (re, texte, defaut = '') => {
  const m = re.exec(texte);
  return m ? m[1] : defaut;
};

const choix = (liste, debut, n) => Array.from({ length: n }, (_, i) => liste[(debut + i) % liste.length]);

function ficheDuParcours(titre) {
  return ficheDe(titre) || generique(titre);
}

// --- Plan d'étape ----------------------------------------------------------

export function planSimule(demande) {
  const titre = premier(/Parcours : « ([^\n]*) »/, demande);
  const numero = Number(premier(/Étape à écrire : n° (\d+)/, demande, '1'));
  const f = ficheDuParcours(titre);
  if (numero === 1) {
    return { etape: f.etape1, resume: f.resume, motImage: f.motImage, paliers: f.paliers1 };
  }
  const base = numero === 2
    ? f.paliers2
    : f.paliers1.map((_, i) => `${f.titre.slice(0, 30)} : approfondissement ${(numero - 1) * 10 + i + 1}`);
  return { etape: numero === 2 ? f.etape2 : `Étape ${numero} : approfondissement`, paliers: base };
}

// --- Palier ----------------------------------------------------------------

const MARQUE_RUMEUR = '[rumeur]';

export function palierSimule(demande) {
  const titreParcours = premier(/Parcours : « ([^\n]*) »/, demande);
  const numero = Number(premier(/Palier à écrire : n° (\d+),/, demande, '1'));
  const f = ficheDuParcours(titreParcours);
  const i = numero - 1;
  const phrases = (liste, debut, n) => choix(liste, debut, n);
  const sections = {
    enBref: phrases(f.enBref, i, 3),
    comment: phrases(f.comment, i, 2 + (i % 2)),
    pourquoi: i % 3 === 1 ? null : phrases(f.pourquoi, i + 1, 2),
    ouQuand: phrases(f.ouQuand, i, 2),
  };
  // Un palier sur quatre porte une phrase que les extraits ne confirment pas : la vérification la retire.
  if (numero % 4 === 0) {
    sections.ouQuand = [...sections.ouQuand, `Une rumeur tenace ajoute un détail que les extraits ne mentionnent pas ${MARQUE_RUMEUR}.`];
  }
  const defs = choix(f.definitions, i, 3).map(([terme, definition]) => ({ terme, definition }));
  const frise = numero % 5 === 0 ? [] : choix(f.frise, i % f.frise.length, 3).map(([date, evenement]) => ({ date, evenement }));
  const chiffres = numero % 3 === 0 ? [] : f.chiffres.valeurs.map(([libelle, valeur]) => ({ libelle, valeur, unite: f.chiffres.unite }));
  const questions = [
    f.qcm[i % 7], f.qcm[(i + 3) % 7], f.vf[i % 3], f.qcm[(i + 5) % 7],
  ];
  return {
    sections,
    definitions: defs,
    frise,
    chiffres,
    notions: numero % 2 === 1 ? f.notions : null,
    histoire: numero % 2 === 0 ? f.histoire[i % 2] : null,
    questions,
  };
}

// --- Quiz direct -----------------------------------------------------------

export function quizSimule(demande) {
  const titreParcours = premier(/Parcours : « ([^\n]*) »/, demande);
  const f = ficheDuParcours(titreParcours);
  return { questions: [...f.qcm, ...f.vf] };
}

// --- Vérification ----------------------------------------------------------

// Les affirmations marquées [rumeur] ne sont pas confirmées ; toutes les autres le sont.
export function verificationSimulee(demande) {
  const liste = demande.slice(demande.indexOf('Affirmations à vérifier :')).split('\n');
  const nonConfirmees = [];
  for (const l of liste) {
    const m = /^(\d+)\. (.*)$/.exec(l);
    if (m && m[2].includes(MARQUE_RUMEUR)) nonConfirmees.push(Number(m[1]));
  }
  return { nonConfirmees };
}
