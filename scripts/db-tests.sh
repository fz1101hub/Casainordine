#!/usr/bin/env bash
# Prove del database su un PostgreSQL vero, con regole di accesso, trigger e vincoli.
#
# Crea un database nuovo con un sostituto minimo di Supabase (supabase/tests/00_roles.sql e
# 01_supabase_stub.sql), esegue tutte le migrazioni nell'ordine del README e poi ogni file
# supabase/tests/*_test.sql su una copia pulita di quel database.
#
# Si ferma con errore se:
#   - una migrazione dà un errore;
#   - un file di prova dà un errore fuori dai blocchi che lo aspettano;
#   - una prova finisce con «NO» (colonna «falliti» diversa da 0).
#
# Uso: PGHOST=... PGPORT=... PGUSER=postgres [PGPASSWORD=...] scripts/db-tests.sh
# migrate_v35_cron.sql e migrate_v53_cron_push.sql restano fuori: richiedono pg_cron e pg_net,
# che ci sono solo su Supabase.
set -u
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SQL=$ROOT/supabase
TESTS=$SQL/tests
BASE=casa_prove_base
MIGRATIONS=(
  schema.sql migrate_v19.sql migrate_v20.sql migrate_v21.sql migrate_v30.sql migrate_v32_languages.sql
  harden_trigger_permissions.sql migrate_v33_audit.sql migrate_v34_saldi.sql migrate_v36_quota.sql
  migrate_v37_account.sql migrate_v38_rifiniture.sql migrate_v39_lista_spesa.sql migrate_v40_sos_cifrate.sql
  migrate_v41_ex_membri.sql migrate_v42_permessi.sql migrate_v43_automazioni.sql migrate_v44_professionisti.sql
  migrate_v45_stagionale.sql migrate_v46_scorte.sql migrate_v47_progetti.sql migrate_v48_fondo.sql
  migrate_v49_affitti.sql migrate_v50_email_promemoria.sql migrate_v51_sicurezza_funzioni.sql
  migrate_v52_ripristino_scadenze.sql migrate_v53_push_rinviate.sql migrate_v54_inviti_account.sql
)
PSQL=(psql -X -q -v ON_ERROR_STOP=0)
failed=0

"${PSQL[@]}" -d postgres -c "drop database if exists $BASE" -c "create database $BASE" >/dev/null || exit 1
"${PSQL[@]}" -d postgres -f "$TESTS/00_roles.sql" >/dev/null 2>&1
"${PSQL[@]}" -d $BASE -v ON_ERROR_STOP=1 -f "$TESTS/01_supabase_stub.sql" >/dev/null || { echo "Sostituto di Supabase non installato"; exit 1; }

for f in "${MIGRATIONS[@]}"; do
  out=$("${PSQL[@]}" -d $BASE -f "$SQL/$f" 2>&1)
  if grep -qE "ERROR|FATAL" <<<"$out"; then
    echo "✗ migrazione $f"; grep -E "ERROR|FATAL" <<<"$out" | head -5 | sed 's/^/    /'; failed=1
  fi
done
[ $failed -eq 0 ] || { echo "Migrazioni non riuscite: prove non eseguite."; exit 1; }
echo "✓ ${#MIGRATIONS[@]} migrazioni senza errori"

for t in "$TESTS"/*_test.sql; do
  name=$(basename "$t" .sql); db=casa_prova_$name
  "${PSQL[@]}" -d postgres -c "drop database if exists $db" -c "create database $db template $BASE" >/dev/null || { failed=1; continue; }
  out=$("${PSQL[@]}" -A -t -F ' | ' -d $db -f "$t" 2>&1)
  errors=$(grep -E "ERROR|FATAL" <<<"$out")
  bad=$(grep -E ' \| NO$' <<<"$out")
  total=$(grep -cE ' \| (ok|NO)$' <<<"$out")
  if [ -n "$errors" ] || [ -n "$bad" ] || [ "$total" -eq 0 ]; then
    echo "✗ $name"; failed=1
    [ -n "$errors" ] && sed 's/^/    errore: /' <<<"$errors" | head -10
    [ -n "$bad" ] && sed 's/^/    fallita: /' <<<"$bad"
    [ "$total" -eq 0 ] && echo "    nessuna prova eseguita"
  else
    echo "✓ $name: $total prove"
  fi
  "${PSQL[@]}" -d postgres -c "drop database if exists $db" >/dev/null
done
"${PSQL[@]}" -d postgres -c "drop database if exists $BASE" >/dev/null
[ $failed -eq 0 ] && echo "Database: tutte le prove superate." || { echo "Database: alcune prove non superate."; exit 1; }
