// GET /api/etat : ce qui est branché (base D1, IA).
import { json, enveloppe } from '../../lib/api.js';

export const onRequestGet = enveloppe(({ env }) => json({ base: !!env.DB, ia: !!env.AI }));
