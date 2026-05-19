const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const inPath = path.join('azuredevops', 'backlog.json');
if (!fs.existsSync(inPath)) {
  console.error('Input file not found:', inPath);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(inPath, 'utf8'));

function sanitizeName(name) {
  return name.replace(/[\\/:*?"<>|\\s]+/g, '_').replace(/^_+|_+$/g, '') || 'unspecified';
}

const groups = {};
for (const item of raw) {
  const sprint = item.iterationPath || 'unspecified';
  if (!groups[sprint]) groups[sprint] = [];
  groups[sprint].push(item);
}

const outDir = path.join('azuredevops', 'sprints');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const workbook = xlsx.utils.book_new();

for (const [sprint, items] of Object.entries(groups)) {
  const name = sanitizeName(sprint);
  const jsonPath = path.join(outDir, `${name}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(items, null, 2));

  const headers = ['id','title','description','acceptanceCriteria','iterationPath','state','assignedTo','workItemType'];

  // Add sheet to workbook
  const sheet = xlsx.utils.json_to_sheet(items, { header: headers });
  xlsx.utils.book_append_sheet(workbook, sheet, name.substring(0, 31));
}

const outXlsx = path.join('azuredevops', 'backlog_sprints.xlsx');
xlsx.writeFile(workbook, outXlsx);

console.log('Wrote', Object.keys(groups).length, 'sprints to', outDir, 'and', outXlsx);
