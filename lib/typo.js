// Typographie française appliquée aux textes rédigés par l'IA avant leur mise en cache
// (insécables avant : ; ? ! », après «, entre un nombre et son unité). Les adresses ne sont pas touchées.
const FINE = ' ', INS = ' ';

export function typographierTexte(t) {
  if (typeof t !== 'string' || /^https?:\/\//.test(t)) return t;
  return t
    .replace(/ ([;?!»])/g, FINE + '$1')
    .replace(/ :/g, INS + ':')
    .replace(/« /g, '«' + INS)
    .replace(/(\d) (\d{3})(?!\d)/g, '$1' + FINE + '$2')
    .replace(/(\d) (°C|°|km|cm|mm|m|kg|g|%|ans|millions|milliards)(?![\p{L}’'])/gu, '$1' + INS + '$2');
}

export function typographier(x, cle) {
  if (cle === 'image' || cle === 'figure') return x; // crédits et légendes d'images : tels que fournis
  if (typeof x === 'string') return cle === 'src' || cle === 'lien' ? x : typographierTexte(x);
  if (Array.isArray(x)) return x.map((y) => typographier(y));
  if (x && typeof x === 'object') {
    const r = {};
    for (const [k, v] of Object.entries(x)) r[k] = typographier(v, k);
    return r;
  }
  return x;
}
