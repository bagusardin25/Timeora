import json


def json_object(value) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def string_list(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        raw_items = value
    elif isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return []
        try:
            parsed = json.loads(normalized)
        except json.JSONDecodeError:
            raw_items = normalized.split(",")
        else:
            raw_items = parsed if isinstance(parsed, list) else [parsed]
    else:
        return []

    tags: list[str] = []
    for item in raw_items:
        tag = str(item).strip()
        if tag:
            tags.append(tag)
    return tags
