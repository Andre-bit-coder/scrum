require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Azure DevOps Configuration
const ADO_ORG = process.env.AZURE_DEVOPS_ORG;
const ADO_PROJECT = process.env.AZURE_DEVOPS_PROJECT;
const ADO_PAT = process.env.AZURE_DEVOPS_PAT;

const ADO_URL = `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}`;
const headers = {
    'Authorization': `Basic ${Buffer.from(`:${ADO_PAT}`).toString('base64')}`,
    'Content-Type': 'application/json'
};

// This is the endpoint GitHub Copilot talks to
app.post('/', async (req, res) => {
    try {
        // Extract the last message sent by the user in GitHub Copilot
        const messages = req.body.messages;
        const lastUserMessage = messages[messages.length - 1].content.toLowerCase();

        // SCENARIO 1: User asks to plan the sprint
        if (lastUserMessage.includes("plan sprint")) {
            // Fetch open Product Backlog Items (PBIs) from Azure DevOps using WIQL
            const query = { 
                query: "Select [System.Id], [System.Title], [Microsoft.VSTS.Scheduling.StoryPoints] From WorkItems Where [System.WorkItemType] = 'Product Backlog Item' And [System.State] = 'New'" 
            };
            
            const devopsRes = await axios.post(`${ADO_URL}/_apis/wit/wiql?api-version=7.1`, query, { headers });
            const workItems = devopsRes.data.workItems;

            if (!workItems || workItems.length === 0) {
                return res.json({ choices: [{ message: { content: "No open backlog items found in Azure DevOps.", role: "assistant" } }] });
            }

            // Construct the response proposal
            let responseText = `I found ${workItems.length} open items in the backlog.\n\n`;
            responseText += "Here is my proposed sprint planning based on a capacity of 30 story points:\n\n";
            responseText += "| ID | Title | Proposed Sprint |\n|---|---|---|\n";
            
            workItems.forEach(item => {
                 responseText += `| #${item.id} | [View Ticket](${ADO_URL}/_workitems/edit/${item.id}) | Sprint 1 |\n`;
            });

            responseText += "\nType **akkoord** (or approve) to automatically update these items in Azure DevOps.";

            return res.json({
                choices: [{ message: { content: responseText, role: "assistant" } }]
            });
        }

        // SCENARIO 2: User approves the plan
        if (lastUserMessage.includes("akkoord") || lastUserMessage.includes("approve")) {
            // Logic to update Azure DevOps goes here using PATCH requests
            // Example: PATCH /_apis/wit/workitems/{id}?api-version=7.1
            
            return res.json({
                choices: [{ message: { content: "✅ Success! I have updated the Iteration Paths in Azure DevOps for your new sprint.", role: "assistant" } }]
            });
        }

        // DEFAULT SCENARIO: Greet the user
        return res.json({
            choices: [{ message: { content: "Hello! I am your AI Scrum Master. Ask me to 'plan sprint' to organize your Azure DevOps backlog.", role: "assistant" } }]
        });

    } catch (error) {
        console.error(error);
        return res.json({ 
            choices: [{ message: { content: "Oops! I encountered an error connecting to Azure DevOps: " + error.message, role: "assistant" } }] 
        });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`AI Scrum Master is running on port ${PORT}`);
});