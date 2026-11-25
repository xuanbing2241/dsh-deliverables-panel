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

- [x] GitHub 仓库已创建并发布（public）：https://github.com/xuanbing2241/dsh-deliverables-panel
- [x] README / LICENSE / icon / assets 齐全，`dsh-plugin` topic 已打
- [x] npm 已发布：`dsh-deliverables-panel@1.0.0`（tarball sha1 `53d104d1ff597daa838db37c8331c39f5a5f11fc`，
      13 个文件，`npm install` 实测可装）
- [ ] 仓库创建满 24 小时（2026-11-25T12:08Z 创建 → 2026-11-26T12:08Z 之后才能过 CI）
- [ ] 跑 `pwsh -File submission/open-pr.ps1 -Token <github-pat>`（fork → 建分支 → 提交条目 → 开 PR，全程走 api.github.com）
- [ ] 合并后到 [awesome-dsh-plugin.com](https://awesome-dsh-plugin.com) 搜一次，
      市场（dsh-market / DSH 原生 Discover）会随下次刷新自动收录

## 本机网络的一个坑（2026-11-25 实测）

这台机器 **`github.com:443` 被拦**（Connection reset / 端口超时），但 `api.github.com`、
`raw.githubusercontent.com`、`registry.npmjs.org` 都通。所以：

- `git push` / `gh` 用不了 → 仓库内容是用 **GitHub Git Data API**（contents 初始化 → blobs → tree → commit → ref）推上去的；
- 因此**本地 `.git` 的提交 SHA 与远端不同**（文件内容一致）。网络恢复后建议重新 `git clone` 一份工作副本，别在原地 `git push`；
- 同理 `dsh plugin add github:xuanbing2241/dsh-deliverables-panel` 在本机装不了（pnpm 要连 github.com），本机请走 npm 或本地目录安装。