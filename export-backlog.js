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

const authHeader = {
  Authorization: 'Basic ' + Buffer.from(':' + pat).toString('base64'),
};

async function run() {
  // WIQL: get backlog item ids (common backlog-like work item types)
  const teamProject = project; // use decoded project name in WIQL
  const wiql = {
    query: `SELECT [System.Id] FROM WorkItems WHERE ([System.WorkItemType] = 'Product Backlog Item' OR [System.WorkItemType] = 'User Story' OR [System.WorkItemType] = 'Backlog Item') AND [System.TeamProject] = '${teamProject}' ORDER BY [System.ChangedDate] DESC`
  };

  const wiqlUrl = `${baseUrl}/_apis/wit/wiql?api-version=${apiVersion}`;
  const wiqlResp = await axios.post(wiqlUrl, wiql, { headers: { 'Content-Type': 'application/json', ...authHeader } });

  const workItems = wiqlResp.data.workItems || [];
  if (workItems.length === 0) {
    console.log('No backlog work items found.');
    fs.writeFileSync('backlog.json', JSON.stringify([], null, 2));
    return;
  }

  const ids = workItems.map(w => w.id);

  // Azure DevOps limits batch GETs — chunk to 200
  const chunkSize = 200;
  const fieldList = [
    'System.Id',
    'System.Title',
    'System.Description',
    'Microsoft.VSTS.Common.AcceptanceCriteria',
    'System.IterationPath',
    'System.State',
    'System.AssignedTo'
  ].join(',');

  const chunks = [];
  for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));

  const items = [];
  for (const c of chunks) {
    const url = `${baseUrl}/_apis/wit/workitems?ids=${c.join(',')}&fields=${encodeURIComponent(fieldList)}&api-version=${apiVersion}`;
    const resp = await axios.get(url, { headers: authHeader });
    for (const wi of resp.data.value || []) {
      const f = wi.fields || {};
      items.push({
        id: wi.id,
        title: f['System.Title'] || '',
        description: f['System.Description'] || '',
        acceptanceCriteria: f['Microsoft.VSTS.Common.AcceptanceCriteria'] || '',
        iterationPath: f['System.IterationPath'] || '',
        state: f['System.State'] || '',
        assignedTo: f['System.AssignedTo'] ? f['System.AssignedTo'].displayName || f['System.AssignedTo'].uniqueName || '' : '',
        workItemType: f['System.WorkItemType'] || ''
      });
    }
  }

  const outDir = 'azuredevops';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const outPath = `${outDir}/backlog.json`;
  fs.writeFileSync(outPath, JSON.stringify(items, null, 2));
  console.log(`Wrote ${items.length} items to ${outPath}`);
}

run().catch(err => {
  console.error('Error fetching backlog:', err.response && err.response.data ? err.response.data : err.message);
  process.exit(2);
});
