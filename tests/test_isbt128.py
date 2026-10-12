from datetime import datetime

import pytest

from app.isbt128 import (
    ISBT128Error,
    build_din_barcode,
    build_expiry_barcode,
    build_product_code_barcode,
    parse_isbt128,
)


def test_din_only_barcode_splits_din_and_flags():
    label = parse_isbt128("=W12340412345600")
    assert label.din == "W123404123456"
    assert label.din_flags == "00"
    assert label.product_code is None


def test_expiry_datetime_matches_iccbba_example():
    # ISBT 128 example: &>0123661300 is 31 Dec 2012 13:00 (century 0 = 2000s, day 366 in a leap year)
    label = parse_isbt128("&>0123661300")
    assert label.expiry_at == datetime(2012, 12, 31, 13, 0)


def test_expiry_date_only_defaults_to_end_of_day():
    label = parse_isbt128("=>012365")
    assert label.expiry_at == datetime(2012, 12, 30, 23, 59)


def test_compound_message_parses_all_structures():
    label = parse_isbt128("=W12340412345600=<E0150V00&>0123661300")
    assert label.din == "W123404123456"
    assert label.product_code == "E0150V00"
    assert label.product_family == "E0150"
    assert label.expiry_at == datetime(2012, 12, 31, 13, 0)


def test_scanner_whitespace_and_aim_prefix_are_ignored():
    label = parse_isbt128("]C1=W12340412345600\r\n")
    assert label.din == "W123404123456"


def test_blood_group_structure_is_kept_raw():
    label = parse_isbt128("=W12340412345600=%6200")
    assert label.blood_group == "6200"


@pytest.mark.parametrize("bad", [
    "",                       # empty
    "W12340412345600",        # no data identifier
    "=0123404123456000",      # '0' is not a valid DIN alpha character
    "=W1234041234560",        # DIN payload too short
    "=W1234A41234560" + "0",  # non-digit year
    "=<E0150",                # truncated product code
    "&>0133661300",           # day 366 does not exist in 2013
    "&>0123662400",           # hour 24 out of range
    "&>0123661260",           # minute 60 out of range
    "=~W12340412345600",      # unsupported data identifier
])
def test_invalid_barcodes_are_rejected(bad):
    with pytest.raises(ISBT128Error):
        parse_isbt128(bad)


def test_leap_day_is_accepted_only_in_leap_years():
    assert parse_isbt128("&>0123661300").expiry_at.year == 2012  # 2012 is a leap year: day 366 exists
    assert parse_isbt128("&>0133651300").expiry_at == datetime(2013, 12, 31, 13, 0)


def test_builders_round_trip():
    din = build_din_barcode("N001", 2026, 42)
    exp = datetime(2026, 10, 20, 23, 59)
    msg = din + build_product_code_barcode("e0150v00") + build_expiry_barcode(exp)
    label = parse_isbt128(msg)
    assert label.din == "W" + "N001" + "26" + "000042"
    assert label.product_code == "E0150V00"
    assert label.expiry_at == exp
