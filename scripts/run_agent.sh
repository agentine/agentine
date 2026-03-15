#!/bin/sh

name="$1"
backend="$2"
model="$3"
effort="$4"
project="$5"

if [ -z "$name" ] || [ -z "$backend" ] || [ -z "$model" ] || [ -z "$effort" ]; then
  echo "usage: $0 <ROLE> <BACKEND> <MODEL> <EFFORT> [PROJECT]"
  exit 1
fi

script="backends/$backend.sh"
if [ ! -x "$script" ]; then
  echo "error: unknown backend '$backend' (no $script found)"
  exit 1
fi

echo "dispatch: role=$name backend=$backend model=$model effort=$effort project=${project:-<all>}"
exec "$script" "$name" "$model" "$effort" "$project"
