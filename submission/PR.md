# 提交到 awesome-dsh-plugin 的 PR 文本

## 标题

```
Add xuanbing2241/dsh-deliverables-panel
```

## 正文

```markdown
Adds `xuanbing2241/dsh-deliverables-panel` — a right-Sidebar panel that lists one
Session's deliverables and filters out the working files.

- **Entry file**: `data/plugins/xuanbing2241__dsh-deliverables-panel.yml`
- **Category**: `ui` — it contributes a right-Sidebar tab type plus a start-page card.
- **Manifest**: `package.json` declares `dsh.bundle` (`./cordis.patch.yml`) and
  `dsh.client` (`platform: web`); the patch inserts one row, `deliverables-panel`.
- **What it does**: reads the Session log on the Host (an authenticated
  `GET /api/deliverables-panel.list` route), folds the `present` declarations and
  the successful `write` / `edit` / `str_replace_editor` targets, and lists them
  in the right Sidebar. Process files, temporary files, lock/log/backup names and
  executable script types are filtered out; a filtered count is shown in the panel
  footer, never the filtered paths.
- **Tested on**: DSH `0.2.2-rc.5` (Desktop), Windows 11 — the entry has no
  `engines.dsh`, so the compatibility column stays unknown rather than claiming a
  range I did not test.
- **Repo**: created today with a `dsh-plugin` topic; resubmitting after the 1-day
  check if the CI rejects this PR.
```

## 提交前自检

- [ ] GitHub 仓库已创建并 push（public），README/LICENSE/icon 齐全
- [ ] 仓库打好 `dsh-plugin` topic
- [ ] 仓库创建满 24 小时（CI 自动校验；不满则次日重提，不影响后续）
- [ ] fork 目标仓库 → 加 `data/plugins/xuanbing2241__dsh-deliverables-panel.yml` →
      开 PR（只改这一个文件，不要动两个 README，它们是生成物）
- [ ] 合并后到 [awesome-dsh-plugin.com](https://awesome-dsh-plugin.com) 搜一次，
      市场（dsh-market / DSH 原生 Discover）会随下次刷新自动收录