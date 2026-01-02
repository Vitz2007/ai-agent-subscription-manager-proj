// Import file system manager
const fs = require('fs')

const { GoogleGenerativeAI } = require("@google/generative-ai");

// Add 'readline' to have dynamic input
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

// Mock Database
const mockDatabase = {
  "user_123": { name: "Alice", plan: "VIP", status: "Active" },
  "user_456": { name: "Bob", plan: "Basic", status: "Active" }
};

// Javascript tools updated to load data from file
function loadData() {
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
   
  console.log(`\n[SYSTEM] DATABASe UPDATED: ${userdId} is now Cancelled.`);
  return { success: true, message: `Successfully cancelled ${subscriptionId}.` };
}
  return { error: "User not found." };
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

// Tap into Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel(
  { 
    model: "gemini-3-flash-preview",
    tools: [{
        functionDeclarations: [ getUserInfoTool, cancelSubscriptionDeclaration ]
    }],
  }, 
  { apiVersion: "v1beta" }
);

// Update main loop to chatbot framework for user conservations
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