#!/bin/bash
# Garde le site public branché sur l'application : configuration Apache de référence,
# aucune page d'index de l'hébergeur dans le dossier web, et l'accueil qui répond.
# Lancé par cron toutes les 5 minutes et au démarrage du serveur.

SITE=/var/www/clients/client0/web1
APP=$SITE/private/edudesk
WEB=$SITE/web
REFERENCE=$APP/deploy/apache/htaccess
ARCHIVES=$SITE/home/adminedudesk/veille-archives
LOG=$SITE/home/adminedudesk/edudesk-veille.log
DOMAINE=http://erp.edudesk-inter.com

noter() { echo "$(date -Is) $*" >> "$LOG"; }

[ -r "$REFERENCE" ] || { noter "ERREUR configuration de référence absente : $REFERENCE"; exit 1; }
mkdir -p "$ARCHIVES"

if ! cmp -s "$REFERENCE" "$WEB/.htaccess"; then
  [ -e "$WEB/.htaccess" ] && cp -p "$WEB/.htaccess" "$ARCHIVES/htaccess.$(date +%Y%m%d-%H%M%S)"
  cp "$REFERENCE" "$WEB/.htaccess"
  noter "CORRIGE .htaccess remis à la configuration de référence"
fi

for page in standard_index.html index.html index.htm index.php; do
  if [ -e "$WEB/$page" ]; then
    mv "$WEB/$page" "$ARCHIVES/$page.$(date +%Y%m%d-%H%M%S)"
    noter "CORRIGE page d'index $page retirée du dossier web"
  fi
done

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$DOMAINE/login")
if [ "$code" != "200" ]; then
  noter "ALERTE $DOMAINE/login répond $code"
fi

# Le journal reste court : on garde les 500 dernières lignes.
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 1000 ]; then
  tail -500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
exit 0
