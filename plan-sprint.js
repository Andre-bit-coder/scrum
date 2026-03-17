require('dotenv').config();
const axios = require('axios');

const ADO_ORG = process.env.AZURE_DEVOPS_ORG;
const ADO_PROJECT = process.env.AZURE_DEVOPS_PROJECT;
const ADO_PAT = process.env.AZURE_DEVOPS_PAT;
const ADO_URL = `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}`;
const EXACTE_PROJECT_NAAM = "Daily Grind"; 

const headers = { 'Authorization': `Basic ${Buffer.from(`:${ADO_PAT}`).toString('base64')}`, 'Content-Type': 'application/json' };
const patchHeaders = { 'Authorization': `Basic ${Buffer.from(`:${ADO_PAT}`).toString('base64')}`, 'Content-Type': 'application/json-patch+json' };

async function startScrumMaster() {
    console.log("🚀 AI Scrum Master: Stories plannen, Punten toewijzen & Taken genereren...\n");

    try {
        // 1. Haal alle openstaande User Stories / PBIs op
        const query = { query: `Select [System.Id] From WorkItems Where [System.WorkItemType] IN ('Product Backlog Item', 'User Story') And [System.State] IN ('New', 'To Do') ORDER BY [Microsoft.VSTS.Common.Priority] ASC` };
        const response = await axios.post(`${ADO_URL}/_apis/wit/wiql?api-version=7.1`, query, { headers });
        const workItems = response.data.workItems;

        if (!workItems || workItems.length === 0) return console.log("🤷‍♂️ Geen tickets gevonden.");

        const ids = workItems.map(item => item.id).join(',');
        const detailsResponse = await axios.get(`${ADO_URL}/_apis/wit/workitems?ids=${ids}&fields=System.Id,System.Title&api-version=7.1`, { headers });
        const fullTickets = detailsResponse.data.value;
        const ticketsPerSprint = Math.ceil(fullTickets.length / 3);

        for (let i = 0; i < fullTickets.length; i++) {
            const ticket = fullTickets[i];
            let iterNum = Math.floor(i / ticketsPerSprint) + 1;
            if (iterNum > 3) iterNum = 3; 
            const targetIteration = `${EXACTE_PROJECT_NAAM}\\Iteration ${iterNum}`;
            
            // 2. STORY POINTS UPDATEN
            // We geven een realistische schatting (1, 2, 3, 5 of 8)
            const storyPoints = [1, 2, 3, 5, 8][Math.floor(Math.random() * 5)];

            const patchStory = [
                { "op": "add", "path": "/fields/System.IterationPath", "value": targetIteration },
                { "op": "add", "path": "/fields/Microsoft.VSTS.Scheduling.StoryPoints", "value": storyPoints }
            ];

            await axios.patch(`${ADO_URL}/_apis/wit/workitems/${ticket.id}?api-version=7.1`, patchStory, { headers: patchHeaders });
            console.log(`✅ [#${ticket.id}] Gepland in ${targetIteration} (${storyPoints} pts)`);

            // 3. DRIE SUBTAKEN AANMAKEN
            const taken = ["🎨 Frontend interface bouwen", "⚙️ Backend logica & API", "🧪 Testen & Acceptatie"];

            for (const taakTitel of taken) {
                const taskData = [
                    { "op": "add", "path": "/fields/System.Title", "value": `${taakTitel} voor #${ticket.id}` },
                    { "op": "add", "path": "/fields/System.IterationPath", "value": targetIteration },
                    { "op": "add", "path": "/relations/-", "value": {
                        "rel": "System.LinkTypes.Hierarchy-Reverse", 
                        "url": `${ADO_URL}/_apis/wit/workitems/${ticket.id}`
                    }}
                ];

                await axios.post(`${ADO_URL}/_apis/wit/workitems/$Task?api-version=7.1`, taskData, { headers: patchHeaders });
            }
            console.log(`   └─ 3 taken aangemaakt en gekoppeld.`);
        }

        console.log("\n🎉 ALLES GEREED! Je bord is nu gevuld met Stories en Taken.");
        console.log("Check je Burndown Chart in Azure DevOps om de voortgang te zien.");

    } catch (error) {
        console.error("❌ Fout opgetreden:", error.response ? JSON.stringify(error.response.data) : error.message);
    }
}

startScrumMaster();