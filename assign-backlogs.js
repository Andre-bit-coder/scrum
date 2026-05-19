const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const inPath = path.join('azuredevops', 'backlog.json');
if (!fs.existsSync(inPath)) {
  console.error('Input file not found:', inPath);
  process.exit(1);
}

const people = [
  'Andre Huang',
  'Mirac Topbas',
  'Emre Kayalık',
  'Christian Gawriyah'
];

const raw = JSON.parse(fs.readFileSync(inPath, 'utf8'));

// Group by sprint
const groups = {};
for (const item of raw) {
  const sprint = item.iterationPath || 'unspecified';
  if (!groups[sprint]) groups[sprint] = [];
  groups[sprint].push(item);
}

for (const [sprint, items] of Object.entries(groups)) {
  // assign round-robin within each sprint
  for (let i = 0; i < items.length; i++) {
    items[i].assignedTo = people[i % people.length];
  }
}

// Flatten back
const out = Object.values(groups).flat();
// Preserve ordering by id appearance in original file
out.sort((a,b) => a.id - b.id);

fs.writeFileSync(inPath, JSON.stringify(out, null, 2));
console.log('Updated', out.length, 'work items with assignments in', inPath);

// Regenerate sprint exports (overwrites per-sprint JSON and XLSX)
try {
  execSync('node create-sprint-exports.js', { stdio: 'inherit' });
  console.log('Regenerated sprint exports.');
} catch (err) {
  console.error('Failed to regenerate exports:', err.message);
  process.exit(2);
}
