"""Parser and builders for ISBT 128 blood-unit barcodes.

ISBT 128 (ICCBBA) barcodes are Code 128 symbols whose data starts with a two-character
data identifier. The parts UBTS-Link needs are:

  * DIN  (data structure 001): "=" + 15 chars = alpha + FIN(4) + YY(2) + serial(6) + flags(2).
         The first 13 characters are the Donation Identification Number; the last two are flags.
  * Product code (003): "=<" + 8 chars  (alpha + oooo + t + d + s).
  * Blood group  (002): "=%" + 4 chars.
  * Expiry date  (004): "=>" + cyyjjj.
  * Expiry date and time (005): "&>" + cyyjjjhhmm.

Other structures that have a fixed length are skipped so that a compound scan still parses.

Century code: c=0 means 2000-2099 (per the ISBT 128 example "&>0123661300" = 31 Dec 2012 13:00).
Other century codes are mapped as 2000 + 100*c, which is an assumption.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta

# alpha (second data-identifier character) of a DIN: 1-9, A-N, P-Z
_DIN_ALPHA = set("123456789ABCDEFGHIJKLMNPQRSTUVWXYZ")
_ALNUM = re.compile(r"^[A-Za-z0-9]+$")
_DIGITS = re.compile(r"^[0-9]+$")

# (identifier, fixed content length) for structures we recognise. Unknown structures are rejected
# because their length is unknown and the rest of the message could not be parsed reliably.
_FIXED_STRUCTURES: dict[str, tuple[str, int]] = {
    "%": ("blood_group", 4),          # =%  DS002 (after '=')
    "<": ("product_code", 8),         # =<  DS003
    ">": ("expiry_date", 6),          # =>  DS004 (after '=')
    "*": ("collection_date", 6),      # =*  DS006
    "}": ("production_date", 6),      # =}  DS008
}
_FIXED_AMPERSAND: dict[str, tuple[str, int]] = {
    ">": ("expiry_datetime", 10),     # &>  DS005
    "*": ("collection_datetime", 10), # &*  DS007
    "}": ("production_datetime", 10), # &}  DS009
    "(": ("special_testing", 5),      # &(  DS010
}


class ISBT128Error(ValueError):
    """Raised when a barcode is not a valid or supported ISBT 128 message."""


@dataclass(frozen=True)
class ISBTLabel:
    raw: str
    din: str | None = None                # 13 characters
    din_flags: str | None = None
    product_code: str | None = None       # 8 characters, e.g. E0150V00
    blood_group: str | None = None        # raw 4-character ABO/Rh code
    expiry_at: datetime | None = None     # naive UTC-equivalent local label time

    @property
    def product_family(self) -> str | None:
        """First five characters of the product code (class code + oooo); used for stock and reorder rules."""
        return self.product_code[:5] if self.product_code else None


def _check_alnum(value: str, what: str) -> None:
    if not _ALNUM.match(value):
        raise ISBT128Error(f"{what} must be alphanumeric, got {value!r}")


def _decode_julian(content: str, hour: int = 23, minute: int = 59) -> datetime:
    """Decode cyyjjj (+ optional hh, mm) into a datetime."""
    if len(content) < 6 or not _DIGITS.match(content[:6]):
        raise ISBT128Error(f"invalid expiry content {content!r}")
    century, yy, jjj = int(content[0]), int(content[1:3]), int(content[3:6])
    year = 2000 + 100 * century + yy
    if not 1 <= jjj <= 366:
        raise ISBT128Error(f"Julian day {jjj} out of range")
    try:
        day = date(year, 1, 1) + timedelta(days=jjj - 1)
    except OverflowError as exc:  # pragma: no cover - defensive
        raise ISBT128Error("date out of range") from exc
    if day.year != year:
        raise ISBT128Error(f"Julian day {jjj} does not exist in {year}")
    return datetime(day.year, day.month, day.day, hour, minute)


def _parse_din(payload: str) -> tuple[str, str]:
    """payload is the 15 characters following '=' for a DIN (alpha + pppp + yy + nnnnnn + ff)."""
    if len(payload) != 15:
        raise ISBT128Error("DIN requires 15 characters after '='")
    if payload[0] not in _DIN_ALPHA:
        raise ISBT128Error(f"invalid DIN data identifier character {payload[0]!r}")
    din, flags = payload[:13], payload[13:]
    if not _ALNUM.match(din[:5]) or not _DIGITS.match(din[5:]) or not _ALNUM.match(flags):
        raise ISBT128Error(f"malformed DIN {din!r}")
    return din, flags


def parse_isbt128(text: str) -> ISBTLabel:
    """Parse one ISBT 128 message (one or more concatenated data structures)."""
    if text is None:
        raise ISBT128Error("empty barcode")
    s = "".join(text.split())          # scanners sometimes add CR/LF or spaces
    if s.startswith("]") and len(s) > 3:  # AIM symbology identifier, e.g. ]C1 for Code 128
        s = s[3:]
    if not s:
        raise ISBT128Error("empty barcode")

    fields: dict[str, object] = {}
    i = 0
    while i < len(s):
        lead = s[i]
        if lead not in "=&" or i + 1 >= len(s):
            raise ISBT128Error(f"expected data identifier at position {i}")
        second = s[i + 1]

        if lead == "=" and second in _DIN_ALPHA:
            payload = s[i + 1 : i + 16]
            din, flags = _parse_din(payload)
            if "din" in fields:
                raise ISBT128Error("more than one DIN in message")
            fields["din"], fields["din_flags"] = din, flags
            i += 16
            continue

        table = _FIXED_STRUCTURES if lead == "=" else _FIXED_AMPERSAND
        if second not in table:
            raise ISBT128Error(f"unsupported ISBT 128 data identifier '{lead}{second}'")
        name, length = table[second]
        content = s[i + 2 : i + 2 + length]
        if len(content) != length:
            raise ISBT128Error(f"{name} is truncated (expected {length} characters)")
        i += 2 + length

        if name == "product_code":
            _check_alnum(content, "product code")
            fields["product_code"] = content.upper()
        elif name == "blood_group":
            _check_alnum(content, "blood group")
            fields["blood_group"] = content
        elif name == "expiry_date":
            fields["expiry_at"] = _decode_julian(content, 23, 59)
        elif name == "expiry_datetime":
            if not _DIGITS.match(content):
                raise ISBT128Error(f"invalid expiry date/time {content!r}")
            hh, mm = int(content[6:8]), int(content[8:10])
            if hh > 23 or mm > 59:
                raise ISBT128Error("expiry hour/minute out of range")
            fields["expiry_at"] = _decode_julian(content, hh, mm)
        # Other structures are validated for length only and otherwise ignored.

    return ISBTLabel(raw=text, **fields)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Builders (used for seed data, sample barcodes and tests)
# ---------------------------------------------------------------------------

def build_din_barcode(facility_code: str, donation_year: int, serial: int, alpha: str = "W", flags: str = "00") -> str:
    """Return the '=' + 15 character DIN message for a facility, donation year and serial."""
    din13 = f"{alpha}{facility_code}{donation_year % 100:02d}{serial:06d}"
    if len(din13) != 13:
        raise ValueError("facility_code must be 4 characters and serial < 1,000,000")
    return f"={din13}{flags}"


def build_product_code_barcode(product_code: str) -> str:
    if len(product_code) != 8:
        raise ValueError("product codes are 8 characters")
    return f"=<{product_code.upper()}"


def build_expiry_barcode(expires: datetime) -> str:
    """Return a DS005 expiry date/time barcode ('&>' + cyyjjjhhmm)."""
    year = expires.year
    if year < 2000:
        raise ValueError("expiry year must be >= 2000")
    century = (year - 2000) // 100
    jjj = expires.timetuple().tm_yday
    return f"&>{century}{year % 100:02d}{jjj:03d}{expires.hour:02d}{expires.minute:02d}"
