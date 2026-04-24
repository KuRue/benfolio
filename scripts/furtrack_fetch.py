#!/usr/bin/env python3
"""Small curl_cffi bridge for Furtrack requests.

The Next.js app invokes this with a JSON request on stdin and receives a JSON
response on stdout. Keeping it process-scoped avoids adding a second long-lived
service while still using curl_cffi's browser TLS impersonation.
"""

from __future__ import annotations

import base64
import json
import sys
from typing import Any

from curl_cffi import requests


def fail(error: Exception) -> int:
    sys.stdout.write(
        json.dumps(
            {
                "error": str(error),
                "errorType": error.__class__.__name__,
            },
            separators=(",", ":"),
        )
    )
    return 2


def main() -> int:
    try:
        payload: dict[str, Any] = json.load(sys.stdin)
        url = str(payload["url"])
        method = str(payload.get("method", "GET")).upper()
        response_type = str(payload.get("responseType", "text"))
        impersonate = str(payload.get("impersonate", "chrome"))
        timeout = float(payload.get("timeoutSeconds", 30))
        headers = {
            str(key): str(value)
            for key, value in dict(payload.get("headers") or {}).items()
            if value is not None
        }

        response = requests.request(
            method,
            url,
            headers=headers,
            timeout=timeout,
            impersonate=impersonate,
            allow_redirects=True,
        )

        result: dict[str, Any] = {
            "status": response.status_code,
            "url": response.url,
            "headers": dict(response.headers),
        }

        if response_type == "base64":
            result["bodyBase64"] = base64.b64encode(response.content).decode("ascii")
        else:
            result["bodyText"] = response.text

        sys.stdout.write(json.dumps(result, separators=(",", ":")))
        return 0
    except Exception as error:  # noqa: BLE001 - return structured failures to Node.
        return fail(error)


if __name__ == "__main__":
    raise SystemExit(main())
