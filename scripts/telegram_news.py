#!/usr/bin/env python3
"""Publish Telegram news from actual changed source files and commit subjects."""
import html, json, os, re, subprocess, sys, time, urllib.request

REPO = os.environ.get("REPOSITORY", "kisia319-cell/SkyRealm-PC-Launcher")
TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
CHAT = os.environ.get("TELEGRAM_CHAT_ID", "@SkyRealmGame")
EXT = (".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".html", ".css", ".py", ".json", ".xml", ".svg")
IGNORE = re.compile(r"(^|/)(tests?|__tests__|docs|documentation|\.github)(/|$)|(^|/)(README|CHANGELOG)|(^|/)(manifest|preview-manifest)\.json$|^scripts/telegram_news\.py$|(^|/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$", re.I)
MAJOR = re.compile(r"\[(major|big|large|важно|крупное|крупный)\]|^(major|release)\s*:|new world|новый мир|new game mode|новый режим|complete rework|полная переработка|major expansion|крупное расширение", re.I)

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

def parse_commit_row(row):
    """Split a git log row using the actual unit-separator character."""
    if "\x1f" not in row:
        return None
    return row.split("\x1f", 1)

def self_test():
    assert stats_test_tab()
    assert parse_commit_row("abc123\x1fAdd a feature") == ["abc123", "Add a feature"]
    assert "\n" in "\n".join(["one", "two"])
    assert "PrimeLauncher:" in summarize("Add tower upgrades", ["game/competitive/prime-world.js"])
    assert "рейтинг" in summarize("Improve leaderboard", ["game/competitive/prime-world.js"])
    assert "визуальные эффекты" not in summarize("Add new economy flow", ["game/competitive/prime-world.js"])
    assert "игровые функции" in summarize("Adjust internal state", ["game/competitive/prime-world.js"])
    print("telegram-news self-test: OK")

def stats_test_tab():
    return "\t".join(("1", "2", "game/competitive/prime-world.js")).split("\t")[2].endswith(".js")

def read_state():
    try:
        git("fetch", "origin", "+refs/heads/telegram-news-state:refs/remotes/origin/telegram-news-state")
        state_ref = "refs/remotes/origin/telegram-news-state"
        state_commit = git("rev-parse", state_ref)
        message = git("show", "-s", "--format=%B", state_ref)
        announced = re.search(r"Announced-SHA: ([0-9a-f]{40})", message)
        published = re.search(r"Published-At: (\d+)", message)
        if announced and published:
            return state_commit, announced.group(1), int(published.group(1))
        # Backward-compatible migration from the previous state branch format.
        old_time = int(git("show", "-s", "--format=%ct", state_ref))
        return state_commit, state_commit, old_time
    except Exception:
        return None, None, 0

def save_state(parent_state, announced_sha, published_at):
    # Keep the cursor and the real publication timestamp independently of main's commit dates.
    empty_tree = git("mktree")
    message = f"Telegram publication state\n\nAnnounced-SHA: {announced_sha}\nPublished-At: {published_at}\n"
    args = ["commit-tree", empty_tree]
    if parent_state:
        args += ["-p", parent_state]
    env = os.environ.copy()
    env.setdefault("GIT_AUTHOR_NAME", "SkyRealm Telegram Bot")
    env.setdefault("GIT_AUTHOR_EMAIL", "actions@users.noreply.github.com")
    env.setdefault("GIT_COMMITTER_NAME", "SkyRealm Telegram Bot")
    env.setdefault("GIT_COMMITTER_EMAIL", "actions@users.noreply.github.com")
    commit = subprocess.check_output(["git", *args], input=message, text=True, encoding="utf-8", env=env).strip()
    git("push", "--force", "origin", commit + ":refs/heads/telegram-news-state")
    print(f"News cursor updated to {announced_sha}; last publication timestamp {published_at}.")

def main():
    if "--self-test" in sys.argv:
        self_test()
        return
    if not TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured.")
    git("fetch", "origin", "+refs/heads/main:refs/remotes/origin/main")
    head = git("rev-parse", "origin/main")
    state_commit, base, last_published = read_state()
    if not base:
        try:
            base = git("rev-parse", head + "^")
        except Exception:
            base = head
    if base == head:
        print("No new commits to announce.")
        return
    commits = []
    for row in git("log", "--reverse", "--format=%H%x1f%s", base + ".." + head).splitlines():
        parsed = parse_commit_row(row)
        if not parsed:
            continue
        sha, subject = parsed
        paths, changed = stats(sha)
        if paths:
            commits.append({"sha": sha, "subject": subject.strip(), "paths": paths, "lines": changed})
    if not commits:
        save_state(state_commit, head, last_published)
        print("Only metadata/non-game files changed; cursor advanced without a post.")
        return

    now = int(time.time())
    remaining = 3600 - (now - last_published)
    if last_published and remaining > 0:
        print(f"Hourly limit active: {remaining} seconds remain. {len(commits)} source changes are queued for one combined post.")
        return

    total = sum(c["lines"] for c in commits)
    major_count = sum(bool(MAJOR.search(c["subject"])) for c in commits)
    major = (major_count >= 1 and total >= 250) or total >= 1200 or (major_count >= 2 and total >= 500)
    selected = commits if major else commits[-7:]
    bullets = []
    for commit in selected:
        item = summarize(commit["subject"], commit["paths"])
        if item not in bullets:
            bullets.append(item)
    bullets = bullets[:7]
    if major:
        heading, intro = "🚀 <b>КРУПНОЕ ОБНОВЛЕНИЕ SKYREALM</b>", "В этом обновлении:"
    else:
        heading, intro = "🛠 <b>ИЗМЕНЕНИЯ SKYREALM ЗА ЧАС</b>", f"Объединили {len(commits)} изменений за последний период:"
    compare = f"https://github.com/{REPO}/compare/{base}...{head}"
    try:
        launcher_version = git("show", f"{head}:launcher_version.txt")
    except Exception:
        launcher_version = "—"
    try:
        game_version = git("show", f"{head}:game/version.txt")
    except Exception:
        game_version = "—"
    version_line = f"📌 Лаунчер {launcher_version} · игра {game_version}"
    message = heading + "\n\n" + version_line + "\n\n" + intro + "\n\n" + "\n".join("▫️ " + html.escape(item) for item in bullets)
    message += '\n\n🔗 <a href="' + html.escape(compare, quote=True) + '">Все изменения на GitHub</a>\n\n💚 Спасибо, что следите за SkyRealm!'
    payload = json.dumps({"chat_id": CHAT, "text": message, "parse_mode": "HTML", "disable_web_page_preview": True}).encode("utf-8")
    request = urllib.request.Request("https://api.telegram.org/bot" + TOKEN + "/sendMessage", data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.loads(response.read().decode("utf-8"))
    if not result.get("ok"):
        raise RuntimeError("Telegram rejected the message: " + str(result))
    print("Telegram message published successfully.")
    save_state(state_commit, head, now)

if __name__ == "__main__":
    main()
