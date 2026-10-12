"""Clock used for expiry decisions.

ISBT 128 expiry times are local blood-bank times with no timezone, so they are compared with the
server's local wall clock. Audit timestamps (created_at, etc.) are stored in UTC by the models.
"""
from datetime import datetime


def now_local() -> datetime:
    return datetime.now()
