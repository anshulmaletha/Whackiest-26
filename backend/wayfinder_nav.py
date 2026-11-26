import difflib
import re
import time
import webbrowser
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError

# 1. Deterministic Destination Registry (Update URLs with Saurabh's verified Chrome URLs)
DESTINATIONS = {
    "amazon": {
        "id": "amazon",
        "label": "Amazon",
        "host": "www.amazon.in",
        "url": "https://www.amazon.in",
        "aliases": ["amazon", "amazon in", "amazon india", "amazon shopping"],
    },
    "orion_mall": {
        "id": "orion_mall",
        "label": "Orion Mall",
        "host": "www.orionmalls.com",
        "url": "https://www.orionmalls.com",
        "aliases": ["orion mall", "orion", "orion malls", "orion mall bangalore"],
    },
}

FILLER_PREFIXES = (
    "please ",
    "can you ",
    "take me to ",
    "navigate to ",
    "go to ",
    "open ",
    "visit ",
    "launch ",
)


def _normalize(text: str) -> str:
    cleaned = re.sub(r"[^a-z0-9\s]", " ", text.lower())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    changed = True
    while changed:
        changed = False
        for prefix in FILLER_PREFIXES:
            if cleaned.startswith(prefix):
                cleaned = cleaned[len(prefix):].strip()
                changed = True
    return cleaned


def _public_dest(entry: dict) -> dict:
    return {"id": entry["id"], "label": entry["label"], "host": entry["host"]}


# 2. Intent Gate: spoken text -> matched / suggest / unmatched
def resolve_destination(utterance: str) -> dict:
    query = _normalize(utterance)
    if not query:
        return {"status": "unmatched", "heard": utterance, "destination": None, "suggestions": []}

    alias_map = {}
    for entry in DESTINATIONS.values():
        for alias in entry["aliases"]:
            alias_map[alias] = entry

    # Exact alias match
    if query in alias_map:
        return {
            "status": "matched",
            "heard": utterance,
            "destination": _public_dest(alias_map[query]),
            "suggestions": [],
        }

    # Fuzzy / near-match (e.g., minor speech typo)
    close = difflib.get_close_matches(query, list(alias_map.keys()), n=2, cutoff=0.7)
    if close:
        seen = set()
        suggestions = []
        for alias in close:
            entry = alias_map[alias]
            if entry["id"] not in seen:
                seen.add(entry["id"])
                suggestions.append({"id": entry["id"], "label": entry["label"]})
        return {
            "status": "suggest",
            "heard": utterance,
            "destination": None,
            "suggestions": suggestions,
        }

    return {"status": "unmatched", "heard": utterance, "destination": None, "suggestions": []}


# 3. Single Navigation + 15s Timeout + Hard STOP Guarantee
def _default_open(url: str) -> None:
    # Replace this with the repo's existing browser-navigation call if one exists
    webbrowser.open(url, new=2)


def open_destination(destination_id: str, navigate_fn=_default_open, timeout_sec: int = 15) -> dict:
    entry = DESTINATIONS.get(destination_id)
    if not entry:
        return {
            "status": "failed",
            "destination": None,
            "elapsedMs": 0,
            "error": f"Unknown destination ID: {destination_id}",
        }

    start = time.perf_counter()
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(navigate_fn, entry["url"])
            future.result(timeout=timeout_sec)

        elapsed_ms = int((time.perf_counter() - start) * 1000)
        print("STOP: navigation complete", flush=True)
        return {
            "status": "opened",
            "destination": _public_dest(entry),
            "elapsedMs": elapsed_ms,
        }
    except FuturesTimeoutError:
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        return {
            "status": "failed",
            "destination": _public_dest(entry),
            "elapsedMs": elapsed_ms,
            "error": f"Navigation timed out after {timeout_sec} seconds",
        }
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        return {
            "status": "failed",
            "destination": _public_dest(entry),
            "elapsedMs": elapsed_ms,
            "error": str(exc),
        }