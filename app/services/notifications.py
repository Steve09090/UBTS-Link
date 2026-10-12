import logging

import httpx
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Notification, Requisition, Site

log = logging.getLogger("ubts_link.notifications")


def notify(
    db: Session,
    site: Site,
    kind: str,
    message: str,
    requisition: Requisition | None = None,
) -> Notification:
    """Record an alert for a site and, if configured, push it to the webhook (best effort)."""
    note = Notification(
        site_id=site.id,
        kind=kind,
        message=message,
        requisition_id=requisition.id if requisition is not None else None,
    )
    db.add(note)
    db.flush()

    if settings.webhook_url:
        payload = {
            "id": note.id,
            "kind": kind,
            "site": site.code,
            "message": message,
            "requisition_id": note.requisition_id,
        }
        try:
            resp = httpx.post(settings.webhook_url, json=payload, timeout=3.0)
            resp.raise_for_status()
            note.delivered = True
        except httpx.HTTPError as exc:
            log.warning("webhook delivery failed for notification %s: %s", note.id, exc)
    return note
