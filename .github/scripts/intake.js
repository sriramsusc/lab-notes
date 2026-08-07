#!/usr/bin/env node
/*
 * Turns a submitted issue form into a markdown file in _papers/ or _tasks/.
 *
 * Reads the issue from the environment, decides what to do from the issue's
 * labels, and either writes a file (status=ok) or explains what is wrong
 * (status=reject). It never talks to the GitHub API — the workflow handles
 * commenting, committing and closing based on the outputs written here.
 *
 * Run it locally against a saved issue body to debug:
 *   ISSUE_BODY="$(cat body.md)" ISSUE_LABELS='["intake","paper","new-paper"]' \
 *   ISSUE_NUMBER=1 ISSUE_USER=me AUTHOR_ASSOCIATION=OWNER node .github/scripts/intake.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ *
 * Tunables. Raise these if summaries are still coming in too thin.
 * ------------------------------------------------------------------ */

const MIN_SECTION_CHARS      = 80;   // every required prose box, individually
const MIN_PAPER_SUMMARY_TOTAL = 600; // all required summary boxes together
const MIN_TASK_REPORT_TOTAL   = 500; // all required completion boxes together

const PAPERS_DIR = '_papers';
const TASKS_DIR  = '_tasks';

const ALLOWED_ASSOCIATIONS = ['OWNER', 'COLLABORATOR', 'MEMBER'];

/* ------------------------------------------------------------------ *
 * Issue-form parsing
 * ------------------------------------------------------------------ */

