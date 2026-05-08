# Public Repository Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подготовить репозиторий к безопасному переключению в public: добавить LICENSE, public metadata в package.json и убрать internal planning state из tracked файлов.

**Architecture:** Минимальные изменения в четырёх файлах: создание `LICENSE`, обновление `package.json`, удаление `TODO.md` из tracking. Каждое изменение независимо и верифицируется существующими инструментами (`bun run check:public-doc-drift`, `git ls-files`).

**Tech Stack:** Bun, git

---

## File Map

| Action | File | Что делает |
|--------|------|-----------|
| Create | `LICENSE` | MIT license artifact |
| Modify | `package.json` | Поля `license`, `repository`, `bugs`, `homepage`, `engines` |
| Modify | `.gitignore` | Добавить `TODO.md` |
| Delete from tracking | `TODO.md` | Убрать internal launch checklist из public view |
| Modify | `ROADMAP.md` | Обновить статус Phase 01 |

---

## Task 1: Создать LICENSE файл

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Создать LICENSE**

Содержимое файла `LICENSE` (в корне репозитория):

```
MIT License

Copyright (c) 2024 Ilias Almerekov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Проверить, что файл создан и git его видит**

```bash
git ls-files --others --exclude-standard LICENSE
```

Ожидается: `LICENSE` (untracked, то есть файл появился)

- [ ] **Step 3: Убедиться, что check:public-doc-drift не находит TODO/placeholder в LICENSE**

```bash
bun run check:public-doc-drift
```

Ожидается: `Public docs drift check passed`

- [ ] **Step 4: Commit**

```bash
git add LICENSE
git commit -m "chore: add MIT license"
```

---

## Task 2: Добавить public metadata в package.json

**Files:**
- Modify: `package.json`

**Текущий package.json** (поля name/version/description/scripts/dependencies — без изменений):

```json
{
  "name": "agentctl",
  "version": "0.1.0",
  "description": "Sub-agent control plane for Claude Code",
  ...
}
```

- [ ] **Step 1: Добавить поля `license`, `repository`, `bugs`, `homepage`, `engines` в package.json**

Добавить сразу после поля `"description"`:

```json
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/IliasAlmerekov/agentctl.git"
  },
  "bugs": {
    "url": "https://github.com/IliasAlmerekov/agentctl/issues"
  },
  "homepage": "https://github.com/IliasAlmerekov/agentctl#readme",
  "engines": {
    "bun": ">=1.1.0"
  },
```

`engines.bun` отражает development requirement (users получают compiled binaries без Bun). Версия `>=1.1.0` соответствует `bun build --compile` с cross-platform targets.

- [ ] **Step 2: Убедиться, что JSON валиден**

```bash
bun -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8')); console.log('JSON valid')"
```

Ожидается: `JSON valid`

- [ ] **Step 3: Убедиться, что typecheck не сломался**

```bash
bun run typecheck
```

Ожидается: exit code 0, без ошибок

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add public repository metadata to package.json"
```

---

## Task 3: Убрать TODO.md из tracked файлов

**Files:**
- Modify: `.gitignore`
- Remove from tracking: `TODO.md`

`TODO.md` — internal launch checklist с unchecked items ("Confirm install URL returns 200", "Fresh machine can install without Bun"). При public switch он создаёт ложное впечатление что базовый install не работает. Docs/roadmap/ полностью заменяет его как public planning artifact.

- [ ] **Step 1: Добавить TODO.md в .gitignore**

Открыть `.gitignore` и добавить в конец:

```
TODO.md
```

- [ ] **Step 2: Убрать TODO.md из git tracking (файл остаётся локально)**

```bash
git rm --cached TODO.md
```

Ожидается:
```
rm 'TODO.md'
```

- [ ] **Step 3: Убедиться, что git больше не отслеживает TODO.md**

```bash
git ls-files TODO.md
```

Ожидается: пустой вывод (файл не tracked)

- [ ] **Step 4: Убедиться, что локальный файл остался**

```bash
test -f TODO.md && echo "file exists locally" || echo "file deleted"
```

Ожидается: `file exists locally`

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore: remove internal launch checklist from public tracking"
```

---

## Task 4: Обновить статус Phase 01 в ROADMAP.md

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Отметить Phase 01 как In Progress / Done в Phase Summary таблице**

В таблице `## Phase Summary` найти строку:
```
| 01 Public repository readiness | P0 | Not started | Блокирует переключение репозитория из private в public. |
```

Заменить на:
```
| 01 Public repository readiness | P0 | Done | Блокирует переключение репозитория из private в public. |
```

- [ ] **Step 2: Отметить P0 release gate по LICENSE как выполненный**

В разделе `## Release Gates` найти:
```
- [ ] P0 / Not started — `LICENSE` и public package metadata присутствуют и проверены.
```

Заменить на:
```
- [x] P0 / Done — `LICENSE` и public package metadata присутствуют и проверены.
```

- [ ] **Step 3: Проверить drift check**

```bash
bun run check:public-doc-drift
```

Ожидается: `Public docs drift check passed`

- [ ] **Step 4: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: mark phase 01 public repository readiness complete"
```

---

## Task 5: Финальная верификация

- [ ] **Step 1: Запустить все verification commands из roadmap**

```bash
git ls-files LICENSE package.json README.md CHANGELOG.md
```

Ожидается: все 4 файла в выводе, `LICENSE` присутствует

- [ ] **Step 2: Проверить package.json содержит все required поля**

```bash
bun -e "const p = JSON.parse(require('fs').readFileSync('package.json','utf8')); ['license','repository','bugs','homepage','engines'].forEach(f => { if (!p[f]) throw new Error('Missing: '+f); }); console.log('All fields present')"
```

Ожидается: `All fields present`

- [ ] **Step 3: Secret/private marker scan**

```bash
rg -n "(ghp_|github_pat_|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|EC|PRIVATE) KEY)" README.md docs src scripts install.sh package.json LICENSE .github -S 2>/dev/null; echo "exit: $?"
```

Ожидается: только `exit: 1` (rg возвращает 1 когда ничего не найдено) или пустой вывод

- [ ] **Step 4: Проверить что TODO.md не в tracked файлах**

```bash
git ls-files TODO.md
```

Ожидается: пустой вывод

- [ ] **Step 5: Финальный drift check**

```bash
bun run check:public-doc-drift
```

Ожидается: `Public docs drift check passed`

- [ ] **Step 6: Typecheck**

```bash
bun run typecheck
```

Ожидается: exit code 0

---

## Acceptance Criteria Check

По условиям из `docs/roadmap/01-public-repository-readiness.md`:

| Критерий | Как проверить |
|----------|--------------|
| `LICENSE` присутствует в repository root | `git ls-files LICENSE` |
| `package.json` содержит public-ready metadata | Step 2 Task 5 |
| Public docs не содержат unchecked launch checklist | TODO.md убран из tracking (Task 3) |
| Secret scan чист | Step 3 Task 5 |
| `bun run check:public-doc-drift` проходит | Step 5 Task 5 |
