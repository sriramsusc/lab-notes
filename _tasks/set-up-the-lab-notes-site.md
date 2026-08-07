---
uid: "set-up-the-lab-notes-site"
title: "Set up the Lab Notes site and intake workflow"
status: done
assigned_to: "Sriram"
priority: "High"
created: 2026-08-07
created_by: sriramsusc
completed_on: 2026-08-07
completed_by: "Sriram"
outcome: "Site, issue forms, and the intake bot are live; adding a paper or task no longer means touching the repo by hand."
time_spent: "~2 hours"
tags: ["infrastructure"]
---

## What needs to be done

Stand up a shared place to track what we are reading and what we owe each other,
without either of us having to learn Jekyll or edit YAML to add an entry.

## Definition of done

- Papers and tasks each have their own page on a public site
- New entries can be added through a form, not a text editor
- Completing a task forces a written record of what was done
- Everything is stored as plain files in a git repo we control

<!-- completion-report:start -->
## Completion report

_Filed by Sriram on 2026-08-07._

**Site, issue forms, and the intake bot are live; adding a paper or task no longer means touching the repo by hand.**

### What you did

Built a Jekyll site with two collections, `_papers` and `_tasks`, each rendering to
its own page with metadata in the front matter. Added four GitHub issue forms
covering the four things we actually do: add a paper, summarize a paper, add a
task, complete a task. Wrote an intake workflow that parses a submitted form,
checks it, writes the corresponding markdown file, commits it, and closes the
issue. Seeded the repo with two example papers and this task so the layouts had
something real to render.

### How you did it

The site is plain Jekyll 4 with no theme gem and no plugins, so there is nothing
to keep up to date — `_layouts/`, `_includes/` and one hand-written stylesheet.
Deployment goes through `.github/workflows/pages.yml` using the official Pages
actions rather than the legacy branch-based build, which means we are not
restricted to the `github-pages` gem's plugin allowlist.

The intake bot is `.github/scripts/intake.js`: dependency-free Node that parses
the `### Label` blocks GitHub renders from an issue form, and dispatches on the
issue's labels. Access control is the `author_association` field — anything other
than owner, collaborator or member gets a polite refusal, which matters because
the repo is public and anyone can open an issue.

### Results and evidence

All four forms round-trip end to end: submitting one produces a committed file
and a closed issue with a link to the new page. Rejections work as intended — a
deliberately thin summary came back with a comment naming the short sections, and
editing the issue re-ran the check and filed it.

### Problems hit and how we got around them

Front matter is rewritten with targeted key replacement rather than a YAML
round-trip, so hand-edits to a file survive the bot touching it later. Resubmitted
summaries and completion reports replace the previous version instead of stacking
— the report is fenced with HTML comment markers the script looks for.

### What this unblocks, and what's left

We can start using it immediately. Still open: the assignee dropdowns in the four
form templates are hardcoded, so they need editing when someone joins.
<!-- completion-report:end -->
