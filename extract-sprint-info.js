require('dotenv').config();
const axios = require('axios');

const ADO_ORG = process.env.AZURE_DEVOPS_ORG;
const ADO_PROJECT = process.env.AZURE_DEVOPS_PROJECT;
const ADO_PAT = process.env.AZURE_DEVOPS_PAT;
const ADO_URL = `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}`;

const headers = { 'Authorization': `Basic ${Buffer.from(`:${ADO_PAT}`).toString('base64')}`, 'Content-Type': 'application/json' };

async function extractSprintInfo() {
    console.log("📊 SPRINT INFORMATION EXTRACTOR\n");
    console.log("=" .repeat(60) + "\n");

    try {
        // 1. GET ALL ITERATIONS (Sprints)
        console.log("🔄 Fetching all sprints...\n");
        const iterationsRes = await axios.get(`${ADO_URL}/_apis/work/teamsettings/iterations?api-version=7.1-preview.1`, { headers });
        const allIterations = iterationsRes.data.value;

        if (!allIterations || allIterations.length === 0) {
            console.log("⚠️  No sprints found.");
            return;
        }

        console.log(`✅ Found ${allIterations.length} sprints\n`);
        
        // Display all iterations with their details
        console.log("ALL SPRINTS:");
        console.log("-".repeat(60));
        
        allIterations.forEach(iter => {
            const start = new Date(iter.attributes.startDate);
            const end = new Date(iter.attributes.finishDate);
            const now = new Date();
            let status = "Upcoming";
            if (now >= start && now <= end) status = "ACTIVE";
            if (now > end) status = "Completed";
            
            console.log(`\n📌 ${iter.name} [${status}]`);
            console.log(`   Start: ${start.toLocaleDateString()}`);
            console.log(`   End: ${end.toLocaleDateString()}`);
            console.log(`   Path: ${iter.path}`);
        });

        const activeIterations = allIterations.filter(i => {
            const start = new Date(i.attributes.startDate);
            const end = new Date(i.attributes.finishDate);
            const now = new Date();
            return now >= start && now <= end;
        });
        
        const upcomingIterations = allIterations.filter(i => {
            const start = new Date(i.attributes.startDate);
            const now = new Date();
            return start > now;
        });

        // 2. GET SPRINT METRICS FOR EACH SPRINT
        for (const iteration of allIterations) {
            console.log("\n" + "=".repeat(60));
            console.log(`\n📈 SPRINT METRICS: ${iteration.name}`);
            console.log("-".repeat(60));

            // Get backlog items for this sprint
            const query = { 
                query: `Select [System.Id], [System.Title], [System.State], [Microsoft.VSTS.Scheduling.StoryPoints], [System.WorkItemType] From WorkItems Where [System.IterationPath] = '${iteration.path}'`
            };

            const itemsRes = await axios.post(`${ADO_URL}/_apis/wit/wiql?api-version=7.1`, query, { headers });
            const sprintItems = itemsRes.data.workItems;

            if (!sprintItems || sprintItems.length === 0) {
                console.log("❌ No items in this sprint");
                continue;
            }

            // Fetch detailed information
            const ids = sprintItems.map(item => item.id).join(',');
            const detailsRes = await axios.get(`${ADO_URL}/_apis/wit/workitems?ids=${ids}&fields=System.Id,System.Title,System.State,System.WorkItemType,Microsoft.VSTS.Scheduling.StoryPoints,System.ChangedDate&api-version=7.1`, { headers });
            const fullItems = detailsRes.data.value;

            // Calculate metrics
            const metrics = {
                totalItems: fullItems.length,
                totalStoryPoints: 0,
                byState: {},
                byType: {},
                completedPoints: 0,
                inProgressPoints: 0,
                toDoPoints: 0
            };

            fullItems.forEach(item => {
                const points = item.fields['Microsoft.VSTS.Scheduling.StoryPoints'] || 0;
                const state = item.fields['System.State'];
                const type = item.fields['System.WorkItemType'];

                metrics.totalStoryPoints += points;

                if (!metrics.byState[state]) metrics.byState[state] = { count: 0, points: 0 };
                metrics.byState[state].count++;
                metrics.byState[state].points += points;

                if (!metrics.byType[type]) metrics.byType[type] = { count: 0, points: 0 };
                metrics.byType[type].count++;
                metrics.byType[type].points += points;

                if (state === 'Done') metrics.completedPoints += points;
                if (state === 'In Progress') metrics.inProgressPoints += points;
                if (state === 'To Do') metrics.toDoPoints += points;
            });

            // Display metrics
            console.log(`\n📊 Sprint Summary:`);
            console.log(`   Total Items: ${metrics.totalItems}`);
            console.log(`   Total Story Points: ${metrics.totalStoryPoints}`);
            console.log(`   ✅ Done: ${metrics.completedPoints} pts`);
            console.log(`   🔄 In Progress: ${metrics.inProgressPoints} pts`);
            console.log(`   📋 To Do: ${metrics.toDoPoints} pts`);
            
            const completionPercent = metrics.totalStoryPoints > 0 ? ((metrics.completedPoints / metrics.totalStoryPoints) * 100).toFixed(1) : 0;
            console.log(`   Progress: ${completionPercent}%`);

            console.log(`\n📊 Items by State:`);
            Object.entries(metrics.byState).forEach(([state, data]) => {
                console.log(`   ${state}: ${data.count} items (${data.points} pts)`);
            });

            console.log(`\n📊 Items by Type:`);
            Object.entries(metrics.byType).forEach(([type, data]) => {
                console.log(`   ${type}: ${data.count} items (${data.points} pts)`);
            });

            // 3. DETAILED SPRINT BACKLOG
            console.log("\n" + "-".repeat(60));
            console.log(`📋 SPRINT BACKLOG: ${iteration.name}`);
            console.log("-".repeat(60));
            console.log("\n| ID | Title | Type | State | Points |");
            console.log("|---|---|---|---|---|");

            fullItems.forEach(item => {
                const title = item.fields['System.Title'].substring(0, 40);
                const type = item.fields['System.WorkItemType'];
                const state = item.fields['System.State'];
                const points = item.fields['Microsoft.VSTS.Scheduling.StoryPoints'] || '-';
                console.log(`| #${item.id} | ${title} | ${type} | ${state} | ${points} |`);
            });
        }

        console.log("\n" + "=".repeat(60));
        console.log("\n✅ Sprint information extracted successfully!");

    } catch (error) {
        console.error("❌ Error:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    }
}

extractSprintInfo();
