// POST /api/joueur : fermé (410). Les profils sans compte ne se créent plus ; on s'inscrit avec POST /api/compte {action: 'inscrire'}.
// Les anciens profils déjà créés continuent de lire et de jouer (clé en en-tête), mais ne créent plus avec l'IA.
import { ErreurHttp, enveloppe } from '../../lib/api.js';

export const onRequestPost = enveloppe(async () => {
  throw new ErreurHttp(410, 'Cette route est fermée. Crée un compte pour jouer et apprendre.');
});
