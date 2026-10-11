// Prüft vor dem Abruf, ob alle nötigen Secrets da sind, und nennt ALLE fehlenden auf einmal.
export function missingConfig(env, { ci = false } = {}) {
  const missing = [];
  if (!env.TWELVEDATA_API_KEY) missing.push('TWELVEDATA_API_KEY');
  if (ci && !env.DATA_PASSPHRASE) missing.push('DATA_PASSPHRASE');
  return missing;
}

export function configError(missing, ci) {
  const where = ci ? 'GitHub → Settings → Secrets and variables → Actions → New repository secret' : 'in der Datei .env';
  return `Es fehlen Einstellungen: ${missing.join(', ')}. Bitte ${where} eintragen (genau diese Namen, Anleitung: docs/EINRICHTUNG.md).`;
}
