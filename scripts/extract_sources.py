import json
import re
import shutil
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

import fitz


ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "Reference"
BUILD = ROOT / "build"
ASSETS = ROOT / "assets" / "starter-set" / "pages"
DATA_PATH = BUILD / "starter-set-data.json"

DOCX_PATH = REFERENCE / "FalloutStarterSet_Adventure_Booklet-20220228 conv.docx"
PDF_PATH = REFERENCE / "FalloutStarterSet_Adventure_Booklet-20220228.pdf"

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
CHAPTERS = [
    ("chapter-one", "Chapter One", "Introduction"),
    ("chapter-two", "Chapter Two", "Into Vault 95"),
    ("chapter-three", "Chapter Three", "The Boston Ruins"),
    ("chapter-four", "Chapter Four", "The Promised Land"),
    ("chapter-five", "Chapter Five", "Loot Tables"),
]
MAJOR_HEADINGS = (
    "SYNOPSIS",
    "INTRODUCTION",
    "CONCLUSION",
    "QUEST GOALS",
    "CAMPAIGN INTRODUCTION",
    "CAMPAIGN OVERVIEW",
    "PROLOGUE",
)
STRUCTURAL_HEADING_PREFIXES = (
    "Overview",
    "Introduction",
    "Quest Goals",
    "Act ",
    "Scene ",
    "Encounter-",
    "Part ",
    "Campaign ",
    "Conclusion",
)
STATBLOCK_START_PATTERNS = (
    r"^Level \d+,.*$",
    r"^[A-Z][A-Za-z'’ -]+ Level \d+,.*$",
    r"^PHYS\. DR.*$",
    r"^BODY MIND.*$",
    r"^MELEEGUNS OTHER.*$",
    r"^HPINITIATIVE.*$",
    r"^ENERGY DR.*$",
    r"^RAD\. DR.*$",
)

STATBLOCK_EXACT_LINES = {
    "SKILLS",
    "CARRY WEIGHT",
    "INITIATIVE",
    "MELEE BONUS",
    "LUCK POINTS",
    "ENERGY DR",
    "POISON DR",
    "SPECIAL ABILITIES",
    "INVENTORY",
    "BODY MIND",
    "MELEEGUNS OTHER",
    "HPINITIATIVE",
    "ENERGY DRRAD. DR",
    "PHYSICAL DR",
    "RAD. DR",
}

STATBLOCK_PATTERNS = (
    r"^Level \d+,.*$",
    r"^(Normal|Notable) Character \(\d+ XP\)$",
    r"^[A-Z][A-Za-z'’ -]+ Level \d+,.*$",
    r"^[SP ECIAL]{3,}(?:\s+\d+.*)?$",
    r"^\d+ lbs\.$",
    r"^[+\-—]?\d+(?:\s*CD)?$",
    r"^\(? ?[\uf06e].*Tag Skill\)?$",
    r"^[A-Za-z'’ -]+ ?[\uf06e]\d+.*$",
    r"^\d+[A-Za-z].*$",
)


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "section"


