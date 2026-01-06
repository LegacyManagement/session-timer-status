#!/usr/bin/env bash
set -euo pipefail

FILE="${1:-$HOME/.session-timer}"

# Start at 60 minutes and count down one minute every 2 seconds.
minutes_left=90
preserve=false

write_file() {
  # write atomically to reduce partial reads
  tmp="${FILE}.tmp"
  cat > "$tmp" <<EOF
{
  "minutes_left": ${minutes_left},
  "preserve": ${preserve}
}
EOF
  mv "$tmp" "$FILE"
}

echo "Writing fake session timer to: $FILE"
echo "Starting at 60 minutes. Decrementing 1 minute every 2 seconds."
echo "Ctrl-C to stop."

write_file

while true; do
  sleep 2
  if (( minutes_left > 0 )); then
    minutes_left=$(( minutes_left - 1 ))
  else
    minutes_left=0
  fi
  write_file
done
