#!/usr/bin/env bash
set -euo pipefail

POD_NAME="gamecube-pod"

if podman pod exists "${POD_NAME}"; then
    echo "Stopping and removing '${POD_NAME}'..."
    podman pod stop "${POD_NAME}"
    podman pod rm -f "${POD_NAME}"
    echo "Pod '${POD_NAME}' stopped and removed."
else
    echo "Pod '${POD_NAME}' is not running."
fi
