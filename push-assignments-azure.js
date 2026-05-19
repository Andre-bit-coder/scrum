const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const org = process.env.AZURE_DEVOPS_ORG;
const projectRaw = process.env.AZURE_DEVOPS_PROJECT || '';
const project = decodeURIComponent(projectRaw);
const pat = process.env.AZURE_DEVOPS_PAT;

if (!org || !project || !pat) {
  console.error('Missing AZURE_DEVOPS_ORG, AZURE_DEVOPS_PROJECT, or AZURE_DEVOPS_PAT in .env');
  process.exit(1);
}

const baseUrl = `https://dev.azure.com/${org}/${encodeURIComponent(project)}`;
const apiVersion = '7.0';

const authHeader = 'Basic ' + Buffer.from(':' + pat).toString('base64');

const inPath = 'azuredevops/backlog.json';
if (!fs.existsSync(inPath)) {
  console.error('Input file not found:', inPath);
  process.exit(1);
}

const items = JSON.parse(fs.readFileSync(inPath, 'utf8'));

async function updateAssignment(item) {
  if (!item.assignedTo || item.assignedTo === '') return { id: item.id, status: 'skipped' };

  const url = `${baseUrl}/_apis/wit/workitems/${item.id}?api-version=${apiVersion}`;
  const patch = [
    { op: 'add', path: '/fields/System.AssignedTo', value: item.assignedTo }
  ];

  try {
    const resp = await axios.patch(url, patch, {
      headers: {
        'Content-Type': 'application/json-patch+json',
        Authorization: authHeader
      }
    });
    return { id: item.id, status: 'updated' };
  } catch (err) {
    const msg = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
    return { id: item.id, status: 'error', error: msg };
  }
}

(async () => {
  const results = [];
  for (const it of items) {
    // only update items in sprints 1-3
    if (!it.iterationPath) continue;
    if (!it.iterationPath.includes('Iteration 1') && !it.iterationPath.includes('Iteration 2') && !it.iterationPath.includes('Iteration 3')) continue;
    // perform update
    // slight delay to avoid rate issues
    // eslint-disable-next-line no-await-in-loop
    const res = await updateAssignment(it);
    results.push(res);
  }

  const updated = results.filter(r => r.status === 'updated').length;
  const skipped = items.length - results.length;
  const errors = results.filter(r => r.status === 'error');

  console.log(`Updated ${updated} items; skipped ${skipped}; errors ${errors.length}`);
  if (errors.length) console.error('Errors:', errors);
})();