// GitHub renders a submitted form as "### Label\n\nvalue" blocks, with
// untouched optional fields rendered as "_No response_".
function parseIssueForm(body) {
  const fields = {};
  const text = String(body || '').replace(/\r\n/g, '\n');
  const blocks = text.split(/\n?^###[ \t]+/m);

  for (const block of blocks) {
    if (!block.trim()) continue;
    const nl = block.indexOf('\n');
    const label = (nl === -1 ? block : block.slice(0, nl)).trim();
    let value = nl === -1 ? '' : block.slice(nl + 1).trim();
    if (value === '_No response_' || value === '_No response_.') value = '';
    if (label) fields[label] = value;
  }
  return fields;
}

function field(fields, label) {
  return (fields[label] || '').trim();
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function slugify(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/g, '');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Quoted YAML scalar, safe for arbitrary single-line text.
function yq(value) {
  return '"' + String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .trim() + '"';
}

// Literal block scalar, for prose that may span lines.
function yblock(key, text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  return key + ': |-\n' + lines.map((l) => '  ' + l).join('\n');
}

function yList(items) {
  if (!items.length) return null;
  return '[' + items.map(yq).join(', ') + ']';
}

function splitTags(raw) {
  return String(raw || '')
    .split(/[,\n]/)
    .map((t) => t.trim().replace(/^#/, ''))
    .filter(Boolean);
}

// Drops empty values so the front matter stays readable.
function frontMatter(pairs) {
  const lines = [];
  for (const [key, value] of pairs) {
    if (value === null || value === undefined || value === '') continue;
    lines.push(typeof value === 'string' && value.includes('\n') ? value : key + ': ' + value);
  }
  return '---\n' + lines.join('\n') + '\n---\n';
}

function splitDoc(raw) {
  const m = String(raw).match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: '', body: String(raw) };
  return { fm: m[1], body: m[2] };
}

function joinDoc(fm, body) {
  return '---\n' + fm.replace(/\s+$/, '') + '\n---\n\n' + body.replace(/^\s+/, '');
}

// Replaces a scalar key in a front-matter block, appending it if absent.
function setKey(fm, key, value) {
  const line = key + ': ' + value;
  const re = new RegExp('^' + key + ':[ \\t]*.*$', 'm');
  if (re.test(fm)) return fm.replace(re, line);
  return fm.replace(/\s+$/, '') + '\n' + line;
}

function getKey(fm, key) {
  const m = fm.match(new RegExp('^' + key + ':[ \\t]*(.*)$', 'm'));
  if (!m) return '';
  return m[1].trim().replace(/^["'](.*)["']$/, '$1');
}

/* ------------------------------------------------------------------ *
 * Locating an existing paper/task from user-supplied text
 * ------------------------------------------------------------------ */

function listDocs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const file = path.join(dir, f);
      const { fm } = splitDoc(fs.readFileSync(file, 'utf8'));
      return {
        file,
        base: f.replace(/\.md$/, ''),
        uid: getKey(fm, 'uid') || f.replace(/\.md$/, ''),
        title: getKey(fm, 'title'),
      };
    });
}

function findDoc(dir, needle) {
  const docs = listDocs(dir);
  const want = slugify(needle);
  if (!want) return null;

  return docs.find((d) => slugify(d.uid) === want)
      || docs.find((d) => slugify(d.base) === want)
      || docs.find((d) => slugify(d.title) === want)
      || docs.find((d) => slugify(d.title).includes(want) || want.includes(slugify(d.uid)))
      || null;
}

function uniquePath(dir, slug) {
  let candidate = slug;
  let n = 2;
  while (fs.existsSync(path.join(dir, candidate + '.md'))) {
    candidate = slug + '-' + n;
    n += 1;
  }
  return { file: path.join(dir, candidate + '.md'), uid: candidate };
}

function availableList(dir, label) {
  const docs = listDocs(dir);
  if (!docs.length) return 'There are no ' + label + ' in the repo yet.';
  return 'Available ' + label + ':\n\n' + docs
    .slice(0, 40)
    .map((d) => '- `' + d.uid + '` — ' + (d.title || d.base))
    .join('\n');
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

function checkDepth(sections, totalMin) {
  const problems = [];
  let total = 0;

  for (const [label, text] of sections) {
    const len = text.replace(/\s+/g, ' ').trim().length;
    total += len;
    if (len === 0) {
      problems.push('**' + label + '** is empty.');
    } else if (len < MIN_SECTION_CHARS) {
      problems.push('**' + label + '** is only ' + len + ' characters — needs at least ' +
        MIN_SECTION_CHARS + '.');
    }
  }

  if (total < totalMin) {
    problems.push('Taken together the required sections come to ' + total +
      ' characters; this form asks for at least ' + totalMin + '.');
  }
  return problems;
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

function addPaper(f, ctx) {
  const title = field(f, 'Paper title');
  if (!title) return reject('The **Paper title** field was empty, so there is nothing to file.');

  const slug = slugify(title);
  if (!slug) return reject('I could not build a filename from the title `' + title + '`. Try a title with some letters or numbers in it.');

  const { file, uid } = uniquePath(PAPERS_DIR, slug);
  const tags = splitTags(field(f, 'Tags'));
  const assigned = field(f, 'Who is summarizing it');
  const why = field(f, "Why we're reading it");
  const notes = field(f, 'Initial notes');

  const fm = frontMatter([
    ['uid', yq(uid)],
    ['title', yq(title)],
    ['authors', field(f, 'Authors') ? yq(field(f, 'Authors')) : ''],
    ['year', field(f, 'Year') ? yq(field(f, 'Year')) : ''],
    ['venue', field(f, 'Venue') ? yq(field(f, 'Venue')) : ''],
    ['link', field(f, 'Link') ? yq(field(f, 'Link')) : ''],
    ['doi', field(f, 'DOI') ? yq(field(f, 'DOI')) : ''],
    ['status', 'to-read'],
    ['assigned_to', assigned ? yq(assigned) : ''],
    ['priority', field(f, 'Priority') ? yq(field(f, 'Priority')) : ''],
    ['tags', yList(tags) || ''],
    ['why', why ? yblock('why', why) : ''],
    ['added', today()],
    ['added_by', yq(ctx.user)],
    ['issue', String(ctx.number)],
  ]);

  const body = notes
    ? '## Initial notes\n\n' + notes + '\n'
    : '_No summary yet._\n';

  fs.mkdirSync(PAPERS_DIR, { recursive: true });
  fs.writeFileSync(file, fm + '\n' + body, 'utf8');

  return {
    status: 'ok',
    file,
    commit: 'Add paper: ' + title + ' (#' + ctx.number + ')',
    message: 'Added **' + title + '** to the reading list as `' + uid + '`.\n\n' +
      'Page: ' + pageUrl('papers', uid) + '\n' +
      'File: `' + file + '`\n\n' +
      'When you have read it, [submit the summary](' + formUrl('02-paper-summary.yml', 'paper-id', uid) + ').',
  };
}

function paperSummary(f, ctx) {
  const needle = field(f, 'Paper ID');
  const doc = findDoc(PAPERS_DIR, needle);
  if (!doc) {
    return reject('I could not find a paper matching `' + needle + '`.\n\n' +
      availableList(PAPERS_DIR, 'papers') + '\n\n' +
      'Edit this issue with a correct ID and I will try again. ' +
      'If the paper is not on the list yet, [add it first](' + formUrl('01-add-paper.yml') + ').');
  }

  const sections = [
    ['Problem and motivation', field(f, 'Problem and motivation')],
    ['Method', field(f, 'Method')],
    ['Key results', field(f, 'Key results')],
    ['Takeaways for our work', field(f, 'Takeaways for our work')],
  ];

  const problems = checkDepth(sections, MIN_PAPER_SUMMARY_TOTAL);
  if (problems.length) {
    return reject('This summary is not detailed enough to file yet:\n\n' +
      problems.map((p) => '- ' + p).join('\n') + '\n\n' +
      '**Edit this issue** to expand those sections — I re-check on every edit, ' +
      'so there is no need to open a new one.');
  }

  const optional = [
    ['Limitations and open questions', field(f, 'Limitations and open questions')],
    ['Related work and follow-ups', field(f, 'Related work and follow-ups')],
  ].filter(([, text]) => text);

  const raw = fs.readFileSync(doc.file, 'utf8');
  const { fm } = splitDoc(raw);

  let nextFm = fm;
  nextFm = setKey(nextFm, 'status', 'summarized');
  nextFm = setKey(nextFm, 'summarized_on', today());
  nextFm = setKey(nextFm, 'summarized_by', yq(field(f, 'Who wrote this summary') || ctx.user));
  nextFm = setKey(nextFm, 'relevance', yq(field(f, 'How relevant is this to us')));
  nextFm = setKey(nextFm, 'summary_issue', String(ctx.number));

  const body = sections.concat(optional)
    .map(([label, text]) => '## ' + label + '\n\n' + text + '\n')
    .join('\n');

  const title = getKey(fm, 'title') || doc.uid;
  fs.writeFileSync(doc.file, joinDoc(nextFm, body), 'utf8');

  return {
    status: 'ok',
    file: doc.file,
    commit: 'Summarize: ' + title + ' (#' + ctx.number + ')',
    message: 'Filed the summary for **' + title + '** and marked it summarized.\n\n' +
      'Page: ' + pageUrl('papers', doc.uid) + '\n' +
      'File: `' + doc.file + '`\n\n' +
      'Submitting this form again for the same paper replaces the summary.',
  };
}

function addTask(f, ctx) {
  const title = field(f, 'Task');
  if (!title) return reject('The **Task** field was empty, so there is nothing to file.');

  const slug = slugify(title);
  if (!slug) return reject('I could not build a filename from `' + title + '`. Try wording it with some letters or numbers.');

  const { file, uid } = uniquePath(TASKS_DIR, slug);
  const due = field(f, 'Target date');
  const paperRef = field(f, 'Related paper ID');
  const linkedPaper = paperRef ? findDoc(PAPERS_DIR, paperRef) : null;

  const fm = frontMatter([
    ['uid', yq(uid)],
    ['title', yq(title)],
    ['status', 'open'],
    ['assigned_to', field(f, 'Assigned to') ? yq(field(f, 'Assigned to')) : ''],
    ['priority', field(f, 'Priority') ? yq(field(f, 'Priority')) : ''],
    ['due', /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : (due ? yq(due) : '')],
    ['paper', linkedPaper ? yq(linkedPaper.uid) : ''],
    ['tags', yList(splitTags(field(f, 'Tags'))) || ''],
    ['created', today()],
    ['created_by', yq(ctx.user)],
    ['issue', String(ctx.number)],
  ]);

  const body =
    '## What needs to be done\n\n' + field(f, 'What needs to be done') + '\n\n' +
    '## Definition of done\n\n' + field(f, 'Definition of done') + '\n';

  fs.mkdirSync(TASKS_DIR, { recursive: true });
  fs.writeFileSync(file, fm + '\n' + body, 'utf8');

  let note = '';
  if (paperRef && !linkedPaper) {
    note = '\n\n> I could not match the related paper `' + paperRef + '`, so I left that field off. ' +
      'You can add it by editing the file.';
  }

  return {
    status: 'ok',
    file,
    commit: 'Add task: ' + title + ' (#' + ctx.number + ')',
    message: 'Added **' + title + '** to the checklist as `' + uid + '`.\n\n' +
      'Page: ' + pageUrl('tasks', uid) + '\n' +
      'File: `' + file + '`\n\n' +
      'To close it out later, [submit the completion report](' +
      formUrl('04-complete-task.yml', 'task-id', uid) + ').' + note,
  };
}

function completeTask(f, ctx) {
  const needle = field(f, 'Task ID');
  const doc = findDoc(TASKS_DIR, needle);
  if (!doc) {
    return reject('I could not find a task matching `' + needle + '`.\n\n' +
      availableList(TASKS_DIR, 'tasks') + '\n\n' +
      'Edit this issue with a correct ID and I will try again.');
  }

  const sections = [
    ['What you did', field(f, 'What you did')],
    ['How you did it', field(f, 'How you did it')],
    ['Results and evidence', field(f, 'Results and evidence')],
  ];

  const problems = checkDepth(sections, MIN_TASK_REPORT_TOTAL);
  if (!field(f, 'One-line outcome')) {
    problems.push('**One-line outcome** is empty — it is what shows on the checklist.');
  }

  if (problems.length) {
    return reject('This completion report is not detailed enough to close the task:\n\n' +
      problems.map((p) => '- ' + p).join('\n') + '\n\n' +
      'A task page is the only record of what happened here, so it has to stand on its own. ' +
      '**Edit this issue** to expand those sections — I re-check on every edit.');
  }

  const optional = [
    ['Problems hit and how we got around them', field(f, 'Problems hit and how you got around them')],
    ["What this unblocks, and what's left", field(f, "What this unblocks, and what's left")],
  ].filter(([, text]) => text);

  const raw = fs.readFileSync(doc.file, 'utf8');
  const { fm, body } = splitDoc(raw);

  let nextFm = fm;
  nextFm = setKey(nextFm, 'status', 'done');
  nextFm = setKey(nextFm, 'completed_on', today());
  nextFm = setKey(nextFm, 'completed_by', yq(field(f, 'Who did the work') || ctx.user));
  nextFm = setKey(nextFm, 'outcome', yq(field(f, 'One-line outcome')));
  nextFm = setKey(nextFm, 'completion_issue', String(ctx.number));
  if (field(f, 'Rough time spent')) {
    nextFm = setKey(nextFm, 'time_spent', yq(field(f, 'Rough time spent')));
  }

  const report =
    '<!-- completion-report:start -->\n' +
    '## Completion report\n\n' +
    '_Filed by ' + (field(f, 'Who did the work') || ctx.user) + ' on ' + today() +
    ' via [issue #' + ctx.number + '](https://github.com/' + ctx.repo + '/issues/' + ctx.number + ')._\n\n' +
    '**' + field(f, 'One-line outcome') + '**\n\n' +
    sections.concat(optional)
      .map(([label, text]) => '### ' + label + '\n\n' + text + '\n')
      .join('\n') +
    '<!-- completion-report:end -->\n';

  // Replace an earlier report rather than stacking a second one.
  const marker = /<!-- completion-report:start -->[\s\S]*?<!-- completion-report:end -->\n?/;
  const nextBody = marker.test(body)
    ? body.replace(marker, report)
    : body.replace(/\s+$/, '') + '\n\n' + report;

  const title = getKey(fm, 'title') || doc.uid;
  fs.writeFileSync(doc.file, joinDoc(nextFm, nextBody), 'utf8');

  return {
    status: 'ok',
    file: doc.file,
    commit: 'Complete task: ' + title + ' (#' + ctx.number + ')',
    message: 'Marked **' + title + '** done and filed your report.\n\n' +
      'Page: ' + pageUrl('tasks', doc.uid) + '\n' +
      'File: `' + doc.file + '`',
  };
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

function reject(message) {
  return { status: 'reject', message };
}

let CTX = { repo: 'sriramsusc/lab-notes', site: 'https://sriramsusc.github.io/lab-notes' };

function pageUrl(kind, uid) {
  return CTX.site + '/' + kind + '/' + uid + '/';
}

function formUrl(template, fieldId, value) {
  let url = 'https://github.com/' + CTX.repo + '/issues/new?template=' + template;
  if (fieldId && value) url += '&' + fieldId + '=' + encodeURIComponent(value);
  return url;
}

function emit(result) {
  const out = process.env.GITHUB_OUTPUT;
  const payload = [
    'status=' + result.status,
    'file=' + (result.file || ''),
    'commit=' + (result.commit || '').replace(/\n/g, ' '),
    'message<<INTAKE_EOF\n' + (result.message || '') + '\nINTAKE_EOF',
  ].join('\n') + '\n';

  if (out) fs.appendFileSync(out, payload);
  else process.stdout.write(payload);

  console.error('[intake] status=' + result.status + (result.file ? ' file=' + result.file : ''));
}

function main() {
  const labels = JSON.parse(process.env.ISSUE_LABELS || '[]').map((l) => String(l).toLowerCase());
  const association = (process.env.AUTHOR_ASSOCIATION || '').toUpperCase();

  CTX = {
    repo: process.env.GITHUB_REPOSITORY || CTX.repo,
    site: process.env.SITE_URL || CTX.site,
    number: process.env.ISSUE_NUMBER,
    user: process.env.ISSUE_USER || 'unknown',
  };

  if (!ALLOWED_ASSOCIATIONS.includes(association)) {
    return emit(reject(
      "Thanks for the interest, but this tracker only accepts entries from lab members.\n\n" +
      'If you think you should have access, ask @' + CTX.repo.split('/')[0] +
      ' to add you as a collaborator.'
    ));
  }

  const fields = parseIssueForm(process.env.ISSUE_BODY);

  let result;
  if (labels.includes('new-paper')) result = addPaper(fields, CTX);
  else if (labels.includes('summary')) result = paperSummary(fields, CTX);
  else if (labels.includes('new-task')) result = addTask(fields, CTX);
  else if (labels.includes('completed')) result = completeTask(fields, CTX);
  else result = { status: 'skip', message: '' };

  emit(result);
}

main();