def escape_html(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def parse_docx_lines(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    body = root.find("w:body", NS)
    lines: list[str] = []
    for paragraph in body.findall("w:p", NS):
        texts = [node.text or "" for node in paragraph.iterfind(".//w:t", NS)]
        line = "".join(texts).replace("\xa0", " ").strip()
        if line:
            lines.append(line)
    return lines


def is_page_artifact(line: str) -> bool:
    if re.match(r"^\d+\s*FALLOUT", line, re.IGNORECASE):
        return True
    if re.match(r"^Chapter\s+\w+.*\d+$", line):
        return True
    if line.startswith("Chapter "):
        return True
    return False


def normalize_lines(lines: list[str]) -> list[str]:
    cleaned: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line or is_page_artifact(line):
            i += 1
            continue
        if re.fullmatch(r"[0-9A-Z®.\- ]{1,8}", line):
            i += 1
            continue
        if cleaned and cleaned[-1].endswith("-") and line[:1].islower():
            cleaned[-1] = cleaned[-1][:-1] + line
        else:
            cleaned.append(line)
        i += 1
    return cleaned


def find_story_start(lines: list[str]) -> int:
    for index, line in enumerate(lines):
        if line == "Chapter One" and index > 50:
            return index
    raise RuntimeError("Could not locate the starter set story content.")


def split_chapters(lines: list[str]) -> list[dict]:
    positions: list[tuple[int, int]] = []
    start_search = find_story_start(lines)
    for chapter_index, (_, chapter_label, _) in enumerate(CHAPTERS):
        for line_index in range(start_search, len(lines)):
            if lines[line_index] == chapter_label:
                positions.append((chapter_index, line_index))
                start_search = line_index + 1
                break
    chapters: list[dict] = []
    for pos, (chapter_index, start) in enumerate(positions):
        end = positions[pos + 1][1] if pos + 1 < len(positions) else len(lines)
        slug, chapter_label, chapter_title = CHAPTERS[chapter_index]
        body = lines[start:end]
        if body and body[0] == chapter_label:
            body = body[1:]
        if body and body[0].upper() == chapter_title.upper():
            body = body[1:]
        chapters.append(
            {
                "slug": slug,
                "label": chapter_label,
                "title": chapter_title,
                "body": body,
            }
        )
    return chapters


def is_statblock_line(line: str) -> bool:
    if not line:
        return False
    upper = line.upper()
    collapsed = re.sub(r"[^A-Z]", "", upper)
    if upper in STATBLOCK_EXACT_LINES:
        return True
    if upper in {"CARRY WEIGHT", "MELEE BONUS", "LUCK POINTS", "ENERGY DR", "POISON DR", "SPECIAL ABILITIES", "INVENTORY"}:
        return True
    if collapsed in {"BODYMIND", "MELEEGUNSOTHER", "HPINITIATIVE", "BODYMINDMELEEGUNSOTHER", "ENERGYDRRADDR"}:
        return True
    if "Tag Skill" in line or "\uf06e" in line or "" in line:
        return True
    for pattern in STATBLOCK_PATTERNS:
        if re.fullmatch(pattern, line):
            return True
    if re.fullmatch(r"[—\-0-9 ]{1,12}", line):
        return True
    if re.fullmatch(r"(Head|Torso|Arms|Legs|Coat|Torso\)|Legs, Torso\)|Arms, Torso\)|Immune)", line):
        return True
    if re.fullmatch(r"(Medicine|Repair|Athletics|Big Guns|Energy Weapons|Lockpick|Science|Melee Weapons|Small Guns|Speech|Survival|Throwing|Unarmed|Explosives)", line):
        return True
    return False


def looks_like_prose(line: str) -> bool:
    if not line or is_statblock_line(line):
        return False
    if len(line) >= 60:
        return True
    if line.endswith("."):
        return True
    if re.search(r"[a-z].*[a-z].*[a-z]", line) and len(line.split()) >= 6:
        return True
    return False


def is_heading(line: str, next_line: str = "") -> bool:
    if is_statblock_line(line):
        return False
    if line in MAJOR_HEADINGS:
        return True
    if line.startswith("ACT ") or line.startswith("SCENE ") or line.startswith("PART "):
        return True
    if line.startswith("ENCOUNTER-"):
        return True
    if len(line) > 80:
        return False
    if line.endswith("."):
        return False
    if "," in line:
        return False
    if line.startswith("") or line.startswith("("):
        return False
    if (
        re.fullmatch(r"[A-Z][A-Za-z0-9 :’'\"&(),\-]+", line)
        and sum(1 for token in line.split() if token) <= 8
        and ":" not in line[-1:]
        and looks_like_prose(next_line)
    ):
        return True
    return False


def tidy_fragment(text: str) -> str:
    text = text.replace("", "").replace("•", "").replace("ï®", "").strip()
    text = re.sub(r"\s+", " ", text)
    return text


def paragraph_html(text: str) -> str:
    return f"<p>{escape_html(tidy_fragment(text))}</p>"


def is_statblock_start(line: str, next_line: str = "") -> bool:
    upper = line.upper()
    for pattern in STATBLOCK_START_PATTERNS:
        if re.fullmatch(pattern, line):
            return True
    if line in {"Raider", "Dog", "Mister Gutsy", "Diamond City Security", "Miss Nanny Clara", "Synth Replica"} and re.search(r"^Level \d+,", next_line):
        return True
    if upper in {"SKILLS", "SPECIAL ABILITIES", "INVENTORY"}:
        return True
    if line.startswith("") and ("TN " in line or " CD " in line):
        return True
    return False


def is_valid_subheading(title: str) -> bool:
    if any(title.startswith(prefix) for prefix in STRUCTURAL_HEADING_PREFIXES):
        return False
    if len(title) < 4 or len(title) > 60:
        return False
    if re.search(r"\d", title):
        return False
    if "," in title:
        return False
    if re.search(r"\b(?:DR|CD|TN|STR|PER|AGI|END|CHA|INT|LCK|RAD|PHYS|ENERGY|POISON)\b", title.upper()):
        return False
    if title.upper() == title:
        return False
    if sum(1 for ch in title if ch.isalpha() and ch.isupper()) > max(1, len(title.split())):
        return False
    return True


def is_resume_heading(line: str, next_line: str = "") -> bool:
    if any(line.startswith(prefix) for prefix in STRUCTURAL_HEADING_PREFIXES):
        return True
    if line.isupper() and looks_like_prose(next_line) and not is_statblock_start(line, next_line):
        return True
    if is_valid_subheading(line) and looks_like_prose(next_line):
        return True
    return False


def is_clean_prose_resume(line: str) -> bool:
    if not looks_like_prose(line):
        return False
    if line.startswith("") or line.startswith("("):
        return False
    if re.search(r"\b(?:TN|CD|STR|PER|AGI|END|CHA|INT|LCK|DR)\b", line):
        return False
    if len(line.split()) < 8:
        return False
    return any(
        line.startswith(prefix)
        for prefix in (
            "If ",
            "The ",
            "A ",
            "An ",
            "When ",
            "Once ",
            "As ",
            "After ",
            "During ",
            "While ",
            "These ",
            "Those ",
            "There ",
            "Finally,",
            "You ",
            "PCs ",
        )
    )


def sanitize_section_html(html: str) -> str:
    patterns = (
        r"This adds the weapon’s Fire Rate[^.]+\.",
        r"Boosted Focused Institute Laser Rifle[^.]+\.",
        r"\bAGI \+ Small Guns \(TN \d+\), [^.]+(?:\.)?",
        r"\bSTR \+ Unarmed \(TN \d+\), [^.]+(?:\.)?",
        r"\bSTR \+ Melee Weapons \(TN \d+\), [^.]+(?:\.)?",
        r"\bPER \+ Energy Weapons \(TN \d+\), [^.]+(?:\.)?",
        r"\bTIRE IRON: [^.]+(?:\.)?",
        r"\bAUTO PIPE RIFLE: [^.]+(?:\.)?",
        r"\bUNARMED STRIKE: [^.]+(?:\.)?",
    )
    for pattern in patterns:
        html = re.sub(pattern, "", html)
    html = re.sub(r"<p>\s*</p>", "", html)
    html = re.sub(r"<ul>\s*</ul>", "", html)
    html = re.sub(r"\s+</p>", "</p>", html)
    html = re.sub(r"\s{2,}", " ", html)
    return html.strip()


def split_heading(line: str) -> tuple[str, str]:
    if line.startswith("ENCOUNTER-"):
        match = re.match(r"^(ENCOUNTER-[^:]+:\s*[A-Z0-9'’ -]+)(?=\s+[A-Z][a-z])", line)
        if match:
            title = match.group(1).strip()
            remainder = line[match.end():].strip()
            return title.title(), remainder
    return (line.title() if line.upper() == line else line, "")


def merge_short_sections(sections: list[dict]) -> list[dict]:
    merged: list[dict] = []
    for section in sections:
        keep_separate = any(section["title"].startswith(prefix) for prefix in STRUCTURAL_HEADING_PREFIXES)

        if merged and not keep_separate:
            heading = f"\n<h3>{escape_html(section['title'])}</h3>" if is_valid_subheading(section["title"]) else ""
            merged[-1]["html"] = f"{merged[-1]['html']}{heading}\n{section['html']}"
            continue

        merged.append(section)
    return merged


def build_sections(chapter: dict) -> list[dict]:
    sections: list[dict] = []
    current_title = "Overview"
    blocks: list[str] = []
    bullet_buffer: list[str] = []
    paragraph_buffer: list[str] = []
    skipping_statblock = False

    def flush_paragraph() -> None:
        nonlocal paragraph_buffer
        if paragraph_buffer:
            text = " ".join(paragraph_buffer)
            blocks.append(paragraph_html(text))
            paragraph_buffer = []

    def flush_bullets() -> None:
        nonlocal bullet_buffer
        if bullet_buffer:
            items = "".join(f"<li>{escape_html(tidy_fragment(item))}</li>" for item in bullet_buffer)
            blocks.append(f"<ul>{items}</ul>")
            bullet_buffer = []

    def flush_section() -> None:
        nonlocal blocks, current_title
        flush_paragraph()
        flush_bullets()
        if blocks:
            sections.append(
                {
                    "title": current_title,
                    "slug": slugify(current_title),
                    "html": "\n".join(blocks),
                }
            )
            blocks = []

    for index, raw_line in enumerate(chapter["body"]):
        line = raw_line.strip()
        next_line = chapter["body"][index + 1].strip() if index + 1 < len(chapter["body"]) else ""
        if not line or is_page_artifact(line):
            continue
        if skipping_statblock:
            if is_resume_heading(line, next_line) or is_clean_prose_resume(line):
                skipping_statblock = False
            else:
                continue
        if is_statblock_start(line, next_line):
            flush_paragraph()
            flush_bullets()
            skipping_statblock = True
            continue
        if is_statblock_line(line):
            continue
        if is_heading(line, next_line):
            flush_section()
            current_title, remainder = split_heading(line)
            if remainder:
                paragraph_buffer.append(remainder)
            continue
        if line.startswith("") or line.startswith("•"):
            flush_paragraph()
            bullet_buffer.append(line[1:].strip())
            continue
        if bullet_buffer and not is_heading(line):
            bullet_buffer[-1] = f"{bullet_buffer[-1]} {line}"
            continue
        paragraph_buffer.append(line)

    flush_section()
    sections = merge_short_sections(sections)
    for section in sections:
        section["html"] = sanitize_section_html(section["html"])
    return sections


def locate_page_for_text(document: fitz.Document, needle: str, fallback: int = 0) -> int:
    needle = needle.lower()
    for page_number in range(document.page_count):
        text = document.load_page(page_number).get_text("text").lower()
        if needle in text:
            return page_number + 1
    return fallback


def render_pages(pdf_path: Path, chapter_map: dict[str, str]) -> list[dict]:
    if ASSETS.exists():
        shutil.rmtree(ASSETS)
    ASSETS.mkdir(parents=True, exist_ok=True)

    document = fitz.open(pdf_path)
    pages: list[dict] = []
    matrix = fitz.Matrix(1.5, 1.5)

    for page_number in range(document.page_count):
        page = document.load_page(page_number)
        pixmap = page.get_pixmap(matrix=matrix, alpha=False)
        output = ASSETS / f"page-{page_number + 1:03}.jpg"
        pixmap.save(output)
        pages.append(
            {
                "name": f"Booklet Page {page_number + 1}",
                "pageNumber": page_number + 1,
                "src": f"modules/fallout-starter-set-commonwealth/assets/starter-set/pages/{output.name}",
            }
        )

    chapter_starts = {
        slug: locate_page_for_text(document, title, 1) for slug, title in chapter_map.items()
    }
    return pages, chapter_starts


def build_rolltables() -> list[dict]:
    return [
        {
            "name": "Random Ammunition",
            "formula": "2d20",
            "results": [
                {"range": [2, 4], "text": "2mm EC (6+3 CD)"},
                {"range": [5, 5], "text": "Plasma Cartridge (10+5 CD)"},
                {"range": [6, 6], "text": "Missile (2+1 CD)"},
                {"range": [7, 7], "text": "Fusion Core (1)"},
                {"range": [8, 9], "text": "5mm (12+6 CD x10)"},
                {"range": [10, 11], "text": ".50 ammo (4+2 CD)"},
                {"range": [12, 13], "text": "Syringer Ammo (4+2 CD)"},
                {"range": [14, 14], "text": "Gamma Round (4+2 CD)"},
                {"range": [15, 16], "text": "Flamer Fuel (12+6 CD)"},
                {"range": [17, 18], "text": ".45 Rounds (9+4 CD)"},
                {"range": [19, 20], "text": "10mm (8+4 CD)"},
                {"range": [21, 22], "text": ".38 Ammo (10+5 CD)"},
                {"range": [23, 23], "text": "Flare (2+1 CD)"},
                {"range": [24, 24], "text": ".308 ammo (6+3 CD)"},
                {"range": [25, 26], "text": "Shotgun Shells (6+3 CD)"},
                {"range": [27, 28], "text": "Fusion Cell (14+7 CD)"},
                {"range": [29, 30], "text": "Railway Spike (6+3 CD)"},
                {"range": [31, 32], "text": ".44 Magnum (4+2 CD)"},
                {"range": [33, 34], "text": "5.56mm (8+4 CD)"},
                {"range": [35, 35], "text": "Missile (2+1 CD)"},
                {"range": [36, 36], "text": "Fusion Core (1)"},
                {"range": [37, 37], "text": "Plasma Cartridge (10+5 CD)"},
                {"range": [38, 40], "text": "Mini-Nuke (1+1 CD)"},
            ],
        },
        {
            "name": "Random Weapons",
            "formula": "1d20",
            "results": [
                {"range": [1, 1], "text": "Hunting Rifle"},
                {"range": [2, 2], "text": "Laser Pistol"},
                {"range": [3, 3], "text": "Combat Rifle"},
                {"range": [4, 4], "text": ".44 Pistol"},
                {"range": [5, 5], "text": "10mm Pistol"},
                {"range": [6, 6], "text": "Machete"},
                {"range": [7, 7], "text": "Baton"},
                {"range": [8, 8], "text": "Switchblade"},
                {"range": [9, 9], "text": "Sledgehammer"},
                {"range": [10, 11], "text": "10mm Pistol"},
                {"range": [12, 14], "text": "Pipe Gun"},
                {"range": [15, 16], "text": "Pipe Wrench"},
                {"range": [17, 18], "text": "Tire Iron"},
                {"range": [19, 19], "text": "Rolling Pin"},
                {"range": [20, 20], "text": "Board"},
            ],
        },
        {
            "name": "Random Chems",
            "formula": "1d20",
            "results": [
                {"range": [1, 3], "text": "Buffout"},
                {"range": [4, 5], "text": "Daddy-O"},
                {"range": [6, 8], "text": "Jet"},
                {"range": [9, 10], "text": "Med-X"},
                {"range": [11, 13], "text": "Mentats"},
                {"range": [14, 16], "text": "Psycho"},
                {"range": [17, 18], "text": "Rad-X"},
                {"range": [19, 19], "text": "RadAway"},
                {"range": [20, 20], "text": "Stimpak"},
            ],
        },
        {
            "name": "Hit Locations",
            "formula": "1d20",
            "results": [
                {"range": [1, 2], "text": "Head"},
                {"range": [3, 8], "text": "Torso"},
                {"range": [9, 11], "text": "Left arm"},
                {"range": [12, 14], "text": "Right arm"},
                {"range": [15, 17], "text": "Left Leg"},
                {"range": [18, 20], "text": "Right Leg"},
            ],
        },
        {
            "name": "Random Beverages",
            "formula": "2d20",
            "results": [
                {"range": [2, 3], "text": "Wine"},
                {"range": [4, 5], "text": "Whiskey"},
                {"range": [6, 8], "text": "Nuka-Cherry"},
                {"range": [9, 11], "text": "Nuka-Cola"},
                {"range": [12, 14], "text": "Bourbon"},
                {"range": [15, 18], "text": "Beer"},
                {"range": [19, 23], "text": "Dirty Water"},
                {"range": [24, 27], "text": "Purified Water"},
                {"range": [28, 30], "text": "Brahmin Milk"},
                {"range": [31, 33], "text": "Rum"},
                {"range": [34, 36], "text": "Moonshine"},
                {"range": [37, 38], "text": "Vodka"},
                {"range": [39, 40], "text": "Wine"},
            ],
        },
        {
            "name": "Random Armor",
            "formula": "1d20",
            "results": [
                {"range": [1, 2], "text": "Combat Armor"},
                {"range": [3, 5], "text": "Metal Armor"},
                {"range": [6, 12], "text": "Leather Armor"},
                {"range": [13, 20], "text": "Raider Armor"},
            ],
        },
        {
            "name": "Random Publication",
            "formula": "1d20",
            "results": [
                {"range": [1, 1], "text": "¡La Fantoma!"},
                {"range": [2, 2], "text": "Astoundingly Awesome Tales"},
                {"range": [3, 3], "text": "Backwoodsman"},
                {"range": [4, 4], "text": "Boxing Times"},
                {"range": [5, 5], "text": "Duck and Cover!"},
                {"range": [6, 6], "text": "Fixin' Things"},
                {"range": [7, 7], "text": "Future Weapons Today"},
                {"range": [8, 8], "text": "Grognak the Barbarian"},
                {"range": [9, 9], "text": "Guns and Bullets"},
                {"range": [10, 10], "text": "Live & Love"},
                {"range": [11, 11], "text": "Massachusetts Surgical Journal"},
                {"range": [12, 12], "text": "Meeting People"},
                {"range": [13, 13], "text": "Programmer's Digest"},
                {"range": [14, 14], "text": "Tales of a Junktown Jerky Vendor"},
                {"range": [15, 15], "text": "Tesla Science Magazine"},
                {"range": [16, 16], "text": "True Police Stories"},
                {"range": [17, 17], "text": "Tumblers Today"},
                {"range": [18, 18], "text": "Unstoppables"},
                {"range": [19, 19], "text": "U.S. Covert Operations Manual"},
                {"range": [20, 20], "text": "Wasteland Survival Guide"},
            ],
        },
    ]


def main() -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    lines = normalize_lines(parse_docx_lines(DOCX_PATH))
    chapters = split_chapters(lines)
    structured_chapters = []
    chapter_lookup = {chapter["slug"]: chapter["title"] for chapter in chapters}
    page_images, chapter_starts = render_pages(PDF_PATH, chapter_lookup)

    for chapter in chapters:
        structured_chapters.append(
            {
                "slug": chapter["slug"],
                "label": chapter["label"],
                "title": chapter["title"],
                "coverPage": chapter_starts.get(chapter["slug"], 1),
                "sections": build_sections(chapter),
            }
        )

    payload = {
        "chapters": structured_chapters,
        "pageImages": page_images,
        "rollTables": build_rolltables(),
    }
    DATA_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {DATA_PATH}")


if __name__ == "__main__":
    main()
