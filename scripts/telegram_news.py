#!/usr/bin/env python3
"""Publish Telegram news from actual changed source files and commit subjects."""
import html, json, os, re, subprocess, sys, urllib.request

REPO = os.environ.get("REPOSITORY", "kisia319-cell/SkyRealm-PC-Launcher")
TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
CHAT = os.environ.get("TELEGRAM_CHAT_ID", "@SkyRealmGame")
EXT = (".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".html", ".css", ".py", ".json", ".xml", ".svg")
IGNORE = re.compile(r"(^|/)(tests?|__tests__|docs|documentation|\.github)(/|$)|(^|/)(README|CHANGELOG)|(^|/)(manifest|preview-manifest)\.json$|^scripts/telegram_news\.py$|(^|/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$", re.I)
MAJOR = re.compile(r"\[(major|big|large|важно|крупное|крупный)\]|^(major|release)\s*:|new world|новый мир|new game mode|новый режим|complete rework|полная переработка|major expansion|крупное расширение", re.I)
MEDIUM = re.compile(r"\[(medium|среднее)\]|^(medium|среднее)\s*:", re.I)

def git(*args):
    return subprocess.check_output(["git", *args], text=True, encoding="utf-8").strip()

def stats(sha):
    paths, lines = [], 0
    for row in git("show", "--format=", "--numstat", sha).splitlines():
        p = row.split("\t")
        if len(p) != 3:
            continue
        path = p[2].replace("\\", "/")
        if IGNORE.search(path) or not path.lower().endswith(EXT):
            continue
        paths.append(path)
        try:
            lines += int(p[0]) + int(p[1])
        except ValueError:
            pass
    return sorted(set(paths)), lines

def summarize(subject, paths):
    s = re.sub(r"^\s*(\[(major|big|large|medium|важно|крупное|среднее)\]\s*|(?:feat|feature|fix|bugfix|refactor|update|major|medium)\s*:\s*)", "", subject, flags=re.I).strip()
    low = s.lower()
    prime = any(p.startswith("game/competitive/") for p in paths)
    launcher = prime or any(p in {"launcher.py", "app.js", "index.html", "style.css", "launcher-enhancements.js", "launcher-enhancements.css"} for p in paths)
    area = "PrimeLauncher" if prime else ("лаунчер" if launcher else "игровой мир")
    rules = [
        (r"leaderboard|rating|рейтинг|таблиц", "обновлены рейтинг и таблица лидеров"),
        (r"tower|баш", "доработаны башни и их улучшения"),
        (r"coin|balance|эконом|монет|баланс", "обновлены баланс и экономика"),
        (r"training|трениров", "доработан режим тренировок"),
        (r"matchmaking|online|онлайн|multiplayer|coop|кооп", "обновлены сетевые функции и режимы"),
        (r"fps|ping|performance|производительност", "улучшены производительность и игровые показатели"),
        (r"boss|босс|god|бог", "доработаны боссы и боевые механики"),
        (r"village|settlement|деревн|поселен", "расширены деревни и поселения"),
        (r"sea|ocean|ship|море|океан|кораб", "расширены морской мир и приключения"),
        (r"mine|cave|шахт|пещер", "обновлены шахты и пещеры"),
        (r"animation|анимац", "добавлены или улучшены анимации"),
        (r"effect|эффект|particle|частиц", "обновлены визуальные эффекты"),
        (r"fix|bug|исправ|почин|repair|устран", "исправлены ошибки и повышена стабильность"),
        (r"add|добав|new|нов", "добавлены новые возможности"),
        (r"improv|updat|enhanc|улучш|доработ", "улучшены игровые механики"),
    ]
    detail = next((value for pattern, value in rules if re.search(pattern, low)), "внесены изменения в игровые функции")
    return f"{area}: {detail}"

def self_test():
    assert stats_test_tab()
    assert "PrimeLauncher:" in summarize("Add tower upgrades", ["game/competitive/prime-world.js"])
    assert "рейтинг" in summarize("Improve leaderboard", ["game/competitive/prime-world.js"])
    assert "визуальные эффекты" not in summarize("Add new economy flow", ["game/competitive/prime-world.js"])
    assert "игровые функции" in summarize("Adjust internal state", ["game/competitive/prime-world.js"])
    print("telegram-news self-test: OK")

def stats_test_tab():
    return "\t".join(("1", "2", "game/competitive/prime-world.js")).split("\t")[2].endswith(".js")

def main():
    if "--self-test" in sys.argv:
        self_test()
        return
    if not TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured.")
    git("fetch", "origin", "+refs/heads/main:refs/remotes/origin/main")
    head = git("rev-parse", "origin/main")
    try:
        git("fetch", "origin", "+refs/heads/telegram-news-state:refs/remotes/origin/telegram-news-state")
        base = git("rev-parse", "origin/telegram-news-state")
    except Exception:
        try:
            base = git("rev-parse", head + "^")
        except Exception:
            base = head
    if base == head:
        print("No new commits to announce.")
        return
    commits = []
    for row in git("log", "--reverse", "--format=%H%x1f%s", base + ".." + head).splitlines():
        if "\x1f" not in row:
            continue
        sha, subject = row.split("\x1f", 1)
        paths, changed = stats(sha)
        if paths:
            commits.append({"sha": sha, "subject": subject.strip(), "paths": paths, "lines": changed})
    if not commits:
        git("push", "--force", "origin", head + ":refs/heads/telegram-news-state")
        print("Only metadata/non-game files changed; cursor advanced without a post.")
        return
    total = sum(c["lines"] for c in commits)
    major_count = sum(bool(MAJOR.search(c["subject"])) for c in commits)
    substantial = [c for c in commits if c["lines"] >= 20 or MEDIUM.search(c["subject"])]
    major = (major_count >= 1 and total >= 250) or total >= 1200 or (major_count >= 2 and total >= 500)
    medium = len(substantial) >= 3 and not major
    small = len(commits) >= 5 and not major and not medium
    if not (major or medium or small):
        print(f"Waiting for a real update batch: commits={len(commits)}, substantial={len(substantial)}, lines={total}.")
        return
    selected = commits if major or medium else commits[-7:]
    bullets = []
    for commit in selected:
        item = summarize(commit["subject"], commit["paths"])
        if item not in bullets:
            bullets.append(item)
    bullets = bullets[:7]
    if major:
        heading, intro = "🚀 <b>КРУПНОЕ ОБНОВЛЕНИЕ SKYREALM</b>", "В этом обновлении:"
    elif medium:
        heading, intro = "📦 <b>ОБНОВЛЕНИЕ SKYREALM</b>", "Главные изменения:"
    else:
        heading, intro = "🛠 <b>ПОДБОРКА ИЗМЕНЕНИЙ SKYREALM</b>", f"Собрали {len(commits)} небольших изменений:"
    compare = f"https://github.com/{REPO}/compare/{base}...{head}"
    message = heading + "\n\n" + intro + "\n\n" + "\n".join("▫️ " + html.escape(item) for item in bullets)
    message += '\n\n🔗 <a href="' + html.escape(compare, quote=True) + '">Все изменения на GitHub</a>\n\n💚 Спасибо, что следите за SkyRealm!'
    payload = json.dumps({"chat_id": CHAT, "text": message, "parse_mode": "HTML", "disable_web_page_preview": True}).encode("utf-8")
    request = urllib.request.Request("https://api.telegram.org/bot" + TOKEN + "/sendMessage", data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.loads(response.read().decode("utf-8"))
    if not result.get("ok"):
        raise RuntimeError("Telegram rejected message: " + str(result))
    print("Telegram message published successfully.")
    git("push", "--force", "origin", head + ":refs/heads/telegram-news-state")
    print("News cursor updated to " + head)

if __name__ == "__main__":
    main()
