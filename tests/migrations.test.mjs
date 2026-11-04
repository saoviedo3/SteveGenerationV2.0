import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

test('migración de solución conserva usuarios, sesiones y documentos existentes', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
    db.exec("INSERT INTO users (id, username, password_hash, role) VALUES ('owner', 'root', 'test-hash', 'admin');");
    db.exec("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('test-token-hash', 'owner', 9999999999);");
    db.exec("INSERT INTO history (id, user_id, title, service, routing, link_type, filename, document) VALUES ('old', 'owner', 'Anterior', 'DATOS', 'BGP', 'UNIQUE', 'anterior.txt', 'Documento sin modificar');");
    db.exec(readFileSync(new URL('../migrations/0002_history_solution.sql', import.meta.url), 'utf8'));
    const old = db.prepare('SELECT * FROM history WHERE id = ?').get('old');
    assert.equal(old.solution, 'NNI3_CRM');
    assert.equal(old.document, 'Documento sin modificar');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 1);
  } finally { db.close(); }
});
