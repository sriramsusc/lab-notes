# Lab Notes

A shared tracker for the papers we're reading and the tasks we owe each other.

**Site:** https://sriramsusc.github.io/lab-notes

Everything on the site is generated from markdown files in this repo. You should
almost never need to edit those files by hand — you fill in a form, and a bot
writes the file for you.

---

## Using it

Four forms, reachable from the buttons on the site or from **Issues → New issue**:

| Form | What it does |
| --- | --- |
| 📄 Add a paper | Creates `_papers/<slug>.md` with status `to-read` |
| ✍️ Submit a paper summary | Fills in that paper's page and flips it to `summarized` |
| ✅ Add a task | Creates `_tasks/<slug>.md` with status `open` |
| 🏁 Complete a task | Appends a completion report and flips it to `done` |

Submit the form and the bot takes it from there: it writes the file, commits it,
comments with a link to the new page, and closes the issue. The site rebuilds
within a minute or two.

The **Summarize** and **Complete** buttons on the site prefill the paper/task ID,
so use those rather than typing IDs yourself.

### When a submission gets bounced

Summaries and completion reports have to be substantial. If yours isn't, the bot
comments on the issue naming the sections that are too thin and leaves it open.
**Edit the issue** — don't open a new one — and the check re-runs automatically.

The thresholds live at the top of [`.github/scripts/intake.js`](.github/scripts/intake.js):

```js
const MIN_SECTION_CHARS       = 80;   // each required prose box
const MIN_PAPER_SUMMARY_TOTAL = 600;  // all required summary boxes together
const MIN_TASK_REPORT_TOTAL   = 500;  // all required completion boxes together
```

Change them if they turn out to be annoying or too lax.

### Revising something already filed

Submit the same form again — a second summary for a paper replaces the first, and
a second completion report replaces the earlier one rather than stacking. For small
corrections, use the **Edit file directly** link at the bottom of any page.

---

## Who can submit

Only the repo owner and collaborators. The bot checks the submitter's
`author_association` and refuses anything else, which matters because this repo is
public and anyone can open an issue.

**To add your professor:** Settings → Collaborators → Add people, then have them
accept the invite. Also update:

- [`_data/people.yml`](_data/people.yml) — replace the `CHANGE-ME` GitHub username
- The `Assigned to` / `Who wrote this summary` dropdowns in
  [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/) — these are hardcoded lists

---

## Repo layout

```
_papers/            one markdown file per paper
_tasks/             one markdown file per task
_layouts/           page templates (default, paper, task)
_includes/          small reusable snippets
_data/people.yml    who can be assigned things
assets/css/         the entire stylesheet, hand-written, no framework
index.html          dashboard
papers.html         filterable paper list
tasks.html          the shared checklist
.github/ISSUE_TEMPLATE/   the four intake forms
.github/scripts/intake.js the bot that turns a form into a file
.github/workflows/  intake.yml (the bot) and pages.yml (the build)
```

### Front matter reference

Papers:

```yaml
uid:            attention-is-all-you-need   # stable id, used in URLs and forms
title:          "Attention Is All You Need"
authors:        "Vaswani et al."
year:           "2017"
venue:          "NeurIPS"
link:           "https://arxiv.org/abs/1706.03762"
doi:            "10.48550/arXiv.1706.03762"
status:         to-read | reading | summarized
assigned_to:    "Sriram"
priority:       High | Medium | Low
tags:           ["transformers", "attention"]
why:            |-  (block text — why we're reading it)
added:          2026-08-01
added_by:       sriramsusc
summarized_on:  2026-08-05
summarized_by:  "Sriram"
relevance:      "Core — we should build on this"
```

Tasks:

```yaml
uid:          reproduce-table-2
title:        "Reproduce Table 2 on our dataset"
status:       open | in-progress | blocked | done
assigned_to:  "Sriram"
priority:     High | Medium | Low
due:          2026-09-01
paper:        deep-residual-learning   # optional link to a paper page
tags:         ["experiments"]
created:      2026-08-07
created_by:   sriramsusc
completed_on: 2026-08-20
completed_by: "Sriram"
outcome:      "One-line headline shown on the checklist"
time_spent:   "~6 hours"
```

`status: reading`, `in-progress` and `blocked` aren't offered by the forms — set
them by editing a file when you want them.

---

## Running the site locally

```bash
bundle install
bundle exec jekyll serve --livereload
```

Then open http://localhost:4000/lab-notes/ (the `/lab-notes/` path matters —
it's the `baseurl` in `_config.yml`).

### Debugging the intake bot

Save a submitted issue body to a file and run the script against it:

```bash
ISSUE_BODY="$(cat body.md)" \
ISSUE_LABELS='["intake","paper","new-paper"]' \
ISSUE_NUMBER=99 ISSUE_USER=sriramsusc AUTHOR_ASSOCIATION=OWNER \
node .github/scripts/intake.js
```

It prints the outputs it would hand the workflow, and writes the file for real —
so run it on a scratch branch.

**One gotcha:** the script matches form fields by their **label text**, not their
id. If you reword a label in a template, update the matching `field(f, '...')`
string in `intake.js` or that field will silently come through empty.

---

## First-time setup

All of this is already done on this repo. It's recorded here because if you ever
recreate the repo from scratch, missing any of it breaks the bot.

1. Settings → Pages → Source: **GitHub Actions**
2. Settings → Actions → General → Workflow permissions: **Read and write**
3. **Create the labels** (see below)
4. Push to `main` — the site builds and deploys itself

### The labels are load-bearing

GitHub does **not** create labels that an issue form references — if a label
doesn't already exist in the repo, the form applies nothing. The intake workflow
triggers on the `intake` label, so with the labels missing every submission would
sit there and nothing would happen, with no error anywhere. Recreate them with:

```bash
gh label create intake     --color 0e8a16 --description "Submitted through a form; the intake bot handles it"
gh label create paper      --color 1d76db --description "Relates to a paper"
gh label create task       --color 5319e7 --description "Relates to a task"
gh label create new-paper  --color c2e0c6 --description "Adds a paper to the reading list"
gh label create summary    --color bfd4f2 --description "Submits a paper summary"
gh label create new-task   --color d4c5f9 --description "Adds a task to the checklist"
gh label create completed  --color 0e8a16 --description "Submits a task completion report"
gh label create needs-work --color d93f0b --description "Bounced back by the intake bot; edit the issue to fix"
```

The same applies if you add a new form: any label in its `labels:` list has to
exist first.

---

## Removing the example content

Two papers and two tasks ship as examples so the layouts render something. Delete
them once you have real entries:

```bash
rm _papers/attention-is-all-you-need.md _papers/deep-residual-learning.md
rm _tasks/set-up-the-lab-notes-site.md _tasks/read-and-summarize-resnet-paper.md
```
