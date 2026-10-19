"""Gift voucher request PDF (a copy of the request, not a redeemable voucher)."""
import unicodedata
from decimal import Decimal

from fpdf import FPDF

W, H = 576, 363


def _safe(value: str) -> str:
    """Core PDF fonts are Latin-1 only: fold accents, drop anything else."""
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()


def _rgb(hex_color: str) -> tuple[int, int, int]:
    return tuple(int(hex_color[i:i + 2], 16) for i in (1, 3, 5))  # type: ignore[return-value]


def _fit(pdf: FPDF, text: str, width: float) -> str:
    if pdf.get_string_width(text) <= width:
        return text
    while text and pdf.get_string_width(text + "...") > width:
        text = text[:-1]
    return text.rstrip() + "..."


def _text(pdf: FPDF, x: float, y: float, text: str, color: str, size: float, bold=False, spacing=0.0,
          width: float | None = None) -> None:
    pdf.set_font("Helvetica", "B" if bold else "", size)
    pdf.set_text_color(*_rgb(color))
    pdf.set_char_spacing(spacing)
    if width:
        text = _fit(pdf, text, width)
    pdf.set_xy(x, y)
    pdf.cell(text=text, h=size * 1.2)


def make_gift_voucher_pdf(*, who: str, message: str | None, how: str, sessions: int, total: Decimal) -> bytes:
    pdf = FPDF(unit="pt", format=(W, H))
    pdf.set_auto_page_break(False)
    pdf.set_margin(0)
    pdf.add_page()

    pdf.set_fill_color(*_rgb("#261e39"))
    pdf.rect(0, 0, W, H, style="F")
    pdf.set_fill_color(*_rgb("#302449"))
    pdf.rect(16, 16, W - 32, H - 32, style="F", round_corners=True, corner_radius=18)

    _text(pdf, 34, 34, "PANIK404  /  SESSION GIFT", "#c4b5fd", 9, bold=True, spacing=1)
    _text(pdf, 34, 62, "A little room to breathe", "#f3edff", 21, bold=True, width=330)
    _text(pdf, 34, 112, f"TO  /  {sessions} SESSION{'' if sessions == 1 else 'S'}", "#bda4ff", 8, spacing=0.8)
    _text(pdf, 34, 129, _safe(who), "#c4b5fd", 23, bold=True, width=300)

    top = 176
    pdf.set_draw_color(*_rgb("#bda4ff"))
    pdf.set_line_width(2)
    pdf.line(34, top, 34, top + 48)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*_rgb("#f3edff"))
    pdf.set_char_spacing(0)
    lines = pdf.multi_cell(275, 12, _safe(message or "A thoughtful gift for you."), dry_run=True, output="LINES")
    if len(lines) > 4:
        lines = lines[:3] + [_fit(pdf, lines[3] + " " + lines[4], 275)]
    for i, line in enumerate(lines[:4]):
        pdf.set_xy(44, top + i * 12)
        pdf.cell(text=line, h=12)

    pdf.set_fill_color(*_rgb("#493664"))
    pdf.rect(356, 104, 180, 134, style="F", round_corners=True, corner_radius=14)
    _text(pdf, 374, 122, f"DELIVERY  /  {how.upper()}", "#d8c7ff", 8, bold=True, spacing=0.8)
    _text(pdf, 374, 158, "TOTAL", "#bda4ff", 8, spacing=0.8)
    _text(pdf, 374, 176, f"Rs {total:,.0f}", "#f3edff", 20, bold=True, width=144)

    pdf.set_draw_color(*_rgb("#55456f"))
    pdf.set_line_width(0.7)
    pdf.line(34, H - 72, W - 34, H - 72)
    _text(pdf, 34, H - 61, "GIFT REQUEST - PAYMENT PENDING", "#d8c7ff", 7, bold=True, spacing=0.5)
    _text(pdf, 34, H - 47, "This request copy is not redeemable. Panik will confirm the gift after payment is verified.",
          "#bda4ff", 7, width=W - 68)
    return bytes(pdf.output())
