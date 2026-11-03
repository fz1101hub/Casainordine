#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo 'Repository PUBBLICO di destinazione: https://github.com/fz1101hub/Casainordine'
read -r -p 'Confermi il caricamento PUBBLICO del codice? (scrivi PUBBLICO): ' confirm
if [ "$confirm" != 'PUBBLICO' ]; then echo 'Operazione annullata.'; exit 1; fi
command -v git >/dev/null || { echo 'Git non installato. Usa GitHub Desktop.'; exit 1; }
git push -u origin main
echo 'Verifica su https://github.com/fz1101hub/Casainordine'
