#!/bin/sh
# Legacy wrapper — delegates to the Python dispatcher.
exec python3 "$(dirname "$0")/dispatch.py" "$@"
