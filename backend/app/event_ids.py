import re


_RECURRING_INSTANCE_SUFFIX = re.compile(r"_\d{4}-\d{2}-\d{2}$")


def base_event_id(event_id: str) -> str:
    return _RECURRING_INSTANCE_SUFFIX.sub("", event_id)
