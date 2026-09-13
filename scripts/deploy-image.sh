#!/usr/bin/env bash
set -euo pipefail
app=${1:?app required}
target=${2:?target required}
digest=${3:?digest required}
case "$app" in thomasriley-blog-w3-pilot|thomasriley-article-w3-pilot) ;; *) exit 2;; esac
[[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo "Invalid digest" >&2; exit 2; }
base="https://management.azure.com/subscriptions/b9ee5d35-c096-4772-8a56-0529054b4dcf/resourceGroups/ff-westus3-pilot/providers/Microsoft.Web/sites/$app"
image="DOCKER|ghcr.io/tomdriley/thomasriley-ca@$digest"
verify_http() {
  local host=$1 path=/
  if [[ "$app" == thomasriley-article-w3-pilot ]]; then path=/api/articles/; fi
  curl --fail --silent --show-error --retry 18 --retry-all-errors --retry-delay 10 \
    --max-time 30 "https://$host$path" -o /dev/null
}
case "$target" in
  stage) resource="$base/slots/stage";;
  production)
    current=$(az rest --method get --url "$base/slots/stage/config/web?api-version=2024-11-01" --query properties.linuxFxVersion -o tsv)
    [[ "$current" == "$image" ]] || { echo "Digest does not match stage" >&2; exit 1; }
    host=$(az rest --method get --url "$base/slots/stage?api-version=2024-11-01" --query properties.defaultHostName -o tsv)
    verify_http "$host"
    resource="$base";;
  *) echo "Invalid deployment target" >&2; exit 2;;
esac
previous=$(az rest --method get --url "$resource/config/web?api-version=2024-11-01" --query properties.linuxFxVersion -o tsv)
printf 'Target: `%s/%s`\n\nPrevious image: `%s`\n\nRequested image: `%s`\n' \
  "$app" "$target" "$previous" "$image" >> "$GITHUB_STEP_SUMMARY"
az rest --method patch --url "$resource/config/web?api-version=2024-11-01" \
  --body "{\"properties\":{\"linuxFxVersion\":\"$image\"}}" --output none
az rest --method post --url "$resource/restart?api-version=2024-11-01" --output none
actual=$(az rest --method get --url "$resource/config/web?api-version=2024-11-01" --query properties.linuxFxVersion -o tsv)
[[ "$actual" == "$image" ]] || { echo "Configured digest mismatch" >&2; exit 1; }
host=$(az rest --method get --url "$resource?api-version=2024-11-01" --query properties.defaultHostName -o tsv)
verify_http "$host"
echo "Configured digest and HTTP availability verified. https://$host" >> "$GITHUB_STEP_SUMMARY"
