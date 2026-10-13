"""将未混淆的扩展源码打包为带 dev-peek 顶层目录的 ZIP。"""

import hashlib
import json
import os
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "tmp" / "dev-peek.zip"
SOURCE_FILES = (
    ".gitignore", "README.md", "manifest.json", "shared.js",
    "content.js", "background.mjs", "gmgn.mjs", "panel.css",
)
ASSET_SUFFIXES = {".png", ".jpg", ".jpeg", ".svg", ".ico", ".ttf", ".woff", ".woff2"}


def main():
    files = [ROOT / name for name in SOURCE_FILES]
    files.extend(
        path for path in sorted((ROOT / "assets").rglob("*"))
        if path.is_file() and (path.suffix.lower() in ASSET_SUFFIXES or path.name == "OFL.txt")
    )
    for path in files:
        if not path.is_file() or not path.resolve().is_relative_to(ROOT):
            raise ValueError(f"文件缺失或位于项目外：{path.relative_to(ROOT)}")

    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    if os.environ.get("GITHUB_REF_TYPE") == "tag":
        if os.environ.get("GITHUB_REF_NAME") != "v" + manifest["version"]:
            raise ValueError("版本标签必须与 manifest.version 一致")
    resources = list(manifest["icons"].values())
    resources.extend(manifest["action"]["default_icon"].values())
    resources.append(manifest["background"]["service_worker"])
    for script in manifest["content_scripts"]:
        resources.extend(script["js"])
    for group in manifest["web_accessible_resources"]:
        resources.extend(group["resources"])
    packaged = set(files)
    for resource in resources:
        matches = set(ROOT.glob(resource))
        if not matches or not matches.issubset(packaged):
            raise ValueError(f"分发包缺少 manifest 引用的资源：{resource}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(OUTPUT, "w", compression=ZIP_DEFLATED) as archive:
        for path in files:
            entry = ZipInfo("dev-peek/" + path.relative_to(ROOT).as_posix())
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            archive.writestr(entry, path.read_bytes())

    with ZipFile(OUTPUT) as archive:
        for path in files:
            name = "dev-peek/" + path.relative_to(ROOT).as_posix()
            if archive.read(name) != path.read_bytes():
                raise ValueError(f"压缩包内容不一致：{name}")
    digest = hashlib.sha256(OUTPUT.read_bytes()).hexdigest()
    print(f"版本：{manifest['version']}；文件数：{len(files)}")
    print(f"ZIP：{OUTPUT}")
    print(f"SHA-256：{digest}")


if __name__ == "__main__":
    main()
