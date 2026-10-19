// Faux D1 : SQLite en mémoire (node:sqlite, intégré à Node 22) derrière l'interface D1
// (prepare / bind / first / all / run / batch). Le SQL des routes est donc vraiment exécuté.
// Utilisé par scripts/test_api.mjs et scripts/serveur_local.mjs. Aucun secret.

import { DatabaseSync } from 'node:sqlite';

export function fauxD1() {
  const base = new DatabaseSync(':memory:');
  const compteurs = { batchs: 0 };
  function prepare(sql) {
    let params = [];
    const st = {
      sql,
      bind(...p) { params = p; return st; },
      async first(colonne) {
        const ligne = base.prepare(sql).get(...params);
        if (!ligne) return null;
        return colonne ? ligne[colonne] : { ...ligne };
      },
      async all() {
        return { success: true, results: base.prepare(sql).all(...params).map((r) => ({ ...r })) };
      },
      async run() {
        const r = base.prepare(sql).run(...params);
        return { success: true, meta: { changes: Number(r.changes) } };
      },
    };
    return st;
  }
  async function batch(instructions) {
    if (/^\s*CREATE/i.test(instructions[0] && instructions[0].sql)) compteurs.batchs += 1; // les créations de tables seulement
    base.exec('BEGIN');
    try {
      const sorties = [];
      for (const i of instructions) sorties.push(await i.run());
      base.exec('COMMIT');
      return sorties;
    } catch (e) {
      base.exec('ROLLBACK');
      throw e;
    }
  }
  return { prepare, batch, base, compteurs };
}
