// Import file system manager
const fs = require('fs')

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { type } = require('os');

// Add 'readline' to have dynamic input
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

// Javascript tools updated to load data from file
function loadData() {
  if (!fs.existsSync('database.json')) {
    // Create file if it ddoesn't exist
    fs.writeFileSync('database.json', JSON.stringify({}))  }
  const data = fs.readFileSync('database.json');
  return JSON.parse(data);
}

// Call function to save data
function saveData(data) {
fs.writeFileSync('database.json', JSON.stringify(data, null, 2));
}

// Update getUserInfo to get data from file
function getUserInfo(userId) {
  const db = loadData();
  console.log(`\n[SYSTEM] Agent is running getUserInfo for: ${userId}...`);
  return db[userId] || { error: "User not found" };
}

function cancelSubscription(args) {
  const { userId, subscriptionId, reason, confirmCancel } = args;
  
  if (!confirmCancel) 
    return { error: "Cancellation aborted. Confirmation required." };
   
  const db = loadData(); 
   if (db[userId]) {
    db[userId].status = "Cancelled";
    saveData(db);
   
  console.log(`\n[SYSTEM] DATABASE UPDATED: ${userdId} is now Cancelled.`);
  return { success: true, message: `Successfully cancelled ${subscriptionId}.` };
}
  return { error: "User not found." };
}

// Add search functionality 
async function searchWeb(args) {
  const query = args.query;
  console.log(`\n[SYSTEM] Searching the web for "${query}"...`);

  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
    headers: {
      'X-API-KEY': process.env.SERPER_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ q: query })
  });

const data = await response.json();

// Resturn top 3 results to narrow down info and keep AI focused
const searchResults = data.organic ? data.organic.slice(0, 3) : [];
return { results: searchResults };
  } catch (error) {
    console.error(error);
    return { error: "Failed to connect to search engine." };
  }
}

// Schemas
const getUserInfoTool = {
  name: "getUserInfo",
  description: "Lookup a user's subscription plan and status by their ID.",
  parameters: {
    type: "OBJECT",
    properties: {
      userId: { type: "STRING", description: "The ID of the user, e.g., 'user_123'." }
    },
    required: ["userId"]
  }
};

const cancelSubscriptionDeclaration = {
  name: "cancelSubscription",
  description: "Cancel a user's subscription. Requires explicit confirmation from the user.",
  parameters: {
    type: "OBJECT",
    properties: {
      userId: { type: "STRING", description: "The ID of the user." },
      subscriptionId: { type: "STRING", description: "The ID of the plan to cancel." },
      reason: { type: "STRING", description: "The reason for cancellation." },
      confirmCancel: { type: "BOOLEAN", description: "MUST be true to execute cancellation." }
    },
    required: ["userId", "subscriptionId", "reason", "confirmCancel"]
  }
};

//Add search schema
const searchWebTool = {
  name: "searchWeb",
  description: "Search Google for information in real-time on competitors or news.",
parameters: {
  type: "OBJECT",
  properties: {
    query: { type: "STRING", description: "The search keywords or phrases."}
  },
  required: ["query"]
  }
};

// Tap into Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel(
  { 
    model: "gemini-3-flash-preview",
    tools: [{
        functionDeclarations: [ getUserInfoTool, cancelSubscriptionDeclaration, searchWebTool ]
    }], // Add searchWebTool here
  }, 
  { apiVersion: "v1beta" }
);

// Update main loop to chatbot framework for user conversations
async function chatloop() {
  console.log("\n-- AI AGENT ONLINE (Type 'exit' to quit session) --");
  const chat = model.startChat();
  // Not needed = const userPrompt = "I am user_123. I want to cancel my VIP plan because it is too expensive. I am 100% sure.";
  // Also not needed = console.log(`USER: ${userPrompt}`);

  const askQuestion = () => {
    readline.question('\nYOU: ', async (userInput) => {
      if (userInput.toLowerCase() === 'exit') {
        readline.close();
        return;
      }
      try {
        const result = await chat.sendMessage(userInput);
        let response = result.response;
        let call = response.functionCalls()?.[0];

        while (call) {
          const toolName = call.name;
          const toolArgs = call.args;
          let toolResult;

          if (toolName === "getUserInfo") toolResult = getUserInfo(toolArgs.userId);
          if (toolName === "cancelSubscription") toolResult = cancelSubscription(toolArgs);

          // Logic for searchWeb
          if (toolName === "searchWeb") toolResult = await searchWeb(toolArgs);

          const finalResult = await chat.sendMessage([{
            functionResponse: { name: toolName, response: toolResult }
          }]);
          
          response = finalResult.response;
          call = response.functionCalls()?.[0];
        }
        console.log("AGENT:", response.text());
      } catch (err) {
        console.error("Error:", err.message);
      }
      askQuestion();
    } );
  };
  askQuestion();
}
chatloop();